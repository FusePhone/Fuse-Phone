---
title: Lock down inbound messaging once and for all
---
# Lock down inbound messaging once and for all

## What & Why
Messages are still painful on iPhone in three specific ways the user has called out by name. We've patched these areas a few times already (Tasks #25 and #34), but the user is asking for a final, thorough pass that fixes all three together and adds an in-code "do not change" marker so future agents stop re-touching this surface.

The three problems, in the user's words:

1. **The new message lands in the conversation list quickly, but takes 1–2 seconds to appear in the open thread.** We already have the message in hand (the realtime event payload contains it), but our code only writes it into the open thread's cache when that thread was already loaded. If the user is on the conversation list when the message arrives and then opens the thread, the cache for that thread is empty and we wait for a full network refetch — which is the 1–2 second lag.

2. **Tapping a push notification from outside the app sometimes lands on the conversation list instead of opening the thread.** The push payload from the server already includes the right URL (`/messages?contactId=…`, `/messages?phone=…`, or `/messages?projectId=…`), but on iPhone the URL is sometimes lost between the native side and the JS side — there are several handlers competing (Capacitor's `pushNotificationActionPerformed`, AppDelegate's custom path with a 2-second delay, and a separate `__pendingPushUrl` global), each with its own race condition. When any one of them fires before the JS side has hooked up its listener, the URL falls on the floor and we end up at `/messages` with no params.

3. **Opening a thread doesn't always scroll to the most recent message.** The current scroll-to-bottom effect only fires when `smsMessages.length` changes. When the user switches between two threads that happen to have the same number of messages, no scroll fires and the thread shows older messages until the user manually scrolls.

## Done looks like
- A new SMS arriving while the user is anywhere in the app (list, another thread, or even a different page) shows up in the right thread the instant the user opens it — no spinner, no 1–2 second wait, no swipe-refresh.
- Tapping a push notification — whether the app was closed, backgrounded, or already open — opens the exact thread the notification was about, every time. No more landing on the list.
- Opening a thread always scrolls to the most recent message, no matter what thread was open before. If the user manually scrolls back, that scroll is preserved (we don't yank them back to the bottom).
- A clearly worded `// LOCKED — do not modify without explicit user approval` block comment is added at the top of the realtime message handler, the push-tap handler, and the thread scroll-to-bottom effect, naming this task as the source of truth.

## Out of scope
- WebSocket reconnect behavior (already handled in Task #25).
- Push permission UX, FCM token retry, or sub-user push fan-out (also Task #25).
- The cold-start "wrong thread blinks first" issue (already handled in Task #34).
- Native iOS/Android rebuilds — Capacitor loads from `app.fusephone.com`, so this stays a web-only fix.
- Group/team channel messaging — only direct contact, phone-only, and project threads are in scope.
- Outbound message rendering (already instant via the existing send mutation cache write).

## Steps

1. **Make every inbound message land in the open thread instantly, even if the thread was never loaded.**
   The realtime `message.created` handler already appends the payload to the contact, phone, and project thread caches via `setQueriesData`, but the updater bails out when `old` is undefined (i.e., the thread query has not been fetched yet). Change the updater so that when there is no prior cache, it seeds the cache with `[msg]` instead of returning `undefined`. That way, the moment the user opens the thread, TanStack Query has the new message in cache and renders it immediately while the full history loads in the background. Apply this to all three thread keys (`/api/communications/{contactId}`, `/api/communications/by-phone/{phone}`, `/api/communications/project-thread/{projectId}`). Make sure the seed-with-one-message path doesn't trigger if the cache has already been set to `[]` by a completed empty fetch — only seed when truly absent.

2. **Stop the immediate invalidate from racing the cache append.**
   Right after the cache append, the matching active-thread invalidate fires with `refetchType: "all"`, which kicks off a refetch that will replace the just-appended cache. On a slow mobile connection that refetch can take long enough that the user briefly sees the optimistic message, then a flicker. Drop the immediate active-thread invalidate now that the cache append is authoritative — keep only the 500ms safety-net invalidate as a reconciliation step. The conversation-contacts and unread-count invalidates can stay immediate since those caches are list-shaped and benefit from a fresh server count.

3. **Make push tap reliably navigate to the right thread, every time.**
   Today the push URL flows through three different paths (`Capacitor PushNotifications.pushNotificationActionPerformed`, AppDelegate's `userNotificationCenter didReceive` with a 2-second delay on cold start, and the `__pendingPushUrl` global picked up by `usePendingPushNavigation`), and any single failure point loses the URL. Consolidate so all three paths funnel into one handler, and have that handler:
   - Always set `window.__pendingPushUrl` first (a queryable global that doesn't depend on event-listener timing).
   - Dispatch the `native-push-tapped` event after writing the global.
   - Have `App.tsx`'s navigation effect poll `__pendingPushUrl` on every render of `PrivateLayout` until it's consumed (with a guard so it only navigates once per URL), so a late-arriving URL is never lost.
   - Remove the 2-second `DispatchQueue.main.asyncAfter` wait in `applicationDidBecomeActive` and instead have AppDelegate inject a small JS shim that retries the dispatch until the listener exists (or for at most 10 seconds). This was an iPhone-only delay that we don't actually need anymore now that the global is queryable.
   
   Also collapse the duplicate `setLocation(url)` calls between `usePendingPushNavigation` (App.tsx) and `handleNativeTap` (use-notification-context.tsx) — only one of them should navigate. Pick the App.tsx path as the single source of truth, and have the notification-context handler only do the cache invalidations / mark-as-read work.

4. **Auto-scroll to the most recent message on every thread switch.**
   In `MessageThread`, the scroll-to-bottom `useEffect` currently depends only on `smsMessages.length`, so switching to a thread with the same message count as the previous one doesn't trigger a scroll. Add the selected thread's identifier (contact id / phone / projectId) to the dependency array, and also reset `hasInitiallyScrolled` immediately on thread change (we already do this, but the order matters — make sure the reset happens before the scroll effect runs). Keep the existing `requestAnimationFrame` + 50ms + 200ms safety triggers so the scroll lands after content renders. Do NOT scroll if the user has manually scrolled away from the bottom — preserve their position.

5. **Add `LOCKED` markers.**
   Add a clearly worded block comment at the top of:
   - The `case "message.created":` block in `client/src/lib/realtime.ts`.
   - The `handlePushTap` listener in `client/src/pages/Messages.tsx` and the `usePendingPushNavigation` function in `client/src/App.tsx`.
   - The scroll-to-bottom `useEffect` in `MessageThread` inside `client/src/pages/Messages.tsx`.
   The comment should say: "LOCKED — these blocks were stabilized after several rounds of debugging in Task <ref>. Do not modify without explicit user approval. See `.local/tasks/messages-realtime-final.md`." This makes it clear to future agents that touching these is a request that needs the user's go-ahead.

6. **Smoke test on iPhone after publish.**
   - Open the conversation list, have someone text in, then tap the new conversation. The new message should be visible the instant the thread opens.
   - With the app fully closed, tap a push notification for a contact thread, a phone-only thread, and a project thread. Each should land directly on the right thread, not on the list.
   - With the app backgrounded (not killed), do the same three taps. Same expectation.
   - Switch between two threads with the same message count and confirm both auto-scroll to the bottom.
   - Scroll up in a thread, then receive a new inbound message. The thread should NOT yank you back down (preserve manual scroll position).

## Relevant files
- `client/src/lib/realtime.ts:90-230`
- `client/src/lib/realtime.ts:46-78`
- `client/src/pages/Messages.tsx:990-1050`
- `client/src/pages/Messages.tsx:2780-2900`
- `client/src/pages/Messages.tsx:2040-2100`
- `client/src/App.tsx:555-600`
- `client/src/main.tsx:280-340`
- `client/src/hooks/use-notification-context.tsx:410-470`
- `client/src/hooks/use-company-settings.ts:98-115`
- `ios/App/App/AppDelegate.swift:60-130`