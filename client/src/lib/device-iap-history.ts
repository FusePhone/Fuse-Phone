// Device-side memory of every Apple subscription ever activated on THIS
// iPhone, regardless of which FusePhone account did the activation.
//
// Why: Apple's StoreKit ties a subscription to the *Apple ID* on the
// device, not to the FusePhone email. If two FusePhone accounts try to
// buy the same product on the same iPhone (same Apple ID), the second
// one will silently fail or get re-routed to the first account's
// subscription. The server's first-writer-wins guard catches this on
// /api/iap/sync, but by then the user already tapped Buy and waited
// 20 seconds for nothing. This module lets the UI warn them BEFORE they
// tap, with a friendly modal showing the masked email of the account
// that already owns it.
//
// Storage: Capacitor Preferences = native iOS UserDefaults under the
// hood. Survives logout, app updates, and account switches. Wiped only
// on full app uninstall (correct behavior — fresh phone = clean slate).
// Falls back to localStorage on web/dev so the same code runs in both.

const KEY = "fusephone_iap_device_history_v1";

export interface DeviceIapHistoryEntry {
  originalTransactionId: string;
  productId: string;
  userId: string;
  email: string;
  savedAt: number;
}

async function getStore(): Promise<{
  get: (k: string) => Promise<string | null>;
  set: (k: string, v: string) => Promise<void>;
}> {
  try {
    const Cap = (typeof window !== "undefined" && (window as any).Capacitor) || null;
    if (Cap?.isNativePlatform?.()) {
      const { Preferences } = await import("@capacitor/preferences");
      return {
        get: async (k) => (await Preferences.get({ key: k })).value,
        set: async (k, v) => { await Preferences.set({ key: k, value: v }); },
      };
    }
  } catch {
    /* fall through to localStorage */
  }
  return {
    get: async (k) => {
      try { return typeof localStorage !== "undefined" ? localStorage.getItem(k) : null; }
      catch { return null; }
    },
    set: async (k, v) => {
      try { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); }
      catch { /* private mode / quota */ }
    },
  };
}

async function readAll(): Promise<DeviceIapHistoryEntry[]> {
  try {
    const store = await getStore();
    const raw = await store.get(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(entries: DeviceIapHistoryEntry[]): Promise<void> {
  try {
    const store = await getStore();
    await store.set(KEY, JSON.stringify(entries));
  } catch {
    /* non-fatal */
  }
}

// Mask email so users can recognize their own account without leaking
// the full address. ga***l@gmail.com style. Industry standard.
export function maskEmail(email: string | null | undefined): string {
  if (!email || typeof email !== "string") return "***";
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length <= 2) return `${local[0] || "*"}***@${domain}`;
  if (local.length === 3) return `${local[0]}***${local[2]}@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

export async function recordPurchase(entry: Omit<DeviceIapHistoryEntry, "savedAt">): Promise<void> {
  if (!entry.originalTransactionId || !entry.userId) return;
  const list = await readAll();
  const filtered = list.filter(e => e.originalTransactionId !== entry.originalTransactionId);
  filtered.push({ ...entry, savedAt: Date.now() });
  // Cap at 50 entries — more than enough for a real device.
  const capped = filtered.slice(-50);
  await writeAll(capped);
}

export async function findEntryForOriginalTxn(
  originalTransactionId: string,
): Promise<DeviceIapHistoryEntry | null> {
  if (!originalTransactionId) return null;
  const list = await readAll();
  const hit = list.find(e => e.originalTransactionId === originalTransactionId);
  return hit || null;
}

// Drop every entry for a given originalTransactionId. Used by the
// self-heal path below when the server confirms the alleged owner no
// longer exists (account was deleted) or no longer owns the txn.
export async function removeByOriginalTxn(originalTransactionId: string): Promise<void> {
  if (!originalTransactionId) return;
  const list = await readAll();
  const next = list.filter(e => e.originalTransactionId !== originalTransactionId);
  if (next.length !== list.length) {
    await writeAll(next);
  }
}

// Nuclear: wipe every entry. Currently unused by the UI but exposed so
// support / debug code can reset an iPhone's device-history without an
// app uninstall. Cheap to keep around.
export async function clearAllHistory(): Promise<void> {
  await writeAll([]);
}

// Asks the server whether `allegedUserId` still owns
// `originalTransactionId`. Returns:
//   - `null` on network/server error → caller should KEEP the entry
//     (fail-safe: don't let outages bypass first-writer-wins)
//   - `{ stillValid: false }` → entry is a ghost; caller should prune
//   - `{ stillValid: true, ... }` → entry is real
async function verifyEntryWithServer(
  originalTransactionId: string,
  allegedUserId: string,
): Promise<{ stillValid: boolean; currentOwnerUserId?: string; currentOwnerMaskedEmail?: string } | null> {
  try {
    const resp = await fetch("/api/iap/check-device-history-entry", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalTransactionId, allegedUserId }),
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    if (!data || typeof data.stillValid !== "boolean") return null;
    return data;
  } catch {
    return null;
  }
}

// Returns the FIRST history entry whose originalTransactionId appears
// in `appleOriginalTxnIds` AND is bound to a different FusePhone user
// than `currentUserId`. Used by the paywall pre-purchase check.
//
// Self-heal: before returning a hit, we round-trip the server to confirm
// the alleged owner still exists and still owns that originalTxn. If
// not, we prune the local ghost entry silently and continue. This stops
// stale device entries (left behind after an account deletion) from
// blocking legitimate purchases on the same iPhone forever.
export async function findConflictingOwner(
  appleOriginalTxnIds: string[],
  currentUserId: string,
): Promise<DeviceIapHistoryEntry | null> {
  if (!currentUserId || appleOriginalTxnIds.length === 0) return null;
  const list = await readAll();
  for (const otxn of appleOriginalTxnIds) {
    const hit = list.find(e => e.originalTransactionId === otxn && e.userId !== currentUserId);
    if (!hit) continue;
    const verdict = await verifyEntryWithServer(hit.originalTransactionId, hit.userId);
    if (verdict && verdict.stillValid === false) {
      // Ghost entry — prune and skip to the next candidate.
      await removeByOriginalTxn(hit.originalTransactionId);
      continue;
    }
    // Either the server confirmed the entry is still valid, OR the network
    // call failed (verdict === null) — in both cases we treat the entry
    // as a real conflict and surface it to the paywall.
    return hit;
  }
  return null;
}
