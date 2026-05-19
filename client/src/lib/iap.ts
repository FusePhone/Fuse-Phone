// In-App Purchase wrapper — native StoreKit 2 (Swift) via the Capacitor
// plugin defined in ios/App/App/StoreKit2Plugin.swift. Web/PWA always
// falls back to the Stripe path. Every transaction Apple returns is a
// signed JWS; we POST it straight to /api/iap/sync, which verifies the
// signature server-side (Apple Root CA G3) before writing anything.

import {
  StoreKit2,
  isSK2Available,
  waitForSK2,
  type SK2Product,
  type SK2Transaction,
} from "./iap-sk2";
import {
  initAndroidIAP,
  purchaseAndroidProduct,
  isAndroidStoreAvailable,
  restoreAndroidPurchases,
} from "./iap-android";
import {
  recordPurchase as recordDeviceIapPurchase,
  findConflictingOwner as findConflictingDeviceOwner,
  maskEmail,
} from "./device-iap-history";

export type Tier = "starter" | "core" | "elite";
export type Addon = "whiteLabel" | "aiAssistant";

export const TIER_TO_PRODUCT_ID: Record<Tier, string> = {
  starter: "starter_monthly",
  core: "core_monthly",
  elite: "elite_monthly",
};

// Mirror of the server-side TIER_RANK in /api/iap/sync. Higher number =
// higher tier. Used to detect deferred downgrades on the client: when
// Apple's purchase() returns success but with a higher-rank productId
// than the one we requested, that's Apple telling us "I queued the
// downgrade; the user keeps their current product until next renewal".
// Polling for the lower tier in that case is futile (Apple won't issue
// the new txn until renewal) and just leaves the paywall stuck on
// "Switching..." until the 90s timeout fires.
const TIER_RANK: Record<Tier, number> = {
  starter: 1,
  core: 2,
  elite: 3,
};
function tierFromProductId(productId: string): Tier | null {
  for (const [t, p] of Object.entries(TIER_TO_PRODUCT_ID)) {
    if (p === productId) return t as Tier;
  }
  return null;
}

export const ADDON_TO_PRODUCT_ID: Record<Addon, string> = {
  whiteLabel: "make_it_your_own_monthly",
  aiAssistant: "ai_assistant_monthly",
};

export const ADDON_LABELS: Record<Addon, string> = {
  whiteLabel: "Make It Your Own",
  aiAssistant: "AI Virtual Assistant",
};

const TIER_ENTITLEMENT_PRIORITY: Tier[] = ["elite", "core", "starter"];
const ALL_PRODUCT_IDS: string[] = [
  ...Object.values(TIER_TO_PRODUCT_ID),
  ...Object.values(ADDON_TO_PRODUCT_ID),
];

// Keyed by appUserId so a logout+login-as-different-user kicks off a
// fresh init instead of returning the previous user's resolved promise.
// "(none)" is the sentinel for the pre-auth state.
let initPromise: Promise<boolean> | null = null;
let initPromiseForUser: string | null = null;
let appUserIdRef: string | null = null;
let appUserEmailRef: string | null = null;
let cachedProducts: Map<string, SK2Product> = new Map();
let updateListenerHandle: { remove: () => Promise<void> } | null = null;

// === Capacitor / native detection ===
export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  if ((window as any).__CAPACITOR_NATIVE) return true;
  if (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("capacitor-native")
  ) {
    return true;
  }
  const Cap = (window as any).Capacitor;
  return !!(Cap?.isNativePlatform?.() || Cap?.isNative);
}

export function isIAPAvailable(): boolean {
  if (!isCapacitorNative()) return false;
  if (getPlatform() === "android") return isAndroidStoreAvailable();
  return isSK2Available();
}

// Returns the current platform: 'ios' | 'android' | 'web'
function getPlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  const Cap = (window as any).Capacitor;
  const p = Cap?.getPlatform?.();
  if (p === "ios") return "ios";
  if (p === "android") return "android";
  return "web";
}

/**
 * Produces a friendly, platform-aware "can't purchase here" message AFTER
 * we've waited for the StoreKit2 plugin to register. The old code returned
 * "In-app purchases are only available in the iOS app" for every non-iOS
 * device — confusing and wrong. Now:
 *  - iOS:     "Subscriptions are still initializing — please try again in a
 *             moment." (only fires if the 3s wait expired without the plugin
 *             showing up, which means the native shell is genuinely missing
 *             the StoreKit2 plugin — a build problem, not a race.)
 *  - Android: "Android subscriptions are coming soon. You can subscribe at
 *             app.fusephone.com on a web browser for now."
 *  - Web:     "Use the website to subscribe." (web paywall should already
 *             route to Stripe — reaching this branch means a routing bug.)
 */
function unavailableMessage(): string {
  const platform = getPlatform();
  if (platform === "ios") {
    return "Subscriptions are still initializing — please try again in a moment.";
  }
  if (platform === "android") {
    return "Google Play Billing is still initializing — please try again in a moment.";
  }
  return "Use the website to subscribe.";
}

// === On-screen IAP diagnostics buffer ===
export type IAPLogLevel = "info" | "warn" | "error" | "success";
export interface IAPLogEntry {
  ts: number;
  level: IAPLogLevel;
  message: string;
}
const IAP_LOG_MAX = 60;
let iapLogBuffer: IAPLogEntry[] = [];
const iapLogListeners = new Set<(entries: IAPLogEntry[]) => void>();
export function getIAPLog(): IAPLogEntry[] {
  return iapLogBuffer.slice();
}
export function clearIAPLog(): void {
  iapLogBuffer = [];
  iapLogListeners.forEach((cb) => cb(iapLogBuffer.slice()));
}
export function subscribeIAPLog(cb: (entries: IAPLogEntry[]) => void): () => void {
  iapLogListeners.add(cb);
  cb(iapLogBuffer.slice());
  return () => {
    iapLogListeners.delete(cb);
  };
}
export function logIAP(level: IAPLogLevel, message: string): void {
  const entry: IAPLogEntry = { ts: Date.now(), level, message };
  iapLogBuffer = [...iapLogBuffer, entry].slice(-IAP_LOG_MAX);
  const fn =
    level === "error" ? console.error :
    level === "warn"  ? console.warn  :
    console.info;
  fn(`[IAP][${level}] ${message}`);
  // Forward to the server so the phone's IAP trace shows up in deployment
  // logs alongside the [IAP sync] / [IAP WH] lines. Fire-and-forget; never
  // blocks the purchase flow. Cap by message length to avoid spam.
  try {
    void fetch("/api/client-log", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        tag: `iap.${level}`,
        message: message.slice(0, 480),
        data: { ts: entry.ts },
      }),
    }).catch(() => {});
  } catch { /* non-fatal */ }
  iapLogListeners.forEach((cb) => {
    try { cb(iapLogBuffer.slice()); } catch { /* listener error */ }
  });
}

// Restore window — when true, /api/iap/sync bypasses the recency guard.
let isRestoringRef = false;
const RESTORE_WINDOW_MS = 15_000;
function markRestoring() {
  isRestoringRef = true;
  setTimeout(() => { isRestoringRef = false; }, RESTORE_WINDOW_MS);
}

// Send a signed JWS straight to the server. Server verifies the signature
// chain (Apple Root CA G3 → intermediate → leaf), then runs the same
// guards (predates_account, owned_by_other_account, expiry, Elite gating).
// Extra metadata we use to (a) save device history on success and
// (b) propagate the masked email up to the paywall on owned-by-other
// rejection. Optional so existing call sites that don't have the full
// txn object still compile.
export interface SyncRejection {
  blockedReason: string;
  maskedEmail?: string;
  originalTransactionId?: string;
  message?: string;
}
let lastSyncRejection: SyncRejection | null = null;
export function consumeLastSyncRejection(): SyncRejection | null {
  const r = lastSyncRejection;
  lastSyncRejection = null;
  return r;
}

// Apple's sandbox replays expired auto-renewable subscription transactions
// indefinitely (every ~5 min, on app launch, and right before any new
// purchase attempt). Even after we call finishTransaction(), the same
// expired txnId can come back via Transaction.updates because StoreKit
// re-emits the historical receipt. Tracking these IDs in a Set lets us
// short-circuit BOTH the network call to /api/iap/sync (instant) AND
// avoid any UI side-effects when the same junk replays during a fresh
// purchase attempt — which is exactly what made Elite "feel like the
// paywall never opened": Apple was busy chewing through 78-min-old
// stale Elite txns before presenting the new sheet, and each replay
// blocked the UI behind a sync round-trip + finish.
// Persisted to localStorage so the set survives app restarts. Sandbox
// re-emits the SAME expired txnIds on every cold launch, so without
// persistence we'd re-pay the sync round-trip cost on every launch
// until the server rejects again. Cap at 500 to avoid unbounded growth
// (Apple expires sandbox subs every 5 min, so a heavy tester could
// otherwise accumulate hundreds of stale IDs per day).
const STALE_TXN_STORAGE_KEY = "fp.iap.knownStaleTxnIds.v1";
const STALE_TXN_CAP = 500;
function loadStaleTxnIds(): Set<string> {
  try {
    if (typeof localStorage === "undefined") return new Set();
    const raw = localStorage.getItem(STALE_TXN_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.slice(-STALE_TXN_CAP));
  } catch { /* corrupted → start fresh */ }
  return new Set();
}
function persistStaleTxnIds(s: Set<string>) {
  try {
    if (typeof localStorage === "undefined") return;
    const arr = Array.from(s).slice(-STALE_TXN_CAP);
    localStorage.setItem(STALE_TXN_STORAGE_KEY, JSON.stringify(arr));
  } catch { /* quota or private mode — fine, non-fatal */ }
}
const knownStaleTxnIds = loadStaleTxnIds();
// Per-purchase counter of stale replays, so the paywall can show a
// friendly "Apple is still clearing old test transactions, try again
// in a few seconds" message instead of a generic timeout.
let staleReplayCountThisSession = 0;
export function consumeStaleReplayCount(): number {
  const n = staleReplayCountThisSession;
  staleReplayCountThisSession = 0;
  return n;
}

async function syncJwsToBackend(
  jws: string,
  txnId: string,
  txnMeta?: { originalTransactionId?: string; productId?: string },
): Promise<{ tier: Tier | null; addon: string | null; blockedReason: string | null }> {
  // clientReqId: short unique tag echoed by server in every log line so the
  // user can grep one purchase end-to-end across client + server logs.
  const clientReqId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    const restore = isRestoringRef;
    const t0 = Date.now();
    logIAP("info", `sync START clientReqId=${clientReqId} txn=${txnId} restore=${restore} jwsLen=${jws.length}`);
    const resp = await fetch("/api/iap/sync", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jws, restore, clientReqId }),
    });
    const elapsed = Date.now() - t0;
    let data: any = null;
    try { data = await resp.json(); } catch { /* non-json */ }
    const serverReqId = data?.reqId || "(none)";
    if (!resp.ok) {
      const reason = data?.blockedReason || `http_${resp.status}`;
      const detail =
        data?.blockedReason === "owned_by_other_account"
          ? ` ownedBy=${data?.otherAccountEmail} otxn=${data?.originalTransactionId}`
          : data?.blockedReason === "stale_transaction"
          ? ` expiresAt=${data?.expiresAt} expiredBySec=${data?.expiredBySec}`
          : data?.blockedReason === "recency_guard"
          ? ` product=${data?.productId} age=${data?.ageMinutes}min`
          : "";
      // Known-benign rejection during background restore: the server
      // refuses to (re)activate an add-on whose required base tier no
      // longer applies (e.g. user downgraded from Elite to Core, but
      // Apple still considers the whiteLabel add-on entitled until its
      // own period ends). The originalTxnId is still recorded for
      // reconciliation, so this is informational, not an error worth
      // alarming the user with in the on-screen IAP log.
      const msg = String(data?.message || "");
      const isBenignAddonGate =
        restore && resp.status === 409 && /requires the .* plan/i.test(msg);
      logIAP(
        isBenignAddonGate ? "info" : "error",
        `${isBenignAddonGate ? "sync DEFERRED (addon-tier-gate during restore)" : "sync REJECTED"} ` +
        `clientReqId=${clientReqId} serverReqId=${serverReqId} txn=${txnId} ` +
        `status=${resp.status} reason=${reason}${detail} elapsed=${elapsed}ms — ${msg}`,
      );
      lastSyncRejection = {
        blockedReason: reason,
        maskedEmail: data?.otherAccountEmail || undefined,
        originalTransactionId: data?.originalTransactionId || undefined,
        message: data?.message || undefined,
      };
      // Remember stale txns so future replays of the same txnId are
      // dropped instantly without a network round-trip.
      if (reason === "stale_transaction" && txnId) {
        knownStaleTxnIds.add(txnId);
        persistStaleTxnIds(knownStaleTxnIds);
        staleReplayCountThisSession++;
      }
      return { tier: null, addon: null, blockedReason: reason };
    }
    // Successful sync — surface the latest server-side subscription state
    // to React Query immediately so the UI reflects DID_RENEW and
    // cross-grade webhooks without waiting for the next refetch. (We
    // keep this fire-and-forget; failure to invalidate the cache is
    // never a reason to fail the purchase.)
    try {
      const { queryClient } = await import("./queryClient");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
    } catch { /* non-fatal */ }
    const tier = (data?.tier as Tier) || null;
    const addon = (data?.addon as string) || null;
    logIAP(
      "success",
      `sync OK clientReqId=${clientReqId} serverReqId=${serverReqId} txn=${txnId} ` +
      `${tier ? "tier=" + tier : addon ? "addon=" + addon : "(no change)"} status=${data?.status || "?"} elapsed=${elapsed}ms`,
    );
    // Save to device-side history so the next FusePhone account on this
    // iPhone gets a friendly "this Apple subscription belongs to ga***l@..."
    // warning instead of a confusing rejected purchase. Best-effort only.
    try {
      const otxn = txnMeta?.originalTransactionId || txnId;
      const productId = txnMeta?.productId || (tier ? TIER_TO_PRODUCT_ID[tier] : "");
      if (otxn && appUserIdRef && appUserEmailRef) {
        await recordDeviceIapPurchase({
          originalTransactionId: otxn,
          productId,
          userId: appUserIdRef,
          email: appUserEmailRef,
        });
      }
    } catch (histErr: any) {
      logIAP("warn", `device-history save failed (non-fatal): ${histErr?.message || histErr}`);
    }
    return { tier, addon, blockedReason: null };
  } catch (err: any) {
    logIAP("error", `sync THREW clientReqId=${clientReqId} txn=${txnId}: ${err?.message || err}`);
    return { tier: null, addon: null, blockedReason: "network_throw" };
  }
}

async function handleApprovedTransaction(txn: SK2Transaction, source: string): Promise<void> {
  // Sandbox replay short-circuit: if we've already seen this exact txnId
  // come back stale from the server in this session, don't bother the
  // server again — just call finishTransaction() (again) and move on.
  // This drains Apple's replay queue ~10x faster and stops the paywall
  // from feeling frozen while StoreKit chews through old test purchases.
  if (knownStaleTxnIds.has(txn.transactionId)) {
    staleReplayCountThisSession++;
    logIAP(
      "warn",
      `Apple ${source} txn=${txn.transactionId} product=${txn.productId} — known stale (sandbox replay #${staleReplayCountThisSession}), finishing without sync`,
    );
    try {
      await StoreKit2.finishTransaction({ transactionId: txn.transactionId });
    } catch { /* already finished — fine */ }
    try {
      await StoreKit2.clearPendingPurchase({ transactionId: txn.transactionId });
    } catch { /* non-fatal */ }
    return;
  }
  logIAP("info", `Apple ${source} txn=${txn.transactionId} product=${txn.productId} originalTxn=${txn.originalTransactionId}`);
  const syncResult = await syncJwsToBackend(txn.jws, txn.transactionId, {
    originalTransactionId: txn.originalTransactionId,
    productId: txn.productId,
  });
  // SAFE-FINISH GUARD: only call finishTransaction / clearPendingPurchase
  // when the server either (a) successfully processed the JWS, or (b)
  // rejected it for a PERMANENT benign reason (sandbox replay, txn owned
  // by another Apple account, recency guard). For ANY transient reason —
  // network failure, 5xx, 401/403 (session expired during sync), 429
  // (rate limited), 408 (timeout) — we LEAVE the transaction unfinished
  // so the next app-resume drainPendingPurchases() retries it.
  // Previously we always finished, which silently lost the transaction
  // whenever the server hiccupped during a restore/drain.
  // IMPORTANT: blockedReason comes from THIS sync's return value, NOT
  // from the global lastSyncRejection — concurrent syncs (listener +
  // drain + purchase) would otherwise race and read each other's state.
  const synced = !!(syncResult.tier || syncResult.addon);
  const PERMANENT_BENIGN_REJECTIONS = new Set([
    "stale_transaction",
    "owned_by_other_account",
    "recency_guard",
  ]);
  const benignRejection =
    syncResult.blockedReason !== null &&
    PERMANENT_BENIGN_REJECTIONS.has(syncResult.blockedReason);
  if (synced || benignRejection) {
    try {
      await StoreKit2.finishTransaction({ transactionId: txn.transactionId });
      logIAP("info", `txn.finish() OK txn=${txn.transactionId} (synced=${synced}, benignReject=${syncResult.blockedReason || "none"})`);
    } catch (err: any) {
      logIAP("warn", `txn.finish() failed: ${err?.message || err}`);
    }
    try {
      await StoreKit2.clearPendingPurchase({ transactionId: txn.transactionId });
    } catch { /* non-fatal */ }
  } else {
    logIAP(
      "warn",
      `txn.finish() SKIPPED for txn=${txn.transactionId} — sync failed transiently (reason=${syncResult.blockedReason || "unknown"}). ` +
        `Keeping txn in Swift's pending store so the next app-resume drain retries it. ` +
        `Without this guard the transaction would be lost forever.`,
    );
  }
}

// FALLBACK recovery path: read Apple's currentEntitlements (which exists
// in every native build going back to the first one) and push each JWS
// to /api/iap/sync. This is what we use when StoreKit2.pendingPurchases()
// is missing from the installed binary OR comes back empty but Apple
// actually has an entitlement we never told the server about (the exact
// scenario when the Capacitor bridge drops both call.resolve() AND the
// transactionUpdated listener event during the Apple purchase sheet).
//
// Unlike restorePurchases(), this does NOT call AppStore.sync() — so it
// never triggers a sandbox sign-in prompt. It just iterates the
// already-known entitlements, which is safe to do on init / app resume /
// paywall mount / inside the post-purchase poll loop.
let pushEntitlementsInFlight: Promise<number> | null = null;
export async function pushCurrentEntitlements(reason: string): Promise<number> {
  if (!isCapacitorNative() || !isSK2Available()) return 0;
  if (pushEntitlementsInFlight) return pushEntitlementsInFlight;
  pushEntitlementsInFlight = (async () => {
    let pushed = 0;
    try {
      const { transactions } = await StoreKit2.currentEntitlements();
      if (!transactions || transactions.length === 0) return 0;
      logIAP(
        "info",
        `pushCurrentEntitlements(${reason}): pushing ${transactions.length} Apple entitlement(s) to server`,
      );
      // Mark restoring so the server skips its recency_guard — these are
      // historical entitlements being re-pushed, not fresh purchases.
      markRestoring();
      for (const txn of transactions) {
        if (knownStaleTxnIds.has(txn.transactionId)) continue;
        try {
          await syncJwsToBackend(txn.jws, txn.transactionId, {
            originalTransactionId: txn.originalTransactionId,
            productId: txn.productId,
          });
          pushed++;
        } catch (err: any) {
          logIAP(
            "warn",
            `pushCurrentEntitlements: sync ${txn.transactionId} failed: ${err?.message || err}`,
          );
        }
      }
    } catch (err: any) {
      logIAP(
        "warn",
        `pushCurrentEntitlements(${reason}) failed: ${err?.message || err}`,
      );
    } finally {
      pushEntitlementsInFlight = null;
    }
    return pushed;
  })();
  return pushEntitlementsInFlight;
}

// Drain any transactions Swift persisted to UserDefaults that JS hasn't
// seen yet. This is the bulletproof recovery path when the Capacitor
// bridge dropped a call.resolve() / notifyListeners() during a
// WebView-suspension window (which happens reliably while Apple's
// purchase sheet is on screen). Called on init, on app resume, on
// paywall mount, and after a purchase() timeout.
//
// Falls back automatically to pushCurrentEntitlements() when:
//   (a) the installed iOS binary predates the pendingPurchases() Swift
//       method (older TestFlight builds — error contains "not implemented"),
//   (b) pendingPurchases() returns 0 entries (Swift may have lost the
//       persisted entry, or the txn arrived before we wired persistence).
// In both cases, currentEntitlements is the source of truth and lets the
// recovery work even on stale binaries — no native rebuild required.
let drainInFlight: Promise<number> | null = null;
export async function drainPendingPurchases(reason: string): Promise<number> {
  if (!isCapacitorNative() || !isSK2Available()) return 0;
  if (drainInFlight) return drainInFlight;
  drainInFlight = (async () => {
    let processed = 0;
    let pendingMissing = false;
    try {
      const { transactions } = await StoreKit2.pendingPurchases();
      if (transactions && transactions.length > 0) {
        logIAP("info", `drainPendingPurchases(${reason}): found ${transactions.length} unsynced txn(s) — recovering`);
        for (const txn of transactions) {
          try {
            await handleApprovedTransaction(txn, `RECOVERED:${reason}`);
            processed++;
          } catch (err: any) {
            logIAP("warn", `drain: handleApprovedTransaction(${txn.transactionId}) failed: ${err?.message || err}`);
          }
        }
        logIAP("success", `drainPendingPurchases(${reason}): processed ${processed}/${transactions.length}`);
      }
    } catch (err: any) {
      const msg = String(err?.message || err);
      pendingMissing = /not implemented|UNIMPLEMENTED|does not exist|Method not found/i.test(msg);
      if (pendingMissing) {
        logIAP(
          "warn",
          `drainPendingPurchases(${reason}): native pendingPurchases() missing from this binary — falling back to currentEntitlements (no native rebuild required for recovery to work)`,
        );
      } else {
        logIAP("warn", `drainPendingPurchases(${reason}) failed: ${msg}`);
      }
    } finally {
      drainInFlight = null;
    }
    // ALWAYS run the currentEntitlements fallback after a drain attempt.
    // Belt-and-suspenders: covers (a) the missing-method case, (b) the
    // case where Swift never got to persistPendingTransaction because
    // the txn arrived via Transaction.updates while the Task was being
    // torn down, and (c) the case where the server has stale data and
    // needs a fresh push. It's idempotent on the server side.
    try {
      const pushed = await pushCurrentEntitlements(`drain:${reason}`);
      if (pushed > 0) processed += pushed;
    } catch { /* already logged */ }
    return processed;
  })();
  return drainInFlight;
}

export async function initIAP(appUserId: string | null | undefined, appUserEmail?: string | null): Promise<boolean> {
  if (!isCapacitorNative()) return false;
  appUserIdRef = appUserId || null;
  if (appUserEmail !== undefined) appUserEmailRef = appUserEmail || null;
  // Android: route through the Google Play Billing wrapper. Mirrors the
  // iOS path's lifecycle (register products + wire purchase listener +
  // initialize) but against our native PlayBilling Capacitor plugin
  // (wraps com.android.billingclient:billing v7) instead of StoreKit 2.
  if (getPlatform() === "android") {
    logIAP("info", `init: appUserId=${appUserId || "(none)"} via Google Play Billing`);
    return initAndroidIAP(appUserId || null);
  }
  const key = appUserId || "(none)";
  // If a previous init is still in-flight (or resolved) for a DIFFERENT
  // user, discard it. Returning the old promise would skip the listener
  // re-wiring and pending-drain that belong to the new user, which is
  // how "wrong tier shown after switching accounts" used to happen.
  if (initPromise && initPromiseForUser === key) return initPromise;
  if (initPromise && initPromiseForUser !== key) {
    logIAP("info", `init: appUserId changed (${initPromiseForUser} → ${key}) — discarding previous init promise and starting fresh`);
    initPromise = null;
  }
  initPromiseForUser = key;

  initPromise = (async () => {
    try {
      if (!isSK2Available()) {
        logIAP("warn", "StoreKit2 native plugin not registered (rebuild iOS app via `npx cap sync ios`)");
        return false;
      }
      logIAP("info", `init: appUserId=${appUserId || "(none)"} via StoreKit 2`);

      // Subscribe to background transaction updates (renewals, revocations,
      // sandbox auto-renews every 5 min). Each one is a signed JWS we
      // forward to the server.
      try {
        updateListenerHandle = await StoreKit2.addListener(
          "transactionUpdated",
          (txn) => {
            // RAW listener log — fires for EVERY transaction Apple pushes
            // to us, including renewals, upgrades, downgrades, refunds,
            // and known-stale replays. Logged BEFORE handleApprovedTransaction
            // so we always see the arrival even if the txn is short-circuited
            // as a known-stale replay.
            const expISO = (txn as any).expiresDate
              ? new Date((txn as any).expiresDate).toISOString()
              : "(no expires)";
            logIAP(
              "info",
              `[txn UPDATED RAW] product=${txn.productId} txn=${txn.transactionId} originalTxn=${txn.originalTransactionId} expires=${expISO}`,
            );
            void handleApprovedTransaction(txn, "UPDATED");
          },
        );
      } catch (err: any) {
        logIAP("warn", `transactionUpdated listener registration failed: ${err?.message || err}`);
      }

      // Subscribe to revocation events (refunds, family-sharing removal,
      // etc). Apple's StoreKit 2 emits these through Transaction.updates
      // with a non-nil revocationDate, but we route them as a separate
      // event so we don't accidentally sync them as if they were a fresh
      // purchase. Just refresh /api/subscription so the UI reflects the
      // server's authoritative view (which the App Store Server
      // Notification will already have updated).
      try {
        await StoreKit2.addListener("transactionRevoked", (txn) => {
          logIAP(
            "warn",
            `[txn REVOKED] product=${txn.productId} txn=${txn.transactionId} originalTxn=${txn.originalTransactionId} env=${txn.environment || "?"}`,
          );
          try {
            const qc: any = (window as any).__queryClient;
            if (qc?.invalidateQueries) {
              qc.invalidateQueries({ queryKey: ["/api/subscription"] });
              qc.invalidateQueries({ queryKey: ["/api/subscription/feature-access"] });
            }
          } catch { /* non-fatal */ }
        });
      } catch (err: any) {
        logIAP("warn", `transactionRevoked listener registration failed: ${err?.message || err}`);
      }

      // Bulletproof recovery: pull anything Swift already saw and stored
      // but JS hasn't synced yet (e.g. a previous session's purchase that
      // got dropped by the Capacitor bridge mid-suspension).
      void drainPendingPurchases("init");

      // CROSS-GROUP RECONCILE on every boot. Each add-on (white-label,
      // fuseAi, aiAssistant) is its OWN auto-renewable subscription in its
      // OWN subscription group, completely independent from the tier group
      // (starter/core/elite). Apple's per-purchase JWS only describes the
      // single product the user just touched, so add-ons that were already
      // active on the Apple ID — or that auto-renewed independently while
      // the app was closed — never reach our server until we sweep all
      // currentEntitlements and post each one. Without this sweep the user
      // can end up Starter-on-our-side / Starter+addon-on-Apple's-side, and
      // we'd happily allow a downgrade that strands the add-on (Apple keeps
      // billing for something the tier can't use). Run once per session, in
      // the background — the server is idempotent and de-dupes by JWS.
      void pushCurrentEntitlements("init-cross-group-reconcile");

      // Pre-load product info into the cache so getOfferings is instant.
      try {
        const { products } = await StoreKit2.getProducts({ productIds: ALL_PRODUCT_IDS });
        cachedProducts = new Map(products.map((p) => [p.id, p]));
        logIAP("success", `loaded ${products.length}/${ALL_PRODUCT_IDS.length} products from App Store`);
      } catch (err: any) {
        logIAP("warn", `getProducts failed (will retry on demand): ${err?.message || err}`);
      }

      return true;
    } catch (err: any) {
      logIAP("error", `init failed: ${err?.message || err}`);
      initPromise = null;
      return false;
    }
  })();

  return initPromise;
}

export async function loginIAP(appUserId: string, appUserEmail?: string | null): Promise<void> {
  appUserIdRef = appUserId;
  if (appUserEmail !== undefined) appUserEmailRef = appUserEmail || null;
}

export async function logoutIAP(): Promise<void> {
  appUserIdRef = null;
  appUserEmailRef = null;
  if (updateListenerHandle) {
    try { await updateListenerHandle.remove(); } catch { /* non-fatal */ }
    updateListenerHandle = null;
  }
}

// === Backwards-compat shape used by existing UI code ===
export interface PurchasesPackage {
  identifier: string;
  product: { identifier: string; priceString?: string };
}
export interface PurchasesOffering {
  availablePackages: PurchasesPackage[];
}
export interface CustomerInfo {
  entitlements: {
    active: Record<string, { productIdentifier?: string; expirationDate?: string | null }>;
  };
}

export async function getOfferings(force = false): Promise<PurchasesOffering | null> {
  if (!isSK2Available()) return null;
  try {
    if (force || cachedProducts.size === 0) {
      const { products } = await StoreKit2.getProducts({ productIds: ALL_PRODUCT_IDS });
      cachedProducts = new Map(products.map((p) => [p.id, p]));
    }
    const packages: PurchasesPackage[] = [];
    for (const id of ALL_PRODUCT_IDS) {
      const p = cachedProducts.get(id);
      if (!p) continue;
      packages.push({
        identifier: id,
        product: { identifier: id, priceString: p.displayPrice },
      });
    }
    return { availablePackages: packages };
  } catch (err: any) {
    logIAP("warn", `getOfferings failed: ${err?.message || err}`);
    return null;
  }
}

export function findPackageForTier(
  offering: PurchasesOffering | null,
  tier: Tier,
): PurchasesPackage | null {
  if (!offering) return null;
  const targetId = TIER_TO_PRODUCT_ID[tier];
  return (
    offering.availablePackages.find((p) => p.identifier === targetId) ||
    offering.availablePackages.find((p) =>
      p.product?.identifier?.toLowerCase().includes(tier),
    ) ||
    null
  );
}

export function findPackageForAddon(
  offering: PurchasesOffering | null,
  addon: Addon,
): PurchasesPackage | null {
  if (!offering) return null;
  const targetId = ADDON_TO_PRODUCT_ID[addon];
  return offering.availablePackages.find((p) => p.identifier === targetId) || null;
}

export type PurchaseResult =
  | { ok: true; tier: Tier; processing?: boolean; message?: string; customerInfo: CustomerInfo }
  | {
      ok: false;
      userCancelled: boolean;
      message: string;
      ownedByOtherAccount?: { maskedEmail: string; originalTransactionId: string };
    };

export type AddonPurchaseResult =
  | { ok: true; addon: Addon; processing?: boolean; message?: string }
  | { ok: false; userCancelled: boolean; message: string };

async function pollForActiveTier(
  expectedTier: Tier,
  maxMs = 90_000,
): Promise<Tier | null> {
  await new Promise((r) => setTimeout(r, 2_000));
  const startedAt = Date.now();
  let iter = 0;
  while (Date.now() - startedAt < maxMs) {
    iter++;
    try {
      const resp = await fetch("/api/subscription", { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        const serverTier = data?.tier || data?.subscriptionTier || "(none)";
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        logIAP("info", `poll[${iter}] +${elapsed}s: server tier=${serverTier} status=${data?.subscriptionStatus || data?.status || "?"} expires=${data?.subscriptionEndsAt || "n/a"} (looking for ${expectedTier})`);
        if (data?.tier === expectedTier || data?.subscriptionTier === expectedTier) {
          return expectedTier;
        }
      } else {
        logIAP("warn", `poll[${iter}]: /api/subscription returned ${resp.status}`);
      }
    } catch (err: any) {
      logIAP("warn", `poll[${iter}]: fetch threw ${err?.message || err}`);
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  // Timeout diagnostic: snapshot Apple's real entitlements so we can see
  // whether Apple ever moved to the expected tier or stayed on the old one
  // (the most common cause of poll timeouts is a queued downgrade — Apple
  // intentionally hasn't switched yet).
  try {
    const { transactions } = await StoreKit2.currentEntitlements();
    const dump = (transactions || [])
      .map(t => `${t.productId}#${t.originalTransactionId}`)
      .join(", ") || "(none)";
    logIAP("error", `pollForActiveTier(${expectedTier}) TIMEOUT — Apple's currentEntitlements: ${dump}`);
  } catch (err: any) {
    logIAP("warn", `timeout entitlement dump failed: ${err?.message || err}`);
  }
  return null;
}

async function pollForActiveAddon(addon: Addon, maxMs = 90_000): Promise<boolean> {
  const statusKey = addon === "whiteLabel" ? "whiteLabelStatus" : "aiAssistantStatus";
  await new Promise((r) => setTimeout(r, 2_000));
  const startedAt = Date.now();
  let iter = 0;
  while (Date.now() - startedAt < maxMs) {
    iter++;
    try {
      const resp = await fetch("/api/subscription", { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        logIAP("info", `poll[${iter}] +${elapsed}s: ${statusKey}=${data?.[statusKey] || "(none)"} (looking for active)`);
        if (data?.[statusKey] === "active") return true;
      } else {
        logIAP("warn", `poll[${iter}]: /api/subscription returned ${resp.status}`);
      }
    } catch (err: any) {
      logIAP("warn", `poll[${iter}]: fetch threw ${err?.message || err}`);
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  return false;
}

function buildSyntheticCustomerInfo(tier: Tier): CustomerInfo {
  return {
    entitlements: {
      active: { [tier]: { productIdentifier: TIER_TO_PRODUCT_ID[tier] } },
    },
  };
}

// === Android (Google Play Billing) tier + addon purchase paths ===
// Mirror of the iOS purchaseTier/purchaseAddon flow but driven by Play
// Billing. The Android wrapper handles the .approved → verify → finish
// lifecycle; here we just translate its result shape into the existing
// PurchaseResult / AddonPurchaseResult contract that the paywall UI
// already understands, and run the same post-purchase server poll so
// the paywall doesn't dismiss until the tier is actually live.
async function purchaseTierAndroid(tier: Tier): Promise<PurchaseResult> {
  const productId = TIER_TO_PRODUCT_ID[tier];
  logIAP("info", `purchaseTierAndroid(${tier}) → Play Billing order(${productId})`);
  if (!isAndroidStoreAvailable()) {
    return { ok: false, userCancelled: false, message: unavailableMessage() };
  }
  const result = await purchaseAndroidProduct(productId, appUserIdRef);
  if (result.status === "userCancelled") {
    return { ok: false, userCancelled: true, message: "Purchase canceled." };
  }
  if (result.status === "pending") {
    return { ok: false, userCancelled: false, message: "Purchase is pending approval." };
  }
  if (result.status === "cannotMakePayments" || result.status === "error") {
    return { ok: false, userCancelled: false, message: result.message };
  }
  // status === "success" — server has already verified & activated.
  const verifiedTier = await pollForActiveTier(tier, 30_000);
  if (!verifiedTier) {
    return {
      ok: true,
      tier,
      processing: true,
      message: "Payment received. Your plan will activate momentarily.",
      customerInfo: buildSyntheticCustomerInfo(tier),
    };
  }
  logIAP("success", `purchaseTierAndroid(${tier}): server confirmed tier=${verifiedTier}`);
  return { ok: true, tier: verifiedTier, customerInfo: buildSyntheticCustomerInfo(verifiedTier) };
}

async function purchaseAddonAndroid(addon: Addon): Promise<AddonPurchaseResult> {
  const productId = ADDON_TO_PRODUCT_ID[addon];
  logIAP("info", `purchaseAddonAndroid(${addon}) → Play Billing order(${productId})`);
  if (!isAndroidStoreAvailable()) {
    return { ok: false, userCancelled: false, message: unavailableMessage() };
  }
  const result = await purchaseAndroidProduct(productId, appUserIdRef);
  if (result.status === "userCancelled") {
    return { ok: false, userCancelled: true, message: "Purchase canceled." };
  }
  if (result.status === "pending") {
    return { ok: false, userCancelled: false, message: "Purchase is pending approval." };
  }
  if (result.status === "cannotMakePayments" || result.status === "error") {
    return { ok: false, userCancelled: false, message: result.message };
  }
  const verified = await pollForActiveAddon(addon, 30_000);
  if (!verified) {
    return {
      ok: true,
      addon,
      processing: true,
      message: "Payment received. Your add-on will activate momentarily.",
    };
  }
  return { ok: true, addon };
}

export async function purchaseTier(tier: Tier): Promise<PurchaseResult> {
  logIAP("info", `purchaseTier(${tier}): entry — platform=${getPlatform()}, isCapacitorNative=${isCapacitorNative()}, isSK2Available=${isSK2Available()}`);
  if (!isCapacitorNative()) {
    logIAP("warn", `purchaseTier(${tier}): not running in Capacitor native — returning platform-aware unavailable message`);
    return { ok: false, userCancelled: false, message: unavailableMessage() };
  }
  if (getPlatform() === "android") {
    return purchaseTierAndroid(tier);
  }
  // Wait up to 3s for the StoreKit2 native plugin to finish registering.
  // Closes the race between AppDelegate's delayed registerPluginInstance
  // and the web layer's call to purchaseTier. Returns true immediately if
  // the plugin is already there.
  const sk2Ready = await waitForSK2(8000);
  if (!sk2Ready) {
    logIAP("error", `purchaseTier(${tier}): StoreKit2 plugin not available after 8s wait (platform=${getPlatform()}) — returning unavailable message`);
    return { ok: false, userCancelled: false, message: unavailableMessage() };
  }
  const productId = TIER_TO_PRODUCT_ID[tier];
  // Clear any leftover sync rejection from background work (launch sweep,
  // app-resume drain, Transaction.updates listener) so the rejection
  // surfacing logic below only ever sees rejections caused by THIS
  // purchase's own sync calls. Without this, a stale_transaction from
  // the launch sweep finding an old expired txn would leak into the
  // next user-initiated purchase and surface a misleading "Apple is
  // still clearing old test transactions" message even when the new
  // purchase actually succeeded.
  consumeLastSyncRejection();
  consumeStaleReplayCount();
  try {
    // Snapshot Apple's view BEFORE the purchase call so we can tell when
    // Apple shows the "You're currently subscribed to this" dialog
    // (which makes purchase() return userCancelled with no other signal).
    let preEntitlements: SK2Transaction[] = [];
    // ROOT FIX (Bug A): Transaction.currentEntitlements in StoreKit 2 is
    // not guaranteed to be a finite AsyncSequence in sandbox — it can
    // stall waiting for an internal StoreKit refresh, especially on the
    // second invocation in a session. A naked `await` here would block
    // purchase() from ever being called and the Apple sheet would never
    // open. The pre-flight is a nice-to-have (only used to detect Apple's
    // "you're already subscribed" sheet); never let it block the actual
    // purchase. 5s is more than enough for the happy path.
    try {
      const ENT_TIMEOUT_MS = 5_000;
      const entResult = await Promise.race([
        StoreKit2.currentEntitlements().then(r => ({ ok: true as const, transactions: r.transactions })),
        new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), ENT_TIMEOUT_MS)),
      ]);
      if (entResult.ok) {
        preEntitlements = entResult.transactions || [];
        const summary = preEntitlements.length === 0
          ? "(none)"
          : preEntitlements.map(t => `${t.productId}#${t.originalTransactionId}`).join(", ");
        logIAP("info", `pre-purchase Apple entitlements: ${summary}`);
      } else {
        logIAP("warn", `pre-purchase currentEntitlements timed out after ${ENT_TIMEOUT_MS}ms — skipping pre-flight, going straight to purchase()`);
      }
    } catch (entErr: any) {
      logIAP("warn", `pre-purchase currentEntitlements failed: ${entErr?.message || entErr}`);
    }
    const alreadyHasSameProduct = preEntitlements.some(t => t.productId === productId);
    if (alreadyHasSameProduct) {
      logIAP("warn", `purchaseTier(${tier}): Apple already shows ${productId} as an active entitlement — Apple will likely show the "already subscribed" sheet.`);
    }

    // PRE-PURCHASE DEVICE-HISTORY CHECK
    // If any of Apple's current entitlements on this iPhone has an
    // originalTransactionId we previously saved to device history under
    // a DIFFERENT FusePhone user, short-circuit with a friendly modal
    // instead of letting the user tap Buy and waiting 20s for the
    // server to reject with first-writer-wins. The server check is
    // still authoritative — this is purely a UX speed-up.
    try {
      if (appUserIdRef && preEntitlements.length > 0) {
        const otxnIds = preEntitlements
          .map(t => t.originalTransactionId)
          .filter((x): x is string => !!x);
        const conflict = await findConflictingDeviceOwner(otxnIds, appUserIdRef);
        if (conflict) {
          const masked = maskEmail(conflict.email);
          logIAP(
            "warn",
            `purchaseTier(${tier}): device-history conflict — originalTxn ${conflict.originalTransactionId} on this iPhone belongs to ${masked} (userId=${conflict.userId}); blocking before purchase()`,
          );
          return {
            ok: false,
            userCancelled: false,
            message: `This Apple ID already has a FusePhone subscription tied to ${masked}.`,
            ownedByOtherAccount: {
              maskedEmail: masked,
              originalTransactionId: conflict.originalTransactionId,
            },
          };
        }
      }
    } catch (histErr: any) {
      logIAP("warn", `device-history pre-check failed (continuing to purchase): ${histErr?.message || histErr}`);
    }

    const startMs = Date.now();
    logIAP("info", `purchaseTier(${tier}) → StoreKit2.purchase(${productId}) appUserId=${appUserIdRef || "(none)"}`);
    // Race against a 45s timer. The Capacitor↔StoreKit bridge sometimes
    // drops the purchase result (especially on subscription cross-grades
    // inside the same group), leaving JS awaiting forever even though
    // Apple already charged the user. When that happens we fall back to
    // currentEntitlements via restorePurchases() — Apple still knows
    // about the new subscription and we can forward the JWS to our server.
    const PURCHASE_TIMEOUT_MS = 45_000;
    const purchasePromise = StoreKit2.purchase({
      productId,
      appAccountToken: appUserIdRef || undefined,
    });
    const timeoutPromise = new Promise<"__timeout__">((resolve) =>
      setTimeout(() => resolve("__timeout__"), PURCHASE_TIMEOUT_MS),
    );
    const raced = await Promise.race([purchasePromise, timeoutPromise]);
    if (raced === "__timeout__") {
      // ROOT-CAUSE-AWARE RESCUE
      //
      // Two completely different things look identical from JS:
      //   (A) "Bridge drop": Apple DID complete a purchase, but the
      //       Capacitor bridge dropped both call.resolve() AND the
      //       Transaction.updates listener event. Apple's
      //       currentEntitlements WILL contain a NEW entitlement (a
      //       transactionId or productId we did not have before).
      //   (B) "Apple silently refused": Apple never created a new
      //       transaction at all — the most common cause is a sandbox
      //       renewal cycle racing the user's tap, but it also covers
      //       the "You're already subscribed to this" sheet that
      //       returns no result. Apple's currentEntitlements still
      //       shows ONLY the old tier.
      //
      // The fix: compare currentEntitlements NOW vs the pre-purchase
      // snapshot. If we find a new transactionId that wasn't there
      // before — that's case (A): rescue it. If we don't — that's case
      // (B): tell the user clearly that Apple is busy / the upgrade
      // didn't go through, instead of pretending recovery is in
      // progress and waiting another 30s for nothing.
      logIAP(
        "warn",
        `purchaseTier(${tier}): bridge didn't deliver result in ${PURCHASE_TIMEOUT_MS}ms — comparing Apple's entitlements vs pre-purchase snapshot to determine if Apple actually charged the card.`,
      );
      const preTxnIds = new Set(preEntitlements.map((t) => t.transactionId));
      let appleHasNewTxn = false;
      try {
        const ENT_TIMEOUT_MS = 5_000;
        const entResult = await Promise.race([
          StoreKit2.currentEntitlements().then((r) => ({ ok: true as const, transactions: r.transactions })),
          new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), ENT_TIMEOUT_MS)),
        ]);
        if (entResult.ok) {
          const newOnes = entResult.transactions.filter((t) => !preTxnIds.has(t.transactionId));
          if (newOnes.length > 0) {
            appleHasNewTxn = true;
            logIAP(
              "info",
              `purchaseTier(${tier}): Apple has ${newOnes.length} NEW txn(s) since the snapshot — bridge-drop confirmed, rescuing: ${newOnes.map((t) => `${t.productId}#${t.transactionId}`).join(", ")}`,
            );
          } else {
            logIAP(
              "warn",
              `purchaseTier(${tier}): Apple has NO new txn since the snapshot — Apple did not actually create a transaction. Likely cause: sandbox renewal race or "you're already subscribed" sheet. Will surface a clear message instead of pretending to recover.`,
            );
          }
        }
      } catch (err: any) {
        logIAP("warn", `purchaseTier(${tier}): post-timeout entitlement check failed: ${err?.message || err}`);
      }

      if (!appleHasNewTxn) {
        // Case (B). Tell the user the truth instead of spinning.
        return {
          ok: false,
          userCancelled: false,
          message:
            "Apple didn't process this upgrade. This usually means a renewal was happening in the background or your Apple ID already has this plan. Wait about 30 seconds, pull down to refresh, and try again. If it keeps happening, tap Restore Purchases.",
        };
      }

      // Case (A): we know Apple has something new — push it once and
      // poll briefly. Bounded so we don't spin.
      await drainPendingPurchases("purchase-timeout-bridge-drop");
      await pushCurrentEntitlements("purchase-timeout-bridge-drop");
      const found = await pollForActiveTier(tier, 8_000);
      if (found === tier) {
        logIAP("success", `purchaseTier(${tier}): rescued from bridge-drop`);
        return { ok: true, tier, customerInfo: buildSyntheticCustomerInfo(tier) };
      }
      logIAP(
        "warn",
        `purchaseTier(${tier}): Apple has a new txn but server didn't surface tier=${tier} after push+poll — likely a cross-grade still being finalized by Apple's webhook.`,
      );
      return {
        ok: true,
        tier,
        processing: true,
        message: "Payment received. Apple is still finalizing the plan switch — your new tier will appear within a minute.",
        customerInfo: buildSyntheticCustomerInfo(tier),
      };
    }
    const result = raced;
    const elapsed = Date.now() - startMs;
    logIAP(
      "info",
      `purchase() returned in ${elapsed}ms: status=${result.status} returnedProduct=${result.productId} ` +
      `txn=${result.transactionId} originalTxn=${result.originalTransactionId}` +
      (result.productId !== productId
        ? ` (note: Apple returned ${result.productId} instead of requested ${productId} — typically a sandbox replay of a pending txn; the real ${productId} txn arrives shortly via Transaction.updates and the webhook)`
        : ""),
    );

    if (result.status === "userCancelled") {
      // Two very different things look the same here:
      //   1. User truly tapped Cancel on the purchase sheet
      //   2. Apple showed "You're currently subscribed to this" and user
      //      tapped OK — StoreKit reports this as userCancelled with no
      //      other signal. We disambiguate using elapsed time + the
      //      pre-purchase entitlements snapshot.
      const isAlreadySubscribedSheet = alreadyHasSameProduct && elapsed < 8000;
      if (isAlreadySubscribedSheet) {
        logIAP("error",
          `purchaseTier(${tier}): Apple blocked the purchase — "You're currently subscribed to this" dialog. ` +
          `Active Apple entitlement: ${productId}. Open Settings → Sandbox Account → Manage Subscriptions to cancel, ` +
          `then try again. (elapsed=${elapsed}ms, returned in <8s with userCancelled = telltale of the native blocker sheet.)`,
        );
        return {
          ok: false, userCancelled: false,
          message: `Apple says you already have ${productId} active on this Apple ID. Open iOS Settings → Subscriptions, cancel the existing one, wait a moment, then try again. (Or tap Restore Purchases if you want to use the existing subscription.)`,
        };
      }
      logIAP("warn", `purchaseTier(${tier}): user cancelled (elapsed=${elapsed}ms)`);
      return { ok: false, userCancelled: true, message: "Purchase canceled." };
    }
    if (result.status === "pending") {
      logIAP("warn", `purchaseTier(${tier}): Apple returned pending (Ask to Buy / SCA)`);
      return { ok: false, userCancelled: false, message: "Purchase is pending approval." };
    }
    if (result.status === "cannotMakePayments") {
      logIAP("error", `purchaseTier(${tier}): device cannot make payments`);
      return { ok: false, userCancelled: false, message: result.message };
    }

    await handleApprovedTransaction(
      {
        transactionId: result.transactionId,
        originalTransactionId: result.originalTransactionId,
        productId: result.productId,
        jws: result.jws,
      },
      "PURCHASED",
    );

    // Server-side first-writer-wins fallback: if the sync we just did
    // came back rejected with owned_by_other_account, surface the masked
    // email up to the paywall so the modal can render. (This catches
    // the case where device history was empty — e.g. fresh install on
    // a phone that previously had a different FusePhone account.)
    const rejection = consumeLastSyncRejection();
    // Sandbox stale-replay surfacing: if Apple kept handing us
    // expired-by-78-minutes test transactions for this product, the
    // paywall should explain that instead of leaving the button stuck
    // on "Switching…" until the 45s purchase timeout fires.
    if (rejection?.blockedReason === "stale_transaction") {
      logIAP(
        "warn",
        `purchaseTier(${tier}): server returned stale_transaction (Apple sandbox replay) — surfacing retry message`,
      );
      return {
        ok: false,
        userCancelled: false,
        message:
          "Apple is still clearing old test transactions in the background. Please wait 10 seconds and tap " +
          (tier.charAt(0).toUpperCase() + tier.slice(1)) +
          " again — the payment sheet should open this time.",
      };
    }
    if (rejection?.blockedReason === "owned_by_other_account" && rejection.maskedEmail) {
      logIAP(
        "warn",
        `purchaseTier(${tier}): server returned owned_by_other_account for ${rejection.maskedEmail} — surfacing modal`,
      );
      return {
        ok: false,
        userCancelled: false,
        message: rejection.message || `This Apple ID already has a FusePhone subscription tied to ${rejection.maskedEmail}.`,
        ownedByOtherAccount: {
          maskedEmail: rejection.maskedEmail,
          originalTransactionId: rejection.originalTransactionId || result.originalTransactionId || "",
        },
      };
    }

    // DEFERRED-DOWNGRADE DETECTION (the canonical Apple signal):
    // When the user requests a LOWER tier than what's currently active,
    // Apple's `purchase()` returns success but with the productId of the
    // CURRENT (higher) product, not the requested one. Apple has queued
    // the downgrade for next renewal; no new transaction will be issued
    // until the current period expires (months in production, 5 min in
    // sandbox). Polling /api/subscription for the lower tier in this
    // window is futile — the server will keep reporting the current tier
    // (correctly) until DID_RENEW arrives. Exit immediately with a
    // friendly "scheduled" message so the paywall doesn't stay stuck on
    // "Switching..." for the 90s poll timeout.
    const returnedTier = tierFromProductId(result.productId);
    if (returnedTier && returnedTier !== tier && TIER_RANK[returnedTier] > TIER_RANK[tier]) {
      // Try to fetch the real renewal date from /api/subscription so we
      // can show the user exactly when the switch will happen. Best-effort.
      let effectiveAt: string | null = null;
      try {
        const resp = await fetch("/api/subscription", { credentials: "include" });
        if (resp.ok) {
          const data = await resp.json();
          effectiveAt = data?.subscriptionEndsAt || null;
        }
      } catch { /* non-fatal */ }
      const niceTarget = tier.charAt(0).toUpperCase() + tier.slice(1);
      const niceCurrent = returnedTier.charAt(0).toUpperCase() + returnedTier.slice(1);
      const whenStr = effectiveAt
        ? new Date(effectiveAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
        : null;
      logIAP(
        "success",
        `purchaseTier(${tier}): DEFERRED-DOWNGRADE detected — Apple returned current product ${result.productId} (rank ${TIER_RANK[returnedTier]}) ` +
        `instead of requested ${productId} (rank ${TIER_RANK[tier]}). Apple has queued ${tier} for next renewal` +
        (whenStr ? ` (${whenStr})` : "") +
        `. Skipping poll — exiting with scheduled-downgrade message.`,
      );
      return {
        ok: true,
        tier: returnedTier, // still on current tier until renewal
        processing: true,
        message: whenStr
          ? `Your downgrade is scheduled. You'll keep ${niceCurrent} until ${whenStr}, then automatically switch to ${niceTarget}.`
          : `Your downgrade is scheduled. You'll keep ${niceCurrent} until the end of your current billing period, then automatically switch to ${niceTarget}.`,
        customerInfo: buildSyntheticCustomerInfo(returnedTier),
      };
    }

    const verifiedTier = await pollForActiveTier(tier);
    if (!verifiedTier) {
      // CROSS-GRADE / WEBHOOK-LATENCY CASE: Apple confirmed the payment
      // (we have a JWS, status=success), but our server poll for the
      // expected tier timed out. This is the textbook cross-grade
      // scenario — Apple returns an intermediate-state JWS first, then
      // delivers the real new product via App Store Server Notifications
      // V2 webhook seconds-to-minutes later. Don't show an error: the
      // payment IS complete on Apple's side, and the server's WebSocket
      // push (subscription.changed) will reconcile the UI as soon as the
      // webhook lands. Return a soft "processing" success so the paywall
      // dismisses the spinner and shows a friendly message.
      const isCrossGrade = result.productId !== productId;
      logIAP(
        "warn",
        `pollForActiveTier(${tier}) timed out after 90s — Apple confirmed payment (returned ${result.productId}), waiting for webhook${isCrossGrade ? " (cross-grade detected)" : ""}.`,
      );
      return {
        ok: true,
        tier,
        processing: true,
        message:
          isCrossGrade
            ? "Payment received. Apple is still finalizing the plan switch — your new tier will appear within a minute."
            : "Payment received. Your plan will activate momentarily.",
        customerInfo: buildSyntheticCustomerInfo(tier),
      };
    }
    logIAP("success", `purchaseTier(${tier}): server confirmed tier=${verifiedTier}`);
    // CROSS-GROUP RECONCILE after a successful tier purchase. The JWS we
    // just synced only describes the new tier — it tells us nothing about
    // add-on subscriptions (white-label, fuseAi, aiAssistant) which live in
    // their own independent subscription groups on the same Apple ID. If
    // the user already owned an add-on (e.g. left over from a prior Elite
    // session, or auto-renewed in the background), the server still hasn't
    // heard about it, and a future downgrade would orphan the add-on
    // (Apple keeps billing for it). Sweep currentEntitlements now so every
    // active Apple subscription on this Apple ID is reflected on our user
    // row before the paywall returns control.
    void pushCurrentEntitlements(`post-tier-purchase:${tier}`);
    return { ok: true, tier: verifiedTier, customerInfo: buildSyntheticCustomerInfo(verifiedTier) };
  } catch (err: any) {
    const userCancelled = /cancel/i.test(err?.message || "");
    logIAP(userCancelled ? "warn" : "error", `purchaseTier(${tier}) threw: ${err?.message || err}`);
    return {
      ok: false, userCancelled,
      message: userCancelled ? "Purchase canceled." : err?.message || "Purchase failed.",
    };
  }
}

export async function purchaseAddon(addon: Addon): Promise<AddonPurchaseResult> {
  logIAP("info", `purchaseAddon(${addon}): entry — platform=${getPlatform()}, isCapacitorNative=${isCapacitorNative()}, isSK2Available=${isSK2Available()}`);
  if (!isCapacitorNative()) {
    logIAP("warn", `purchaseAddon(${addon}): not running in Capacitor native — returning platform-aware unavailable message`);
    return { ok: false, userCancelled: false, message: unavailableMessage() };
  }
  if (getPlatform() === "android") {
    return purchaseAddonAndroid(addon);
  }
  const sk2Ready = await waitForSK2(8000);
  if (!sk2Ready) {
    logIAP("error", `purchaseAddon(${addon}): StoreKit2 plugin not available after 8s wait (platform=${getPlatform()}) — returning unavailable message`);
    return { ok: false, userCancelled: false, message: unavailableMessage() };
  }
  const productId = ADDON_TO_PRODUCT_ID[addon];
  // Same leftover-rejection clear as purchaseTier — see comment there.
  consumeLastSyncRejection();
  consumeStaleReplayCount();
  try {
    logIAP("info", `purchaseAddon(${addon}) → StoreKit2.purchase(${productId})`);
    // Same 45s race + restore-fallback as purchaseTier — the Capacitor↔
    // StoreKit bridge sometimes drops the result and we'd otherwise hang.
    const PURCHASE_TIMEOUT_MS = 45_000;
    const purchasePromise = StoreKit2.purchase({
      productId,
      appAccountToken: appUserIdRef || undefined,
    });
    const timeoutPromise = new Promise<"__timeout__">((resolve) =>
      setTimeout(() => resolve("__timeout__"), PURCHASE_TIMEOUT_MS),
    );
    const raced = await Promise.race([purchasePromise, timeoutPromise]);
    if (raced === "__timeout__") {
      // Same root-cause-aware logic as purchaseTier. We don't have a
      // pre-purchase snapshot for add-ons (no upgrade dialog to gate),
      // so we use a different signal: does currentEntitlements include
      // the requested add-on productId? If yes → bridge-drop, rescue.
      // If no → Apple didn't process it; tell the user clearly.
      logIAP(
        "warn",
        `purchaseAddon(${addon}): bridge didn't deliver result in ${PURCHASE_TIMEOUT_MS}ms — checking if Apple actually charged the card.`,
      );
      let appleHasAddon = false;
      try {
        const { transactions } = await StoreKit2.currentEntitlements();
        appleHasAddon = (transactions || []).some((t) => t.productId === productId);
        logIAP(
          appleHasAddon ? "info" : "warn",
          `purchaseAddon(${addon}): Apple's currentEntitlements ${appleHasAddon ? "DOES" : "does NOT"} include ${productId}`,
        );
      } catch (err: any) {
        logIAP("warn", `purchaseAddon(${addon}): post-timeout entitlement check failed: ${err?.message || err}`);
      }

      if (!appleHasAddon) {
        return {
          ok: false,
          userCancelled: false,
          message:
            "Apple didn't process this add-on purchase. This usually means a renewal was happening in the background or you already have it. Wait about 30 seconds and try again, or tap Restore Purchases.",
        };
      }

      await drainPendingPurchases("addon-purchase-timeout-bridge-drop");
      await pushCurrentEntitlements("addon-purchase-timeout-bridge-drop");
      const found = await pollForActiveAddon(addon, 8_000);
      if (found) {
        logIAP("success", `purchaseAddon(${addon}): rescued from bridge-drop`);
        return { ok: true, addon };
      }
      return {
        ok: true,
        addon,
        processing: true,
        message: "Payment received. Your add-on will activate within a minute.",
      };
    }
    const result = raced;
    logIAP(
      "info",
      `purchase() returned: status=${result.status} returnedProduct=${result.productId} ` +
      `txn=${result.transactionId}` +
      (result.productId !== productId
        ? ` (note: Apple returned ${result.productId} instead of requested ${productId} — typically a sandbox replay; real txn follows via Transaction.updates)`
        : ""),
    );

    if (result.status === "userCancelled") {
      return { ok: false, userCancelled: true, message: "Purchase canceled." };
    }
    if (result.status === "pending") {
      return { ok: false, userCancelled: false, message: "Purchase is pending approval." };
    }
    if (result.status === "cannotMakePayments") {
      return { ok: false, userCancelled: false, message: result.message };
    }

    await handleApprovedTransaction(
      {
        transactionId: result.transactionId,
        originalTransactionId: result.originalTransactionId,
        productId: result.productId,
        jws: result.jws,
      },
      "PURCHASED",
    );

    const verified = await pollForActiveAddon(addon);
    if (!verified) {
      // Apple confirmed the payment (we have a JWS) but the server's
      // activation poll timed out — usually because the App Store Server
      // Notification webhook is still en route. Don't surface an error;
      // the WebSocket subscription.changed push from /api/iap/webhook
      // will reconcile the UI as soon as it lands.
      logIAP(
        "warn",
        `pollForActiveAddon(${addon}) timed out after 90s — Apple confirmed payment, waiting for webhook.`,
      );
      return {
        ok: true,
        addon,
        processing: true,
        message: "Payment received. Your add-on will activate momentarily.",
      };
    }
    // Same cross-group reconcile as purchaseTier — see comment there. The
    // user might own OTHER add-ons in their own groups that we still
    // haven't heard about; this sweep makes sure the server's view of all
    // active Apple subscriptions matches Apple's view before the paywall
    // returns.
    void pushCurrentEntitlements(`post-addon-purchase:${addon}`);
    return { ok: true, addon };
  } catch (err: any) {
    const userCancelled = /cancel/i.test(err?.message || "");
    logIAP(userCancelled ? "warn" : "error", `purchaseAddon(${addon}) threw: ${err?.message || err}`);
    return {
      ok: false, userCancelled,
      message: userCancelled ? "Purchase canceled." : err?.message || "Purchase failed.",
    };
  }
}

export type RestoreResult =
  | {
      ok: true;
      tier: Tier | null;
      customerInfo: CustomerInfo;
      ownedByOtherAccount?: { maskedEmail: string; originalTransactionId: string };
    }
  | {
      ok: false;
      message: string;
      ownedByOtherAccount?: { maskedEmail: string; originalTransactionId: string };
    };

export async function restorePurchases(): Promise<RestoreResult> {
  logIAP("info", `restorePurchases: entry — platform=${getPlatform()}, isCapacitorNative=${isCapacitorNative()}, isSK2Available=${isSK2Available()}`);
  if (!isCapacitorNative()) {
    logIAP("warn", `restorePurchases: not running in Capacitor native — returning platform-aware message`);
    return { ok: false, message: unavailableMessage() };
  }
  // Android branch: Play Billing has its own restore primitive. The
  // purchaseUpdated listener in iap-android.ts re-runs the server verify
  // path for each restored subscription, so reconciliation happens for free.
  if (getPlatform() === "android") {
    if (!isAndroidStoreAvailable()) {
      logIAP("error", `restorePurchases: Google Play Billing plugin not available`);
      return { ok: false, message: unavailableMessage() };
    }
    const res = await restoreAndroidPurchases();
    if (!res.ok) {
      return { ok: false, message: res.message || "Restore failed." };
    }
    // Give the purchaseUpdated listeners a moment to verify with the
    // server, then resolve. Paywall UI re-fetches /api/auth/user after this.
    await new Promise((r) => setTimeout(r, 2500));
    return { ok: true, message: "Restored from Google Play." };
  }
  const sk2Ready = await waitForSK2(8000);
  if (!sk2Ready) {
    logIAP("error", `restorePurchases: StoreKit2 plugin not available after 8s wait (platform=${getPlatform()})`);
    return { ok: false, message: unavailableMessage() };
  }
  try {
    logIAP("info", "restorePurchases: AppStore.sync() + currentEntitlements");
    markRestoring();
    // Clear any leftover rejection from background work so we only
    // surface rejections caused by THIS restore's sync calls.
    consumeLastSyncRejection();
    const { transactions } = await StoreKit2.restorePurchases();
    logIAP("info", `restore returned ${transactions.length} entitlement(s)`);

    // PRE-SYNC DEVICE-HISTORY CHECK
    // If any restored entitlement's originalTransactionId is already
    // recorded on this iPhone under a DIFFERENT FusePhone user, short
    // circuit with the friendly modal BEFORE hitting the server. The
    // server's first-writer-wins guard is still authoritative — this
    // is a UX speed-up so the user doesn't have to wait through a
    // failed sync just to be told the subscription belongs elsewhere.
    try {
      if (appUserIdRef && transactions.length > 0) {
        const otxnIds = transactions
          .map(t => t.originalTransactionId)
          .filter((x): x is string => !!x);
        const conflict = await findConflictingDeviceOwner(otxnIds, appUserIdRef);
        if (conflict) {
          const masked = maskEmail(conflict.email);
          logIAP(
            "warn",
            `restorePurchases: device-history conflict — originalTxn ${conflict.originalTransactionId} on this iPhone belongs to ${masked} (userId=${conflict.userId}); blocking before server sync`,
          );
          return {
            ok: false,
            message: `This Apple ID's subscription is already linked to ${masked}. Sign in to that account to use it, or cancel the subscription in iPhone Settings → Subscriptions before subscribing on a new account.`,
            ownedByOtherAccount: {
              maskedEmail: masked,
              originalTransactionId: conflict.originalTransactionId,
            },
          };
        }
      }
    } catch (histErr: any) {
      logIAP("warn", `restore device-history pre-check failed (continuing to server sync): ${histErr?.message || histErr}`);
    }

    // Forward each entitlement JWS to the server. Route through
    // handleApprovedTransaction so the SAME SAFE-FINISH GUARD applies:
    // a server hiccup during restore must NOT cause finishTransaction()
    // (which would lose the txn permanently). Anything not finished stays
    // in Swift's pending store and is retried on the next app-resume drain.
    // Track owned_by_other_account rejections so we can surface the modal
    // to the paywall instead of silently showing "Nothing to restore".
    let blockedOwner: { maskedEmail: string; originalTransactionId: string } | null = null;
    for (const txn of transactions) {
      try {
        await handleApprovedTransaction(txn, "restorePurchases");
        const rej = consumeLastSyncRejection();
        if (rej?.blockedReason === "owned_by_other_account" && rej.maskedEmail && !blockedOwner) {
          blockedOwner = {
            maskedEmail: rej.maskedEmail,
            originalTransactionId: rej.originalTransactionId || txn.originalTransactionId || txn.transactionId,
          };
          logIAP(
            "warn",
            `restorePurchases: server rejected txn=${txn.transactionId} as owned_by_other_account (${rej.maskedEmail}) — will surface modal after loop completes`,
          );
        }
      } catch (err: any) {
        logIAP("warn", `restore: handleApprovedTransaction(${txn.transactionId}) failed: ${err?.message || err}`);
      }
    }

    // If any transaction came back owned by another account, that's the
    // authoritative answer for the entire restore — every entitlement on
    // the same Apple ID shares the same originalTransactionId chain, so
    // the rest would all be blocked too. Surface the modal now.
    if (blockedOwner) {
      return {
        ok: false,
        message: `This Apple ID's subscription is already linked to ${blockedOwner.maskedEmail}. Sign in to that account to use it, or cancel the subscription in iPhone Settings → Subscriptions before subscribing on a new account.`,
        ownedByOtherAccount: blockedOwner,
      };
    }

    // Read back the resolved server state.
    const resp = await fetch("/api/subscription", { credentials: "include" });
    let tier: Tier | null = null;
    if (resp.ok) {
      const data = await resp.json();
      const candidate = (data?.tier || data?.subscriptionTier) as Tier | undefined;
      if (
        candidate &&
        TIER_ENTITLEMENT_PRIORITY.includes(candidate) &&
        (data?.status === "active" || data?.subscriptionStatus === "active" || data?.isActive)
      ) {
        tier = candidate;
      }
      logIAP(
        tier ? "success" : "warn",
        `restore complete — server tier=${data?.tier} status=${data?.status} → resolved=${tier || "(none)"}`,
      );
    } else {
      logIAP("error", `restore /api/subscription returned HTTP ${resp.status}`);
    }
    return {
      ok: true, tier,
      customerInfo: tier ? buildSyntheticCustomerInfo(tier) : { entitlements: { active: {} } },
    };
  } catch (err: any) {
    logIAP("error", `restorePurchases threw: ${err?.message || err}`);
    return { ok: false, message: err?.message || "Restore failed." };
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  return null;
}

export function customerInfoToTier(info: CustomerInfo | null | undefined): Tier | null {
  if (!info) return null;
  const active = info.entitlements?.active || {};
  for (const tier of TIER_ENTITLEMENT_PRIORITY) {
    if (active[tier]) return tier;
  }
  const ids = Object.values(active).map((e: any) =>
    (e?.productIdentifier || "").toLowerCase(),
  );
  for (const tier of TIER_ENTITLEMENT_PRIORITY) {
    if (ids.some((id) => id.includes(tier))) return tier;
  }
  return null;
}

export function manageSubscriptionsURL(): string {
  // iOS deep link — opens the system Subscriptions screen instantly
  // inside the App Store / Settings UI without a Safari bounce.
  return "itms-apps://apps.apple.com/account/subscriptions";
}

// Use this when you have a click handler — handles the iOS deep link with
// a graceful https fallback for non-iOS browsers that ever encounter it.
export function openManageSubscriptions(): void {
  const deep = "itms-apps://apps.apple.com/account/subscriptions";
  const fallback = "https://apps.apple.com/account/subscriptions";
  try {
    window.location.href = deep;
    setTimeout(() => {
      try { window.open(fallback, "_blank", "noopener,noreferrer"); } catch {}
    }, 500);
  } catch {
    window.open(fallback, "_blank", "noopener,noreferrer");
  }
}
