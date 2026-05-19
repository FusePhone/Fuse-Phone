import { get, set, del, createStore } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const PERSIST_ALLOWLIST = [
  "/api/auth/user",
  "/api/subscription",
  "/api/user/capabilities",
  "/api/my-jobs",
  "/api/my-calendar",
  "/api/communications",
  "/api/notifications",
  "/api/metrics",
  "/api/ai-actions",
  "/api/booking-requests",
  "/api/dismissed-attention",
  "/api/appointments",
  "/api/payments",
  "/api/calls",
  "/api/contacts",
  "/api/projects",
  "/api/documents",
  "/api/dashboard",
  "/api/settings",
  "/api/surfaces",
  "/api/materials",
  "/api/team-members",
  "/api/team/channels",
  "/api/scheduled-messages",
  "/api/financial-settings",
  "/api/crew-groups",
  "/api/ai-drafts",
  "/api/payroll",
  "/api/time-entries",
  "/api/work-order-settings",
  "/api/templates",
  "/api/overhead-expenses",
];

function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  const key = String(queryKey[0] || "");
  return PERSIST_ALLOWLIST.some((prefix) => key.startsWith(prefix));
}

// Returns true for cache keys that store an array of message rows
// (each row uniquely identified by a numeric `id`). Used by the
// restore-merge logic so cold-launch seeds don't wipe persisted
// history. Conversation lists / single-row caches are NOT merged
// here — they're handled by the existing `if (!existing)` branch
// because their shape varies and they're cheap to refetch.
function isMergeableThreadKey(queryKey: readonly unknown[]): boolean {
  if (!Array.isArray(queryKey) || queryKey.length < 2) return false;
  const head = String(queryKey[0] || "");
  return (
    (head === "/api/communications" && queryKey.length === 2) ||
    head === "/api/communications/by-phone" ||
    head === "/api/communications/project-thread"
  );
}

// Merge two message arrays, deduping by `id`. The `current` rows win
// over `persisted` rows when ids collide so any in-flight WebSocket
// upserts, optimistic writes, or seeded synthetics keep their newer
// state. Output is sorted ascending by timestamp to match the order
// the thread fetcher returns.
function mergeThreadArrays(persisted: any[], current: any[]): any[] {
  const map = new Map<any, any>();
  for (const m of persisted) {
    if (m && m.id !== undefined && m.id !== null) map.set(m.id, m);
  }
  for (const m of current) {
    if (m && m.id !== undefined && m.id !== null) map.set(m.id, m);
  }
  return [...map.values()].sort((a: any, b: any) => {
    const ta = new Date(a?.timestamp || a?.createdAt || 0).getTime();
    const tb = new Date(b?.timestamp || b?.createdAt || 0).getTime();
    return ta - tb;
  });
}

function getStoreKey(userId?: string): string {
  return userId ? `fuse-query-cache:${userId}` : "fuse-query-cache:anonymous";
}

const idbStore = createStore("fuse-query-db", "query-cache");

let _currentUserId: string | undefined;
let _persister: Persister | null = null;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingClient: PersistedClient | null = null;
const DEBOUNCE_MS = 2000;

// Tracks the userId for which cache restoration via switchPersisterUser has
// fully completed. Push-tap navigation reads this to avoid mounting Messages
// (or other data-heavy pages) before the user's persisted query cache has
// been restored — which used to cause "empty thread + blank header" on cold
// launch from a notification because queries fired against an empty cache
// before any prior thread data was hydrated.
let _cacheReadyForUserId: string | null = null;
export function isCacheReadyForUser(userId: string | undefined | null): boolean {
  return !!userId && _cacheReadyForUserId === userId;
}

async function _flushPersist() {
  const client = _pendingClient;
  _pendingClient = null;
  if (!client) return;

  const activeKey = getStoreKey(_currentUserId);
  let filteredQueries = client.clientState.queries.filter((q) =>
    shouldPersistQuery(q.queryKey)
  );
  if (!_currentUserId) {
    filteredQueries = filteredQueries.filter(
      (q) => String(q.queryKey[0]) === '/api/auth/user'
    );
  }
  const filtered: PersistedClient = {
    ...client,
    clientState: {
      ...client.clientState,
      queries: filteredQueries,
      mutations: [],
    },
  };
  console.log('[PERSIST] Saving', filtered.clientState.queries.length, 'queries to', activeKey);
  await set(activeKey, filtered, idbStore);
}

export function createIDBPersister(userId?: string): Persister {
  _currentUserId = userId;
  const key = getStoreKey(userId);
  console.log('[PERSIST] Creating IDB persister with key:', key);

  _persister = {
    persistClient: async (client: PersistedClient) => {
      _pendingClient = client;
      if (_debounceTimer) clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => {
        _debounceTimer = null;
        _flushPersist();
      }, DEBOUNCE_MS);
    },
    restoreClient: async () => {
      const activeKey = getStoreKey(_currentUserId);
      console.log('[PERSIST] Restoring cache from IDB key:', activeKey);
      const start = Date.now();
      const data = await get<PersistedClient>(activeKey, idbStore);
      const elapsed = Date.now() - start;
      if (data) {
        if (!_currentUserId) {
          data.clientState.queries = data.clientState.queries.filter(
            (q) => String(q.queryKey[0]) === '/api/auth/user'
          );
          console.log('[PERSIST] Anonymous restore — stripped non-auth queries to prevent stale data');
        }
        // Preserve the original `dataUpdatedAt` from when each query was
        // last persisted so per-query `staleTime` is honored on cold-launch.
        // Previously this was force-reset to 0, marking every restored
        // query as immediately stale — which triggered a full refetch of
        // everything on app boot and caused the messages "blink" right
        // after old messages appeared from cache.
        console.log('[PERSIST] Restored', data.clientState.queries.length, 'queries in', elapsed + 'ms (timestamps preserved)');
      } else {
        console.log('[PERSIST] No cached data found in IDB (took', elapsed + 'ms)');
      }
      return data ?? undefined;
    },
    removeClient: async () => {
      const activeKey = getStoreKey(_currentUserId);
      console.log('[PERSIST] Removing cache from IDB key:', activeKey);
      await del(activeKey, idbStore);
    },
  };

  return _persister;
}

export async function switchPersisterUser(userId: string, queryClient: any, buster: string): Promise<void> {
  if (_currentUserId === userId) {
    // Same user — cache was already restored on a prior call. Mark ready
    // (idempotent) so push-tap navigation gating sees us as ready.
    _cacheReadyForUserId = userId;
    return;
  }

  // Reset ready flag during the switch — push-tap navigation should hold
  // until restore + invalidate complete for the new user.
  _cacheReadyForUserId = null;

  const oldUserId = _currentUserId;
  _currentUserId = userId;
  const newKey = getStoreKey(userId);
  console.log('[PERSIST] Switching persister from', getStoreKey(oldUserId), 'to', newKey);

  // Wrap the whole restore+invalidate sequence in try/finally so the
  // ready flag is ALWAYS set before we return, even on an unexpected
  // throw from setQueryData / invalidateQueries / consumer code. Without
  // this, push-tap navigation would defer indefinitely (until the 4s
  // fail-open in App.tsx kicks in) on any error — degrading UX.
  try {
    if (oldUserId && oldUserId !== userId) {
      console.log('[PERSIST] User changed — purging all in-memory queries from previous user');
      try {
        queryClient.removeQueries({
          predicate: (query: any) => String(query.queryKey[0]) !== '/api/auth/user',
        });
      } catch (e) {
        console.warn('[PERSIST] removeQueries failed during user switch:', e);
      }
    }

    let data: PersistedClient | undefined;
    try {
      data = await get<PersistedClient>(newKey, idbStore);
    } catch (e) {
      console.log('[PERSIST] IDB read failed, continuing without cache:', e);
    }

    if (data && data.buster === buster) {
      const queryKeys = data.clientState.queries.map((q: any) => String(q.queryKey[0]));
      console.log('[PERSIST] Restoring user cache:', queryKeys.length, 'queries for', userId);
      for (const query of data.clientState.queries) {
        try {
          const existing = queryClient.getQueryData(query.queryKey);
          const persisted = query.state.data;
          // For message THREAD caches (arrays of messages keyed by
          // contactId / phone / projectId), MERGE the persisted history
          // with whatever the in-memory cache already has, deduping by
          // message id. Without this, a cold-launch from a push
          // notification races: the native-push-tap handler seeds the
          // thread cache with a single synthetic bubble BEFORE this
          // restore runs, then the old `if (!existing)` branch saw the
          // synthetic and skipped restore — losing the entire prior
          // history. The user would see "1 message" until a server
          // refetch landed (and worse, the 2s debounced persister
          // write-back would save the corrupted single-message cache
          // back to IDB).
          if (Array.isArray(existing) && Array.isArray(persisted) && isMergeableThreadKey(query.queryKey)) {
            queryClient.setQueryData(query.queryKey, mergeThreadArrays(persisted, existing));
          } else if (!existing) {
            queryClient.setQueryData(query.queryKey, persisted);
          }
        } catch (e) {
          console.warn('[PERSIST] setQueryData failed for key', query.queryKey, e);
        }
      }
    } else {
      console.log('[PERSIST] No existing cache for user', userId, data ? '(buster mismatch)' : '(no data)');
    }

    try {
      queryClient.invalidateQueries({
        predicate: (query: any) => String(query.queryKey[0]) !== '/api/auth/user',
      });
      console.log('[PERSIST] Invalidated non-auth queries to force fresh fetch for new user');
    } catch (e) {
      console.warn('[PERSIST] invalidateQueries failed during user switch:', e);
    }
  } finally {
    // Cache restore is done (or failed). Either way, push-tap navigation
    // can safely proceed — fresh fetches will run as queries mount and
    // we'd rather show a loading spinner than block the user forever.
    _cacheReadyForUserId = userId;
  }
}

export async function clearPersistedCache(userId?: string): Promise<void> {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
  _pendingClient = null;
  const key = getStoreKey(userId);
  console.log('[PERSIST] Clearing persisted cache for key:', key);
  await del(key, idbStore);
}

export function resetPersisterToAnonymous(): void {
  _currentUserId = undefined;
  console.log('[PERSIST] Reset persister to anonymous');
}
