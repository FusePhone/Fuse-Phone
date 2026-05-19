export type AttentionType = 'low_sentiment' | 'reminder' | 'paused' | 'needs_scheduling' | 'idle';

export const ATTENTION_PRIORITY: Record<AttentionType, number> = {
  low_sentiment: 1,
  reminder: 2,
  paused: 3,
  needs_scheduling: 4,
  idle: 5,
};

export interface AttentionProjectLike {
  id: number;
  stage: string;
  archived?: boolean | null;
  scheduledDate?: string | null;
  stageChangedAt?: Date | string | null;
  createdAt?: Date | string | null;
  reminderAt?: Date | string | null;
  automationPausedAt?: Date | string | null;
  automationPausedReason?: string | null;
  sentimentScore?: number | null;
  sentimentUpdatedAt?: Date | string | null;
}

function toMillis(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return isNaN(t) ? null : t;
}

export function isLowSentiment(p: AttentionProjectLike): boolean {
  const score = p.sentimentScore;
  if (score == null || score >= 40) return false;
  const updated = toMillis(p.sentimentUpdatedAt);
  const recent = updated ? (Date.now() - updated) < 14 * 24 * 60 * 60 * 1000 : false;
  return recent && p.stage !== 'completed' && p.stage !== 'cancelled';
}

export function hasOverdueOrSoonReminder(p: AttentionProjectLike): boolean {
  const r = toMillis(p.reminderAt);
  return r != null && r <= Date.now() + 24 * 60 * 60 * 1000;
}

export function isPaused(p: AttentionProjectLike): boolean {
  return !!(p.automationPausedReason && p.automationPausedAt);
}

export function needsScheduling(p: AttentionProjectLike): boolean {
  return p.stage === 'accepted' && !p.scheduledDate && !p.archived;
}

export function isIdle(p: AttentionProjectLike): boolean {
  if (['completed', 'paid'].includes(p.stage) || p.archived) return false;
  const last = toMillis(p.stageChangedAt) ?? toMillis(p.createdAt);
  if (!last) return false;
  const idleDays = Math.floor((Date.now() - last) / (1000 * 60 * 60 * 24));
  const threshold = ['new_lead', 'appointment_requested', 'draft'].includes(p.stage) ? 3
    : p.stage === 'proposal_sent' ? 5
    : p.stage === 'invoiced' ? 7 : 7;
  return idleDays >= threshold;
}

/**
 * Pick the single most-important reason a project needs attention, ordered
 * by ATTENTION_PRIORITY. Returns a short human-readable label suitable for
 * a push notification body. Returns null when no rule applies.
 */
export function getAttentionReason(p: AttentionProjectLike): { type: AttentionType; label: string } | null {
  if (isLowSentiment(p))          return { type: 'low_sentiment',   label: 'Customer seems unhappy' };
  if (hasOverdueOrSoonReminder(p)) return { type: 'reminder',        label: 'Reminder due' };
  if (isPaused(p))                 return { type: 'paused',          label: 'Automation paused' };
  if (needsScheduling(p))          return { type: 'needs_scheduling', label: 'Needs scheduling' };
  if (isIdle(p))                   return { type: 'idle',            label: 'Going stale' };
  return null;
}

/** Count distinct projects needing attention. Same rules as the Attention page. */
export function countAttentionProjects(projects: AttentionProjectLike[]): number {
  const ids = new Set<number>();
  for (const p of projects) {
    if (isLowSentiment(p) || hasOverdueOrSoonReminder(p) || isPaused(p) || needsScheduling(p) || isIdle(p)) {
      ids.add(p.id);
    }
  }
  return ids.size;
}
