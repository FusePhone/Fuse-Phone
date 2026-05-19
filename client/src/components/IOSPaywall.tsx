import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Crown, Sparkles, Zap, RefreshCcw, ShieldCheck, Bot, Globe, Shield, AlertTriangle, ExternalLink, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DeleteAccountCard } from "@/components/DeleteAccountCard";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PendingDowngradeBanner } from "@/components/PendingDowngradeBanner";
import { OtherAccountModal } from "@/components/OtherAccountModal";
import { apiRequest as apiReq } from "@/lib/queryClient";
import {
  purchaseTier,
  logIAP,
  purchaseAddon,
  restorePurchases,
  getOfferings,
  findPackageForTier,
  findPackageForAddon,
  isIAPAvailable,
  openManageSubscriptions,
  drainPendingPurchases,
  type Tier,
  type Addon,
} from "@/lib/iap";
import { waitForSK2 } from "@/lib/iap-sk2";
import { PRICE_LABELS } from "@shared/pricing";

type TierCopy = {
  id: Tier;
  name: string;
  tagline: string;
  fallbackPriceLabel: string;
  icon: typeof Sparkles;
  highlight?: boolean;
  ctaLabel: string;
  features: string[];
};

const TIERS: TierCopy[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For solo painters getting organized",
    fallbackPriceLabel: `${PRICE_LABELS.starterMonthly} / month`,
    icon: Sparkles,
    ctaLabel: "Subscribe",
    features: [
      "Contacts, leads & 8-stage pipeline",
      "Unlimited proposals & invoices",
      "Digital signatures & customer portal",
      "Unlimited photos with annotations (limited time, fair use)",
      "10 AI estimate interactions / month",
      "Online booking page",
      "Customizable automated follow-ups (5 lead, 3 viewed, 3 unviewed)",
    ],
  },
  {
    id: "core",
    name: "Core",
    tagline: "For growing painting businesses",
    fallbackPriceLabel: `${PRICE_LABELS.coreMonthly} / month`,
    icon: Zap,
    highlight: true,
    ctaLabel: "Subscribe",
    features: [
      "Everything in Starter",
      "Unlimited photos with annotations (limited time, fair use)",
      "20 AI estimate interactions / month",
      "Stripe payments",
      "AI receipt scanner",
      "Crew time tracking",
      "Unlimited automated follow-ups",
      "Job costing & profit tracking",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    tagline: "The full machine for established companies",
    fallbackPriceLabel: `${PRICE_LABELS.eliteMonthly} / month`,
    icon: Crown,
    ctaLabel: "Subscribe",
    features: [
      "Everything in Core",
      "3 free field worker seats included (Crew Lead / Field Employee)",
      "Unlimited photos & AI estimates",
      "Full phone system (VoIP) + SMS",
      "Crew payroll, GPS tracking & roles",
      "Bulk SMS + email campaigns",
      "Thumbtack, Zapier, FB Lead Ads & CompanyCam",
      "FuseAI included — Proposal Builder, Production Rates, Job Costing & P&L, Scheduling, Lead Suggestions",
    ],
  },
];

const TERMS_URL = "https://app.fusephone.com/terms";
const PRIVACY_URL = "https://app.fusephone.com/privacy";

type AddonCopy = {
  id: Addon;
  name: string;
  tagline: string;
  fallbackPriceLabel: string;
  icon: typeof Bot;
  features: string[];
  requiresElite?: boolean;
};

const ADDONS: AddonCopy[] = [
  {
    id: "whiteLabel",
    name: "Make It Your Own",
    tagline: "Custom branded portal & remove Fuse Phone branding",
    fallbackPriceLabel: `${PRICE_LABELS.makeItYourOwnMonthly} / month`,
    icon: Globe,
    features: [
      "Your own branded customer portal subdomain",
      "Hide all Fuse Phone branding from customer-facing pages",
      "Use your own custom domain",
    ],
    requiresElite: true,
  },
  {
    id: "aiAssistant",
    name: "AI Virtual Assistant",
    tagline: "Answers calls 24/7 in your voice",
    fallbackPriceLabel: `${PRICE_LABELS.aiAssistantMonthly} / month`,
    icon: Bot,
    features: [
      "AI receptionist for missed calls",
      "Custom greeting, name & voice",
      "Transcripts and call summaries",
    ],
    requiresElite: true,
  },
];

interface IOSPaywallProps {
  onPurchased?: (tier: Tier) => void;
}

interface SubscriptionStatus {
  tier?: string;
  baseTier?: string;
  status?: string;
  whiteLabelStatus?: string;
  aiAssistantStatus?: string;
  fuseAiStatus?: string;
  isAdmin?: boolean;
  pendingTier?: string | null;
  pendingTierEffectiveAt?: string | null;
  // Set by the IAP webhook when the user disables auto-renew for that
  // add-on in iOS Settings. When set, the add-on is already cancelling at
  // that date — the downgrade hard-block must NOT ask the user to cancel
  // it again.
  appleWhiteLabelExpiresAt?: string | null;
  appleAiAssistantExpiresAt?: string | null;
  appleFuseAiExpiresAt?: string | null;
  appleWhiteLabelAutoRenewOff?: boolean;
  appleAiAssistantAutoRenewOff?: boolean;
  appleFuseAiAutoRenewOff?: boolean;
}

export function IOSPaywall({ onPurchased }: IOSPaywallProps) {
  const { toast } = useToast();
  const [purchasingTier, setPurchasingTier] = useState<Tier | null>(null);
  const [purchasingAddon, setPurchasingAddon] = useState<Addon | null>(null);
  // Apple-only: when a downgrade is queued, buying an Elite-gated add-on
  // is a money trap (Apple keeps billing it after the downgrade lands and
  // our server refuses to activate it). Hold the pending add-on tap here
  // so we can show a confirm dialog before letting StoreKit open.
  const [addonBlockedByDowngrade, setAddonBlockedByDowngrade] = useState<Addon | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [livePrices, setLivePrices] = useState<Partial<Record<Tier, string>>>({});
  const [liveAddonPrices, setLiveAddonPrices] = useState<Partial<Record<Addon, string>>>({});
  // When the user taps a lower-tier "Subscribe" button we intercept the
  // call and show a confirmation dialog FIRST (explaining that the
  // downgrade only applies at renewal and that Elite-only add-ons will
  // stop working). The actual purchaseTier() call only fires if they
  // confirm in the dialog.
  const [pendingDowngradeTarget, setPendingDowngradeTarget] = useState<Tier | null>(null);
  const [pendingUpgradeTarget, setPendingUpgradeTarget] = useState<Tier | null>(null);
  const [otherAccountModal, setOtherAccountModal] = useState<{ maskedEmail: string } | null>(null);
  // iapAvailable starts as the synchronous best-guess and is UPGRADED to
  // true as soon as the async probe in iap-sk2's waitForSK2() succeeds.
  // The sync check used to be the only source of truth and would return
  // false during the brief window between paywall mount and native plugin
  // registration — that's why "Subscriptions are still initializing" used
  // to flash on every cold/warm launch even though the plugin was about
  // to come online a beat later. Now we re-evaluate after the probe.
  const [iapAvailable, setIapAvailable] = useState<boolean>(() => isIAPAvailable());
  useEffect(() => {
    if (iapAvailable) return;
    let cancelled = false;
    (async () => {
      const ok = await waitForSK2(8000);
      if (!cancelled && ok) {
        logIAP("info", "[Paywall] waitForSK2 probe succeeded — enabling IAP buttons");
        setIapAvailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: subscription } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscription"],
  });

  const isElite = subscription?.tier === "elite" || subscription?.baseTier === "elite";
  const hasActiveTier =
    subscription?.status === "active" || subscription?.status === "trialing";
  const currentTier = (subscription?.baseTier || subscription?.tier) as Tier | undefined;

  const adminTierMutation = useMutation({
    mutationFn: async (newTier: Tier) => {
      await apiRequest("PATCH", "/api/subscription/admin-switch-tier", { tier: newTier });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      toast({ title: "Tier switched", description: "Your view has been updated. All your data is untouched." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to switch tier", description: error.message, variant: "destructive" });
    },
  });

  // Fetch live prices from the App Store to overlay over fallback prices.
  //
  // We deliberately do NOT call restorePurchases() here. StoreKit prompts
  // the user for their Apple ID password whenever a restore runs without
  // a recent authentication, so calling it on every paywall mount made
  // the password sheet appear almost every time the user opened this
  // screen. The server-side /api/subscription is the source of truth in
  // normal operation; the explicit "Restore Purchases" button below is
  // available for the rare sandbox/drift case (and is the Apple-approved
  // way to do this).
  // Bulletproof IAP recovery on paywall mount. If a previous purchase
  // landed in Apple but the Capacitor bridge dropped the result mid
  // sheet (the WebView gets briefly suspended while StoreKit's UI is
  // up), Swift has the JWS persisted in UserDefaults — drain it now so
  // the user's tier reconciles before they see "still on starter".
  useEffect(() => {
    void drainPendingPurchases("paywall-mount");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const offering = await getOfferings();
      if (cancelled || !offering) return;
      const next: Partial<Record<Tier, string>> = {};
      (["starter", "core", "elite"] as Tier[]).forEach((t) => {
        const pkg = findPackageForTier(offering, t);
        const price = pkg?.product?.priceString;
        if (price) next[t] = `${price} / month`;
      });
      setLivePrices(next);

      const addonPrices: Partial<Record<Addon, string>> = {};
      (["whiteLabel", "aiAssistant"] as Addon[]).forEach((a) => {
        const pkg = findPackageForAddon(offering, a);
        const price = pkg?.product?.priceString;
        if (price) addonPrices[a] = `${price} / month`;
      });
      setLiveAddonPrices(addonPrices);
    })();
    return () => {
      cancelled = true;
    };
  }, [iapAvailable]);

  // Tier rank for upgrade/downgrade CTA labels. All 3 tiers live in the same
  // App Store Connect Subscription Group, so Apple handles the cross-grade
  // automatically when the user taps Subscribe — we just show the right label.
  const TIER_RANK: Record<Tier, number> = { starter: 1, core: 2, elite: 3 };

  const addonStatus = (addon: Addon): string => {
    if (addon === "whiteLabel") return subscription?.whiteLabelStatus || "inactive";
    return subscription?.aiAssistantStatus || "inactive";
  };

  const handleAddonSubscribe = async (addon: Addon) => {
    // Block when a downgrade away from Elite is queued. The add-on
    // requires Elite, so on the effective date it stops working but
    // Apple keeps charging until the user cancels the add-on
    // separately. Show a dialog instead of opening StoreKit.
    const pendingTier = (subscription?.pendingTier || "").toLowerCase();
    // Treat legacy `early_access` as Elite-equivalent — same as
    // PendingDowngradeBanner and isElite checks elsewhere in this file.
    const currentIsElite = currentTier === "elite" || (currentTier as string) === "early_access";
    const downgradeAwayFromElite =
      currentIsElite && !!pendingTier && pendingTier !== "elite" && pendingTier !== "early_access";
    if (downgradeAwayFromElite) {
      logIAP("warn", `[Paywall] addon=${addon} purchase blocked: pending downgrade to ${pendingTier} on ${subscription?.pendingTierEffectiveAt || 'n/a'}`);
      setAddonBlockedByDowngrade(addon);
      return;
    }
    setPurchasingAddon(addon);
    try {
      const result = await purchaseAddon(addon);
      if (!result.ok) {
        if (!result.userCancelled) {
          toast({
            title: "Couldn't complete purchase",
            description: result.message,
            variant: "destructive",
          });
        }
        return;
      }
      await refreshSubscription();
      const label =
        addon === "whiteLabel" ? "Make It Your Own"
        : "AI Virtual Assistant";
      if (result.processing) {
        toast({
          title: "Payment received",
          description: result.message || `${label} will activate within a minute.`,
        });
      } else {
        toast({ title: `${label} active`, description: "Add-on enabled on your account." });
      }
    } finally {
      setPurchasingAddon(null);
    }
  };

  // purchaseTier and restorePurchases handle the /api/iap/sync round-trip
  // internally (the StoreKit "approved" callback posts the verified
  // transactionId to our backend, which re-fetches it from Apple). We just
  // need to invalidate the subscription cache once they resolve.
  const refreshSubscription = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
    await queryClient.refetchQueries({ queryKey: ["/api/subscription"] });
  };

  // Actually fires the StoreKit purchase. handleSubscribe() below
  // intercepts and shows a confirmation dialog first when the user is
  // changing plans (so we can explain proration / queued downgrades /
  // add-on consequences).
  const runPurchase = async (tier: Tier) => {
    logIAP("info", `[Paywall] runPurchase ENTER tier=${tier} currentTier=${currentTier || "(none)"} hasActiveTier=${hasActiveTier}`);
    setPurchasingTier(tier);
    try {
      logIAP("info", `[Paywall] runPurchase awaiting purchaseTier(${tier})...`);
      const result = await purchaseTier(tier);
      logIAP(
        result.ok ? "success" : "warn",
        `[Paywall] runPurchase result: ok=${result.ok}` +
          (result.ok ? ` tier=${result.tier}` : ` userCancelled=${(result as any).userCancelled} message="${(result as any).message || ""}"`),
      );
      if (!result.ok) {
        // Owned-by-other-account: show the friendly modal with the masked
        // email + sign-in/contact-support/cancel buttons instead of a
        // generic destructive toast. This applies whether the conflict
        // was caught by the device-history pre-check (no Apple round-trip)
        // or by the server-side first-writer-wins guard (after Apple
        // already charged — server rejected the bind).
        const owner = (result as any).ownedByOtherAccount as { maskedEmail: string } | undefined;
        if (owner?.maskedEmail) {
          setOtherAccountModal({ maskedEmail: owner.maskedEmail });
          return;
        }
        if (!result.userCancelled) {
          toast({ title: "Couldn't complete purchase", description: result.message, variant: "destructive" });
        }
        return;
      }
      logIAP("info", `[Paywall] runPurchase invalidating /api/subscription cache`);
      await refreshSubscription();
      if (result.processing) {
        logIAP("info", `[Paywall] runPurchase soft-success (processing): waiting for webhook reconcile to ${result.tier}`);
        toast({
          title: "Payment received",
          description: result.message || `Your ${result.tier.toUpperCase()} plan will activate within a minute.`,
        });
        // Don't fire onPurchased — the WebSocket subscription.changed
        // push will invalidate /api/subscription as soon as the webhook
        // arrives, and the tier card will update automatically.
      } else {
        logIAP("success", `[Paywall] runPurchase complete: now on tier=${result.tier}`);
        toast({ title: "You're in!", description: `Welcome to ${result.tier.toUpperCase()}.` });
        onPurchased?.(result.tier);
      }
    } catch (err: any) {
      logIAP("error", `[Paywall] runPurchase threw: ${err?.message || err}`);
      throw err;
    } finally {
      setPurchasingTier(null);
      logIAP("info", `[Paywall] runPurchase EXIT tier=${tier}`);
    }
  };

  const handleSubscribe = async (tier: Tier) => {
    logIAP(
      "info",
      `[Paywall] handleSubscribe tap: targetTier=${tier} currentTier=${currentTier || "(none)"} hasActiveTier=${hasActiveTier}`,
    );
    // Plan-change interception: only run our confirmation dialog when
    // the user already has an active tier AND is switching to a
    // different one. First-time subscribers go straight to the
    // purchase sheet (no proration to explain, no add-ons to lose).
    if (hasActiveTier && currentTier && currentTier !== tier) {
      const currentRank = TIER_RANK[currentTier as Tier] ?? 0;
      const targetRank = TIER_RANK[tier];
      if (targetRank < currentRank) {
        logIAP("info", `[Paywall] handleSubscribe → DOWNGRADE dialog (${currentTier} → ${tier})`);
        setPendingDowngradeTarget(tier);
        return;
      }
      if (targetRank > currentRank) {
        logIAP("info", `[Paywall] handleSubscribe → UPGRADE dialog (${currentTier} → ${tier})`);
        setPendingUpgradeTarget(tier);
        return;
      }
    }
    logIAP("info", `[Paywall] handleSubscribe → DIRECT purchase (no plan-change dialog)`);
    await runPurchase(tier);
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await restorePurchases();
      // Owner-conflict modal takes priority over toasts on both ok and !ok
      // paths — this is the case where the Apple ID's subscription belongs
      // to a DIFFERENT FusePhone account. Show the actionable modal that
      // tells the user the masked email and what to do.
      const owner = (result as any).ownedByOtherAccount as { maskedEmail: string } | undefined;
      if (owner?.maskedEmail) {
        setOtherAccountModal({ maskedEmail: owner.maskedEmail });
        return;
      }
      if (!result.ok) {
        toast({ title: "Couldn't restore", description: result.message, variant: "destructive" });
        return;
      }
      if (!result.tier) {
        toast({ title: "Nothing to restore", description: "We didn't find an active subscription on this Apple ID." });
        return;
      }
      await refreshSubscription();
      toast({ title: "Restored", description: `Your ${result.tier.toUpperCase()} plan is active.` });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 pb-24 max-w-5xl mx-auto" data-testid="ios-paywall">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold mb-2" data-testid="text-paywall-title">Choose Your Plan</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Unlock Fuse Phone with a monthly subscription. Cancel anytime in your Apple ID settings.
        </p>
        {hasActiveTier && currentTier && (
          <p className="text-xs text-primary font-medium mt-2" data-testid="text-paywall-current-plan">
            You're currently on the {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} plan.
          </p>
        )}
      </div>

      <PendingDowngradeBanner subscription={subscription} />

      {subscription?.isAdmin && (
        <Card className="mb-6 border-dashed border-primary/40">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Demo Mode</span>
                <span className="text-xs text-muted-foreground">Switch tiers for testing — your data stays the same.</span>
              </div>
              <div className="inline-flex items-center rounded-md border text-xs" data-testid="toggle-admin-tier">
                {(['starter', 'core', 'elite'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => adminTierMutation.mutate(t)}
                    disabled={adminTierMutation.isPending}
                    className={`px-3 py-1.5 transition-colors first:rounded-l-md last:rounded-r-md ${currentTier === t ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground'}`}
                    data-testid={`button-admin-tier-${t}`}
                  >
                    {t === 'starter' ? 'Starter' : t === 'core' ? 'Core' : 'Elite'}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {hasActiveTier && (
        <p className="text-xs text-muted-foreground mb-3 px-1" data-testid="text-paywall-proration">
          Upgrades take effect right away — Apple credits the unused part of your current plan toward the new one. Downgrades start at the end of your current billing period.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {TIERS.map((t) => {
          const Icon = t.icon;
          const priceLabel = livePrices[t.id] ?? t.fallbackPriceLabel;
          const isPurchasing = purchasingTier === t.id;
          const isCurrent = hasActiveTier && currentTier === t.id;
          const disabled = purchasingTier !== null || restoring || isCurrent;
          // Upgrade/downgrade label based on tier rank (same App Store
          // Subscription Group → Apple handles the cross-grade automatically).
          let ctaLabel: string = t.ctaLabel;
          if (hasActiveTier && currentTier && currentTier !== t.id) {
            const currentRank = TIER_RANK[currentTier as Tier] ?? 0;
            const targetRank = TIER_RANK[t.id];
            ctaLabel = targetRank > currentRank ? `Upgrade to ${t.name}` : `Downgrade to ${t.name}`;
          }
          return (
            <Card
              key={t.id}
              className={
                isCurrent
                  ? "border-green-600 relative"
                  : t.highlight
                  ? "border-primary relative"
                  : "relative"
              }
              data-testid={`card-paywall-${t.id}`}
            >
              {isCurrent && subscription?.pendingTier && subscription?.pendingTierEffectiveAt ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                  <Badge className="bg-amber-500 text-white shadow-md px-3 py-0.5 text-xs no-default-hover-elevate no-default-active-elevate" data-testid="badge-pending-downgrade-tier">
                    Switching to {subscription.pendingTier.charAt(0).toUpperCase() + subscription.pendingTier.slice(1)} on {new Date(subscription.pendingTierEffectiveAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </Badge>
                </div>
              ) : isCurrent ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-green-600 text-white shadow-md px-3 py-0.5 text-xs no-default-hover-elevate no-default-active-elevate">
                    Current Plan
                  </Badge>
                </div>
              ) : t.highlight ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground shadow-md px-3 py-0.5 text-xs no-default-hover-elevate no-default-active-elevate">
                    Most Popular
                  </Badge>
                </div>
              ) : null}
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="w-5 h-5" />
                  {t.name}
                </CardTitle>
                <CardDescription>{t.tagline}</CardDescription>
                <div className="mt-2">
                  <span
                    className={`text-2xl font-bold ${t.highlight ? "text-primary" : ""}`}
                    data-testid={`text-paywall-price-${t.id}`}
                  >
                    {priceLabel}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-5">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={isCurrent ? "outline" : t.highlight ? "default" : "outline"}
                  disabled={disabled}
                  onClick={() => handleSubscribe(t.id)}
                  data-testid={`button-paywall-subscribe-${t.id}`}
                >
                  {isCurrent ? (
                    <><CheckCircle2 className="w-4 h-4 mr-2" /> Current Plan</>
                  ) : isPurchasing ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {hasActiveTier ? "Switching…" : "Subscribing…"}</>
                  ) : (
                    ctaLabel
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mb-8">
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold mb-1" data-testid="text-paywall-addons-title">Add-Ons</h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Power-ups you can add to any plan. Each add-on is billed separately
            through your Apple ID and renews monthly.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ADDONS.map((a) => {
            const Icon = a.icon;
            const priceLabel = liveAddonPrices[a.id] ?? a.fallbackPriceLabel;
            const status = addonStatus(a.id);
            const isActive = status === "active";
            const isPurchasing = purchasingAddon === a.id;
            const eliteRequiredAndMissing = a.requiresElite && !isElite;
            const disabled =
              purchasingAddon !== null ||
              purchasingTier !== null ||
              restoring ||
              isActive ||
              eliteRequiredAndMissing ||
              !hasActiveTier;
            return (
              <Card key={a.id} className="relative" data-testid={`card-paywall-addon-${a.id}`}>
                {isActive && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="default" className="bg-green-600 text-white shadow-md px-3 py-0.5 text-xs no-default-hover-elevate no-default-active-elevate">
                      Active
                    </Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="w-5 h-5" />
                    {a.name}
                  </CardTitle>
                  <CardDescription className="text-xs">{a.tagline}</CardDescription>
                  <div className="mt-2">
                    <span className="text-xl font-bold" data-testid={`text-paywall-addon-price-${a.id}`}>
                      {priceLabel}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 mb-4">
                    {a.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {eliteRequiredAndMissing && (
                    <p className="text-[11px] text-muted-foreground mb-2" data-testid={`text-paywall-addon-elite-${a.id}`}>
                      Requires the Elite plan.
                    </p>
                  )}
                  {!hasActiveTier && !eliteRequiredAndMissing && (
                    <p className="text-[11px] text-muted-foreground mb-2">
                      Subscribe to a plan first to add this on.
                    </p>
                  )}
                  <Button
                    className="w-full"
                    variant={isActive ? "outline" : "default"}
                    disabled={disabled}
                    onClick={() => handleAddonSubscribe(a.id)}
                    data-testid={`button-paywall-addon-subscribe-${a.id}`}
                  >
                    {isActive ? (
                      <><CheckCircle2 className="w-4 h-4 mr-2" /> Active</>
                    ) : isPurchasing ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Subscribing…</>
                    ) : (
                      "Add to Plan"
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="flex justify-center mb-6">
        <Button
          variant="ghost"
          onClick={handleRestore}
          disabled={restoring || purchasingTier !== null || purchasingAddon !== null}
          data-testid="button-paywall-restore"
        >
          {restoring ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Restoring…</>
          ) : (
            <><RefreshCcw className="w-4 h-4 mr-2" /> Restore Purchases</>
          )}
        </Button>
      </div>

      <Card className="border-muted bg-muted/30">
        <CardContent className="pt-5 space-y-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <p data-testid="text-paywall-legal">
              Payment will be charged to your Apple ID account at confirmation of purchase.
              Your subscription automatically renews monthly unless canceled at least 24 hours
              before the end of the current period. Manage or cancel your subscription in your
              Apple ID account settings after purchase.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-2">
            <a
              href={TERMS_URL}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
              data-testid="link-paywall-terms"
            >
              Terms of Use (EULA)
            </a>
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
              data-testid="link-paywall-privacy"
            >
              Privacy Policy
            </a>
            <button
              type="button"
              onClick={() => setShowDeleteAccount(true)}
              className="underline hover:text-destructive flex items-center gap-1"
              data-testid="link-paywall-delete-account"
            >
              <Trash2 className="w-3 h-3" />
              Delete account
            </button>
          </div>
          {!iapAvailable && (
            <p className="text-center text-[11px] opacity-70" data-testid="text-paywall-iap-status">
              In-app purchases will activate once App Store products go live.
            </p>
          )}
        </CardContent>
      </Card>

      {/*
        IAP Diagnostics panel intentionally removed from the visible UI per
        product decision — the underlying logIAP infrastructure in
        @/lib/iap is still active and continues to capture every Apple /
        StoreKit / server step into the in-memory ring buffer (and
        forwards to console.log so it shows up in Safari Web Inspector
        and TestFlight device console). To re-enable the visible panel,
        restore subscribeIAPLog/getIAPLog/clearIAPLog imports + state +
        the Card block from git history.
      */}

      {/*
        DOWNGRADE confirmation. Two modes:

        (1) HARD BLOCK — user is on Elite with one or more tier-gated
            add-ons (Make It Your Own / AI Virtual Assistant / FuseAI)
            still active. The downgrade target (Core or Starter) does
            NOT support these add-ons. Apple does not allow developers
            to cancel a user's subscription on their behalf, so we
            cannot auto-cancel the add-on. The only safe path is:
              a) deep-link them to iOS Settings → Subscriptions
              b) make them cancel each tier-gated add-on there
              c) Apple sends our webhook DID_CHANGE_RENEWAL_STATUS
                 (autoRenewStatus=0); the in-app subscription state
                 updates; the next time they tap the lower tier, this
                 dialog falls through to mode (2) and proceeds.
            Without this block, the user would orphan a paid add-on
            (Apple keeps charging, our server refuses to activate
            because the required tier no longer applies → silent
            money loss). See Terms § 4 "Add-on dependencies".

        (2) NORMAL CONFIRM — no tier-gated add-ons in conflict. Apple's
            StoreKit sheet doesn't explain that downgrades are queued
            until renewal, so we surface that here before letting the
            sheet open.
      */}
      {(() => {
        // Compute the list of tier-gated add-ons that are still active.
        // We're only blocking when downgrading FROM Elite — every
        // current add-on requires Elite. If we ever introduce add-ons
        // that work on lower tiers, expand this with per-add-on
        // minimum-tier metadata instead of hard-coding 'elite'.
        // An add-on with autoRenewOff=true is already cancelling in Apple
        // Settings — Apple stops billing it at the end of the period. Don't
        // make the user "cancel" it again; treat it as already cancelled.
        const blockingAddons = (currentTier === 'elite' && pendingDowngradeTarget && pendingDowngradeTarget !== 'elite')
          ? [
              (subscription?.whiteLabelStatus === 'active' && !subscription?.appleWhiteLabelAutoRenewOff) ? 'Make It Your Own' : null,
              (subscription?.aiAssistantStatus === 'active' && !subscription?.appleAiAssistantAutoRenewOff) ? 'AI Virtual Assistant' : null,
              (subscription?.fuseAiStatus === 'active' && !subscription?.appleFuseAiAutoRenewOff) ? 'FuseAI' : null,
            ].filter((x): x is string => !!x)
          : [];
        const hasBlockingAddons = blockingAddons.length > 0;
        return (
          <AlertDialog
            open={pendingDowngradeTarget !== null}
            onOpenChange={(open) => { if (!open) setPendingDowngradeTarget(null); }}
          >
            <AlertDialogContent data-testid="dialog-confirm-downgrade">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  {hasBlockingAddons
                    ? `Cancel your add-on${blockingAddons.length > 1 ? 's' : ''} first`
                    : `Switch to ${pendingDowngradeTarget ? (pendingDowngradeTarget.charAt(0).toUpperCase() + pendingDowngradeTarget.slice(1)) : ''}?`}
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-sm">
                    {hasBlockingAddons ? (
                      <>
                        <p>
                          {blockingAddons.length === 1
                            ? <><strong>{blockingAddons[0]}</strong> only works on Elite.</>
                            : <><strong>{blockingAddons.slice(0, -1).join(', ')}</strong> and <strong>{blockingAddons.slice(-1)}</strong> only work on Elite.</>
                          }
                          {' '}To downgrade to {pendingDowngradeTarget ? (pendingDowngradeTarget.charAt(0).toUpperCase() + pendingDowngradeTarget.slice(1)) : ''}, please cancel
                          {blockingAddons.length > 1 ? ' each one' : ' it'} first in iOS Settings → Subscriptions.
                        </p>
                        <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-900 dark:text-blue-100">
                          <p className="font-medium mb-1">What happens after you cancel</p>
                          <p className="leading-relaxed">
                            You'll keep Elite{blockingAddons.length > 0 ? ` and ${blockingAddons.length === 1 ? blockingAddons[0] : 'your add-ons'}` : ''} until the end of your current paid period — no extra charge today.
                            On that date, everything ends together and you'll switch to {pendingDowngradeTarget ? (pendingDowngradeTarget.charAt(0).toUpperCase() + pendingDowngradeTarget.slice(1)) : ''} automatically.
                          </p>
                          <p className="leading-relaxed mt-2">
                            Once you've cancelled in iOS Settings, come back here and tap the {pendingDowngradeTarget ? (pendingDowngradeTarget.charAt(0).toUpperCase() + pendingDowngradeTarget.slice(1)) : ''} button again to schedule the plan downgrade.
                          </p>
                        </div>
                      </>
                    ) : (
                      <p>
                        You'll keep your current {currentTier ? (currentTier.charAt(0).toUpperCase() + currentTier.slice(1)) : ''} plan
                        until the end of your current paid period — no extra charge today. After that, you'll switch to{' '}
                        {pendingDowngradeTarget ? (pendingDowngradeTarget.charAt(0).toUpperCase() + pendingDowngradeTarget.slice(1)) : ''}.
                      </p>
                    )}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-downgrade-cancel">
                  {hasBlockingAddons ? 'Not now' : 'Keep my current plan'}
                </AlertDialogCancel>
                {hasBlockingAddons ? (
                  <AlertDialogAction
                    onClick={() => {
                      // Apple's documented deep link to the user's own
                      // subscriptions list. Works on real iOS devices
                      // (not in the iOS simulator). On the web (testing
                      // in Safari), this navigates to the App Store URL
                      // which falls through to a no-op page — fine,
                      // because the hard-block path is only reachable
                      // on iOS in practice (web users go through the
                      // Stripe-managed Billing page instead).
                      logIAP("info", `[Paywall] DOWNGRADE blocked by add-ons [${blockingAddons.join(', ')}]: opening iOS Settings → Subscriptions`);
                      setPendingDowngradeTarget(null);
                      window.location.href = "itms-apps://apps.apple.com/account/subscriptions";
                    }}
                    data-testid="button-downgrade-open-subscriptions"
                  >
                    Open iOS Subscriptions
                  </AlertDialogAction>
                ) : (
                  <AlertDialogAction
                    onClick={() => {
                      // Defer the StoreKit purchase until AFTER Radix has fully
                      // unmounted the dialog overlay. The dialog briefly applies
                      // `pointer-events: none` to the document during its close
                      // animation; calling purchaseTier() inside the onClick
                      // (synchronously closing the dialog) caused the native
                      // Apple Pay / StoreKit sheet to never appear because the
                      // WebView was still mid-transition. setTimeout(..., 0)
                      // pushes the call onto the next macrotask after the close
                      // has flushed — restoring the working pre-dialog flow.
                      const target = pendingDowngradeTarget;
                      logIAP("info", `[Paywall] DOWNGRADE dialog Continue tapped: target=${target} (deferring runPurchase 50ms for dialog close animation)`);
                      setPendingDowngradeTarget(null);
                      if (target) setTimeout(() => {
                        logIAP("info", `[Paywall] DOWNGRADE setTimeout fired → calling runPurchase(${target})`);
                        void runPurchase(target);
                      }, 50);
                    }}
                    data-testid="button-downgrade-confirm"
                  >
                    Continue
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}

      {/*
        ADDON-BLOCKED-BY-DOWNGRADE. User tapped Subscribe on an Elite-only
        add-on while a downgrade away from Elite is queued. Buying now is
        a money trap — Apple keeps charging the add-on after Elite ends,
        but the server refuses to activate it because the tier is gone.
        Two ways out: cancel the queued downgrade (re-buy Elite) so the
        add-on works long-term, OR back out and don't buy.
      */}
      <AlertDialog
        open={addonBlockedByDowngrade !== null}
        onOpenChange={(open) => { if (!open) setAddonBlockedByDowngrade(null); }}
      >
        <AlertDialogContent data-testid="dialog-addon-blocked-downgrade">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Cancel the downgrade first
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Your plan is set to switch to{' '}
                  <strong>{(subscription?.pendingTier || '').charAt(0).toUpperCase() + (subscription?.pendingTier || '').slice(1)}</strong>
                  {subscription?.pendingTierEffectiveAt
                    ? <> on <strong>{new Date(subscription.pendingTierEffectiveAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</strong></>
                    : null}
                  . This add-on only works on Elite, so on that date it stops working — but Apple keeps billing you for it until you cancel it in iOS Subscriptions.
                </p>
                <p>
                  Tap <strong>Keep Elite</strong> to cancel the downgrade, then come back here to buy the add-on.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-addon-blocked-not-now">
              Not now
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                logIAP("info", `[Paywall] addon-blocked dialog: user chose Keep Elite — re-purchasing elite to clear queued downgrade`);
                setAddonBlockedByDowngrade(null);
                setTimeout(() => { void runPurchase("elite"); }, 50);
              }}
              data-testid="button-addon-blocked-keep-elite"
            >
              Keep Elite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/*
        UPGRADE confirmation. Brief — Apple's own sheet shows the price.
        We just want the user to know the change applies immediately and
        that Apple credits the unused portion of their current plan.
      */}
      <AlertDialog
        open={pendingUpgradeTarget !== null}
        onOpenChange={(open) => { if (!open) setPendingUpgradeTarget(null); }}
      >
        <AlertDialogContent data-testid="dialog-confirm-upgrade">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Upgrade to {pendingUpgradeTarget ? (pendingUpgradeTarget.charAt(0).toUpperCase() + pendingUpgradeTarget.slice(1)) : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The change takes effect right away. You'll be charged the full price of the new plan, and the
              unused portion of your current {currentTier ? (currentTier.charAt(0).toUpperCase() + currentTier.slice(1)) : ''} plan
              will be credited toward it. This is the standard prorated billing for plan changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-upgrade-cancel">Not now</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                // See the matching comment on the downgrade dialog: defer
                // the StoreKit purchase until after Radix has unmounted
                // its overlay so the native Apple Pay sheet can present.
                const target = pendingUpgradeTarget;
                logIAP("info", `[Paywall] UPGRADE dialog Continue tapped: target=${target} (deferring runPurchase 50ms for dialog close animation)`);
                setPendingUpgradeTarget(null);
                if (target) setTimeout(() => {
                  logIAP("info", `[Paywall] UPGRADE setTimeout fired → calling runPurchase(${target})`);
                  void runPurchase(target);
                }, 50);
              }}
              data-testid="button-upgrade-confirm"
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OtherAccountModal
        open={!!otherAccountModal}
        maskedEmail={otherAccountModal?.maskedEmail || ""}
        onSignInAsOther={async () => {
          // Persist a one-time intent flag so the login page can show a
          // banner reminding the user WHY they're signing in (to cancel
          // their old subscription and delete that account). Without this
          // they get dumped at the login screen with no context.
          try {
            sessionStorage.setItem(
              "fusephone_login_intent",
              JSON.stringify({
                intent: "cancel_existing_sub",
                maskedEmail: otherAccountModal?.maskedEmail || "***",
                setAt: Date.now(),
              }),
            );
          } catch { /* non-fatal — banner just won't appear */ }
          // Close the modal first so it doesn't sit on top of the login
          // screen after the redirect.
          setOtherAccountModal(null);
          // CRITICAL: use the full logout() helper, NOT a raw POST to
          // /api/auth/logout. The full helper clears native access/refresh
          // tokens, the TanStack Query cache, the realtime socket, and
          // the per-user IndexedDB cache. The raw POST only clears the
          // server cookie — the cached user object remained in memory and
          // the router bounced the user right back into Account B instead
          // of showing the login screen. That's the bug the user reported.
          try {
            const { logout } = await import("@/hooks/use-auth");
            await logout();
          } catch {
            /* fall through to hard redirect even if logout helper failed */
          }
          // Hard reload to '/' guarantees no stale React state, no stale
          // module-level singletons, and forces a fresh boot at the login
          // screen as the signed-out user.
          window.location.replace("/");
        }}
        onOpenAppleSubscriptions={() => {
          // Deep link to iPhone Settings → Subscriptions so user can
          // cancel directly. Component has a graceful https fallback
          // if the itms-apps:// URL doesn't resolve.
          try {
            window.location.href = "itms-apps://apps.apple.com/account/subscriptions";
            setTimeout(() => {
              try {
                window.open("https://apps.apple.com/account/subscriptions", "_blank", "noopener,noreferrer");
              } catch { /* non-fatal */ }
            }, 500);
          } catch {
            window.open("https://apps.apple.com/account/subscriptions", "_blank", "noopener,noreferrer");
          }
        }}
        onContactSupport={() => {
          const subject = encodeURIComponent("Move my FusePhone subscription to a different account");
          const body = encodeURIComponent(
            `Hi FusePhone,\n\nI tried to subscribe but my Apple ID is already linked to another FusePhone account on this iPhone (${otherAccountModal?.maskedEmail || "***"}). Please help me move the subscription.\n\nThanks!`,
          );
          window.location.href = `mailto:support@fusephone.com?subject=${subject}&body=${body}`;
          setOtherAccountModal(null);
        }}
        onCancel={() => setOtherAccountModal(null)}
      />

      <Dialog open={showDeleteAccount} onOpenChange={setShowDeleteAccount}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-paywall-delete-account">
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              You can delete your FusePhone account at any time, even without an active subscription.
            </DialogDescription>
          </DialogHeader>
          {/* key forces a fresh mount each time the dialog opens, so users
              never re-enter on the destructive "confirm" step they left
              behind. */}
          <DeleteAccountCard key={showDeleteAccount ? 'open' : 'closed'} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default IOSPaywall;
