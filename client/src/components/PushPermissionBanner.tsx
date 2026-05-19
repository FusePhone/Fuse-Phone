import { useEffect, useState } from "react";
import { BellOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "push-permission-banner-dismissed-at";
const DISMISS_HOURS = 24;

export function PushPermissionBanner() {
  const [denied, setDenied] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    const isNative =
      (window as any).Capacitor?.isNativePlatform?.() === true ||
      (window as any).__CAPACITOR_NATIVE === true;
    if (!isNative) return;

    const checkInitial = () => {
      const state = (window as any).__pushPermissionState;
      if (state && state !== "granted" && state !== "unknown") {
        setDenied(true);
      }
    };
    checkInitial();
    const t = setTimeout(checkInitial, 5000);

    const onDenied = () => setDenied(true);
    window.addEventListener("native-push-permission-denied", onDenied);

    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw) {
        const ts = parseInt(raw, 10);
        if (!Number.isNaN(ts) && Date.now() - ts < DISMISS_HOURS * 3600 * 1000) {
          setDismissed(true);
        }
      }
    } catch {}

    return () => {
      clearTimeout(t);
      window.removeEventListener("native-push-permission-denied", onDenied);
    };
  }, []);

  if (!denied || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 px-3 pt-[env(safe-area-inset-top)]"
      data-testid="banner-push-permission-denied"
    >
      <div className="mx-auto max-w-screen-md mt-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-700 px-3 py-2 shadow-md flex items-start gap-2">
        <BellOff className="w-4 h-4 mt-0.5 text-amber-700 dark:text-amber-300 shrink-0" />
        <div className="flex-1 text-xs text-amber-900 dark:text-amber-100 leading-snug">
          <div className="font-semibold">Push notifications are off</div>
          <div>
            You won&apos;t hear new messages or missed calls when the app is in the background.
            Open <span className="font-semibold">Settings → Notifications → Fuse Phone</span> on your device to turn them on.
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900"
          onClick={handleDismiss}
          aria-label="Dismiss"
          data-testid="button-dismiss-push-banner"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
