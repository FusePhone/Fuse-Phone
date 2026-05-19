import webpush from 'web-push';
import admin from 'firebase-admin';
import { storage } from './storage';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:office@fusephone.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

let fcmInitialized = false;
let fcmProjectId = '';

const FCM_SERVICE_ACCOUNT = process.env.FCM_SERVICE_ACCOUNT_KEY;

if (FCM_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(FCM_SERVICE_ACCOUNT);
    fcmProjectId = serviceAccount.project_id;

    if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    if (admin.apps.length) {
      admin.apps.forEach(app => { if (app) app.delete(); });
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    fcmInitialized = true;
    console.log(`[FCM] Firebase Admin initialized for project: ${fcmProjectId}`);
  } catch (err: any) {
    console.error(`[FCM] Firebase initialization failed: ${err?.message?.substring(0, 300)}`);
  }
} else {
  console.warn('[FCM] FCM_SERVICE_ACCOUNT_KEY not set, native push disabled');
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  isCall?: boolean;
  isTimeSensitive?: boolean;
  // Optional thread-seed fields. When present we forward them in the
  // FCM data payload (and APNs custom keys on iOS) so the client can
  // render the message bubble the instant the user taps the push,
  // without waiting for the WebSocket to reconnect or the per-thread
  // GET to complete on cellular.
  messageId?: number;
  contactId?: number;
  phoneNumber?: string;
  projectId?: number;
  timestamp?: string;
}

async function sendWebPush(userId: string, payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  try {
    const subscriptions = await storage.getPushSubscriptions(userId);
    if (subscriptions.length === 0) return;

    const payloadStr = JSON.stringify(payload);

    const results = await Promise.allSettled(
      subscriptions.map(sub =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payloadStr
        )
      )
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        const statusCode = (result.reason as any)?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await storage.deletePushSubscription(subscriptions[i].endpoint);
          console.log('[Push] Removed expired web push subscription');
        } else {
          console.error('[Push] Web push failed:', result.reason);
        }
      }
    }
  } catch (err) {
    console.error('[Push] Error sending web push:', err);
  }
}

async function sendNativePush(userId: string, payload: PushPayload): Promise<void> {
  if (!fcmInitialized) return;

  try {
    const tokens = await storage.getDeviceTokens(userId);
    if (tokens.length === 0) return;

    const credential = await admin.app().options.credential?.getAccessToken();
    const accessToken = credential?.access_token;
    if (!accessToken) {
      console.error('[FCM] Failed to get OAuth access token');
      return;
    }

    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${fcmProjectId}/messages:send`;

    for (const { token, platform } of tokens) {
      try {
        // Thread-seed fields. FCM data values must be strings.
        const seedData: Record<string, string> = {
          url: payload.url || '/',
          tag: payload.tag || '',
        };
        if (payload.messageId !== undefined) seedData.messageId = String(payload.messageId);
        if (payload.contactId !== undefined) seedData.contactId = String(payload.contactId);
        if (payload.phoneNumber) seedData.phoneNumber = payload.phoneNumber;
        if (payload.projectId !== undefined) seedData.projectId = String(payload.projectId);
        if (payload.timestamp) seedData.timestamp = payload.timestamp;
        if (payload.body) seedData.body = payload.body;

        const message: any = {
          message: {
            token,
            notification: { title: payload.title, body: payload.body },
            data: seedData,
          }
        };

        if (platform === 'ios') {
          const useTimeSensitive = payload.isCall || payload.isTimeSensitive;
          // IMPORTANT: When `apns.payload` is explicitly set on an FCM v1 message,
          // the top-level `data` field is NOT reliably merged into the APNs payload.
          // We must duplicate `url` and `tag` here so they arrive on iOS as custom
          // userInfo keys — without them, tapping the notification opens /messages
          // but the right-hand thread pane stays blank because Capacitor's
          // `notification.data.url` is undefined.
          message.message.apns = {
            headers: useTimeSensitive ? { 'apns-priority': '10', 'apns-push-type': 'alert' } : undefined,
            payload: {
              aps: {
                alert: { title: payload.title, body: payload.body },
                sound: payload.isCall ? { critical: 0, name: 'default', volume: 1.0 } : 'default',
                badge: 1,
                ...(useTimeSensitive ? { 'interruption-level': 'time-sensitive' } : {}),
              },
              ...seedData,
            },
          };
        } else {
          // Do NOT set `channelId` to a custom value unless the channel has
          // been created natively on the device — Android 8+ silently drops
          // notifications targeted at non-existent channels. Capacitor's
          // PushNotifications plugin auto-creates `fcm_fallback_notification_channel`,
          // which FCM uses when no channelId is specified.
          message.message.android = {
            priority: 'high',
            notification: {
              sound: 'default',
              ...(payload.isCall ? { notificationPriority: 'PRIORITY_MAX' } : {}),
            },
          };
        }

        const resp = await fetch(fcmUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        });

        if (resp.status === 200) {
          console.log(`[FCM] Push delivered to ${platform} device`);
        } else {
          const body = await resp.text();
          console.error(`[FCM] Push failed (${resp.status}): ${body.substring(0, 300)}`);
          if (resp.status === 404 || resp.status === 410) {
            await storage.deleteDeviceToken(token);
            console.log(`[FCM] Removed invalid ${platform} device token`);
          }
        }
      } catch (err: any) {
        console.error(`[FCM] Error sending to ${platform}: ${err?.message}`);
      }
    }
  } catch (err: any) {
    console.error(`[FCM] Native push error: ${err?.message}`);
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  console.log(`[Push] Sending push to user ${userId}: ${payload.title}`);
  await Promise.allSettled([
    sendWebPush(userId, payload),
    sendNativePush(userId, payload),
  ]);
}

// Fan-out: deliver a push notification to the company owner AND every active
// sub-user in their company. Any team member with a registered device gets
// the alert (incoming SMS, missed calls) regardless of who is "logged in" on
// which device.
export async function sendPushToOwnerAndTeam(ownerId: string, payload: PushPayload): Promise<void> {
  const recipients = new Set<string>([ownerId]);
  try {
    const { db } = await import('./db');
    const { sql } = await import('drizzle-orm');
    const result = await db.execute(
      sql`SELECT user_id FROM company_users WHERE owner_id = ${ownerId} AND status = 'active'`
    );
    const rows = (result as any).rows || [];
    for (const r of rows) {
      if (r.user_id) recipients.add(r.user_id);
    }
  } catch (err) {
    console.error('[Push] sendPushToOwnerAndTeam fan-out lookup failed:', err);
  }

  await Promise.allSettled(
    Array.from(recipients).map((uid) => sendPushToUser(uid, payload))
  );
}

export async function sendTestPush(userId: string): Promise<{ 
  fcmInitialized: boolean; 
  nativeTokens: number; 
  webSubscriptions: number; 
  results: any;
}> {
  const debugInfo: any = {
    fcmInitialized,
    fcmProjectId,
    nativeTokens: 0,
    webSubscriptions: 0,
    results: { native: [], web: [] },
  };

  try {
    const tokens = await storage.getDeviceTokens(userId);
    debugInfo.nativeTokens = tokens.length;
    debugInfo.tokenDetails = tokens.map(t => ({ 
      platform: t.platform,
      environment: t.environment,
      tokenLength: t.token.length,
      tokenPrefix: t.token.substring(0, 30) + '...',
    }));
  } catch (err) {
    debugInfo.nativeError = String(err);
  }

  try {
    const subs = await storage.getPushSubscriptions(userId);
    debugInfo.webSubscriptions = subs.length;
  } catch (err) {
    debugInfo.webError = String(err);
  }

  const testPayload: PushPayload = {
    title: 'Fuse Phone Test',
    body: 'If you see this, push notifications are working!',
    url: '/',
    tag: 'test-' + Date.now(),
  };

  if (fcmInitialized && debugInfo.nativeTokens > 0) {
    try {
      await sendNativePush(userId, testPayload);
      debugInfo.results.native.push({ status: 'sent' });
    } catch (err: any) {
      debugInfo.results.native.push({ status: 'failed', error: err?.message });
    }
  }

  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && debugInfo.webSubscriptions > 0) {
    try {
      await sendWebPush(userId, testPayload);
      debugInfo.results.web.push({ status: 'sent' });
    } catch (err) {
      debugInfo.results.web.push({ status: 'failed', error: String(err) });
    }
  }

  return debugInfo;
}
