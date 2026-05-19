import { useState, useEffect, useRef } from "react";

export function useKeyboardOffset(active: boolean) {
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const lastValueRef = useRef(0);

  useEffect(() => {
    if (!active) {
      lastValueRef.current = 0;
      setKeyboardOffset(0);
      return;
    }
    const vv = window.visualViewport;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // The soft keyboard animation fires `resize` many times per frame as it
    // slides up. If we setState on each one the consumer (popover/dialog)
    // re-renders + re-transitions on every step, producing the visible
    // "phases" the user reported. Debounce so the consumer only sees the
    // final, stable height in a single update.
    const commit = (kbHeight: number) => {
      const next = kbHeight > 50 ? kbHeight : 0;
      if (next === lastValueRef.current) return;
      lastValueRef.current = next;
      setKeyboardOffset(next);
    };

    const measure = () => {
      const winH = window.innerHeight;
      const vvH = vv ? vv.height : winH;
      const offsetTop = vv ? vv.offsetTop : 0;
      const visibleH = Math.min(winH, vvH);
      return Math.max(0, winH - visibleH - offsetTop);
    };

    const onChange = () => {
      const kb = measure();
      // Open events: commit on the leading edge so the panel snaps into
      // place immediately. Close (kb -> 0) we also commit immediately.
      if (kb > 50 && lastValueRef.current === 0) {
        commit(kb);
        return;
      }
      if (kb <= 50 && lastValueRef.current > 0) {
        if (debounceTimer) clearTimeout(debounceTimer);
        commit(0);
        return;
      }
      // Mid-animation height changes — collapse into a single trailing
      // update so the panel doesn't re-position on every resize tick.
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => commit(measure()), 90);
    };

    onChange();
    vv?.addEventListener('resize', onChange);
    vv?.addEventListener('scroll', onChange);
    window.addEventListener('resize', onChange);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      vv?.removeEventListener('resize', onChange);
      vv?.removeEventListener('scroll', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, [active]);

  return { keyboardOffset };
}

export function getKeyboardAwareStyles(keyboardOffset: number): React.CSSProperties {
  if (keyboardOffset > 0) {
    return {
      top: 'auto',
      bottom: `${keyboardOffset}px`,
      transform: 'translateX(-50%)',
      maxHeight: `calc(100dvh - ${keyboardOffset}px - 1rem)`,
      // No CSS transition: keyboard offset is already debounced to a single
      // settled value, so we want the panel to snap there in one move
      // instead of animating on top of the keyboard's own animation.
    };
  }
  return {
    maxHeight: 'calc(100dvh - 2rem)',
  };
}
