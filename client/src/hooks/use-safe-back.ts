import { useCallback } from "react";
import { useLocation } from "wouter";

/**
 * Safe back-button navigation.
 *
 * `window.history.back()` is unreliable in this app because:
 *   1. The WebView's history may include the auth flow, OAuth redirects,
 *      or pre-bundle URLs that are no longer valid routes — back() goes
 *      somewhere that 404s.
 *   2. When the user arrives via a deep link / push notification,
 *      /documents/N may be the FIRST history entry — back() leaves the app.
 *   3. `window.history.length > 1` returns true even for those bad entries,
 *      so the common `if (history.length > 1) back(); else navigate(...)`
 *      pattern never falls back when it should.
 *
 * This hook tracks how many *in-app* (wouter) navigations have happened in
 * the current session via a global counter set in App.tsx. If the user has
 * navigated at least once inside the app, back() is safe and pops to the
 * previous in-app page. Otherwise (cold launch / deep link / refresh), the
 * provided fallback route is used so the user never lands on a 404.
 *
 * Pass a deterministic parent route as the fallback — e.g. `/projects` for
 * a project detail page, `/settings` for a settings sub-page.
 */
export function useSafeBack(fallback: string) {
  const [, setLocation] = useLocation();
  return useCallback(() => {
    const inAppNavCount = (window as any).__appNavCount || 0;
    if (inAppNavCount > 1) {
      window.history.back();
    } else {
      setLocation(fallback);
    }
  }, [fallback, setLocation]);
}
