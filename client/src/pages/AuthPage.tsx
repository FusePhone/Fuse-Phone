import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, CheckCircle2, Loader2, Mail, Lock, User, MailCheck, RefreshCw,
  Zap, Crown, Gift, X, FileText, Calendar,
  MessageSquare, Sparkles, ChevronRight,
  Clock, DollarSign, PhoneCall, Voicemail, Send,
  TrendingUp, XCircle, Minus, Bot, Facebook, Shield, Layers,
  Star, Camera, CreditCard, BarChart3, Inbox, Pencil, Edit3
} from "lucide-react";
import { PRICE_LABELS } from "@shared/pricing";
import dashboardScreenshot from "@assets/IMG_1722_1776431527489.png";
import financialSettingsScreenshot from "@assets/IMG_1720_1776431527489.png";
import productionMembersScreenshot from "@assets/IMG_1721_1776431527489.png";
import proposalBuilderScreenshot from "@assets/IMG_1724_1776431527489.png";
import customerProposalScreenshot from "@assets/IMG_1727_1776431527489.jpeg";
import customerProposalDetailScreenshot from "@assets/IMG_1729_1776431527489.jpeg";
import incomingLeadScreenshot from "@assets/IMG_1719_1776431527489.png";
import messagesListScreenshot from "@assets/IMG_1718_1776431527489.png";
import { FusePhoneLogoImage } from "@/components/FusePhoneLogo";
import { SiGoogle, SiTwilio, SiZapier, SiStripe, SiFacebook, SiApple, SiGoogleplay } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { clearLogoutFlag } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { isMarketingDomain, getAppUrl, isCustomDomain } from "@/lib/domain";
import { useAuth } from "@/hooks/use-auth";

const STARTER_FEATURES = [
  "Dashboard Overview",
  "Contact & Lead Management",
  "Project Pipeline (6 Stages)",
  "Estimates, Proposals & Invoices",
  "Digital Signatures & Customer Portal",
  "Share via Link or Gmail",
  "Reusable Document Templates",
  "Calendar & Appointment Reminders",
  "3 Automatic Follow-Ups",
  "Overhead & Pricing Calculator",
  "Company Profile & Branding",
  "Unlimited Photos with Annotations",
];

const CORE_FEATURES = [
  "Everything in Starter",
  "Unlimited Photos with Annotations",
  "Full 8-Stage Pipeline",
  "Smart Next Steps",
  "Business Analytics",
  "Email Automations & Templates",
  "Push Notifications",
  "Send Documents via Email",
  "Unlimited Auto Follow-Ups",
  "Stripe Payment Requests",
  "Job Costing & Profit Tracking",
  "AI Receipt Scanner",
];

const ELITE_FEATURES = [
  "Everything in Core",
  "3 Free Field Worker Seats — Crew Lead or Field Employee (clock in/out, view assigned jobs, upload photos & receipts)",
  "Unlimited Photos with Annotations",
  "SMS Texting & Send Documents via Text",
  "Full Phone System (VoIP)",
  "Call Transfer & Conferencing",
  "Crew Management",
  "Time Tracking & Payroll",
  "SMS + Email Automations",
  "Production Rate Estimator",
  "Thumbtack, Zapier & FB Lead Ads",
  "FuseAI included — AI proposals, customer sentiment, receipt extraction & more",
  "Make It Your Own — Custom Branded Portal (add-on)",
  `AI Virtual Assistant (${PRICE_LABELS.aiAssistantMonthly}/mo for ${PRICE_LABELS.aiAssistantMinutes} minutes)`,
];

const PHONE_COMPARISON = [
  { feature: "Never Miss a Lead (AI Answers 24/7)", fuse: true, others: "none" },
  { feature: "Built-in Business Calling", fuse: true, others: "none" },
  { feature: "AI That Sounds Human on Calls", fuse: true, others: "none" },
  { feature: "Call Transfer & Conferencing", fuse: true, others: "none" },
  { feature: "Voicemail Transcription", fuse: true, others: "none" },
  { feature: "Facebook & Instagram Lead Capture", fuse: true, others: "none" },
  { feature: "Text Customers from App", fuse: true, others: "limited" },
  { feature: "Auto Follow-Ups (Text + Email)", fuse: true, others: "limited" },
  { feature: "AI Writes Your Proposals", fuse: true, others: "none" },
  { feature: "Proposals & Invoices", fuse: true, others: "yes" },
  { feature: "Digital Signatures", fuse: true, others: "yes" },
  { feature: "Send to Multiple Decision-Makers", fuse: true, others: "none" },
  { feature: "Calendar & Reminders", fuse: true, others: "limited" },
];

const FEATURE_SHOWCASE = [
  {
    icon: PhoneCall,
    title: "Your Own Business Phone",
    description: "Stop missing calls on the job site. Get a dedicated business number with voicemail, office hours, and call transfer — answer from anywhere or let AI handle it.",
  },
  {
    icon: Bot,
    title: "AI That Never Sleeps",
    description: "Your AI receptionist answers calls 24/7, takes messages like a real person, captures lead info, and texts you a summary. Every call answered. Every lead captured.",
  },
  {
    icon: Send,
    title: "Close Deals Faster",
    description: "Send proposals to both homeowners at once. When husband and wife both see it, you close faster. Digital signatures mean no more chasing paper.",
  },
  {
    icon: Facebook,
    title: "Leads Flow In Automatically",
    description: "Facebook ads, Instagram, Thumbtack — leads land in your pipeline automatically. No manual entry, no copy-paste, no missed opportunities.",
  },
  {
    icon: MessageSquare,
    title: "Follow-Ups That Work for You",
    description: "While you're on the job, Fuse Phone follows up by text and email automatically. Your leads stay warm. You stay focused. Deals close themselves.",
  },
  {
    icon: Sparkles,
    title: "AI Builds Your Proposals",
    description: "Tell AI what the job is and it writes the proposal for you — room by room, line by line, with pricing. What used to take an hour takes 60 seconds.",
  },
  {
    icon: Calendar,
    title: "Never Forget an Appointment",
    description: "Automatic SMS and email reminders for every appointment. Customers show up. You show up. No more no-shows costing you money.",
  },
  {
    icon: Clock,
    title: "Crew Time Tracking",
    description: "Your crew clocks in from their phone. You see hours in real-time. Accurate payroll, no paper timesheets, no arguments about hours.",
  },
  {
    icon: FileText,
    title: "Professional Documents, Fast",
    description: "Proposals, invoices, change orders — polished and ready in minutes. Customers sign from their phone. No app downloads, no friction.",
  },
  {
    icon: TrendingUp,
    title: "Know Your Numbers",
    description: "See revenue, close rates, and where deals get stuck — all on one dashboard. Stop guessing and start growing.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "1",
    icon: Inbox,
    title: "Receive the Lead",
    description: "Calls, texts, Facebook, Instagram, Thumbtack, and your booking form all land in one inbox. Pictures, voicemails, and customer info auto-attach. Nothing slips through the cracks.",
    image: incomingLeadScreenshot,
    imageAlt: "A new customer text with photos of rooms to be painted, captured directly in Fuse Phone",
  },
  {
    step: "2",
    icon: Edit3,
    title: "Build the Proposal",
    description: "Tap rooms, surfaces, and coats — your production rates do the math. Add photos, packages, and add-ons. AI can write the whole thing for you in seconds if you'd rather just describe the job.",
    image: proposalBuilderScreenshot,
    imageAlt: "A draft proposal in Fuse Phone with photos, rooms, and line items already filled in",
  },
  {
    step: "3",
    icon: Send,
    title: "Send It & Get Signed",
    description: "Customer opens the link on their phone, sees a clean room-by-room breakdown, and signs right there — no app downloads, no PDFs in email. Auto follow-ups nudge them if they don't sign right away.",
    image: customerProposalScreenshot,
    imageAlt: "The customer's view of a proposal — clean, branded, with one-tap Accept & Sign",
  },
  {
    step: "4",
    icon: CreditCard,
    title: "Get Paid",
    description: "Send a Stripe payment request, take a card on the job, or invoice when the work is done. Sales, revenue, and profit show up live on your dashboard so you always know where you stand.",
    image: dashboardScreenshot,
    imageAlt: "Dashboard showing $25,926 in sales, $9,900 revenue, and break-even hit for the month",
  },
];

const RESULTS_STATS = [
  {
    icon: TrendingUp,
    value: "Up to 30%",
    label: "Higher closing rate",
    detail: "Faster proposals + auto follow-ups + multiple-recipient sends turn more leads into signed jobs.",
  },
  {
    icon: MessageSquare,
    value: "0 missed",
    label: "Lead follow-ups",
    detail: "Every lead gets texted and emailed automatically — even when you're on a ladder.",
  },
  {
    icon: Star,
    value: "5★",
    label: "Auto Google reviews",
    detail: "When a job is marked complete, the customer gets an automatic ask to leave you a review.",
  },
];

const PAINTER_FEATURES = [
  {
    icon: BarChart3,
    title: "Know Your Real Numbers",
    description: "Plug in your labor cost, overhead, and target net profit — Fuse Phone calculates your sell rate, gross margin, and exact break-even hours per month. Stop guessing your prices.",
    image: financialSettingsScreenshot,
    imageAlt: "Financial Settings screen showing labor cost, sell rate, gross margin, and break-even",
    bullets: [
      "Auto-calculate sell rate from your target net profit",
      "Live break-even and monthly profit projections",
      "True labor cost — not just base hourly",
    ],
  },
  {
    icon: FileText,
    title: "What Your Customer Actually Sees",
    description: "When you send a proposal, the customer opens a clean, branded room-by-room breakdown on their phone. No PDFs, no logins, no friction. They tap Accept & Sign and the deal is done.",
    image: customerProposalDetailScreenshot,
    imageAlt: "Customer-facing proposal showing room-by-room breakdown and Accept & Sign button",
    bullets: [
      "Mobile-first, branded customer view",
      "Room-by-room pricing with surfaces and coats",
      "One-tap Accept & Sign — no app downloads",
    ],
  },
  {
    icon: User,
    title: "Crew, Time, & Payroll",
    description: "Add your mechanics, leads, and helpers. They clock in from their phone. You see hours, true labor cost with burden built in, and run payroll without paper timesheets.",
    image: productionMembersScreenshot,
    imageAlt: "Production Members screen showing crew with hourly rates and true cost per hour",
    bullets: [
      "Crew clocks in from their own phone",
      "True labor cost shown next to base hourly",
      "Inactive members archived, not deleted",
    ],
  },
];

type SignupIntent = { plan: 'starter' | 'core' | 'elite'; action: 'trial' | 'subscribe' } | null;

const APP_STORE_URL = "https://apps.apple.com/app/fuse-phone-crm/id6759543207";

// Apple/Google-style download pills. Apple is a live link to the App Store.
// Google Play renders as a disabled "Coming soon" pill (no link) since the
// Android build isn't published yet — keeping it visible signals it's
// planned so contractors with Android phones don't bounce.
function AppDownloadBadges({
  align = "center",
  size = "md",
}: {
  align?: "start" | "center" | "end";
  size?: "md" | "lg";
}) {
  const justify = align === "start" ? "justify-start" : align === "end" ? "justify-end sm:justify-end" : "justify-center";
  const pillPadding = size === "lg" ? "px-5 py-3" : "px-4 py-2.5";
  const iconSize = size === "lg" ? "w-7 h-7" : "w-6 h-6";
  const labelTop = size === "lg" ? "text-[10px]" : "text-[9px]";
  const labelMain = size === "lg" ? "text-base" : "text-sm";
  return (
    <div className={`flex flex-wrap items-center gap-3 ${justify}`}>
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-3 ${pillPadding} rounded-xl bg-black text-white border border-white/10 hover:bg-zinc-900 transition-colors`}
        data-testid="link-app-store"
        aria-label="Download Fuse Phone on the App Store"
      >
        <SiApple className={iconSize} />
        <span className="flex flex-col items-start leading-tight">
          <span className={`${labelTop} text-zinc-300 tracking-wide`}>Download on the</span>
          <span className={`${labelMain} font-semibold tracking-tight`}>App Store</span>
        </span>
      </a>
      <div
        role="status"
        aria-disabled="true"
        className={`inline-flex items-center gap-3 ${pillPadding} rounded-xl bg-zinc-800/80 text-zinc-300 border border-white/5 cursor-not-allowed select-none`}
        data-testid="badge-google-play-coming-soon"
        title="Android app coming soon"
      >
        <SiGoogleplay className={iconSize} />
        <span className="flex flex-col items-start leading-tight">
          <span className={`${labelTop} text-zinc-400 tracking-wide`}>Android</span>
          <span className={`${labelMain} font-semibold tracking-tight`}>Coming Soon</span>
        </span>
      </div>
    </div>
  );
}

export default function AuthPage({ forceNative }: { forceNative?: boolean } = {}) {
  console.log('[NATIVE-DEBUG] AuthPage: ENTERED component, forceNative:', forceNative);

  const { user: authUser, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [exchangingToken, setExchangingToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !!params.get('auth_token');
  });

  useEffect(() => {
    if (authUser && !authLoading) {
      const isOnMarketingSite = isMarketingDomain();
      if (isOnMarketingSite) {
        window.location.href = getAppUrl('/');
      } else {
        navigate('/');
      }
    }
  }, [authUser, authLoading, navigate]);

  const [showSignIn, setShowSignIn] = useState(false);
  const [signupIntent, setSignupIntent] = useState<SignupIntent>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupLastName, setSignupLastName] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');
  const [webOtpStep, setWebOtpStep] = useState<'email' | 'code'>('email');
  const [webOtpEmail, setWebOtpEmail] = useState("");
  const [webOtpCode, setWebOtpCode] = useState("");
  const [webOtpLoading, setWebOtpLoading] = useState(false);
  const [webOtpError, setWebOtpError] = useState("");
  const [webOtpCooldown, setWebOtpCooldown] = useState(0);

  const [showVerificationMessage, setShowVerificationMessage] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationContext, setVerificationContext] = useState<'signup' | 'signin'>('signup');
  const [isResending, setIsResending] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteInfo, setInviteInfo] = useState<{ companyName: string; role: string; email: string; logo: string | null } | null>(null);

  const [nativeStep, setNativeStep] = useState<'email' | 'otp' | 'error'>('email');
  const [nativeEmail, setNativeEmail] = useState('');
  const [nativeOtp, setNativeOtp] = useState('');
  const [nativeLoading, setNativeLoading] = useState(false);
  const [nativeError, setNativeError] = useState('');
  const [nativeResendCooldown, setNativeResendCooldown] = useState(0);
  const [nativeRemainingAttempts, setNativeRemainingAttempts] = useState<number | null>(null);

  const [customBranding, setCustomBranding] = useState<{ companyName: string; logo: string | null; brandColor: string | null } | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referrerName, setReferrerName] = useState<string | null>(null);

  useEffect(() => {
    if (isCustomDomain()) {
      fetch('/api/public/custom-domain/branding')
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setCustomBranding(data); })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (nativeResendCooldown <= 0) return;
    const timer = setTimeout(() => setNativeResendCooldown(nativeResendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [nativeResendCooldown]);

  const acceptInviteIfPresent = async () => {
    if (!inviteToken) return;
    try {
      await fetch(`/api/company/invitations/accept/${inviteToken}`, {
        method: "POST",
        credentials: "include",
      });
    } catch {}
  };

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pricingRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Capture referral code from URL or localStorage; show banner if a referrer is found
    const refFromUrl = params.get('ref');
    const stored = (() => {
      try { return localStorage.getItem('fp_ref'); } catch { return null; }
    })();
    const ref = (refFromUrl || stored || '').toLowerCase();
    if (ref) {
      try { localStorage.setItem('fp_ref', ref); } catch {}
      setReferralCode(ref);
      // Look up referrer name (best-effort)
      fetch(`/api/public/referral/${encodeURIComponent(ref)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.name) setReferrerName(d.name); })
        .catch(() => {});
      // If signup=1 was in the URL, remember intent
      if (params.get('signup') === '1') {
        // ensure we surface the signup pane
        setShowSignIn(false);
      }
      // Clean ref/signup from URL
      params.delete('ref');
      params.delete('signup');
      const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }

    const invite = params.get('invite');
    if (invite) {
      window.location.replace(`/invite/${invite}`);
      return;
    }
    const action = params.get('action');
    if (action === 'signin') {
      setShowSignIn(true);
      params.delete('action');
      const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } else if (action === 'signup') {
      const plan = (params.get('plan') as 'starter' | 'core' | 'elite') || 'core';
      const intent = (params.get('intent') as 'trial' | 'subscribe') || 'trial';
      setSignupIntent({ plan, action: intent });
      params.delete('action');
      params.delete('plan');
      params.delete('intent');
      const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error === 'no_account') {
      toast({
        title: "No account found",
        description: "There's no account with that email. Please sign up first to create one.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/');
    } else if (error === 'google_auth_cancelled') {
      toast({
        title: "Sign-in cancelled",
        description: "Google sign-in was cancelled.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/');
    } else if (error === 'domain_blocked') {
      toast({
        title: "Registration not allowed",
        description: "New accounts cannot be created with this email domain. Please use a different email address.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/');
    } else if (error === 'google_auth_failed') {
      toast({
        title: "Sign-in failed",
        description: "Something went wrong with Google sign-in. Please try again.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/');
    }

    const authToken = params.get('auth_token');
    if (authToken) {
      window.history.replaceState({}, '', '/auth');
      setExchangingToken(true);
      (async () => {
        try {
          const res = await fetch('/api/auth/exchange-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token: authToken }),
          });
          const data = await res.json();
          if (data.success && data.user) {
            queryClient.removeQueries({
              predicate: (query) => String(query.queryKey[0]) !== '/api/auth/user',
            });
            clearLogoutFlag();
            queryClient.setQueryData(["/api/auth/user"], data.user);
          } else {
            setExchangingToken(false);
            toast({ title: "Sign-in failed", description: "Authentication token expired. Please try again.", variant: "destructive" });
          }
        } catch {
          setExchangingToken(false);
          toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
        }
      })();
    }
  }, []);

  const handleResendVerification = async () => {
    setIsResending(true);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verificationEmail }),
      });
      const data = await response.json();
      toast({ title: "Verification Email", description: data.message });
    } catch {
      toast({ title: "Error", description: "Failed to resend verification email", variant: "destructive" });
    } finally {
      setIsResending(false);
    }
  };

  const isNativeApp = () => {
    if ((window as any).__CAPACITOR_NATIVE) return true;
    if (document.documentElement.classList.contains('capacitor-native')) return true;
    return !!(window as any).Capacitor?.isNativePlatform?.() || !!(window as any).Capacitor?.isNative;
  };

  const openOAuthUrl = async (url: string) => {
    if (isNativeApp()) {
      try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url, windowName: '_self' });
      } catch {
        window.location.href = url;
      }
    } else {
      window.location.href = url;
    }
  };

  const handleGoogleSignIn = () => {
    if (isMarketingDomain()) {
      window.location.href = getAppUrl('/api/auth/google?intent=signin');
      return;
    }
    const mobileParam = isNativeApp() ? '&mobile=1' : '';
    const oauthUrl = `${window.location.origin}/api/auth/google?intent=signin${mobileParam}`;
    openOAuthUrl(oauthUrl);
  };

  const handleGoogleSignUp = () => {
    if (!signupIntent) return;
    const plan = signupIntent.plan;
    if (isMarketingDomain()) {
      window.location.href = getAppUrl(`/auth?action=signup&plan=${plan}&intent=${signupIntent.action}`);
      return;
    }
    localStorage.setItem('selectedPlan', plan);
    if (signupIntent.action === 'subscribe') {
      localStorage.setItem('postAuthAction', 'subscribe');
    }
    const mobileParam = isNativeApp() ? '&mobile=1' : '';
    const oauthUrl = `${window.location.origin}/api/auth/google?plan=${plan}&intent=signup${mobileParam}`;
    openOAuthUrl(oauthUrl);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMarketingDomain()) {
      window.location.href = getAppUrl('/auth?action=signin');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.requiresVerification) {
          setVerificationEmail(data.email || loginEmail);
          setVerificationContext('signin');
          setShowVerificationMessage(true);
          return;
        }
        toast({ title: "Login Failed", description: data.message || "Something went wrong", variant: "destructive" });
        return;
      }
      // Account was scheduled for deletion — route to restore screen.
      if (data.deleted) {
        try {
          const { setRestoreContext } = await import("@/pages/RestoreAccount");
          setRestoreContext(data.restoreToken || "", data.email || loginEmail);
        } catch {}
        window.location.href = "/restore-account";
        return;
      }
      await acceptInviteIfPresent();
      queryClient.removeQueries({
        predicate: (query) => String(query.queryKey[0]) !== '/api/auth/user',
      });
      clearLogoutFlag();
      queryClient.setQueryData(["/api/auth/user"], data.user);
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleWebOtpRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMarketingDomain()) {
      window.location.href = getAppUrl('/auth?action=signin');
      return;
    }
    if (!webOtpEmail.trim()) {
      toast({ title: "Email Required", description: "Please enter your email address.", variant: "destructive" });
      return;
    }
    setWebOtpLoading(true);
    setWebOtpError("");
    try {
      const response = await fetch("/api/auth/web/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: webOtpEmail.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setWebOtpError(data.message || "Too many requests. Please wait.");
        return;
      }
      setWebOtpStep('code');
      setWebOtpCooldown(60);
      toast({ title: "Code Sent", description: "Check your email for a verification code." });
    } catch {
      setWebOtpError("Something went wrong. Please try again.");
    } finally {
      setWebOtpLoading(false);
    }
  };

  const handleWebOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webOtpCode.trim()) {
      setWebOtpError("Please enter the verification code.");
      return;
    }
    setWebOtpLoading(true);
    setWebOtpError("");
    try {
      const response = await fetch("/api/auth/web/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: webOtpEmail.trim(), code: webOtpCode.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setWebOtpError(data.message || "Invalid code.");
        if (data.remainingAttempts !== undefined && data.remainingAttempts === 0) {
          setWebOtpStep('email');
          setWebOtpCode("");
        }
        return;
      }
      if (data.success && data.user) {
        await acceptInviteIfPresent();
        queryClient.removeQueries({
          predicate: (query) => String(query.queryKey[0]) !== '/api/auth/user',
        });
        clearLogoutFlag();
        queryClient.setQueryData(["/api/auth/user"], data.user);
      }
    } catch {
      setWebOtpError("Something went wrong. Please try again.");
    } finally {
      setWebOtpLoading(false);
    }
  };

  const handleWebOtpResend = async () => {
    if (webOtpCooldown > 0) return;
    setWebOtpLoading(true);
    setWebOtpError("");
    try {
      const response = await fetch("/api/auth/web/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: webOtpEmail.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setWebOtpError(data.message || "Too many requests.");
        return;
      }
      setWebOtpCooldown(60);
      toast({ title: "Code Resent", description: "A new code has been sent to your email." });
    } catch {
      setWebOtpError("Failed to resend code.");
    } finally {
      setWebOtpLoading(false);
    }
  };

  useEffect(() => {
    if (webOtpCooldown <= 0) return;
    const timer = setInterval(() => setWebOtpCooldown(c => c <= 1 ? 0 : c - 1), 1000);
    return () => clearInterval(timer);
  }, [webOtpCooldown]);

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupIntent) return;
    if (isMarketingDomain()) {
      window.location.href = getAppUrl(`/auth?action=signup&plan=${signupIntent.plan}&intent=${signupIntent.action}`);
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: signupEmail,
          password: signupPassword,
          firstName: signupFirstName,
          lastName: signupLastName,
          selectedPlan: signupIntent.plan,
          referralCode: referralCode || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.requiresVerification) {
          setVerificationEmail(data.email || signupEmail);
          setVerificationContext('signup');
          setShowVerificationMessage(true);
          return;
        }
        toast({ title: "Registration Failed", description: data.message || "Something went wrong", variant: "destructive" });
        return;
      }
      if (data.requiresVerification) {
        setVerificationEmail(signupEmail);
        setVerificationContext('signup');
        setShowVerificationMessage(true);
        toast({ title: "Check Your Email", description: data.message });
        return;
      }
      await acceptInviteIfPresent();
      queryClient.removeQueries({
        predicate: (query) => String(query.queryKey[0]) !== '/api/auth/user',
      });
      clearLogoutFlag();
      queryClient.setQueryData(["/api/auth/user"], data.user);
      // Card required up front: send the new user to Billing where their
      // selected plan is auto-launched into Stripe Checkout.
      const plan = signupIntent?.plan || 'core';
      window.location.href = `/billing?plan=${plan}`;
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const closeSignIn = () => {
    setShowSignIn(false);
    setLoginEmail("");
    setLoginPassword("");
    setShowVerificationMessage(false);
  };

  const closeSignUp = () => {
    setSignupIntent(null);
    setSignupEmail("");
    setSignupPassword("");
    setSignupFirstName("");
    setSignupLastName("");
    setShowVerificationMessage(false);
  };

  const scrollToPricing = () => {
    pricingRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const [authMode, setAuthMode] = useState<'signin' | 'signup'>(showSignIn || !signupIntent ? 'signin' : 'signup');
  const [standalonePlan, setStandalonePlan] = useState<'starter' | 'core' | 'elite'>(signupIntent?.plan || 'core');
  // Show only the chosen tier on the signup form by default. Users can click
  // "Change plan" to reveal all three. Without this, picking Starter on a tier
  // card would still SHOW all three with Core highlighted (initial-state bug
  // — useState only reads signupIntent on first render).
  const [showAllPlans, setShowAllPlans] = useState(false);

  useEffect(() => {
    if (showSignIn) setAuthMode('signin');
    else if (signupIntent) setAuthMode('signup');
  }, [showSignIn, signupIntent]);

  // Keep the standalone signup form's selected plan in sync with the tier
  // card the user clicked. Initial-state-only sync misses later changes.
  useEffect(() => {
    if (signupIntent?.plan) {
      setStandalonePlan(signupIntent.plan);
      setShowAllPlans(false);
    }
  }, [signupIntent?.plan]);

  const renderVerification = (onBack: () => void) => (
    <div className="text-center py-4">
      <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
        <MailCheck className="w-8 h-8 text-primary" />
      </div>
      <h3 className="font-bold text-lg mb-2">Check Your Email</h3>
      <p className="text-sm text-muted-foreground mb-4">
        We sent a verification link to <strong>{verificationEmail}</strong>.
        Please click the link in the email to verify your account.
      </p>
      <p className="text-xs text-muted-foreground mb-4">The link expires in 24 hours.</p>
      <div className="space-y-3">
        <Button variant="outline" onClick={handleResendVerification} disabled={isResending} className="w-full" data-testid="button-resend-verification">
          {isResending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Resend Verification Email
        </Button>
        <Button variant="ghost" onClick={onBack} className="w-full" data-testid="button-back">
          Back
        </Button>
      </div>
    </div>
  );

  const renderSignInModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) closeSignIn(); }}>
      <Card className="w-full max-w-md relative">
        <Button size="icon" variant="ghost" className="absolute top-3 right-3" onClick={closeSignIn} data-testid="button-close-signin">
          <X className="w-4 h-4" />
        </Button>
        <CardContent className="pt-6 pb-6">
          {showVerificationMessage && verificationContext === 'signin' ? renderVerification(closeSignIn) : (
            <>
              {inviteInfo && (
                <div className="mb-4 p-3 rounded-lg border bg-primary/5 text-sm" data-testid="invite-banner-signin">
                  <p className="font-medium">You've been invited to join <strong>{inviteInfo.companyName}</strong></p>
                  <p className="text-muted-foreground mt-1">Role: {inviteInfo.role}</p>
                </div>
              )}
              <div className="mb-5">
                <h3 className="font-bold text-xl">Welcome back</h3>
                <p className="text-sm text-muted-foreground">Sign in to access your dashboard</p>
              </div>

              <Button onClick={handleGoogleSignIn} variant="outline" size="lg" className="w-full text-base mb-3" data-testid="button-google-login">
                <SiGoogle className="w-5 h-5 mr-2" />
                Sign in with Google
              </Button>

              <div className="relative my-4">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">or</span>
              </div>

              <div className="flex rounded-lg border mb-4 overflow-hidden" data-testid="signin-method-toggle">
                <button type="button" onClick={() => { setLoginMethod('password'); setWebOtpStep('email'); setWebOtpError(""); }} className={`flex-1 py-2 text-sm font-medium transition-colors ${loginMethod === 'password' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`} data-testid="button-method-password">
                  <Lock className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Password
                </button>
                <button type="button" onClick={() => { setLoginMethod('otp'); setWebOtpError(""); }} className={`flex-1 py-2 text-sm font-medium transition-colors ${loginMethod === 'otp' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`} data-testid="button-method-otp">
                  <Mail className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Email Code
                </button>
              </div>

              {loginMethod === 'password' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="signin-email" type="email" placeholder="you@example.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="pl-10" required data-testid="input-signin-email" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <Label htmlFor="signin-password">Password</Label>
                      <a href="/forgot-password" className="text-xs text-primary underline" data-testid="link-forgot-password">Forgot password?</a>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="signin-password" type="password" placeholder="Enter your password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="pl-10" required data-testid="input-signin-password" />
                    </div>
                  </div>
                  <Button type="submit" size="lg" className="w-full" disabled={isLoading} data-testid="button-submit-signin">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                    Sign In
                    {!isLoading && <ArrowRight className="w-5 h-5 ml-2" />}
                  </Button>
                </form>
              ) : webOtpStep === 'email' ? (
                <form onSubmit={handleWebOtpRequest} className="space-y-4">
                  <p className="text-sm text-muted-foreground">We'll send a 6-digit code to your email.</p>
                  <div className="space-y-2">
                    <Label htmlFor="otp-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="otp-email" type="email" placeholder="you@example.com" value={webOtpEmail} onChange={(e) => setWebOtpEmail(e.target.value)} className="pl-10" required data-testid="input-otp-email" />
                    </div>
                  </div>
                  {webOtpError && <p className="text-sm text-destructive" data-testid="text-otp-error">{webOtpError}</p>}
                  <Button type="submit" size="lg" className="w-full" disabled={webOtpLoading} data-testid="button-send-code">
                    {webOtpLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                    Send Code
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleWebOtpVerify} className="space-y-4">
                  <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to <strong>{webOtpEmail}</strong></p>
                  <div className="space-y-2">
                    <Label htmlFor="otp-code">Verification Code</Label>
                    <Input id="otp-code" type="text" maxLength={6} placeholder="ABC123" value={webOtpCode} onChange={(e) => setWebOtpCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} className="text-center text-2xl tracking-[0.5em] font-mono" autoFocus autoComplete="one-time-code" data-testid="input-otp-code" />
                  </div>
                  {webOtpError && <p className="text-sm text-destructive" data-testid="text-otp-error">{webOtpError}</p>}
                  <Button type="submit" size="lg" className="w-full" disabled={webOtpLoading} data-testid="button-verify-code">
                    {webOtpLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                    Verify & Sign In
                    {!webOtpLoading && <ArrowRight className="w-5 h-5 ml-2" />}
                  </Button>
                  <div className="flex items-center justify-between text-sm">
                    <button type="button" onClick={() => { setWebOtpStep('email'); setWebOtpCode(""); setWebOtpError(""); }} className="text-muted-foreground hover:text-foreground" data-testid="button-otp-back">
                      Change email
                    </button>
                    <button type="button" onClick={handleWebOtpResend} disabled={webOtpCooldown > 0} className={`${webOtpCooldown > 0 ? 'text-muted-foreground' : 'text-primary hover:underline'}`} data-testid="button-resend-code">
                      {webOtpCooldown > 0 ? `Resend in ${webOtpCooldown}s` : 'Resend code'}
                    </button>
                  </div>
                </form>
              )}

              <p className="text-sm text-center mt-4 text-muted-foreground">
                Don't have an account? Pick a plan above to get started.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderSignUpModal = () => {
    if (!signupIntent) return null;
    const planLabel = signupIntent.plan === 'elite' ? 'FusePhone Elite' : signupIntent.plan === 'starter' ? 'FusePhone Starter' : 'FusePhone Core';
    const priceLabel = signupIntent.plan === 'elite' ? PRICE_LABELS.eliteMonthly : signupIntent.plan === 'starter' ? PRICE_LABELS.starterMonthly : PRICE_LABELS.coreMonthly;
    const trialLabel = '14-Day Free Trial';
    const actionLabel = signupIntent.action === 'trial' ? trialLabel : `Subscribe (${priceLabel}/mo)`;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) closeSignUp(); }}>
        <Card className="w-full max-w-md relative">
          <Button size="icon" variant="ghost" className="absolute top-3 right-3" onClick={closeSignUp} data-testid="button-close-signup">
            <X className="w-4 h-4" />
          </Button>
          <CardContent className="pt-6 pb-6">
            {showVerificationMessage && verificationContext === 'signup' ? renderVerification(closeSignUp) : (
              <>
                {inviteInfo && (
                  <div className="mb-4 p-3 rounded-lg border bg-primary/5 text-sm" data-testid="invite-banner">
                    <p className="font-medium">You've been invited to join <strong>{inviteInfo.companyName}</strong></p>
                    <p className="text-muted-foreground mt-1">Role: {inviteInfo.role}</p>
                  </div>
                )}
                {referralCode && !(typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) && (
                  <div className="mb-4 p-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-sm flex items-start gap-2" data-testid="banner-referral-discount">
                    <span className="text-lg">🎁</span>
                    <div>
                      <p className="font-medium">You'll get $10 off your first month</p>
                      <p className="text-muted-foreground">{referrerName ? `Referred by ${referrerName}` : 'Friend referral applied'} — discount is applied automatically at checkout.</p>
                    </div>
                  </div>
                )}
                <div className="mb-5">
                  <h3 className="font-bold text-xl">Create your account</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs">
                      {signupIntent.plan === 'elite' ? <Crown className="w-3 h-3 mr-1" /> : signupIntent.plan === 'starter' ? <Zap className="w-3 h-3 mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                      {planLabel} - {actionLabel}
                    </Badge>
                  </div>
                </div>

                <Button onClick={handleGoogleSignUp} variant="outline" size="lg" className="w-full text-base mb-3" data-testid="button-google-signup">
                  <SiGoogle className="w-5 h-5 mr-2" />
                  Sign up with Google
                </Button>

                <div className="relative my-4">
                  <Separator />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">or</span>
                </div>

                <form onSubmit={handleSignupSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="signup-first">First Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input id="signup-first" placeholder="John" value={signupFirstName} onChange={(e) => setSignupFirstName(e.target.value)} className="pl-10" data-testid="input-first-name" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-last">Last Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input id="signup-last" placeholder="Doe" value={signupLastName} onChange={(e) => setSignupLastName(e.target.value)} className="pl-10" data-testid="input-last-name" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="signup-email" type="email" placeholder="you@example.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} className="pl-10" required data-testid="input-email" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="signup-password" type="password" placeholder="At least 8 characters" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} className="pl-10" required minLength={8} data-testid="input-password" />
                    </div>
                  </div>
                  <Button type="submit" size="lg" className="w-full" disabled={isLoading} data-testid="button-submit-signup">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                    Start Free Trial
                    {!isLoading && <ArrowRight className="w-5 h-5 ml-2" />}
                  </Button>
                </form>

                <p className="text-sm text-center mt-4 text-muted-foreground">
                  Already have an account?{" "}
                  <button type="button" onClick={() => { closeSignUp(); setShowSignIn(true); }} className="text-primary font-medium underline" data-testid="link-to-signin">
                    Sign in
                  </button>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  if (!isMarketingDomain()) {
    const handleStandaloneSignUp = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      try {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: signupEmail,
            password: signupPassword,
            firstName: signupFirstName,
            lastName: signupLastName,
            selectedPlan: standalonePlan,
            referralCode: referralCode || undefined,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          if (data.requiresVerification) {
            setVerificationEmail(data.email || signupEmail);
            setVerificationContext('signup');
            setShowVerificationMessage(true);
            return;
          }
          toast({ title: "Registration Failed", description: data.message || "Something went wrong", variant: "destructive" });
          return;
        }
        if (data.requiresVerification) {
          setVerificationEmail(signupEmail);
          setVerificationContext('signup');
          setShowVerificationMessage(true);
          toast({ title: "Check Your Email", description: data.message });
          return;
        }
        queryClient.removeQueries({
          predicate: (query) => String(query.queryKey[0]) !== '/api/auth/user',
        });
        clearLogoutFlag();
        queryClient.setQueryData(["/api/auth/user"], data.user);
        // Card required up front: send the new user to Billing where their
        // selected plan auto-launches into Stripe Checkout.
        window.location.href = `/billing?plan=${standalonePlan}`;
      } catch {
        toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    const handleStandaloneGoogleSignUp = () => {
      localStorage.setItem('selectedPlan', standalonePlan);
      const mobileParam = isNativeApp() ? '&mobile=1' : '';
      const oauthUrl = `${window.location.origin}/api/auth/google?plan=${standalonePlan}&intent=signup${mobileParam}`;
      openOAuthUrl(oauthUrl);
    };

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="flex flex-col items-center mb-8">
              {customBranding?.logo ? (
                <img src={customBranding.logo} alt={customBranding.companyName} className="h-16 w-auto object-contain" data-testid="img-custom-logo" />
              ) : (
                <FusePhoneLogoImage size="xl" />
              )}
              <h1 className="font-display font-bold text-2xl mt-4" data-testid="text-auth-title">{customBranding?.companyName || 'Fuse Phone'}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {authMode === 'signin' ? 'Sign in to your account' : 'Create your account'}
              </p>
            </div>

            <Card>
              <CardContent className="pt-6 pb-6">
                {showVerificationMessage ? renderVerification(() => setShowVerificationMessage(false)) : authMode === 'signin' ? (
                  <>
                    <Button onClick={handleGoogleSignIn} variant="outline" size="lg" className="w-full text-base mb-3" data-testid="button-google-login">
                      <SiGoogle className="w-5 h-5 mr-2" />
                      Sign in with Google
                    </Button>

                    <div className="relative my-4">
                      <Separator />
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">or</span>
                    </div>

                    <div className="flex rounded-lg border mb-4 overflow-hidden" data-testid="signin-method-toggle-app">
                      <button type="button" onClick={() => { setLoginMethod('password'); setWebOtpStep('email'); setWebOtpError(""); }} className={`flex-1 py-2 text-sm font-medium transition-colors ${loginMethod === 'password' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`} data-testid="button-method-password-app">
                        <Lock className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Password
                      </button>
                      <button type="button" onClick={() => { setLoginMethod('otp'); setWebOtpError(""); }} className={`flex-1 py-2 text-sm font-medium transition-colors ${loginMethod === 'otp' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`} data-testid="button-method-otp-app">
                        <Mail className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Email Code
                      </button>
                    </div>

                    {loginMethod === 'password' ? (
                      <form onSubmit={handleLoginSubmit} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="app-signin-email">Email</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input id="app-signin-email" type="email" placeholder="you@example.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="pl-10" required data-testid="input-signin-email" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <Label htmlFor="app-signin-password">Password</Label>
                            <a href="/forgot-password" className="text-xs text-primary underline" data-testid="link-forgot-password">Forgot password?</a>
                          </div>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input id="app-signin-password" type="password" placeholder="Enter your password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="pl-10" required data-testid="input-signin-password" />
                          </div>
                        </div>
                        <Button type="submit" size="lg" className="w-full" disabled={isLoading} data-testid="button-submit-signin">
                          {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                          Sign In
                          {!isLoading && <ArrowRight className="w-5 h-5 ml-2" />}
                        </Button>
                      </form>
                    ) : webOtpStep === 'email' ? (
                      <form onSubmit={handleWebOtpRequest} className="space-y-4">
                        <p className="text-sm text-muted-foreground">We'll send a 6-digit code to your email.</p>
                        <div className="space-y-2">
                          <Label htmlFor="app-otp-email">Email</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input id="app-otp-email" type="email" placeholder="you@example.com" value={webOtpEmail} onChange={(e) => setWebOtpEmail(e.target.value)} className="pl-10" required data-testid="input-otp-email-app" />
                          </div>
                        </div>
                        {webOtpError && <p className="text-sm text-destructive" data-testid="text-otp-error-app">{webOtpError}</p>}
                        <Button type="submit" size="lg" className="w-full" disabled={webOtpLoading} data-testid="button-send-code-app">
                          {webOtpLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                          Send Code
                        </Button>
                      </form>
                    ) : (
                      <form onSubmit={handleWebOtpVerify} className="space-y-4">
                        <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to <strong>{webOtpEmail}</strong></p>
                        <div className="space-y-2">
                          <Label htmlFor="app-otp-code">Verification Code</Label>
                          <Input id="app-otp-code" type="text" maxLength={6} placeholder="ABC123" value={webOtpCode} onChange={(e) => setWebOtpCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} className="text-center text-2xl tracking-[0.5em] font-mono" autoFocus autoComplete="one-time-code" data-testid="input-otp-code-app" />
                        </div>
                        {webOtpError && <p className="text-sm text-destructive" data-testid="text-otp-error-app">{webOtpError}</p>}
                        <Button type="submit" size="lg" className="w-full" disabled={webOtpLoading} data-testid="button-verify-code-app">
                          {webOtpLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                          Verify & Sign In
                          {!webOtpLoading && <ArrowRight className="w-5 h-5 ml-2" />}
                        </Button>
                        <div className="flex items-center justify-between text-sm">
                          <button type="button" onClick={() => { setWebOtpStep('email'); setWebOtpCode(""); setWebOtpError(""); }} className="text-muted-foreground hover:text-foreground" data-testid="button-otp-back-app">
                            Change email
                          </button>
                          <button type="button" onClick={handleWebOtpResend} disabled={webOtpCooldown > 0} className={`${webOtpCooldown > 0 ? 'text-muted-foreground' : 'text-primary hover:underline'}`} data-testid="button-resend-code-app">
                            {webOtpCooldown > 0 ? `Resend in ${webOtpCooldown}s` : 'Resend code'}
                          </button>
                        </div>
                      </form>
                    )}

                    <p className="text-sm text-center mt-4 text-muted-foreground">
                      Don't have an account?{" "}
                      <button type="button" onClick={() => setAuthMode('signup')} className="text-primary font-medium underline" data-testid="link-to-signup">
                        Sign up
                      </button>
                    </p>
                  </>
                ) : (
                  <>
                    {!showAllPlans ? (
                      // Collapsed: show ONLY the chosen tier, with a small link
                      // to reveal the other two. Avoids the "all three at the
                      // top with Core preselected" feel the user complained
                      // about — the picked tier from the previous page wins.
                      <div className="mb-4 p-3 rounded-lg border bg-primary/5 flex items-center justify-between gap-2" data-testid="card-selected-plan">
                        <div className="flex items-center gap-2 min-w-0">
                          {standalonePlan === 'elite'
                            ? <Crown className="w-5 h-5 text-primary shrink-0" />
                            : <Zap className="w-5 h-5 text-primary shrink-0" />}
                          <div className="min-w-0">
                            <p className="font-semibold text-sm leading-tight">
                              {standalonePlan === 'starter' ? 'FusePhone Starter' : standalonePlan === 'core' ? 'FusePhone Core' : 'FusePhone Elite'} selected
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {standalonePlan === 'starter' ? PRICE_LABELS.starterMonthly : standalonePlan === 'core' ? PRICE_LABELS.coreMonthly : PRICE_LABELS.eliteMonthly}/mo · 14-day free trial
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAllPlans(true)}
                          className="text-xs text-primary font-medium underline shrink-0"
                          data-testid="button-change-plan"
                        >
                          Change plan
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <Button
                            variant={standalonePlan === 'starter' ? 'default' : 'outline'}
                            onClick={() => setStandalonePlan('starter')}
                            className="text-sm h-auto py-2"
                            data-testid="button-plan-starter"
                          >
                            <Zap className="w-4 h-4 mr-1.5 shrink-0" />
                            Starter · {PRICE_LABELS.starterMonthly}/mo
                          </Button>
                          <Button
                            variant={standalonePlan === 'core' ? 'default' : 'outline'}
                            onClick={() => setStandalonePlan('core')}
                            className="text-sm h-auto py-2"
                            data-testid="button-plan-core"
                          >
                            <Zap className="w-4 h-4 mr-1.5 shrink-0" />
                            Core · {PRICE_LABELS.coreMonthly}/mo
                          </Button>
                        </div>
                        <div className="mb-2">
                          <Button
                            variant={standalonePlan === 'elite' ? 'default' : 'outline'}
                            onClick={() => setStandalonePlan('elite')}
                            className="w-full text-sm h-auto py-2"
                            data-testid="button-plan-elite"
                          >
                            <Crown className="w-4 h-4 mr-1.5 shrink-0" />
                            Elite · {PRICE_LABELS.eliteMonthly}/mo
                          </Button>
                        </div>
                        <div className="text-center mb-4">
                          <button
                            type="button"
                            onClick={() => setShowAllPlans(false)}
                            className="text-xs text-muted-foreground underline"
                            data-testid="button-hide-plans"
                          >
                            Done
                          </button>
                        </div>
                      </>
                    )}
                    <p className="text-xs text-center text-muted-foreground mb-4">
                      <Gift className="w-3 h-3 inline mr-1" />14-day free trial - card required, cancel anytime
                    </p>

                    <Button onClick={handleStandaloneGoogleSignUp} variant="outline" size="lg" className="w-full text-base mb-3" data-testid="button-google-signup">
                      <SiGoogle className="w-5 h-5 mr-2" />
                      Sign up with Google
                    </Button>

                    <div className="relative my-4">
                      <Separator />
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">or</span>
                    </div>

                    <form onSubmit={handleStandaloneSignUp} className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="app-signup-first">First Name</Label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input id="app-signup-first" placeholder="John" value={signupFirstName} onChange={(e) => setSignupFirstName(e.target.value)} className="pl-10" data-testid="input-first-name" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="app-signup-last">Last Name</Label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input id="app-signup-last" placeholder="Doe" value={signupLastName} onChange={(e) => setSignupLastName(e.target.value)} className="pl-10" data-testid="input-last-name" />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="app-signup-email">Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input id="app-signup-email" type="email" placeholder="you@example.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} className="pl-10" required data-testid="input-email" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="app-signup-password">Password</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input id="app-signup-password" type="password" placeholder="At least 8 characters" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} className="pl-10" required minLength={8} data-testid="input-password" />
                        </div>
                      </div>
                      <Button type="submit" size="lg" className="w-full" disabled={isLoading} data-testid="button-submit-signup">
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                        Start Free Trial
                        {!isLoading && <ArrowRight className="w-5 h-5 ml-2" />}
                      </Button>
                    </form>

                    <p className="text-sm text-center mt-4 text-muted-foreground">
                      Already have an account?{" "}
                      <button type="button" onClick={() => setAuthMode('signin')} className="text-primary font-medium underline" data-testid="link-to-signin">
                        Sign in
                      </button>
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-center gap-4 mt-6 text-xs text-muted-foreground">
              <a href="/privacy" className="hover:text-foreground/70" data-testid="link-privacy">Privacy Policy</a>
              <a href="/terms" className="hover:text-foreground/70" data-testid="link-terms">Terms of Service</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // === NATIVE APP: OTP-only login (no signup, no pricing, no billing) ===
  const handleNativeRequestOtp = async () => {
    if (!nativeEmail.trim()) {
      setNativeError('Please enter your email address.');
      return;
    }
    setNativeLoading(true);
    setNativeError('');
    try {
      const res = await fetch('/api/auth/native/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: nativeEmail.trim() }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setNativeError(data.message || 'Too many requests. Please try again later.');
        setNativeStep('otp');
      } else if (!res.ok) {
        setNativeError(data.message || 'Something went wrong. Please try again.');
        setNativeStep('otp');
      } else {
        setNativeStep('otp');
        setNativeResendCooldown(60);
        setNativeRemainingAttempts(null);
      }
    } catch {
      setNativeError('Connection error. Please check your internet and try again.');
      setNativeStep('otp');
    } finally {
      setNativeLoading(false);
    }
  };

  const handleNativeVerifyOtp = async () => {
    if (!nativeOtp.trim()) {
      setNativeError('Please enter the verification code.');
      return;
    }
    setNativeLoading(true);
    setNativeError('');
    try {
      const res = await fetch('/api/auth/native/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: nativeEmail.trim(), code: nativeOtp.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (data.success) {
        const { storeTokens } = await import('@/lib/native-auth');
        await storeTokens(data.accessToken, data.refreshToken);
        queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        navigate('/');
      } else {
        if (data.message === 'No account found.') {
          setNativeStep('error');
        } else {
          setNativeError(data.message || 'Invalid code.');
          if (data.remainingAttempts !== undefined) {
            setNativeRemainingAttempts(data.remainingAttempts);
            if (data.remainingAttempts === 0) {
              setNativeStep('error');
              setNativeError('Too many attempts. Please try again.');
            }
          }
        }
      }
    } catch {
      setNativeError('Connection error. Please check your internet.');
    } finally {
      setNativeLoading(false);
    }
  };

  const handleNativeResend = async () => {
    if (nativeResendCooldown > 0) return;
    setNativeOtp('');
    setNativeError('');
    setNativeRemainingAttempts(null);
    await handleNativeRequestOtp();
  };

  if (exchangingToken || (authUser && !authLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#232d3b' }}>
        <div className="flex flex-col items-center">
          <img src="/icon-192.png" alt="Fuse Phone" style={{ width: 80, height: 80, borderRadius: 16, marginBottom: 16 }} />
          <div style={{ color: '#f1f5f9', fontFamily: "'Outfit',sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 0.5 }}>Fuse Phone</div>
          <Loader2 className="w-6 h-6 animate-spin text-slate-400 mt-4" />
          <p className="text-slate-400 text-sm mt-2">Signing you in...</p>
        </div>
      </div>
    );
  }

  const _isNative = forceNative || isNativeApp();
  console.log('[NATIVE-DEBUG] AuthPage: isNativeApp():', _isNative, 'forceNative:', forceNative, '__CAP_FLAG:', !!(window as any).__CAPACITOR_NATIVE, 'capacitor-class:', document.documentElement.classList.contains('capacitor-native'), 'Cap obj:', !!(window as any).Capacitor);

  if (_isNative) {
    console.log('[NATIVE-DEBUG] AuthPage: Rendering NATIVE OTP login, step:', nativeStep);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)' }} data-testid="native-auth-screen">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <FusePhoneLogoImage size="lg" />
            <h1 className="text-2xl font-bold text-white mt-4">Fuse Phone</h1>
            <p className="text-slate-400 text-sm mt-1">
              {nativeStep === 'email' ? 'Sign in to your account' : nativeStep === 'otp' ? 'Enter your verification code' : ''}
            </p>
          </div>

          {nativeStep === 'email' && (
            <div className="space-y-4" data-testid="native-email-step">
              <div className="space-y-2">
                <Label htmlFor="native-email" className="text-slate-300 text-sm">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="native-email"
                    type="email"
                    placeholder="you@example.com"
                    value={nativeEmail}
                    onChange={(e) => { setNativeEmail(e.target.value); setNativeError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleNativeRequestOtp()}
                    className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                    autoComplete="email"
                    autoFocus
                    data-testid="input-native-email"
                  />
                </div>
              </div>

              {nativeError && (
                <p className="text-red-400 text-sm text-center" data-testid="text-native-error">{nativeError}</p>
              )}

              <Button
                onClick={handleNativeRequestOtp}
                disabled={nativeLoading || !nativeEmail.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                size="lg"
                data-testid="button-native-continue"
              >
                {nativeLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Continue
              </Button>
            </div>
          )}

          {nativeStep === 'otp' && (
            <div className="space-y-4" data-testid="native-otp-step">
              <p className="text-slate-400 text-sm text-center">
                We sent a 6-digit code to<br />
                <span className="text-white font-medium">{nativeEmail}</span>
              </p>

              <div className="space-y-2">
                <Input
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={nativeOtp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
                    setNativeOtp(val);
                    setNativeError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && nativeOtp.length === 6 && handleNativeVerifyOtp()}
                  className="text-center text-2xl tracking-[0.3em] font-mono bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 placeholder:text-base placeholder:tracking-normal focus:border-blue-500"
                  maxLength={6}
                  autoFocus
                  autoComplete="one-time-code"
                  data-testid="input-native-otp"
                />
              </div>

              {nativeError && (
                <p className="text-red-400 text-sm text-center" data-testid="text-native-error">{nativeError}</p>
              )}

              {nativeRemainingAttempts !== null && nativeRemainingAttempts > 0 && (
                <p className="text-slate-500 text-xs text-center">{nativeRemainingAttempts} attempt{nativeRemainingAttempts !== 1 ? 's' : ''} remaining</p>
              )}

              <Button
                onClick={handleNativeVerifyOtp}
                disabled={nativeLoading || nativeOtp.length < 6}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                size="lg"
                data-testid="button-native-verify"
              >
                {nativeLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Verify
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={handleNativeResend}
                  disabled={nativeResendCooldown > 0}
                  className={`${nativeResendCooldown > 0 ? 'text-slate-600' : 'text-blue-400 hover:text-blue-300'} transition-colors`}
                  data-testid="button-native-resend"
                >
                  {nativeResendCooldown > 0 ? `Resend in ${nativeResendCooldown}s` : 'Resend code'}
                </button>
                <button
                  onClick={() => { setNativeStep('email'); setNativeOtp(''); setNativeError(''); setNativeRemainingAttempts(null); }}
                  className="text-slate-400 hover:text-slate-300 transition-colors"
                  data-testid="button-native-change-email"
                >
                  Different email
                </button>
              </div>
            </div>
          )}

          {nativeStep === 'error' && (
            <div className="text-center space-y-4" data-testid="native-error-step">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-300 text-base">No account found.</p>
              <p className="text-slate-500 text-sm">This app is for existing FusePhone customers.</p>
              <Button
                onClick={() => { setNativeStep('email'); setNativeEmail(''); setNativeOtp(''); setNativeError(''); setNativeRemainingAttempts(null); }}
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                data-testid="button-native-try-again"
              >
                Try another email
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-[1000] border-b bg-background/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FusePhoneLogoImage size="md" />
            <span className="font-display font-bold text-xl tracking-tight">Fuse Phone</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <Button variant="ghost" onClick={scrollToPricing} className="hidden sm:inline-flex" data-testid="button-header-pricing">
              Pricing
            </Button>
            <Button variant="ghost" asChild className="hidden sm:inline-flex" data-testid="button-header-affiliate">
              <a href="https://affiliate.fusephone.com">Affiliate Program</a>
            </Button>
            <Button onClick={() => isMarketingDomain() ? window.location.href = getAppUrl('/auth?action=signin') : setShowSignIn(true)} variant="outline" data-testid="button-header-signin">
              Sign In
            </Button>
            <Button onClick={scrollToPricing} data-testid="button-header-start-trial">
              Start Free Trial
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="relative py-16 sm:py-20 lg:py-28 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto text-center">
            <Badge variant="secondary" className="mb-6 text-sm px-4 py-1.5" data-testid="badge-hero">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Built by a Painter, for Painters
            </Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold mb-6 text-balance leading-tight" data-testid="text-hero-title">
              Stop Losing Leads.
              <span className="block text-primary">Start Closing More.</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto text-balance leading-relaxed">
              Every missed call is a lost deal. Fuse Phone answers when you can't, follows up automatically, and keeps every lead in your pipeline — so you can focus on the job, not the phone.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
              <Button size="lg" onClick={scrollToPricing} data-testid="button-hero-trial">
                Start Free Trial
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => isMarketingDomain() ? window.location.href = getAppUrl('/auth?action=signin') : setShowSignIn(true)} data-testid="button-hero-signin">
                Sign In
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              {[
                `Plans from ${PRICE_LABELS.starterMonthly}/mo`,
                "14-day free trial on every plan",
                "Card required, cancel anytime",
                "Free onboarding",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-sm text-muted-foreground">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-10 flex flex-col items-center gap-3">
              <p className="text-sm text-muted-foreground" data-testid="text-hero-app-cta">
                Sign up on the web. Run your jobs from your phone.
              </p>
              <AppDownloadBadges />
            </div>
          </div>
        </div>
      </section>

      {/* Integrations Section - Moved near top */}
      <section className="border-y bg-muted/30 py-12 sm:py-16 px-4 sm:px-6" data-testid="section-integrations">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4" data-testid="text-integrations-heading">
              Powered by the Tools You Trust
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              One platform. All your favorite tools connected. Import leads, make calls, send messages, sync calendars, and collect payments automatically.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 sm:gap-5">
            {[
              {
                name: "Twilio",
                description: "Calls, SMS & Voicemail",
                icon: <SiTwilio className="w-6 h-6" />,
                color: "text-[#F22F46]",
              },
              {
                name: "Gmail",
                description: "Email & Documents",
                icon: <Mail className="w-6 h-6" />,
                color: "text-[#EA4335]",
              },
              {
                name: "Stripe",
                description: "Customer Payments",
                icon: <SiStripe className="w-6 h-6" />,
                color: "text-[#635BFF]",
              },
              {
                name: "Google Calendar",
                description: "Scheduling",
                icon: <Calendar className="w-6 h-6" />,
                color: "text-[#4285F4]",
              },
              {
                name: "Zapier",
                description: "Automation",
                icon: <SiZapier className="w-6 h-6" />,
                color: "text-[#FF4A00]",
              },
              {
                name: "Thumbtack",
                description: "Lead Import",
                icon: <Zap className="w-6 h-6" />,
                color: "text-[#009FD9]",
              },
              {
                name: "Facebook Lead Ads",
                description: "Auto-Import Leads",
                icon: <SiFacebook className="w-6 h-6" />,
                color: "text-[#1877F2]",
              },
              {
                name: "OpenAI",
                description: "AI Assistant & Proposals",
                icon: <Sparkles className="w-6 h-6" />,
                color: "text-[#10A37F]",
              },
            ].map((integration, i) => (
              <Card key={i} className="hover-elevate text-center" data-testid={`card-integration-${i}`}>
                <CardContent className="pt-6 pb-4 px-3">
                  <div className={`w-12 h-12 rounded-md bg-muted flex items-center justify-center mx-auto mb-3 ${integration.color}`}>
                    {integration.icon}
                  </div>
                  <h3 className="font-semibold text-sm mb-0.5">{integration.name}</h3>
                  <p className="text-xs text-muted-foreground">{integration.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="text-center mt-8">
            <p className="text-sm text-muted-foreground">
              Plus Google Maps, Google Calendar Sync, CompanyCam, Web Push Notifications, and more
            </p>
          </div>
        </div>
      </section>

      {/* Phone System Highlight */}
      <section className="py-16 sm:py-20 px-4 sm:px-6" data-testid="section-phone-system">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="secondary" className="mb-4 text-xs">
                <PhoneCall className="w-3 h-3 mr-1" />
                Powered by Twilio
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4" data-testid="text-phone-heading">
                A Real Business Phone System, Built In
              </h2>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                Stop missing calls and losing leads. Get a dedicated business number with crystal-clear call quality, professional voicemail, and smart office hours routing - all powered by Twilio.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Crystal-clear inbound & outbound calls",
                  "Professional voicemail with transcription",
                  "Office hours with automatic answer machine",
                  "IVR menus & call routing",
                  "Call conferencing & transfer",
                  "SMS messaging directly from the app",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
              <Button onClick={scrollToPricing} data-testid="button-phone-trial">
                Start Free Trial
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <div className="bg-muted/50 rounded-md border p-6 sm:p-8">
              <div className="space-y-4">
                <div className="bg-background rounded-md border p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                      <PhoneCall className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Incoming Call</p>
                      <p className="text-xs text-muted-foreground">During business hours</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Call rings your phone. Caller hears your custom greeting.</p>
                </div>
                <div className="bg-background rounded-md border p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <Voicemail className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">After Hours</p>
                      <p className="text-xs text-muted-foreground">Answer machine takes over</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Professional answer machine. Voicemail transcribed and sent to you instantly.</p>
                </div>
                <div className="bg-background rounded-md border p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Automated Follow-Up</p>
                      <p className="text-xs text-muted-foreground">Never miss a lead</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Automatic text sent to missed callers so they know you'll call back.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-muted/30" data-testid="section-features">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4" data-testid="text-features-heading">
              Everything You Need to Run & Grow Your Business
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From first call to final payment. Proposals, invoices, time tracking, automated follow-ups, and more - all in one place.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {FEATURE_SHOWCASE.map((feature, i) => (
              <Card key={i} className="hover-elevate" data-testid={`card-feature-${i}`}>
                <CardContent className="pt-6">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-base mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Results Stats Banner */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 bg-primary/5 border-y border-primary/10" data-testid="section-results-stats">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="mb-4 text-xs">
              <TrendingUp className="w-3 h-3 mr-1" />
              Real Results, Not Marketing Fluff
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-display font-bold mb-3 text-balance" data-testid="text-results-heading">
              Close Up to <span className="text-primary">30% More Deals</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Faster proposals, automatic follow-ups, and reviews that ask themselves. Fuse Phone does the chasing — you do the painting.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {RESULTS_STATS.map((stat, i) => (
              <Card key={i} className="hover-elevate text-center" data-testid={`card-stat-${i}`}>
                <CardContent className="pt-7 pb-6">
                  <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <stat.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-3xl sm:text-4xl font-display font-bold text-primary mb-1" data-testid={`text-stat-value-${i}`}>{stat.value}</div>
                  <div className="font-semibold text-sm mb-2">{stat.label}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{stat.detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section — 4-step screenshot walkthrough */}
      <section className="py-16 sm:py-24 px-4 sm:px-6" data-testid="section-how-it-works">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4 text-balance" data-testid="text-how-heading">
              Receive the Lead. Build It.<br />Send It. Get Paid.
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              The whole job, from first text to final payment, lives on your phone. Here's exactly how it works.
            </p>
          </div>
          <div className="space-y-16 sm:space-y-24">
            {HOW_IT_WORKS.map((item, i) => {
              const reverse = i % 2 === 1;
              return (
                <div
                  key={i}
                  className={`grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}
                  data-testid={`step-${item.step}`}
                >
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-display font-bold shrink-0">
                        {item.step}
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        <item.icon className="w-3.5 h-3.5 mr-1.5" />
                        Step {item.step}
                      </Badge>
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-display font-bold mb-3" data-testid={`text-step-title-${item.step}`}>
                      {item.title}
                    </h3>
                    <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <div className="relative max-w-[280px] w-full">
                      <div className="absolute -inset-3 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent rounded-3xl blur-xl" />
                      <img
                        src={item.image}
                        alt={item.imageAlt}
                        className="relative rounded-2xl border-4 border-foreground/10 shadow-2xl w-full"
                        loading="lazy"
                        data-testid={`img-step-${item.step}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Painter Features — Built For Painters showcase with real screenshots */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-muted/30" data-testid="section-painter-features">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4 text-xs">
              <Sparkles className="w-3 h-3 mr-1" />
              Built for Painting Contractors
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4" data-testid="text-painter-features-heading">
              The Tools Other CRMs Don't Have
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Production rates, photo annotations, packages, crew payroll — built specifically for the way painters actually work.
            </p>
          </div>
          <div className="space-y-12">
            {PAINTER_FEATURES.map((feature, i) => {
              const reverse = i % 2 === 1;
              return (
                <Card key={i} className="overflow-hidden" data-testid={`card-painter-feature-${i}`}>
                  <CardContent className="p-0">
                    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-0 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
                      <div className="p-8 sm:p-10 flex flex-col justify-center">
                        <div className="w-11 h-11 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                          <feature.icon className="w-5 h-5 text-primary" />
                        </div>
                        <h3 className="text-2xl font-display font-bold mb-3">{feature.title}</h3>
                        <p className="text-muted-foreground mb-5 leading-relaxed">{feature.description}</p>
                        <ul className="space-y-2.5">
                          {feature.bullets.map((bullet, b) => (
                            <li key={b} className="flex items-start gap-2.5 text-sm">
                              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-gradient-to-br from-primary/10 via-muted/40 to-background p-8 sm:p-10 flex items-center justify-center">
                        <div className="relative max-w-[260px] w-full">
                          <div className="absolute -inset-2 bg-primary/10 rounded-2xl blur-lg" />
                          <img
                            src={feature.image}
                            alt={feature.imageAlt}
                            className="relative rounded-xl border-4 border-foreground/10 shadow-xl w-full"
                            loading="lazy"
                            data-testid={`img-painter-feature-${i}`}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Auto Reviews + Auto Follow-ups Highlight */}
      <section className="py-16 sm:py-20 px-4 sm:px-6" data-testid="section-automation">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="flex justify-center order-2 lg:order-1">
              <div className="relative max-w-[280px] w-full">
                <div className="absolute -inset-3 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent rounded-3xl blur-xl" />
                <img
                  src={messagesListScreenshot}
                  alt="Conversations inbox showing every customer thread in one place"
                  className="relative rounded-2xl border-4 border-foreground/10 shadow-2xl w-full"
                  loading="lazy"
                  data-testid="img-automation"
                />
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <Badge variant="secondary" className="mb-4 text-xs">
                <Zap className="w-3 h-3 mr-1" />
                Set It & Forget It
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4" data-testid="text-automation-heading">
                Follow-Ups & Reviews on Autopilot
              </h2>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                The deals you lose aren't because of price — they're because nobody followed up. Fuse Phone does it for you, every time, by text and email.
              </p>
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm mb-0.5">Automatic Follow-Ups</p>
                    <p className="text-sm text-muted-foreground">Sent a proposal? We'll nudge the customer at 2 days, 5 days, and a week — until they sign or tell us to stop.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Star className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm mb-0.5">Automatic Google Review Requests</p>
                    <p className="text-sm text-muted-foreground">When you mark a job complete, Fuse Phone texts the happy customer a one-tap link to leave you a 5-star Google review.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm mb-0.5">Appointment Reminders</p>
                    <p className="text-sm text-muted-foreground">Customers and crew get auto-texts before every appointment. No-shows drop. Schedules stay tight.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <PhoneCall className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm mb-0.5">Missed-Call Auto-Text</p>
                    <p className="text-sm text-muted-foreground">Miss a call? The caller instantly gets a text saying you'll get back to them. Lead saved.</p>
                  </div>
                </div>
              </div>
              <Button onClick={scrollToPricing} data-testid="button-automation-trial">
                Start Free Trial
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* AI Feature Highlight */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-muted/30" data-testid="section-ai">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="secondary" className="mb-4 text-xs">
                <Sparkles className="w-3 h-3 mr-1" />
                Powered by Fuse AI
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4" data-testid="text-ai-heading">
                Create Proposals in Seconds with AI
              </h2>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                Simply describe your project and Fuse AI generates detailed, professional line items with pricing suggestions. Then send to multiple recipients at once.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Describe your project in plain English",
                  "Get itemized line items with suggested pricing",
                  "Send to multiple recipients (both spouses, partners)",
                  "Automated follow-ups keep the deal moving",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
              <Button onClick={scrollToPricing} data-testid="button-ai-trial">
                Try It Free
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <div className="bg-muted/50 rounded-md border p-6 sm:p-8">
              <div className="space-y-4">
                <div className="bg-background rounded-md border p-4">
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">You describe:</p>
                  <p className="text-sm italic text-foreground/80">"Full bathroom remodel - demolition, new tile flooring, walk-in shower with glass door, dual vanity, and new lighting fixtures"</p>
                </div>
                <div className="flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <div className="bg-background rounded-md border p-4">
                  <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Fuse AI generates:</p>
                  <div className="space-y-2 text-sm">
                    {[
                      { item: "Demolition & Removal", price: "$1,500" },
                      { item: "Tile Flooring Installation", price: "$2,800" },
                      { item: "Walk-in Shower w/ Glass Door", price: "$4,200" },
                      { item: "Dual Vanity & Plumbing", price: "$3,100" },
                      { item: "Lighting Fixtures & Electrical", price: "$1,400" },
                    ].map((line, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b border-dashed last:border-0">
                        <span className="text-foreground/80">{line.item}</span>
                        <span className="font-medium text-foreground">{line.price}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2 pt-2 font-semibold">
                      <span>Total</span>
                      <span>$13,000</span>
                    </div>
                  </div>
                </div>
                <div className="bg-background rounded-md border p-3 flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-xs text-muted-foreground">Sent to: John Smith & Sarah Smith</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Competitor Comparison */}
      <section className="py-16 sm:py-20 px-4 sm:px-6" data-testid="section-comparison">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4" data-testid="text-comparison-heading">
              What You Get That Others Don't
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Other CRMs make you pay extra for a phone system — or don't have one at all. Fuse Phone has everything built in, so you're not juggling 5 different apps.
            </p>
          </div>
          <Card data-testid="card-comparison">
            <CardContent className="pt-6 pb-4 px-2 sm:px-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 sm:px-3 font-semibold">Feature</th>
                    <th className="text-center py-3 px-2 sm:px-3 font-semibold text-primary">Fuse Phone</th>
                    <th className="text-center py-3 px-2 sm:px-3 font-semibold text-muted-foreground">Others</th>
                  </tr>
                </thead>
                <tbody>
                  {PHONE_COMPARISON.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2.5 px-2 sm:px-3 text-foreground/80">{row.feature}</td>
                      <td className="py-2.5 px-2 sm:px-3 text-center">
                        <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" />
                      </td>
                      <td className="py-2.5 px-2 sm:px-3 text-center">
                        {row.others === "none" ? (
                          <XCircle className="w-5 h-5 text-destructive/60 mx-auto" />
                        ) : row.others === "limited" ? (
                          <Minus className="w-5 h-5 text-yellow-500 mx-auto" />
                        ) : (
                          <CheckCircle2 className="w-5 h-5 text-green-500/50 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-6 mt-4 pt-3 border-t text-xs text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  <span>Included</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Minus className="w-3.5 h-3.5 text-yellow-500" />
                  <span>Limited / Extra cost</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-destructive/60" />
                  <span>Not available</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Compared to Jobber, Housecall Pro, ServiceTitan, and GoHighLevel. Features may vary by plan.
          </p>
        </div>
      </section>

      {/* Pricing Section */}
      <section ref={pricingRef} className="py-16 sm:py-20 px-4 sm:px-6 bg-muted/30" data-testid="section-pricing">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4" data-testid="text-pricing-heading">
              Pick Your Plan. Get Back to Work.
            </h2>
            <p className="text-lg text-muted-foreground max-w-lg mx-auto">
              Free onboarding included with every plan. We set you up and walk you through everything.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {/* Starter Plan */}
            <Card data-testid="card-starter-plan">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  FusePhone Starter
                </CardTitle>
                <CardDescription>Get organized. Stop losing leads.</CardDescription>
                <div className="mt-2">
                  <span className="text-3xl font-bold" data-testid="text-starter-price">{PRICE_LABELS.starterMonthly}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">14-day free trial. Card required, cancel anytime.</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {STARTER_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="space-y-2">
                  <Button className="w-full" onClick={() => isMarketingDomain() ? window.location.href = getAppUrl('/auth?action=signup&plan=starter&intent=trial') : setSignupIntent({ plan: 'starter', action: 'trial' })} data-testid="button-start-trial-starter">
                    Start 14-Day Free Trial
                  </Button>
                  <Button className="w-full" variant="outline" onClick={() => isMarketingDomain() ? window.location.href = getAppUrl('/auth?action=signup&plan=starter&intent=subscribe') : setSignupIntent({ plan: 'starter', action: 'subscribe' })} data-testid="button-subscribe-starter">
                    Subscribe - {PRICE_LABELS.starterMonthly}/mo
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Core Plan */}
            <Card data-testid="card-core-plan">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  FusePhone Core
                </CardTitle>
                <CardDescription>Text, book, and close — from anywhere.</CardDescription>
                <div className="mt-2">
                  <span className="text-3xl font-bold" data-testid="text-core-price">{PRICE_LABELS.coreMonthly}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">14-day free trial. Card required, cancel anytime.</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {CORE_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="space-y-2">
                  <Button className="w-full" onClick={() => isMarketingDomain() ? window.location.href = getAppUrl('/auth?action=signup&plan=core&intent=trial') : setSignupIntent({ plan: 'core', action: 'trial' })} data-testid="button-start-trial-core">
                    Start 14-Day Free Trial
                  </Button>
                  <Button className="w-full" variant="outline" onClick={() => isMarketingDomain() ? window.location.href = getAppUrl('/auth?action=signup&plan=core&intent=subscribe') : setSignupIntent({ plan: 'core', action: 'subscribe' })} data-testid="button-subscribe-core">
                    Subscribe - {PRICE_LABELS.coreMonthly}/mo
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Elite Plan */}
            <Card className="border-primary" data-testid="card-elite-plan">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="w-5 h-5" />
                    FusePhone Elite
                  </CardTitle>
                  <span className="text-xs font-medium bg-primary text-primary-foreground px-2 py-0.5 rounded-md">Best Value</span>
                </div>
                <CardDescription>Run your business from your phone. Period.</CardDescription>
                <div className="mt-2">
                  <span className="text-3xl font-bold" data-testid="text-elite-price">{PRICE_LABELS.eliteMonthly}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">14-day free trial. Card required, cancel anytime.</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {ELITE_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="space-y-2">
                  <Button className="w-full" onClick={() => isMarketingDomain() ? window.location.href = getAppUrl('/auth?action=signup&plan=elite&intent=trial') : setSignupIntent({ plan: 'elite', action: 'trial' })} data-testid="button-start-trial-elite">
                    Start 14-Day Free Trial
                  </Button>
                  <Button className="w-full" variant="outline" onClick={() => isMarketingDomain() ? window.location.href = getAppUrl('/auth?action=signup&plan=elite&intent=subscribe') : setSignupIntent({ plan: 'elite', action: 'subscribe' })} data-testid="button-subscribe-elite">
                    Subscribe - {PRICE_LABELS.eliteMonthly}/mo
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Add-Ons Section */}
          <div className="text-center mb-6">
            <h3 className="text-xl font-display font-bold mb-2">Elite Add-Ons</h3>
            <p className="text-sm text-muted-foreground">Available exclusively for Elite plan subscribers</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl mx-auto">
            <Card className="border-primary/50" data-testid="card-addon-ai-assistant">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                      <h4 className="font-semibold text-sm">AI Virtual Assistant</h4>
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg font-bold">{PRICE_LABELS.aiAssistantMonthly}</span>
                        <span className="text-xs text-muted-foreground">/mo</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Answers calls like a real person, captures every lead, and sends you a summary. Includes {PRICE_LABELS.aiAssistantMinutes} minutes/mo, then {PRICE_LABELS.aiAssistantOverage}/min.</p>
                    <Badge variant="secondary" className="text-xs mt-2">
                      <Shield className="w-3 h-3 mr-1" />
                      Never miss a call again
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-addon-time-tracking">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                      <h4 className="font-semibold text-sm">Time Tracking</h4>
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg font-bold">$20</span>
                        <span className="text-xs text-muted-foreground">/mo</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Crew clock, real-time tracking, payroll-ready timesheets</p>
                    <Badge variant="secondary" className="text-xs mt-2">
                      <Gift className="w-3 h-3 mr-1" />
                      Free with Elite (limited time)
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-addon-packages">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Layers className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                      <h4 className="font-semibold text-sm">Proposal Packages</h4>
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg font-bold">$29</span>
                        <span className="text-xs text-muted-foreground">/mo</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Pricing tiers & package selection on proposals</p>
                    <Badge variant="secondary" className="text-xs mt-2">
                      <Gift className="w-3 h-3 mr-1" />
                      Free with Elite (limited time)
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground mt-6 text-center max-w-md mx-auto">
            All plans include a 14-day free trial. Card required, cancel anytime. Free onboarding included.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 sm:py-20 px-4 sm:px-6" data-testid="section-final-cta">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
            Stop Losing Deals. Start Today.
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Every day without Fuse Phone is another missed call, another lost lead, another deal that went to someone else. Get set up in minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" onClick={scrollToPricing} data-testid="button-final-trial">
              Start Free Trial
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-4">14-day free trial on every plan. Card required, cancel anytime. Free onboarding included.</p>
          <div className="mt-10 pt-8 border-t border-border/40">
            <p className="text-base sm:text-lg font-semibold mb-2" data-testid="text-cta-app-headline">
              Sign up here. Manage every lead from your phone.
            </p>
            <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
              Subscribe on the website, then download the Fuse Phone app on your iPhone to take calls, answer texts, scan receipts, and close deals on the go.
            </p>
            <AppDownloadBadges align="center" size="lg" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-10 px-4 sm:px-6" data-testid="section-footer">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between flex-wrap gap-6">
            <div className="flex flex-col gap-2 max-w-md">
              <div className="flex items-center gap-2">
                <FusePhoneLogoImage size="sm" />
                <span className="font-display font-bold text-lg tracking-tight">Fuse Phone</span>
              </div>
              <p className="text-sm text-muted-foreground" data-testid="text-footer-tagline">
                Fuse Phone CRM — the CRM for painters and home services contractors.
              </p>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
              <button onClick={scrollToPricing} className="text-foreground/70" data-testid="link-footer-pricing">Pricing</button>
              <a href="https://affiliate.fusephone.com" className="text-foreground/70" data-testid="link-footer-affiliate">Affiliate Program</a>
              <button onClick={() => isMarketingDomain() ? window.location.href = getAppUrl('/auth?action=signin') : setShowSignIn(true)} className="text-foreground/70" data-testid="link-footer-signin">Sign In</button>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground max-w-sm">
              Get the iPhone app to manage leads, calls, and crews on the go.
            </p>
            <AppDownloadBadges align="end" />
          </div>
          <div className="mt-6 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} Fuse Phone. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-xs">
              <a href="/privacy" className="text-muted-foreground hover:text-foreground/70" data-testid="link-footer-privacy">Privacy Policy</a>
              <a href="/terms" className="text-muted-foreground hover:text-foreground/70" data-testid="link-footer-terms">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals */}
      {showSignIn && renderSignInModal()}
      {signupIntent && renderSignUpModal()}
    </div>
  );
}
