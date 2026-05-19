import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useSubscription } from "@/hooks/use-subscription";
import { FEATURE_FLAGS } from "@shared/featureFlags";
import { 
  LayoutDashboard, 
  AlertTriangle,
  Users, 
  FileText, 
  LogOut, 
  Menu,
  X,
  Building2,
  Settings,
  MessageSquare,
  Phone,
  ClipboardList,
  Calendar,
  Briefcase,
  FolderKanban,
  Shield,
  CreditCard,
  Clock,
  HardHat,
  DollarSign,
  Paintbrush,
  Sparkles,
  BarChart3,
  Calculator,
  Map,
  Bot,
  Megaphone,
  Share2,
  GraduationCap,
  LifeBuoy,
  UserCog,
  Layers,
  Eye,
  Video,
  Bug,
  FolderArchive,
  FlaskConical,
  Lightbulb,
  ChevronDown
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { subscribeRealtimeStatus, isRealtimeConnected, forceRefreshOnResume } from "@/lib/realtime";
import { QuickShare } from "@/components/QuickShare";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { NotificationCenter } from "@/components/NotificationCenter";
import { FusePhoneLogoImage } from "@/components/FusePhoneLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useQueryClient } from "@tanstack/react-query";
import { GuardedLink } from "@/components/GuardedLink";
import { hasUnsavedChanges, confirmNavigation } from "@/hooks/use-navigation-guard";

type MinTier = 'starter' | 'core' | 'elite';

interface NavItemDef {
  name: string;
  href: string;
  icon: any;
  minTier?: MinTier;
  maxTier?: MinTier;
  elite?: boolean;
  fuseAi?: boolean;
  requiredCapability?: string;
  ownerOnly?: boolean;
}

interface UserCapabilities {
  isOwner: boolean;
  role: string | null;
  capabilities: Record<string, boolean>;
  linkedTeamMemberId: number | null;
}

const fieldWorkerNavigation: NavItemDef[] = [
  { name: "My Jobs", href: "/my-jobs", icon: Briefcase, requiredCapability: "viewAssignedJobs" },
  { name: "My Calendar", href: "/my-calendar", icon: Calendar, requiredCapability: "viewCrewCalendar" },
  { name: "Messages", href: "/messages?tab=team", icon: MessageSquare, requiredCapability: "viewTeamMessages" },
  { name: "My Clock", href: "/crew-clock", icon: Clock, requiredCapability: "clockInOut" },
];

function isFieldWorkerRole(role: string | null): boolean {
  return role === 'laborer' || role === 'crew_lead';
}

const mainNavigation: NavItemDef[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, minTier: "starter" },
  { name: "Attention", href: "/attention", icon: AlertTriangle, minTier: "starter" },
  { name: "Metrics", href: "/metrics", icon: BarChart3, minTier: "core" },
  { name: "Contacts", href: "/contacts", icon: Users, minTier: "starter" },
  { name: "Projects", href: "/projects", icon: FolderKanban, minTier: "starter" },
  { name: "Documents", href: "/documents", icon: FileText, minTier: "starter" },
  { name: "Jobs", href: "/jobs", icon: Briefcase, minTier: "elite", elite: true },
  { name: "Job History", href: "/job-history", icon: Clock, minTier: "starter" },
  { name: "Calendar", href: "/calendar", icon: Calendar, minTier: "starter" },
  { name: "Campaigns", href: "/campaigns", icon: Megaphone, minTier: "elite" },
  { name: "Messages", href: "/messages", icon: MessageSquare, minTier: "elite" },
  { name: "Calls", href: "/calls", icon: Phone, minTier: "elite" },
];

const settingsNavigation: NavItemDef[] = [
  { name: "Company Profile", href: "/settings/company", icon: Building2, minTier: "starter" },
  { name: "Financials", href: "/financials", icon: Calculator, minTier: "starter", maxTier: "starter" },
  { name: "Financial Settings", href: "/settings/financial", icon: DollarSign, minTier: "core" },
  { name: "Production Rates", href: "/settings/production-rates", icon: Paintbrush, minTier: "elite", fuseAi: true },
  { name: "Packages", href: "/settings/packages", icon: Layers, minTier: "elite", elite: true },
  { name: "Crew Management", href: "/settings/crew", icon: HardHat, minTier: "elite", elite: true },
  { name: "Users", href: "/settings/users", icon: UserCog, minTier: "elite", elite: true },
  { name: "Templates", href: "/settings/templates", icon: ClipboardList, minTier: "starter" },
  { name: "Integrations", href: "/settings/integrations", icon: Settings, minTier: "starter" },
  { name: "Billing", href: "/billing", icon: CreditCard, minTier: "starter" },
  { name: "University", href: "/academy", icon: GraduationCap, minTier: "starter" },
  { name: "Feature Requests", href: "/feature-requests", icon: Lightbulb, minTier: "starter" },
  { name: "Support", href: "/support", icon: LifeBuoy, minTier: "starter" },
];

const addOnsNavigation: NavItemDef[] = [
  { name: "FuseAI", href: "/fuse-ai", icon: Sparkles, minTier: "elite", fuseAi: true },
  { name: "AI Assistant", href: "/ai-assistant", icon: Bot, minTier: "elite" },
];

function DemoModeToggle() {
  const { isDemoMode, setDemoMode } = useDemoMode();
  return (
    <button
      onClick={() => setDemoMode(!isDemoMode)}
      className={cn(
        "flex items-center gap-3 px-2 py-2 rounded-lg text-sm w-full transition-colors",
        isDemoMode
          ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      data-testid="button-toggle-demo-mode"
    >
      <Eye className="w-5 h-5 flex-shrink-0" />
      <span className="truncate">Demo Mode</span>
      {isDemoMode && (
        <span className="ml-auto text-[10px] font-bold uppercase bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded">On</span>
      )}
    </button>
  );
}

function tierMeetsMinimum(userTier: string, minTier: MinTier, isAdmin: boolean, maxTier?: MinTier): boolean {
  const tierOrder: Record<string, number> = { starter: 0, core: 1, elite: 2 };
  const userLevel = tierOrder[userTier] ?? 1;
  if (userLevel < (tierOrder[minTier] ?? 0)) return false;
  if (maxTier && userLevel > (tierOrder[maxTier] ?? 2)) return false;
  return true;
}

interface MobileMenuContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const MobileMenuContext = createContext<MobileMenuContextValue>({
  isOpen: false,
  setIsOpen: () => {},
});

export function useMobileMenu() {
  return useContext(MobileMenuContext);
}

interface MobileHeaderOverride {
  content: React.ReactNode | null;
  setContent: (content: React.ReactNode | null) => void;
}

const MobileHeaderOverrideContext = createContext<MobileHeaderOverride>({
  content: null,
  setContent: () => {},
});

export function MobileHeaderOverrideProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState<React.ReactNode | null>(null);
  return (
    <MobileHeaderOverrideContext.Provider value={{ content, setContent }}>
      {children}
    </MobileHeaderOverrideContext.Provider>
  );
}

export function useMobileHeaderOverride() {
  return useContext(MobileHeaderOverrideContext);
}

interface MobileNavVisibilityContextValue {
  hidden: boolean;
  setHidden: (v: boolean) => void;
}

const MobileNavVisibilityContext = createContext<MobileNavVisibilityContextValue>({
  hidden: false,
  setHidden: () => {},
});

export function MobileNavVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  return (
    <MobileNavVisibilityContext.Provider value={{ hidden, setHidden }}>
      {children}
    </MobileNavVisibilityContext.Provider>
  );
}

export function useMobileNavVisibility() {
  return useContext(MobileNavVisibilityContext);
}

export function MobileMenuProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpenRaw] = useState(false);
  const [location] = useLocation();

  const setIsOpen = useCallback((open: boolean) => {
    setIsOpenRaw(open);
    if (open) {
      window.dispatchEvent(new CustomEvent('mobile-menu-opened'));
    }
  }, []);

  useEffect(() => {
    const handleNotificationOpened = () => {
      if (isOpen) setIsOpenRaw(false);
    };
    window.addEventListener('notification-center-opened', handleNotificationOpened);
    return () => window.removeEventListener('notification-center-opened', handleNotificationOpened);
  }, [isOpen]);

  useEffect(() => {
    setIsOpenRaw(false);
  }, [location]);

  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  return (
    <MobileMenuContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </MobileMenuContext.Provider>
  );
}

interface UnreadCounts {
  unreadMessages: number;
  missedCalls: number;
  newLeads: number;
  newProjects: number;
  newBookingRequests: number;
  unreadTeamMessages: number;
}

const sectionMap: Record<string, 'projects' | 'calendar'> = {
  Projects: 'projects',
  Calendar: 'calendar',
};

// Per-item icon colors (applied only when the nav item is NOT active).
// Active items keep the white-on-primary look so colors don't clash.
// Each entry pairs a text color with a matching colored drop-shadow glow.
const navIconColorMap: Record<string, string> = {
  "Dashboard":          "text-sky-500 [filter:drop-shadow(0_0_4px_rgba(14,165,233,0.55))]",
  "Metrics":            "text-violet-500 [filter:drop-shadow(0_0_4px_rgba(139,92,246,0.55))]",
  "Contacts":           "text-blue-500 [filter:drop-shadow(0_0_4px_rgba(59,130,246,0.55))]",
  "Projects":           "text-amber-500 [filter:drop-shadow(0_0_4px_rgba(245,158,11,0.55))]",
  "Documents":          "text-emerald-500 [filter:drop-shadow(0_0_4px_rgba(16,185,129,0.55))]",
  "Jobs":               "text-orange-500 [filter:drop-shadow(0_0_4px_rgba(249,115,22,0.55))]",
  "Job History":        "text-stone-500 [filter:drop-shadow(0_0_4px_rgba(120,113,108,0.55))]",
  "Calendar":           "text-rose-500 [filter:drop-shadow(0_0_4px_rgba(244,63,94,0.55))]",
  "Campaigns":          "text-pink-500 [filter:drop-shadow(0_0_4px_rgba(236,72,153,0.55))]",
  "Messages":           "text-cyan-500 [filter:drop-shadow(0_0_4px_rgba(6,182,212,0.55))]",
  "Calls":              "text-green-500 [filter:drop-shadow(0_0_4px_rgba(34,197,94,0.55))]",
  "Company Profile":    "text-indigo-500 [filter:drop-shadow(0_0_4px_rgba(99,102,241,0.55))]",
  "Financials":         "text-emerald-600 [filter:drop-shadow(0_0_4px_rgba(5,150,105,0.55))]",
  "Financial Settings": "text-emerald-600 [filter:drop-shadow(0_0_4px_rgba(5,150,105,0.55))]",
  "Production Rates":   "text-fuchsia-500 [filter:drop-shadow(0_0_4px_rgba(217,70,239,0.55))]",
  "Packages":           "text-purple-500 [filter:drop-shadow(0_0_4px_rgba(168,85,247,0.55))]",
  "Crew Management":    "text-yellow-600 [filter:drop-shadow(0_0_4px_rgba(202,138,4,0.55))]",
  "Users":              "text-blue-600 [filter:drop-shadow(0_0_4px_rgba(37,99,235,0.55))]",
  "Templates":          "text-teal-500 [filter:drop-shadow(0_0_4px_rgba(20,184,166,0.55))]",
  "Integrations":       "text-slate-500 [filter:drop-shadow(0_0_4px_rgba(100,116,139,0.55))]",
  "Billing":            "text-emerald-500 [filter:drop-shadow(0_0_4px_rgba(16,185,129,0.55))]",
  "University":         "text-amber-600 [filter:drop-shadow(0_0_4px_rgba(217,119,6,0.55))]",
  "Support":            "text-red-500 [filter:drop-shadow(0_0_4px_rgba(239,68,68,0.55))]",
  "FuseAI":             "text-red-500 [filter:drop-shadow(0_0_4px_rgba(239,68,68,0.55))]",
  "AI Assistant":       "text-fuchsia-500 [filter:drop-shadow(0_0_4px_rgba(217,70,239,0.55))]",
  "My Jobs":            "text-orange-500 [filter:drop-shadow(0_0_4px_rgba(249,115,22,0.55))]",
  "My Calendar":        "text-rose-500 [filter:drop-shadow(0_0_4px_rgba(244,63,94,0.55))]",
  "My Clock":           "text-cyan-600 [filter:drop-shadow(0_0_4px_rgba(8,145,178,0.55))]",
  "Test Accounts":      "text-lime-600 [filter:drop-shadow(0_0_4px_rgba(101,163,13,0.55))]",
  "GamePlan":           "text-indigo-500 [filter:drop-shadow(0_0_4px_rgba(99,102,241,0.55))]",
  "Demo Recorder":      "text-pink-500 [filter:drop-shadow(0_0_4px_rgba(236,72,153,0.55))]",
  "Debug Leads":        "text-amber-600 [filter:drop-shadow(0_0_4px_rgba(217,119,6,0.55))]",
  "DripJobs Archive":   "text-stone-500 [filter:drop-shadow(0_0_4px_rgba(120,113,108,0.55))]",
};

function useRealtimeIndicator(enabled: boolean) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const update = (connected: boolean) => {
      if (connected) {
        if (timer) { clearTimeout(timer); timer = null; }
        setShow(false);
      } else {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setShow(true), 5000);
      }
    };
    update(isRealtimeConnected());
    const unsub = subscribeRealtimeStatus(update);
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [enabled]);
  return show;
}

function NavItem({ item, onNavigate, hideTextBadges }: { item: { name: string; href: string; icon: any; elite?: boolean; fuseAi?: boolean }; onNavigate?: () => void; hideTextBadges?: boolean }) {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { data: unreadCounts } = useQuery<UnreadCounts>({
    queryKey: ['/api/notifications/unread'],
  });
  const { data: attentionData } = useQuery<{ count: number }>({
    queryKey: ['/api/attention/count'],
    enabled: item.name === "Attention",
    refetchInterval: 60_000,
  });

  const isActive = location === item.href || location.startsWith(item.href.split('?')[0] + '?');
  
  const getNotificationCount = (itemName: string) => {
    if (itemName === "Attention") return attentionData?.count || 0;
    if (!unreadCounts) return 0;
    if (itemName === "Messages") return unreadCounts.unreadMessages + (unreadCounts.unreadTeamMessages || 0);
    if (itemName === "Calls") return unreadCounts.missedCalls;
    if (itemName === "Projects") return unreadCounts.newProjects;
    if (itemName === "Calendar") return unreadCounts.newBookingRequests;
    return 0;
  };

  const notificationCount = getNotificationCount(item.name);
  const showRealtimeDot = item.name === "Messages";
  const realtimeDot = useRealtimeIndicator(showRealtimeDot);

  const handleClick = () => {
    const section = sectionMap[item.name];
    if (section && notificationCount > 0) {
      fetch('/api/notifications/mark-seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section }),
        credentials: 'include',
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
      });
    }
    onNavigate?.();
  };

  return (
    <GuardedLink href={item.href}>
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
          isActive
            ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        onClick={handleClick}
      >
        <span className="relative inline-flex">
          <item.icon className={cn("w-5 h-5", !isActive && (navIconColorMap[item.name] || "text-muted-foreground"))} />
          {showRealtimeDot && realtimeDot && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                forceRefreshOnResume();
              }}
              className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-background animate-pulse cursor-pointer hover:bg-amber-600"
              title="Reconnecting… Tap to retry"
              aria-label="Reconnect realtime"
              data-testid="indicator-realtime-disconnected"
            />
          )}
        </span>
        <span className="flex-1">{item.name}</span>
        {!hideTextBadges && item.elite && notificationCount === 0 && (
          <span className={cn(
            "text-[10px] font-medium",
            isActive ? "text-primary-foreground/70" : "text-muted-foreground/60"
          )} data-testid={`badge-elite-sidebar-${item.name.toLowerCase().replace(/\s+/g, '-')}`}>
            Elite
          </span>
        )}
        {!hideTextBadges && item.fuseAi && notificationCount === 0 && !isActive && (
          <span className="text-[10px] font-medium text-purple-500 dark:text-purple-400"
            data-testid="badge-ai-sidebar">
            AI
          </span>
        )}
        {notificationCount > 0 && (
          <Badge 
            variant="destructive"
            data-testid={`badge-unread-${item.name.toLowerCase()}`}
          >
            {notificationCount > 99 ? '99+' : notificationCount}
          </Badge>
        )}
      </div>
    </GuardedLink>
  );
}

export function MobileMenuContent() {
  const { user, logout } = useAuth();
  const { setIsOpen } = useMobileMenu();
  const { tier, subscription, isNativeApp, isTeamMember, hasFuseAi } = useSubscription();
  const isAdmin = subscription?.isAdmin ?? false;
  const { data: companySettings } = useQuery<any>({
    queryKey: ['/api/settings/company'],
  });
  const { data: userCaps } = useQuery<UserCapabilities>({
    queryKey: ['/api/user/capabilities'],
    staleTime: 60000,
  });
  const [interactable, setInteractable] = useState(false);
  const [adminSectionOpen, setAdminSectionOpenRaw] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('adminSectionOpen') === '1';
  });
  const setAdminSectionOpen = (updater: boolean | ((v: boolean) => boolean)) => {
    setAdminSectionOpenRaw((prev) => {
      const next = typeof updater === 'function' ? (updater as (v: boolean) => boolean)(prev) : updater;
      try { window.localStorage.setItem('adminSectionOpen', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  useEffect(() => {
    setInteractable(false);
    const timer = setTimeout(() => setInteractable(true), 400);
    return () => clearTimeout(timer);
  }, []);

  const isFieldWorker = userCaps ? isFieldWorkerRole(userCaps.role) && !userCaps.isOwner : false;

  const displayName = companySettings?.companyName && companySettings.companyName !== 'My Company'
    ? companySettings.companyName
    : `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
  const displayEmail = companySettings?.email || user?.email;
  const displayInitial = displayName?.[0] || user?.firstName?.[0] || "U";

  const filteredMain = mainNavigation.filter(item => tierMeetsMinimum(tier, item.minTier || 'starter', isAdmin, item.maxTier));
  const filteredSettings = settingsNavigation.filter(item => {
    if (item.name === 'Billing' && isTeamMember) return false;
    return tierMeetsMinimum(tier, item.minTier || 'starter', isAdmin, item.maxTier);
  });
  const filteredAddOns = isNativeApp
    ? addOnsNavigation.filter(item => {
        if (!tierMeetsMinimum(tier, item.minTier || 'starter', isAdmin, item.maxTier)) return false;
        if (item.fuseAi && !hasFuseAi) return false;
        if (item.name === 'AI Assistant' && subscription?.aiAssistantStatus !== 'active') return false;
        return true;
      })
    : addOnsNavigation.filter(item => tierMeetsMinimum(tier, item.minTier || 'starter', isAdmin, item.maxTier));

  const filteredFieldNav = fieldWorkerNavigation.filter(item => {
    if (item.requiredCapability && !userCaps?.capabilities[item.requiredCapability]) return false;
    if (item.name === 'Messages' && !FEATURE_FLAGS.TEAM_MESSAGES_ENABLED && !isAdmin) return false;
    return true;
  });

  if (isFieldWorker) {
    return (
      <div className="p-6 pb-24 space-y-6 select-none" style={{ pointerEvents: interactable ? 'auto' : 'none' }}>
        <div className="space-y-1">
          <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            My Work
          </div>
          {filteredFieldNav.map((item) => (
            <NavItem key={item.name} item={item} onNavigate={() => setIsOpen(false)} hideTextBadges={isNativeApp} />
          ))}
        </div>

        {userCaps?.capabilities.viewProjects && (
          <div className="space-y-1">
            <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Overview
            </div>
            <NavItem item={{ name: "Projects", href: "/projects", icon: FolderKanban }} onNavigate={() => setIsOpen(false)} />
          </div>
        )}

        <div className="space-y-1">
          <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Account
          </div>
          <NavItem item={{ name: "Support", href: "/support", icon: LifeBuoy }} onNavigate={() => setIsOpen(false)} />
        </div>

        <div className="pt-6 border-t space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-bold">
              {displayInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" data-testid="text-sidebar-display-name">
                {user?.firstName || ''} {user?.lastName || ''}
              </p>
              <p className="text-xs text-muted-foreground truncate" data-testid="text-sidebar-display-email">
                {user?.email}
              </p>
              <p className="text-[10px] text-muted-foreground/50 font-mono truncate mt-0.5" data-testid="text-account-id">
                ID: {user?.id?.slice(0, 8)}
              </p>
              <Badge variant="outline" className="mt-1 text-[10px]" data-testid="badge-user-role">
                {userCaps?.role === 'crew_lead' ? 'Crew Lead' : 'Field Employee'}
              </Badge>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20"
            onClick={() => logout()}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 pb-24 space-y-6 select-none" style={{ pointerEvents: interactable ? 'auto' : 'none' }}>
      <div className="space-y-1">
        <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Menu
        </div>
        {filteredMain.map((item) => (
          <NavItem key={item.name} item={item} onNavigate={() => setIsOpen(false)} hideTextBadges={isNativeApp} />
        ))}
      </div>
      
      <div className="space-y-1">
        <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Settings
        </div>
        {filteredSettings.map((item) => (
          <NavItem key={item.name} item={item} onNavigate={() => setIsOpen(false)} hideTextBadges={isNativeApp} />
        ))}
      </div>

      {filteredAddOns.length > 0 && !isNativeApp && (
        <div className="space-y-1">
          <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Add-ons
          </div>
          {filteredAddOns.map((item) => (
            <NavItem key={item.name} item={item} onNavigate={() => setIsOpen(false)} />
          ))}
        </div>
      )}

      {filteredAddOns.length > 0 && isNativeApp && filteredAddOns.map((item) => (
        <NavItem key={item.name} item={item} onNavigate={() => setIsOpen(false)} hideTextBadges />
      ))}

      {user?.isAdmin && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setAdminSectionOpen((v) => !v)}
            className="w-full flex items-center justify-between px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
            data-testid="button-admin-section-toggle-mobile"
          >
            <span>Admin</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${adminSectionOpen ? '' : '-rotate-90'}`} />
          </button>
          {adminSectionOpen && (
            <>
              <NavItem item={{ name: "Users", href: "/admin/users", icon: Shield }} onNavigate={() => setIsOpen(false)} />
              <NavItem item={{ name: "Affiliates", href: "/admin/affiliates", icon: Sparkles }} onNavigate={() => setIsOpen(false)} />
              <NavItem item={{ name: "Test Accounts", href: "/admin/test-accounts", icon: FlaskConical }} onNavigate={() => setIsOpen(false)} />
              <NavItem item={{ name: "GamePlan", href: "/admin/gameplan", icon: Map }} onNavigate={() => setIsOpen(false)} />
              <NavItem item={{ name: "Demo Recorder", href: "/admin/recorder", icon: Video }} onNavigate={() => setIsOpen(false)} />
              <NavItem item={{ name: "Debug Leads", href: "/admin/debug-leads", icon: Bug }} onNavigate={() => setIsOpen(false)} />
              <NavItem item={{ name: "DripJobs Archive", href: "/admin/dripjobs-archive/manage", icon: FolderArchive }} onNavigate={() => setIsOpen(false)} />
              <DemoModeToggle />
            </>
          )}
        </div>
      )}

      <div className="pt-6 border-t space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-bold">
            {displayInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" data-testid="text-sidebar-display-name">
              {displayName}
            </p>
            <p className="text-xs text-muted-foreground truncate" data-testid="text-sidebar-display-email">
              {displayEmail}
            </p>
            <p className="text-[10px] text-muted-foreground/50 font-mono truncate mt-0.5" data-testid="text-account-id">
              ID: {user?.id?.slice(0, 8)}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20"
          onClick={() => logout()}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

export function MobileHeader() {
  const [location] = useLocation();
  const { isOpen, setIsOpen } = useMobileMenu();
  const { content: overrideContent } = useMobileHeaderOverride();
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  
  const isTemplateEditPage = (location.includes('/settings/templates/') || location.includes('/settings/message-templates/')) && location.includes('/edit');

  useEffect(() => {
    if (!window.visualViewport) return;

    const handleViewportChange = () => {
      const vv = window.visualViewport!;
      const keyboardOpen = vv.height < window.innerHeight * 0.75;
      setKeyboardOffset(keyboardOpen ? vv.offsetTop : 0);
    };

    window.visualViewport.addEventListener('resize', handleViewportChange);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
    };
  }, []);

  if (isTemplateEditPage) return null;

  if (overrideContent) {
    return (
      <div 
        className="lg:hidden fixed left-0 right-0 bg-background/95 backdrop-blur-md border-b z-50 pt-safe-top"
        style={{ top: keyboardOffset }}
      >
        <div className="h-14 flex items-center px-2 justify-between gap-1">
          <FusePhoneLogoImage size="sm" />
          <div className="flex-1 min-w-0 flex items-center">
            {overrideContent}
          </div>
          <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={() => setIsOpen(!isOpen)} data-testid="button-mobile-menu">
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="lg:hidden fixed left-0 right-0 bg-background/95 backdrop-blur-md border-b z-50 pt-safe-top"
      style={{ top: keyboardOffset }}
    >
      <div className="h-14 flex items-center px-4 justify-between">
        <div className="flex items-center gap-2">
          <FusePhoneLogoImage size="sm" />
          <span className="font-display font-bold text-lg">Fuse Phone</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <NotificationCenter />
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)} data-testid="button-mobile-menu">
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DesktopSidebar() {
  const { user, logout } = useAuth();
  const { tier, subscription, isNativeApp, isTeamMember, hasFuseAi } = useSubscription();
  const isAdmin = subscription?.isAdmin ?? false;
  const { data: companySettings } = useQuery<any>({
    queryKey: ['/api/settings/company'],
  });
  const { data: userCaps } = useQuery<UserCapabilities>({
    queryKey: ['/api/user/capabilities'],
    staleTime: 60000,
  });

  const isFieldWorker = userCaps ? isFieldWorkerRole(userCaps.role) && !userCaps.isOwner : false;
  const [adminSectionOpen, setAdminSectionOpenRaw] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('adminSectionOpen') === '1';
  });
  const setAdminSectionOpen = (updater: boolean | ((v: boolean) => boolean)) => {
    setAdminSectionOpenRaw((prev) => {
      const next = typeof updater === 'function' ? (updater as (v: boolean) => boolean)(prev) : updater;
      try { window.localStorage.setItem('adminSectionOpen', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  const displayName = companySettings?.companyName && companySettings.companyName !== 'My Company'
    ? companySettings.companyName
    : `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
  const displayEmail = companySettings?.email || user?.email;
  const displayInitial = displayName?.[0] || user?.firstName?.[0] || "U";

  const filteredMain = mainNavigation.filter(item => tierMeetsMinimum(tier, item.minTier || 'starter', isAdmin, item.maxTier));
  const filteredSettings = settingsNavigation.filter(item => {
    if (item.name === 'Billing' && isTeamMember) return false;
    return tierMeetsMinimum(tier, item.minTier || 'starter', isAdmin, item.maxTier);
  });
  const filteredAddOns = isNativeApp
    ? addOnsNavigation.filter(item => {
        if (!tierMeetsMinimum(tier, item.minTier || 'starter', isAdmin, item.maxTier)) return false;
        if (item.fuseAi && !hasFuseAi) return false;
        if (item.name === 'AI Assistant' && subscription?.aiAssistantStatus !== 'active') return false;
        return true;
      })
    : addOnsNavigation.filter(item => tierMeetsMinimum(tier, item.minTier || 'starter', isAdmin, item.maxTier));

  const filteredFieldNav = fieldWorkerNavigation.filter(item => {
    if (item.requiredCapability && !userCaps?.capabilities[item.requiredCapability]) return false;
    if (item.name === 'Messages' && !FEATURE_FLAGS.TEAM_MESSAGES_ENABLED && !isAdmin) return false;
    return true;
  });

  if (isFieldWorker) {
    return (
      <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 z-40 w-72 bg-card border-r flex-col overflow-y-auto">
        <div className="flex flex-col min-h-full p-6">
          <div className="flex items-center justify-between mb-10 px-2 shrink-0">
            <div className="flex items-center gap-2">
              <FusePhoneLogoImage size="md" />
              <span className="font-display font-bold text-xl tracking-tight">Fuse Phone</span>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <NotificationCenter />
            </div>
          </div>

          <div className="space-y-6 flex-1">
            <div className="space-y-1">
              <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                My Work
              </div>
              {filteredFieldNav.map((item) => (
                <NavItem key={item.name} item={item} />
              ))}
            </div>

            {userCaps?.capabilities.viewProjects && (
              <div className="space-y-1">
                <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Overview
                </div>
                <NavItem item={{ name: "Projects", href: "/projects", icon: FolderKanban }} />
              </div>
            )}

            <div className="space-y-1">
              <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Account
              </div>
              <NavItem item={{ name: "Support", href: "/support", icon: LifeBuoy }} />
            </div>
          </div>

          <div className="mt-auto pt-6 border-t space-y-4 shrink-0">
            <div className="flex items-center gap-3 px-2">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-bold">
                {displayInitial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid="text-desktop-sidebar-display-name">
                  {user?.firstName || ''} {user?.lastName || ''}
                </p>
                <p className="text-xs text-muted-foreground truncate" data-testid="text-desktop-sidebar-display-email">
                  {user?.email}
                </p>
                <p className="text-[10px] text-muted-foreground/50 font-mono truncate mt-0.5" data-testid="text-account-id">
                  ID: {user?.id?.slice(0, 8)}
                </p>
                <Badge variant="outline" className="mt-1 text-[10px]" data-testid="badge-user-role">
                  {userCaps?.role === 'crew_lead' ? 'Crew Lead' : 'Field Employee'}
                </Badge>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20"
              onClick={() => logout()}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 z-40 w-72 bg-card border-r flex-col overflow-y-auto">
      <div className="flex flex-col min-h-full p-6">
        <div className="flex items-center justify-between mb-10 px-2 shrink-0">
          <div className="flex items-center gap-2">
            <FusePhoneLogoImage size="md" />
            <span className="font-display font-bold text-xl tracking-tight">Fuse Phone</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NotificationCenter />
          </div>
        </div>

        <div className="space-y-6 flex-1">
          <div className="space-y-1">
            <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Menu
            </div>
            {filteredMain.map((item) => (
              <NavItem key={item.name} item={item} hideTextBadges={isNativeApp} />
            ))}
          </div>
          
          <div className="space-y-1">
            <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Settings
            </div>
            {filteredSettings.map((item) => (
              <NavItem key={item.name} item={item} hideTextBadges={isNativeApp} />
            ))}
          </div>

          {filteredAddOns.length > 0 && !isNativeApp && (
            <div className="space-y-1">
              <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Add-ons
              </div>
              {filteredAddOns.map((item) => (
                <NavItem key={item.name} item={item} />
              ))}
            </div>
          )}

          {filteredAddOns.length > 0 && isNativeApp && filteredAddOns.map((item) => (
            <NavItem key={item.name} item={item} hideTextBadges />
          ))}

          {user?.isAdmin && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setAdminSectionOpen((v) => !v)}
                className="w-full flex items-center justify-between px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
                data-testid="button-admin-section-toggle-desktop"
              >
                <span>Admin</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${adminSectionOpen ? '' : '-rotate-90'}`} />
              </button>
              {adminSectionOpen && (
                <>
                  <NavItem item={{ name: "Users", href: "/admin/users", icon: Shield }} />
                  <NavItem item={{ name: "Affiliates", href: "/admin/affiliates", icon: Sparkles }} />
                  <NavItem item={{ name: "Test Accounts", href: "/admin/test-accounts", icon: FlaskConical }} />
                  <NavItem item={{ name: "GamePlan", href: "/admin/gameplan", icon: Map }} />
                  <NavItem item={{ name: "Demo Recorder", href: "/admin/recorder", icon: Video }} />
                  <NavItem item={{ name: "Debug Leads", href: "/admin/debug-leads", icon: Bug }} />
                  <NavItem item={{ name: "DripJobs Archive", href: "/admin/dripjobs-archive/manage", icon: FolderArchive }} />
                  <DemoModeToggle />
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-auto pt-6 border-t space-y-4 shrink-0">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-bold">
              {displayInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" data-testid="text-desktop-sidebar-display-name">
                {displayName}
              </p>
              <p className="text-xs text-muted-foreground truncate" data-testid="text-desktop-sidebar-display-email">
                {displayEmail}
              </p>
              <p className="text-[10px] text-muted-foreground/50 font-mono truncate mt-0.5" data-testid="text-account-id">
                ID: {user?.id?.slice(0, 8)}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20"
            onClick={() => logout()}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </aside>
  );
}

export function MobileBottomNav() {
  const [location, navigate] = useLocation();
  const { isOpen: menuOpen, setIsOpen: setMenuOpen } = useMobileMenu();
  const { tier, subscription } = useSubscription();
  const isAdmin = subscription?.isAdmin ?? false;
  const showMessagesAndCalls = tierMeetsMinimum(tier, 'elite', isAdmin);
  const { data: unreadCounts } = useQuery<UnreadCounts>({
    queryKey: ['/api/notifications/unread'],
  });
  const { data: userCaps } = useQuery<UserCapabilities>({
    queryKey: ['/api/user/capabilities'],
    staleTime: 60000,
  });
  const isFieldWorker = userCaps ? isFieldWorkerRole(userCaps.role) && !userCaps.isOwner : false;
  const [quickShareOpen, setQuickShareOpen] = useState(false);
  const realtimeDot = useRealtimeIndicator(true);

  const { hidden: navHidden } = useMobileNavVisibility();

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const centerBtnRef = useCallback((el: HTMLButtonElement | null) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      didLongPress.current = false;
      const t = e.touches[0];
      startPos.current = { x: t.clientX, y: t.clientY };
      longPressTimer.current = setTimeout(() => {
        didLongPress.current = true;
        setMenuOpen(true);
      }, 500);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!startPos.current || !longPressTimer.current) return;
      const t = e.touches[0];
      const dx = Math.abs(t.clientX - startPos.current.x);
      const dy = Math.abs(t.clientY - startPos.current.y);
      if (dx > 10 || dy > 10) {
        clearLongPress();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      clearLongPress();
      if (!didLongPress.current) {
        if (hasUnsavedChanges()) {
          confirmNavigation(() => navigate('/'));
        } else {
          navigate('/');
        }
      }
    };

    const onTouchCancel = () => {
      clearLongPress();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchCancel);

    cleanupRef.current = () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [clearLongPress, setMenuOpen, navigate]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!('ontouchstart' in window)) {
      if (hasUnsavedChanges()) {
        confirmNavigation(() => navigate('/'));
      } else {
        navigate('/');
      }
    }
  }, [navigate]);

  const isTemplateEditPage = (location.includes('/settings/templates/') || location.includes('/settings/message-templates/')) && location.includes('/edit');
  if (isTemplateEditPage || menuOpen || navHidden) return null;

  const isMessagesActive = location === '/messages' || location.startsWith('/messages?');
  const isCallsActive = location === '/calls' || location.startsWith('/calls?');
  const isCalendarActive = location === '/calendar' || location.startsWith('/calendar?');
  const isMyCalendarActive = location === '/my-calendar' || location.startsWith('/my-calendar?');
  const isMyJobsActive = location === '/my-jobs' || location.startsWith('/my-jobs?');
  const isCrewClockActive = location === '/crew-clock' || location.startsWith('/crew-clock?');
  const isDashboardActive = location === '/';

  if (isFieldWorker) {
    return (
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom,0px)]"
        style={{ backgroundColor: 'hsl(var(--background) / 0.95)' }}
        data-testid="mobile-bottom-nav"
      >
        <button
          ref={centerBtnRef}
          className="absolute left-1/2 -translate-x-1/2 -top-6 flex flex-col items-center z-10"
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'none' } as React.CSSProperties}
          data-testid="bottomnav-dashboard"
          onClick={handleClick}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className={cn(
              "w-[56px] h-[56px] rounded-full flex items-center justify-center transition-all overflow-hidden bg-background",
              "border-[3px] border-foreground",
              isDashboardActive && "border-destructive"
            )}
          >
            <FusePhoneLogoImage size="sm" className="!w-9 !h-9" />
          </div>
        </button>

        <div className="backdrop-blur-md border-t">
          <div className="flex items-center">
            <div className="flex-1 flex items-center justify-evenly">
              <GuardedLink href="/messages?tab=team">
                <button
                  className={cn(
                    "flex flex-col items-center gap-0 py-1 px-3 relative transition-colors",
                    isMessagesActive ? "text-foreground" : "text-muted-foreground"
                  )}
                  data-testid="bottomnav-messages"
                >
                  <span className="relative inline-flex">
                    <MessageSquare className="w-5 h-5" />
                    {realtimeDot && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          forceRefreshOnResume();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            forceRefreshOnResume();
                          }
                        }}
                        className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-background animate-pulse cursor-pointer"
                        title="Reconnecting… Tap to retry"
                        aria-label="Reconnect realtime"
                        data-testid="indicator-realtime-disconnected-mobile"
                      />
                    )}
                  </span>
                  <span className="text-[10px] font-medium">Messages</span>
                  {(unreadCounts?.unreadTeamMessages ?? 0) > 0 && (
                    <span className="absolute top-0.5 right-0 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-0.5">
                      {(unreadCounts?.unreadTeamMessages ?? 0) > 99 ? '99+' : unreadCounts?.unreadTeamMessages ?? 0}
                    </span>
                  )}
                </button>
              </GuardedLink>

              <GuardedLink href="/my-calendar">
                <button
                  className={cn(
                    "flex flex-col items-center gap-0 py-1 px-3 relative transition-colors",
                    isMyCalendarActive ? "text-foreground" : "text-muted-foreground"
                  )}
                  data-testid="bottomnav-my-calendar"
                >
                  <Calendar className="w-5 h-5" />
                  <span className="text-[10px] font-medium">My Calendar</span>
                </button>
              </GuardedLink>
            </div>

            <div className="w-[60px] shrink-0" />

            <div className="flex-1 flex items-center justify-evenly gap-1">
              <GuardedLink href="/my-jobs">
                <button
                  className={cn(
                    "flex flex-col items-center gap-0 py-1 px-2 relative transition-colors",
                    isMyJobsActive ? "text-foreground" : "text-muted-foreground"
                  )}
                  data-testid="bottomnav-my-jobs"
                >
                  <Briefcase className="w-5 h-5" />
                  <span className="text-[10px] font-medium">My Jobs</span>
                </button>
              </GuardedLink>

              <GuardedLink href="/crew-clock">
                <button
                  className={cn(
                    "flex flex-col items-center gap-0 py-1 px-3 relative transition-colors",
                    isCrewClockActive ? "text-foreground" : "text-muted-foreground"
                  )}
                  data-testid="bottomnav-my-clock"
                >
                  <Clock className="w-5 h-5" />
                  <span className="text-[10px] font-medium">My Clock</span>
                </button>
              </GuardedLink>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom,0px)]"
      style={{ backgroundColor: 'hsl(var(--background) / 0.95)' }}
      data-testid="mobile-bottom-nav"
    >
      <button
        ref={centerBtnRef}
        className="absolute left-1/2 -translate-x-1/2 -top-6 flex flex-col items-center z-10"
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'none' } as React.CSSProperties}
        data-testid="bottomnav-dashboard"
        onClick={handleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className={cn(
            "w-[56px] h-[56px] rounded-full flex items-center justify-center transition-all overflow-hidden bg-background",
            "border-[3px] border-foreground",
            isDashboardActive && "border-destructive"
          )}
        >
          <FusePhoneLogoImage size="sm" className="!w-9 !h-9" />
        </div>
      </button>

      <div className="backdrop-blur-md border-t">
        <div className="flex items-center">
          <div className="flex-1 flex items-center justify-evenly">
            {showMessagesAndCalls ? (
              <GuardedLink href="/messages">
                <button
                  className={cn(
                    "flex flex-col items-center gap-0 py-1 px-3 relative transition-colors",
                    isMessagesActive ? "text-foreground" : "text-muted-foreground"
                  )}
                  data-testid="bottomnav-messages"
                >
                  <span className="relative inline-flex">
                    <MessageSquare className="w-5 h-5" />
                    {realtimeDot && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          forceRefreshOnResume();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            forceRefreshOnResume();
                          }
                        }}
                        className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-background animate-pulse cursor-pointer"
                        title="Reconnecting… Tap to retry"
                        aria-label="Reconnect realtime"
                        data-testid="indicator-realtime-disconnected-mobile-full"
                      />
                    )}
                  </span>
                  <span className="text-[10px] font-medium">Messages</span>
                  {((unreadCounts?.unreadMessages ?? 0) + (unreadCounts?.unreadTeamMessages ?? 0)) > 0 && (
                    <span className="absolute top-0.5 right-0 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-0.5">
                      {((unreadCounts?.unreadMessages ?? 0) + (unreadCounts?.unreadTeamMessages ?? 0)) > 99 ? '99+' : (unreadCounts?.unreadMessages ?? 0) + (unreadCounts?.unreadTeamMessages ?? 0)}
                    </span>
                  )}
                </button>
              </GuardedLink>
            ) : (
              <GuardedLink href="/contacts">
                <button
                  className={cn(
                    "flex flex-col items-center gap-0 py-1 px-3 relative transition-colors",
                    location === '/contacts' ? "text-foreground" : "text-muted-foreground"
                  )}
                  data-testid="bottomnav-contacts"
                >
                  <Users className="w-5 h-5" />
                  <span className="text-[10px] font-medium">Contacts</span>
                </button>
              </GuardedLink>
            )}

            <GuardedLink href="/calendar">
              <button
                className={cn(
                  "flex flex-col items-center gap-0 py-1 px-3 relative transition-colors",
                  isCalendarActive ? "text-foreground" : "text-muted-foreground"
                )}
                data-testid="bottomnav-calendar"
              >
                <Calendar className="w-5 h-5" />
                <span className="text-[10px] font-medium">Calendar</span>
              </button>
            </GuardedLink>
          </div>

          <div className="w-[60px] shrink-0" />

          <div className="flex-1 flex items-center justify-evenly gap-1">
            {showMessagesAndCalls ? (
              <GuardedLink href="/calls">
                <button
                  className={cn(
                    "flex flex-col items-center gap-0 py-1 px-2 relative transition-colors",
                    isCallsActive ? "text-foreground" : "text-muted-foreground"
                  )}
                  data-testid="bottomnav-calls"
                >
                  <Phone className="w-5 h-5" />
                  <span className="text-[10px] font-medium">Calls</span>
                  {(unreadCounts?.missedCalls ?? 0) > 0 && (
                    <span className="absolute top-0.5 right-0 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-0.5">
                      {unreadCounts!.missedCalls > 99 ? '99+' : unreadCounts!.missedCalls}
                    </span>
                  )}
                </button>
              </GuardedLink>
            ) : (
              <GuardedLink href="/projects">
                <button
                  className={cn(
                    "flex flex-col items-center gap-0 py-1 px-2 relative transition-colors",
                    location.startsWith('/projects') ? "text-foreground" : "text-muted-foreground"
                  )}
                  data-testid="bottomnav-projects"
                >
                  <FolderKanban className="w-5 h-5" />
                  <span className="text-[10px] font-medium">Projects</span>
                </button>
              </GuardedLink>
            )}

            <button
              className={cn(
                "flex flex-col items-center gap-0 py-1 px-3 relative transition-colors",
                quickShareOpen ? "text-foreground" : "text-muted-foreground"
              )}
              onClick={() => setQuickShareOpen(true)}
              data-testid="bottomnav-share"
            >
              <Share2 className="w-5 h-5" />
              <span className="text-[10px] font-medium">Share</span>
            </button>
          </div>
        </div>
      </div>

      <QuickShare open={quickShareOpen} onOpenChange={setQuickShareOpen} />
    </nav>
  );
}

export function Sidebar() {
  return (
    <>
      <MobileHeader />
      <DesktopSidebar />
    </>
  );
}
