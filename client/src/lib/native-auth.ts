const ACCESS_TOKEN_KEY = "fusephone_access_token";
const REFRESH_TOKEN_KEY = "fusephone_refresh_token";

let _cachedAccessToken: string | null = null;

function isCapacitorNative(): boolean {
  if ((window as any).__CAPACITOR_NATIVE) return true;
  const Cap = (window as any).Capacitor;
  return !!(Cap?.isNativePlatform?.() || Cap?.isNative);
}

let _prefsModule: any = null;
let _prefsLoading: Promise<any> | null = null;

async function getPreferences() {
  if (!isCapacitorNative()) return null;
  if (_prefsModule) return _prefsModule;
  if (_prefsLoading) return _prefsLoading;
  _prefsLoading = (async () => {
    try {
      const result = await Promise.race([
        import("@capacitor/preferences").then(m => ({ p: m.Preferences })),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      _prefsModule = result?.p ?? null;
      return _prefsModule;
    } catch {
      return null;
    } finally {
      _prefsLoading = null;
    }
  })();
  return _prefsLoading;
}

export async function storeTokens(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  _cachedAccessToken = accessToken;
  const prefs = await getPreferences();
  if (prefs) {
    await prefs.set({ key: ACCESS_TOKEN_KEY, value: accessToken });
    await prefs.set({ key: REFRESH_TOKEN_KEY, value: refreshToken });
  } else {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (_cachedAccessToken) return _cachedAccessToken;
  const prefs = await getPreferences();
  if (prefs) {
    const result = await prefs.get({ key: ACCESS_TOKEN_KEY });
    _cachedAccessToken = result.value;
    return result.value;
  }
  const val = localStorage.getItem(ACCESS_TOKEN_KEY);
  _cachedAccessToken = val;
  return val;
}

export async function getRefreshToken(): Promise<string | null> {
  const prefs = await getPreferences();
  if (prefs) {
    const result = await prefs.get({ key: REFRESH_TOKEN_KEY });
    return result.value;
  }
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function clearTokens(): Promise<void> {
  _cachedAccessToken = null;
  const prefs = await getPreferences();
  if (prefs) {
    await prefs.remove({ key: ACCESS_TOKEN_KEY });
    await prefs.remove({ key: REFRESH_TOKEN_KEY });
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const rt = await getRefreshToken();
      if (!rt) return null;

      const res = await fetch("/api/auth/native/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });

      if (!res.ok) {
        await clearTokens();
        return null;
      }

      const data = await res.json();
      if (data.success && data.accessToken) {
        _cachedAccessToken = data.accessToken;
        const prefs = await getPreferences();
        if (prefs) {
          await prefs.set({ key: ACCESS_TOKEN_KEY, value: data.accessToken });
        } else {
          localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
        }
        return data.accessToken;
      }

      await clearTokens();
      return null;
    } catch {
      await clearTokens();
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function isNativeLoggedIn(): Promise<boolean> {
  const rt = await getRefreshToken();
  return !!rt;
}

export async function nativeLogout(): Promise<void> {
  try {
    const rt = await getRefreshToken();
    if (rt) {
      await fetch("/api/auth/native/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
    }
  } catch {
    // Ignore logout errors
  }
  await clearTokens();
}

export async function nativeFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let accessToken = await getAccessToken();

  const makeRequest = (token: string | null) => {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(url, { ...options, headers, credentials: "include" });
  };

  let res = await makeRequest(accessToken);

  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await makeRequest(newToken);
    }
  }

  return res;
}
