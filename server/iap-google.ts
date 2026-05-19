// Google Play Billing — direct integration, no third-party (RevenueCat etc).
// Mirror of server/iap-apple.ts: same shape, same product IDs, same add-on
// gating semantics. Source of truth = Google Play Developer API
// (androidpublisher.purchases.subscriptionsv2.get) + Real-Time Developer
// Notifications (RTDN) delivered via Pub/Sub HTTP push, verified as a
// signed JWT issued by Google.
//
// Wire-up (one-time):
//   1) Play Console → create service account, grant "Android Publisher"
//      role on the linked Google Cloud project, download JSON key →
//      paste full JSON into GOOGLE_PLAY_SERVICE_ACCOUNT_KEY secret.
//   2) Play Console → Monetization setup → app's package name goes into
//      GOOGLE_PLAY_PACKAGE_NAME secret (also lives in capacitor.config.ts).
//   3) Pub/Sub topic + subscription pushing to /api/iap/google/webhook;
//      Pub/Sub will sign the push request with a JWT whose audience is
//      that webhook URL. GOOGLE_PLAY_PUBSUB_AUDIENCE secret holds that
//      audience string so we can verify the JWT.

import { google, androidpublisher_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";

function getServiceAccount(): { client_email?: string; private_key?: string } | null {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("[GoogleIAP] GOOGLE_PLAY_SERVICE_ACCOUNT_KEY is not valid JSON:", err);
    return null;
  }
}

export function isGoogleIAPConfigured(): boolean {
  if (!process.env.GOOGLE_PLAY_PACKAGE_NAME) return false;
  const sa = getServiceAccount();
  return !!(sa?.client_email && sa?.private_key);
}

let cachedClient: androidpublisher_v3.Androidpublisher | null = null;

function getAndroidPublisherClient(): androidpublisher_v3.Androidpublisher | null {
  if (cachedClient) return cachedClient;
  if (!isGoogleIAPConfigured()) return null;
  const sa = getServiceAccount();
  if (!sa) return null;
  // googleapis handles the JWT mint + token exchange automatically.
  const auth = new google.auth.JWT({
    email: sa.client_email!,
    key: (sa.private_key || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  cachedClient = google.androidpublisher({ version: "v3", auth });
  return cachedClient;
}

// Normalized subscription record. Mirrors AppleTransactionInfo so the
// shared sync route can treat both stores uniformly.
export type GoogleSubscriptionInfo = {
  // The purchase token Google issued at first purchase. STAYS the same
  // across renewals — the per-store equivalent of Apple's
  // originalTransactionId. This is what we persist on users.* columns.
  purchaseToken: string;
  productId: string; // Google "product ID" (= Apple's productId)
  basePlanId?: string | null; // monthly vs annual selector (Google only)
  expiryTimeMs?: number | null;
  startTimeMs?: number | null;
  // Google "subscription state" enum:
  // SUBSCRIPTION_STATE_ACTIVE / IN_GRACE_PERIOD / ON_HOLD / PAUSED /
  // CANCELED / EXPIRED / PENDING / UNSPECIFIED
  state?: string | null;
  autoRenewing?: boolean | null;
  // Set by Play when the buyer assigned an obfuscated account id at
  // checkout — we use this exactly like Apple's appAccountToken to map a
  // purchase to a FusePhone user without an extra round trip.
  obfuscatedExternalAccountId?: string | null;
  obfuscatedExternalProfileId?: string | null;
  // The most recent order ID; Google appends ".N" for each renewal so we
  // can tell renewals apart from the first purchase.
  latestOrderId?: string | null;
};

/**
 * Fetch the current state of a subscription purchase from the Google Play
 * Developer API (subscriptionsv2). This is the authoritative call we make
 * after every client-reported purchase AND inside the RTDN webhook —
 * RTDN tells us "something changed for this purchaseToken" but doesn't
 * ship the new state inline. Mirrors fetchAppleTransaction.
 */
export async function fetchGoogleSubscription(
  purchaseToken: string,
  productId?: string,
): Promise<GoogleSubscriptionInfo | null> {
  const client = getAndroidPublisherClient();
  if (!client) return null;
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME!;
  try {
    // subscriptionsv2.get is the modern replacement for the deprecated
    // purchases.subscriptions.get. It returns a SubscriptionPurchaseV2
    // shape with lineItems[] (one per base plan) instead of the old
    // single-product shape.
    const resp = await client.purchases.subscriptionsv2.get({
      packageName,
      token: purchaseToken,
    });
    const data: any = resp.data || {};
    const lineItems: any[] = Array.isArray(data.lineItems) ? data.lineItems : [];
    const firstItem = lineItems[0] || {};
    const expiryISO: string | undefined = firstItem.expiryTime;
    const startISO: string | undefined = data.startTime;
    return {
      purchaseToken,
      productId: firstItem.productId || productId || "",
      basePlanId: firstItem.offerDetails?.basePlanId || null,
      expiryTimeMs: expiryISO ? new Date(expiryISO).getTime() : null,
      startTimeMs: startISO ? new Date(startISO).getTime() : null,
      state: data.subscriptionState || null,
      autoRenewing: firstItem.autoRenewingPlan
        ? !!firstItem.autoRenewingPlan.autoRenewEnabled
        : null,
      obfuscatedExternalAccountId: data.externalAccountIdentifiers?.obfuscatedExternalAccountId || null,
      obfuscatedExternalProfileId: data.externalAccountIdentifiers?.obfuscatedExternalProfileId || null,
      latestOrderId: data.latestOrderId || null,
    };
  } catch (err: any) {
    const code = err?.code || err?.response?.status;
    console.warn(
      `[GoogleIAP] fetchGoogleSubscription(${purchaseToken.slice(0, 12)}…) failed: HTTP ${code} ${err?.message || ""}`,
    );
    return null;
  }
}

/**
 * Acknowledge a purchase. Google REQUIRES every new subscription purchase
 * to be acknowledged within 3 days or it gets refunded automatically.
 * The client also acks via cordova-plugin-purchase, but we ack again
 * server-side as a safety net (it's idempotent — second call is a no-op).
 */
export async function acknowledgeGoogleSubscription(
  purchaseToken: string,
  productId: string,
): Promise<boolean> {
  const client = getAndroidPublisherClient();
  if (!client) return false;
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME!;
  try {
    await client.purchases.subscriptions.acknowledge({
      packageName,
      subscriptionId: productId,
      token: purchaseToken,
      requestBody: {},
    });
    return true;
  } catch (err: any) {
    // 400 "already acknowledged" is fine.
    const status = err?.code || err?.response?.status;
    if (status === 400) return true;
    console.warn(`[GoogleIAP] acknowledge failed: HTTP ${status} ${err?.message || ""}`);
    return false;
  }
}

// === RTDN (Real-Time Developer Notifications) verification ===
// Google delivers RTDN as a Pub/Sub HTTP push request. The push request
// carries a Google-signed OIDC JWT in the Authorization header whose
// audience matches the URL we registered. Verifying it proves the
// request actually came from Google Pub/Sub and wasn't spoofed.
const oauthClient = new OAuth2Client();

export async function verifyGoogleRtdnJwt(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader) return false;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return false;
  const token = m[1].trim();
  const audience = process.env.GOOGLE_PLAY_PUBSUB_AUDIENCE;
  if (!audience) {
    console.warn("[GoogleIAP] GOOGLE_PLAY_PUBSUB_AUDIENCE not set — refusing RTDN");
    return false;
  }
  try {
    await oauthClient.verifyIdToken({ idToken: token, audience });
    return true;
  } catch (err) {
    console.warn("[GoogleIAP] RTDN JWT verification failed:", err);
    return false;
  }
}

// Google's RTDN payload shape (after base64-decoding the Pub/Sub message
// body). Documented at developer.android.com/google/play/billing/rtdn-reference.
export type GoogleRtdnPayload = {
  version: string;
  packageName: string;
  eventTimeMillis: string;
  subscriptionNotification?: {
    version: string;
    notificationType: number; // 1 RECOVERED, 2 RENEWED, 3 CANCELED, 4 PURCHASED,
    //                           5 ON_HOLD, 6 IN_GRACE_PERIOD, 7 RESTARTED,
    //                           8 PRICE_CHANGE_CONFIRMED, 9 DEFERRED,
    //                           10 PAUSED, 11 PAUSE_SCHEDULE_CHANGED,
    //                           12 REVOKED, 13 EXPIRED, 20 PENDING_PURCHASE_CANCELED
    purchaseToken: string;
    subscriptionId: string;
  };
  oneTimeProductNotification?: any;
  voidedPurchaseNotification?: {
    purchaseToken: string;
    orderId: string;
    productType: number; // 1 in-app, 2 subscription
    refundType: number;  // 1 full, 2 quantity (one-time only)
  };
  testNotification?: { version: string };
};

export const GOOGLE_RTDN_TYPE = {
  RECOVERED: 1,
  RENEWED: 2,
  CANCELED: 3,
  PURCHASED: 4,
  ON_HOLD: 5,
  IN_GRACE_PERIOD: 6,
  RESTARTED: 7,
  PRICE_CHANGE_CONFIRMED: 8,
  DEFERRED: 9,
  PAUSED: 10,
  PAUSE_SCHEDULE_CHANGED: 11,
  REVOKED: 12,
  EXPIRED: 13,
  PENDING_PURCHASE_CANCELED: 20,
} as const;

// === Product IDs (intentionally identical to Apple) ===
// Same product slugs across both stores so all our gating, analytics,
// and add-on logic stay product-id-keyed without per-store branching.
// User must create these EXACT IDs in Google Play Console under
// Monetization → Subscriptions.
// Mirror of client/src/lib/iap.ts Addon type — only the 2 standalone
// add-ons exist as separate Play Console products. FuseAI is bundled
// into the Elite tier on both stores, so there is no `fuse_ai_monthly`
// product on either store.
export type GoogleAddon = "whiteLabel" | "aiAssistant";

export const GOOGLE_TIER_PRODUCT_IDS: Record<"starter" | "core" | "elite", string> = {
  starter: "starter_monthly",
  core: "core_monthly",
  elite: "elite_monthly",
};

export const GOOGLE_ADDON_PRODUCT_IDS: Record<GoogleAddon, string> = {
  whiteLabel: "make_it_your_own_monthly",
  aiAssistant: "ai_assistant_monthly",
};

const TIER_PRODUCT_ID_TO_TIER: Record<string, "starter" | "core" | "elite"> = Object.fromEntries(
  (Object.entries(GOOGLE_TIER_PRODUCT_IDS) as ["starter" | "core" | "elite", string][])
    .map(([tier, id]) => [id, tier]),
);

const ADDON_PRODUCT_ID_TO_ADDON: Record<string, GoogleAddon> = Object.fromEntries(
  (Object.entries(GOOGLE_ADDON_PRODUCT_IDS) as [GoogleAddon, string][])
    .map(([addon, id]) => [id, addon]),
);

export function tierFromGoogleProductId(productId: string): "starter" | "core" | "elite" | null {
  return TIER_PRODUCT_ID_TO_TIER[productId] || null;
}

export function addonFromGoogleProductId(productId: string): GoogleAddon | null {
  return ADDON_PRODUCT_ID_TO_ADDON[productId] || null;
}

// New per-add-on user.* columns for Google purchase tokens. Keep them
// SEPARATE from the apple_* columns so a user could in theory have
// active subs on both stores (rare but legal — e.g. someone testing
// the Android build while their Apple sub is still active).
export const GOOGLE_ADDON_USER_COLUMNS: Record<
  GoogleAddon,
  {
    statusCol: "whiteLabelStatus" | "aiAssistantStatus";
    tokenCol:
      | "googleWhiteLabelPurchaseToken"
      | "googleAiAssistantPurchaseToken";
    expiresAtCol:
      | "googleWhiteLabelExpiresAt"
      | "googleAiAssistantExpiresAt";
    autoRenewOffCol:
      | "googleWhiteLabelAutoRenewOff"
      | "googleAiAssistantAutoRenewOff";
  }
> = {
  whiteLabel:  { statusCol: "whiteLabelStatus",  tokenCol: "googleWhiteLabelPurchaseToken",  expiresAtCol: "googleWhiteLabelExpiresAt",  autoRenewOffCol: "googleWhiteLabelAutoRenewOff" },
  aiAssistant: { statusCol: "aiAssistantStatus", tokenCol: "googleAiAssistantPurchaseToken", expiresAtCol: "googleAiAssistantExpiresAt", autoRenewOffCol: "googleAiAssistantAutoRenewOff" },
};
