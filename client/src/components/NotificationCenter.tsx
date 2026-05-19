import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Bell, BellOff, Trash2, MessageSquare, FileSignature, DollarSign, Settings2, Volume2, ChevronDown, UserPlus, RefreshCw, CalendarPlus, BookOpen, Palette, Megaphone, Users, Clock, Globe, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useNotificationContext } from '@/hooks/use-notification-context';
import { 
  MESSAGE_TONES, 
  PROPOSAL_TONES, 
  PAYMENT_TONES,
  getTonePreferences,
  setTonePreference,
  playTonePreview
} from '@/hooks/use-notifications';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { useQuery } from '@tanstack/react-query';
import type { Contact } from '@shared/schema';
import { formatDistanceToNow } from 'date-fns';

// Sentence-leading patterns we still recognize as a name capture (handles cases
// where a contact only appears once and might not be in the contacts list — for
// example a deleted lead). The contact-list pass below is the primary defense.
const NAME_PATTERNS = [
  /^New message from (.+)$/,
  /^(.+?) signed (?:proposal|document|estimate|invoice)/,
  /^(.+?) signed "(.+?)"$/,
  /^(.+?) approved (?:colors|proposal)/,
  /^(?:Proposal Accepted!\s*)(.+?) signed/,
  /^Follow-ups paused.*?(?:—|-).*?(?:from\s+)?(.+)$/,
  /^(.+?)\s+#\d+$/,
  /^(.+?) just opened /,
  /^(.+?) paid /,
  /^(.+?) submitted (?:a |an )?/,
  /^(.+?) verified their identity/,
  /^(.+?) entered an invalid/,
  /^(.+?) requested /,
  /^(.+?) booked /,
  /^(.+?) scheduled /,
  /^(.+?) replied /,
  /^(.+?) called /,
  /^(.+?) left a (?:voicemail|message)/,
  /^(.+?) accepted /,
  /^(.+?) declined /,
  /^(.+?) viewed /,
  /^(.+?) commented /,
];

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function maskNotifText(
  text: string,
  maskNameFn: (n: string) => string,
  maskTextFn: (t: string) => string,
  contactNames?: string[],
): string {
  let result = text;

  // Primary pass: replace any known contact name (full name, then individual
  // first/last tokens) with its deterministic masked equivalent. This catches
  // notifications regardless of sentence shape ("Stephanie Clark sent ...",
  // "... requested by Stephanie Clark", "Reminder for Stephanie", etc.).
  if (contactNames && contactNames.length > 0) {
    const tokens = new Set<string>();
    for (const full of contactNames) {
      const trimmed = full?.trim();
      if (!trimmed) continue;
      tokens.add(trimmed);
      for (const part of trimmed.split(/\s+/)) {
        if (part.length > 2) tokens.add(part);
      }
    }
    // Replace longest tokens first so "Stephanie Clark" is replaced before
    // "Stephanie" alone, preserving the deterministic full-name mapping.
    const sorted = Array.from(tokens).sort((a, b) => b.length - a.length);
    for (const token of sorted) {
      const re = new RegExp(`\\b${escapeRegex(token)}\\b`, 'g');
      result = result.replace(re, () => maskNameFn(token));
    }
  }

  // Secondary pass: catch leading-name shapes for contacts not in the list
  // (deleted leads, unknown senders, etc.).
  for (const pattern of NAME_PATTERNS) {
    const match = result.match(pattern);
    if (match) {
      for (let i = 1; i < match.length; i++) {
        if (match[i] && match[i].length > 1) {
          const masked = maskNameFn(match[i]);
          result = result.replace(match[i], masked);
        }
      }
      break;
    }
  }

  // Final pass: phone/email/address regex masking.
  result = maskTextFn(result);
  return result;
}

export function NotificationCenter() {
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [showToneSettings, setShowToneSettings] = useState(false);
  const [tonePrefs, setTonePrefs] = useState(getTonePreferences);
  const { isDemoMode, maskText, maskName } = useDemoMode();
  // Contacts list is already cached app-wide via React Query; we read from
  // cache only when demo mode is on so non-demo users pay no cost.
  const { data: contactsForMask } = useQuery<Contact[]>({
    queryKey: ['/api/contacts'],
    enabled: isDemoMode,
    staleTime: Infinity,
  });
  const contactNamesForMask = isDemoMode
    ? (contactsForMask ?? []).map(c => c.name).filter(Boolean) as string[]
    : undefined;
  const { 
    notifications, 
    notificationsEnabled, 
    toggleNotifications, 
    clearNotifications,
    dismissNotificationsByLink,
    dismissNotificationsByType,
    unreadCount 
  } = useNotificationContext();

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (open) {
      window.dispatchEvent(new CustomEvent('notification-center-opened'));
    }
  }, []);

  useEffect(() => {
    const handleMenuOpened = () => {
      if (isOpen) setIsOpen(false);
    };
    window.addEventListener('mobile-menu-opened', handleMenuOpened);
    return () => window.removeEventListener('mobile-menu-opened', handleMenuOpened);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.touchAction;
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.touchAction = prev;
    };
  }, [isOpen]);

  const handleNotificationClick = (notification: typeof notifications[0]) => {
    setIsOpen(false);
    if (notification.type === 'app_update') {
      dismissNotificationsByType('app_update');
      const waitingWorker = (window as any).__swWaitingWorker;
      if (waitingWorker) {
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
      return;
    }
    if (notification.link) {
      dismissNotificationsByLink(notification.link);
      const targetPath = notification.link.split('?')[0];
      const currentPath = window.location.pathname;
      if (currentPath === targetPath || currentPath.startsWith(targetPath + '/')) {
        window.dispatchEvent(new CustomEvent('notification-navigate', { detail: { url: notification.link } }));
        const fullUrl = notification.link.startsWith('/') ? notification.link : '/' + notification.link;
        window.history.replaceState(null, '', fullUrl);
        window.dispatchEvent(new PopStateEvent('popstate'));
      } else {
        setLocation(notification.link);
      }
    }
  };

  const handleToneChange = (type: 'message' | 'proposal' | 'payment', value: string) => {
    setTonePreference(type, value);
    setTonePrefs(getTonePreferences());
    playTonePreview(type, value);
  };

  const handlePreviewTone = (type: 'message' | 'proposal' | 'payment') => {
    const prefs = getTonePreferences();
    playTonePreview(type, prefs[type]);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'message':
      case 'thumbtack_message':
        return <MessageSquare className="w-4 h-4 text-blue-500" />;
      case 'signature':
      case 'document_signed':
        return <FileSignature className="w-4 h-4 text-green-500" />;
      case 'payment':
      case 'payment_received':
        return <DollarSign className="w-4 h-4 text-emerald-500" />;
      case 'facebook_lead':
        return <UserPlus className="w-4 h-4 text-blue-600" />;
      case 'thumbtack_lead':
        return <UserPlus className="w-4 h-4 text-green-600" />;
      case 'app_update':
        return <RefreshCw className="w-4 h-4 text-purple-500" />;
      case 'booking_received':
        return <CalendarPlus className="w-4 h-4 text-orange-500" />;
      case 'new_tutorial':
        return <BookOpen className="w-4 h-4 text-indigo-500" />;
      case 'color_submission':
        return <Palette className="w-4 h-4 text-pink-500" />;
      case 'team_message':
        return <Users className="w-4 h-4 text-violet-500" />;
      case 'schedule_updated':
      case 'appointment_reminder':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'gameplan_suggestion':
        return <Globe className="w-4 h-4 text-teal-500" />;
      case 'trial_ending_reminder':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'thumbtack_debug':
        return <Bell className="w-4 h-4 text-amber-500" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange} modal>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          data-testid="button-notification-center"
        >
          {notificationsEnabled ? (
            <Bell className="w-5 h-5" />
          ) : (
            <BellOff className="w-5 h-5 text-muted-foreground" />
          )}
          {unreadCount > 0 && notificationsEnabled && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">Notifications</h3>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                clearNotifications();
                setIsOpen(false);
              }}
              title="Clear all notifications"
              data-testid="button-clear-notifications"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">Sound & Alerts</span>
          </div>
          <Switch
            checked={notificationsEnabled}
            onCheckedChange={toggleNotifications}
            data-testid="switch-notifications-toggle"
          />
        </div>

        <Collapsible open={showToneSettings} onOpenChange={setShowToneSettings}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between rounded-none border-b px-3 py-3 h-auto"
              data-testid="button-toggle-tone-settings"
            >
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Notification Tones</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showToneSettings ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-3 space-y-3 border-b bg-muted/20">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Text Messages</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePreviewTone('message')}
                    data-testid="button-test-message-tone"
                  >
                    <Volume2 className="w-3 h-3 mr-1" />
                    Test
                  </Button>
                </div>
                <Select 
                  value={tonePrefs.message} 
                  onValueChange={(v) => handleToneChange('message', v)}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid="select-message-tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MESSAGE_TONES).map(([key, tone]) => (
                      <SelectItem key={key} value={key} className="text-xs" data-testid={`option-message-tone-${key}`}>
                        {tone.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Signed Proposals</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePreviewTone('proposal')}
                    data-testid="button-test-proposal-tone"
                  >
                    <Volume2 className="w-3 h-3 mr-1" />
                    Test
                  </Button>
                </div>
                <Select 
                  value={tonePrefs.proposal} 
                  onValueChange={(v) => handleToneChange('proposal', v)}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid="select-proposal-tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROPOSAL_TONES).map(([key, tone]) => (
                      <SelectItem key={key} value={key} className="text-xs" data-testid={`option-proposal-tone-${key}`}>
                        {tone.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Payments</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePreviewTone('payment')}
                    data-testid="button-test-payment-tone"
                  >
                    <Volume2 className="w-3 h-3 mr-1" />
                    Test
                  </Button>
                </div>
                <Select 
                  value={tonePrefs.payment} 
                  onValueChange={(v) => handleToneChange('payment', v)}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid="select-payment-tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_TONES).map(([key, tone]) => (
                      <SelectItem key={key} value={key} className="text-xs" data-testid={`option-payment-tone-${key}`}>
                        {tone.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div
          className="max-h-[60vh] overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No notifications yet
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleNotificationClick(notification)}
                  data-testid={`notification-item-${notification.id}`}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{isDemoMode ? maskNotifText(notification.title, maskName, maskText, contactNamesForMask) : notification.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{isDemoMode ? maskNotifText(notification.message, maskName, maskText, contactNamesForMask) : notification.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
