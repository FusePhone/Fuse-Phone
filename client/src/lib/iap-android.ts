// Android In-App Purchase wrapper — talks to our native Capacitor
// plugin (PlayBillingPlugin.java) which wraps Google Play Billing
// Library v7 directly. No Cordova, no third-party JS package.
// Mirrors the shape of client/src/lib/iap-sk2.ts so iap.ts can branch
// on platform without restructuring the call sites.

import { registerPlugin, PluginListenerHandle } from "@capacitor/core";
import { logIAP } from "./iap";

interface ProductInfo {
  productId: string;
  title?: string;
  name?: string;
  description?: string;
  offerToken?: string;
  formattedPrice?: string;
  priceCurrencyCode?: string;
  priceAmountMicros?: number;
}

interface PurchaseInfo {
  productId?: string;
  purchaseToken: string;
  orderId?: string;
  purchaseTime?: number;
  purchaseState?: number; // 1=PURCHASED, 2=PENDING
  acknowledged?: boolean;
  autoRenewing?: boolean;
  obfuscatedAccountId?: string;
  status?: "success" | "userCancelled";
}

interface PlayBillingPlugin {
  initialize(): Promise<{ ok: boolean }>;
  queryProducts(opts: { productIds: string[] }): Promise<{ products: ProductInfo[] }>;
  purchase(opts: { productId: string; obfuscatedAccountId?: string }): Promise<PurchaseInfo>;
  acknowledge(opts: { purchaseToken: string }): Promise<{ ok: boolean }>;
  restorePurchases(): Promise<{ purchases: PurchaseInfo[] }>;
  addListener(
    event: "purchaseUpdated",
    cb: (p: PurchaseInfo) => void,
  ): Promise<PluginListenerHandle>;
}

const PlayBilling = registerPlugin<PlayBillingPlugin>("PlayBilling");

const ANDROID_TIER_PRODUCT_IDS = [
  "starter_monthly",
  "core_monthly",
  "elite_monthly",
] as const;

const ANDROID_ADDON_PRODUCT_IDS = [
  "make_it_your_own_monthly",
  "ai_assistant_monthly",
] as const;

export const ANDROID_ALL_PRODUCT_IDS: string[] = [
  ...ANDROID_TIER_PRODUCT_IDS,
  ...ANDROID_ADDON_PRODUCT_IDS,
];

export function isAndroidStoreAvailable(): boolean {
  // The plugin is registered at app launch on Android. On non-Android
  // platforms registerPlugin returns a proxy that throws on first call;
  // we defer the actual check to initAndroidIAP which catches errors.
  return typeof (PlayBilling as any)?.initialize === "function";
}

let initPromise: Promise<boolean> | null = null;
let initializedForUser: string | null = null;
let currentAppUserId: string | null = null;
let listenerHandle: PluginListenerHandle | null = null;

// One-shot resolvers keyed by productId, populated by purchaseAndroidProduct.
type PurchaseResolver = (result: AndroidPurchaseResult) => void;
const pendingPurchaseResolvers = new Map<string, PurchaseResolver>();
// Tokens we've already verified+resolved (either via listener or direct
// return) so we don't double-process the same purchase on both paths.
const completedPurchaseTokens = new Set<string>();

export type AndroidPurchaseResult =
  | {
      status: "success";
      productId: string;
      purchaseToken: string;
      transactionId: string;
      orderId?: string;
    }
  | { status: "userCancelled" }
  | { status: "pending" }
  | { status: "cannotMakePayments"; message: string }
  | { status: "error"; message: string };

// Shared verify+ack+resolve pipeline used by BOTH the purchaseUpdated
// listener and the direct return value of PlayBilling.purchase(). Idempotent
// per purchaseToken — the first path to arrive wins; the second is a no-op.
async function processPurchase(
  p: PurchaseInfo,
  source: "listener" | "direct",
): Promise<AndroidPurchaseResult | null> {
  const productId = p.productId || "";
  const token = p.purchaseToken;
  logIAP(
    "info",
    `[android-iap] processPurchase(${source}) product=${productId} state=${p.purchaseState} ack=${p.acknowledged}`,
  );
  if (!token) return null;
  if (completedPurchaseTokens.has(token)) return null;

  if (p.purchaseState !== 1) {
    // PENDING — Google will redeliver when it resolves.
    completedPurchaseTokens.add(token);
    const r = pendingPurchaseResolvers.get(productId);
    if (r) {
      pendingPurchaseResolvers.delete(productId);
      r({ status: "pending" });
    }
    return { status: "pending" };
  }

  completedPurchaseTokens.add(token);
  const verify = await verifyAndroidPurchase(productId, token);
  if (!verify.ok) {
    logIAP("error", `[android-iap] server verify rejected: ${verify.message}`);
    const err: AndroidPurchaseResult = {
      status: "error",
      message: verify.message || "Server rejected purchase.",
    };
    const r = pendingPurchaseResolvers.get(productId);
    if (r) {
      pendingPurchaseResolvers.delete(productId);
      r(err);
    }
    return err;
  }

  if (!p.acknowledged) {
    try {
      await PlayBilling.acknowledge({ purchaseToken: token });
      logIAP("success", `[android-iap] acknowledged product=${productId}`);
    } catch (err: any) {
      logIAP("warn", `[android-iap] acknowledge failed: ${err?.message || err}`);
    }
  }

  const success: AndroidPurchaseResult = {
    status: "success",
    productId,
    purchaseToken: token,
    transactionId: p.orderId || token,
    orderId: p.orderId,
  };
  const r = pendingPurchaseResolvers.get(productId);
  if (r) {
    pendingPurchaseResolvers.delete(productId);
    r(success);
  }
  return success;
}

async function verifyAndroidPurchase(
  productId: string,
  purchaseToken: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const resp = await fetch("/api/iap/google/verify", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, purchaseToken }),
    });
    if (resp.ok) return { ok: true };
    const body = await resp.json().catch(() => ({}));
    return { ok: false, message: body?.message || `verify failed: HTTP ${resp.status}` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "verify request failed" };
  }
}

export async function initAndroidIAP(appUserId: string | null): Promise<boolean> {
  currentAppUserId = appUserId || null;
  const key = appUserId || "(none)";
  if (initPromise && initializedForUser === key) return initPromise;
  if (initPromise && initializedForUser !== key) {
    logIAP("info", `[android-iap] appUserId changed (${initializedForUser} → ${key}) — re-initializing`);
    initPromise = null;
  }
  initializedForUser = key;

  initPromise = (async () => {
    try {
      const { ok } = await PlayBilling.initialize();
      if (!ok) {
        logIAP("error", "[android-iap] native plugin initialize returned ok=false");
        return false;
      }

      // Wire the purchaseUpdated listener exactly once per process. The
      // listener handles BOTH resumed purchases (pending → completed on
      // next launch) and the in-flight purchase started by purchaseAndroidProduct.
      if (!listenerHandle) {
        listenerHandle = await PlayBilling.addListener("purchaseUpdated", async (p: PurchaseInfo) => {
          await processPurchase(p, "listener");
        });
      }

      // Pre-cache product details so the first tap on Subscribe is instant.
      try {
        await PlayBilling.queryProducts({ productIds: ANDROID_ALL_PRODUCT_IDS });
      } catch (err: any) {
        logIAP("warn", `[android-iap] queryProducts pre-cache failed (will retry on purchase): ${err?.message || err}`);
      }

      logIAP("success", `[android-iap] initialized for ${ANDROID_ALL_PRODUCT_IDS.length} products, user=${key}`);
      return true;
    } catch (err: any) {
      logIAP("error", `[android-iap] init failed: ${err?.message || err}`);
      initPromise = null;
      return false;
    }
  })();
  return initPromise;
}

export async function purchaseAndroidProduct(
  productId: string,
  appUserId: string | null,
): Promise<AndroidPurchaseResult> {
  currentAppUserId = appUserId || currentAppUserId;
  const ok = await initAndroidIAP(appUserId);
  if (!ok) {
    return { status: "error", message: "Google Play Billing is not ready yet — please try again in a moment." };
  }

  // Register resolver BEFORE calling purchase so a fast purchaseUpdated
  // event doesn't race past us.
  const purchasePromise = new Promise<AndroidPurchaseResult>((resolve) => {
    const prior = pendingPurchaseResolvers.get(productId);
    if (prior) prior({ status: "error", message: "Superseded by new purchase attempt." });
    pendingPurchaseResolvers.set(productId, resolve);
  });

  const PURCHASE_TIMEOUT_MS = 45_000;
  const timeoutPromise = new Promise<AndroidPurchaseResult>((resolve) =>
    setTimeout(
      () =>
        resolve({
          status: "error",
          message:
            "The Play Store didn't respond in time. If a payment was charged, it'll activate automatically within a minute.",
        }),
      PURCHASE_TIMEOUT_MS,
    ),
  );

  try {
    logIAP("info", `[android-iap] purchase(${productId}) appUser=${appUserId || "(none)"}`);
    const result = await PlayBilling.purchase({
      productId,
      obfuscatedAccountId: appUserId || undefined,
    });
    if (result.status === "userCancelled") {
      pendingPurchaseResolvers.delete(productId);
      return { status: "userCancelled" };
    }
    // Fallback path: if Play returned the purchase directly (token present),
    // drive verify+ack ourselves. processPurchase is idempotent per token,
    // so it's safe whether the listener also fires or not. This guarantees
    // the user never sees a false "timed out" after a real charge just
    // because the bridge event was dropped.
    if (result.purchaseToken) {
      void processPurchase(
        { ...result, productId: result.productId || productId },
        "direct",
      );
    }
    // Race the listener/direct resolver against a generous timeout so we
    // surface a clear message if neither path completes.
    return await Promise.race([purchasePromise, timeoutPromise]);
  } catch (err: any) {
    pendingPurchaseResolvers.delete(productId);
    const msg = err?.message || String(err);
    const userCancelled = /cancel/i.test(msg);
    logIAP(userCancelled ? "warn" : "error", `[android-iap] purchase threw: ${msg}`);
    return userCancelled
      ? { status: "userCancelled" }
      : { status: "error", message: msg };
  } finally {
    // Whatever happened, make sure a stale resolver isn't left over.
    setTimeout(() => pendingPurchaseResolvers.delete(productId), PURCHASE_TIMEOUT_MS + 1_000);
  }
}

export async function restoreAndroidPurchases(): Promise<{ ok: boolean; message?: string }> {
  try {
    await initAndroidIAP(currentAppUserId);
    await PlayBilling.restorePurchases();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Restore failed." };
  }
}
