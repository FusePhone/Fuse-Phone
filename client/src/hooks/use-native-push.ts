import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';

export function useNativePushRegistration() {
  const { user } = useAuth();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (registeredRef.current) return;

    const Cap = (window as any).Capacitor;
    const isNative = Cap?.isNativePlatform?.() || Cap?.isNative;
    console.log('[Push Debug] Platform check:', {
      isNative,
      userAgent: navigator.userAgent.substring(0, 80),
      userId: user.id,
    });

    if (!isNative) return;

    function getToken(): string | null {
      return (window as any).__nativeDeviceToken || (window as any).__fcmToken || null;
    }

    function getPlatform(): string | null {
      const stored = (window as any).__nativeDevicePlatform;
      if (stored) return stored;
      const capPlatform = Cap?.getPlatform?.();
      if (capPlatform === 'ios' || capPlatform === 'android') return capPlatform;
      return null;
    }

    function isValidFcmToken(token: string): boolean {
      if (/^[0-9A-Fa-f]{64}$/.test(token)) return false;
      if (token.length < 100) return false;
      return true;
    }

    const token = getToken();
    const platform = getPlatform();
    console.log('[Push Debug] Checking for token:', { hasToken: !!token, tokenPrefix: token?.substring(0, 30), platform });

    if (token && platform && isValidFcmToken(token)) {
      registerToken(token, platform);
    } else {
      if (token && !isValidFcmToken(token)) {
        console.log('[Push Debug] Token found but appears to be raw APNs, waiting for FCM token...');
      } else {
        console.log('[Push Debug] Token not available yet, polling every 1s for up to 60s...');
      }
      let attempts = 0;
      const checkInterval = setInterval(() => {
        attempts++;
        const t = getToken();
        const p = getPlatform();
        if (attempts <= 5 || attempts % 10 === 0) {
          console.log(`[Push Debug] Poll attempt ${attempts}: hasToken=${!!t}, valid=${t ? isValidFcmToken(t) : false}, platform=${p || 'none'}`);
        }
        if (t && p && isValidFcmToken(t)) {
          clearInterval(checkInterval);
          registerToken(t, p);
        }
      }, 1000);

      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        const finalToken = getToken();
        const finalPlatform = getPlatform();
        if (finalToken && finalPlatform) {
          console.warn('[Push Debug] Timeout reached. Attempting registration with available token.');
          registerToken(finalToken, finalPlatform);
        } else {
          console.warn('[Push Debug] Token polling timed out after 60s. Will continue listening for native-fcm-token-ready in case it arrives later (multi-minute slow-retry path in main.tsx).');
        }
      }, 60000);

      // Belt-and-suspenders: main.tsx fires this event whenever the native
      // FCM token arrives (including the slow-retry loop that runs for up to
      // 10 minutes). Subscribe so we register as soon as the token shows up,
      // even if our 60s poll already gave up.
      const onFcmReady = () => {
        if (registeredRef.current) return;
        const t = getToken();
        const p = getPlatform();
        if (t && p && isValidFcmToken(t)) {
          console.log('[Push Debug] native-fcm-token-ready event — registering with server.');
          clearInterval(checkInterval);
          clearTimeout(timeout);
          registerToken(t, p);
        }
      };
      window.addEventListener('native-fcm-token-ready', onFcmReady);

      return () => {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        window.removeEventListener('native-fcm-token-ready', onFcmReady);
      };
    }

    function getApnsEnvironment(): string {
      const env = (window as any).__apnsEnvironment;
      if (env === 'sandbox' || env === 'development') return 'sandbox';
      if (env === 'production') return 'production';
      if (navigator.userAgent.includes('Xcode') || (window as any).__isDebugBuild) return 'sandbox';
      return 'sandbox';
    }

    function registerToken(deviceToken: string, devicePlatform: string) {
      if (registeredRef.current) return;
      registeredRef.current = true;

      const environment = devicePlatform === 'ios' ? getApnsEnvironment() : 'production';
      console.log('[Push Debug] Registering token with server:', {
        tokenPrefix: deviceToken.substring(0, 30) + '...',
        tokenLength: deviceToken.length,
        platform: devicePlatform,
        environment,
        looksLikeFcm: isValidFcmToken(deviceToken),
      });

      fetch('/api/push/register-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: deviceToken, platform: devicePlatform, environment }),
      }).then(r => {
        if (r.ok) {
          console.log('[Push Debug] SUCCESS - Device token registered with server!');
        } else {
          console.warn('[Push Debug] FAILED to register token, status:', r.status);
          r.text().then(t => console.warn('[Push Debug] Server response:', t));
          registeredRef.current = false;
        }
      }).catch(err => {
        console.warn('[Push Debug] Token registration network error:', err);
        registeredRef.current = false;
      });
    }
  }, [user]);
}
