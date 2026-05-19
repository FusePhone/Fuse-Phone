# Messaging Real-Time Reliability

## What & Why
Inbound SMS, the sidebar Messages badge, and the conversation list don't always update instantly — particularly on the iPhone Capacitor app and after the device wakes from sleep. The pipeline (Twilio webhook → DB → WebSocket broadcast → cache update) is correct, but several recovery paths are missing or incomplete, so the WebSocket can silently die and stay dead until the user manually refreshes. This task closes the gaps so that every inbound message shows up immediately, every time, on web, PWA, and native.

## Done looks like
- New SMS appears in the conversation list and selected thread within ~1 second on every platform (web, PWA, iOS Capacitor).
- The sidebar Messages badge increments at the same moment, with no manual refresh required.
- Reopening the iOS app from the background reliably reconnects the live link and immediately backfills any messages received while it was closed.
- A Wi-Fi → cellular handoff (or any silent network drop) is detected within ~15 seconds and the app reconnects.
- A small connection indicator appears in the sidebar when the live link is down so the user knows to expect lag.
- Sub-users on a multi-user team account receive inbound SMS in real time and via push, just like the owner.
- FCM token registration retries instead of giving up after 30 seconds.

## Out of scope
- Outbound SMS reliability (already works).
- Voicemail / voice call notifications (separate pipeline).
- Reworking the message UI or composer.
- Adding a new "missed events" backend endpoint — initial fix uses targeted query refetches; a backfill endpoint can come later if needed.
- Changing the Twilio or OpenPhone webhook contracts.

## Steps
1. **Wire Capacitor app lifecycle into the realtime client.** Listen to `@capacitor/app` `appStateChange` (and `resume`) on native and call the same force-reconnect path the visibilitychange handler uses, so resuming from background always re-establishes the WebSocket and refetches the active message caches. Also listen to `@capacitor/network` for online/offline transitions.
2. **Add a client-side heartbeat with dead-socket detection.** Send a ping every 20 seconds (regardless of page visibility) and, if no pong arrives within ~10 seconds, close and reconnect. This catches silent NAT timeouts and Wi-Fi/LTE handoffs that `onclose` misses.
3. **Broaden reconnect refresh.** On reconnect, refetch all messaging caches (notifications/unread, conversation-contacts, by-phone, project-thread, recent-incoming, project-conversations) regardless of whether they currently have active observers, so the badge and list are correct as soon as the link is restored. Keep this scoped — don't blow away unrelated caches.
4. **Multi-user broadcast on inbound SMS.** In the Twilio and OpenPhone inbound webhooks, look up every active sub-user under the owner (existing `company_users` table) and emit `message.created` / `notification.created` / `project.message.created` to each of them in addition to the owner. Mirror the same fan-out for `sendPushToUser` so each team member's device gets a push.
5. **FCM token retry + persistence.** Replace the one-shot 30-second wait with a retry loop that keeps polling for `window.__fcmToken` for several minutes, and re-attempt registration on each app resume if the token still hasn't arrived. Surface a single warning banner (not a console-only message) if push permission is denied so the user can re-enable it.
6. **Sidebar live-status indicator.** Add a small dot/icon next to the Messages nav item (or in the sidebar footer) that turns amber when `isRealtimeConnected()` is false for more than ~5 seconds, so users have a visible signal that real-time is degraded. Click it to force a manual reconnect.
7. **Hook `onerror` into the reconnect path.** Today only `onclose` schedules a reconnect; if `onerror` fires without a subsequent close, the socket can be stuck. Trigger `scheduleReconnect()` from the error handler too (with the existing debounce so we don't loop).
8. **Smoke test on a real iPhone.** Log into the app on the iPhone, background it, send a test SMS from another phone, reopen the app — message must appear within a second. Repeat with airplane-mode-on/off. Run the same sequence as a sub-user on a multi-user account.

## Relevant files
- `client/src/lib/realtime.ts`
- `client/src/main.tsx:154-279`
- `client/src/App.tsx:9,368-395`
- `client/src/components/layout/Sidebar.tsx:318-352,900-920`
- `client/src/pages/Messages.tsx:2250-2284`
- `server/realtime.ts`
- `server/pushNotifications.ts`
- `server/routes.ts:11893-12200`
- `server/routes.ts:8427-8600`
