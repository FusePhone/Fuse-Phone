import { queryClient } from "./queryClient";

function parseUtcTs(ts: any): number {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime() || 0;
  const s = String(ts);
  const d = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s) ? new Date(s) : new Date(s + 'Z');
  return d.getTime() || 0;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;
let isConnecting = false;
let intentionalClose = false;

interface RealtimeEvent {
  type: string;
  tenantId: string;
  contactId?: number;
  threadId?: number;
  projectId?: number;
  documentId?: number;
  invoiceId?: number;
  channelId?: number;
  senderId?: string;
  payload?: any;
}

let currentUserId: string | null = null;
export function setRealtimeUserId(userId: string | null) {
  currentUserId = userId;
}

// Tracks which message thread the user is currently viewing so the
// message.created handler can refresh the conversation list and active
// thread immediately when an inbound SMS belongs to it (instead of
// waiting for the 500ms safety-net invalidation).
type ActiveThread =
  | { kind: 'contact'; contactId: number }
  | { kind: 'phone'; phoneNumber: string }
  | { kind: 'project'; projectId: number }
  | null;
let activeThread: ActiveThread = null;
export function setActiveMessageThread(thread: ActiveThread) {
  activeThread = thread;
}
function normalizePhone(p: string | undefined | null): string {
  if (!p) return '';
  // Compare on digits only so formatting differences (spaces, dashes,
  // parens, leading +1) don't cause the active-thread match to miss.
  return String(p).replace(/\D+/g, '');
}
function eventMatchesActiveThread(event: RealtimeEvent, msg: any): boolean {
  if (!activeThread) return false;
  const evtProjectId = msg?.projectId ?? (event as any).projectId;
  if (activeThread.kind === 'project') {
    return !!evtProjectId && evtProjectId === activeThread.projectId;
  }
  if (evtProjectId) return false;
  if (activeThread.kind === 'contact') {
    return event.contactId === activeThread.contactId;
  }
  if (activeThread.kind === 'phone') {
    const senderPhone = normalizePhone(msg?.phoneNumber || msg?.from);
    const activePhone = normalizePhone(activeThread.phoneNumber);
    if (!senderPhone || !activePhone) return false;
    // Match either exactly or by suffix to handle +1 / country-code variants.
    return senderPhone === activePhone
      || senderPhone.endsWith(activePhone)
      || activePhone.endsWith(senderPhone);
  }
  return false;
}

function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  let url = `${protocol}//${host}/ws/realtime`;

  const nativeToken = (window as any).__fusephone_access_token;
  if (nativeToken) {
    url += `?token=${encodeURIComponent(nativeToken)}`;
  }
  return url;
}

function handleEvent(event: RealtimeEvent): void {
  switch (event.type) {
    // ============================================================
    // LOCKED — Task #37 (Lock down inbound messaging once and for all)
    // This block was stabilized after several rounds of debugging.
    // It writes the inbound message directly into the thread cache
    // (seeding the cache when absent) so opening the thread shows
    // the message instantly, with no network refetch. Do NOT modify
    // without explicit user approval.
    // See `.local/tasks/messages-realtime-final.md` for context.
    // ============================================================
    case "message.created":
      if (event.payload) {
        const msg = event.payload;
        const cId = event.contactId;
        const msgProjectId = msg.projectId || (event as any).projectId;
        const senderPhone = msg.phoneNumber || msg.from;

        // Helper: append msg to a thread cache; SEED with [msg] when no
        // cache exists yet so the user sees the message the instant they
        // open the thread (instead of waiting for a network fetch). An
        // empty array (completed empty fetch) becomes [msg] via spread.
        const upsertThread = (key: any[]) => {
          queryClient.setQueryData(key, (old: any) => {
            if (old === undefined || old === null) return [msg];
            if (!Array.isArray(old)) return old;
            if (old.some((m: any) => m.id === msg.id)) return old;
            return [...old, msg];
          });
        };

        // Upsert into the appropriate thread cache. Project-tagged
        // messages live in the project thread ONLY (don't contaminate
        // the direct contact thread). Direct messages upsert into the
        // contact thread AND the by-phone thread when those identifiers
        // are available — phone-only inbound messages (no contactId,
        // typical for unknown numbers) still seed the by-phone cache.
        if (msgProjectId) {
          upsertThread(["/api/communications/project-thread", msgProjectId]);
          queryClient.invalidateQueries({ queryKey: ["/api/communications/project-conversations"] });
        } else {
          if (cId !== undefined && cId !== null) {
            upsertThread(["/api/communications", cId]);
          }
          if (senderPhone) {
            upsertThread(["/api/communications/by-phone", senderPhone]);
          }
        }

        // Conversation-contacts list update only applies when we have a
        // contact id and this isn't a project-thread event.
        if (!msgProjectId && cId !== undefined && cId !== null) {
          // Tracks whether the contact already exists in any
          // conversation-contacts cache. If not, we fall back to a
          // targeted invalidation below so a brand-new contact's first
          // inbound message (e.g., DripJobs sending us SMS for the
          // first time) actually appears in the conversation list
          // instead of being silently dropped.
          let contactWasInList = false;
          queryClient.setQueriesData(
            { queryKey: ["/api/communications/conversation-contacts"] },
            (old: any) => {
              if (!Array.isArray(old)) return old;
              const existing = old.find((c: any) => c.id === cId);
              if (existing) {
                contactWasInList = true;
                const updated = old.map((c: any) =>
                  c.id === cId
                    ? {
                        ...c,
                        last_message: msg.body || msg.content || c.last_message,
                        last_message_time: msg.timestamp || msg.createdAt || new Date().toISOString(),
                        last_message_direction: msg.direction || 'inbound',
                        unread_count: (c.unread_count || 0) + (msg.direction === 'inbound' ? 1 : 0),
                      }
                    : c
                );
                updated.sort((a: any, b: any) => {
                  const ta = parseUtcTs(a.last_message_time);
                  const tb = parseUtcTs(b.last_message_time);
                  return tb - ta;
                });
                return updated;
              }
              return old;
            }
          );
          // Brand-new contact path: optimistic in-place update isn't
          // possible because we don't have the full conversation-list
          // row shape (display name, archived flag, last seen, etc.).
          // Force a refetch so the server reconstructs the row and
          // it shows up in the sidebar immediately.
          if (!contactWasInList) {
            queryClient.invalidateQueries({
              queryKey: ["/api/communications/conversation-contacts"],
              refetchType: "all",
            });
          }
        }

        if (msg.direction === 'inbound') {
          const contactName = (msg as any).contactName || msg.contact?.name || senderPhone || 'Unknown';
          window.dispatchEvent(new CustomEvent('ws-incoming-message', {
            detail: {
              contactId: cId,
              contactName,
              content: msg.body || msg.content || '',
              phoneNumber: senderPhone,
            }
          }));
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/communications/recent-incoming"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/unknown-numbers"], refetchType: "all" });
      // NOTE: We deliberately do NOT invalidate the active thread cache here.
      // The cache append above is authoritative; an immediate refetch would
      // race the optimistic write and cause a flicker. The 500ms safety net
      // below reconciles eventually if the server differs.
      if (event.payload && eventMatchesActiveThread(event, event.payload)) {
        queryClient.invalidateQueries({ queryKey: ["/api/communications/conversation-contacts"], refetchType: "all" });
        const evtProjectId = (event.payload as any)?.projectId ?? (event as any).projectId;
        if (evtProjectId) {
          queryClient.invalidateQueries({ queryKey: ["/api/communications/project-conversations"], refetchType: "all" });
        }
      }
      // 500ms safety-net thread refetch REMOVED — the cache append above
      // is authoritative and the delayed invalidate was causing the
      // user-visible "blink" right after a new message arrived. Sidebar
      // and unrelated lists still get refreshed below so other UI stays
      // in sync. The active thread itself stays trusted to the WS append.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/communications/conversation-contacts"], refetchType: "all" });
        queryClient.invalidateQueries({ queryKey: ["/api/communications/project-conversations"], refetchType: "all" });
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        queryClient.invalidateQueries({ queryKey: ["/api/ai-drafts/pending"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      }, 500);
      break;
    case "project.message.created":
      if ((event as any).projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/communications/project-thread", (event as any).projectId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/communications/project-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
      break;

    // ============================================================
    // Subscription change push — fires from /api/iap/sync AND
    // /api/iap/webhook the moment the server's user row is updated.
    // Closes the gap where StoreKit returns success but the paywall
    // poll times out before Apple's webhook delivers the real
    // (cross-grade) tier. WebSocket arrives → invalidate → UI
    // reconciles instantly without the user having to refresh.
    // ============================================================
    case "subscription.changed":
      // Diagnostic — confirms the WebSocket actually carried the push to
      // the phone. Forwarded to the server so we can see it in deployment
      // logs next to the matching [Realtime emit] line.
      try {
        const evAny: any = event as any;
        const tag = `[WS RECV] subscription.changed source=${evAny.source || "-"} tier=${evAny.tier || "-"} addon=${evAny.addon || "-"} notificationType=${evAny.notificationType || "-"} subtype=${evAny.subtype || "-"}`;
        // eslint-disable-next-line no-console
        console.info(tag);
        void fetch("/api/client-log", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({ tag: "ws.sub.changed", message: tag.slice(0, 480) }),
        }).catch(() => {});
      } catch { /* non-fatal */ }
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"], refetchType: "all" });
      break;

    case "notification.created":
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
      // Safety net for blocker #3: if the parallel `message.created`
      // event is dropped or arrives out of order (rare WS races around
      // iOS backgrounding / reconnect / cellular handoff), still
      // refresh the inbox + recent-incoming so the conversation list
      // preview doesn't stay stale until the next 10s sync poll.
      // Cheap — these are small list endpoints.
      queryClient.invalidateQueries({
        queryKey: ["/api/communications/conversation-contacts"],
        refetchType: "all",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/communications/recent-incoming"],
        refetchType: "all",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/communications/unknown-numbers"],
        refetchType: "all",
      });
      break;

    // ============================================================
    // LOCKED — Task #37 follow-up (calls must appear in the message
    // thread the instant they ring / end / get transcribed by AI).
    // The server emits call.updated when a call starts, status
    // changes, ends, or recording/transcript is attached. Calls live
    // in the same `communications` table as SMS messages and render
    // inline in the conversation thread (type='call'). Without the
    // ["/api/communications"] and ["/api/communications/project-thread"]
    // invalidates below, an open thread does NOT refetch and the
    // call/AI-handled-lead entry is invisible until manual refresh.
    // Do NOT remove these without explicit user approval.
    // ============================================================
    case "call.updated":
      if ('payload' in event) {
        queryClient.setQueryData(["/api/calls/active"], event.payload);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/communications/calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calls/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/conversation-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/by-phone"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/recent-incoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      // Active per-contact thread queries (`["/api/communications", contactId]`)
      // — broad prefix invalidate refetches every open contact thread so
      // the inbound/outbound call entry, end-of-call summary, and AI
      // transcript appear without manual refresh.
      queryClient.invalidateQueries({ queryKey: ["/api/communications"], refetchType: "all" });
      // Active project thread queries — same reason for project conversations.
      queryClient.invalidateQueries({ queryKey: ["/api/communications/project-thread"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/project-conversations"], refetchType: "all" });
      break;

    case "project.updated":
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      if (event.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId, "photos"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId, "source-photos"] });
      }
      break;

    case "contact.updated":
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      if (event.contactId) {
        queryClient.invalidateQueries({ queryKey: ["/api/contacts", event.contactId] });
      }
      break;

    case "document.updated":
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/recently-signed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/recent"] });
      if (event.documentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/documents", event.documentId] });
        queryClient.invalidateQueries({ queryKey: ["/api/documents/:id", event.documentId] });
        queryClient.invalidateQueries({ queryKey: ["/api/documents", event.documentId, "views"] });
        queryClient.invalidateQueries({ queryKey: ["/api/documents", event.documentId, "change-orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/documents", event.documentId, "payments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/documents", event.documentId, "photos"] });
      }
      if (event.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/documents", "project", event.projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId, "photos"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId, "source-photos"] });
      }
      break;

    case "payment.received":
    case "payment.updated":
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/recently-signed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/recent"] });
      if (event.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/documents", "project", event.projectId] });
      }
      if (event.documentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/documents", event.documentId] });
        queryClient.invalidateQueries({ queryKey: ["/api/documents/:id", event.documentId] });
        queryClient.invalidateQueries({ queryKey: ["/api/documents", event.documentId, "payments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/documents", event.documentId, "change-orders"] });
      }
      break;

    case "dashboard.refresh":
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/booking-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-actions?status=pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      break;

    case "materials.updated":
      queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
      break;

    case "surfaces.updated":
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces"] });
      break;

    case "settings.updated":
      queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/company"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/message-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposal-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production-calculators"] });
      break;

    case "colors.updated":
      if (event.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId, "colors"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId, "color-submission"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/paint-colors"] });
      break;

    case "booking.updated":
      queryClient.invalidateQueries({ queryKey: ["/api/booking-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      break;

    case "email.sent":
    case "sms.sent": {
      const sentMsg = (event as any).payload || event;
      const hasFullPayload = !!(sentMsg && (sentMsg as any).id && ((sentMsg as any).content !== undefined || (sentMsg as any).body !== undefined));
      const sentContactId = sentMsg.contactId || event.contactId;
      const sentProjectId = (sentMsg as any).projectId || (event as any).projectId;
      const sentPhone = (sentMsg as any).phoneNumber;

      // Sidebar: in-place last-message preview update so the conversation
      // list re-orders without a refetch.
      //
      // IMPORTANT: When the contact still has unread inbound messages
      // (e.g., a fresh "📋 New Booking Request" mimic message just
      // landed and we're firing the auto-reply 1s later), DO NOT
      // overwrite the inbox preview with our outbound text. Doing so
      // makes the row look like a normal already-handled conversation
      // and the user skims past it — bookings get missed. Keep the
      // inbound preview pinned until the user opens the thread (which
      // marks it read and frees the preview to reflect outbound sends
      // again). We still bump last_message_time so sort order is right.
      if (sentContactId) {
        queryClient.setQueriesData(
          { queryKey: ["/api/communications/conversation-contacts"] },
          (old: any) => {
            if (!Array.isArray(old)) return old;
            const updated = old.map((c: any) => {
              if (c.id !== sentContactId) return c;
              const hasUnread = (c.unread_count || 0) > 0;
              const newTime = sentMsg.timestamp || sentMsg.createdAt || new Date().toISOString();
              if (hasUnread) {
                // Preserve inbound preview; only refresh sort time.
                return { ...c, last_message_time: newTime };
              }
              return {
                ...c,
                last_message: sentMsg.body || sentMsg.content || c.last_message,
                last_message_time: newTime,
                last_message_direction: 'outbound',
                last_message_type: sentMsg.type || 'sms',
              };
            });
            updated.sort((a: any, b: any) => {
              const ta = parseUtcTs(a.last_message_time);
              const tb = parseUtcTs(b.last_message_time);
              return tb - ta;
            });
            return updated;
          }
        );
      }

      if (hasFullPayload) {
        // Direct upsert into the active thread cache(s) — replaces any
        // optimistic placeholder with the real server row, no refetch.
        const upsertOutbound = (key: any[]) => {
          queryClient.setQueryData(key, (old: any) => {
            if (!Array.isArray(old)) return old;
            // Drop any optimistic placeholder for this same outbound
            // (negative id) whose content matches — prevents duplicate
            // bubbles when the realtime event races the HTTP response.
            const sentBody = (sentMsg.content ?? sentMsg.body ?? '') as string;
            const cleaned = old.filter((m: any) => !(
              m && m._optimistic &&
              m.direction === 'outbound' &&
              typeof m.id === 'number' && m.id < 0 &&
              ((m.content ?? '') === sentBody)
            ));
            // Dedup against a real row with the same id already present.
            if (cleaned.some((m: any) => m.id === sentMsg.id)) return cleaned;
            return [...cleaned, sentMsg];
          });
        };
        if (sentProjectId) {
          upsertOutbound(["/api/communications/project-thread", sentProjectId]);
        }
        if (sentContactId) {
          upsertOutbound(["/api/communications", sentContactId]);
        }
        if (sentPhone) {
          upsertOutbound(["/api/communications/by-phone", sentPhone]);
        }
      }

      // List-level invalidations (cheap, sidebar/aggregates only). We
      // intentionally do NOT invalidate the per-thread caches when we
      // already have the full payload — the upsert above is authoritative
      // and a refetch would race with optimistic placeholders and cause
      // a flicker on slow networks (notably iOS cellular).
      queryClient.invalidateQueries({ queryKey: ["/api/communications/conversation-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/unknown-numbers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/recent-incoming"] });
      if (!hasFullPayload) {
        // Legacy fallback: server emitted lite event, refetch threads.
        queryClient.invalidateQueries({ queryKey: ["/api/communications/by-phone"] });
        queryClient.invalidateQueries({ queryKey: ["/api/communications/project-thread"] });
        if (event.contactId) {
          queryClient.invalidateQueries({ queryKey: ["/api/communications", event.contactId] });
        }
      } else if (sentProjectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/communications/project-conversations"] });
      }
      break;
    }

    case "team_message.created": {
      const isSelfSent = event.senderId && currentUserId && event.senderId === currentUserId;
      if (event.payload && event.channelId) {
        const msgPayload = event.payload;
        queryClient.setQueriesData(
          { queryKey: ["/api/team/channels", event.channelId, "messages"] },
          (old: any) => {
            if (!Array.isArray(old)) return old;
            if (old.some((m: any) => m.id === msgPayload.id)) return old;
            return [...old, msgPayload];
          }
        );
      }
      queryClient.invalidateQueries({ queryKey: ["/api/team/channels"], refetchType: "all" });
      if (!isSelfSent) {
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"], refetchType: "all" });
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"], refetchType: "all" });
      }
      if (event.channelId) {
        queryClient.invalidateQueries({ queryKey: ["/api/team/channels", event.channelId, "messages"], refetchType: "all" });
      } else {
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return Array.isArray(key) && key.length === 3 && key[0] === "/api/team/channels" && key[2] === "messages";
          },
          refetchType: "all",
        });
      }
      break;
    }

    case "support_message.created":
      queryClient.invalidateQueries({ queryKey: ["/api/support/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-messages"] });
      break;

    case "appointment.updated":
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/booking-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-actions?status=pending"] });
      break;

    case "appointment_session.started":
    case "appointment_session.ended":
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-sessions/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      break;

    case "time_entry.updated":
      queryClient.invalidateQueries({
        predicate: (query) => {
          const k = query.queryKey;
          if (!Array.isArray(k)) return false;
          const first = k[0] as string;
          return first === "/api/time-entries" || first.startsWith("/api/time-entries");
        }
      });
      if (event.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId, "job-costing"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/my-jobs", event.projectId, "time-entries"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs/weekly-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      break;

    case "expense.updated":
      if (event.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId, "expenses"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId, "job-costing"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId, "lite-pnl"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/my-jobs", event.projectId, "receipts"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      break;

    case "crew_note.updated":
      queryClient.invalidateQueries({ queryKey: ["/api/crew-notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crew-notes/unread"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      break;

    case "crew.updated":
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs/weekly-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crew-groups"] });
      if (event.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId, "crew"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", event.projectId, "job-costing"] });
      }
      queryClient.invalidateQueries({
        predicate: (query) => {
          const k = query.queryKey;
          if (!Array.isArray(k) || k.length < 3) return false;
          return k[0] === "/api/projects" && k[2] === "crew";
        }
      });
      break;
  }
}

let reconnectDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastReconnectTime = 0;

// Cache keys we MUST refresh on every reconnect, regardless of whether a
// component is currently observing them — the sidebar Messages badge, the
// conversation list and per-thread views need to re-sync after the WebSocket
// dropped (sleep, app backgrounded, network change, signal loss).
const ALWAYS_REFETCH_ON_RECONNECT: ReadonlyArray<readonly unknown[]> = [
  ["/api/notifications/unread"],
  ["/api/notifications"],
  ["/api/communications/conversation-contacts"],
  ["/api/communications/recent-incoming"],
  ["/api/communications/unknown-numbers"],
  ["/api/communications/project-conversations"],
  ["/api/team/channels"],
  // Calls list + active-call state. Without these, the Calls page shows
  // stale data after iOS app resume / network restore unless the user is
  // already sitting on the Calls tab when reconnect fires. The broad
  // "/api/communications" predicate below does NOT match these because
  // queryKey[0] is the full string "/api/communications/calls", not the
  // bare prefix. See predicate at the bottom of onReconnect().
  ["/api/communications/calls"],
  ["/api/calls/active"],
];

function onReconnect(): void {
  const now = Date.now();
  if (now - lastReconnectTime < 2000) return;
  lastReconnectTime = now;

  // Refetch any query that has a live observer (existing behaviour).
  queryClient.invalidateQueries({
    predicate: (query) => {
      const observers = (query as any).observers?.length ?? 0;
      return observers > 0;
    },
  });

  // Force-refresh messaging caches even if no component is currently mounted
  // for them. This way the badge / list / thread are correct the moment the
  // user navigates after a sleep/resume cycle.
  for (const key of ALWAYS_REFETCH_ON_RECONNECT) {
    queryClient.invalidateQueries({ queryKey: key as unknown[], refetchType: "all" });
  }
  queryClient.invalidateQueries({
    predicate: (query) => {
      const k = query.queryKey;
      if (!Array.isArray(k)) return false;
      const first = k[0];
      return (
        first === "/api/communications" ||
        first === "/api/communications/by-phone" ||
        first === "/api/communications/project-thread" ||
        first === "/api/communications/group-thread"
      );
    },
    refetchType: "all",
  });

  notifyConnectionListeners();
}

export function forceRefreshOnResume(): void {
  if (intentionalClose) return;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;

  // Detach handlers on the old socket BEFORE closing so the stale onclose
  // can't null out a freshly-connected replacement and toggle our connection
  // status to "disconnected" mid-resume.
  if (ws) {
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
    } catch {}
    try { ws.close(); } catch {}
    ws = null;
  }
  stopHeartbeat();
  isConnecting = false;
  connectRealtime();

  lastReconnectTime = 0;
  onReconnect();
}

// Heartbeat: send a ping every HEARTBEAT_INTERVAL_MS. If we don't see a pong
// within HEARTBEAT_TIMEOUT_MS, force a reconnect — covers the case where the
// underlying TCP socket is dead but readyState still claims OPEN (extremely
// common on iOS after backgrounding / cellular handoff).
const HEARTBEAT_INTERVAL_MS = 20000;
const HEARTBEAT_TIMEOUT_MS = 10000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let pongTimeout: ReturnType<typeof setTimeout> | null = null;

function clearPongTimeout(): void {
  if (pongTimeout) {
    clearTimeout(pongTimeout);
    pongTimeout = null;
  }
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  clearPongTimeout();
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    const sock = ws;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    try {
      sock.send("ping");
    } catch {
      console.warn("[Realtime] Heartbeat send failed, reconnecting");
      forceRefreshOnResume();
      return;
    }
    clearPongTimeout();
    pongTimeout = setTimeout(() => {
      console.warn("[Realtime] Heartbeat pong timeout, forcing reconnect");
      forceRefreshOnResume();
    }, HEARTBEAT_TIMEOUT_MS);
  }, HEARTBEAT_INTERVAL_MS);
}

// ============================================================
// CONVERSATION-CONTACTS → THREAD CACHE SEEDER
//
// Why this exists: WebSocket events can be missed when the iOS app is
// backgrounded or cellular hands off — the live `message.created` event
// is dropped along with the socket. On reconnect, `onReconnect()`
// refetches `/api/communications/conversation-contacts` (small/fast — the
// sidebar updates almost instantly and FEELS like a WebSocket push) AND
// the per-thread `["/api/communications", N]` caches (bigger, slower).
// Without this seeder, the user opens a thread before the per-thread
// refetch returns and sees ONLY the older cached messages — the new SMS
// is missing for several seconds even though the sidebar preview already
// shows it.
//
// Fix: subscribe to conversation-contacts cache changes. Whenever a row's
// `last_message_id` is not yet present in that contact's per-thread
// cache, synthesize a placeholder bubble (using the REAL DB id from the
// row) and append it. When the per-thread refetch lands moments later,
// it dedups by id so the placeholder is replaced transparently — no
// flicker, no duplicate, and the new message is visible the instant the
// user clicks into the thread.
// ============================================================
let cacheSeederInstalled = false;
function installConversationContactsThreadSeeder(): void {
  if (cacheSeederInstalled) return;
  cacheSeederInstalled = true;
  queryClient.getQueryCache().subscribe((event: any) => {
    if (!event) return;
    // Handle both 'added' (first time the query lands in the cache —
    // happens on a cold start where conv-contacts didn't exist before)
    // and 'updated' (every subsequent refetch landing). Without 'added'
    // the seeder misses the very first conv-contacts result after app
    // launch — which is the EXACT moment a returning user opens the
    // app, sees a new preview in the inbox, taps in, and otherwise
    // would see the old thread until the per-thread refetch lands.
    if (event.type !== "updated" && event.type !== "added") return;
    const k = event.query?.queryKey;
    if (!Array.isArray(k) || k[0] !== "/api/communications/conversation-contacts") return;
    const data = event.query.state?.data;
    if (!Array.isArray(data)) return;
    for (const c of data) {
      if (!c || typeof c.id !== "number") continue;
      const rawId = c.last_message_id;
      const lastId = typeof rawId === "number" ? rawId : rawId != null ? Number(rawId) : NaN;
      if (!lastId || Number.isNaN(lastId)) continue;
      const lastType = c.last_message_type;
      // Seed sms/email/call. For calls, the conversation-contacts row
      // carries content (status), direction, and timestamp — enough to
      // render the inline call event. The recording button (if any)
      // appears the moment the per-thread refetch lands and dedups by
      // id, so the call shows up instantly on click. Skip unknown
      // future types defensively.
      if (lastType !== "sms" && lastType !== "email" && lastType !== "call") continue;
      const threadKey = ["/api/communications", c.id];
      const tsMs = parseUtcTs(c.last_message_time);
      queryClient.setQueryData(threadKey, (old: any) => {
        if (Array.isArray(old)) {
          // If the message id is already present, nothing to do.
          if (old.some((m: any) => m && m.id === lastId)) return old;
          // Belt-and-suspenders: also bail out if the cache already
          // contains a message with the same timestamp (covers a
          // resync race where the LIVE message.created handler
          // already wrote the real row but conv-contacts is just
          // catching up).
          if (tsMs && old.some((m: any) => parseUtcTs(m?.timestamp || m?.createdAt) === tsMs)) return old;
        }
        const ts = c.last_message_time || new Date().toISOString();
        const synthetic = {
          id: lastId,
          contactId: c.id,
          phoneNumber: c.phone || c.phoneNumber || null,
          type: lastType,
          direction: c.last_message_direction || "inbound",
          content: c.last_message || "",
          body: c.last_message || "",
          timestamp: ts,
          createdAt: ts,
          isRead: false,
          messageSid: null,
          projectId: null,
        };
        if (!Array.isArray(old)) return [synthetic];
        return [...old, synthetic];
      });
    }
  });
}

// Install the seeder eagerly at module load so it's wired BEFORE any
// cache events can fire — including the very first conv-contacts
// 'added' event after a cold launch / page reload. Previously the
// seeder was only wired inside connectRealtime(), and on a typical
// iOS resume the conv-contacts refetch fires almost simultaneously
// with the WebSocket reconnect — meaning the seeder subscription
// occasionally missed the very 'added'/'updated' event it was built
// to catch, leaving the user staring at the old thread for several
// seconds while the per-thread refetch landed.
installConversationContactsThreadSeeder();

export function connectRealtime(): void {
  installConversationContactsThreadSeeder();
  if (ws?.readyState === WebSocket.OPEN || isConnecting) return;

  intentionalClose = false;
  isConnecting = true;
  const url = getWsUrl();

  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
    ws = socket;
  } catch {
    isConnecting = false;
    scheduleReconnect();
    return;
  }

  // Capture-by-instance: each handler exits early if the global `ws` no
  // longer points at the socket it was bound to. Without this, callbacks
  // from a stale socket (still pending in CLOSING state, or fired late by
  // the browser) can null out / mutate state belonging to a brand-new live
  // socket — producing false-disconnect indicators and reconnect churn.
  socket.onopen = () => {
    if (ws !== socket) return;
    isConnecting = false;
    if (reconnectAttempts > 0) {
      onReconnect();
    }
    reconnectAttempts = 0;
    startHeartbeat();
    notifyConnectionListeners();
    console.log("[Realtime] Connected");
  };

  socket.onmessage = (ev) => {
    if (ws !== socket) return;
    try {
      // Server replies "pong" (plain string) to our heartbeat ping. Anything
      // else is a JSON realtime event.
      if (typeof ev.data === "string" && ev.data === "pong") {
        clearPongTimeout();
        return;
      }
      const event = JSON.parse(ev.data) as RealtimeEvent;
      handleEvent(event);
    } catch {}
  };

  socket.onclose = () => {
    if (ws !== socket) return;
    isConnecting = false;
    ws = null;
    stopHeartbeat();
    notifyConnectionListeners();
    if (!intentionalClose) {
      scheduleReconnect();
    }
  };

  socket.onerror = () => {
    if (ws !== socket) return;
    // Treat error like a close — the browser will fire onclose right after,
    // but on some platforms it doesn't. Force the socket dead ourselves so
    // the next reconnect isn't blocked by a still-OPEN readyState check.
    isConnecting = false;
    try {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
    } catch {}
    try { socket.close(); } catch {}
    ws = null;
    stopHeartbeat();
    notifyConnectionListeners();
    if (!intentionalClose) {
      scheduleReconnect();
    }
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectRealtime();
  }, delay);
}

export function disconnectRealtime(): void {
  intentionalClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  stopHeartbeat();
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try { ws.close(); } catch {}
    ws = null;
  }
  isConnecting = false;
  notifyConnectionListeners();
}

export function isRealtimeConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}

// Lightweight pub/sub so the sidebar (and anyone else) can render a live
// connection-status indicator without polling.
type ConnectionListener = (connected: boolean) => void;
const connectionListeners = new Set<ConnectionListener>();

function notifyConnectionListeners(): void {
  const connected = isRealtimeConnected();
  for (const listener of connectionListeners) {
    try {
      listener(connected);
    } catch {}
  }
}

export function subscribeRealtimeStatus(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  // Push current state immediately so subscribers don't have to wait for the
  // next event.
  try { listener(isRealtimeConnected()); } catch {}
  return () => {
    connectionListeners.delete(listener);
  };
}

let visibilityHandlerRegistered = false;
let crossDeviceSyncTimer: ReturnType<typeof setInterval> | null = null;

function startCrossDeviceSync(): void {
  if (crossDeviceSyncTimer) return;
  crossDeviceSyncTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectRealtime();
      return;
    }
    try { ws.send('ping'); } catch {}
    const coreKeys = [
      ["/api/notifications/unread"],
      ["/api/dashboard/pipeline"],
      ["/api/projects"],
      ["/api/contacts"],
      ["/api/documents"],
      ["/api/team/channels"],
      ["/api/appointments"],
      ["/api/my-jobs"],
      ["/api/communications/recent-incoming"],
      ["/api/communications/conversation-contacts"],
      ["/api/metrics"],
    ];
    for (const key of coreKeys) {
      queryClient.invalidateQueries({ queryKey: key, refetchType: "active" });
    }
    queryClient.invalidateQueries({
      predicate: (query) => {
        const k = query.queryKey;
        if (!Array.isArray(k)) return false;
        return (
          k[0] === "/api/communications" ||
          k[0] === "/api/communications/by-phone" ||
          k[0] === "/api/communications/project-thread" ||
          k[0] === "/api/communications/group-thread"
        );
      },
      refetchType: "active",
    });
  }, 10000);
}

function stopCrossDeviceSync(): void {
  if (crossDeviceSyncTimer) {
    clearInterval(crossDeviceSyncTimer);
    crossDeviceSyncTimer = null;
  }
}

let networkHandlerRegistered = false;

function registerNetworkHandler(): void {
  if (networkHandlerRegistered) return;
  networkHandlerRegistered = true;

  window.addEventListener("online", () => {
    console.log("[Realtime] Network back online, reconnecting and refreshing data");
    forceRefreshOnResume();
  });

  window.addEventListener("offline", () => {
    // Some browsers fire stale "offline" events even when the network is
    // actually fine — gate on navigator.onLine to avoid tearing down a
    // perfectly healthy socket.
    if (typeof navigator !== "undefined" && navigator.onLine) return;

    // Tear the socket down immediately so the indicator goes amber and we
    // don't waste pings into the void. The reconnect loop will pick up when
    // 'online' fires. Note: readyState may still report OPEN even when the
    // network is down, which is why we explicitly close + null here instead
    // of relying on notifyConnectionListeners alone.
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
      } catch {}
      try { ws.close(); } catch {}
      ws = null;
    }
    stopHeartbeat();
    isConnecting = false;
    notifyConnectionListeners();
  });
}

let capacitorAppHandlerRegistered = false;

function registerCapacitorAppHandler(): void {
  if (capacitorAppHandlerRegistered) return;
  capacitorAppHandlerRegistered = true;

  // On iOS Capacitor the JS engine is paused while the app is in the
  // background — `visibilitychange` does fire on resume, but the WebSocket
  // is almost always in a half-dead state by then (TCP killed by iOS). Wire
  // the Capacitor App lifecycle hooks so we always tear it down and rebuild
  // the moment the user comes back to the app.
  (async () => {
    try {
      const isNative =
        (window as any).Capacitor?.isNativePlatform?.() === true ||
        (window as any).__CAPACITOR_NATIVE === true;
      if (!isNative) return;

      const mod = await import("@capacitor/app");
      const App = (mod as any).App;
      if (!App?.addListener) return;

      App.addListener("appStateChange", (state: { isActive: boolean }) => {
        if (state?.isActive) {
          console.log("[Realtime] Capacitor app became active, force-reconnecting");
          forceRefreshOnResume();
        } else {
          // Going inactive — stop the heartbeat so we don't burn pings while
          // backgrounded. The socket will be torn down + rebuilt on resume.
          stopHeartbeat();
        }
      });

      App.addListener("resume", () => {
        console.log("[Realtime] Capacitor app resumed, force-reconnecting");
        forceRefreshOnResume();
      });
    } catch {
      /* not Capacitor or plugin not installed — fine */
    }
  })();

  // Capacitor Network plugin: on iOS the JS-level `online`/`offline` window
  // events are sometimes missed when the OS swaps between WiFi/cellular.
  // The Network plugin fires reliably from the native layer, so wire it in
  // alongside the browser events for belt-and-suspenders coverage.
  (async () => {
    try {
      const isNative =
        (window as any).Capacitor?.isNativePlatform?.() === true ||
        (window as any).__CAPACITOR_NATIVE === true;
      if (!isNative) return;

      const mod = await import("@capacitor/network");
      const Network = (mod as any).Network;
      if (!Network?.addListener) return;

      Network.addListener("networkStatusChange", (status: { connected: boolean }) => {
        if (status?.connected) {
          console.log("[Realtime] Capacitor network connected, force-reconnecting");
          forceRefreshOnResume();
        } else {
          console.log("[Realtime] Capacitor network disconnected, tearing down socket");
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          if (ws) {
            try {
              ws.onopen = null;
              ws.onmessage = null;
              ws.onclose = null;
              ws.onerror = null;
            } catch {}
            try { ws.close(); } catch {}
            ws = null;
          }
          stopHeartbeat();
          isConnecting = false;
          notifyConnectionListeners();
        }
      });
    } catch {
      /* not Capacitor or @capacitor/network not installed — fine */
    }
  })();
}

export function registerVisibilityHandler(): void {
  if (visibilityHandlerRegistered) return;
  visibilityHandlerRegistered = true;

  registerNetworkHandler();
  registerCapacitorAppHandler();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !intentionalClose) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectRealtime();
      }
      onReconnect();
      startCrossDeviceSync();
    } else {
      stopCrossDeviceSync();
    }
  });

  if (document.visibilityState === "visible") {
    startCrossDeviceSync();
  }
}
