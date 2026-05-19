import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Global "scroll focused field above the keyboard" handler.
// Runs on all platforms (web, PWA, iOS Capacitor, Android Capacitor) so any
// input / textarea / contenteditable that the user taps is automatically
// nudged into the visible viewport once the soft keyboard opens.
//
// Skip rules:
//   - Element opts out via `data-no-autoscroll` (used by hooks like
//     useScrollFocusedIntoView and the Dialog focus handler that already
//     manage their own scrolling — prevents double-scroll fights).
//   - Element is hidden / detached.
(function installGlobalKeyboardScrollHandler() {
  if (typeof document === 'undefined') return;
  if ((window as any).__fpKbScrollInstalled) return;
  (window as any).__fpKbScrollInstalled = true;

  // Single-pass design: stacking multiple smooth scrolls during the
  // keyboard animation produced visible "phases" (3-4 step jumps before the
  // field landed). Instead, schedule ONE scroll once the keyboard has
  // finished animating, and debounce any viewport-driven re-scroll to a
  // single trailing call.
  let activeField: HTMLElement | null = null;
  let scrollTimer: ReturnType<typeof setTimeout> | null = null;

  const scrollActiveNow = () => {
    const el = activeField;
    if (!el || !document.body.contains(el)) return;
    try {
      if ((el as any).scrollIntoViewIfNeeded) {
        (el as any).scrollIntoViewIfNeeded(true);
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch {
      try { el.scrollIntoView(); } catch {}
    }
  };

  const scheduleScroll = (delay: number) => {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      scrollTimer = null;
      scrollActiveNow();
    }, delay);
  };

  document.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement | null;
    if (!el) return;
    const isField =
      el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
    if (!isField) return;
    if (el.hasAttribute('data-no-autoscroll')) return;
    if (el.closest('[data-no-autoscroll]')) return;
    activeField = el;
    // Single scheduled scroll for after the typical iOS soft-keyboard
    // open animation. Viewport listeners below will replace this with
    // a final trailing scroll once the keyboard actually settles.
    scheduleScroll(320);
  });

  document.addEventListener('focusout', (e) => {
    if (e.target === activeField) {
      activeField = null;
      if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
    }
  });

  const onViewportChange = () => {
    if (!activeField) return;
    // Debounce: collapse the cascade of resize events fired during the
    // keyboard animation into one trailing scrollIntoView.
    scheduleScroll(90);
  };

  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', onViewportChange);
    vv.addEventListener('scroll', onViewportChange);
  }

  // Capacitor native (iOS / Android): WKWebView is configured with
  // `Keyboard.resize: none`, so visualViewport never resizes when the
  // keyboard opens. Listen to the Capacitor Keyboard plugin directly so
  // the focused field still gets scrolled above the keyboard inside the
  // installed native app.
  //
  // We also publish the keyboard height as a CSS variable
  // `--kb-height` on <html> so any overlay (dialogs, sheets, popovers,
  // address autocompletes) can subtract it from its max-height and end
  // above the keyboard instead of behind it.
  const setKbVar = (px: number) => {
    document.documentElement.style.setProperty('--kb-height', `${Math.max(0, px)}px`);
    if (px > 0) document.documentElement.classList.add('kb-open');
    else document.documentElement.classList.remove('kb-open');
  };
  setKbVar(0);
  (async () => {
    try {
      const isNative = (window as any).Capacitor?.isNativePlatform?.() === true;
      if (!isNative) return;
      const { Keyboard } = await import('@capacitor/keyboard');
      const onShow = (info: any) => {
        const h = Number(info?.keyboardHeight) || 0;
        setKbVar(h);
        // Single scroll once the native keyboard has finished animating.
        scheduleScroll(40);
      };
      const onHide = () => setKbVar(0);
      await Keyboard.addListener('keyboardWillShow', onShow);
      await Keyboard.addListener('keyboardDidShow', onShow);
      await Keyboard.addListener('keyboardWillHide', onHide);
      await Keyboard.addListener('keyboardDidHide', onHide);
    } catch {
      /* not Capacitor or plugin unavailable — fine */
    }
  })();
})();

(function forceSwUpdate() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').then(function(reg) {
      reg.update().catch(function() {});

      if (reg.waiting) {
        (window as any).__swWaitingWorker = reg.waiting;
        (window as any).__updateAvailable = true;
      }

      reg.addEventListener('updatefound', function() {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', function() {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            (window as any).__swWaitingWorker = newWorker;
            (window as any).__updateAvailable = true;
            window.dispatchEvent(new CustomEvent('app-update-available'));
          }
        });
      });
    }).catch(function() {});

    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if ((window as any).__swReloading) return;
      (window as any).__swReloading = true;
      window.location.reload();
    });
  }
})();

(function initNativeApp() {
  try {
    const Cap = (window as any).Capacitor;
    console.log('[NATIVE-DEBUG] main.tsx: Capacitor object exists:', !!Cap, 'isNativePlatform:', !!Cap?.isNativePlatform?.(), 'isNative:', !!Cap?.isNative);
    if (Cap?.isNativePlatform?.() || Cap?.isNative) {
      console.log('[NATIVE-DEBUG] main.tsx: DETECTED AS NATIVE, setting __CAPACITOR_NATIVE flag');
      (window as any).__CAPACITOR_NATIVE = true;
      document.documentElement.classList.add('capacitor-native');
      document.body.style.backgroundColor = '';

      const isAvailable = Cap.isPluginAvailable?.bind(Cap) || (() => false);
      const plugins = Cap.Plugins;

      if (isAvailable('StatusBar') && plugins?.StatusBar) {
        plugins.StatusBar.setStyle({ style: 'LIGHT' });
        plugins.StatusBar.setOverlaysWebView({ overlay: true });
      }

      // Native handler is now also installed globally below for web/PWA — no
      // need to register it here a second time.

      const preInjectedFcm = (window as any).__fcmToken;
      if (preInjectedFcm) {
        console.log('[Push Native] FCM token was pre-injected by AppDelegate:', preInjectedFcm.substring(0, 30) + '...');
        (window as any).__nativeDeviceToken = preInjectedFcm;
        (window as any).__nativeDevicePlatform = 'ios';
      }

      // Pre-warm React Query cache for the destination of a tapped push so the
      // page mounts with data already in cache (no spinner, no 3-5s wait).
      // Maps the deep-link URL to the same query keys the destination pages
      // use, then fires fetches in parallel. Fire-and-forget — failures are
      // harmless because each page's own useQuery will refetch on mount.
      const prefetchForDeepLink = async (deepUrl: string) => {
        try {
          const path = deepUrl.split('?')[0] || '/';
          const sp = new URLSearchParams(deepUrl.includes('?') ? deepUrl.split('?')[1] : '');
          const { queryClient, authFetch } = await import('./lib/queryClient');

          // authFetch attaches the native Bearer token; plain fetch 401s on iOS native.
          const fetchJson = (url: string) =>
            authFetch(url).then(r => (r.ok ? r.json() : Promise.reject(r.status)));

          // Messages deep links — match the EXACT query keys / fetchers used by
          // Messages.tsx (useCommunications hook + by-phone + project-thread).
          if (path === '/messages') {
            const cid = sp.get('contactId');
            const phone = sp.get('phone');
            const pid = sp.get('projectId');
            if (cid) {
              const id = parseInt(cid);
              if (!isNaN(id)) {
                queryClient.prefetchQuery({
                  queryKey: ['/api/communications', id],
                  queryFn: () => fetchJson(`/api/communications?contactId=${id}`),
                }).catch(() => {});
                queryClient.prefetchQuery({
                  queryKey: [`/api/contacts/${id}`],
                  queryFn: () => fetchJson(`/api/contacts/${id}`),
                }).catch(() => {});
              }
            }
            if (phone) {
              queryClient.prefetchQuery({
                queryKey: ['/api/communications/by-phone', phone],
                queryFn: () => fetchJson(`/api/communications/by-phone?phoneNumber=${encodeURIComponent(phone)}`),
              }).catch(() => {});
            }
            if (pid) {
              const id = parseInt(pid);
              if (!isNaN(id)) {
                queryClient.prefetchQuery({
                  queryKey: ['/api/communications/project-thread', id],
                  queryFn: () => fetchJson(`/api/communications/project-thread/${id}`).then(d =>
                    Array.isArray(d) ? d : Array.isArray(d?.messages) ? d.messages : []
                  ),
                }).catch(() => {});
              }
            }
            // Always warm the conversation list too — Messages reads it for
            // contact lookup; warming here means the list renders instantly.
            queryClient.prefetchQuery({
              queryKey: ['/api/communications/conversation-contacts'],
              queryFn: () => fetchJson('/api/communications/conversation-contacts'),
            }).catch(() => {});
            return;
          }

          // Project / contact / appointment / document detail pages — these
          // all use the path-style query key `['/api/<resource>', id]` which
          // the default queryFn fetches as `/api/<resource>/<id>`. So a single
          // generic prefetch handles every detail page in the app.
          const detailMatch = path.match(/^\/(projects|contacts|appointments|documents)\/(\d+)$/);
          if (detailMatch) {
            const resource = detailMatch[1];
            const id = parseInt(detailMatch[2]);
            if (!isNaN(id)) {
              queryClient.prefetchQuery({
                queryKey: [`/api/${resource}`, id],
              }).catch(() => {});
            }
            return;
          }
        } catch {}
      };

      console.log('[Push Native] Starting native push setup...');
      console.log('[Push Native] PushNotifications plugin available:', isAvailable('PushNotifications'));
      
      setTimeout(() => {
        if (isAvailable('PushNotifications') && plugins?.PushNotifications) {
          const PushNotifications = plugins.PushNotifications;
          console.log('[Push Native] PushNotifications plugin loaded, setting up listeners...');

          PushNotifications.addListener('registration', (token: any) => {
            const rawToken = token?.value;
            const platform = Cap.getPlatform?.() || 'unknown';
            console.log('[Push Native] Registration callback fired, token received:', !!rawToken, 'platform:', platform);
            if (!rawToken) {
              console.warn('[Push Native] Token was empty/null!');
              return;
            }
            (window as any).__nativeDevicePlatform = platform;

            // On Android, the Capacitor PushNotifications plugin emits the FCM
            // token directly in the `registration` event — no AppDelegate hop
            // needed. Use it as-is and skip the iOS-only FCM token polling.
            if (platform === 'android') {
              console.log('[Push Native] Android FCM token prefix:', rawToken.substring(0, 30) + '...');
              (window as any).__fcmToken = rawToken;
              (window as any).__nativeDeviceToken = rawToken;
              window.dispatchEvent(new CustomEvent('native-fcm-token-ready'));
              return;
            }

            console.log('[Push Native] iOS APNs token prefix:', rawToken.substring(0, 30) + '...');
            const fcmAlready = (window as any).__fcmToken;
            if (fcmAlready) {
              console.log('[Push Native] FCM token already available from AppDelegate:', fcmAlready.substring(0, 30) + '...');
              (window as any).__nativeDeviceToken = fcmAlready;
              window.dispatchEvent(new CustomEvent('native-fcm-token-ready'));
              return;
            }

            console.log('[Push Native] FCM token not yet available, requesting from native...');
            try {
              const webkit = (window as any).webkit;
              if (webkit?.messageHandlers?.fcmToken) {
                webkit.messageHandlers.fcmToken.postMessage('request');
                console.log('[Push Native] Sent FCM token request via message handler');
              }
            } catch (e) {
              console.log('[Push Native] No fcmToken message handler available');
            }

            // Wait for the AppDelegate to inject window.__fcmToken. We poll
            // every 500ms for the FIRST 90s (covers normal cold-start), then
            // fall back to a slower retry loop every 30s for up to 10 minutes
            // total. iOS Firebase sometimes takes minutes to deliver a token
            // on the first launch after install — being too eager to give up
            // means the user silently misses notifications until they
            // background+foreground the app.
            let resolved = false;
            const requestFcmFromNative = () => {
              try {
                const webkit = (window as any).webkit;
                if (webkit?.messageHandlers?.fcmToken) {
                  webkit.messageHandlers.fcmToken.postMessage('request');
                }
              } catch {}
              try { PushNotifications.register(); } catch {}
            };
            const checkFcm = setInterval(() => {
              const fcm = (window as any).__fcmToken;
              if (fcm && !resolved) {
                resolved = true;
                clearInterval(checkFcm);
                console.log('[Push Native] FCM token received:', fcm.substring(0, 30) + '...');
                (window as any).__nativeDeviceToken = fcm;
                window.dispatchEvent(new CustomEvent('native-fcm-token-ready'));
              }
            }, 500);
            const FCM_RETRY_INTERVAL_MS = 30000;
            const FCM_RETRY_MAX_DURATION_MS = 10 * 60 * 1000;
            const retryStart = Date.now();
            let slowRetryTimer: ReturnType<typeof setInterval> | null = null;
            setTimeout(() => {
              clearInterval(checkFcm);
              if (resolved) return;
              console.warn('[Push Native] FCM token not arrived after 90s. Starting slow retry loop (every 30s for up to 10 minutes).');
              (window as any).__fcmTokenPending = true;
              (window as any).__fcmTokenRetry = () => {
                if ((window as any).__fcmToken) return;
                requestFcmFromNative();
                console.log('[Push Native] Re-requested FCM token (manual/resume)');
              };
              slowRetryTimer = setInterval(() => {
                if ((window as any).__fcmToken) {
                  if (slowRetryTimer) clearInterval(slowRetryTimer);
                  return;
                }
                if (Date.now() - retryStart > FCM_RETRY_MAX_DURATION_MS) {
                  if (slowRetryTimer) clearInterval(slowRetryTimer);
                  console.warn('[Push Native] FCM token still missing after 10 minutes. Giving up automatic retries; user resume will continue to retry.');
                  return;
                }
                requestFcmFromNative();
                console.log('[Push Native] Slow-retry: re-requested FCM token');
              }, FCM_RETRY_INTERVAL_MS);
            }, 90000);
          });

          PushNotifications.addListener('registrationError', (err: any) => {
            console.error('[Push Native] REGISTRATION ERROR:', JSON.stringify(err));
            console.error('[Push Native] This usually means: 1) GoogleService-Info.plist is missing, 2) Bundle ID mismatch, or 3) Push capability not added in Xcode');
          });

          PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
            console.log('[Push Native] Notification received in FOREGROUND:', JSON.stringify(notification));
            // Warm the destination cache on push arrival so the thread renders
            // instantly when the user taps (the WebSocket upsert can lag on iOS).
            const fgUrl = notification?.data?.url;
            if (fgUrl) {
              const cleanFgUrl = String(fgUrl).startsWith('/') ? String(fgUrl) : '/' + String(fgUrl);
              prefetchForDeepLink(cleanFgUrl).catch((err: unknown) => {
                console.warn('[Push Native] Foreground prefetch failed:', err);
              });
            }
            window.dispatchEvent(new CustomEvent('native-push-received', { detail: notification }));
          });

          PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
            console.log('[Push Native] Notification tapped:', JSON.stringify(action));
            const data = action?.notification?.data || {};
            const url = data.url;
            if (url) {
              const cleanUrl = url.startsWith('/') ? url : '/' + url;
              (window as any).__pendingPushUrl = cleanUrl;
              // Persist deep link + thread-seed payload in sessionStorage so it
              // survives auth redirects, bounce navigations, and Messages
              // remounts. Page-level handlers read and clear this within a 60s
              // window. Stored under a stable key so a second tap overwrites the
              // first (only the latest tap wins). The seed fields let Messages
              // paint the new bubble the instant it mounts, before WS reconnects
              // or the per-thread GET completes on cellular.
              const seed: any = { url: cleanUrl, ts: Date.now() };
              if (data.messageId) seed.messageId = parseInt(String(data.messageId));
              if (data.contactId) seed.contactId = parseInt(String(data.contactId));
              if (data.projectId) seed.projectId = parseInt(String(data.projectId));
              if (data.phoneNumber) seed.phoneNumber = String(data.phoneNumber);
              if (data.timestamp) seed.timestamp = String(data.timestamp);
              const seedBody = data.body || action?.notification?.body || '';
              if (seedBody) seed.body = String(seedBody);
              try {
                sessionStorage.setItem('__pushDeepLink', JSON.stringify(seed));
              } catch {}
              // Prefetch the data the destination page needs, the moment the tap
              // happens. By the time the page mounts (~hundreds of ms later) the
              // query cache is already warm and the UI renders instantly instead
              // of showing a spinner. Fire-and-forget; failures are silently
              // ignored because the page's own useQuery will retry naturally.
              try { prefetchForDeepLink(cleanUrl); } catch {}

              // Blocker #1 fix: synchronously seed the per-thread cache AND
              // bump the conv-contacts row in-place the instant the push is
              // tapped — BEFORE App.tsx navigates and BEFORE Messages mounts.
              // The Messages page handler (LOCKED) does the same thing, but
              // its `addEventListener` only attaches in useEffect AFTER first
              // render — meaning when the user taps a notification while on
              // a non-Messages page (Dashboard, Projects, etc.), Messages
              // mounts AFTER the native-push-tapped event has already fired
              // and the listener misses it. Replay-from-backup catches it
              // at +150ms but the per-thread fetch can take 1–2s on cellular.
              // By seeding here (synchronous, runs INSIDE the tap callback,
              // BEFORE any navigation), the cache already contains the bubble
              // by the time Messages mounts — instant render, no waiting.
              // Dedup by id with the LOCKED handler is automatic (same id,
              // `old.some(m => m.id === msgId) ? skip` check).
              (async () => {
                try {
                  if (!seed.messageId) return;
                  const { queryClient } = await import('./lib/queryClient');
                  const ts = seed.timestamp || new Date().toISOString();
                  const synthetic: any = {
                    id: seed.messageId,
                    contactId: seed.contactId ?? null,
                    phoneNumber: seed.phoneNumber || null,
                    type: 'sms',
                    direction: 'inbound',
                    content: seed.body || '',
                    body: seed.body || '',
                    timestamp: ts,
                    createdAt: ts,
                    isRead: false,
                    messageSid: null,
                    projectId: seed.projectId ?? null,
                  };
                  const upsert = (key: any[]) => {
                    queryClient.setQueryData(key, (old: any) => {
                      if (!Array.isArray(old)) return [synthetic];
                      if (old.some((m: any) => m && m.id === seed.messageId)) return old;
                      return [...old, synthetic];
                    });
                  };
                  if (seed.projectId) {
                    upsert(['/api/communications/project-thread', seed.projectId]);
                  } else {
                    if (seed.contactId) upsert(['/api/communications', seed.contactId]);
                    if (seed.phoneNumber) upsert(['/api/communications/by-phone', seed.phoneNumber]);
                  }
                  // Bump conv-contacts row in-place IF it already exists.
                  // We deliberately DO NOT add a brand-new row here — the
                  // ConversationContact shape requires display name, archive
                  // flag, last-seen, etc. that we don't have in the push
                  // payload. The prefetch above + the WS message.created
                  // handler take care of brand-new contacts.
                  if (seed.contactId && !seed.projectId) {
                    queryClient.setQueriesData(
                      { queryKey: ['/api/communications/conversation-contacts'] },
                      (old: any) => {
                        if (!Array.isArray(old)) return old;
                        const existing = old.find((c: any) => c.id === seed.contactId);
                        if (!existing) return old;
                        // Skip if this exact message already accounted for
                        // (push tapped twice, WS message.created already
                        // landed, etc.) — prevents double unread bump.
                        if (existing.last_message_id === seed.messageId) return old;
                        const updated = old.map((c: any) =>
                          c.id === seed.contactId
                            ? {
                                ...c,
                                last_message: seed.body || c.last_message,
                                last_message_time: ts,
                                last_message_direction: 'inbound',
                                last_message_id: seed.messageId,
                                last_message_type: 'sms',
                                unread_count: (c.unread_count || 0) + 1,
                              }
                            : c
                        );
                        updated.sort((a: any, b: any) => {
                          const ta = new Date(a.last_message_time || 0).getTime() || 0;
                          const tb = new Date(b.last_message_time || 0).getTime() || 0;
                          return tb - ta;
                        });
                        return updated;
                      }
                    );
                  }
                } catch {}
              })();

              window.dispatchEvent(new CustomEvent('native-push-tapped', { detail: { url: cleanUrl, notification: action?.notification, seed } }));
            }
          });

          console.log('[Push Native] Requesting push permissions...');
          PushNotifications.requestPermissions().then((result: any) => {
            console.log('[Push Native] Permission result:', JSON.stringify(result));
            (window as any).__pushPermissionState = result?.receive || 'unknown';
            if (result?.receive === 'granted') {
              console.log('[Push Native] Permission GRANTED, calling register()...');
              PushNotifications.register();
            } else {
              console.warn('[Push Native] Permission DENIED or not granted:', result?.receive);
              window.dispatchEvent(new CustomEvent('native-push-permission-denied'));
            }
          }).catch((err: any) => {
            console.error('[Push Native] Permission request FAILED:', err);
          });

          // Re-attempt FCM token request whenever the app comes back to the
          // foreground if we never received one. iOS often delivers tokens
          // late, especially on first launch / after a Firebase reconnect.
          (async () => {
            try {
              const mod = await import('@capacitor/app');
              const App = (mod as any).App;
              if (!App?.addListener) return;
              const retry = () => {
                if ((window as any).__fcmToken) return;
                const fn = (window as any).__fcmTokenRetry;
                if (typeof fn === 'function') fn();
                if (PushNotifications?.register) {
                  try { PushNotifications.register(); } catch {}
                }
              };
              App.addListener('resume', retry);
              App.addListener('appStateChange', (s: { isActive: boolean }) => {
                if (s?.isActive) retry();
              });
            } catch {}
          })();
        } else {
          console.warn('[Push Native] PushNotifications plugin NOT available');
          console.warn('[Push Native] Available plugins:', Object.keys(plugins || {}));
        }
      }, 3000);
    }
  } catch (e) {}
})();

function dismissSplash() {
  try {
    const splash = document.getElementById('native-splash');
    if (splash) {
      splash.style.opacity = '0';
      splash.style.transition = 'opacity 0.3s ease';
      setTimeout(() => splash.remove(), 350);
    }
    const Capacitor = (window as any).Capacitor;
    if (Capacitor?.isNativePlatform?.() || Capacitor?.isNative) {
      const plugins = Capacitor.Plugins;
      if (plugins?.SplashScreen) {
        plugins.SplashScreen.hide();
      }
    }
  } catch (e) {}
}

(window as any).__dismissSplash = dismissSplash;

setTimeout(() => {
  try { dismissSplash(); } catch {}
}, 4000);

if ((window as any).__CAPACITOR_NATIVE || document.documentElement.classList.contains('capacitor-native') || (window as any).Capacitor?.isNative) {
  import("@/lib/native-auth").catch(() => {});
}

window.addEventListener('error', (e) => {
  if (
    e.message?.includes('Loading chunk') ||
    e.message?.includes('Loading CSS chunk') ||
    e.message?.includes('Failed to fetch dynamically imported module') ||
    e.message?.includes('Importing a module script failed')
  ) {
    const reloaded = sessionStorage.getItem('chunk-reload');
    if (!reloaded) {
      sessionStorage.setItem('chunk-reload', '1');
      if ('caches' in window) {
        caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))).then(() => {
          window.location.reload();
        });
      } else {
        window.location.reload();
      }
    }
  }
});

window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || String(e.reason || '');
  if (
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed')
  ) {
    const reloaded = sessionStorage.getItem('chunk-reload');
    if (!reloaded) {
      sessionStorage.setItem('chunk-reload', '1');
      if ('caches' in window) {
        caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))).then(() => {
          window.location.reload();
        });
      } else {
        window.location.reload();
      }
    }
  }
});

setTimeout(() => sessionStorage.removeItem('chunk-reload'), 5000);

async function preseedAuthFromIDB() {
  try {
    const { get, createStore } = await import("idb-keyval");
    const store = createStore("fuse-query-db", "query-cache");

    const { queryClient } = await import("./lib/queryClient");

    const existing = queryClient.getQueryData(["/api/auth/user"]);
    if (existing) return;

    const data = await get("fuse-query-cache:anonymous", store) as any;
    if (data?.clientState?.queries) {
      const authQuery = data.clientState.queries.find((q: any) => String(q.queryKey[0]) === "/api/auth/user");
      if (authQuery?.state?.data) {
        queryClient.setQueryData(["/api/auth/user"], authQuery.state.data, { updatedAt: 0 });
        console.log("[PRESEED] Auth user pre-seeded from IDB (will revalidate)");

        for (const q of data.clientState.queries) {
          const qk = String(q.queryKey[0]);
          if (qk === "/api/subscription" || qk === "/api/user/capabilities") {
            if (q.state?.data) {
              queryClient.setQueryData(q.queryKey, q.state.data, { updatedAt: 0 });
            }
          }
        }
      }
    }
  } catch (e) {
    console.log("[PRESEED] Could not preseed auth from IDB:", e);
  }
}

const root = createRoot(document.getElementById("root")!);

Promise.race([
  preseedAuthFromIDB(),
  new Promise(resolve => setTimeout(resolve, 200)),
])
  .then(() => root.render(<App />))
  .catch(() => root.render(<App />));

(function versionCheck() {
  let initialVersion: string | null = null;
  let lastCheck = 0;
  const MIN_INTERVAL = 60000;

  async function check() {
    const now = Date.now();
    if (now - lastCheck < MIN_INTERVAL) return;
    lastCheck = now;
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (!initialVersion) {
        initialVersion = data.version;
        return;
      }
      if (data.version !== initialVersion) {
        (window as any).__updateAvailable = true;
        window.dispatchEvent(new CustomEvent('app-update-available'));
      }
    } catch {}
  }

  check();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
})();
