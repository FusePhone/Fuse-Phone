import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/use-subscription";
import { ReferAndEarnCard } from "@/components/ReferAndEarnCard";
import { Loader2, CreditCard, Crown, Zap, CheckCircle2, Clock, Package, ArrowUp, AlertTriangle, Sparkles, Shield, Bot, Globe, Plus } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PRICE_LABELS } from "@shared/pricing";
import { useState, useEffect, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { useIsIOSApp } from "@/hooks/use-ios-app";
import { IOSPaywall } from "@/components/IOSPaywall";
import { PendingDowngradeBanner } from "@/components/PendingDowngradeBanner";
import { restorePurchases, manageSubscriptionsURL, openManageSubscriptions } from "@/lib/iap";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type StripeProduct = {
  id: string;
  name: string;
  description: string;
  metadata: any;
  prices: Array<{
    id: string;
    unitAmount: number;
    currency: string;
    recurring: any;
  }>;
};

const getTierLabel = (tier: string) =>
  tier === 'elite' ? 'Elite' : tier === 'starter' ? 'Starter' : 'Core';

const STARTER_FEATURES: { label: string; tip?: string }[] = [
  { label: "Contacts, Leads & 8-Stage Pipeline", tip: "Never lose a lead again. Track every job from first call to close." },
  { label: "Unlimited Estimates, Proposals & Invoices", tip: "Send professional documents in minutes. Line items, photos, terms, and digital signatures built in." },
  { label: "Digital Signatures & Customer Portal", tip: "Customers sign from their phone — no app download. Close deals faster." },
  { label: "Unlimited Photos with Annotations", tip: "Document every job with as many photos as you want. Mark them up with arrows, text, and color callouts." },
  { label: "10 AI Estimate Interactions / month", tip: "Use AI to draft and refine line items on your proposals 10 times a month." },
  { label: "Gmail & Google Calendar Sync", tip: "Send proposals from your Gmail and keep appointments synced with Google Calendar." },
  { label: "Online Booking Page", tip: "Let customers book directly from your website or Google. More bookings, less phone tag." },
  { label: "5 Customizable Automatic Follow-Ups", tip: "5 automatic email follow-ups with timing you control. Edit each message and set your own send schedule." },
  { label: "Email Notifications & Reminders" },
  { label: "Reusable Document Templates" },
  { label: "Overhead & Pricing Calculator" },
];

const CORE_FEATURES: { label: string; tip?: string }[] = [
  { label: "Everything in Starter" },
  { label: "Unlimited Photos with Annotations" },
  { label: "20 AI Estimate Interactions / month" },
  { label: "Stripe Payments", tip: "Customers pay invoices online with a credit card — money hits your account fast." },
  { label: "AI Receipt Scanner", tip: "Snap a photo of any receipt and AI auto-fills the expense details." },
  { label: "Crew Time Tracking (basic)", tip: "Crew clocks in from their phone. Accurate hours for payroll." },
  { label: "Unlimited Automatic Follow-Ups" },
  { label: "Job Costing & Profit Tracking" },
];

const ELITE_FEATURES: { label: string; tip?: string }[] = [
  { label: "Everything in Core" },
  { label: "Unlimited Photos & AI Estimates" },
  { label: "Full Phone System (VoIP) + SMS", tip: "Dedicated business number — make calls and text customers right from the app." },
  { label: "Crew Payroll, GPS Tracking & Roles" },
  { label: "Bulk SMS + Email Campaigns" },
  { label: "Thumbtack, Zapier, FB Lead Ads & CompanyCam" },
  { label: "FuseAI included — Proposal Builder, Production Rate Estimator, Job Costing & P&L, Scheduling Assistant & AI Lead Suggestions", tip: "All FuseAI features are bundled into the Elite plan — no extra charge." },
];

const ELITE_ADDONS: { label: string; tip?: string }[] = [
  { label: `AI Virtual Assistant — ${PRICE_LABELS.aiAssistantMonthly} / month (${PRICE_LABELS.aiAssistantMinutes} min included)`, tip: `Your 24/7 AI receptionist. Answers calls, books appointments, and texts customers when you can't pick up. Overage at ${PRICE_LABELS.aiAssistantOverage}/min.` },
  { label: `Make It Your Own — Custom Branded Portal — ${PRICE_LABELS.makeItYourOwnMonthly} / month`, tip: "Your logo, your colors, your own portal subdomain. Every customer touchpoint becomes 100% your brand." },
];

export default function Billing() {
  const isIOSApp = useIsIOSApp();
  const { toast } = useToast();
  const { subscription, isLoading: subLoading, isElite, isTrialing, isActive, trialDaysLeft, needsSubscription, needsPlanSelection, baseTier, hasFuseAi, fuseAiStatus, hasAiAssistant, aiAssistantStatus, hasWhiteLabel, whiteLabelStatus } = useSubscription();
  const [promoCode, setPromoCode] = useState("");
  const [promoValid, setPromoValid] = useState<null | { valid: boolean; message?: string; discountType?: string; discountAmount?: number; trialDays?: number; durationMonths?: number; appliesTo?: string }>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const [, setLocation] = useLocation();

  const hasTriggeredSync = useRef(false);
  const checkoutSessionId = useRef<string | null>(params.get('session_id'));

  useEffect(() => {
    if (params.get('success') === 'true') {
      const isUpgrade = params.get('upgraded') === 'true';
      toast({ 
        title: isUpgrade ? "Upgrade successful!" : "Payment successful!", 
        description: "Syncing your subscription..." 
      });
      syncRetryCount.current = 0;
      hasTriggeredSync.current = true;
      syncMutation.mutate();
      window.history.replaceState({}, '', '/billing');
    }
    if (params.get('canceled') === 'true') {
      toast({ title: "Checkout canceled", description: "No charges were made.", variant: "destructive" });
      window.history.replaceState({}, '', '/billing');
    }
    if (params.get('from_portal') === 'true') {
      hasTriggeredSync.current = true;
      syncRetryCount.current = 0;
      syncMutation.mutate();
      window.history.replaceState({}, '', '/billing');
    }
  }, []);

  useEffect(() => {
    if (!subLoading && subscription && !hasTriggeredSync.current) {
      const hasCustomer = !!subscription.stripeCustomerId;
      const noSubscriptionId = !subscription.stripeSubscriptionId;
      const isTrialingWithoutStripe = subscription.status === 'trialing' && !subscription.stripeSubscriptionId;
      const hasAppleSub = !!subscription.appleOriginalTransactionId;
      // Don't auto-sync on iOS native, for Apple-billed users, or for admins —
      // there's no Stripe checkout to reconcile and it just produces a noisy
      // "Sync taking longer than expected" toast on every page load.
      if (hasCustomer && noSubscriptionId && !isTrialingWithoutStripe && !hasAppleSub && !isIOSApp && !subscription.isAdmin) {
        hasTriggeredSync.current = true;
        syncRetryCount.current = 0;
        syncMutation.mutate();
      }
    }
  }, [subLoading, subscription]);

  const { data: products, isLoading: productsLoading, isError: productsError } = useQuery<StripeProduct[]>({
    queryKey: ["/api/stripe/products"],
    retry: 2,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const res = await apiRequest("POST", "/api/stripe/checkout", {
        priceId,
        promoCode: promoValid?.valid ? promoCode : undefined,
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: async (error: any) => {
      if (error.message?.includes("already have an active")) {
        toast({ title: "Already subscribed", description: error.message });
        await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
        await queryClient.refetchQueries({ queryKey: ["/api/subscription"] });
      } else {
        toast({ title: "Checkout failed", description: error.message, variant: "destructive" });
      }
    },
  });

  // Native (iOS) Restore Purchases pending state. Lives at page scope so the
  // button can render its own spinner while StoreKit + /api/iap/sync resolve.
  const [restoring, setRestoring] = useState(false);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [upgradePreview, setUpgradePreview] = useState<{ totalDue: number; credit: number; charge: number; currency: string; periodEnd: number } | null>(null);
  const [upgradePriceId, setUpgradePriceId] = useState<string | null>(null);

  const previewMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const res = await apiRequest("POST", "/api/stripe/upgrade/preview", { priceId });
      return await res.json();
    },
    onSuccess: (data: any) => {
      setUpgradePreview(data);
      setUpgradeDialogOpen(true);
    },
    onError: (error: any) => {
      toast({ title: "Could not load upgrade details", description: error.message, variant: "destructive" });
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const res = await apiRequest("POST", "/api/stripe/upgrade", { priceId });
      return await res.json();
    },
    onSuccess: async (data: any) => {
      if (data.success) {
        setUpgradeDialogOpen(false);
        setUpgradePreview(null);
        toast({ title: "Upgrade successful!", description: `You're now on the ${getTierLabel(data.tier)} plan.` });
        await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
        await queryClient.refetchQueries({ queryKey: ["/api/subscription"] });
      }
    },
    onError: (error: any) => {
      const isPaymentIssue = error.message?.includes("Payment failed") || error.message?.includes("payment");
      toast({ 
        title: isPaymentIssue ? "Payment issue" : "Upgrade failed", 
        description: isPaymentIssue 
          ? "Please update your payment method and try again." 
          : error.message, 
        variant: "destructive" 
      });
      if (isPaymentIssue) {
        setUpgradeDialogOpen(false);
        portalMutation.mutate();
      }
    },
  });

  const handleUpgradeClick = (priceId: string) => {
    setUpgradePriceId(priceId);
    previewMutation.mutate(priceId);
  };

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/resume");
      return await res.json();
    },
    onSuccess: async () => {
      toast({ title: "Subscription resumed!", description: "Your subscription will continue." });
      await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      await queryClient.refetchQueries({ queryKey: ["/api/subscription"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to resume", description: error.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/cancel");
      return await res.json();
    },
    onSuccess: async () => {
      setCancelDialogOpen(false);
      toast({ title: "Subscription canceled", description: "Your plan will remain active until the end of your billing period." });
      await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      await queryClient.refetchQueries({ queryKey: ["/api/subscription"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to cancel", description: error.message, variant: "destructive" });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/portal");
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to open billing portal", description: error.message, variant: "destructive" });
    },
  });

  const syncRetryCount = useRef(0);
  const syncMutation = useMutation({
    mutationFn: async () => {
      const body: any = {};
      if (checkoutSessionId.current) {
        body.sessionId = checkoutSessionId.current;
      }
      const res = await apiRequest("POST", "/api/stripe/sync-subscription", body);
      return await res.json();
    },
    onSuccess: async (data: any) => {
      if (data.synced) {
        syncRetryCount.current = 0;
        toast({ title: "Subscription synced!", description: `Your ${getTierLabel(data.tier)} plan is now active.` });
        await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
        await queryClient.refetchQueries({ queryKey: ["/api/subscription"] });
      } else if (syncRetryCount.current < 8) {
        syncRetryCount.current++;
        setTimeout(() => {
          syncMutation.mutate();
        }, 2000);
      }
      // Silently give up after 8 retries — surfacing a destructive toast on
      // every page load (especially for users without a real Stripe sub) is
      // worse than the missing sync, which the user can re-trigger manually.
    },
    onError: () => {
      if (syncRetryCount.current < 8) {
        syncRetryCount.current++;
        setTimeout(() => {
          syncMutation.mutate();
        }, 2000);
      }
    },
  });

  const startTrialMutation = useMutation({
    mutationFn: async (plan: string) => {
      const body: any = { plan };
      if (promoValid?.valid && promoCode) body.promoCode = promoCode;
      const res = await apiRequest("POST", "/api/auth/select-plan", body);
      return await res.json();
    },
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      await queryClient.refetchQueries({ queryKey: ["/api/subscription"] });
      if (data?.requiresSubscription) {
        toast({ title: "Great choice!", description: "Subscribe to activate your plan." });
      } else {
        const trialMsg = data?.trialDays > 15 ? `Your ${data.trialDays}-day free trial has started!` : "Your free trial has started. Enjoy!";
        toast({ title: "You're in!", description: trialMsg });
        setLocation("/");
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to start trial", description: error.message, variant: "destructive" });
    },
  });

  const aiAssistantCheckoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/ai-assistant/checkout");
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({ title: "AI Assistant checkout failed", description: error.message, variant: "destructive" });
    },
  });

  const aiAssistantCancelMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/stripe/ai-assistant/cancel");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      toast({ title: "AI Assistant canceled", description: "Your AI Assistant add-on will remain active until the end of your billing period." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to cancel AI Assistant", description: error.message, variant: "destructive" });
    },
  });

  const whiteLabelCheckoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/white-label/checkout");
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({ title: "Checkout failed", description: error.message, variant: "destructive" });
    },
  });

  const whiteLabelCancelMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/stripe/white-label/cancel");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      toast({ title: "Add-on canceled", description: "Your Make It Your Own add-on will remain active until the end of your billing period." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to cancel add-on", description: error.message, variant: "destructive" });
    },
  });

  const validatePromo = async () => {
    if (!promoCode) return;
    try {
      const res = await apiRequest("POST", "/api/promo/validate", { code: promoCode });
      const data = await res.json();
      setPromoValid(data);
      if (!data.valid) {
        toast({ title: data.message || "Invalid promo code", variant: "destructive" });
      } else {
        const parts: string[] = [];
        if (data.trialDays) parts.push(`${data.trialDays}-day free trial`);
        if (data.discountAmount > 0) {
          const discountText = data.discountType === 'percent' ? `${data.discountAmount}% off` : `$${(data.discountAmount / 100).toFixed(2)} off`;
          parts.push(discountText + (data.durationMonths ? ` for ${data.durationMonths} months` : ' forever'));
        }
        toast({ title: "Promo code applied!", description: parts.join(' + ') || undefined });
      }
    } catch {
      setPromoValid({ valid: false, message: "Error validating code" });
    }
  };

  const adminTierMutation = useMutation({
    mutationFn: async (newTier: string) => {
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

  if (subLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" data-testid="loading-spinner" />
      </div>
    );
  }

  const isNativeApp = (() => {
    if ((window as any).__CAPACITOR_NATIVE) return true;
    if (document.documentElement.classList.contains('capacitor-native')) return true;
    const Cap = (window as any).Capacitor;
    return !!(Cap?.isNativePlatform?.() || Cap?.isNative);
  })();

  // IAP is only available inside the Capacitor native iOS app — NOT in iOS PWA
  // or mobile Safari. Apple StoreKit requires native bindings, so PWA +
  // browser iOS users continue using Stripe (web) checkout below.
  if (isNativeApp) {
    // Detect subscription source. Apple wins if an Apple transaction exists.
    // Otherwise, any active/trialing user is "web-managed" — this covers
    // Stripe customers, admins, comp accounts, promo trials, and team
    // members. They all manage billing on the website (or n/a for admins),
    // never through Apple. Only show the IAP paywall when the user truly
    // has no active subscription anywhere.
    const hasApple = !!subscription?.appleOriginalTransactionId;
    const isActiveOrTrialing = isActive || isTrialing;
    const subscriptionSource: 'apple' | 'web' | 'none' =
      hasApple ? 'apple' : isActiveOrTrialing ? 'web' : 'none';

    // Open in the system default browser (Safari on iOS), NOT an in-app
    // webview. Required for Apple compliance: subscription management links
    // from inside the app must hand off to the system browser so Apple's
    // anti-steering rules are satisfied and the user gets a clear context
    // switch out of the app. window.open(_blank) on Capacitor iOS opens
    // Safari directly (SFSafariViewController is only used if we explicitly
    // call @capacitor/browser, which we deliberately do NOT do here).
    const openExternal = (url: string) => {
      window.open(url, '_blank');
    };

    // STRIPE/WEB SUBSCRIBER on iOS: account is fully usable, but billing is
    // managed on the web. We MUST NOT show Apple IAP UI (no Restore, no
    // Manage in App Store, no Subscribe buttons) — and per Apple's
    // anti-steering guideline (3.1.3) we use neutral wording: "managed on our
    // website" / "Manage Account". No mention of upgrading or saving.
    if (subscriptionSource === 'web') {
      return (
        <div className="pb-24">
          <div className="p-4 lg:p-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <CreditCard className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold" data-testid="text-billing-title">Account</h1>
            </div>
            <Card data-testid="card-native-web-managed">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  Your Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <PendingDowngradeBanner subscription={subscription} />
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="default" className="text-sm py-1 px-3" data-testid="text-native-plan-status">
                    {getTierLabel(baseTier || 'core')}
                  </Badge>
                  {isTrialing && (
                    <Badge variant="outline" data-testid="text-trial-status">
                      <Clock className="w-3 h-3 mr-1" /> {trialDaysLeft} days left in trial
                    </Badge>
                  )}
                  {isActive && !isTrialing && (
                    <Badge variant="outline" data-testid="text-native-active-status">Active</Badge>
                  )}
                </div>
                <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2" data-testid="card-native-web-included">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What's included</p>
                  <ul className="space-y-1.5">
                    <li className="flex items-center gap-2 text-sm" data-testid="row-native-included-base">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      <span>FusePhone {getTierLabel(baseTier || 'core')}</span>
                    </li>
                    {hasFuseAi && !isElite && (
                      <li className="flex items-center gap-2 text-sm" data-testid="row-native-included-fuseai">
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        <span>FuseAI</span>
                      </li>
                    )}
                    {hasAiAssistant && (
                      <li className="flex items-center gap-2 text-sm" data-testid="row-native-included-assistant">
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        <span>AI Virtual Assistant</span>
                      </li>
                    )}
                    {hasWhiteLabel && (
                      <li className="flex items-center gap-2 text-sm" data-testid="row-native-included-whitelabel">
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        <span>Make It Your Own</span>
                      </li>
                    )}
                  </ul>
                </div>
                <div className="rounded-md border border-border bg-muted/40 p-3">
                  <p className="font-medium text-sm mb-1">Billing managed on our website</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your subscription is managed through your FusePhone account on the web. Tapping below opens app.fusephone.com in Safari — sign in with the same email and password you use for this app.
                  </p>
                </div>
                <Button
                  variant="default"
                  onClick={() => openExternal('https://app.fusephone.com/billing')}
                  data-testid="button-native-manage-account"
                >
                  Open in Safari
                </Button>
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-3 border-t border-border text-xs text-muted-foreground">
                  <a
                    href="https://app.fusephone.com/terms"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => { e.preventDefault(); openExternal('https://app.fusephone.com/terms'); }}
                    className="underline hover:text-foreground"
                    data-testid="link-account-terms-web"
                  >
                    Terms of Use (EULA)
                  </a>
                  <a
                    href="https://app.fusephone.com/privacy"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => { e.preventDefault(); openExternal('https://app.fusephone.com/privacy'); }}
                    className="underline hover:text-foreground"
                    data-testid="link-account-privacy-web"
                  >
                    Privacy Policy
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    // APPLE IAP SUBSCRIBER or NO SUBSCRIPTION on iOS: show the Apple-managed
    // account card (when active) and the IAP paywall (always, so users with
    // no sub can subscribe and Apple users can change tier/add-ons).
    return (
      <div className="pb-24">
        {subscriptionSource === 'apple' && (isActive || isTrialing) && (
          <div className="p-4 lg:p-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <CreditCard className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold" data-testid="text-billing-title">Account</h1>
            </div>
            <Card data-testid="card-native-apple-managed">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  Your Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <PendingDowngradeBanner subscription={subscription} />
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="default" className="text-sm py-1 px-3" data-testid="text-native-plan-status">
                    {getTierLabel(baseTier || 'core')}
                  </Badge>
                  {isTrialing && (
                    <Badge variant="outline" data-testid="text-trial-status">
                      <Clock className="w-3 h-3 mr-1" /> {trialDaysLeft} days left in trial
                    </Badge>
                  )}
                  {isActive && !isTrialing && (
                    <Badge variant="outline" data-testid="text-native-active-status">Active</Badge>
                  )}
                </div>
                <div className="rounded-md border border-border bg-muted/40 p-3">
                  <p className="font-medium text-sm mb-1">Managed through Apple App Store</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your subscription auto-renews through your Apple ID. Manage or cancel anytime in your Apple ID settings.
                  </p>
                {(() => {
                    const endsAt = subscription?.subscriptionEndsAt;
                    if (!endsAt) return null;
                    const dateStr = new Date(endsAt as any).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
                    if (subscription?.appleAutoRenewOff) {
                      return (
                        <p
                          className="text-xs mt-2 text-amber-700 dark:text-amber-300 font-medium"
                          data-testid="text-apple-base-cancelling"
                        >
                          Auto-renew is OFF. {getTierLabel(baseTier || 'core')} ends on {dateStr}.
                        </p>
                      );
                    }
                    if (isActive && !isTrialing) {
                      return (
                        <p
                          className="text-xs mt-2 text-muted-foreground"
                          data-testid="text-apple-base-renews"
                        >
                          Renews on {dateStr}.
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
                {/* Per add-on status. Apple sells add-ons as their own auto-renewable
                    subscriptions, each cancellable independently in iOS Settings.
                    We surface each one here so the user can see exactly what's
                    still being billed by Apple. */}
                {(() => {
                  const fmt = (d: any) => d
                    ? new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
                    : '';
                  const items = [
                    { key: 'whiteLabel', label: 'Make It Your Own', status: subscription?.whiteLabelStatus, expiresAt: subscription?.appleWhiteLabelExpiresAt, autoRenewOff: subscription?.appleWhiteLabelAutoRenewOff, testid: 'addon-white-label' },
                    { key: 'fuseAi',     label: 'FuseAI',           status: subscription?.fuseAiStatus,     expiresAt: subscription?.appleFuseAiExpiresAt,     autoRenewOff: subscription?.appleFuseAiAutoRenewOff,     testid: 'addon-fuse-ai' },
                    { key: 'aiAssistant',label: 'AI Virtual Assistant', status: subscription?.aiAssistantStatus, expiresAt: subscription?.appleAiAssistantExpiresAt, autoRenewOff: subscription?.appleAiAssistantAutoRenewOff, testid: 'addon-ai-assistant' },
                  ];
                  // STRANDED-ADDON DETECTION. An add-on is "stranded" when
                  // Apple still has an unexpired auto-renewable subscription
                  // for it (apple_*_expires_at is in the future) but our
                  // server has it as inactive — typically because the user
                  // downgraded to a tier that doesn't grant the add-on.
                  // Apple keeps billing; the user can't use the feature.
                  // Surface it loudly with a clear path to cancel.
                  const nowMs = Date.now();
                  // Suppress the "Action needed" alarm during an active
                  // restore — the server-side state is in flux and could
                  // briefly read as stranded for 2-5 seconds while the
                  // sweep + webhook reconcile. Avoids a scary red flash on
                  // a perfectly successful purchase / restore.
                  const isStranded = (i: typeof items[number]) =>
                    !restoring &&
                    i.status !== 'active' &&
                    i.expiresAt && new Date(i.expiresAt as any).getTime() > nowMs;
                  const visible = items.filter(i =>
                    i.status === 'active' || (i.status && i.status !== 'inactive') || isStranded(i),
                  );
                  if (visible.length === 0) return null;
                  return (
                    <div className="rounded-md border border-border p-3 space-y-3" data-testid="section-apple-addons">
                      <p className="font-medium text-sm">Your add-ons</p>
                      {visible.map(item => {
                        const stranded = isStranded(item);
                        const cancelling = item.status === 'active' && item.autoRenewOff === true;
                        const dateStr = fmt(item.expiresAt);
                        return (
                          <div
                            key={item.key}
                            className="flex items-start justify-between gap-3"
                            data-testid={`row-${item.testid}`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{item.label}</p>
                              {stranded ? (
                                <p
                                  className="text-xs mt-0.5 text-rose-700 dark:text-rose-300"
                                  data-testid={`text-${item.testid}-stranded`}
                                >
                                  Apple is still billing this every {dateStr ? `cycle (next on ${dateStr})` : 'cycle'}, but it requires the Elite plan to use. Tap Manage Subscription below to cancel it, or upgrade to Elite to start using it again.
                                </p>
                              ) : dateStr && (
                                <p
                                  className={`text-xs mt-0.5 ${cancelling ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}
                                  data-testid={`text-${item.testid}-date`}
                                >
                                  {cancelling ? `Ends ${dateStr}` : `Renews ${dateStr}`}
                                </p>
                              )}
                            </div>
                            {stranded ? (
                              <Badge
                                variant="outline"
                                className="border-rose-500/60 text-rose-700 dark:text-rose-300 shrink-0"
                                data-testid={`badge-${item.testid}-stranded`}
                              >
                                Action needed
                              </Badge>
                            ) : cancelling ? (
                              <Badge
                                variant="outline"
                                className="border-amber-500/60 text-amber-700 dark:text-amber-300 shrink-0"
                                data-testid={`badge-${item.testid}-cancelling`}
                              >
                                Cancelling
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="shrink-0"
                                data-testid={`badge-${item.testid}-active`}
                              >
                                Active
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="default"
                    onClick={() => openExternal(manageSubscriptionsURL())}
                    data-testid="button-native-manage"
                  >
                    Manage Subscription
                  </Button>
                  <Button
                    variant="outline"
                    disabled={restoring}
                    onClick={async () => {
                      // The StoreKit round-trip + /api/iap/sync can take 1-3
                      // seconds. Without a pending state the button feels
                      // dead — the user taps repeatedly. Mirror the same
                      // spinner + disabled treatment we use on Subscribe.
                      if (restoring) return;
                      setRestoring(true);
                      try {
                        const result = await restorePurchases();
                        if (!result.ok) {
                          toast({ title: "Couldn't restore", description: result.message, variant: "destructive" });
                          return;
                        }
                        if (result.tier) {
                          await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
                          toast({ title: "Restored", description: `Your ${result.tier.toUpperCase()} plan is active.` });
                        } else {
                          toast({ title: "Nothing to restore", description: "No active subscription found on this Apple ID." });
                        }
                      } finally {
                        setRestoring(false);
                      }
                    }}
                    data-testid="button-native-restore"
                  >
                    {restoring ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Restoring…
                      </>
                    ) : (
                      "Restore Purchases"
                    )}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-3 border-t border-border text-xs text-muted-foreground">
                  <a
                    href="https://app.fusephone.com/terms"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => { e.preventDefault(); openExternal('https://app.fusephone.com/terms'); }}
                    className="underline hover:text-foreground"
                    data-testid="link-account-terms-apple"
                  >
                    Terms of Use (EULA)
                  </a>
                  <a
                    href="https://app.fusephone.com/privacy"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => { e.preventDefault(); openExternal('https://app.fusephone.com/privacy'); }}
                    className="underline hover:text-foreground"
                    data-testid="link-account-privacy-apple"
                  >
                    Privacy Policy
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        <IOSPaywall />
      </div>
    );
  }

  const starterProduct = products?.find(p => p.metadata?.tier === 'starter' || p.name?.toLowerCase().includes('starter'));
  const coreProduct = products?.find(p => p.metadata?.tier === 'core' || p.name?.toLowerCase().includes('core'));
  const eliteProduct = products?.find(p => p.metadata?.tier === 'elite' || p.name?.toLowerCase().includes('elite'));
  const starterPrice = starterProduct?.prices?.[0];
  const corePrice = coreProduct?.prices?.[0];
  const elitePrice = eliteProduct?.prices?.[0];

  const currentTier = baseTier;
  const showUpgradeOptions = needsPlanSelection || !isActive || (isActive && currentTier !== 'elite') || isTrialing;

  // Auto-launch Stripe Checkout when arriving from signup with ?plan=...
  // This is what enforces "card required at signup": new users land here after
  // register and we immediately push them into Checkout with a 14-day trial.
  const planParam = params.get('plan');
  const autoCheckoutFired = useRef(false);
  useEffect(() => {
    if (autoCheckoutFired.current) return;
    if (!planParam || !products || !subscription) return;
    if (subscription.status === 'active' || subscription.status === 'trialing') return;
    const targetPrice =
      planParam === 'starter' ? starterPrice :
      planParam === 'elite' ? elitePrice :
      corePrice;
    if (!targetPrice) return;
    autoCheckoutFired.current = true;
    window.history.replaceState({}, '', '/billing');
    checkoutMutation.mutate(targetPrice.id);
  }, [planParam, products, subscription, starterPrice, corePrice, elitePrice]);

  return (
    <div className="p-4 lg:p-6 pb-24 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <CreditCard className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold" data-testid="text-billing-title">Billing & Subscription</h1>
      </div>

      <div className="mb-6">
        <ReferAndEarnCard />
      </div>

      {subscription?.isAdmin && (
        <Card className="mb-6 border-dashed border-primary/40">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Demo Mode</span>
                <span className="text-xs text-muted-foreground">Switch tiers for video demos — your data stays the same.</span>
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

      {/* Grandfathered banner — only shown to subscribers who signed up before
          the new pricing rolled out (April 17, 2026). New signups at the new
          $39.99 / $89.99 / $149 prices should NOT see this. */}
      {isActive && !!subscription?.stripeSubscriptionId && !!(subscription as any)?.accountCreatedAt && new Date((subscription as any).accountCreatedAt) < new Date('2026-04-17T00:00:00Z') && (
        <Card className="mb-6 border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20" data-testid="card-grandfathered">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium" data-testid="text-grandfathered-title">You're locked in at your original price.</p>
                <p className="text-muted-foreground mt-0.5" data-testid="text-grandfathered-detail">
                  We just refreshed our pricing for new signups. Your subscription stays at the rate you signed up at — for as long as your plan stays active. Cancel and restart later and you'll be charged the new price.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Plan Status */}
      {needsPlanSelection && (
        <Card className="mb-6 border-primary">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-primary" />
              <div>
                <p className="font-medium" data-testid="text-needs-plan">
                  Stop losing leads. Pick a plan.
                </p>
                <p className="text-sm text-muted-foreground">
                  Every missed call is a missed deal. Choose the plan that gives you freedom to focus on the job, not the phone.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isTrialing && (
        <Card className="mb-6 border-primary/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-primary" />
              <div>
                <p className="font-medium" data-testid="text-trial-status">
                  {getTierLabel(baseTier || 'core')} Trial Active - {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining
                </p>
                <p className="text-sm text-muted-foreground">
                  Your subscription starts automatically when your trial ends. Cancel anytime from the Billing page.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isActive && (() => {
        const tierPrice =
          currentTier === 'elite' ? 149 :
          currentTier === 'core' ? 89.99 :
          39.99;
        const lineItems: { label: string; price: number }[] = [
          { label: `FusePhone ${getTierLabel(currentTier)}`, price: tierPrice },
        ];
        if (hasAiAssistant) {
          lineItems.push({ label: 'AI Virtual Assistant', price: 49.99 });
        }
        if (hasWhiteLabel) {
          lineItems.push({ label: 'Make It Your Own', price: 39 });
        }
        const total = lineItems.reduce((sum, i) => sum + i.price, 0);
        const formatMoney = (n: number) => Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
        return (
          <Card className={`mb-6 ${subscription?.cancelAtPeriodEnd ? 'border-destructive/50' : ''}`}>
            <CardContent className="pt-4 pb-4">
              <PendingDowngradeBanner subscription={subscription} />
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  {subscription?.cancelAtPeriodEnd ? (
                    <Clock className="w-5 h-5 text-destructive" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  )}
                  <div>
                    <p className="font-medium" data-testid="text-active-plan">
                      Current Plan: FusePhone {getTierLabel(currentTier)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {subscription?.cancelAtPeriodEnd
                        ? `Canceling at end of billing period${subscription?.subscriptionEndsAt ? ` (${new Date(subscription.subscriptionEndsAt).toLocaleDateString()})` : ''}`
                        : 'Your subscription is active.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {subscription?.appleOriginalTransactionId && !subscription?.stripeSubscriptionId ? (
                    <Badge variant="outline" className="gap-1 text-xs" data-testid="badge-apple-managed">
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                      Managed via App Store
                    </Badge>
                  ) : subscription?.cancelAtPeriodEnd ? (
                    <Button onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending} data-testid="button-resume-subscription">
                      {resumeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Keep Subscription"}
                    </Button>
                  ) : (
                    <Button variant="outline" className="border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive dark:text-red-400 dark:hover:bg-destructive/20 dark:hover:text-red-300" onClick={() => setCancelDialogOpen(true)} data-testid="button-cancel-subscription">
                      Cancel Subscription
                    </Button>
                  )}
                  {!(subscription?.appleOriginalTransactionId && !subscription?.stripeSubscriptionId) && (
                    <Button variant="outline" onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending} data-testid="button-manage-billing">
                      {portalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Manage Billing"}
                    </Button>
                  )}
                </div>
              </div>
              {subscription?.appleOriginalTransactionId && !subscription?.stripeSubscriptionId && (
                <div className="rounded-md border border-border bg-muted/40 p-3 mb-3 text-sm" data-testid="card-apple-managed-info">
                  <p className="font-medium mb-1">Your subscription is billed through Apple.</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    To change your plan, cancel, or update your payment method, open the FusePhone app on your iPhone and tap <strong>Billing → Manage in App Store</strong>. Or on any iPhone go to <strong>Settings → [Your Name] → Subscriptions → FusePhone</strong>. You can also{' '}
                    <button
                      type="button"
                      onClick={openManageSubscriptions}
                      className="underline text-primary"
                      data-testid="link-apple-subscriptions"
                    >
                      open Apple Subscriptions directly
                    </button>
                    {' '}while signed in with the same Apple ID.
                  </p>
                </div>
              )}
              <div className="border-t pt-3" data-testid="section-billing-breakdown">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  What you're paying for
                </p>
                <ul className="space-y-1.5 mb-2">
                  {lineItems.map((item) => (
                    <li
                      key={item.label}
                      className="flex items-center justify-between text-sm"
                      data-testid={`line-item-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    >
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        {item.label}
                      </span>
                      <span className="font-medium tabular-nums" data-testid={`line-price-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                        {formatMoney(item.price)} / mo
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums" data-testid="text-billing-total">
                    {formatMoney(total)} / month
                  </span>
                </div>
                {(hasAiAssistant || hasWhiteLabel) && (
                  <p className="text-[11px] text-muted-foreground mt-2" data-testid="text-billing-addon-note">
                    Add-ons are billed separately through your {isIOSApp ? 'Apple ID' : 'payment method'} and renew monthly.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Promo Code */}
      {showUpgradeOptions && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Input
              value={promoCode}
              onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoValid(null); }}
              placeholder="Enter promo code"
              className="max-w-xs"
              data-testid="input-promo-code"
            />
            <Button variant="outline" onClick={validatePromo} disabled={!promoCode} data-testid="button-apply-promo">
              Apply
            </Button>
          </div>
          {promoValid?.valid && (
            <p className="text-sm text-green-600 dark:text-green-400" data-testid="text-promo-applied">
              Promo applied: {promoValid.discountType === 'fixed'
                ? `$${((promoValid.discountAmount || 0) / 100).toFixed(2)} off`
                : `${promoValid.discountAmount}% off`}
            </p>
          )}
        </div>
      )}

      {/* Plan Cards */}
      {showUpgradeOptions && (
        <>
          <h2 className="text-lg font-semibold mb-4">
            {isActive && (currentTier === 'core' || currentTier === 'starter') ? 'Upgrade Your Plan' : isTrialing ? 'Subscribe to Keep Access' : 'Choose a Plan'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Starter Plan */}
            <Card className={currentTier === 'starter' && isActive ? 'border-primary' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    FusePhone Starter
                  </CardTitle>
                  {currentTier === 'starter' && isActive && (
                    <Badge variant="default">Current Plan</Badge>
                  )}
                </div>
                <CardDescription>Get organized. Stop losing leads.</CardDescription>
                <div className="mt-2">
                  <span className="text-3xl font-bold" data-testid="text-billing-starter-price">
                    ${starterPrice ? (starterPrice.unitAmount / 100).toFixed(2) : PRICE_LABELS.starterRaw}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">14-day free trial • Credit card required</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {STARTER_FEATURES.map((feature) => (
                    <li key={feature.label} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      <span className="flex items-center gap-1">{feature.label} {feature.tip && <InfoTooltip text={feature.tip} />}</span>
                    </li>
                  ))}
                </ul>
                {isActive && (currentTier === 'core' || currentTier === 'elite') ? (
                  <p className="text-sm text-muted-foreground text-center" data-testid="text-starter-included">Current plan includes Starter features</p>
                ) : !(isActive && currentTier === 'starter') && !isIOSApp ? (
                  <div className="space-y-2">
                    {starterPrice ? (
                      <Button className="w-full" onClick={() => checkoutMutation.mutate(starterPrice.id)} disabled={checkoutMutation.isPending} data-testid="button-subscribe-starter">
                        {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Start 14-Day Free Trial"}
                      </Button>
                    ) : (productsLoading || productsError) ? (
                      <Button className="w-full" variant="outline" disabled={productsLoading} onClick={() => !productsLoading && queryClient.invalidateQueries({ queryKey: ["/api/stripe/products"] })} data-testid="button-subscribe-starter-loading">
                        {productsLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading plans...</> : "Retry loading plans"}
                      </Button>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground text-center">Cancel anytime before trial ends — no charge</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* Core Plan */}
            <Card className={currentTier === 'core' && isActive ? 'border-primary' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    FusePhone Core
                  </CardTitle>
                  {currentTier === 'core' && isActive && (
                    <Badge variant="default">Current Plan</Badge>
                  )}
                </div>
                <CardDescription>Email, book, and get paid — from anywhere.</CardDescription>
                <div className="mt-2">
                  <span className="text-3xl font-bold" data-testid="text-billing-core-price">
                    ${corePrice ? (corePrice.unitAmount / 100).toFixed(2) : PRICE_LABELS.coreRaw}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">14-day free trial • Credit card required</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {CORE_FEATURES.map((feature) => (
                    <li key={feature.label} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      <span className="flex items-center gap-1">{feature.label} {feature.tip && <InfoTooltip text={feature.tip} />}</span>
                    </li>
                  ))}
                </ul>
                {!(isActive && currentTier === 'core') && !isIOSApp && (
                  <div className="space-y-2">
                    {corePrice ? (
                      isActive && currentTier === 'starter' ? (
                        <Button className="w-full" onClick={() => handleUpgradeClick(corePrice.id)} disabled={previewMutation.isPending || upgradeMutation.isPending} data-testid="button-upgrade-core">
                          {previewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowUp className="w-4 h-4 mr-2" /> Upgrade to Core</>}
                        </Button>
                      ) : (
                        <Button className="w-full" onClick={() => checkoutMutation.mutate(corePrice.id)} disabled={checkoutMutation.isPending} data-testid="button-subscribe-core">
                          {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Start 14-Day Free Trial"}
                        </Button>
                      )
                    ) : (productsLoading || productsError) ? (
                      <Button className="w-full" variant="outline" disabled={productsLoading} onClick={() => !productsLoading && queryClient.invalidateQueries({ queryKey: ["/api/stripe/products"] })} data-testid="button-subscribe-core-loading">
                        {productsLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading plans...</> : "Retry loading plans"}
                      </Button>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground text-center">Cancel anytime before trial ends — no charge</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Elite Plan */}
            <Card className={currentTier === 'elite' && isActive ? 'border-primary' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="w-5 h-5" />
                    FusePhone Elite
                  </CardTitle>
                  {currentTier === 'elite' && isActive && (
                    <Badge variant="default">Current Plan</Badge>
                  )}
                </div>
                <CardDescription>Run your business from your phone. Period.</CardDescription>
                <div className="mt-2">
                  <span className="text-3xl font-bold" data-testid="text-billing-elite-price">
                    ${elitePrice ? (elitePrice.unitAmount / 100).toFixed(0) : PRICE_LABELS.eliteRaw}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">14-day free trial • Credit card required</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-4">
                  {ELITE_FEATURES.map((feature) => (
                    <li key={feature.label} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                      <span className="flex items-center gap-1">{feature.label} {feature.tip && <InfoTooltip text={feature.tip} />}</span>
                    </li>
                  ))}
                </ul>
                <div className="mb-6 pt-3 border-t">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2" data-testid="text-elite-addons-heading">
                    Optional Elite Add-Ons
                  </p>
                  <ul className="space-y-2">
                    {ELITE_ADDONS.map((feature) => (
                      <li key={feature.label} className="flex items-start gap-2 text-sm" data-testid={`addon-${feature.label.toLowerCase().split(' ')[0]}`}>
                        <Plus className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span className="flex items-center gap-1">{feature.label} {feature.tip && <InfoTooltip text={feature.tip} />}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {!(currentTier === 'elite' && isActive) && !isIOSApp && (
                  <div className="space-y-2">
                    {elitePrice ? (
                      isActive && (currentTier === 'starter' || currentTier === 'core') ? (
                        <Button className="w-full" onClick={() => handleUpgradeClick(elitePrice.id)} disabled={previewMutation.isPending || upgradeMutation.isPending} data-testid="button-upgrade-elite">
                          {previewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowUp className="w-4 h-4 mr-2" /> Upgrade to Elite</>}
                        </Button>
                      ) : (
                        <Button className="w-full" onClick={() => checkoutMutation.mutate(elitePrice.id)} disabled={checkoutMutation.isPending} data-testid="button-subscribe-elite">
                          {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Start 14-Day Free Trial"}
                        </Button>
                      )
                    ) : (productsLoading || productsError) ? (
                      <Button className="w-full" variant="outline" disabled={productsLoading} onClick={() => !productsLoading && queryClient.invalidateQueries({ queryKey: ["/api/stripe/products"] })} data-testid="button-subscribe-elite-loading">
                        {productsLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading plans...</> : "Retry loading plans"}
                      </Button>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground text-center">Cancel anytime before trial ends — no charge</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

        </>
      )}

      {/* Add-ons Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Add-ons
          </CardTitle>
          <CardDescription>
            Extend your plan with powerful add-on features.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isElite && (
            <div className="border rounded-md p-4 space-y-2 bg-purple-50 dark:bg-purple-950/20">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                <span className="font-semibold">FuseAI</span>
                <Badge variant="default" className="bg-purple-600">Included with Elite</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                AI proposals, customer sentiment, receipt info extraction, smart messaging & more — all included in your Elite plan at no extra cost.
              </p>
            </div>
          )}

          <div className="border rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-500" />
                <span className="font-semibold">AI Virtual Assistant</span>
                <Badge variant="secondary">{PRICE_LABELS.aiAssistantMonthly}/mo · {PRICE_LABELS.aiAssistantMinutes} min</Badge>
              </div>
              {hasAiAssistant && (
                <Badge variant="default" data-testid="badge-ai-assistant-active">Active</Badge>
              )}
              {!hasAiAssistant && aiAssistantStatus === 'active' && !isElite && (
                <Badge variant="outline" data-testid="badge-ai-assistant-requires-elite">Requires Elite</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Your 24/7 AI receptionist. Answers calls when you can't, captures every lead, and sends you a summary — so you never miss a deal again.
            </p>
            <p className="text-xs text-muted-foreground">
              Elite plan only. Includes {PRICE_LABELS.aiAssistantMinutes} minutes/mo, then {PRICE_LABELS.aiAssistantOverage}/min. Two modes: Basic Receptionist (message-taking) and Full Assistant (transfers, account lookup).
            </p>
            {!isElite && !hasAiAssistant && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  toast({ title: "Upgrade to Elite", description: "AI Virtual Assistant is available for Elite plan subscribers. Upgrade your plan to access this feature." });
                }}
                data-testid="button-ai-assistant-upgrade-required"
              >
                <Crown className="w-4 h-4 mr-2" />
                Upgrade to Elite to Unlock
              </Button>
            )}
            {isElite && !hasAiAssistant && !isIOSApp && (
              <Button
                className="w-full"
                onClick={() => aiAssistantCheckoutMutation.mutate()}
                disabled={aiAssistantCheckoutMutation.isPending}
                data-testid="button-subscribe-ai-assistant"
              >
                {aiAssistantCheckoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bot className="w-4 h-4 mr-2" />}
                Subscribe to AI Virtual Assistant — {PRICE_LABELS.aiAssistantMonthly}/mo
              </Button>
            )}
            {hasAiAssistant && subscription?.aiAssistantSubscriptionId && (
              <Button
                variant="outline"
                className="w-full text-destructive"
                onClick={() => aiAssistantCancelMutation.mutate()}
                disabled={aiAssistantCancelMutation.isPending}
                data-testid="button-cancel-ai-assistant"
              >
                {aiAssistantCancelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Cancel AI Virtual Assistant
              </Button>
            )}
          </div>

          <div className="border rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-emerald-500" />
                <span className="font-semibold">Make It Your Own</span>
                <Badge variant="secondary">{PRICE_LABELS.makeItYourOwnMonthly}/mo</Badge>
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 no-default-hover-elevate no-default-active-elevate" data-testid="badge-white-label-limited-time">Limited Time</Badge>
              </div>
              {hasWhiteLabel && (
                <Badge variant="default" data-testid="badge-white-label-active">Active</Badge>
              )}
              {!hasWhiteLabel && whiteLabelStatus === 'active' && !isElite && (
                <Badge variant="outline" data-testid="badge-white-label-requires-elite">Requires Elite</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Your own branded portal (portal.yourdomain.com) for customer-facing pages and remove all Fuse Phone branding — make every touchpoint 100% yours.
            </p>
            <p className="text-xs text-muted-foreground">
              Elite plan only. Lock in {PRICE_LABELS.makeItYourOwnMonthly}/mo during this limited-time offer.
            </p>
            {!isElite && !hasWhiteLabel && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  toast({ title: "Upgrade to Elite", description: "Make It Your Own is available for Elite plan subscribers. Upgrade your plan to access this add-on." });
                }}
                data-testid="button-white-label-upgrade-required"
              >
                <Crown className="w-4 h-4 mr-2" />
                Upgrade to Elite to Unlock
              </Button>
            )}
            {isElite && !hasWhiteLabel && !isIOSApp && (
              <Button
                className="w-full"
                onClick={() => whiteLabelCheckoutMutation.mutate()}
                disabled={whiteLabelCheckoutMutation.isPending}
                data-testid="button-subscribe-white-label"
              >
                {whiteLabelCheckoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Globe className="w-4 h-4 mr-2" />}
                Subscribe to Make It Your Own — {PRICE_LABELS.makeItYourOwnMonthly}/mo
              </Button>
            )}
            {hasWhiteLabel && subscription?.whiteLabelSubscriptionId && (
              <Button
                variant="outline"
                className="w-full text-destructive"
                onClick={() => whiteLabelCancelMutation.mutate()}
                disabled={whiteLabelCancelMutation.isPending}
                data-testid="button-cancel-white-label"
              >
                {whiteLabelCancelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Cancel Make It Your Own
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5" />
              Upgrade to FusePhone {upgradePriceId === corePrice?.id ? 'Core' : 'Elite'}
            </DialogTitle>
            <DialogDescription>
              Your plan will be upgraded immediately. Here's a breakdown of the charges:
            </DialogDescription>
          </DialogHeader>
          {upgradePreview && (
            <div className="space-y-4 py-2">
              <div className="space-y-3">
                {upgradePreview.credit > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Credit for unused time on current plan</span>
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">
                      -${(upgradePreview.credit / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                {upgradePreview.charge > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{upgradePriceId === corePrice?.id ? 'Core' : 'Elite'} plan (prorated)</span>
                    <span className="text-sm font-medium">
                      ${(upgradePreview.charge / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Amount due today</span>
                    <span className="text-lg font-bold">
                      ${(upgradePreview.totalDue / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Starting next billing cycle, you'll be charged the full {upgradePriceId === corePrice?.id ? 'Core' : 'Elite'} rate.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setUpgradeDialogOpen(false)} data-testid="button-cancel-upgrade">
              Cancel
            </Button>
            <Button 
              onClick={() => upgradePriceId && upgradeMutation.mutate(upgradePriceId)} 
              disabled={upgradeMutation.isPending}
              data-testid="button-confirm-upgrade"
            >
              {upgradeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirm Upgrade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Cancel Subscription
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your FusePhone {getTierLabel(currentTier)} plan?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Your subscription will remain active until the end of your current billing period. After that, you'll lose access to your plan features.
            </p>
            <p className="text-sm text-muted-foreground">
              You can reactivate anytime before the period ends.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} data-testid="button-keep-plan">
              Keep My Plan
            </Button>
            <Button 
              variant="destructive"
              onClick={() => cancelMutation.mutate()} 
              disabled={cancelMutation.isPending}
              data-testid="button-confirm-cancel"
            >
              {cancelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Yes, Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
