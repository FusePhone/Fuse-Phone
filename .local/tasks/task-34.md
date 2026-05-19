---
title: Open the right message thread instantly on iPhone push tap
---
# Open the right message thread instantly on iPhone push tap

## What & Why
After Task #25 hardened the WebSocket itself, a separate cold-start race in the Messages screen still causes two annoying symptoms on the iPhone (and any cold load from a push notification):

1. When the user taps a push notification, the Messages page opens with the *previously selected* thread visible for ~0.5–1 second before "blinking" to the correct thread the notification was about.
2. If a new SMS lands during that blink window, the conversation list/thread doesn't appear to update in real time, because the cache write happens on the right key but the UI is still pointed at the wrong (stale) one. The user has to swipe-refresh or wait for the 500 ms debounced invalidate.

Root cause is in `client/src/pages/Messages.tsx`: the `selected` state starts as `null` and is only filled in by a `useEffect` that runs *after* the first render. On a cold start the conversation list isn't loaded yet, so the push handler queues the contact id in `pendingContactIdRef` and waits for either the list query or an ad-hoc `/api/contacts/:id` fetch to resolve before it can call `setSelected`. There's also no need to wait for the contact object to render the right-hand thread pane — the thread query is keyed by contact id alone.

No `cap sync` or App Store rebuild is needed for this fix. The Capacitor app loads from `https://app.fusephone.com` (see `server.url` in `capacitor.config.ts`), so publishing the web app is enough.

## Done looks like
- Tapping a push notification opens the correct message thread on the very first paint — no stale/wrong thread flashes first.
- Cold-starting the app from a push does the same: the right thread is visible immediately, even before the conversation list has finished loading.
- New inbound SMS that arrive during cold start show up in the open thread within a second, with no manual refresh.
- The conversation list ordering and unread badge update at the same instant the thread does.
- No regression on the regular flow (already-warm app, list-based navigation, project threads, phone-number-only threads).

## Out of scope
- Reworking the WebSocket / heartbeat / reconnect logic (already covered by Task #25).
- Push notification permission UX (already covered by Task #27).
- Server-side fan-out or webhook hardening (separate tasks).
- Any change to native iOS code, Capacitor plugins, or `capacitor.config.ts`.
- Voice / call notifications.

## Steps
1. **Render the right thread on first paint.** Initialize the `selected` state lazily by reading the URL query string (`contactId`, `phone`, `projectId`) during the very first render, instead of waiting for a `useEffect`. When only an id is known, use a minimal placeholder (id + temporary display name) so the thread query — which is keyed by id — starts fetching immediately and the right-hand pane mounts on the correct conversation.
2. **Refine the placeholder when the real contact loads.** Once the conversation-contacts list or the single-contact query resolves the full record, replace the placeholder in `selected` without remounting the pane. Drop the `pendingContactIdRef` async-fetch fallback since it's no longer needed.
3. **Make the push-tap handler use the same instant-select path.** When `native-push-tapped` fires, set the placeholder immediately and only enrich the contact afterward, so a cold-started app navigates without a blink. Keep the existing "already on this thread, do nothing" guard.
4. **Tighten the realtime cache update for the active thread.** In the `message.created` handler in the realtime client, when the incoming message belongs to the currently-open thread (contact, phone, or project), trigger an immediate invalidate of the conversation-contacts list (no 500 ms debounce) so the list ordering and unread count refresh in lockstep with the thread.
5. **Smoke test on a real iPhone.** Cold-start from a push notification on a contact thread, a phone-only thread, and a project thread. Confirm the correct thread shows on the first paint and that a follow-up inbound SMS appears within ~1 second with no swipe-refresh.

## Relevant files
- `client/src/pages/Messages.tsx:1990-2030,2600-2755`
- `client/src/lib/realtime.ts:48-150`
- `client/src/main.tsx:280-300`
- `capacitor.config.ts`