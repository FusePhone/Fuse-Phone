import { useEffect, RefObject } from "react";

/**
 * Keeps the focused input/textarea/select visible above the on-screen keyboard.
 *
 * Single-pass design: the keyboard animation fires many viewport-resize
 * events, and stacking a `scrollIntoView({behavior:'smooth'})` on each one
 * produced the visible "phases" the user reported (3-4 step jumps before
 * the field landed). We instead schedule ONE scroll per focus, then debounce
 * any viewport-driven re-scroll into a single trailing call after the
 * keyboard settles.
 */
export function useScrollFocusedIntoView(
  scrollRef: RefObject<HTMLElement | null>,
  // kept for backward compatibility — currently unused; scrollIntoView handles
  // padding via `block: 'center'`.
  _getExtraPadding?: (el: HTMLElement) => number,
) {
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const FIELD_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

    const markFields = () => {
      container.querySelectorAll(FIELD_SELECTOR).forEach((f) => {
        if (!f.hasAttribute('data-no-autoscroll')) {
          f.setAttribute('data-no-autoscroll', 'true');
        }
      });
    };
    markFields();
    const mo = new MutationObserver(markFields);
    mo.observe(container, { childList: true, subtree: true });

    let activeEl: HTMLElement | null = null;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    let didInitialScroll = false;

    const scrollNow = () => {
      const el = activeEl;
      if (!el || !document.body.contains(el)) return;
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {
        try { el.scrollIntoView(); } catch {}
      }
    };

    const scheduleScroll = (delay: number) => {
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        scrollNow();
      }, delay);
    };

    const onFocusIn = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el || !el.matches?.(FIELD_SELECTOR)) return;
      activeEl = el;
      didInitialScroll = false;
      // One scroll after the typical iOS soft-keyboard open animation
      // (~300ms). Viewport listeners below will replace this if the
      // keyboard actually fires resize events first.
      scheduleScroll(320);
    };

    const onFocusOut = (e: Event) => {
      if (e.target === activeEl) {
        activeEl = null;
        if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
      }
    };

    const onViewportChange = () => {
      if (!activeEl) return;
      // Debounced single trailing scroll: regardless of how many resize
      // events fire during the keyboard animation, we only run one
      // scrollIntoView once it stops changing.
      scheduleScroll(didInitialScroll ? 120 : 80);
      didInitialScroll = true;
    };

    container.addEventListener('focusin', onFocusIn);
    container.addEventListener('focusout', onFocusOut);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onViewportChange);
    vv?.addEventListener('scroll', onViewportChange);

    // Capacitor native (iOS / Android): WKWebView doesn't shrink for the
    // keyboard, so visualViewport never fires. Use the plugin's own
    // settled event (`keyboardDidShow`) for a single scroll.
    let capacitorDidShowL: { remove?: () => void } | undefined;
    let cancelled = false;
    (async () => {
      try {
        const isNative =
          (window as any).Capacitor?.isNativePlatform?.() === true;
        if (!isNative) return;
        const { Keyboard } = await import('@capacitor/keyboard');
        if (cancelled) return;
        capacitorDidShowL = await Keyboard.addListener('keyboardDidShow', () => {
          if (activeEl) scheduleScroll(40);
        });
      } catch {
        /* not in Capacitor or plugin unavailable — that's fine */
      }
    })();

    return () => {
      cancelled = true;
      if (pendingTimer) clearTimeout(pendingTimer);
      container.removeEventListener('focusin', onFocusIn);
      container.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', onViewportChange);
      vv?.removeEventListener('scroll', onViewportChange);
      capacitorDidShowL?.remove?.();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef]);
}
