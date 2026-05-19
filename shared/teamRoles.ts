export const BUILT_IN_FIELD_WORKER_ROLES = ['crew_lead', 'laborer'] as const;
export const BUILT_IN_OFFICE_ROLES = ['office_manager', 'project_manager', 'sales_rep'] as const;

export function isFieldWorkerRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (BUILT_IN_FIELD_WORKER_ROLES as readonly string[]).includes(role);
}

export function isOfficeRole(role: string | null | undefined): boolean {
  if (!role) return false;
  if (role === 'owner') return false;
  if ((BUILT_IN_FIELD_WORKER_ROLES as readonly string[]).includes(role)) return false;
  return true;
}

export const FIELD_WORKER_ALLOWED_CAPABILITIES = new Set<string>([
  'viewTeamMessages',
  'viewAssignedJobs',
  'viewWorkOrders',
  'viewCrewCalendar',
  'clockInOut',
  'manageCrewClock',
  'manageCrew',
  'uploadPhotos',
  'addDailyLogs',
  'viewProjects',
]);

export function canAssignCapabilityToRole(role: string | null | undefined, capability: string): boolean {
  if (!isFieldWorkerRole(role)) return true;
  return FIELD_WORKER_ALLOWED_CAPABILITIES.has(capability);
}

export function sanitizeCapabilitiesForRole(
  role: string | null | undefined,
  capabilities: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  if (!capabilities) return {};
  if (!isFieldWorkerRole(role)) return { ...capabilities };
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(capabilities)) {
    if (FIELD_WORKER_ALLOWED_CAPABILITIES.has(k)) out[k] = v;
  }
  return out;
}

export const FREE_FIELD_WORKER_SEATS = 3;
export const FREE_OFFICE_SEATS = 0;

export const EXTRA_FIELD_WORKER_PRICE_CENTS = 1900;
export const EXTRA_OFFICE_PRICE_CENTS = 4900;

export const TEAM_LOCKOUT_BANNER_THRESHOLD_DAYS = 30;

// Subscription-active check used by both the team-member lockout wall and the
// owner banner. Keeping this in one place avoids the two endpoints drifting.
// "Active" means any of:
//   - admin (platform superuser bypass — used for testing)
//   - status is `active` or `trialing`
//   - elite bonus window is still open
//   - free trial window is still open
//   - the paid period (`subscriptionEndsAt`) has not yet passed, even if the
//     status moved to cancelled (Stripe end-of-period flow) — the seat is
//     paid through that date so we should not lock the team out yet.
export interface OwnerLikeSubscription {
  isAdmin?: boolean | null;
  subscriptionStatus?: string | null;
  subscriptionEndsAt?: Date | string | null;
  eliteBonusEndsAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function isOwnerSubscriptionActive(owner: OwnerLikeSubscription | null | undefined): boolean {
  if (!owner) return false;
  if (owner.isAdmin) return true;
  const status = owner.subscriptionStatus;
  if (status === 'active' || status === 'trialing') return true;
  const now = Date.now();
  const bonus = toDate(owner.eliteBonusEndsAt);
  if (bonus && bonus.getTime() > now) return true;
  const trial = toDate(owner.trialEndsAt);
  if (trial && trial.getTime() > now) return true;
  const periodEnd = toDate(owner.subscriptionEndsAt);
  if (periodEnd && periodEnd.getTime() > now) return true;
  return false;
}

// Returns days since the owner's subscription lapsed. Anchors on the most
// recent of subscriptionEndsAt / eliteBonusEndsAt / trialEndsAt that is in the
// past. Returns null if no anchor is known (so the 30-day banner stays
// suppressed rather than firing immediately on an account with missing data).
export function daysSinceOwnerLapse(owner: OwnerLikeSubscription | null | undefined): number | null {
  if (!owner) return null;
  const now = Date.now();
  const anchors = [
    toDate(owner.subscriptionEndsAt),
    toDate(owner.eliteBonusEndsAt),
    toDate(owner.trialEndsAt),
  ].filter((d): d is Date => !!d && d.getTime() <= now);
  if (anchors.length === 0) return null;
  const mostRecent = anchors.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
  return Math.max(0, Math.floor((now - mostRecent.getTime()) / (24 * 60 * 60 * 1000)));
}
