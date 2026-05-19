export const TIER_PRICING = {
  starter: { monthly: 39.99 },
  core: { monthly: 89.99 },
  elite: { monthly: 149 },
} as const;

export const ADDON_PRICING = {
  aiVirtualAssistant: {
    monthly: 49.99,
    includedMinutes: 250,
    overagePerMinute: 0.14,
    limitedTime: false,
  },
  makeItYourOwn: {
    monthly: 39,
    limitedTime: true,
  },
  extraSeat: {
    monthly: 25,
    limitedTime: false,
  },
} as const;

export type TierKey = keyof typeof TIER_PRICING;
export type AddonKey = keyof typeof ADDON_PRICING;

const formatDollar = (n: number) => (Number.isInteger(n) ? n.toString() : n.toFixed(2));

export const formatPrice = (n: number) => `$${formatDollar(n)}`;

export const PRICE_LABELS = {
  starterMonthly: formatPrice(TIER_PRICING.starter.monthly),
  coreMonthly: formatPrice(TIER_PRICING.core.monthly),
  eliteMonthly: formatPrice(TIER_PRICING.elite.monthly),
  starterRaw: formatDollar(TIER_PRICING.starter.monthly),
  coreRaw: formatDollar(TIER_PRICING.core.monthly),
  eliteRaw: formatDollar(TIER_PRICING.elite.monthly),
  aiAssistantMonthly: formatPrice(ADDON_PRICING.aiVirtualAssistant.monthly),
  aiAssistantOverage: formatPrice(ADDON_PRICING.aiVirtualAssistant.overagePerMinute),
  aiAssistantMinutes: ADDON_PRICING.aiVirtualAssistant.includedMinutes,
  makeItYourOwnMonthly: formatPrice(ADDON_PRICING.makeItYourOwn.monthly),
  extraSeatMonthly: formatPrice(ADDON_PRICING.extraSeat.monthly),
} as const;
