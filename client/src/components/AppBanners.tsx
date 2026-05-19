import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, Download, Share, X, Smartphone, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotificationContext } from "@/hooks/use-notification-context";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isNativeApp(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform?.() || !!(window as any).Capacitor?.isNative;
}

function isStandalone(): boolean {
  return (
    isNativeApp() ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true ||
    document.referrer.includes("android-app://")
  );
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isMobile(): boolean {
  return isIOS() || /Android/i.test(navigator.userAgent) || /mobile/i.test(navigator.userAgent);
}

const DISMISS_KEYS = {
  notification: "banner_dismissed_notification",
  install: "banner_dismissed_install",
  homescreen: "banner_dismissed_homescreen",
};

function NotificationBanner() {
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(DISMISS_KEYS.notification) === "true"
  );
  const { notificationsEnabled, toggleNotifications } = useNotificationContext();

  if (dismissed || notificationsEnabled) return null;

  const hasNotificationSupport = "Notification" in window;
  if (!hasNotificationSupport) return null;

  const permission = Notification.permission;
  if (permission === "denied") return null;

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-md p-3 flex items-start gap-3" data-testid="banner-notification">
      <Bell className="w-5 h-5 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Enable Notifications</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Get instant alerts for new messages, signed proposals, and payments.
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          onClick={async () => {
            await toggleNotifications();
          }}
          data-testid="button-enable-notifications"
        >
          Enable
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            setDismissed(true);
            localStorage.setItem(DISMISS_KEYS.notification, "true");
          }}
          data-testid="button-dismiss-notification-banner"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function InstallBanner() {
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(DISMISS_KEYS.install) === "true"
  );
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const promptHandler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const installedHandler = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", promptHandler);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", promptHandler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  if (dismissed || installed || isStandalone() || !installPrompt) return null;

  return (
    <div className="bg-green-500/10 border border-green-500/20 rounded-md p-3 flex items-start gap-3" data-testid="banner-install-pwa">
      <Download className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Install Fuse Phone</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Add to your home screen for quick access, push notifications, and a full-screen experience.
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          onClick={async () => {
            await installPrompt.prompt();
            const { outcome } = await installPrompt.userChoice;
            if (outcome === "accepted") {
              setInstalled(true);
            }
            setInstallPrompt(null);
          }}
          data-testid="button-install-pwa"
        >
          Install
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            setDismissed(true);
            localStorage.setItem(DISMISS_KEYS.install, "true");
          }}
          data-testid="button-dismiss-install-banner"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function AddToHomescreenBanner() {
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(DISMISS_KEYS.homescreen) === "true"
  );
  const [expanded, setExpanded] = useState(false);

  if (dismissed || isStandalone() || !isMobile() || !isIOS()) return null;

  return (
    <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-3" data-testid="banner-homescreen">
      <div className="flex items-start gap-3">
        <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Add to Home Screen</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get the full app experience with quick launch and push notifications.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setExpanded(!expanded)}
            data-testid="button-show-homescreen-instructions"
          >
            {expanded ? "Hide" : "How"}
            {expanded ? (
              <ChevronUp className="w-3 h-3 ml-1" />
            ) : (
              <ChevronDown className="w-3 h-3 ml-1" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setDismissed(true);
              localStorage.setItem(DISMISS_KEYS.homescreen, "true");
            }}
            data-testid="button-dismiss-homescreen-banner"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pl-8 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="bg-muted rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0">1</span>
            <span>Tap the <Share className="w-4 h-4 inline-block mx-0.5 text-blue-500" /> Share button at the bottom of Safari</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="bg-muted rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0">2</span>
            <span>Scroll down and tap "Add to Home Screen"</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="bg-muted rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0">3</span>
            <span>Tap "Add" in the top right</span>
          </div>
        </div>
      )}
    </div>
  );
}

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800" data-testid="banner-offline">
      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
      <p className="text-sm text-amber-800 dark:text-amber-300 flex-1">
        You're offline. Changes will sync when your connection is restored.
      </p>
    </div>
  );
}

const APPLE_REVIEW_USER_ID = 'c160d909-ff03-48dd-bef0-eef12708da52';

function UpdateBanner() {
  const [show, setShow] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/user', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(u => { if (u?.id) setCurrentUserId(u.id); })
      .catch(() => {});
  }, []);

  const handleUpdate = useCallback(() => {
    const waiting = (window as any).__swWaitingWorker;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    if ((window as any).__updateAvailable) {
      setShow(true);
    }
    const handler = () => setShow(true);
    window.addEventListener('app-update-available', handler);
    return () => window.removeEventListener('app-update-available', handler);
  }, []);

  if (!show || currentUserId === APPLE_REVIEW_USER_ID) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800" data-testid="banner-app-update">
      <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
      <p className="text-sm text-blue-800 dark:text-blue-300 flex-1">
        A new update is available. Please close and reopen the app, or refresh your browser.
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="outline" className="h-7 text-xs border-blue-300 dark:border-blue-700" onClick={handleUpdate} data-testid="button-apply-update">
          Refresh Now
        </Button>
        <button onClick={() => setShow(false)} className="text-blue-400 hover:text-blue-600" data-testid="button-dismiss-update">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function TeamLockoutOwnerBanner() {
  const { data } = useQuery<{ shouldShow: boolean; daysLapsed: number; lockedCount: number }>({
    queryKey: ['/api/company/locked-team-status'],
    staleTime: 5 * 60_000,
  });
  if (!data?.shouldShow) return null;
  return (
    <div
      className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 flex items-start gap-3"
      data-testid="banner-team-locked-out"
    >
      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-medium text-amber-900 dark:text-amber-100">
          Your team is locked out ({data.lockedCount} {data.lockedCount === 1 ? 'person' : 'people'})
        </p>
        <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
          Your subscription has been on hold for {data.daysLapsed} days. Your team can't sign in until you renew. Their data is safe.
        </p>
      </div>
      <a
        href="/billing"
        className="text-xs font-medium text-amber-900 dark:text-amber-100 underline shrink-0"
        data-testid="link-banner-renew"
      >
        Renew
      </a>
    </div>
  );
}

export function AppBanners() {
  return (
    <div className="empty:hidden space-y-2 px-4 pt-3 lg:px-6 lg:pt-4 [&:not(:has(>*))]:hidden">
      <OfflineBanner />
      <UpdateBanner />
      <TeamLockoutOwnerBanner />
      <NotificationBanner />
      <InstallBanner />
      <AddToHomescreenBanner />
    </div>
  );
}
