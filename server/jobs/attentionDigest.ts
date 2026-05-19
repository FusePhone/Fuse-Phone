import { db } from "../db";
import { sql } from "drizzle-orm";
import { sendPushToUser } from "../pushNotifications";
import {
  type AttentionProjectLike,
  isLowSentiment,
  hasOverdueOrSoonReminder,
  isPaused,
  needsScheduling,
  isIdle,
  getAttentionReason,
} from "@shared/attention";

// Per-project metadata used to enrich the push (title + contact name + reason).
interface ProjectMeta {
  title: string;
  contactName: string | null;
}

// Two notification flavors share the same underlying compute:
//
//   1. Immediate push — fires the moment a project enters the attention set.
//      We diff the current set against a per-user snapshot of IDs we've
//      already pinged about. Newly-added IDs trigger one push each (capped
//      per cycle so a sudden burst of 50 doesn't spam the lock screen).
//
//   2. Daily digest — fires once at the user's chosen local hour, even if
//      no new items appeared today, so stragglers don't rot. Sends ONE
//      push with the total count.
//
// The same scheduler tick handles both, every CHECK_INTERVAL_MS.

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 min — covers user-local hour buckets reliably
const MAX_IMMEDIATE_PER_USER_PER_TICK = 5; // anti-spam cap

function localHourFor(timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    });
    return parseInt(fmt.format(new Date()), 10);
  } catch {
    return new Date().getHours();
  }
}

function isSameLocalDay(a: Date, b: Date, timezone: string): boolean {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(a) === fmt.format(b);
  } catch {
    return a.toDateString() === b.toDateString();
  }
}

/** Compute current attention set + return both the count and the project IDs. */
function computeAttention(projects: AttentionProjectLike[]): { count: number; ids: number[] } {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const p of projects) {
    if (
      isLowSentiment(p) || hasOverdueOrSoonReminder(p) ||
      isPaused(p) || needsScheduling(p) || isIdle(p)
    ) {
      if (!seen.has(p.id)) { seen.add(p.id); ids.push(p.id); }
    }
  }
  return { count: ids.length, ids };
}

async function runTick(): Promise<void> {
  try {
    // Pull every user who has at least one device/push subscription. No point
    // computing for users we can't reach.
    const userRows: any = await db.execute(sql`
      SELECT cs.user_id,
             cs.timezone,
             cs.last_attention_digest_sent_at,
             cs.last_attention_digest_count,
             COALESCE(cs.attention_digest_enabled, true)    AS digest_enabled,
             COALESCE(cs.attention_digest_hour, 6)          AS digest_hour,
             COALESCE(cs.attention_immediate_enabled, true) AS immediate_enabled,
             cs.attention_last_notified_ids AS last_ids
      FROM company_settings cs
      WHERE EXISTS (
        SELECT 1 FROM device_tokens dt WHERE dt.user_id = cs.user_id
      ) OR EXISTS (
        SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = cs.user_id
      )
    `);
    const rows = userRows.rows || userRows;

    for (const row of rows) {
      const userId: string = row.user_id;
      const tz: string = row.timezone || 'America/New_York';
      const digestEnabled: boolean = !!row.digest_enabled;
      const immediateEnabled: boolean = !!row.immediate_enabled;
      const digestHour: number = Math.max(0, Math.min(23, parseInt(row.digest_hour, 10) || 6));
      const lastSent: Date | null = row.last_attention_digest_sent_at ? new Date(row.last_attention_digest_sent_at) : null;
      const lastIdsRaw = row.last_ids;
      // NULL = never observed this user yet → bootstrap mode: seed the
      // snapshot WITHOUT firing pushes so pre-existing attention items
      // don't burst-notify on first deploy.
      const isBootstrap = lastIdsRaw === null || lastIdsRaw === undefined;
      const lastIds: number[] = Array.isArray(lastIdsRaw)
        ? lastIdsRaw
        : (typeof lastIdsRaw === 'string' ? (() => { try { return JSON.parse(lastIdsRaw); } catch { return []; } })() : []);

      // If both notifications are off, skip the user entirely.
      if (!digestEnabled && !immediateEnabled) continue;

      // Pull this user's active projects + the contact name for each, so
      // the push body can say "Smith kitchen — Needs scheduling" instead of
      // a generic "A project needs your attention".
      const projRes: any = await db.execute(sql`
        SELECT p.id, p.stage, p.archived, p.scheduled_date, p.stage_changed_at, p.created_at,
               p.reminder_at, p.automation_paused_at, p.automation_paused_reason,
               p.sentiment_score, p.sentiment_updated_at,
               p.title AS project_title,
               c.name  AS contact_name
        FROM projects p
        LEFT JOIN contacts c ON c.id = p.contact_id
        WHERE p.user_id = ${userId} AND (p.archived = false OR p.archived IS NULL)
      `);
      const projRows = projRes.rows || projRes;

      const projects: AttentionProjectLike[] = [];
      const projectMeta = new Map<number, ProjectMeta>();
      for (const p of projRows) {
        projects.push({
          id: p.id,
          stage: p.stage,
          archived: p.archived,
          scheduledDate: p.scheduled_date,
          stageChangedAt: p.stage_changed_at,
          createdAt: p.created_at,
          reminderAt: p.reminder_at,
          automationPausedAt: p.automation_paused_at,
          automationPausedReason: p.automation_paused_reason,
          sentimentScore: p.sentiment_score,
          sentimentUpdatedAt: p.sentiment_updated_at,
        });
        projectMeta.set(p.id, {
          title: p.project_title || `Project #${p.id}`,
          contactName: p.contact_name || null,
        });
      }

      const { count, ids: currentIds } = computeAttention(projects);

      // --- IMMEDIATE PUSH (newly-added project IDs) ---
      // Snapshot persistence rule: only IDs we ACTUALLY notified about (plus
      // IDs that were already in the previous snapshot AND still present) go
      // into the new snapshot. That way IDs we skipped due to the per-tick
      // cap stay "new" and will fire on the next tick instead of being
      // silently swallowed.
      const lastSet = new Set<number>(lastIds);
      let notifiedThisTick: number[] = [];

      if (immediateEnabled && !isBootstrap) {
        const newlyAdded = currentIds.filter((id) => !lastSet.has(id));
        if (newlyAdded.length > 0) {
          const toNotify = newlyAdded.slice(0, MAX_IMMEDIATE_PER_USER_PER_TICK);
          // Need the project objects again to look up the reason per ID.
          const projectsById = new Map<number, AttentionProjectLike>(projects.map((p) => [p.id, p]));
          for (const pid of toNotify) {
            try {
              const meta = projectMeta.get(pid);
              const proj = projectsById.get(pid);
              const reason = proj ? getAttentionReason(proj) : null;
              // Title prefers project title; falls back to contact name; then a generic.
              const title = meta?.title || (meta?.contactName ? `${meta.contactName}'s project` : 'A project needs your attention');
              // Body says WHY plus who: "Needs scheduling — Jane Smith"
              const bodyParts: string[] = [];
              if (reason) bodyParts.push(reason.label);
              if (meta?.contactName) bodyParts.push(meta.contactName);
              const body = bodyParts.length > 0 ? bodyParts.join(' — ') : 'Tap to see what needs action.';
              // ?attentionReason=<type> lets the landing page show a dismissible
              // banner explaining why we sent the user here.
              const url = reason
                ? `/projects/${pid}?attentionReason=${reason.type}`
                : `/projects/${pid}`;
              await sendPushToUser(userId, {
                title,
                body,
                url,
                tag: `attention-immediate-${pid}`,
                projectId: pid,
              });
              notifiedThisTick.push(pid);
            } catch (e: any) {
              console.error('[AttentionDigest] immediate push error', userId, pid, e?.message);
            }
          }
          if (newlyAdded.length > MAX_IMMEDIATE_PER_USER_PER_TICK) {
            console.log(`[AttentionDigest] capped immediate pushes for user=${userId} (${newlyAdded.length} new, sent ${MAX_IMMEDIATE_PER_USER_PER_TICK}, ${newlyAdded.length - MAX_IMMEDIATE_PER_USER_PER_TICK} carry to next tick)`);
          }
        }
      }

      // Compute the new snapshot.
      //   - Bootstrap: seed with currentIds so future ticks have a baseline.
      //   - Immediate disabled: also seed with currentIds — re-enabling later
      //     shouldn't fire a burst for items the user already saw on screen.
      //   - Normal: keep previously-snapshotted IDs that are still present,
      //     plus the IDs we just notified about. Capped IDs stay un-seen.
      let nextSnapshot: number[];
      if (isBootstrap || !immediateEnabled) {
        nextSnapshot = currentIds;
      } else {
        const currentSet = new Set<number>(currentIds);
        const keptFromLast = lastIds.filter((id) => currentSet.has(id));
        nextSnapshot = Array.from(new Set<number>([...keptFromLast, ...notifiedThisTick]));
      }

      try {
        await db.execute(sql`
          UPDATE company_settings
          SET attention_last_notified_ids = ${JSON.stringify(nextSnapshot)}::jsonb
          WHERE user_id = ${userId}
        `);
      } catch (e: any) {
        console.error('[AttentionDigest] snapshot save error', userId, e?.message);
      }

      // --- DAILY DIGEST PUSH ---
      if (!digestEnabled) continue;
      if (localHourFor(tz) !== digestHour) continue;
      if (lastSent && isSameLocalDay(lastSent, new Date(), tz)) continue;

      // Stamp last_sent FIRST so we don't re-fire if the push call below is slow.
      await db.execute(sql`
        UPDATE company_settings
        SET last_attention_digest_sent_at = NOW(),
            last_attention_digest_count = ${count}
        WHERE user_id = ${userId}
      `);

      if (count === 0) continue;

      const title = count === 1 ? '1 project needs your attention' : `${count} projects need your attention`;
      await sendPushToUser(userId, {
        title,
        body: 'Tap to review and take action.',
        url: '/attention',
        tag: 'attention-digest',
      });
      console.log(`[AttentionDigest] daily digest sent to user=${userId} count=${count} hour=${digestHour} tz=${tz}`);
    }
  } catch (err: any) {
    console.error('[AttentionDigest] tick error:', err?.message);
  }
}

export function startAttentionDigestScheduler(): void {
  console.log('[AttentionDigest] scheduler started (5-min tick: immediate diffs + daily digest at user-local hour)');
  setInterval(() => { runTick().catch(() => {}); }, CHECK_INTERVAL_MS);
  // First run after 30s so it doesn't block boot.
  setTimeout(() => { runTick().catch(() => {}); }, 30 * 1000);
}
