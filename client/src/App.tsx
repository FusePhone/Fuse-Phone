import { Switch, Route, useLocation } from "wouter";
import { createPortal } from "react-dom";
import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { queryClient, getNativeHeaders } from "./lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createIDBPersister, switchPersisterUser, isCacheReadyForUser } from "./lib/query-persister";
import { connectRealtime, disconnectRealtime, registerVisibilityHandler, setRealtimeUserId } from "./lib/realtime";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NotificationContextProvider } from "@/hooks/use-notification-context";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Sidebar, MobileMenuProvider, MobileMenuContent, useMobileMenu, MobileHeaderOverrideProvider, MobileBottomNav, MobileNavVisibilityProvider } from "@/components/layout/Sidebar";
import { CameraOverlay } from "@/components/CameraOverlay";
import { CameraOverlayProvider } from "@/contexts/CameraOverlayContext";
import { UploadProgressProvider } from "@/contexts/UploadProgressContext";
import { UploadProgressNotification } from "@/components/UploadProgressNotification";
import { useAuth, useIsLoggingOut } from "@/hooks/use-auth";
import { TeamMemberLockedWall } from "@/components/TeamMemberLockedWall";
import { useSubscription } from "@/hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";
import { FusePhoneLogoImage } from "@/components/FusePhoneLogo";
import { AppBanners } from "@/components/AppBanners";
import { ActiveCallBar } from "@/components/ActiveCallBar";
import { AppointmentSessionBanner } from "@/components/AppointmentSessionBanner";
import { ArrivalDialog, ResultDialog } from "@/components/AppointmentSessionDialogs";
import { useAppointmentGPS } from "@/hooks/use-appointment-gps";
import { CustomerViewProvider, useCustomerView } from "@/contexts/CustomerViewContext";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
import { useNativePushRegistration } from "@/hooks/use-native-push";
import { NavigationGuardDialog } from "@/components/NavigationGuard";
import { PushPermissionBanner } from "@/components/PushPermissionBanner";
import { usePullToRefresh } from "@/hooks/use-native-gestures";

import { Loader2, RefreshCw } from "lucide-react";
import { isMarketingDomain, isAffiliateDomain } from "@/lib/domain";
import { Button } from "@/components/ui/button";

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const msg = error?.message || '';
    const errorCode = 'ERR-' + Math.abs(msg.split('').reduce((a: number, c: string) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0) % 10000).toString().padStart(4, '0');
    console.error(`[ErrorBoundary] ${errorCode} msg="${msg}" stack=${error?.stack} component=${errorInfo?.componentStack?.slice(0, 500)}`);

    try {
      fetch('/api/client-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorCode,
          message: msg,
          stack: error?.stack || '',
          componentStack: errorInfo?.componentStack || '',
          url: window.location.href,
        }),
        credentials: 'include',
      }).catch(() => {});
    } catch {}

    const isChunkError = msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk') ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed');

    if (isChunkError) {
      const reloadCount = parseInt(sessionStorage.getItem('chunk-error-count') || '0', 10);
      if (reloadCount < 2) {
        sessionStorage.setItem('chunk-error-count', String(reloadCount + 1));
        if ('caches' in window) {
          caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))).then(() => {
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
        return;
      }
    }
    sessionStorage.removeItem('chunk-error-count');
  }
  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || '';
      const isOffline = !navigator.onLine;
      const isNetworkError = /failed to fetch|networkerror|net::err_|econnrefused|timeout.*exceeded|chunk.*load|loading chunk/i.test(msg);
      const errorCode = 'ERR-' + Math.abs(msg.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0) % 10000).toString().padStart(4, '0');

      const title = isOffline || isNetworkError ? 'No Internet Connection' : 'Something went wrong';
      const description = isOffline || isNetworkError
        ? 'It looks like you lost your connection. Check your Wi-Fi or cellular data and try again.'
        : 'We hit an unexpected issue. Please try reloading.';

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 p-6 text-center">
          <FusePhoneLogoImage size="xl" />
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {description}
          </p>
          <Button
            onClick={() => {
              sessionStorage.removeItem('chunk-error-count');
              this.setState({ hasError: false, error: null });
              if ('caches' in window) {
                caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))).then(() => {
                  window.location.reload();
                });
              } else {
                window.location.reload();
              }
            }}
            data-testid="button-error-reload"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {isOffline || isNetworkError ? 'Try Again' : 'Reload'}
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

import Dashboard from "@/pages/Dashboard";
import AuthPage from "@/pages/AuthPage";
import RestoreAccount from "@/pages/RestoreAccount";
import NativeLoginPage from "@/pages/NativeLoginPage";
import NotFound from "@/pages/not-found";

const PublicCalculator = lazy(() => import("@/pages/PublicCalculator"));
const Metrics = lazy(() => import("@/pages/Metrics"));
const Attention = lazy(() => import("@/pages/Attention"));
const Leads = lazy(() => import("@/pages/Leads"));
const ContactsList = lazy(() => import("@/pages/ContactsList"));
const ContactDetail = lazy(() => import("@/pages/ContactDetail"));
const DocumentsList = lazy(() => import("@/pages/DocumentsList"));
const DocumentDetail = lazy(() => import("@/pages/DocumentDetail"));
const CompanyProfile = lazy(() => import("@/pages/CompanyProfile"));
const Integrations = lazy(() => import("@/pages/Integrations"));
const Templates = lazy(() => import("@/pages/Templates"));
const TemplateEdit = lazy(() => import("@/pages/TemplateEdit"));
const ProposalTemplates = lazy(() => import("@/pages/ProposalTemplates"));
const ProposalTemplateEdit = lazy(() => import("@/pages/ProposalTemplateEdit"));
const MessageTemplates = lazy(() => import("@/pages/MessageTemplates"));
const MessageTemplateEdit = lazy(() => import("@/pages/MessageTemplateEdit"));
const Messages = lazy(() => import("@/pages/Messages"));
const Calls = lazy(() => import("@/pages/Calls"));
const ActiveCallPage = lazy(() => import("@/pages/ActiveCall"));
const CustomerPortal = lazy(() => import("@/pages/CustomerPortal"));
const Unsubscribe = lazy(() => import("@/pages/Unsubscribe"));
const DocumentPortalResolver = lazy(() => import("@/pages/DocumentPortalResolver"));
const BookingForm = lazy(() => import("@/pages/BookingForm"));
const ColorReview = lazy(() => import("@/pages/ColorReview"));
const SharedPhotos = lazy(() => import("@/pages/SharedPhotos"));
const CalendarPage = lazy(() => import("@/pages/Calendar"));
const Jobs = lazy(() => import("@/pages/Jobs"));
const JobHistory = lazy(() => import("@/pages/JobHistory"));
const Projects = lazy(() => import("@/pages/Projects"));
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail"));
const ProposalColorsPage = lazy(() => import("@/pages/ProposalColorsPage"));
const ProposalWorkOrderPage = lazy(() => import("@/pages/ProposalWorkOrderPage"));
const TeamMembers = lazy(() => import("@/pages/TeamMembers"));
const TimeTracking = lazy(() => import("@/pages/TimeTracking"));
const CrewManagement = lazy(() => import("@/pages/CrewManagement"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const CrewClock = lazy(() => import("@/pages/CrewClock"));
const Revenue = lazy(() => import("@/pages/Revenue"));
const VerifyEmailPage = lazy(() => import("@/pages/VerifyEmailPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const AdminUsers = lazy(() => import("@/pages/AdminUsers"));
const AdminTestAccounts = lazy(() => import("@/pages/AdminTestAccounts"));
const MyCalendar = lazy(() => import("@/pages/MyCalendar"));
const MyClock = lazy(() => import("@/pages/MyClock"));
const GamePlan = lazy(() => import("@/pages/GamePlan"));
const DemoRecorder = lazy(() => import("@/pages/DemoRecorder"));
const DebugLeads = lazy(() => import("@/pages/DebugLeads"));
const DripJobsArchive = lazy(() => import("@/pages/DripJobsArchive"));
const DripJobsArchiveOwner = lazy(() => import("@/pages/DripJobsArchive").then(m => ({ default: m.DripJobsArchiveOwner })));
const MyJobs = lazy(() => import("@/pages/MyJobs"));
const WorkOrderDetailPage = lazy(() => import("@/pages/MyJobs").then(m => ({ default: m.WorkOrderDetail })));
const Billing = lazy(() => import("@/pages/Billing"));
const FuseAI = lazy(() => import("@/pages/FuseAI"));
const AiAssistant = lazy(() => import("@/pages/AiAssistant"));
const Financials = lazy(() => import("@/pages/Financials"));
const FinancialSettings = lazy(() => import("@/pages/FinancialSettings"));
const ProductionRates = lazy(() => import("@/pages/ProductionRates"));
const PackageSettings = lazy(() => import("@/pages/PackageSettings"));
const ServiceTemplates = lazy(() => import("@/pages/ServiceTemplates"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const AffiliateApply = lazy(() => import("@/pages/AffiliateApply"));
const AffiliateDashboard = lazy(() => import("@/pages/AffiliateDashboard"));
const AffiliateLanding = lazy(() => import("@/pages/AffiliateLanding"));
const AffiliateApplyPublic = lazy(() => import("@/pages/AffiliateApplyPublic"));
const AffiliatePartnerSoon = lazy(() => import("@/pages/AffiliatePartnerSoon"));
const AffiliateLogin = lazy(() => import("@/pages/AffiliateLogin"));
const AdminAffiliates = lazy(() => import("@/pages/admin/AdminAffiliates"));
const SupportPage = lazy(() => import("@/pages/SupportPage"));
const FeatureRequests = lazy(() => import("@/pages/FeatureRequests"));
const FeatureRequestShare = lazy(() => import("@/pages/FeatureRequestShare"));
const AppMarketingPage = lazy(() => import("@/pages/AppMarketingPage"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const HelpCenter = lazy(() => import("@/pages/HelpCenter"));
const FuseSupport = lazy(() => import("@/pages/FuseSupport"));
const WorkOrderViewer = lazy(() => import("@/pages/WorkOrderViewer"));
const AcceptInvitePage = lazy(() => import("@/pages/AcceptInvitePage"));
const PlanSelection = lazy(() => import("@/pages/PlanSelection"));

function MobileMenuOverlay() {
  const { isOpen, setIsOpen } = useMobileMenu();
  
  if (!isOpen) return null;

  return createPortal(
    <div className="lg:hidden fixed left-0 right-0 bottom-0 z-[60] flex" style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }} data-testid="mobile-menu-overlay">
      <div className="w-72 shrink-0 h-full overflow-y-auto bg-card border-r overscroll-contain">
        <MobileMenuContent />
      </div>
      <div 
        className="flex-1 bg-black/30" 
        onClick={() => setIsOpen(false)}
        data-testid="mobile-menu-backdrop"
      />
    </div>,
    document.body
  );
}

function prefetchCorePages() {
  if ((window as any).__prefetchDone) return;
  (window as any).__prefetchDone = true;
  const pages = [
    () => import("@/pages/Projects"),
    () => import("@/pages/ProjectDetail"),
    () => import("@/pages/ContactsList"),
    () => import("@/pages/ContactDetail"),
    () => import("@/pages/DocumentsList"),
    () => import("@/pages/DocumentDetail"),
    () => import("@/pages/Messages"),
    () => import("@/pages/Calendar"),
    () => import("@/pages/Leads"),
    () => import("@/pages/Financials"),
    () => import("@/pages/ProductionRates"),
    () => import("@/pages/CompanyProfile"),
  ];
  let i = 0;
  function next() {
    if (i < pages.length) {
      pages[i]().catch(() => {});
      i++;
      setTimeout(next, 200);
    }
  }
  setTimeout(next, 2000);
}

async function prefetchCoreData() {
  if ((window as any).__dataPrefetchDone) return;
  (window as any).__dataPrefetchDone = true;

  queryClient.prefetchQuery({ queryKey: ['/api/user/capabilities'] }).catch(() => {});
  queryClient.prefetchQuery({ queryKey: ['/api/notifications/unread'] }).catch(() => {});
  queryClient.prefetchQuery({ queryKey: ['/api/settings/company'] }).catch(() => {});
}

function PrivateLayoutInner({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const welcomeShown = useRef(false);
  const { isCustomerView } = useCustomerView();

  useDismissSplash();
  useNativePushRegistration();

  const [arrivalAppt, setArrivalAppt] = useState<any>(null);
  const [showArrivalDialog, setShowArrivalDialog] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [finishingSession, setFinishingSession] = useState<any>(null);
  const [isSubmittingResult, setIsSubmittingResult] = useState(false);

  const [arrivalDetectedAt, setArrivalDetectedAt] = useState<string | null>(null);

  const { dismissAppointment, requestPermission, locationPermission } = useAppointmentGPS({
    enabled: !isCustomerView,
    onArrival: (appt) => {
      setArrivalAppt(appt);
      setArrivalDetectedAt(new Date().toISOString());
      setShowArrivalDialog(true);
    },
  });

  const handleStartAppointment = useCallback(async () => {
    if (!arrivalAppt) return;
    try {
      const nativeHdrs = await getNativeHeaders();
      const resp = await fetch('/api/appointment-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...nativeHdrs },
        credentials: 'include',
        body: JSON.stringify({
          appointmentId: arrivalAppt.id,
          arrivalDetectedAt: arrivalDetectedAt || new Date().toISOString(),
        }),
      });
      if (resp.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/appointment-sessions/active'] });
        toast({ title: "Appointment started", description: "Timer is running." });
      } else {
        const err = await resp.json();
        toast({ title: "Error", description: err.message || "Could not start session", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: "Could not start session", variant: "destructive" });
    }
    setShowArrivalDialog(false);
    setArrivalAppt(null);
  }, [arrivalAppt, toast]);

  const handleDismissArrival = useCallback(() => {
    if (arrivalAppt) dismissAppointment(arrivalAppt.id);
    setShowArrivalDialog(false);
    setArrivalAppt(null);
  }, [arrivalAppt, dismissAppointment]);

  const handleFinishAppointment = useCallback((session: any) => {
    setFinishingSession(session);
    setShowResultDialog(true);
  }, []);

  const handleSelectResult = useCallback(async (result: string) => {
    if (!finishingSession) return;
    setIsSubmittingResult(true);
    try {
      const nativeHdrs = await getNativeHeaders();
      const resp = await fetch(`/api/appointment-sessions/${finishingSession.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...nativeHdrs },
        credentials: 'include',
        body: JSON.stringify({ status: 'completed', result }),
      });
      if (resp.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/appointment-sessions/active'] });
        queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
        toast({ title: "Appointment completed", description: "Result saved to project timeline." });
      }
    } catch (e) {
      toast({ title: "Error", description: "Could not save result", variant: "destructive" });
    }
    setIsSubmittingResult(false);
    setShowResultDialog(false);
    setFinishingSession(null);
  }, [finishingSession, toast]);

  useEffect(() => {
    prefetchCorePages();
    prefetchCoreData();
    connectRealtime();
    registerVisibilityHandler();
    return () => {
      disconnectRealtime();
    };
  }, []);

  const mainRef = useRef<HTMLElement>(null);
  const [location] = useLocation();

  // Track in-app (wouter) navigation count so `useSafeBack` knows whether
  // history.back() is safe (>1 means user has navigated at least once
  // inside the app) or whether to fall back to a deterministic parent
  // route (deep link / cold launch / refresh — initial render only).
  useEffect(() => {
    (window as any).__appNavCount = ((window as any).__appNavCount || 0) + 1;
  }, [location]);

  const pullRefreshKeys = (() => {
    const path = location.toLowerCase();
    if (path === '/' || path === '/dashboard') return [['/api/projects'], ['/api/metrics'], ['/api/appointments', 'upcoming'], ['/api/booking-requests'], ['/api/ai-actions?status=pending'], ['/api/notifications/unread'], ['/api/dashboard/pipeline']];
    if (path === '/messages' || path.startsWith('/messages')) return [['/api/communications'], ['/api/communications/recent-incoming'], ['/api/communications/conversation-contacts'], ['/api/communications/unknown-numbers'], ['/api/projects'], ['/api/notifications/unread']];
    if (path.startsWith('/projects/')) return [['/api/projects'], ['/api/documents'], ['/api/communications'], ['/api/appointments'], ['/api/notifications/unread']];
    if (path === '/projects' || path === '/leads') return [['/api/projects'], ['/api/notifications/unread']];
    if (path === '/contacts') return [['/api/contacts']];
    if (path.startsWith('/contacts/')) return [['/api/contacts'], ['/api/projects']];
    if (path === '/documents') return [['/api/documents'], ['/api/notifications/unread']];
    if (path.startsWith('/documents/')) return [['/api/documents'], ['/api/payments/recent'], ['/api/notifications/unread']];
    if (path === '/metrics' || path === '/revenue' || path === '/financials') return [['/api/metrics'], ['/api/projects'], ['/api/documents']];
    if (path === '/calendar' || path === '/my-calendar') return [['/api/appointments'], ['/api/projects'], ['/api/notifications/unread']];
    if (path.startsWith('/settings/team') || path.startsWith('/settings/crew')) return [['/api/team-members'], ['/api/team/channels'], ['/api/notifications/unread']];
    if (path === '/calls' || path.startsWith('/calls')) return [['/api/communications/calls'], ['/api/calls/active'], ['/api/notifications/unread']];
    if (path === '/my-jobs' || path.startsWith('/my-jobs/') || path === '/jobs' || path === '/job-history') return [['/api/my-jobs'], ['/api/projects'], ['/api/notifications/unread']];
    if (path === '/campaigns') return [['/api/campaigns'], ['/api/notifications/unread']];
    return [['/api/projects'], ['/api/notifications/unread']];
  })();

  usePullToRefresh(mainRef, pullRefreshKeys);

  const isNativePlatform = (() => {
    if ((window as any).__CAPACITOR_NATIVE) return true;
    const Cap = (window as any).Capacitor;
    return Cap?.isNativePlatform?.() || Cap?.isNative || false;
  })();

  useEffect(() => {
    if (welcomeShown.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('welcome_back') === 'true') {
      welcomeShown.current = true;
      toast({
        title: "Welcome back!",
        description: "You already have an account. We've signed you in.",
      });
      params.delete('welcome_back');
      const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main
        ref={mainRef}
        className="main-kb-aware flex-1 lg:ml-72 pt-mobile-header lg:pt-0 pb-20 lg:pb-0 h-screen overflow-y-auto overflow-x-hidden bg-background max-w-full"
        data-scroll-container
      >
        <ActiveCallBar />
        <AppointmentSessionBanner onFinish={handleFinishAppointment} hidden={isCustomerView} />
        <AppBanners />
        {children}
      </main>
      <MobileBottomNav />
      <MobileMenuOverlay />
      <NavigationGuardDialog />
      <ArrivalDialog
        open={showArrivalDialog}
        onOpenChange={setShowArrivalDialog}
        appointment={arrivalAppt}
        onStartAppointment={handleStartAppointment}
        onDismiss={handleDismissArrival}
      />
      <ResultDialog
        open={showResultDialog}
        onOpenChange={setShowResultDialog}
        onSelectResult={handleSelectResult}
        isSubmitting={isSubmittingResult}
      />
    </div>
  );
}

function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { needsSubscription, needsPlanSelection, isLoading: subLoading } = useSubscription();
  const [location, setLocation] = useLocation();

  if (subLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4 z-[9999]">
        <FusePhoneLogoImage size="xl" />
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if ((needsPlanSelection || needsSubscription) && location !== '/billing') {
    setLocation('/billing');
    return null;
  }

  return <>{children}</>;
}

function TeamLockoutGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery<{ status: string; companyName?: string; daysLapsed?: number }>({
    queryKey: ['/api/user/access-status'],
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  if (isLoading) return <>{children}</>;
  if (data?.status === 'team_locked_out') {
    return <TeamMemberLockedWall companyName={data.companyName || 'your company'} daysLapsed={data.daysLapsed || 0} />;
  }
  return <>{children}</>;
}


function useDismissSplash() {
  useEffect(() => {
    const fn = (window as any).__dismissSplash;
    if (fn) fn();
  }, []);
}

function exchangeMobileToken(token: string, setLocation: (path: string) => void) {
  fetch(`/api/auth/mobile-token?token=${token}`, { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        setLocation(data.redirectPath || '/');
      } else {
        setLocation('/auth?error=token_failed');
      }
    })
    .catch(() => {
      setLocation('/auth?error=token_failed');
    });
}

function MobileAuthCallback() {
  const [, setLocation] = useLocation();
  useDismissSplash();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) {
      setLocation('/auth?error=missing_token');
      return;
    }
    exchangeMobileToken(token, setLocation);
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-4">
        <FusePhoneLogoImage size="xl" />
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}

function AuthPageWithSplash({ forceNative }: { forceNative?: boolean }) {
  useDismissSplash();
  return <AuthPage forceNative={forceNative} />;
}

function LoadingWithSplashFallback() {
  useDismissSplash();
  const isNative = (() => {
    if ((window as any).__CAPACITOR_NATIVE) return true;
    if (document.documentElement.classList.contains('capacitor-native')) return true;
    const Cap = (window as any).Capacitor;
    return !!(Cap?.isNativePlatform?.() || Cap?.isNative);
  })();

  if (isNative) {
    return (
      <div style={{position:'fixed',top:0,right:0,bottom:0,left:0,background:'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',zIndex:9999,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'0 24px'}}>
        <div style={{width:160,height:160,backgroundColor:'white',borderRadius:32,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 20px 40px -10px rgba(0,0,0,0.4)'}}>
          <img src="/icon-192.png" alt="Fuse Phone" style={{width:120,height:120,objectFit:'contain'}} />
        </div>
        <div style={{color:'white',fontFamily:"'Outfit',sans-serif",fontSize:34,fontWeight:700,marginTop:24,letterSpacing:0.3}}>Fuse Phone</div>
        <div style={{color:'#cbd5e1',fontFamily:"'Outfit',sans-serif",fontSize:15,fontWeight:500,marginTop:6,textAlign:'center',maxWidth:320,lineHeight:1.4}}>The CRM for painters and home services contractors</div>
      </div>
    );
  }

  return (
    <div style={{position:'fixed',top:0,right:0,bottom:0,left:0,background:'#232d3b',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 24px'}}>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
        <img src="/icon-192.png" alt="Fuse Phone" style={{width:120,height:120,borderRadius:24,marginBottom:20}} />
        <div style={{color:'#f1f5f9',fontFamily:"'Outfit',sans-serif",fontSize:30,fontWeight:700,letterSpacing:0.5}}>Fuse Phone</div>
        <div style={{color:'#cbd5e1',fontFamily:"'Outfit',sans-serif",fontSize:14,fontWeight:500,marginTop:6,textAlign:'center',maxWidth:320,lineHeight:1.4}}>The CRM for painters and home services contractors</div>
      </div>
    </div>
  );
}

/**
 * Full-screen "Signing out…" overlay. Mounted once at the App root so it
 * survives the unmount-storm that logout() triggers (sidebar → AuthPage).
 * Blocks all pointer + key events underneath so the user can't tap menu
 * items while we're tearing down the session.
 */
function LogoutOverlay() {
  const visible = useIsLoggingOut();
  if (!visible) return null;
  return (
    <div
      role="alertdialog"
      aria-busy="true"
      aria-label="Signing out of Fuse Phone CRM"
      data-testid="overlay-signing-out"
      onTouchStart={(e) => e.preventDefault()}
      onClick={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0, left: 0,
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
        zIndex: 2147483647,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        // Block all pointer events on the underlying app while we tear down.
        pointerEvents: 'auto',
        // Respect device safe areas so we cover the notch/home indicator too.
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Mirror the boot splash exactly so logout feels like the same
          surface the user sees when the app loads:
            - Centered: white 144px icon tile + spinner ring + "Fuse Phone"
              wordmark + small "Signing out…" caption
            - Pinned to bottom: "Fuse Phone CRM" signature + tagline,
              matching the same copy used in the boot splash, login page,
              proposal/booking footers
       */}
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',width:'100%'}}>
        <div style={{position:'relative',width:144,height:144,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <Loader2
            className="animate-spin"
            style={{ position:'absolute', inset:-12, width:'calc(100% + 24px)', height:'calc(100% + 24px)', color:'#94a3b8', strokeWidth:1.25 }}
            aria-hidden="true"
          />
          <div
            className="bg-white rounded-2xl flex items-center justify-center shadow-lg"
            style={{ width:144, height:144 }}
          >
            <FusePhoneLogoImage size="xl" className="!w-28 !h-28" />
          </div>
        </div>
        <div style={{color:'#ffffff',fontFamily:"'Outfit',sans-serif",fontSize:32,fontWeight:700,letterSpacing:0.3,marginTop:20,textAlign:'center'}}>
          Fuse Phone
        </div>
        <div style={{color:'#cbd5e1',fontFamily:"'Outfit',sans-serif",fontSize:14,fontWeight:500,marginTop:8,textAlign:'center',maxWidth:340,lineHeight:1.4}}>
          Signing out…
        </div>
      </div>
      <div style={{width:'100%',display:'flex',flexDirection:'column',alignItems:'center',paddingBottom:48}}>
        <div style={{color:'#cbd5e1',fontFamily:"'Outfit',sans-serif",fontSize:28,fontWeight:700,letterSpacing:0.3,textAlign:'center'}}>
          Fuse Phone CRM
        </div>
        <div style={{color:'#94a3b8',fontFamily:"'Outfit',sans-serif",fontSize:14,fontWeight:500,marginTop:6,textAlign:'center',maxWidth:340,lineHeight:1.4}}>
          The CRM for painters and home services contractors
        </div>
      </div>
    </div>
  );
}

// ============================================================
// LOCKED — Task #37 (Lock down inbound messaging once and for all)
// This is the SINGLE navigator for native push taps. It picks up
// the URL from `window.__pendingPushUrl` (set by AppDelegate.swift
// and main.tsx) and routes to the right messages thread. We poll
// the global because the native side may set it before this hook's
// listener is registered (cold start, slow JS bundle). After
// navigation we always dispatch `notification-navigate` so the
// already-mounted Messages page picks up the right thread even when
// the path didn't change. Do NOT modify without explicit user
// approval. See `.local/tasks/messages-realtime-final.md`.
// ============================================================
function usePendingPushNavigation() {
  const [location, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const locationRef = useRef(location);
  // Tracks the freshest authenticated user id and auth-loading state
  // for the navigate() closure below. We hold them in refs so the
  // long-lived polling interval doesn't need to be torn down and
  // rebuilt every time the user/auth state changes.
  const userIdRef = useRef<string | null>(null);
  const authLoadingRef = useRef<boolean>(true);
  // Tracks the first time we started deferring navigation for the current
  // pending URL. If the cache-ready flag never flips (e.g.,
  // switchPersisterUser threw before completing), we want to fail open
  // and navigate anyway after a bounded wait — better to render an
  // empty-then-fetched thread than to silently strand the user on
  // whatever screen they were on when the push arrived.
  const deferStartRef = useRef<{ url: string; at: number } | null>(null);
  const FAIL_OPEN_MS = 4000;
  // Recently-handled cache: url -> timestamp of last navigation. Used to
  // suppress the natural double-fire (polling tick + native-push-tapped
  // event landing within ~10ms of each other, plus any retry-after-
  // failure injection from the native side) while still allowing the
  // user to tap the same notification target again seconds later.
  // 2s window is well below any plausible repeat-tap interval.
  const recentNavRef = useRef<{ url: string; at: number } | null>(null);
  const NAV_DEDUPE_MS = 2000;
  const handlingRef = useRef(false);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    userIdRef.current = (user as any)?.id ?? null;
  }, [user]);

  useEffect(() => {
    authLoadingRef.current = authLoading;
  }, [authLoading]);

  useEffect(() => {
    const navigate = (url: string) => {
      // Cache-ready gate: on cold launch from a push tap, iOS often
      // fires the tap action BEFORE auth resolves. We must wait for
      // BOTH (1) auth to finish loading and (2) the user's per-user
      // IndexedDB cache to be restored via switchPersisterUser before
      // navigating — otherwise Messages mounts with an empty cache and
      // renders an empty thread + blank header while a fresh fetch is
      // in flight (the exact bug Michael's notification surfaced).
      // Polling re-evaluates every 250ms, so this typically defers by
      // <1s once auth + cache settle.
      //
      // After auth fully resolves to "no user" (logged out), we still
      // navigate — the URL is preserved through the login flow and
      // Messages mounts after login as usual.
      //
      // Fail-open guard: if either auth or cache restoration never
      // completes (network hang, IDB unavailable, switchPersisterUser
      // throws, etc.) we navigate anyway after FAIL_OPEN_MS so the
      // user isn't stranded on whatever screen they happened to be on.
      const authStillLoading = authLoadingRef.current;
      const uid = userIdRef.current;
      const needsToWait =
        authStillLoading || (uid && !isCacheReadyForUser(uid));
      if (needsToWait) {
        const now = Date.now();
        const deferred = deferStartRef.current;
        if (!deferred || deferred.url !== url) {
          deferStartRef.current = { url, at: now };
          return;
        }
        if (now - deferred.at < FAIL_OPEN_MS) {
          return;
        }
        console.warn('[Push Native] Push gate fail-open after', now - deferred.at, 'ms — navigating anyway (authLoading:', authStillLoading, 'uid:', uid, 'cacheReady:', uid ? isCacheReadyForUser(uid) : 'n/a', ')');
      }
      // Clear any defer state once we're past the gate (success or fail-open).
      deferStartRef.current = null;

      // Only suppress if we just handled the SAME url within the dedupe
      // window (covers polling+event double-fire and native injection
      // retries). Repeat taps after that window are honored.
      const now = Date.now();
      const recent = recentNavRef.current;
      if (recent && recent.url === url && now - recent.at < NAV_DEDUPE_MS) return;
      recentNavRef.current = { url, at: now };
      console.log('[Push Native] Navigating to pending URL:', url, 'current:', locationRef.current);
      delete (window as any).__pendingPushUrl;

      const targetPath = url.split('?')[0];
      const currentPath = locationRef.current.split('?')[0];

      if (currentPath === targetPath) {
        const tempPath = '/__push-bounce';
        setLocation(tempPath);
        requestAnimationFrame(() => {
          setLocation(url);
          window.dispatchEvent(new CustomEvent('notification-navigate', { detail: { url } }));
        });
      } else {
        setLocation(url);
        // Always fire notification-navigate after route change so the
        // Messages page swaps to the right thread even if it was
        // already mounted (e.g., navigating between two contact threads).
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('notification-navigate', { detail: { url } }));
        });
      }
    };

    // 1. Pick up any URL already sitting in the global (cold start path).
    const pendingUrl = (window as any).__pendingPushUrl;
    if (pendingUrl) navigate(pendingUrl);

    // 2. Poll the global every 250ms forever. This is cheap (just a
    //    property read) and guarantees we never miss a URL even when
    //    the native side writes it before our listener attaches. The
    //    navigate() helper handles its own time-windowed dedupe so
    //    polling + native event firing for the same tap is safe.
    const pollInterval = setInterval(() => {
      const url = (window as any).__pendingPushUrl;
      if (url) navigate(url);
    }, 250);

    // 3. Also listen for the event so we react immediately when it fires.
    const handleLateArrival = (e: Event) => {
      if (handlingRef.current) return;
      handlingRef.current = true;
      const url = (e as CustomEvent).detail?.url;
      if (url) navigate(url);
      setTimeout(() => { handlingRef.current = false; }, 300);
    };

    window.addEventListener('native-push-tapped', handleLateArrival);
    return () => {
      window.removeEventListener('native-push-tapped', handleLateArrival);
      clearInterval(pollInterval);
    };
  }, [setLocation]);
}

function PrivateLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { needsSubscription, needsPlanSelection, isNativeApp, isLoading: subLoading } = useSubscription();
  const [location, setLocation] = useLocation();
  const splashDismissedRef = useRef(false);
  const iapInitedForRef = useRef<string | null>(null);

  usePendingPushNavigation();

  useEffect(() => {
    if (isAuthenticated && !splashDismissedRef.current) {
      splashDismissedRef.current = true;
      const fn = (window as any).__dismissSplash;
      if (fn) fn();
    }
  }, [isAuthenticated]);

  // Initialize StoreKit IAP with our user ID so iOS purchases are linked to
  // the correct account (the user.id is forwarded as Apple's
  // applicationUsername / appAccountToken when an order is placed). Safe
  // no-op on web. On user account switch within the same app session, call
  // loginIAP so the identity follows the authenticated user.
  useEffect(() => {
    const uid = (user as any)?.id;
    if (!uid) return;
    if (iapInitedForRef.current === uid) return;
    const previousUid = iapInitedForRef.current;
    iapInitedForRef.current = uid;
    const uemail = (user as any)?.email || null;
    (async () => {
      try {
        const iap = await import("@/lib/iap");
        if (!previousUid) {
          await iap.initIAP(uid, uemail);
        } else {
          await iap.loginIAP(uid, uemail);
        }
      } catch (err) {
        console.warn("[IAP] init/login skipped:", err);
      }
    })();
  }, [user]);

  const isNative = isNativeApp || !!(window as any).__CAPACITOR_NATIVE;

  if (isLoading) {
    return <LoadingWithSplashFallback />;
  }

  if (!isAuthenticated) {
    if (isNative) {
      return <NativeLoginPage />;
    }
    return <AuthPageWithSplash />;
  }

  if (subLoading) {
    return <LoadingWithSplashFallback />;
  }

  if ((needsPlanSelection || needsSubscription) && location !== '/billing') {
    setLocation('/billing');
    return null;
  }

  return (
    <CustomerViewProvider>
      <MobileNavVisibilityProvider>
        <MobileMenuProvider>
          <TeamLockoutGuard>
            <PrivateLayoutInner>{children}</PrivateLayoutInner>
          </TeamLockoutGuard>
        </MobileMenuProvider>
      </MobileNavVisibilityProvider>
    </CustomerViewProvider>
  );
}

function MarketingRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
    <Switch>
      <Route path="/">
        <AuthPage />
      </Route>

      <Route path="/auth">
        <AuthPage />
      </Route>

      <Route path="/restore-account">
        <RestoreAccount />
      </Route>

      {/* Public calculator - marketing lead capture */}
      <Route path="/calculator">
        <PublicCalculator />
      </Route>

      {/* Unsubscribe from marketing emails */}
      <Route path="/unsubscribe/:token">
        {() => <Unsubscribe />}
      </Route>

      {/* Public work order viewer - crew accesses via link */}
      <Route path="/work-order/:token">
        {(params) => <WorkOrderViewer params={params} />}
      </Route>

      {/* Public customer portal - works on marketing domain too */}
      <Route path="/portal/document/:token">
        {(params) => <CustomerPortal params={params} />}
      </Route>

      {/* Custom domain document URLs (no slug needed) */}
      <Route path="/proposal/:docId">
        {(params) => <DocumentPortalResolver params={{ docType: 'proposal', docId: params.docId }} />}
      </Route>
      <Route path="/estimate/:docId">
        {(params) => <DocumentPortalResolver params={{ docType: 'estimate', docId: params.docId }} />}
      </Route>
      <Route path="/invoice/:docId">
        {(params) => <DocumentPortalResolver params={{ docType: 'invoice', docId: params.docId }} />}
      </Route>
      <Route path="/change-order/:docId">
        {(params) => <DocumentPortalResolver params={{ docType: 'change_order', docId: params.docId }} />}
      </Route>
      <Route path="/booking">
        {() => <BookingForm />}
      </Route>

      <Route path="/color-review/:token">
        {(params) => <ColorReview token={params.token} />}
      </Route>

      <Route path="/shared-photos/:token">
        {(params) => <SharedPhotos token={params.token} />}
      </Route>

      {/* Public document URLs */}
      <Route path="/:slug/proposal/:docId">
        {(params) => <DocumentPortalResolver params={{ slug: params.slug, docType: 'proposal', docId: params.docId }} />}
      </Route>
      <Route path="/:slug/estimate/:docId">
        {(params) => <DocumentPortalResolver params={{ slug: params.slug, docType: 'estimate', docId: params.docId }} />}
      </Route>
      <Route path="/:slug/invoice/:docId">
        {(params) => <DocumentPortalResolver params={{ slug: params.slug, docType: 'invoice', docId: params.docId }} />}
      </Route>
      <Route path="/:slug/change-order/:docId">
        {(params) => <DocumentPortalResolver params={{ slug: params.slug, docType: 'change_order', docId: params.docId }} />}
      </Route>

      {/* Public booking form */}
      <Route path="/:slug/booking">
        {(params) => <BookingForm slug={params.slug} />}
      </Route>
      <Route path="/book/:slug">
        {(params) => <BookingForm slug={params.slug} />}
      </Route>

      {/* Public crew clock - slug-based */}
      <Route path="/:slug/crew-clock">
        {(params) => <CrewClock />}
      </Route>

      {/* Legacy crew clock with token */}
      <Route path="/crew-clock/:token">
        {(params) => <CrewClock />}
      </Route>

      {/* Mobile OAuth callback */}
      <Route path="/auth/mobile-callback">
        <MobileAuthCallback />
      </Route>

      {/* Invitation acceptance page - public */}
      <Route path="/invite/:token">
        <AcceptInvitePage />
      </Route>

      {/* Email verification and password reset - public */}
      <Route path="/verify-email">
        <VerifyEmailPage />
      </Route>
      <Route path="/forgot-password">
        <ForgotPasswordPage />
      </Route>
      <Route path="/reset-password">
        <ResetPasswordPage />
      </Route>

      {/* Privacy Policy, Terms of Service, Support, and App Marketing */}
      <Route path="/privacy">
        <PrivacyPolicy />
      </Route>
      <Route path="/terms">
        <TermsOfService />
      </Route>
      <Route path="/support">
        <SupportPage />
      </Route>
      <Route path="/app-info">
        <AppMarketingPage />
      </Route>

      {/* Bare-token URL on a custom portal domain (e.g. portal.example.com/<uuid>) */}
      <Route path="/:token">
        {(params) => {
          const t = params.token || '';
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
          const isShortToken = /^[A-Za-z0-9_-]{16,40}$/.test(t);
          if (isUuid || isShortToken) {
            return <CustomerPortal params={{ token: t }} />;
          }
          return <AuthPage />;
        }}
      </Route>

      {/* Any other path on marketing domain shows the landing page */}
      <Route>
        <AuthPage />
      </Route>
    </Switch>
    </Suspense>
  );
}

function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
    <Switch>
      <Route path="/api/login" component={() => null} />
      <Route path="/api/logout" component={() => null} />
      <Route path="/auth/mobile-callback">
        <MobileAuthCallback />
      </Route>
      
      <Route path="/">
        <PrivateLayout>
          <Dashboard />
        </PrivateLayout>
      </Route>
      
      <Route path="/metrics">
        <PrivateLayout>
          <Metrics />
        </PrivateLayout>
      </Route>

      <Route path="/attention">
        <PrivateLayout>
          <Attention />
        </PrivateLayout>
      </Route>

      <Route path="/leads">
        <PrivateLayout>
          <Leads />
        </PrivateLayout>
      </Route>

      <Route path="/contacts">
        <PrivateLayout>
          <ContactsList />
        </PrivateLayout>
      </Route>

      <Route path="/contacts/:id">
        {(params) => (
          <PrivateLayout>
            <ContactDetail params={params} />
          </PrivateLayout>
        )}
      </Route>

      <Route path="/documents">
        <PrivateLayout>
          <DocumentsList />
        </PrivateLayout>
      </Route>

      <Route path="/documents/:id">
        {(params) => (
          <PrivateLayout>
            <DocumentDetail params={params} />
          </PrivateLayout>
        )}
      </Route>

      <Route path="/settings/company">
        <PrivateLayout>
          <CompanyProfile />
        </PrivateLayout>
      </Route>

      <Route path="/financials">
        <PrivateLayout>
          <Financials />
        </PrivateLayout>
      </Route>

      <Route path="/settings/financial">
        <PrivateLayout>
          <FinancialSettings />
        </PrivateLayout>
      </Route>

      <Route path="/settings/production-rates">
        <PrivateLayout>
          <ProductionRates />
        </PrivateLayout>
      </Route>

      <Route path="/settings/packages">
        <PrivateLayout>
          <PackageSettings />
        </PrivateLayout>
      </Route>

      <Route path="/settings/service-templates">
        <PrivateLayout>
          <ServiceTemplates />
        </PrivateLayout>
      </Route>

      <Route path="/settings/team">
        <PrivateLayout>
          <TeamMembers />
        </PrivateLayout>
      </Route>

      <Route path="/settings/time-tracking">
        <PrivateLayout>
          <TimeTracking />
        </PrivateLayout>
      </Route>

      <Route path="/settings/crew">
        <PrivateLayout>
          <CrewManagement />
        </PrivateLayout>
      </Route>

      <Route path="/settings/users">
        <PrivateLayout>
          <UserManagement />
        </PrivateLayout>
      </Route>

      <Route path="/settings/integrations">
        <PrivateLayout>
          <Integrations />
        </PrivateLayout>
      </Route>

      <Route path="/settings/templates">
        <PrivateLayout>
          <Templates />
        </PrivateLayout>
      </Route>

      <Route path="/settings/templates/:slug/edit">
        <PrivateLayout>
          <TemplateEdit />
        </PrivateLayout>
      </Route>

      <Route path="/settings/message-templates">
        <PrivateLayout>
          <MessageTemplates />
        </PrivateLayout>
      </Route>

      <Route path="/settings/message-templates/:slug/edit">
        <PrivateLayout>
          <MessageTemplateEdit />
        </PrivateLayout>
      </Route>

      <Route path="/settings/proposal-templates">
        <PrivateLayout>
          <ProposalTemplates />
        </PrivateLayout>
      </Route>

      <Route path="/settings/proposal-templates/new">
        <PrivateLayout>
          <ProposalTemplateEdit />
        </PrivateLayout>
      </Route>

      <Route path="/settings/proposal-templates/:id/edit">
        <PrivateLayout>
          <ProposalTemplateEdit />
        </PrivateLayout>
      </Route>

      <Route path="/campaigns">
        <PrivateLayout>
          <Campaigns />
        </PrivateLayout>
      </Route>

      <Route path="/academy">
        <PrivateLayout>
          <HelpCenter />
        </PrivateLayout>
      </Route>

      <Route path="/help">
        <PrivateLayout>
          <HelpCenter />
        </PrivateLayout>
      </Route>

      <Route path="/support">
        <PrivateLayout>
          <FuseSupport />
        </PrivateLayout>
      </Route>

      <Route path="/feature-requests">
        <PrivateLayout>
          <FeatureRequests />
        </PrivateLayout>
      </Route>

      <Route path="/feature-requests/share/:token">
        {(params) => <FeatureRequestShare />}
      </Route>

      <Route path="/messages">
        <PrivateLayout>
          <Messages />
        </PrivateLayout>
      </Route>

      <Route path="/calls">
        <PrivateLayout>
          <Calls />
        </PrivateLayout>
      </Route>

      <Route path="/calls/active">
        <PrivateLayout>
          <ActiveCallPage />
        </PrivateLayout>
      </Route>

      <Route path="/calendar">
        <PrivateLayout>
          <CalendarPage />
        </PrivateLayout>
      </Route>

      <Route path="/my-calendar">
        <PrivateLayout>
          <MyCalendar />
        </PrivateLayout>
      </Route>

      <Route path="/projects">
        <PrivateLayout>
          <Projects />
        </PrivateLayout>
      </Route>

      <Route path="/projects/:projectId/proposals/:docId/colors">
        {(params) => (
          <PrivateLayout>
            <Suspense fallback={<PageLoader />}>
              <ProposalColorsPage
                projectId={parseInt(params.projectId)}
                docId={parseInt(params.docId)}
              />
            </Suspense>
          </PrivateLayout>
        )}
      </Route>

      <Route path="/projects/:projectId/proposals/:docId/work-order">
        {(params) => (
          <PrivateLayout>
            <Suspense fallback={<PageLoader />}>
              <ProposalWorkOrderPage
                projectId={parseInt(params.projectId)}
                docId={parseInt(params.docId)}
              />
            </Suspense>
          </PrivateLayout>
        )}
      </Route>

      <Route path="/projects/:id">
        {(params) => (
          <PrivateLayout>
            <ProjectDetail id={parseInt(params.id)} />
          </PrivateLayout>
        )}
      </Route>

      <Route path="/crew-clock">
        <PrivateLayout>
          <MyClock />
        </PrivateLayout>
      </Route>

      <Route path="/my-jobs/:id">
        {(params) => (
          <PrivateLayout>
            <Suspense fallback={<PageLoader />}>
              <WorkOrderDetailPage id={parseInt(params.id)} />
            </Suspense>
          </PrivateLayout>
        )}
      </Route>

      <Route path="/my-jobs">
        <PrivateLayout>
          <MyJobs />
        </PrivateLayout>
      </Route>

      <Route path="/jobs">
        <PrivateLayout>
          <Jobs />
        </PrivateLayout>
      </Route>

      <Route path="/job-history">
        <PrivateLayout>
          <JobHistory />
        </PrivateLayout>
      </Route>

      <Route path="/revenue">
        <PrivateLayout>
          <Revenue />
        </PrivateLayout>
      </Route>

      {/* Public calculator - accessible without login */}
      <Route path="/calculator">
        <PublicCalculator />
      </Route>

      {/* Public work order viewer - no auth, crew accesses via link */}
      <Route path="/work-order/:token">
        {(params) => <WorkOrderViewer params={params} />}
      </Route>

      {/* Public customer portal - no auth required, uses secure token */}
      <Route path="/portal/document/:token">
        {(params) => <CustomerPortal params={params} />}
      </Route>

      {/* Custom domain document URLs (no slug needed) */}
      <Route path="/proposal/:docId">
        {(params) => <DocumentPortalResolver params={{ docType: 'proposal', docId: params.docId }} />}
      </Route>
      <Route path="/estimate/:docId">
        {(params) => <DocumentPortalResolver params={{ docType: 'estimate', docId: params.docId }} />}
      </Route>
      <Route path="/invoice/:docId">
        {(params) => <DocumentPortalResolver params={{ docType: 'invoice', docId: params.docId }} />}
      </Route>
      <Route path="/change-order/:docId">
        {(params) => <DocumentPortalResolver params={{ docType: 'change_order', docId: params.docId }} />}
      </Route>
      <Route path="/booking">
        {() => <BookingForm />}
      </Route>
      <Route path="/color-review/:token">
        {(params) => <ColorReview token={params.token} />}
      </Route>
      <Route path="/shared-photos/:token">
        {(params) => <SharedPhotos token={params.token} />}
      </Route>

      {/* Public document URLs - /companyslug/proposal/123, /companyslug/invoice/123, etc. */}
      <Route path="/:slug/proposal/:docId">
        {(params) => <DocumentPortalResolver params={{ slug: params.slug, docType: 'proposal', docId: params.docId }} />}
      </Route>
      <Route path="/:slug/estimate/:docId">
        {(params) => <DocumentPortalResolver params={{ slug: params.slug, docType: 'estimate', docId: params.docId }} />}
      </Route>
      <Route path="/:slug/invoice/:docId">
        {(params) => <DocumentPortalResolver params={{ slug: params.slug, docType: 'invoice', docId: params.docId }} />}
      </Route>
      <Route path="/:slug/change-order/:docId">
        {(params) => <DocumentPortalResolver params={{ slug: params.slug, docType: 'change_order', docId: params.docId }} />}
      </Route>

      {/* Public booking form - /companyslug/booking */}
      <Route path="/:slug/booking">
        {(params) => <BookingForm slug={params.slug} />}
      </Route>

      {/* Legacy booking form URL - backward compatibility */}
      <Route path="/book/:slug">
        {(params) => <BookingForm slug={params.slug} />}
      </Route>

      {/* Public crew clock - slug-based */}
      <Route path="/:slug/crew-clock">
        {(params) => <CrewClock />}
      </Route>

      {/* Legacy crew clock with token */}
      <Route path="/crew-clock/:token">
        {(params) => <CrewClock />}
      </Route>

      {/* Invitation acceptance page - public */}
      <Route path="/invite/:token">
        <AcceptInvitePage />
      </Route>

      {/* Email verification page - public */}
      <Route path="/verify-email">
        <VerifyEmailPage />
      </Route>

      {/* Password reset pages - public */}
      <Route path="/forgot-password">
        <ForgotPasswordPage />
      </Route>
      <Route path="/reset-password">
        <ResetPasswordPage />
      </Route>

      {/* Auth page - public */}
      <Route path="/auth">
        <AuthPage />
      </Route>

      <Route path="/restore-account">
        <RestoreAccount />
      </Route>

      {/* Privacy Policy, Terms of Service, and Support */}
      <Route path="/privacy">
        <PrivacyPolicy />
      </Route>
      <Route path="/terms">
        <TermsOfService />
      </Route>
      <Route path="/support">
        <SupportPage />
      </Route>
      <Route path="/app-info">
        <AppMarketingPage />
      </Route>

      {/* FuseAI */}
      <Route path="/fuse-ai">
        <PrivateLayout>
          <FuseAI />
        </PrivateLayout>
      </Route>

      {/* AI Assistant */}
      <Route path="/ai-assistant">
        <PrivateLayout>
          <AiAssistant />
        </PrivateLayout>
      </Route>

      {/* Billing */}
      <Route path="/billing">
        <PrivateLayout>
          <Billing />
        </PrivateLayout>
      </Route>

      {/* Admin */}
      <Route path="/admin/users">
        <PrivateLayout>
          <AdminUsers />
        </PrivateLayout>
      </Route>

      <Route path="/admin/test-accounts">
        <PrivateLayout>
          <AdminTestAccounts />
        </PrivateLayout>
      </Route>

      <Route path="/admin/gameplan">
        <PrivateLayout>
          <GamePlan />
        </PrivateLayout>
      </Route>

      <Route path="/admin/recorder">
        <PrivateLayout>
          <DemoRecorder />
        </PrivateLayout>
      </Route>

      <Route path="/admin/debug-leads">
        <PrivateLayout>
          <DebugLeads />
        </PrivateLayout>
      </Route>

      <Route path="/admin/dripjobs-archive/manage">
        <PrivateLayout>
          <DripJobsArchiveOwner />
        </PrivateLayout>
      </Route>

      <Route path="/admin/dripjobs-archive">
        <DripJobsArchive />
      </Route>

      <Route path="/admin/affiliates">
        <PrivateLayout>
          <AdminAffiliates />
        </PrivateLayout>
      </Route>

      {/* Legacy /affiliate routes — now live at affiliate.fusephone.com. Redirect away. */}
      <Route path="/affiliate">
        {() => { if (typeof window !== 'undefined') window.location.replace('https://affiliate.fusephone.com/'); return null; }}
      </Route>
      <Route path="/affiliate/dashboard">
        {() => { if (typeof window !== 'undefined') window.location.replace('https://affiliate.fusephone.com/dashboard'); return null; }}
      </Route>

      {/* Bare-token URL fallback (custom portal domains) */}
      <Route path="/:token">
        {(params) => {
          const t = params.token || '';
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
          const isShortToken = /^[A-Za-z0-9_-]{16,40}$/.test(t);
          if (isUuid || isShortToken) {
            return <CustomerPortal params={{ token: t }} />;
          }
          return <NotFound />;
        }}
      </Route>

      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function AffiliateRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={AffiliateLanding} />
        <Route path="/apply" component={AffiliateApplyPublic} />
        <Route path="/login" component={AffiliateLogin} />
        <Route path="/dashboard" component={AffiliateDashboard} />
        <Route component={AffiliateLanding} />
      </Switch>
    </Suspense>
  );
}

function Router() {
  if (isAffiliateDomain()) {
    return <AffiliateRouter />;
  }
  if (isMarketingDomain()) {
    return <MarketingRouter />;
  }
  return <AppRouter />;
}

function UserCacheSync({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const switchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (user?.id && switchedRef.current !== user.id) {
      switchedRef.current = user.id;
      setRealtimeUserId(user.id);
      switchPersisterUser(user.id, queryClient, BUILD_VERSION);
    }
    if (!user) {
      switchedRef.current = null;
    }
  }, [user?.id]);

  return <>{children}</>;
}

function SplashGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function useDeepLinkHandler() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const isNative = !!(window as any).__CAPACITOR_NATIVE || !!(window as any).Capacitor?.isNativePlatform?.() || !!(window as any).Capacitor?.isNative;
    if (!isNative) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');

        const listener = await CapApp.addListener('appUrlOpen', async (event: { url: string }) => {
          console.log('[DeepLink] Received:', event.url);

          try {
            const { Browser } = await import('@capacitor/browser');
            await Browser.close();
          } catch {}

          try {
            const url = new URL(event.url);
            const token = url.searchParams.get('token');
            const isAuthCallback =
              url.protocol === 'fusephone:' &&
              (url.host === 'auth' || url.hostname === 'auth') &&
              token;

            if (isAuthCallback && token) {
              exchangeMobileToken(token, setLocation);
              return;
            }

            const isIntegrationsCallback =
              url.protocol === 'fusephone:' &&
              (url.pathname.includes('integrations') || url.host === 'integrations' || url.hostname === 'integrations');

            if (isIntegrationsCallback) {
              const googleStatus = url.searchParams.get('google');
              const fbStatus = url.searchParams.get('fb');
              const queryString = url.search;
              console.log('[DeepLink] Integration callback, google:', googleStatus, 'fb:', fbStatus);
              const { queryClient } = await import('@/lib/queryClient');
              queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
              setLocation(`/settings/integrations${queryString}`);
              return;
            }
          } catch (e) {
            console.error('[DeepLink] URL parse error:', e);
            const tokenMatch = event.url.match(/[?&]token=([^&]+)/);
            if (tokenMatch && event.url.startsWith('fusephone://')) {
              exchangeMobileToken(tokenMatch[1], setLocation);
            }
          }
        });

        cleanup = () => listener.remove();
      } catch (e) {
        console.error('[DeepLink] Setup failed:', e);
      }
    })();

    return () => { if (cleanup) cleanup(); };
  }, [setLocation]);
}

function DeepLinkWrapper({ children }: { children: ReactNode }) {
  useDeepLinkHandler();
  return <>{children}</>;
}

declare const __BUILD_TIMESTAMP__: string;
const BUILD_VERSION = typeof __BUILD_TIMESTAMP__ !== "undefined" ? __BUILD_TIMESTAMP__ : "dev";
console.log('[APP] Build version (cache buster):', BUILD_VERSION);
const persistOptions = {
  persister: createIDBPersister(),
  maxAge: 24 * 60 * 60 * 1000,
  buster: BUILD_VERSION,
  onSuccess: () => {
    console.log('[APP] Persist cache restored successfully');
  },
};

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <UserCacheSync>
            <TooltipProvider>
              <NotificationContextProvider>
                <UploadProgressProvider>
                <MobileHeaderOverrideProvider>
                  <Toaster />
                  <LogoutOverlay />
                  <PushPermissionBanner />
                  <UploadProgressNotification />
                  <DeepLinkWrapper>
                    <SplashGuard>
                      <DemoModeProvider>
                        <CameraOverlayProvider>
                          <Router />
                          <CameraOverlay />
                        </CameraOverlayProvider>
                      </DemoModeProvider>
                    </SplashGuard>
                  </DeepLinkWrapper>
                </MobileHeaderOverrideProvider>
                </UploadProgressProvider>
              </NotificationContextProvider>
            </TooltipProvider>
          </UserCacheSync>
        </PersistQueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
