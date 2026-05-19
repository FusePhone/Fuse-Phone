import { useState, useEffect } from "react";

function isCapacitorNative(): boolean {
  if ((window as any).__CAPACITOR_NATIVE) return true;
  if (document.documentElement.classList.contains('capacitor-native')) return true;
  const Cap = (window as any).Capacitor;
  return !!(Cap?.isNativePlatform?.() || Cap?.isNative);
}

export function useIsIOSApp(): boolean {
  const [isIOSApp, setIsIOSApp] = useState(false);

  useEffect(() => {
    if (isCapacitorNative()) {
      setIsIOSApp(true);
      return;
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone =
      ("standalone" in window.navigator && (window.navigator as any).standalone === true) ||
      window.matchMedia("(display-mode: standalone)").matches;

    setIsIOSApp(isIOS && isStandalone);
  }, []);

  return isIOSApp;

}

export function useIsNativeApp(): boolean {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(isCapacitorNative());
  }, []);

  return isNative;
}
