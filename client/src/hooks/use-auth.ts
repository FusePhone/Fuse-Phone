import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import type { User } from "@shared/models/auth";

// Global "logout in progress" signal. We need this to live OUTSIDE any React
// component because logout() unmounts most of the tree (Sidebar → AuthPage),
// so a per-component mutation.isPending boolean disappears the moment the
// click handler fires. The full-screen overlay subscribes to this signal
// from a stable mount point (App root).
let _isLoggingOut = false;
const _logoutSubs = new Set<(v: boolean) => void>();
function setIsLoggingOut(v: boolean) {
  if (_isLoggingOut === v) return;
  _isLoggingOut = v;
  _logoutSubs.forEach((cb) => { try { cb(v); } catch {} });
}

export function useIsLoggingOut(): boolean {
  const [v, setV] = useState<boolean>(_isLoggingOut);
  useEffect(() => {
    const cb = (next: boolean) => setV(next);
    _logoutSubs.add(cb);
    // Re-sync in case the signal changed between mount and effect.
    setV(_isLoggingOut);
    return () => { _logoutSubs.delete(cb); };
  }, []);
  return v;
}

function isCapacitorNative(): boolean {
  if ((window as any).__CAPACITOR_NATIVE) return true;
  const Cap = (window as any).Capacitor;
  return !!(Cap?.isNativePlatform?.() || Cap?.isNative);
}

let _loggedOut = false;

async function fetchUser(): Promise<User | null> {
  if (_loggedOut) return null;

  const isNative = isCapacitorNative();
  const headers: Record<string, string> = {};

  if (isNative) {
    try {
      const { getAccessToken, getRefreshToken } = await import("@/lib/native-auth");
      // In native, the ONLY valid auth is a refresh token. If it's gone,
      // bail immediately — never fall back to cookies (which can resurrect
      // an old session and cause "auto-login as the previous user" bugs).
      const rt = await getRefreshToken();
      if (!rt) return null;
      const token = await getAccessToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {}
  }

  let response = await fetch("/api/auth/user", {
    credentials: "include",
    headers,
  });

  if (response.status === 401 && isNative && headers["Authorization"]) {
    try {
      const { refreshAccessToken } = await import("@/lib/native-auth");
      const newToken = await refreshAccessToken();
      if (newToken) {
        response = await fetch("/api/auth/user", {
          credentials: "include",
          headers: { Authorization: `Bearer ${newToken}` },
        });
      }
    } catch {}
  }

  if (_loggedOut) return null;

  if (response.status === 401) return null;

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

let _logoutGeneration = 0;

export async function logout(): Promise<void> {
  _loggedOut = true;
  // Raise the overlay BEFORE any awaits so the user sees feedback within the
  // same frame as their tap. We clear it after the redirect settles below.
  setIsLoggingOut(true);
  const gen = ++_logoutGeneration;

  const currentUser = queryClient.getQueryData(["/api/auth/user"]) as any;
  const userId = currentUser?.id;
  const isNative = isCapacitorNative();

  // STEP 1 (CRITICAL): Capture access token for the unregister call BEFORE we
  // clear tokens, then clear native tokens AND revoke server-side refresh
  // token *synchronously* before doing anything else. If the OS kills the
  // app mid-logout, we MUST have already wiped the credentials so the next
  // launch doesn't auto-login as the previous user.
  let savedAccessToken: string | null = null;
  if (isNative) {
    try {
      const { getAccessToken, clearTokens, nativeLogout } = await import("@/lib/native-auth");
      savedAccessToken = await getAccessToken();
      // nativeLogout: revokes refresh token server-side AND clears local tokens.
      // We await it so by the time logout() returns, credentials are truly gone.
      await nativeLogout();
      await clearTokens();
    } catch {}
  }

  // STEP 2: Tear down in-memory state.
  try {
    const { disconnectRealtime } = await import("@/lib/realtime");
    disconnectRealtime();
  } catch {}

  queryClient.cancelQueries();
  queryClient.setQueryData(["/api/auth/user"], null);
  queryClient.removeQueries();

  // STEP 3: Best-effort device-push unregister + web session cookie clear.
  const deviceToken = (window as any).__nativeDeviceToken;
  const unregisterHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (savedAccessToken) {
    unregisterHeaders["Authorization"] = `Bearer ${savedAccessToken}`;
  }
  if (deviceToken) {
    try {
      await fetch("/api/push/unregister-device", {
        method: "POST",
        headers: unregisterHeaders,
        credentials: "include",
        body: JSON.stringify({ token: deviceToken }),
      });
    } catch {}
  }

  fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  }).catch(() => {});

  try {
    const { clearPersistedCache, resetPersisterToAnonymous } = await import("@/lib/query-persister");
    if (userId) await clearPersistedCache(userId);
    await clearPersistedCache();
    resetPersisterToAnonymous();
  } catch {}

  if (_logoutGeneration !== gen || !_loggedOut) {
    return;
  }

  if (window.location.pathname !== '/') {
    try {
      window.history.replaceState(null, '', '/');
    } catch {}
  }

  // Hold the overlay one extra paint cycle so the AuthPage / NativeLoginPage
  // is fully painted underneath before we drop it — otherwise the user sees
  // a flicker between "Signing out" and the login screen.
  setTimeout(() => setIsLoggingOut(false), 350);
}

export function clearLogoutFlag() {
  _loggedOut = false;
  _logoutGeneration++;
  // If a previous logout's deferred timeout hasn't fired yet, drop the
  // overlay now — otherwise a fast re-login can leave it visible or cause
  // a flicker when the stale timeout finally lands.
  setIsLoggingOut(false);
}

export function useAuth() {
  const qc = useQueryClient();
  const { data: user, isPending } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 30,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      qc.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    isLoading: isPending,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
