import { QueryClient, QueryFunction, focusManager } from "@tanstack/react-query";

function isCapacitorNative(): boolean {
  if ((window as any).__CAPACITOR_NATIVE) return true;
  const Cap = (window as any).Capacitor;
  return !!(Cap?.isNativePlatform?.() || Cap?.isNative);
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

let _nativeAuthModule: typeof import("./native-auth") | null = null;

async function loadNativeAuth() {
  if (_nativeAuthModule) return _nativeAuthModule;
  _nativeAuthModule = await import("./native-auth");
  return _nativeAuthModule;
}

export async function getNativeHeaders(): Promise<Record<string, string>> {
  if (!isCapacitorNative()) return {};
  try {
    const { getAccessToken } = await loadNativeAuth();
    const token = await getAccessToken();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {}
  return {};
}

async function handleNative401(res: Response, retryFn: () => Promise<Response>): Promise<Response> {
  if (res.status !== 401 || !isCapacitorNative()) return res;
  return withTimeout(
    (async () => {
      try {
        const { refreshAccessToken } = await import("./native-auth");
        const newToken = await refreshAccessToken();
        if (newToken) {
          return retryFn();
        }
      } catch {}
      return res;
    })(),
    3000,
    res
  );
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const nativeHeaders = await getNativeHeaders();
  const makeHeaders = (hdrs: Record<string, string>) => ({ ...(init?.headers || {}), ...hdrs });

  let res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: makeHeaders(nativeHeaders),
  });

  res = await handleNative401(res, async () => {
    const refreshedHeaders = await getNativeHeaders();
    return fetch(url, {
      ...init,
      credentials: "include",
      headers: makeHeaders(refreshedHeaders),
    });
  });
  return res;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const nativeHeaders = await getNativeHeaders();
  const headers: Record<string, string> = {
    ...nativeHeaders,
    ...(data ? { "Content-Type": "application/json" } : {}),
  };

  const doFetch = async () =>
    fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

  let res = await doFetch();
  res = await handleNative401(res, async () => {
    const refreshedHeaders = await getNativeHeaders();
    Object.assign(headers, refreshedHeaders);
    return doFetch();
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const nativeHeaders = await getNativeHeaders();

    const doFetch = async () =>
      fetch(queryKey.join("/") as string, {
        credentials: "include",
        headers: nativeHeaders,
      });

    let res = await doFetch();

    if (res.status === 401 && isCapacitorNative()) {
      res = await handleNative401(res, async () => {
        const refreshedHeaders = await getNativeHeaders();
        return fetch(queryKey.join("/") as string, {
          credentials: "include",
          headers: refreshedHeaders,
        });
      });
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message || '';
    const lower = msg.toLowerCase();
    return msg.startsWith('429') ||
      msg.startsWith('401') ||
      lower.includes('rate limit') ||
      lower.includes('rate exceeded') ||
      lower.includes('too many requests') ||
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('Load failed') ||
      msg.includes('Network request failed');
  }
  return false;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 5000,
      gcTime: ONE_DAY_MS,
      networkMode: 'always',
      retry: (failureCount, error) => {
        if (isRetryableError(error) && failureCount < 3) return true;
        return false;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 15000),
    },
    mutations: {
      networkMode: 'always',
      retry: (failureCount, error) => {
        if (failureCount >= 3) return false;
        if (error instanceof Error) {
          const msg = error.message || '';
          const lower = msg.toLowerCase();
          if (msg.startsWith('429') || lower.includes('rate limit') || lower.includes('rate exceeded') ||
              msg.includes('Failed to fetch') || msg.includes('Load failed') ||
              msg.includes('NetworkError') || msg.includes('Network request failed') ||
              msg.includes('timed out')) {
            return true;
          }
        }
        return false;
      },
      retryDelay: (attemptIndex) => Math.min(2000 * 2 ** attemptIndex, 10000),
    },
  },
});

if (isCapacitorNative()) {
  import("@capacitor/app").then(({ App: CapApp }) => {
    CapApp.addListener("appStateChange", ({ isActive }) => {
      focusManager.setFocused(isActive);
      if (isActive) {
        import("./realtime").then(({ forceRefreshOnResume }) => {
          forceRefreshOnResume();
        }).catch(() => {});
        // Bulletproof IAP recovery: when the app comes back to the
        // foreground (e.g. after being suspended during Apple's purchase
        // sheet, or when the user returns from iOS Settings), drain any
        // transactions Swift persisted that JS hasn't synced yet.
        import("./iap").then(({ drainPendingPurchases }) => {
          void drainPendingPurchases("app-resume");
        }).catch(() => {});
      }
    });
  }).catch(() => {});
}
