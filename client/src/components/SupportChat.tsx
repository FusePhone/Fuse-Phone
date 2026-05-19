import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageCircle, X, Send, Loader2, Building2, CalendarDays,
  Phone, FileText, Users, Sparkles, ChevronRight
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useMobileMenu } from "@/components/layout/Sidebar";

type Message = {
  id: number;
  userId: string;
  senderType: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

type NudgeItem = {
  id: string;
  icon: typeof Building2;
  title: string;
  desc: string;
  action?: string;
  href?: string;
  type: 'setup' | 'reminder' | 'tip';
};

const GREETING_STORAGE_KEY = 'fuse_chat_greeting_count';
const GREETING_DISMISSED_KEY = 'fuse_chat_greeting_dismissed';
const MAX_GREETING_SHOWS = 3;

export function SupportChat() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [nudgeVisible, setNudgeVisible] = useState(false);
  const [tipsDone, setTipsDone] = useState(() => {
    try {
      const count = parseInt(localStorage.getItem('fuse_tip_total_shows') || '0', 10);
      return count >= 3;
    } catch (e) { return false; }
  });
  const [message, setMessage] = useState('');
  const [greetingDismissed, setGreetingDismissed] = useState(() => {
    return localStorage.getItem(GREETING_DISMISSED_KEY) === 'true';
  });
  const [greetingShown, setGreetingShown] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ['/api/support/messages'],
    refetchOnWindowFocus: true,
  });

  const { data: companySettings } = useQuery<any>({
    queryKey: ['/api/settings/company'],
  });

  const { data: bookings } = useQuery<any[]>({
    queryKey: ['/api/onboarding/booking'],
  });

  const sendMutation = useMutation({
    mutationFn: async (msg: string) => {
      await apiRequest("POST", "/api/support/messages", { message: msg });
    },
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['/api/support/messages'] });
    },
  });

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen, greetingShown]);

  useEffect(() => {
    if (isOpen && !greetingDismissed && !greetingShown) {
      const count = parseInt(localStorage.getItem(GREETING_STORAGE_KEY) || '0', 10);
      if (count < MAX_GREETING_SHOWS) {
        setGreetingShown(true);
        localStorage.setItem(GREETING_STORAGE_KEY, String(count + 1));
      } else {
        setGreetingDismissed(true);
        localStorage.setItem(GREETING_DISMISSED_KEY, 'true');
      }
    }
    if (!isOpen && greetingShown) {
      setGreetingShown(false);
    }
  }, [isOpen, greetingDismissed, greetingShown]);

  useEffect(() => {
    const dismissed = sessionStorage.getItem('nudge_dismissed');
    if (dismissed) {
      setNudgeDismissed(true);
      return;
    }
    const timer = setTimeout(() => {
      if (!isOpen) setNudgeVisible(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const handleDismissNudge = () => {
    setNudgeDismissed(true);
    setNudgeVisible(false);
    sessionStorage.setItem('nudge_dismissed', 'true');
  };

  const handleDismissGreeting = () => {
    setGreetingShown(false);
    setGreetingDismissed(true);
    localStorage.setItem(GREETING_DISMISSED_KEY, 'true');
  };

  const unreadAdminCount = messages.filter(m => m.senderType === 'admin' && !m.isRead).length;

  const nudges: NudgeItem[] = [];

  const isProfileIncomplete = !companySettings ||
    companySettings.companyName === 'My Company' ||
    !companySettings.phone ||
    !companySettings.email;
  if (isProfileIncomplete) {
    nudges.push({
      id: 'profile',
      icon: Building2,
      title: "Set up your company profile",
      desc: "Add your business name, phone, and email so your documents look professional.",
      action: "Complete Profile",
      href: "/settings/company",
      type: 'setup',
    });
  }

  const bookingList = Array.isArray(bookings) ? bookings : [];
  const pendingBooking = bookingList.find((b: any) => b.status === 'pending');
  const confirmedBooking = bookingList.find((b: any) => b.status === 'confirmed');
  if (confirmedBooking) {
    const bookingDate = new Date(confirmedBooking.preferredDate);
    const timeStr = confirmedBooking.confirmedTime ? ` at ${confirmedBooking.confirmedTime}` : '';
    nudges.push({
      id: 'call-confirmed',
      icon: CalendarDays,
      title: "Setup call confirmed",
      desc: `Your call with Gamaliel is on ${format(bookingDate, 'MMMM d')}${timeStr}. He'll walk you through everything!`,
      type: 'reminder',
    });
  } else if (pendingBooking) {
    const bookingDate = new Date(pendingBooking.preferredDate);
    nudges.push({
      id: 'call-pending',
      icon: CalendarDays,
      title: "Setup call pending",
      desc: `Your call on ${format(bookingDate, 'MMMM d')} is being confirmed. You'll hear back soon!`,
      type: 'reminder',
    });
  }

  if (!isProfileIncomplete && nudges.length === 0 && !tipsDone) {
    const allTips: NudgeItem[] = [
      { id: 'tip-leads', icon: Users, title: "Import your leads", desc: "Add your contacts to start tracking them through your pipeline.", action: "Go to Contacts", href: "/contacts", type: 'tip' },
      { id: 'tip-docs', icon: FileText, title: "Create your first proposal", desc: "Send professional proposals and get them signed digitally.", action: "Create Document", href: "/documents", type: 'tip' },
      { id: 'tip-phone', icon: Phone, title: "Set up your phone system", desc: "Connect Twilio to make calls and send texts right from the app.", action: "Go to Integrations", href: "/settings/integrations", type: 'tip' },
    ];
    const tipIndex = Math.floor(Date.now() / (1000 * 60 * 60)) % allTips.length;
    nudges.push(allTips[tipIndex]);
  }

  const showNudge = nudgeVisible && !nudgeDismissed && !isOpen && nudges.length > 0;
  const hasTipNudge = nudges.some(n => n.type === 'tip');

  const tipCountedRef = useRef(false);
  useEffect(() => {
    if (showNudge && hasTipNudge && !tipCountedRef.current) {
      tipCountedRef.current = true;
      try {
        const count = parseInt(localStorage.getItem('fuse_tip_total_shows') || '0', 10) + 1;
        localStorage.setItem('fuse_tip_total_shows', String(count));
        if (count >= 3) setTipsDone(true);
      } catch (e) {}
    }
  }, [showNudge, hasTipNudge]);

  const firstName = user?.firstName || '';
  const showGreeting = isOpen && greetingShown && !greetingDismissed && messages.length === 0;

  const { isOpen: menuOpen } = useMobileMenu();

  if (location.startsWith('/messages') || menuOpen) {
    return null;
  }

  return (
    <div className="fixed bottom-20 lg:bottom-6 right-4 z-50 flex flex-col items-end gap-3" data-testid="support-chat-container">
      {showNudge && (
        <div className="w-72 sm:w-80 bg-background border rounded-md shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-300" data-testid="nudge-popup">
          <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Quick Tip</span>
            </div>
            <button
              onClick={handleDismissNudge}
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-dismiss-nudge"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-3 pb-3 space-y-2.5">
            {nudges.slice(0, 2).map((nudge) => (
              <div key={nudge.id} className="flex items-start gap-2.5">
                <div className="mt-0.5 w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <nudge.icon className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{nudge.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{nudge.desc}</p>
                  {nudge.action && nudge.href && (
                    <Link href={nudge.href}>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs text-primary mt-1"
                        onClick={handleDismissNudge}
                        data-testid={`button-nudge-action-${nudge.id}`}
                      >
                        {nudge.action} <ChevronRight className="w-3 h-3 ml-0.5" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isOpen ? (
        <div className="w-80 sm:w-96 bg-background border rounded-md shadow-lg flex flex-col" style={{ height: '28rem' }}>
          <div className="flex items-center justify-between gap-2 p-3 border-b bg-primary text-primary-foreground rounded-t-md">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              <span className="font-medium text-sm">Support Chat</span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-primary-foreground hover:text-primary-foreground/80"
              onClick={() => setIsOpen(false)}
              data-testid="button-close-chat"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="space-y-3">
                {showGreeting && (
                  <div className="rounded-md bg-primary/5 border border-primary/10 p-3 space-y-2" data-testid="chat-greeting-banner">
                    <p className="text-sm font-medium">
                      {firstName ? `Hey ${firstName}!` : 'Hey there!'} Welcome to Fuse Phone.
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      I'm Gamaliel, the founder. I wanted to get in touch earlier, but the chat wasn't working properly — it's working now! Feel free to send me a message anytime.
                    </p>
                    <button
                      onClick={handleDismissGreeting}
                      className="text-xs text-primary hover:underline"
                      data-testid="button-dismiss-greeting"
                    >
                      Got it
                    </button>
                  </div>
                )}
                <div className="text-center text-sm text-muted-foreground py-4 px-4">
                  <p className="font-medium mb-1">Need help?</p>
                  <p>Send a message and Gamaliel will get back to you as soon as possible.</p>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "max-w-[80%] rounded-md px-3 py-2 text-sm",
                    msg.senderType === 'user'
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "mr-auto bg-muted"
                  )}
                  data-testid={`chat-message-${msg.id}`}
                >
                  <p>{msg.message}</p>
                  <p className={cn(
                    "text-[10px] mt-1",
                    msg.senderType === 'user' ? "text-primary-foreground/60" : "text-muted-foreground"
                  )}>
                    {format(new Date(msg.createdAt), 'MMM d, h:mm a')}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t">
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            >
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1"
                data-testid="input-support-message"
              />
              <Button
                size="icon"
                type="submit"
                disabled={!message.trim() || sendMutation.isPending}
                data-testid="button-send-message"
              >
                {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <Button
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg relative"
          onClick={() => { setIsOpen(true); setNudgeVisible(false); }}
          data-testid="button-open-chat"
        >
          <MessageCircle className="w-5 h-5" />
          {unreadAdminCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadAdminCount}
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
