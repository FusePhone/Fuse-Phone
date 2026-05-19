import { useQuery } from "@tanstack/react-query";

function isCapacitorNative(): boolean {
  if ((window as any).__CAPACITOR_NATIVE) return true;
  const Cap = (window as any).Capacitor;
  return !!(Cap?.isNativePlatform?.() || Cap?.isNative);
}

export type SubscriptionData = {
  tier: string;
  baseTier: string;
  status: string;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  subscriptionEndsAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  appleOriginalTransactionId: string | null;
  // Apple-only: a queued downgrade. Null when no downgrade is pending.
  // Set when the user picks a lower tier in the iOS paywall — Apple keeps
  // the higher tier active until the current paid period ends, then
  // switches. UI shows "Downgrading to Core on May 28" banners + warns
  // about losing Elite-only add-ons.
  pendingTier: string | null;
  pendingTierEffectiveAt: string | null;
  isAdmin: boolean;
  isTeamMember?: boolean;
  cancelAtPeriodEnd: boolean;
  fuseAiStatus: string;
  fuseAiSubscriptionId: string | null;
  aiAssistantStatus: string;
  aiAssistantSubscriptionId: string | null;
  whiteLabelStatus: string;
  whiteLabelSubscriptionId: string | null;
  // Apple-only auto-renew cancellation tracking. `appleAutoRenewOff` is the
  // base tier flag (paired with `subscriptionEndsAt`). Per-add-on timestamps
  // mark when each add-on's access ends after the user disabled auto-renew
  // in iOS Settings. Null/false = auto-renew is on.
  appleAutoRenewOff?: boolean;
  appleWhiteLabelExpiresAt?: string | null;
  appleFuseAiExpiresAt?: string | null;
  appleAiAssistantExpiresAt?: string | null;
  appleWhiteLabelAutoRenewOff?: boolean;
  appleFuseAiAutoRenewOff?: boolean;
  appleAiAssistantAutoRenewOff?: boolean;
};

export function useSubscription() {
  const { data, isLoading, error } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const isNative = isCapacitorNative();
  const isTrialing = data?.status === 'trialing' && (data?.trialDaysLeft || 0) > 0;
  const isActive = data?.status === 'active';
  const rawTier = data?.tier || 'starter';
  const effectiveTier = rawTier === 'early_access' ? 'elite' : rawTier;
  const isElite = effectiveTier === 'elite';
  const isCore = effectiveTier === 'core' || isElite;
  const isStarter = effectiveTier === 'starter' || isCore;
  const isTeamMember = !!data?.isTeamMember;
  const needsPlanSelection = (data?.isAdmin || isTeamMember) ? false : data?.status === 'inactive';
  const needsSubscription = false;
  const hasAccess = (data?.isAdmin || isTeamMember) ? true : !needsPlanSelection;
  const hasFuseAi = isElite || data?.isAdmin === true;
  const hasAiAssistant = data?.aiAssistantStatus === 'active';
  const hasWhiteLabel = data?.whiteLabelStatus === 'active';

  return {
    subscription: data,
    isLoading,
    error,
    isStarter,
    isCore,
    isElite,
    isTrialing,
    isActive,
    isAdmin: !!data?.isAdmin,
    isTeamMember,
    isNativeApp: isNative,
    hasAccess,
    needsSubscription,
    needsPlanSelection,
    tier: data?.tier || 'starter',
    baseTier: data?.baseTier || 'starter',
    trialDaysLeft: data?.trialDaysLeft || 0,
    canUseIntegrations: isElite,
    canUsePhone: isElite,
    canUseSms: isElite,
    canUseEmail: isStarter,
    canUseCustomDomainEmail: isCore,
    canUsePayments: isCore,
    canUseGmail: isStarter,
    canUseCalendar: isStarter,
    canUseOnlineBooking: isStarter,
    canUseCompanyCam: isElite,
    canUseFinancing: isElite,
    photoLimit: isElite ? Infinity : isCore ? 10 : 5,
    aiEstimateLimit: isElite ? Infinity : isCore ? 20 : 10,
    followUpLimit: isElite || isCore ? Infinity : 5,
    extraSeatPriceCents: 2500,
    fuseAssistantMinutesIncluded: 250,
    fuseAssistantOverageCentsPerMinute: 14,
    hasFuseAi,
    fuseAiStatus: data?.fuseAiStatus || 'inactive',
    hasAiAssistant,
    aiAssistantStatus: data?.aiAssistantStatus || 'inactive',
    hasWhiteLabel,
    whiteLabelStatus: data?.whiteLabelStatus || 'inactive',
  };
}
