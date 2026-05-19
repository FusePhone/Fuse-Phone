// TypeScript bridge for the native StoreKit 2 Capacitor plugin
// (ios/App/App/StoreKit2Plugin.swift). Returns Apple's signed JWS
// representation of every transaction so the server can verify it
// directly via verifyAppleSignedPayload (no second App Store API
// round-trip needed).

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface SK2Product {
  id: string;
  displayName: string;
  description: string;
  price: number;
  displayPrice: string;
  currencyCode?: string;
}

export interface SK2Transaction {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  jws: string;
  revocationDate?: number;
  expirationDate?: number;
  environment?: string; // "Sandbox" | "Production" | "Xcode"
}

export interface SK2RevokedTransaction {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  revocationDate: number;
  environment?: string;
}

export type SK2PurchaseResult =
  | {
      status: "success";
      transactionId: string;
      originalTransactionId: string;
      productId: string;
      jws: string;
    }
  | { status: "userCancelled" }
  | { status: "pending" }
  | { status: "cannotMakePayments"; message: string };

export interface StoreKit2PluginShape {
  getProducts(opts: { productIds: string[] }): Promise<{ products: SK2Product[] }>;
  purchase(opts: {
    productId: string;
    appAccountToken?: string;
  }): Promise<SK2PurchaseResult>;
  restorePurchases(): Promise<{ transactions: SK2Transaction[] }>;
  currentEntitlements(): Promise<{ transactions: SK2Transaction[] }>;
  finishTransaction(opts: { transactionId: string }): Promise<{ finished: boolean }>;
  // Returns transactions that Swift saw (via product.purchase OR
  // Transaction.updates) and persisted to UserDefaults BEFORE attempting
  // to resolve/notify JS. Survives WebView suspension during the Apple
  // purchase sheet — the bridge can drop call.resolve() / notifyListeners
  // calls if the WebView is briefly inactive, so this is the
  // bulletproof recovery path.
  pendingPurchases(): Promise<{ transactions: SK2Transaction[] }>;
  // Remove a single persisted entry once the server has confirmed the sync.
  clearPendingPurchase(opts: { transactionId: string }): Promise<{ cleared: boolean }>;
  addListener(
    eventName: "transactionUpdated",
    listener: (txn: SK2Transaction) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "transactionRevoked",
    listener: (txn: SK2RevokedTransaction) => void,
  ): Promise<PluginListenerHandle>;
}

export const StoreKit2 = registerPlugin<StoreKit2PluginShape>("StoreKit2");

// Once we've successfully called the plugin (proving it's truly registered
// and Apple is responding), latch this to true. Subsequent isSK2Available()
// calls return true instantly. Prevents the "Subscriptions are still
// initializing" banner from ever showing up after the first successful
// probe in a session.
let sk2ProbedOnce = false;

export function markSK2Probed() {
  sk2ProbedOnce = true;
}

export function isSK2Available(): boolean {
  if (sk2ProbedOnce) return true;
  if (typeof window === "undefined") return false;
  const Cap: any = (window as any).Capacitor;
  if (!Cap?.isNativePlatform?.()) return false;
  // NOTE: Cap.isPluginAvailable() is UNRELIABLE for plugins registered at
  // runtime via bridge.registerPluginInstance() (which is how StoreKit2Plugin
  // is registered — see AppDelegate.swift). isPluginAvailable() snapshots a
  // static list at WebView init time and never reflects runtime
  // registrations. Use Capacitor.Plugins.StoreKit2 existence as a fast
  // sync hint, fall back to probe via waitForSK2() for the source of truth.
  try {
    if (Cap.Plugins?.StoreKit2) return true;
    return Cap.isPluginAvailable?.("StoreKit2") === true;
  } catch {
    return false;
  }
}

/**
 * Async helper that waits for the StoreKit2 plugin to become available.
 *
 * ROOT FIX for the "In-app purchases are only available in the iOS app" red
 * banner that appears intermittently on iOS:
 *
 * The native side (AppDelegate.swift) registers the StoreKit2 plugin AFTER a
 * 0.5s delay (and recursively retries every 0.5s if the Capacitor bridge
 * isn't ready). The web side meanwhile loads independently from
 * app.fusephone.com. If the user taps Subscribe BEFORE the native
 * registration completes, `isSK2Available()` returns false synchronously and
 * the purchase flow gives up immediately — even though the plugin is about
 * to come online a few hundred milliseconds later.
 *
 * This poll-and-wait helper closes that race: we check every 100ms for up to
 * `timeoutMs`, returning true as soon as the plugin shows up. Only if it's
 * truly missing after the timeout do we conclude this isn't an IAP-capable
 * environment.
 */
export async function waitForSK2(timeoutMs: number = 8000): Promise<boolean> {
  // Fast path: if we've already probed this session, OR Capacitor.Plugins
  // already has StoreKit2, return true immediately.
  if (sk2ProbedOnce) return true;
  if (typeof window === "undefined") return false;
  const Cap: any = (window as any).Capacitor;
  if (!Cap?.isNativePlatform?.()) return false;
  const platform = Cap?.getPlatform?.();
  if (platform !== "ios") return false;

  // SOURCE-OF-TRUTH PROBE: instead of trusting Capacitor.isPluginAvailable()
  // (which is unreliable for runtime-registered plugins — see isSK2Available
  // comment), we actually CALL a safe read-only method on the plugin. If
  // Apple responds, the plugin is genuinely registered and the StoreKit
  // bridge is working. If we get back "PLUGIN_NOT_IMPLEMENTED" or
  // "UNIMPLEMENTED", retry with backoff. Any other error means the plugin
  // IS there — it just failed for an unrelated reason (e.g. no Apple ID
  // signed in, sandbox vs production mismatch), which doesn't matter for
  // detection: we know we can route purchases through it.
  const start = Date.now();
  let attempts = 0;
  const initialDelay = 50; // catch fast warm launches
  const maxDelay = 500;
  let delay = initialDelay;
  while (Date.now() - start < timeoutMs) {
    attempts++;
    try {
      // currentEntitlements() is the cheapest, side-effect-free probe:
      // it just enumerates the user's active subscriptions. Safe to call
      // repeatedly. Returns immediately if Apple has cached entitlements.
      await StoreKit2.currentEntitlements();
      sk2ProbedOnce = true;
      const elapsed = Date.now() - start;
      console.log(`[IAP] StoreKit2 probe succeeded after ${elapsed}ms (${attempts} probes) — plugin is live`);
      return true;
    } catch (e: any) {
      const msg = String(e?.message ?? e?.errorMessage ?? e ?? "");
      const looksUnregistered =
        /PLUGIN_NOT_IMPLEMENTED|not implemented|unimplemented|no such plugin|plugin .* not found/i.test(msg);
      if (!looksUnregistered) {
        // Plugin IS there — call failed for an unrelated reason. That's
        // fine for detection: we know the bridge is wired up.
        sk2ProbedOnce = true;
        const elapsed = Date.now() - start;
        console.log(
          `[IAP] StoreKit2 probe surfaced non-registration error after ${elapsed}ms — plugin IS live, error was: ${msg}`,
        );
        return true;
      }
      // Truly not registered yet — wait and retry.
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, maxDelay);
  }
  console.warn(
    `[IAP] StoreKit2 probe never succeeded after ${timeoutMs}ms (${attempts} probes) — plugin appears genuinely missing from this build.`,
  );
  return false;
}
