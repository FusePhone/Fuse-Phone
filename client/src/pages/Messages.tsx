import { useSendSms, useSendEmail, useMakeCall, useCompanySettings, useCommunications } from "@/hooks/use-company-settings";
import { FEATURE_FLAGS } from "@shared/featureFlags";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateContactDialog } from "@/components/CreateContactDialog";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2, MessageSquare, Send, User, Users, Phone, AlertCircle, AlertTriangle, ArrowLeft, PhoneCall, Paperclip, Image, FileAudio, FileText, Link2, X, Plus, UserPlus, ExternalLink, Search, Trash2, Clock, Bot, Check, Pencil, RotateCcw, XCircle, Info, Mail, PhoneIncoming, PhoneOutgoing, PhoneMissed, Play, Voicemail, Calendar as CalendarIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link, useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Contact, Communication, Document, Project, ScheduledMessage, ProjectRecipient } from "@shared/schema";
import { setActiveMessageThread } from "@/lib/realtime";
import { AutomationPausedBanner } from "@/components/AutomationPausedBanner";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { cn, formatPhoneDisplay } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useNotificationContext } from "@/hooks/use-notification-context";
import { useMobileHeaderOverride, useMobileNavVisibility } from "@/components/layout/Sidebar";
import { useContacts } from "@/hooks/use-contacts";
import { useSubscription } from "@/hooks/use-subscription";
import { MessageMediaCarousel, buildMediaItems } from "@/components/MessageMediaCarousel";
import { TeamChat as TeamChatComponent } from "@/components/TeamChat";

const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
const URL_TEST = /^https?:\/\//i;

function parseUtcTimestamp(ts: string | Date | undefined | null): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
  const s = typeof ts === 'string' ? ts : String(ts);
  const d = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s) ? new Date(s) : new Date(s + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

function isOwnDomain(url: string): boolean {
  try {
    const parsed = new URL(url);
    const appHost = window.location.host.replace(/:\d+$/, '');
    const urlHost = parsed.host.replace(/:\d+$/, '');
    return urlHost === appHost || urlHost.endsWith('fusephone.com');
  } catch { return false; }
}

function extractDocInfo(url: string): { type: 'token'; token: string } | { type: 'slug'; docId: string } | null {
  if (!isOwnDomain(url)) return null;
  try {
    const path = new URL(url).pathname;
    const portalMatch = path.match(/\/portal\/document\/([a-zA-Z0-9_-]+)/);
    if (portalMatch) return { type: 'token', token: portalMatch[1] };
    const slugMatch = path.match(/\/[a-zA-Z0-9_-]+\/(proposal|estimate|invoice|change-order)\/(\d+)/);
    if (slugMatch) return { type: 'slug', docId: slugMatch[2] };
  } catch {}
  return null;
}

type UnknownConversation = {
  phoneNumber: string;
  lastMessage: string;
  lastTimestamp: string;
  unreadCount: number;
};

type ConversationContact = Contact & {
  last_message_time?: string;
  last_message?: string;
  last_message_direction?: string;
  last_message_type?: string;
  unread_count?: number;
};

type ProjectConversation = {
  project_id: number;
  project_name: string;
  recipients: Array<{ contactId: number; name: string; phone: string; role: string | null }>;
  last_message_time: string | null;
  last_message: string | null;
  last_message_direction: string | null;
  last_sender_name: string | null;
  unread_count: number;
};

// GroupMember type retained as deprecated alias to keep any external imports compiling — feature retired.
type GroupMember = { id: number; contactId: number | null; phoneNumber: string | null; name: string };

type ConversationTarget = 
  | { type: 'contact'; contact: Contact }
  | { type: 'phone'; phoneNumber: string }
  | { type: 'project'; projectId: number; projectName: string; recipients: Array<{ contactId: number; name: string; phone: string; role: string | null }> };
// 'group' variant removed — message_groups feature retired in favor of 1-on-1 contact threads.

// Minimal placeholder Contact used when a notification/URL gives us only an id.
// The thread query is keyed by contact id alone, so this lets the right
// conversation start loading on the very first paint while we wait for the
// full contact record to arrive from the conversation list or /api/contacts/:id.
function makeStubContact(id: number): Contact {
  return {
    id,
    userId: '',
    name: '',
    email: '',
    phone: '',
    address: null,
    city: null,
    state: null,
    zipCode: null,
    type: 'contact',
    status: 'new',
    leadSource: null,
    notes: null,
    metadata: null,
    pauseAutomations: false,
    archived: false,
    archivedAt: null,
    unsubscribedAt: null,
    createdAt: null,
    updatedAt: null,
  } as Contact;
}

function getDraftKey(target: ConversationTarget): string {
  if (target.type === 'contact') return `msg-draft-c-${target.contact.id}`;
  if (target.type === 'phone') return `msg-draft-p-${target.phoneNumber}`;
  return `msg-draft-proj-${target.projectId}`;
}

function saveDraft(target: ConversationTarget, text: string) {
  const key = getDraftKey(target);
  if (text.trim()) {
    sessionStorage.setItem(key, text);
  } else {
    sessionStorage.removeItem(key);
  }
}

function loadDraft(target: ConversationTarget): string {
  return sessionStorage.getItem(getDraftKey(target)) || '';
}

type MessageGroupData = {
  id: number;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  members: GroupMember[];
};

type ConversationItem = 
  | { kind: 'contact'; contact: ConversationContact; timestamp: number }
  | { kind: 'unknown'; conv: UnknownConversation; timestamp: number }
  | { kind: 'project'; conv: ProjectConversation; timestamp: number };

function ConversationList({
  contacts,
  unknownConversations,
  projectConversations,
  searchQuery,
  setSearchQuery,
  selected,
  onSelect,
  onNewMessage,
  onDeleteConversation,
  swipedItem,
  setSwipedItem,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  markAsRead,
}: {
  contacts: ConversationContact[];
  unknownConversations: UnknownConversation[];
  projectConversations: ProjectConversation[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selected: ConversationTarget | null;
  onSelect: (t: ConversationTarget) => void;
  onNewMessage: () => void;
  onDeleteConversation: (t: ConversationTarget) => void;
  swipedItem: string | null;
  setSwipedItem: (id: string | null) => void;
  onTouchStart: (e: React.TouchEvent, id: string) => void;
  onTouchMove: (e: React.TouchEvent, id: string) => void;
  onTouchEnd: () => void;
  markAsRead: (data: { contactId?: number; phoneNumber?: string }) => void;
}) {
  const { maskName, maskPhone, maskEmail, maskText } = useDemoMode();
  const projectContactIds = useMemo(() => {
    const ids = new Set<number>();
    projectConversations.forEach(pc => {
      const recips = Array.isArray(pc.recipients) ? pc.recipients : [];
      recips.forEach(r => ids.add(r.contactId));
    });
    return ids;
  }, [projectConversations]);

  const filteredContacts = useMemo(() => contacts.filter(c =>
    !projectContactIds.has(c.id) &&
    (c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery))
  ), [contacts, searchQuery, projectContactIds]);

  const filteredUnknown = useMemo(() => unknownConversations.filter(u =>
    u.phoneNumber.includes(searchQuery)
  ), [unknownConversations, searchQuery]);

  const filteredProjects = useMemo(() => projectConversations.filter(pc => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const recips = Array.isArray(pc.recipients) ? pc.recipients : [];
    return pc.project_name.toLowerCase().includes(q) ||
      recips.some(r => r.name.toLowerCase().includes(q) || (r.phone && r.phone.includes(searchQuery)));
  }), [projectConversations, searchQuery]);

  // filteredGroups removed — message_groups feature retired.

  const formatConversationTime = useCallback((timestamp: string | undefined) => {
    const date = parseUtcTimestamp(timestamp);
    if (!date) return '';
    if (isToday(date)) return format(date, 'h:mm a');
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'M/d/yy');
  }, []);

  const combinedItems: ConversationItem[] = useMemo(() => [
    ...filteredContacts.map(c => ({
      kind: 'contact' as const,
      contact: c,
      timestamp: parseUtcTimestamp(c.last_message_time)?.getTime() || 0,
    })),
    ...filteredUnknown.map(u => ({
      kind: 'unknown' as const,
      conv: u,
      timestamp: parseUtcTimestamp(u.lastTimestamp)?.getTime() || 0,
    })),
    ...filteredProjects.map(pc => ({
      kind: 'project' as const,
      conv: pc,
      timestamp: parseUtcTimestamp(pc.last_message_time)?.getTime() || 0,
    })),
  ].sort((a, b) => b.timestamp - a.timestamp), [filteredContacts, filteredUnknown, filteredProjects]);

  const ITEM_HEIGHT = 73;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef<number>(0);
  const savedTargetKeyRef = useRef<string | null>(null);
  const prevSelectedRef = useRef<ConversationTarget | null>(selected);

  const getItemKey = useCallback((item: ConversationItem): string => {
    if (item.kind === 'contact') return `contact-${item.contact.id}`;
    if (item.kind === 'unknown') return `phone-${(item as any).conv.phoneNumber}`;
    return `project-${(item as any).conv.project_id}`;
  }, []);

  const targetToKey = useCallback((t: ConversationTarget): string | null => {
    if (!t) return null;
    if (t.type === 'contact') return `contact-${t.contact.id}`;
    if (t.type === 'phone') return `phone-${t.phoneNumber}`;
    if (t.type === 'project') return `project-${t.projectId}`;
    return null;
  }, []);

  const virtualizer = useVirtualizer({
    count: combinedItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  useLayoutEffect(() => {
    const wasSelected = prevSelectedRef.current != null;
    const isNowDeselected = selected == null;
    if (wasSelected && isNowDeselected) {
      const restore = () => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const key = savedTargetKeyRef.current;
        if (key) {
          const idx = combinedItems.findIndex((it) => getItemKey(it) === key);
          if (idx >= 0) {
            virtualizer.scrollToIndex(idx, { align: 'start' });
            return;
          }
        }
        container.scrollTop = savedScrollRef.current;
      };
      restore();
      requestAnimationFrame(restore);
    }
    prevSelectedRef.current = selected;
  }, [selected, combinedItems, getItemKey, virtualizer]);

  const handleSelect = useCallback((target: ConversationTarget) => {
    if (scrollContainerRef.current) {
      savedScrollRef.current = scrollContainerRef.current.scrollTop;
    }
    savedTargetKeyRef.current = targetToKey(target);
    onSelect(target);
  }, [onSelect, targetToKey]);

  const renderItem = (item: ConversationItem) => {
    if (item.kind === 'contact') {
      const contact = item.contact;
      const itemId = `contact-${contact.id}`;
      const isSwiped = swipedItem === itemId;
      return (
        <div className="relative overflow-hidden border-b">
          <div
            className={cn(
              "absolute inset-y-0 right-0 flex items-center bg-destructive transition-all duration-200",
              isSwiped ? "w-20 opacity-100" : "w-0 opacity-0"
            )}
            data-swipe-action
          >
            <button
              className="w-full h-full flex items-center justify-center text-destructive-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteConversation({ type: 'contact', contact });
              }}
              data-testid={`button-delete-conversation-${contact.id}`}
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={() => {
              if (isSwiped) { setSwipedItem(null); return; }
              handleSelect({ type: 'contact', contact });
              markAsRead({ contactId: contact.id });
            }}
            onTouchStart={(e) => onTouchStart(e, itemId)}
            onTouchMove={(e) => onTouchMove(e, itemId)}
            onTouchEnd={onTouchEnd}
            className={cn(
              "w-full p-4 text-left transition-all duration-200 group relative",
              selected?.type === 'contact' && selected.contact.id === contact.id
                ? "bg-primary/10"
                : "hover-elevate",
              isSwiped && "translate-x-[-5rem]"
            )}
            data-testid={`contact-${contact.id}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className={cn("font-medium truncate", contact.unread_count ? "font-semibold" : "")}>
                      {(contact as any).project_recipient_names 
                        ? `${maskName(contact.name).split(' ')[0]} & ${maskName((contact as any).project_recipient_names).split(' ')[0]}`
                        : maskName(contact.name)}
                    </p>
                    {(contact as any).recipient_of_project_id && (
                      <span className="text-[10px] bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium">
                        In group
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground flex-shrink-0">
                    {formatConversationTime(contact.last_message_time)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className={cn(
                    "text-sm truncate",
                    contact.unread_count ? "text-foreground font-medium" : "text-muted-foreground"
                  )}>
                    {contact.last_message
                      ? (contact.last_message_direction === 'outbound' ? 'You: ' : '') + (contact.last_message_type === 'email' ? '✉ ' : '') + maskText(contact.last_message)
                      : (maskPhone(contact.phone) || maskEmail(contact.email) || '')}
                  </p>
                  {(contact.unread_count ?? 0) > 0 && (
                    <span className="min-w-[20px] h-[20px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold px-1 flex-shrink-0">
                      {contact.unread_count! > 99 ? '99+' : contact.unread_count}
                    </span>
                  )}
                </div>
              </div>
              <button
                className="p-2 rounded-full text-destructive invisible lg:group-hover:visible opacity-0 lg:group-hover:opacity-100 transition-opacity flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteConversation({ type: 'contact', contact });
                }}
                data-testid={`button-delete-conv-desktop-${contact.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </button>
        </div>
      );
    } else if (item.kind === 'project') {
      const conv = item.conv;
      const convRecips = Array.isArray(conv.recipients) ? conv.recipients : [];
      const primaryName = convRecips[0]?.name || conv.project_name;
      const extraCount = convRecips.length - 1;
      const displayLabel = extraCount > 0 ? `${primaryName} +${extraCount}` : primaryName;
      const lastMsgPrefix = conv.last_message_direction === 'outbound' 
        ? 'You: ' 
        : conv.last_sender_name 
          ? `${conv.last_sender_name.split(' ')[0]}: ` 
          : '';
      return (
        <div className="border-b">
          <button
            onClick={() => {
              handleSelect({ type: 'project', projectId: conv.project_id, projectName: conv.project_name, recipients: convRecips });
              convRecips.forEach(r => markAsRead({ contactId: r.contactId }));
            }}
            className={cn(
              "w-full p-4 text-left transition-all duration-200 group relative",
              selected?.type === 'project' && selected.projectId === conv.project_id
                ? "bg-primary/10"
                : "hover-elevate"
            )}
            data-testid={`project-conv-${conv.project_id}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 relative">
                <User className="w-5 h-5 text-primary" />
                {extraCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-0.5">
                    +{extraCount}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("font-medium truncate", conv.unread_count > 0 ? "font-semibold" : "")}>{displayLabel}</p>
                  <span className="text-[11px] text-muted-foreground flex-shrink-0">
                    {formatConversationTime(conv.last_message_time || undefined)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className={cn(
                    "text-sm truncate",
                    conv.unread_count > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                  )}>
                    {conv.last_message ? lastMsgPrefix + conv.last_message : conv.project_name}
                  </p>
                  {conv.unread_count > 0 && (
                    <span className="min-w-[20px] h-[20px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold px-1 flex-shrink-0">
                      {conv.unread_count > 99 ? '99+' : conv.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        </div>
      );
    } else {
      const conv = item.conv as UnknownConversation;
      const itemId = `phone-${conv.phoneNumber}`;
      const isSwiped = swipedItem === itemId;
      return (
        <div className="relative overflow-hidden border-b">
          <div
            className={cn(
              "absolute inset-y-0 right-0 flex items-center bg-destructive transition-all duration-200",
              isSwiped ? "w-20 opacity-100" : "w-0 opacity-0"
            )}
            data-swipe-action
          >
            <button
              className="w-full h-full flex items-center justify-center text-destructive-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteConversation({ type: 'phone', phoneNumber: conv.phoneNumber });
              }}
              data-testid={`button-delete-conversation-phone-${conv.phoneNumber}`}
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={() => {
              if (isSwiped) { setSwipedItem(null); return; }
              handleSelect({ type: 'phone', phoneNumber: conv.phoneNumber });
              markAsRead({ phoneNumber: conv.phoneNumber });
            }}
            onTouchStart={(e) => onTouchStart(e, itemId)}
            onTouchMove={(e) => onTouchMove(e, itemId)}
            onTouchEnd={onTouchEnd}
            className={cn(
              "w-full p-4 text-left transition-all duration-200 group relative",
              selected?.type === 'phone' && selected.phoneNumber === conv.phoneNumber
                ? "bg-primary/10"
                : "hover-elevate",
              isSwiped && "translate-x-[-5rem]"
            )}
            data-testid={`unknown-${conv.phoneNumber}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Phone className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("font-medium truncate", conv.unreadCount > 0 ? "font-semibold" : "")}>{maskPhone(conv.phoneNumber)}</p>
                  <span className="text-[11px] text-muted-foreground flex-shrink-0">
                    {formatConversationTime(conv.lastTimestamp)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className={cn(
                    "text-sm truncate",
                    conv.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                  )}>
                    {maskText(conv.lastMessage)}
                  </p>
                  {conv.unreadCount > 0 && (
                    <span className="min-w-[20px] h-[20px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold px-1 flex-shrink-0">
                      {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
              <button
                className="p-2 rounded-full text-destructive invisible lg:group-hover:visible opacity-0 lg:group-hover:opacity-100 transition-opacity flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteConversation({ type: 'phone', phoneNumber: conv.phoneNumber });
                }}
                data-testid={`button-delete-conv-desktop-phone-${conv.phoneNumber}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </button>
        </div>
      );
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Conversations</h2>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={onNewMessage}
              data-testid="button-new-message"
            >
              <Plus className="w-4 h-4 mr-1" />
              New
            </Button>
          </div>
        </div>
        <Input
          placeholder="Search contacts or numbers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-testid="input-search-contacts"
        />
      </div>
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {combinedItems.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No conversations found</p>
        ) : (
          <div
            style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map(virtualRow => {
              const item = combinedItems[virtualRow.index];
              const itemKey = item.kind === 'contact' ? `contact-${item.contact.id}` :
                item.kind === 'project' ? `project-${(item.conv as ProjectConversation).project_id}` :
                `phone-${(item.conv as UnknownConversation).phoneNumber}`;
              return (
                <div
                  key={itemKey}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                >
                  {renderItem(item)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function getCallStatus(content: string | null): { label: string; isMissed: boolean; isVoicemail: boolean } {
  if (!content) return { label: 'Call', isMissed: false, isVoicemail: false };
  const c = content.toLowerCase();
  if (c.includes('voicemail')) return { label: 'Voicemail', isMissed: false, isVoicemail: true };
  if (c.includes('missed') || c.includes('no-answer') || c.includes('no answer')) return { label: 'Missed Call', isMissed: true, isVoicemail: false };
  if (c.includes('busy')) return { label: 'Busy', isMissed: true, isVoicemail: false };
  if (c.includes('cancelled') || c.includes('canceled')) return { label: 'Cancelled', isMissed: true, isVoicemail: false };
  if (c.includes('completed') || c.includes('answered')) return { label: 'Call', isMissed: false, isVoicemail: false };
  return { label: 'Call', isMissed: false, isVoicemail: false };
}

const CallEventInline = memo(function CallEventInline({ msg }: { msg: Communication }) {
  const { label, isMissed, isVoicemail } = getCallStatus(msg.content);
  const isInbound = msg.direction === 'inbound';
  const hasRecording = !!(msg.mediaUrl && msg.mediaType === 'audio');
  const [showPlayer, setShowPlayer] = useState(false);

  const Icon = isVoicemail ? Voicemail : isMissed ? PhoneMissed : isInbound ? PhoneIncoming : PhoneOutgoing;
  const iconColor = isMissed ? 'text-red-500' : isInbound ? 'text-green-500' : 'text-blue-500';
  const bgColor = isMissed ? 'bg-red-500/10 border-red-500/20' : 'bg-muted/50 border-border';

  return (
    <div className="flex justify-center my-1" data-testid={`call-event-${msg.id}`}>
      <div className={cn("flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl border text-xs", bgColor)}>
        <div className="flex items-center gap-2">
          <Icon className={cn("w-3.5 h-3.5", iconColor)} />
          <span className="font-medium text-foreground">
            {isInbound ? 'Inbound' : 'Outbound'} {label}
          </span>
          <span className="text-muted-foreground">
            {(() => { const d = parseUtcTimestamp(msg.timestamp); return d ? format(d, 'MMM d, h:mm a') : ''; })()}
          </span>
        </div>
        {hasRecording && (
          <div className="w-full">
            {showPlayer ? (
              <audio
                controls
                src={msg.mediaUrl!}
                className="w-full h-8"
                controlsList="nodownload"
                preload="none"
              />
            ) : (
              <button
                onClick={() => setShowPlayer(true)}
                className="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors text-[11px] font-medium"
                data-testid={`button-play-recording-${msg.id}`}
              >
                <Play className="w-3 h-3" />
                {isVoicemail ? 'Play Voicemail' : 'Play Recording'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

const MessageBubble = memo(function MessageBubble({
  msg,
  isProjectSelected,
  isContactSelected,
  renderLinkedContent,
  renderMedia,
  onRetry,
}: {
  msg: Communication;
  isProjectSelected: boolean;
  isContactSelected: boolean;
  renderLinkedContent: (content: string, isOutbound: boolean) => any;
  renderMedia: (msg: Communication) => any;
  onRetry?: (msg: Communication) => void;
}) {
  const [, threadNavigate] = useLocation();
  const msgSenderName = isProjectSelected && msg.direction === 'inbound' ? (msg as any).senderName : null;
  const recipientSenderName = (isContactSelected && msg.direction === 'inbound' && (msg as any).senderName) ? (msg as any).senderName : null;

  return (
    <div
      className={cn(
        "max-w-[80%] rounded-2xl px-4 py-2",
        msg.direction === 'outbound'
          ? (msg as any)._failed
            ? "ml-auto bg-red-900/80 text-red-100 rounded-br-sm border border-red-500/30"
            : "ml-auto bg-primary text-primary-foreground rounded-br-sm"
          : "mr-auto bg-card border rounded-bl-sm"
      )}
      data-testid={`message-${msg.id}`}
    >
      {msgSenderName && (
        <p className="text-xs font-semibold text-primary mb-0.5">{msgSenderName}</p>
      )}
      {recipientSenderName && (
        <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 mb-0.5">{recipientSenderName}</p>
      )}
      {msg.content && msg.direction === 'inbound' && msg.content.startsWith('📋 New Booking Request') ? (
        <div className="-mx-3 -my-2 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md">
          <div className="px-3 py-2.5 bg-slate-900 dark:bg-slate-950 text-white flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-md shrink-0">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 leading-tight">New Booking Request</p>
              <p className="text-sm font-semibold leading-tight truncate">
                {(() => {
                  const first = msg.content.split('\n')[0] || '';
                  const m = first.match(/from\s+(.+)$/i);
                  return m ? m[1] : 'New customer';
                })()}
              </p>
            </div>
          </div>
          <div className="px-3 py-2.5 space-y-1">
            {msg.content.split('\n').slice(1).map((line, i) => {
              if (!line.trim()) return null;
              if (line.startsWith('📎')) return <p key={i} className="text-xs text-slate-500 dark:text-slate-400 italic">{line}</p>;
              const colonIdx = line.indexOf(':');
              if (colonIdx > 0 && colonIdx < 20) {
                const labelRaw = line.slice(0, colonIdx).toLowerCase();
                const labelClass =
                  /phone|email|address|contact|name/.test(labelRaw)
                    ? "font-semibold text-cyan-700 dark:text-cyan-300"
                    : /note|description|details|message|project/.test(labelRaw)
                    ? "font-semibold text-amber-700 dark:text-amber-300"
                    : /date|time|when|requested|alternate|prefer/.test(labelRaw)
                    ? "font-semibold text-violet-700 dark:text-violet-300"
                    : "font-semibold text-emerald-700 dark:text-emerald-300";
                return (
                  <p key={i} className="text-xs leading-relaxed">
                    <span className={labelClass}>{line.slice(0, colonIdx + 1)}</span>
                    <span className="text-foreground/85">{line.slice(colonIdx + 1)}</span>
                  </p>
                );
              }
              return <p key={i} className="text-sm text-foreground/90">{line}</p>;
            })}
            <button
              onClick={() => {
                const bookingId = (msg as any).bookingRequestId;
                threadNavigate(bookingId ? `/calendar?bookingId=${bookingId}` : '/calendar');
              }}
              className="mt-2.5 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
              data-testid="button-view-booking-request"
            >
              <CalendarIcon className="w-4 h-4" />
              View & Schedule Appointment
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </button>
          </div>
        </div>
      ) : msg.content && msg.type === 'email' && msg.content.startsWith('Subject: ') ? (
        (() => {
          const newlineIdx = msg.content.indexOf('\n');
          const subject = newlineIdx > 0 ? msg.content.slice(9, newlineIdx) : msg.content.slice(9);
          const body = newlineIdx > 0 ? msg.content.slice(newlineIdx + 1) : '';
          return (
            <div className="space-y-1">
              <p className={cn("text-[11px] font-semibold", msg.direction === 'outbound' ? "text-primary-foreground/80" : "text-muted-foreground")}>{subject}</p>
              {body && (
                <p className="text-sm whitespace-pre-wrap break-words">
                  {renderLinkedContent(body, msg.direction === 'outbound')}
                </p>
              )}
            </div>
          );
        })()
      ) : msg.content ? (
        <p className="text-sm whitespace-pre-wrap break-words">
          {renderLinkedContent(msg.content, msg.direction === 'outbound')}
        </p>
      ) : null}
      {renderMedia(msg)}
      {msg.type === 'email' && (
        <div className={cn(
          "flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-lg text-[11px] font-medium w-fit",
          msg.direction === 'outbound'
            ? "bg-blue-400/20 text-blue-100"
            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
        )}>
          <Mail className="w-3 h-3" />
          <span>Sent via Email</span>
        </div>
      )}
      {(msg as any)._failed && onRetry && (
        <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-red-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-red-300 flex-shrink-0" />
          <span className="text-[11px] text-red-200 flex-1">
            {(msg as any)._errorMessage || 'Failed to send — check your Twilio account balance or credentials'}
          </span>
          <button
            onClick={() => onRetry(msg)}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-100 text-[11px] font-medium transition-colors flex-shrink-0"
            data-testid="button-retry-message"
          >
            <RotateCcw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}
      <p className={cn(
        "text-xs mt-1 flex items-center gap-1",
        msg.direction === 'outbound'
          ? (msg as any)._failed ? "text-red-300/70 justify-end" : "text-primary-foreground/70 justify-end"
          : "text-muted-foreground"
      )}>
        <span>
          {(() => { const d = parseUtcTimestamp(msg.timestamp); return d ? format(d, 'MMM d, h:mm a') : ''; })()}
          {isProjectSelected && msg.direction === 'outbound' && (msg as any).recipientName && (
            <span className="ml-1">to {(msg as any).recipientName}</span>
          )}
        </span>
        {msg.direction === 'outbound' && (
          (msg as any)._optimistic
            ? <Clock className="w-3 h-3 opacity-70" />
            : (msg as any)._failed
              ? <AlertCircle className="w-3 h-3 text-red-300" />
              : <Check className="w-3 h-3 opacity-70" />
        )}
      </p>
    </div>
  );
});

function MessageThread({
  selected,
  onBack,
  smsMessages,
  commsLoading,
  contactProject,
  contactProjectRecipients = [],
  contactProjectId,
  onAddRecipient,
  onAddParticipant,
  onRemoveRecipient,
  isCalling,
  onCallClick,
  onCreateContact,
  renderLinkedContent,
  renderMedia,
  canCall = true,
  scheduledMessages = [],
  onEditScheduled,
  onCancelScheduled,
  projectWarningName,
  onRetryMessage,
}: {
  selected: ConversationTarget;
  onBack: () => void;
  smsMessages: Communication[];
  commsLoading: boolean;
  contactProject?: Project;
  contactProjectRecipients?: ProjectRecipient[];
  contactProjectId?: number;
  onAddRecipient?: () => void;
  onAddParticipant?: () => void;
  onRemoveRecipient?: (recipientId: number, recipientName: string) => void;
  isCalling: boolean;
  onCallClick: () => void;
  onCreateContact: () => void;
  renderLinkedContent: (content: string, isOutbound: boolean) => any;
  renderMedia: (msg: Communication) => any;
  canCall?: boolean;
  scheduledMessages?: ScheduledMessage[];
  onEditScheduled?: (msg: ScheduledMessage) => void;
  onCancelScheduled?: (id: number) => void;
  projectWarningName?: string | null;
  onRetryMessage?: (msg: Communication) => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const [, threadNavigate] = useLocation();
  const [showRecipientsList, setShowRecipientsList] = useState(false);
  const [showGroupMembersExpanded, setShowGroupMembersExpanded] = useState(false);
  const prevSelectedRef = useRef(selected);
  useEffect(() => {
    if (prevSelectedRef.current !== selected) {
      setShowGroupMembersExpanded(false);
      prevSelectedRef.current = selected;
    }
  }, [selected]);

  const { maskName, maskPhone, maskEmail } = useDemoMode();
  const isContactSelected = selected.type === 'contact';
  const isPhoneSelected = selected.type === 'phone';
  const isProjectSelected = selected.type === 'project';
  const otherRecipients = contactProjectRecipients.filter(r => r.contactId !== (isContactSelected ? selected.contact.id : -1));
  const displayName = selected.type === 'contact' 
    ? (otherRecipients.length > 0 
        ? `${maskName(selected.contact.name).split(' ')[0]} & ${otherRecipients.map(r => maskName(r.name).split(' ')[0]).join(', ')}`
        : maskName(selected.contact.name))
    : selected.type === 'project' ? selected.projectName 
    : maskPhone(selected.phoneNumber);
  const displayPhone = selected.type === 'contact' 
    ? (otherRecipients.length > 0 ? maskName(selected.contact.name) : (maskPhone(selected.contact.phone) || maskEmail(selected.contact.email) || ''))
    : selected.type === 'project' ? `${selected.recipients.length} recipients` 
    : maskPhone(selected.phoneNumber);
  const isEmailOnly = selected.type === 'contact' && !selected.contact.phone && !!selected.contact.email;
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, []);

  // ============================================================
  // LOCKED — Task #37 (Lock down inbound messaging once and for all)
  // Auto-scrolls to the most recent message every time the user
  // opens a thread (keyed by contact id / phone / projectId, not by
  // smsMessages.length, so switching between two equal-length
  // threads still scrolls). When new messages arrive on an already-
  // open thread, we only scroll if the user is already near the
  // bottom — preserving manual scroll-back. Do NOT modify without
  // explicit user approval. See `.local/tasks/messages-realtime-final.md`.
  // ============================================================
  const threadKey =
    selected.type === 'contact' ? `c:${selected.contact?.id ?? ''}` :
    selected.type === 'phone' ? `p:${selected.phoneNumber ?? ''}` :
    selected.type === 'project' ? `pr:${selected.projectId}` :
    '';

  const hasInitiallyScrolled = useRef(false);
  const userScrolledUpRef = useRef(false);

  // Reset on thread change. Declared BEFORE the scroll effect so it runs
  // first when threadKey flips, ensuring the next render lands at bottom.
  useEffect(() => {
    hasInitiallyScrolled.current = false;
    userScrolledUpRef.current = false;
  }, [threadKey]);

  // Track whether the user has manually scrolled away from the bottom.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handler = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledUpRef.current = distFromBottom > 100;
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [threadKey]);

  useEffect(() => {
    if (smsMessages.length === 0) return;
    if (!hasInitiallyScrolled.current) {
      hasInitiallyScrolled.current = true;
      userScrolledUpRef.current = false;
      requestAnimationFrame(() => {
        scrollToBottom('auto');
        setTimeout(() => scrollToBottom('auto'), 50);
        setTimeout(() => scrollToBottom('auto'), 200);
      });
    } else if (!userScrolledUpRef.current) {
      // Only auto-scroll on new messages if the user hasn't scrolled up.
      scrollToBottom('instant');
    }
  }, [smsMessages.length, scrollToBottom, threadKey]);

  // Re-pin to bottom when content height grows (e.g., MMS images / media
  // finish loading after the initial scroll completed). Without this, late-
  // loading photos in the customer's most recent inbound bubbles push those
  // bubbles below the fold, leaving an earlier outbound text visible at the
  // bottom of the viewport. Only re-pins if the user hasn't manually
  // scrolled up — preserves the locked scroll-back behavior above.
  // The scroll call is deferred to the next frame and gated on actual
  // height growth to avoid "ResizeObserver loop completed with undelivered
  // notifications" warnings caused by mutating layout inside the callback.
  useEffect(() => {
    const contentEl = messagesContentRef.current;
    if (!contentEl || typeof ResizeObserver === 'undefined') return;
    let lastHeight = contentEl.offsetHeight;
    let rafId = 0;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const newHeight = (entry.borderBoxSize?.[0]?.blockSize) ?? entry.contentRect.height;
      if (newHeight <= lastHeight) {
        lastHeight = newHeight;
        return;
      }
      lastHeight = newHeight;
      if (userScrolledUpRef.current) return;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (!userScrolledUpRef.current) {
          scrollToBottom('instant');
        }
      });
    });
    observer.observe(contentEl);
    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [threadKey, scrollToBottom]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let prevH = vv.height;
    const update = () => {
      if (vv.height < prevH && scrollContainerRef.current) {
        requestAnimationFrame(() => scrollToBottom('instant'));
      }
      prevH = vv.height;
    };
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, [scrollToBottom]);

  useEffect(() => {
    const handleKeyboardResize = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToBottom('instant'));
      });
    };
    window.addEventListener('keyboard-did-resize', handleKeyboardResize);
    return () => window.removeEventListener('keyboard-did-resize', handleKeyboardResize);
  }, [scrollToBottom]);

  useEffect(() => {
    const onFocus = () => {
      if (scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
        if (isNearBottom) {
          requestAnimationFrame(() => scrollToBottom('instant'));
        }
      }
    };
    window.addEventListener('focusin', onFocus);
    return () => window.removeEventListener('focusin', onFocus);
  }, [scrollToBottom]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (document.activeElement instanceof HTMLElement) {
        const target = e.target as HTMLElement;
        const deltaY = (e.changedTouches[0]?.clientY ?? touchStartY) - touchStartY;
        const isTap = Math.abs(deltaY) < 10;
        if (isTap && !target.closest('textarea, input, button, a, [role="button"]')) {
          document.activeElement.blur();
        }
      }
    };
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  return (
    <>
      <div className="hidden lg:flex px-3 py-2 bg-background/95 backdrop-blur-md border-b items-center justify-between gap-2 flex-shrink-0">
        {isProjectSelected ? (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 relative">
              <User className="w-4 h-4 text-primary" />
              {selected.recipients.length > 1 && (
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                  {selected.recipients.length}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-medium truncate text-sm">{selected.recipients.map(r => maskName(r.name).split(' ')[0]).join(' & ')}</h3>
              <p className="text-xs text-muted-foreground truncate">
                {selected.recipients.length === 1 
                  ? maskPhone(selected.recipients[0]?.phone) || selected.projectName
                  : selected.projectName}
              </p>
            </div>
          </div>
        ) : canCall ? (
          <button
            className="flex items-center gap-2 min-w-0 flex-1 text-left"
            onClick={onCallClick}
            disabled={isCalling}
            data-testid="button-call-desktop"
          >
            {isCalling ? (
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
            ) : (
              <Phone className="w-4 h-4 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <h3 className="font-medium truncate text-sm">{displayName}</h3>
              {isContactSelected && (
                <p className="text-xs text-muted-foreground truncate">{displayPhone}</p>
              )}
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="min-w-0">
              <h3 className="font-medium truncate text-sm">{displayName}</h3>
              {isContactSelected && (
                <p className="text-xs text-muted-foreground truncate">{displayPhone}</p>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isPhoneSelected && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCreateContact}
              data-testid="button-create-contact-desktop"
            >
              <UserPlus className="w-5 h-5" />
            </Button>
          )}
          {isContactSelected && (onAddParticipant || otherRecipients.length > 0) && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onAddParticipant || (() => setShowGroupMembersExpanded(true))}
              title={otherRecipients.length > 0 ? "Manage recipients" : "Add person to conversation"}
              data-testid="button-add-participant-desktop"
            >
              <Users className="w-5 h-5" />
            </Button>
          )}
          {isContactSelected && (
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-view-contact-desktop"
              onClick={() => threadNavigate(`/contacts/${selected.contact.id}`)}
            >
              <User className="w-5 h-5" />
            </Button>
          )}
          {isProjectSelected && (
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-view-project-desktop"
              onClick={() => threadNavigate(`/projects/${(selected as any).projectId}`)}
            >
              <User className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      {contactProject && contactProject.automationPausedReason && contactProject.automationPausedAt && contactProject.automationPausedCategory && contactProject.automationPausedStep && (
        <div className="px-3 pt-2 flex-shrink-0">
          <AutomationPausedBanner
            projectId={contactProject.id}
            reason={contactProject.automationPausedReason}
            pausedAt={String(contactProject.automationPausedAt)}
            category={contactProject.automationPausedCategory}
            step={contactProject.automationPausedStep}
            compact
          />
        </div>
      )}

      {isContactSelected && otherRecipients.length > 0 && showGroupMembersExpanded && (
        <Dialog open={showGroupMembersExpanded} onOpenChange={setShowGroupMembersExpanded}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{displayName}</DialogTitle>
              <DialogDescription>
                Messages are sent to everyone in this conversation
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <div className="flex items-center justify-between py-2 px-2 rounded-md">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{maskName(selected.contact.name)}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {isEmailOnly && <Mail className="w-3 h-3 text-blue-500" />}
                      {maskPhone(selected.contact.phone) || maskEmail(selected.contact.email)}
                    </p>
                  </div>
                </div>
              </div>
              {otherRecipients.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{maskName(r.name)}</p>
                      <p className="text-xs text-muted-foreground">{maskPhone(r.phone)}</p>
                    </div>
                  </div>
                  {onRemoveRecipient && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 text-muted-foreground hover:text-red-500"
                      onClick={() => onRemoveRecipient(r.id, maskName(r.name))}
                      data-testid={`button-remove-recipient-${r.id}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Group member dialog and "in group conversation" warning removed — message_groups feature retired. */}

      {isProjectSelected && projectWarningName && (
        <div className="bg-violet-50 dark:bg-violet-950/30 border-b border-violet-200 dark:border-violet-800 px-4 py-2 flex items-center gap-2 text-sm text-violet-700 dark:text-violet-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Sending a message to {projectWarningName} here will start a separate one-on-one conversation.</span>
        </div>
      )}

      <div ref={scrollContainerRef} data-scroll-container className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 bg-muted/30" style={{ WebkitOverflowScrolling: 'touch' }} onClick={() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }}>
        {commsLoading && smsMessages.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : smsMessages.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            {isEmailOnly ? (
              <>
                <Mail className="w-8 h-8 mx-auto text-blue-400 mb-2" />
                <p className="text-muted-foreground">No emails sent yet to {maskName(selected.contact.name)}</p>
                <p className="text-xs text-muted-foreground/70">Messages you send here will be delivered via email. Replies won't appear in this thread.</p>
              </>
            ) : (
              <p className="text-muted-foreground">
                No messages yet. Start a conversation{isContactSelected ? ` with ${maskName(selected.contact.name)}` : ''}
              </p>
            )}
          </div>
        ) : (
          <>
          <div ref={messagesContentRef} className="space-y-3 flex flex-col justify-end" style={{ minHeight: '100%' }}>
            {smsMessages.map((msg) => (
              msg.type === 'call' ? (
                <CallEventInline key={msg.id} msg={msg} />
              ) : (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isProjectSelected={isProjectSelected}
                  isContactSelected={isContactSelected}
                  renderLinkedContent={renderLinkedContent}
                  renderMedia={renderMedia}
                  onRetry={onRetryMessage}
                />
              )
            ))}
            {scheduledMessages.length > 0 && (
              <>
                {scheduledMessages
                  .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                  .map(sm => (
                    <div
                      key={`scheduled-${sm.id}`}
                      className="max-w-[80%] ml-auto rounded-2xl px-4 py-2 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-br-sm"
                      data-testid={`scheduled-message-${sm.id}`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words text-amber-900 dark:text-amber-100">
                        {sm.body}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-700 dark:text-amber-300">
                        <Clock className="w-3 h-3" />
                        <span>
                          Scheduled {formatDistanceToNow(parseUtcTimestamp(sm.scheduledAt) || new Date(), { addSuffix: true })}
                          {' · '}
                          {(() => { const d = parseUtcTimestamp(sm.scheduledAt); return d ? format(d, 'MMM d, h:mm a') : ''; })()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        {onEditScheduled && (
                          <button
                            onClick={() => onEditScheduled(sm)}
                            className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
                            data-testid={`button-edit-scheduled-${sm.id}`}
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                        )}
                        {onCancelScheduled && (
                          <button
                            onClick={() => onCancelScheduled(sm.id)}
                            className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
                            data-testid={`button-cancel-scheduled-${sm.id}`}
                          >
                            <XCircle className="w-3 h-3" />
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
          </>
        )}
      </div>
    </>
  );
}

function ComposeBar({
  selected,
  settings,
  contactDocuments,
  isSending,
  onSend,
  initialDraft,
  retryDraft,
  onRetryDraftConsumed,
  projectSendRecipient,
  onProjectRecipientChange,
}: {
  selected: ConversationTarget;
  settings: any;
  contactDocuments?: Document[];
  isSending: boolean;
  onSend: (text: string, mediaUrls: string[], mediaContentTypes?: string[]) => void;
  initialDraft?: string;
  retryDraft?: string;
  onRetryDraftConsumed?: () => void;
  projectSendRecipient?: { contactId: number; name: string; phone: string } | null;
  onProjectRecipientChange?: (r: { contactId: number; name: string; phone: string }) => void;
}) {
  const queryClient = useQueryClient();
  const savedDraft = loadDraft(selected);
  const [messageText, setMessageText] = useState(initialDraft || savedDraft || '');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [mediaContentTypes, setMediaContentTypes] = useState<string[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<{ url: string; type: string; name: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const { maskName } = useDemoMode();
  const [plusPopoverOpen, setPlusPopoverOpen] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composeRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const messageTextRef = useRef(messageText);
  messageTextRef.current = messageText;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  // Tracks the draft key the textarea is currently displaying. We need this
  // separate from `selectedRef` because `selectedRef.current` is updated
  // synchronously on render — by the time the switch-effect runs, it's
  // already pointing at the NEW contact. We can't ask it for the key we
  // need to save under (the old one).
  const currentDraftKeyRef = useRef<string>(getDraftKey(selected));

  const isContactSelected = selected.type === 'contact';
  const selectedContactId = selected.type === 'contact' ? selected.contact.id : undefined;

  useEffect(() => {
    if (initialDraft && !messageText) {
      setMessageText(initialDraft);
    }
  }, [initialDraft]);

  useEffect(() => {
    if (retryDraft) {
      setMessageText(retryDraft);
      onRetryDraftConsumed?.();
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [retryDraft]);

  // Switch-conversation effect: persist the OUTGOING draft under its own key,
  // then load (or clear) the textarea for the INCOMING conversation. We
  // always call setMessageText — including with '' — so a contact with no
  // saved draft gets a clean textarea instead of inheriting the previous
  // contact's text.
  useEffect(() => {
    const newKey = getDraftKey(selected);
    const prevKey = currentDraftKeyRef.current;
    if (prevKey !== newKey) {
      const outgoingText = messageTextRef.current;
      if (outgoingText.trim()) {
        sessionStorage.setItem(prevKey, outgoingText);
      } else {
        sessionStorage.removeItem(prevKey);
      }
      currentDraftKeyRef.current = newKey;
      const incomingDraft = loadDraft(selected);
      setMessageText(incomingDraft);
    }
  }, [getDraftKey(selected)]);

  // Persist on unmount (page navigation, app close) so a draft for the
  // currently-open thread isn't lost when the user backs out entirely.
  useEffect(() => {
    return () => {
      const key = currentDraftKeyRef.current;
      const text = messageTextRef.current;
      if (text.trim()) {
        sessionStorage.setItem(key, text);
      } else {
        sessionStorage.removeItem(key);
      }
    };
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, window.innerHeight * 0.5) + 'px';
    }
  }, [messageText]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const handleFocus = () => {
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        if (el) el.scrollIntoView({ block: 'end', behavior: 'instant' });
      });
    };
    el.addEventListener('focus', handleFocus);
    return () => el.removeEventListener('focus', handleFocus);
  }, []);

  const MAX_MEDIA = 6;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = MAX_MEDIA - mediaUrls.length;
    const toUpload = files.slice(0, remaining);
    if (toUpload.length === 0) {
      toast({ title: `Maximum ${MAX_MEDIA} files allowed`, variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    const newUrls: string[] = [];
    const newContentTypes: string[] = [];
    const newPreviews: { url: string; type: string; name: string }[] = [];

    for (const file of toUpload) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/mms-upload', { method: 'POST', body: formData, credentials: 'include' });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Upload failed');
        }
        const data = await res.json();
        if (!data.objectPath) throw new Error('No file path returned');
        newUrls.push(data.objectPath);
        newContentTypes.push(data.contentType || file.type || 'application/octet-stream');
        let type = 'file';
        if (file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)) type = 'image';
        else if (file.type.startsWith('video/')) type = 'video';
        else if (file.type.startsWith('audio/')) type = 'audio';
        else if (file.type === 'application/pdf') type = 'pdf';
        newPreviews.push({ url: data.objectPath, type, name: file.name });
      } catch (err: any) {
        toast({ title: `Failed to upload ${file.name}`, description: err.message, variant: "destructive" });
      }
    }

    if (newUrls.length > 0) {
      setMediaUrls(prev => [...prev, ...newUrls]);
      setMediaContentTypes(prev => [...prev, ...newContentTypes]);
      setMediaPreviews(prev => [...prev, ...newPreviews]);
      toast({ title: `${newUrls.length} file${newUrls.length > 1 ? 's' : ''} uploaded` });
    }

    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAiResponse = async () => {
    setIsGeneratingAi(true);
    setPlusPopoverOpen(false);
    try {
      const body: any = {};
      if (selected.type === 'contact') body.contactId = selected.contact.id;
      else if (selected.type === 'phone') body.phoneNumber = selected.phoneNumber;
      else if (selected.type === 'project' && projectSendRecipient) {
        body.contactId = projectSendRecipient.contactId > 0 ? projectSendRecipient.contactId : undefined;
        body.phoneNumber = projectSendRecipient.phone;
      }
      const res = await fetch('/api/ai-response/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate response');
      }
      const { text } = await res.json();
      if (text) {
        setMessageText(text);
        setTimeout(() => textareaRef.current?.focus(), 100);
      }
    } catch (err: any) {
      toast({ title: "AI Response", description: err.message, variant: "destructive" });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const removeMedia = (index: number) => {
    setMediaUrls(prev => prev.filter((_, i) => i !== index));
    setMediaContentTypes(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendClick = () => {
    if (!messageText.trim() && mediaUrls.length === 0) return;
    try {
      onSend(messageText, mediaUrls, mediaContentTypes);
    } catch (err) {
      console.error('Error in onSend:', err);
    }
    setMessageText('');
    saveDraft(selected, '');
    setMediaUrls([]);
    setMediaContentTypes([]);
    setMediaPreviews([]);
  };

  const handleQuickLink = (url: string) => {
    setMessageText(prev => prev + (prev ? ' ' : '') + url);
  };

  return (
    <div
      ref={composeRef}
      className="flex-shrink-0 px-3 pt-2 border-t bg-background space-y-2"
      style={{ paddingBottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 12px))' }}
      data-testid="compose-bar"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*,.pdf"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      {mediaPreviews.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2">
          {mediaPreviews.map((preview, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 bg-muted rounded-lg max-w-[200px]">
              {preview.type === 'image' && <Image className="w-4 h-4 shrink-0" />}
              {preview.type === 'audio' && <FileAudio className="w-4 h-4 shrink-0" />}
              {preview.type === 'pdf' && <FileText className="w-4 h-4 shrink-0" />}
              <span className="text-sm flex-1 truncate">{preview.name}</span>
              <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => removeMedia(idx)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
          {mediaPreviews.length < MAX_MEDIA && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 p-2 bg-muted/50 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
              data-testid="button-add-more-media"
            >
              <Plus className="w-3 h-3" />
              Add more
            </button>
          )}
        </div>
      )}

      {selected.type === 'project' && selected.recipients.length > 1 && projectSendRecipient && onProjectRecipientChange && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">To:</span>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => onProjectRecipientChange({ contactId: -1, name: 'All', phone: 'all' })}
              className={cn(
                "text-xs px-2 py-0.5 rounded-full border transition-colors font-medium",
                projectSendRecipient.contactId === -1
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:border-primary/50"
              )}
              data-testid="recipient-chip-all"
            >
              All
            </button>
            {selected.recipients.map(r => (
              <button
                key={r.contactId}
                onClick={() => onProjectRecipientChange(r)}
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full border transition-colors",
                  projectSendRecipient.contactId === r.contactId
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:border-primary/50"
                )}
                data-testid={`recipient-chip-${r.contactId}`}
              >
                {maskName(r.name).split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected.type === 'contact' && !selected.contact.phone && selected.contact.email && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium mb-1">
          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Sending via email — replies won't appear here</span>
        </div>
      )}
      <div className="flex gap-2 items-end">
        <Popover open={plusPopoverOpen} onOpenChange={setPlusPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              className="rounded-full bg-foreground text-background h-9 w-9 flex items-center justify-center flex-shrink-0"
              data-testid="button-plus-menu"
            >
              {isUploading || isGeneratingAi ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-1">
            <button
              className="w-full text-left px-3 py-2 text-sm rounded-md hover-elevate flex items-center gap-2"
              onClick={() => { fileInputRef.current?.click(); setPlusPopoverOpen(false); }}
              data-testid="plus-menu-attachment"
            >
              <Paperclip className="w-4 h-4" />
              Attachment
            </button>
            {settings?.website && (
              <button
                className="w-full text-left px-3 py-2 text-sm rounded-md hover-elevate flex items-center gap-2"
                onClick={() => { handleQuickLink(settings.website!.startsWith('http') ? settings.website! : `https://${settings.website}`); setPlusPopoverOpen(false); }}
                data-testid="plus-menu-website"
              >
                <Link2 className="w-4 h-4" />
                Website Link
              </button>
            )}
            {settings?.bookingUrl && (
              <button
                className="w-full text-left px-3 py-2 text-sm rounded-md hover-elevate flex items-center gap-2"
                onClick={() => { handleQuickLink(settings.bookingUrl!.startsWith('http') ? settings.bookingUrl! : `https://${settings.bookingUrl}`); setPlusPopoverOpen(false); }}
                data-testid="plus-menu-booking"
              >
                <ExternalLink className="w-4 h-4" />
                Booking Link
              </button>
            )}
            {isContactSelected && (() => {
              const proposals = (contactDocuments || []).filter(d => d.type === 'proposal' || d.type === 'estimate');
              if (proposals.length === 0) return null;
              return proposals.map(doc => (
                <button
                  key={`proposal-${doc.id}`}
                  className="w-full text-left px-3 py-2 text-sm rounded-md hover-elevate flex items-center gap-2"
                  onClick={() => { handleQuickLink(`${window.location.origin}/portal/document/${doc.publicToken}`); setPlusPopoverOpen(false); }}
                  data-testid={`plus-menu-proposal-${doc.id}`}
                >
                  <FileText className="w-4 h-4" />
                  <span className="truncate">{doc.title}</span>
                </button>
              ));
            })()}
            {isContactSelected && (() => {
              const invoices = (contactDocuments || []).filter(d => d.type === 'invoice');
              if (invoices.length === 0) return null;
              return invoices.map(doc => (
                <button
                  key={`invoice-${doc.id}`}
                  className="w-full text-left px-3 py-2 text-sm rounded-md hover-elevate flex items-center gap-2"
                  onClick={() => { handleQuickLink(`${window.location.origin}/portal/document/${doc.publicToken}`); setPlusPopoverOpen(false); }}
                  data-testid={`plus-menu-invoice-${doc.id}`}
                >
                  <FileText className="w-4 h-4" />
                  <span className="truncate">{doc.title}</span>
                </button>
              ));
            })()}
            {isContactSelected && selectedContactId && (
              <button
                className="w-full text-left px-3 py-2 text-sm rounded-md hover-elevate flex items-center gap-2"
                onClick={() => { handleQuickLink(`${window.location.origin}/portal/pay/${selectedContactId}`); setPlusPopoverOpen(false); }}
                data-testid="plus-menu-payment"
              >
                <Link2 className="w-4 h-4" />
                Payment Request
              </button>
            )}
            <button
              className="w-full text-left px-3 py-2 text-sm rounded-md hover-elevate flex items-center gap-2"
              onClick={handleAiResponse}
              disabled={isGeneratingAi}
              data-testid="plus-menu-ai-response"
            >
              {isGeneratingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              AI Response
            </button>
          </PopoverContent>
        </Popover>

        <Textarea
          ref={textareaRef}
          placeholder={selected.type === 'contact' && !selected.contact.phone && selected.contact.email ? "Type an email message..." : "Type a message..."}
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          className="min-h-[44px] max-h-[50vh] resize-none flex-1 overflow-y-auto"
          rows={1}
          data-testid="input-message"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowSchedule(true)}
          disabled={!messageText.trim() && mediaUrls.length === 0}
          data-testid="button-schedule-message"
        >
          <Clock className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          onClick={handleSendClick}
          disabled={isSending || (!messageText.trim() && mediaUrls.length === 0)}
          className={selected.type === 'contact' && !selected.contact.phone && selected.contact.email ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
          data-testid="button-send-message"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : selected.type === 'contact' && !selected.contact.phone && selected.contact.email ? (
            <Mail className="w-4 h-4" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>

      <Dialog open={showSchedule} onOpenChange={(open) => { setShowSchedule(open); if (!open) setScheduleDate(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Schedule Message
            </DialogTitle>
            <DialogDescription>
              Choose when to send this message
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <input
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              min={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="input-schedule-date"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setShowSchedule(false); setScheduleDate(''); }}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const phone = selected.type === 'contact' ? selected.contact.phone : selected.phoneNumber;
                if (!phone || !scheduleDate || (!messageText.trim() && mediaUrls.length === 0)) return;
                if (isScheduling) return;
                setIsScheduling(true);
                const scheduledAt = new Date(scheduleDate).toISOString();
                const body = messageText;
                const contactId = selected.type === 'contact' ? selected.contact.id : undefined;
                const tempId = -Date.now();
                const firstMediaUrl = mediaUrls[0] || undefined;
                const optimisticMsg = {
                  id: tempId,
                  contactId,
                  phoneNumber: phone,
                  body,
                  mediaUrl: firstMediaUrl,
                  scheduledAt,
                  status: 'pending',
                  createdAt: new Date().toISOString(),
                };
                queryClient.setQueryData(['/api/scheduled-messages'], (old: any[] | undefined) =>
                  [...(old || []), optimisticMsg]
                );
                setMessageText('');
                saveDraft(selected, '');
                setMediaUrls([]);
                setMediaContentTypes([]);
                setMediaPreviews([]);
                setShowSchedule(false);
                setScheduleDate('');
                try {
                  await apiRequest('POST', '/api/scheduled-messages', {
                    contactId,
                    phoneNumber: phone,
                    body,
                    mediaUrl: firstMediaUrl,
                    scheduledAt,
                  });
                  toast({ title: "Message scheduled!" });
                  queryClient.invalidateQueries({ queryKey: ['/api/scheduled-messages'] });
                } catch (err: any) {
                  queryClient.setQueryData(['/api/scheduled-messages'], (old: any[] | undefined) =>
                    (old || []).filter(sm => sm.id !== tempId)
                  );
                  toast({ title: "Failed to schedule", description: err.message, variant: "destructive" });
                } finally {
                  setIsScheduling(false);
                }
              }}
              disabled={isScheduling || (!messageText.trim() && mediaUrls.length === 0) || !scheduleDate || new Date(scheduleDate) <= new Date()}
              data-testid="button-confirm-schedule"
            >
              {isScheduling ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Clock className="w-4 h-4 mr-2" />
              )}
              {isScheduling ? 'Scheduling...' : 'Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerMessages() {
  const { maskName, maskPhone, maskEmail, maskText } = useDemoMode();
  const { isElite } = useSubscription();
  const { data: conversationContacts, isLoading: contactsLoading } = useQuery<ConversationContact[]>({
    queryKey: ['/api/communications/conversation-contacts'],
    // Show the persisted/cached tray instantly on cold-start, then
    // background-refetch immediately so any rows that were stale (e.g.
    // a brand-new conversation, or a contact whose preview was waiting
    // on a 500ms WS safety-net) populate within the same second instead
    // of taking 20-30s for the next focus/WS event to trigger a refresh.
    staleTime: 0,
    refetchOnReconnect: true,
  });
  const { data: projectConversations } = useQuery<ProjectConversation[]>({
    queryKey: ['/api/communications/project-conversations'],
    queryFn: async () => {
      const res = await fetch('/api/communications/project-conversations', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isElite,
  });
  // messageGroupsData query removed — message_groups feature retired in favor of 1-on-1 contact threads.
  const { data: allContacts } = useContacts();
  const { data: settings, isLoading: settingsLoading } = useCompanySettings();
  const { mutate: sendSms, isPending: isSending } = useSendSms();
  const { mutate: sendEmail, isPending: isSendingEmail } = useSendEmail();
  const { mutate: makeCall, isPending: isCalling } = useMakeCall();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [retryDraft, setRetryDraft] = useState<string | undefined>(undefined);
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search || window.location.search);
  const contactIdFromUrl = params.get('contactId');
  const phoneFromUrl = params.get('phone');
  const projectIdFromUrl = params.get('projectId');
  const draftFromUrl = params.get('draft');

  const { mutate: markAsRead } = useMutation({
    mutationFn: async (data: { contactId?: number; phoneNumber?: string }) => {
      return apiRequest('POST', '/api/communications/mark-read', { ...data, type: 'sms' });
    },
    onMutate: async (data) => {
      if (data.contactId) {
        queryClient.setQueryData<ConversationContact[]>(
          ['/api/communications/conversation-contacts'],
          (old) => old?.map(c => c.id === data.contactId ? { ...c, unread_count: 0 } : c)
        );
        queryClient.setQueryData<ProjectConversation[]>(
          ['/api/communications/project-conversations'],
          (old) => old?.map(conv => ({
            ...conv,
            unread_count: conv.recipients?.some((r: any) => r.contactId === data.contactId) ? 0 : conv.unread_count,
          }))
        );
      }
      if (data.phoneNumber) {
        queryClient.setQueryData<UnknownConversation[]>(
          ['/api/communications/unknown-numbers'],
          (old) => old?.map(c => c.phoneNumber === data.phoneNumber ? { ...c, unreadCount: 0 } : c)
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
    }
  });

  const { data: singleContact } = useQuery<Contact>({
    queryKey: ['/api/contacts', contactIdFromUrl],
    enabled: !!contactIdFromUrl,
  });

  const { data: unknownConversations } = useQuery<UnknownConversation[]>({
    queryKey: ['/api/communications/unknown-numbers'],
    queryFn: async () => {
      const res = await fetch('/api/communications/unknown-numbers', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { dismissNotificationsByLink } = useNotificationContext();
  const { setContent: setMobileHeaderContent } = useMobileHeaderOverride();
  const { setHidden: setMobileNavHidden } = useMobileNavVisibility();

  // Lazy-initialize from URL params synchronously so the very first render
  // already targets the right thread (no flash of the previously selected
  // contact when arriving from a push notification or deep link). For contacts
  // and projects we use a stub object that the real record replaces once the
  // conversation list / single-contact query resolves.
  //
  // Fallback path: if the URL has no params (e.g. cold launch where auth restore
  // stripped the query string before Messages mounted, or a bounce navigation
  // where the URL hasn't settled yet), read the sessionStorage backup written
  // by main.tsx when the push was tapped. This keeps the deep link recoverable
  // for up to 60 seconds after the tap.
  const [selected, setSelectedRaw] = useState<ConversationTarget | null>(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      let cid = sp.get('contactId');
      let ph = sp.get('phone');
      let pid = sp.get('projectId');

      if (!cid && !ph && !pid) {
        try {
          const raw = sessionStorage.getItem('__pushDeepLink');
          if (raw) {
            const parsed = JSON.parse(raw);
            const fresh = parsed?.url && (Date.now() - (parsed.ts || 0) < 60_000);
            if (fresh && typeof parsed.url === 'string' && parsed.url.includes('/messages')) {
              const bsp = new URLSearchParams(parsed.url.includes('?') ? parsed.url.split('?')[1] : '');
              cid = bsp.get('contactId');
              ph = bsp.get('phone');
              pid = bsp.get('projectId');
            } else if (!fresh) {
              sessionStorage.removeItem('__pushDeepLink');
            }
          }
        } catch {}
      }

      if (pid) {
        const parsedPid = parseInt(pid);
        if (!isNaN(parsedPid)) {
          return { type: 'project', projectId: parsedPid, projectName: '', recipients: [] };
        }
      }
      if (cid) {
        const parsedId = parseInt(cid);
        if (!isNaN(parsedId)) {
          return { type: 'contact', contact: makeStubContact(parsedId) };
        }
      }
      if (ph) {
        return { type: 'phone', phoneNumber: ph };
      }
    } catch {}
    return null;
  });
  const setSelected = useCallback((target: ConversationTarget | null) => {
    setSelectedRaw(target);
  }, []);
  const handleRetryMessage = useCallback((msg: Communication) => {
    const failedMsg = msg as any;
    const getCacheKey = (): any[] | null => {
      if (selected?.type === 'contact') return ['/api/communications', (selected as any).contact?.id];
      if (selected?.type === 'phone') return ['/api/communications/by-phone', (selected as any).phoneNumber];
      if (selected?.type === 'project') return ['/api/communications/project-thread', (selected as any).projectId];
      return null;
    };
    const cacheKey = getCacheKey();
    if (cacheKey) {
      queryClient.setQueryData(cacheKey, (old: Communication[] | undefined) => {
        const arr = Array.isArray(old) ? old : [];
        return arr.filter((m: any) => m.id !== failedMsg.id);
      });
    }
    setRetryDraft(failedMsg.content || '');
  }, [selected, queryClient]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [newMessageSearch, setNewMessageSearch] = useState('');
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<ConversationTarget | null>(null);
  const [swipedItem, setSwipedItem] = useState<string | null>(null);
  const [showCallConfirm, setShowCallConfirm] = useState(false);
  const [showOpenPhoneCallDialog, setShowOpenPhoneCallDialog] = useState(false);
  const [projectSendRecipient, setProjectSendRecipient] = useState<{ contactId: number; name: string; phone: string } | null>(null);
  const [showRecipientWarning, setShowRecipientWarning] = useState(false);
  const [pendingSendData, setPendingSendData] = useState<{ text: string; mediaUrls: string[]; mediaContentTypes?: string[] } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; id: string } | null>(null);

  const [showAddRecipientDialog, setShowAddRecipientDialog] = useState(false);
  const [addRecipientMode, setAddRecipientMode] = useState<'manual' | 'contact'>('contact');
  const [addRecipientName, setAddRecipientName] = useState('');
  const [addRecipientPhone, setAddRecipientPhone] = useState('');
  const [addRecipientEmail, setAddRecipientEmail] = useState('');
  const [addRecipientAddress, setAddRecipientAddress] = useState('');
  const [addRecipientCity, setAddRecipientCity] = useState('');
  const [addRecipientState, setAddRecipientState] = useState('');
  const [addRecipientZip, setAddRecipientZip] = useState('');
  const [addRecipientSameAddress, setAddRecipientSameAddress] = useState(false);
  const [addRecipientContactId, setAddRecipientContactId] = useState<number | null>(null);

  const [showAddParticipantDialog, setShowAddParticipantDialog] = useState(false);
  const [addParticipantMode, setAddParticipantMode] = useState<'manual' | 'contact'>('contact');
  const [addParticipantName, setAddParticipantName] = useState('');
  const [addParticipantPhone, setAddParticipantPhone] = useState('');
  const [addParticipantContactId, setAddParticipantContactId] = useState<number | null>(null);
  // Group dialog state removed — message_groups feature retired.
  const [showRecipientManageModal, setShowRecipientManageModal] = useState(false);
  const [recipientConflict, setRecipientConflict] = useState<{ contactName: string; existingProjectTitle: string; existingProjectId: number; existingRecipientId: number; participantName: string; participantPhone: string; participantContactId: number | null } | null>(null);

  // Create-group dialog state removed.

  const prevProjectIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (selected?.type === 'project') {
      if (prevProjectIdRef.current !== selected.projectId || !projectSendRecipient) {
        setProjectSendRecipient(selected.recipients.length > 1 ? { contactId: -1, name: 'All', phone: 'all' } : selected.recipients[0]);
        prevProjectIdRef.current = selected.projectId;
      }
    } else {
      setProjectSendRecipient(null);
      prevProjectIdRef.current = null;
    }
  }, [selected]);

  const selectedContactId = selected?.type === 'contact' ? selected.contact.id : undefined;

  const { data: allProjects } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });
  const contactProjectForPause = selectedContactId
    ? allProjects?.find(p => p.contactId === selectedContactId && p.automationPausedReason)
    : undefined;
  const contactProjectAny = selectedContactId
    ? allProjects?.find(p => p.contactId === selectedContactId)
    : undefined;

  const { data: contactProjectRecipients } = useQuery<ProjectRecipient[]>({
    queryKey: ['/api/projects', contactProjectAny?.id, 'recipients'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${contactProjectAny!.id}/recipients`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch recipients');
      return res.json();
    },
    enabled: selected?.type === 'contact' && !!contactProjectAny?.id,
  });


  useEffect(() => {
    if (selected) {
      const isMobile = window.innerWidth < 1024;
      if (isMobile) {
        setMobileNavHidden(true);
        const isContact = selected.type === 'contact';
        const isProject = selected.type === 'project';
        const mobileOtherRecipients = (contactProjectRecipients || []).filter(r => isContact && r.contactId !== selected.contact.id);
        const mobileDisplayName = isProject
          ? selected.recipients.map(r => maskName(r.name).split(' ')[0]).join(' & ')
          : isContact 
            ? (mobileOtherRecipients.length > 0 
                ? `${maskName(selected.contact.name).split(' ')[0]} & ${mobileOtherRecipients.map(r => maskName(r.name).split(' ')[0]).join(', ')}`
                : maskName(selected.contact.name))
            : maskPhone(selected.phoneNumber);
        const mobileDisplaySub = isProject 
            ? (selected.recipients.length === 1 
                ? maskPhone(selected.recipients[0]?.phone) || selected.projectName
                : selected.projectName)
            : isContact ? (mobileOtherRecipients.length > 0 ? maskName(selected.contact.name) : maskPhone(selected.contact.phone)) : null;
        setMobileHeaderContent(
          <div className="flex items-center w-full">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelected(null)}
              className="flex-shrink-0"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <button
              className="flex-1 min-w-0 flex flex-col items-center justify-center"
              data-testid="button-mobile-header-name"
            >
              <h3 className="font-semibold truncate text-base max-w-[220px]">{mobileDisplayName}</h3>
              {mobileDisplaySub && (
                <p className="text-xs text-muted-foreground truncate max-w-[200px]">{mobileDisplaySub}</p>
              )}
            </button>
            <div className="flex items-center flex-shrink-0">
              {!isProject && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const phone = selected?.type === 'contact' ? selected.contact.phone : selected?.type === 'phone' ? selected.phoneNumber : undefined;
                    if (!phone) return;
                    if (isOpenPhoneProvider) {
                      setShowOpenPhoneCallDialog(true);
                    } else if (isTwilioConfigured) {
                      setShowCallConfirm(true);
                    } else {
                      window.location.href = `tel:${phone}`;
                    }
                  }}
                  className="flex-shrink-0"
                  data-testid="button-call"
                >
                  <Phone className="w-5 h-5" />
                </Button>
              )}
              {!isContact && !isProject && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setNewContactName(''); setShowCreateContact(true); }}
                  className="flex-shrink-0"
                  data-testid="button-create-contact"
                >
                  <UserPlus className="w-5 h-5" />
                </Button>
              )}
              {isContact && contactProjectAny?.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0"
                  data-testid="button-add-participant"
                  onClick={() => {
                    if ((contactProjectRecipients || []).length > 0) {
                      setShowRecipientManageModal(true);
                    } else {
                      setAddParticipantName('');
                      setAddParticipantPhone('');
                      setAddParticipantContactId(null);
                      setAddParticipantMode('contact');
                      setShowAddParticipantDialog(true);
                    }
                  }}
                >
                  <Users className="w-5 h-5" />
                </Button>
              )}
              {isContact && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0"
                  data-testid="button-view-contact"
                  onClick={() => { navigatingAwayRef.current = true; navigate(`/contacts/${selected.contact.id}`); }}
                >
                  <User className="w-5 h-5" />
                </Button>
              )}
              {isProject && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0"
                  data-testid="button-view-project"
                  onClick={() => { navigatingAwayRef.current = true; navigate(`/projects/${selected.projectId}`); }}
                >
                  <User className="w-5 h-5" />
                </Button>
              )}
            </div>
          </div>
        );
      } else {
        setMobileNavHidden(false);
        setMobileHeaderContent(null);
      }
    } else {
      setMobileNavHidden(false);
      setMobileHeaderContent(null);
    }
    return () => {
      setMobileHeaderContent(null);
      setMobileNavHidden(false);
    };
  }, [selected, setMobileHeaderContent, setMobileNavHidden, contactProjectAny, contactProjectRecipients]);

  const selectedPhone = selected?.type === 'phone' ? selected.phoneNumber : undefined;
  const selectedProjectId = selected?.type === 'project' ? selected.projectId : undefined;

  const { data: contactComms, refetch: refetchContactComms, isLoading: contactCommsLoading } = useCommunications(selectedContactId);

  const { data: phoneComms, refetch: refetchPhoneComms, isLoading: phoneCommsLoading } = useQuery<Communication[]>({
    queryKey: ['/api/communications/by-phone', selectedPhone],
    queryFn: async () => {
      const res = await fetch(`/api/communications/by-phone?phoneNumber=${encodeURIComponent(selectedPhone!)}`, { credentials: 'include' });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!selectedPhone,
    // refetchOnWindowFocus disabled — the iOS keyboard close on Send fires
    // a focus event whose stale GET would race the optimistic write and
    // hide the just-sent bubble. WS keeps the cache fresh.
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
  });

  const { data: projectThreadComms, refetch: refetchProjectThread, isLoading: projectThreadLoading } = useQuery<Communication[]>({
    queryKey: ['/api/communications/project-thread', selectedProjectId],
    queryFn: async () => {
      const res = await fetch(`/api/communications/project-thread/${selectedProjectId}`, { credentials: 'include' });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      return Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : [];
    },
    enabled: !!selectedProjectId,
    // refetchOnWindowFocus disabled — see contactComms note above.
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
  });

  // selectedGroupId / groupThreadComms removed — message_groups feature retired.

  const { data: allScheduledMessages } = useQuery<ScheduledMessage[]>({
    queryKey: ['/api/scheduled-messages'],
    queryFn: async () => {
      const res = await fetch('/api/scheduled-messages', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!selected,
  });

  const conversationScheduledMessages = (allScheduledMessages || []).filter(sm => {
    if (sm.status !== 'pending') return false;
    if (selected?.type === 'contact') {
      return sm.contactId === selected.contact.id;
    }
    if (selected?.type === 'phone') {
      const normalize = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
      return normalize(sm.phoneNumber) === normalize(selected.phoneNumber);
    }
    return false;
  });

  const [editingScheduledMsg, setEditingScheduledMsg] = useState<ScheduledMessage | null>(null);
  const [editScheduleDate, setEditScheduleDate] = useState('');
  const [editScheduleBody, setEditScheduleBody] = useState('');

  const updateScheduledMutation = useMutation({
    mutationFn: async ({ id, scheduledAt, body }: { id: number; scheduledAt?: string; body?: string }) => {
      const payload: Record<string, string> = {};
      if (scheduledAt) payload.scheduledAt = scheduledAt;
      if (body !== undefined) payload.body = body;
      return apiRequest('PATCH', `/api/scheduled-messages/${id}`, payload);
    },
    onSuccess: () => {
      toast({ title: "Scheduled message updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-messages'] });
      setEditingScheduledMsg(null);
      setEditScheduleDate('');
      setEditScheduleBody('');
    },
    onError: (error) => {
      toast({ title: "Failed to update schedule", description: error.message, variant: "destructive" });
    }
  });

  const cancelScheduledMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/scheduled-messages/${id}`);
    },
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ['/api/scheduled-messages'] });
      const previous = queryClient.getQueryData<any[]>(['/api/scheduled-messages']);
      queryClient.setQueryData(['/api/scheduled-messages'], (old: any[] | undefined) =>
        (old || []).filter(sm => sm.id !== id)
      );
      return { previous };
    },
    onSuccess: () => {
      toast({ title: "Scheduled message cancelled" });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-messages'] });
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['/api/scheduled-messages'], context.previous);
      }
      toast({ title: "Failed to cancel", description: error.message, variant: "destructive" });
    }
  });

  const communications = selected?.type === 'project' ? projectThreadComms : selected?.type === 'contact' ? contactComms : phoneComms;
  const commsLoading = selected?.type === 'project' ? projectThreadLoading : selected?.type === 'contact' ? contactCommsLoading : phoneCommsLoading;
  const refetchComms = selected?.type === 'project' ? refetchProjectThread : selected?.type === 'contact' ? refetchContactComms : refetchPhoneComms;

  const { data: contactDocuments } = useQuery<Document[]>({
    queryKey: ['/api/documents', { contactId: selectedContactId }],
    queryFn: async () => {
      const res = await fetch(`/api/documents?contactId=${selectedContactId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch documents');
      return res.json();
    },
    enabled: selected?.type === 'contact' && !!selectedContactId,
  });

  // createGroupMutation removed — message_groups feature retired.

  const addParticipantMutation = useMutation({
    mutationFn: async (data: { participantName: string; participantPhone: string; participantContactId?: number | null; force?: boolean }) => {
      if (!selected || selected.type !== 'contact') throw new Error('No contact conversation selected');
      if (!contactProjectAny?.id) throw new Error('This contact has no project. Create a project first.');
      const res = await fetch(`/api/projects/${contactProjectAny.id}/recipients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: data.participantName,
          phone: data.participantPhone,
          contactId: data.participantContactId,
          role: 'additional',
          force: data.force || false,
        }),
      });
      const json = await res.json();
      if (res.status === 409 && json.conflict) {
        throw { conflict: true, ...json, participantName: data.participantName, participantPhone: data.participantPhone, participantContactId: data.participantContactId ?? null };
      }
      if (!res.ok) throw new Error(json.message || 'Failed to add person');
      return json;
    },
    onSuccess: () => {
      toast({ title: "Person added", description: "Messages will now also be sent to this person" });
      setShowAddParticipantDialog(false);
      setAddParticipantName('');
      setAddParticipantPhone('');
      setAddParticipantContactId(null);
      setRecipientConflict(null);
      queryClient.invalidateQueries({ queryKey: ['/api/projects', contactProjectAny?.id, 'recipients'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
    },
    onError: (error: any) => {
      if (error.conflict) {
        setRecipientConflict({
          contactName: error.contactName,
          existingProjectTitle: error.existingProjectTitle,
          existingProjectId: error.existingProjectId,
          existingRecipientId: error.existingRecipientId,
          participantName: error.participantName,
          participantPhone: error.participantPhone,
          participantContactId: error.participantContactId,
        });
        setShowAddParticipantDialog(false);
        return;
      }
      toast({ title: "Failed to add person", description: error.message, variant: "destructive" });
    },
  });

  const removeRecipientMutation = useMutation({
    mutationFn: async (data: { recipientId: number }) => {
      if (!contactProjectAny?.id) throw new Error('No project found');
      await apiRequest('DELETE', `/api/projects/${contactProjectAny.id}/recipients/${data.recipientId}`);
    },
    onSuccess: () => {
      toast({ title: "Person removed", description: "Messages will no longer be sent to this person" });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', contactProjectAny?.id, 'recipients'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
      if (selectedContactId) {
        queryClient.invalidateQueries({ queryKey: ['/api/communications', selectedContactId] });
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove person", description: error.message, variant: "destructive" });
    },
  });

  // removeGroupMemberMutation / addMemberToGroupMutation removed — message_groups feature retired.

  const addRecipientMutation = useMutation({
    mutationFn: async (data: { name: string; phone?: string; email?: string; address?: string; city?: string; state?: string; zipCode?: string; contactId?: number | null }) => {
      if (!contactProjectAny?.id) throw new Error('No project found');
      return apiRequest('POST', `/api/projects/${contactProjectAny.id}/recipients`, {
        ...data,
        role: 'additional',
      });
    },
    onSuccess: () => {
      toast({ title: "Recipient added", description: "Messages will now also be sent to this person" });
      setShowAddRecipientDialog(false);
      setAddRecipientName('');
      setAddRecipientPhone('');
      setAddRecipientEmail('');
      setAddRecipientAddress('');
      setAddRecipientCity('');
      setAddRecipientState('');
      setAddRecipientZip('');
      setAddRecipientSameAddress(false);
      setAddRecipientContactId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/projects', contactProjectAny?.id, 'recipients'] });
      if (selectedContactId) {
        queryClient.invalidateQueries({ queryKey: ['/api/communications', selectedContactId] });
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to add recipient", description: error.message, variant: "destructive" });
    },
  });

  const isOpenPhoneProvider = settings?.phoneProvider === 'openphone';
  const isOpenPhoneConfigured = isOpenPhoneProvider && settings?.openphoneApiKey && settings?.openphonePhoneNumber;
  const isTwilioConfigured = !isOpenPhoneProvider && !!settings?.twilioAccountSid && !!settings?.twilioAuthToken && !!settings?.twilioPhoneNumber;
  const hasOfficePhone = !!settings?.twilioOfficePhone;
  const isMessagingConfigured = isTwilioConfigured || isOpenPhoneConfigured;

  const { mutate: deleteConversation, isPending: isDeleting } = useMutation({
    mutationFn: async (target: ConversationTarget) => {
      const body = target.type === 'contact'
        ? { contactId: target.contact.id }
        : { phoneNumber: (target as any).phoneNumber };
      return apiRequest('DELETE', '/api/communications/conversation', body);
    },
    onSuccess: () => {
      toast({ title: "Conversation deleted" });
      setSelected(null);
      setSwipedItem(null);
      navigate('/messages', { replace: true });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/unknown-numbers'] });
    },
    onError: (error) => {
      toast({ title: "Failed to delete conversation", description: error.message, variant: "destructive" });
    }
  });

  

  const contactIdRef = useRef<string | null>(null);
  const phoneRef = useRef<string | null>(null);
  const pendingContactIdRef = useRef<number | null>(null);
  const conversationContactsRef = useRef(conversationContacts);
  conversationContactsRef.current = conversationContacts;
  const projectConversationsRef = useRef(projectConversations);
  projectConversationsRef.current = projectConversations;
  const singleContactRef = useRef(singleContact);
  singleContactRef.current = singleContact;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Tell the realtime client which thread is currently in view so it can
  // refresh the conversation list and active thread immediately when an
  // inbound message belongs to it (avoids the 500ms safety-net debounce).
  useEffect(() => {
    if (!selected) {
      setActiveMessageThread(null);
      return;
    }
    if (selected.type === 'contact') {
      setActiveMessageThread({ kind: 'contact', contactId: selected.contact.id });
    } else if (selected.type === 'phone') {
      setActiveMessageThread({ kind: 'phone', phoneNumber: selected.phoneNumber });
    } else if (selected.type === 'project') {
      setActiveMessageThread({ kind: 'project', projectId: selected.projectId });
    } else {
      setActiveMessageThread(null);
    }
    return () => {
      setActiveMessageThread(null);
    };
  }, [selected]);

  // Blocker #2 fix: when the user goes back from a thread to the list,
  // force-refresh the conversation list. While the user was inside the
  // thread, the WS may have dropped (iOS background, cellular handoff,
  // signal loss) and any inbound message for OTHER contacts may have
  // missed the in-place `setQueriesData` update in the locked WS
  // handler. Without this refetch, the user returns to the list and
  // sees stale previews / wrong sort order until the next 10s sync
  // poll fires. Refetch is cheap (~50–200ms) and only fires on the
  // thread → list transition (not on initial mount, where staleTime:0
  // already triggers a refetch via the query observer).
  const wasInsideThreadRef = useRef(false);
  useEffect(() => {
    if (selected) {
      wasInsideThreadRef.current = true;
      return;
    }
    if (wasInsideThreadRef.current) {
      wasInsideThreadRef.current = false;
      queryClient.invalidateQueries({
        queryKey: ['/api/communications/conversation-contacts'],
        refetchType: 'active',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/communications/recent-incoming'],
        refetchType: 'active',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/communications/unknown-numbers'],
        refetchType: 'active',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/communications/project-conversations'],
        refetchType: 'active',
      });
    }
  }, [selected, queryClient]);

  const resolveAndSelect = useCallback((parsedId: number, cidStr: string) => {
    const contact = conversationContactsRef.current?.find(c => c.id === parsedId) || singleContactRef.current;
    if (contact && contact.id === parsedId) {
      pendingContactIdRef.current = null;
      contactIdRef.current = cidStr;
      setSelected({ type: 'contact', contact });
      markAsRead({ contactId: contact.id });
      dismissNotificationsByLink(`/messages?contactId=${contact.id}`);
      return true;
    }
    return false;
  }, [setSelected, markAsRead, dismissNotificationsByLink]);

  const projectIdRef = useRef<string | null>(null);
  const pendingProjectIdRef = useRef<number | null>(null);
  const resolveAndSelectProject = useCallback((projectId: number) => {
    const pc = projectConversationsRef.current?.find(p => p.project_id === projectId);
    if (pc) {
      pendingProjectIdRef.current = null;
      projectIdRef.current = String(projectId);
      setSelected({ type: 'project', projectId: pc.project_id, projectName: pc.project_name, recipients: pc.recipients });
      dismissNotificationsByLink(`/messages?projectId=${pc.project_id}`);
      return true;
    }
    return false;
  }, [setSelected, dismissNotificationsByLink]);

  useEffect(() => {
    const cid = contactIdFromUrl || new URLSearchParams(window.location.search).get('contactId');
    const ph = phoneFromUrl || new URLSearchParams(window.location.search).get('phone');
    const pid = projectIdFromUrl || new URLSearchParams(window.location.search).get('projectId');

    if (pid) {
      const parsedPid = parseInt(pid);
      if (projectIdRef.current !== pid || !selected) {
        if (!resolveAndSelectProject(parsedPid)) {
          // Show the right project pane immediately with a stub so the thread
          // query (keyed by projectId) starts loading. Queue a pending id so
          // the projectConversations effect upgrades the stub once the real
          // project record arrives, and kick the list to refetch in case it
          // hasn't loaded yet.
          projectIdRef.current = pid;
          pendingProjectIdRef.current = parsedPid;
          setSelected({ type: 'project', projectId: parsedPid, projectName: '', recipients: [] });
          dismissNotificationsByLink(`/messages?projectId=${parsedPid}`);
          queryClient.invalidateQueries({ queryKey: ['/api/communications/project-conversations'] });
        }
      }
    } else if (cid) {
      const parsedId = parseInt(cid);
      if (contactIdRef.current !== cid || !selected) {
        if (!resolveAndSelect(parsedId, cid)) {
          // Render the right thread immediately with a stub contact and
          // remember to enrich it once the contact record arrives.
          contactIdRef.current = cid;
          pendingContactIdRef.current = parsedId;
          setSelected({ type: 'contact', contact: makeStubContact(parsedId) });
          markAsRead({ contactId: parsedId });
          dismissNotificationsByLink(`/messages?contactId=${parsedId}`);
        }
      }
    } else if (ph) {
      if (phoneRef.current !== ph || !selected) {
        phoneRef.current = ph;
        pendingContactIdRef.current = null;
        setSelected({ type: 'phone', phoneNumber: ph });
        markAsRead({ phoneNumber: ph });
        dismissNotificationsByLink(`/messages?phone=${encodeURIComponent(ph)}`);
      }
    }
  }, [contactIdFromUrl, phoneFromUrl, projectIdFromUrl]);

  useEffect(() => {
    const handleNotifNav = (e: Event) => {
      const url = (e as CustomEvent).detail?.url;
      if (!url || !url.startsWith('/messages')) return;
      const navParams = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
      const navCid = navParams.get('contactId');
      const navPh = navParams.get('phone');
      const navPid = navParams.get('projectId');
      if (navPid) {
        const parsedPid = parseInt(navPid);
        projectIdRef.current = null;
        if (!resolveAndSelectProject(parsedPid)) {
          // Show the right project pane immediately with a stub and queue
          // a pending id so the projectConversations effect upgrades it
          // once the real record arrives.
          projectIdRef.current = navPid;
          pendingProjectIdRef.current = parsedPid;
          setSelected({ type: 'project', projectId: parsedPid, projectName: '', recipients: [] });
          dismissNotificationsByLink(`/messages?projectId=${parsedPid}`);
          queryClient.invalidateQueries({ queryKey: ['/api/communications/project-conversations'] });
        }
      } else if (navCid) {
        const parsedId = parseInt(navCid);
        contactIdRef.current = null;
        if (!resolveAndSelect(parsedId, navCid)) {
          // Render the right thread immediately with a stub contact and let
          // the conversationContacts/singleContact effect enrich it.
          contactIdRef.current = navCid;
          pendingContactIdRef.current = parsedId;
          setSelected({ type: 'contact', contact: makeStubContact(parsedId) });
          markAsRead({ contactId: parsedId });
          dismissNotificationsByLink(`/messages?contactId=${parsedId}`);
        }
      } else if (navPh) {
        phoneRef.current = null;
        pendingContactIdRef.current = null;
        setSelected({ type: 'phone', phoneNumber: navPh });
        markAsRead({ phoneNumber: navPh });
      }
    };
    window.addEventListener('notification-navigate', handleNotifNav);
    return () => window.removeEventListener('notification-navigate', handleNotifNav);
  }, [resolveAndSelect, resolveAndSelectProject, setSelected, markAsRead]);

  useEffect(() => {
    if (pendingContactIdRef.current !== null) {
      const pid = pendingContactIdRef.current;
      resolveAndSelect(pid, String(pid));
    }
  }, [conversationContacts, singleContact, resolveAndSelect]);

  useEffect(() => {
    if (pendingProjectIdRef.current !== null) {
      resolveAndSelectProject(pendingProjectIdRef.current);
    }
  }, [projectConversations, resolveAndSelectProject]);

  // ============================================================
  // LOCKED — Task #37 (Lock down inbound messaging once and for all)
  // Listens for `native-push-tapped` and switches the right-hand
  // pane to the right thread. Works in tandem with the App.tsx
  // `usePendingPushNavigation` hook (which owns route navigation).
  // This handler only updates `selected` so the thread mounts on
  // the right contact/phone/project the moment the URL arrives.
  // Do NOT modify without explicit user approval.
  // See `.local/tasks/messages-realtime-final.md`.
  // ============================================================
  useEffect(() => {
    const handlePushTap = (e: Event) => {
      const detail: any = (e as CustomEvent).detail || {};
      const url = detail.url;
      if (!url || typeof url !== 'string') return;
      if (!url.includes('/messages')) return;
      const pushParams = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
      const pushContactId = pushParams.get('contactId');
      const pushPhone = pushParams.get('phone');
      const pushProjectId = pushParams.get('projectId');

      // Build a synthetic inbound message from the push payload and seed it
      // into the appropriate thread cache so the bubble appears the instant
      // the user taps the notification — no waiting for WS reconnect or the
      // per-thread GET on cellular. The synthetic uses the REAL DB id from
      // the push so the WS message.created handler dedups when it arrives.
      const seed = detail.seed || {};
      const notif = detail.notification || {};
      const msgBody: string = seed.body || notif.body || '';
      const msgId: number | undefined = typeof seed.messageId === 'number' ? seed.messageId : undefined;
      const msgPhone: string = seed.phoneNumber || pushPhone || '';
      const msgTimestamp: string = seed.timestamp || new Date().toISOString();
      const seedThreadCache = (key: any[], contactIdForMsg: number | null) => {
        if (!msgId) return;
        const synthetic: any = {
          id: msgId,
          userId: '',
          contactId: contactIdForMsg,
          phoneNumber: msgPhone,
          type: 'sms',
          direction: 'inbound',
          content: msgBody,
          isRead: false,
          timestamp: msgTimestamp,
          messageSid: null,
        };
        queryClient.setQueryData(key, (old: any) => {
          if (!Array.isArray(old)) return [synthetic];
          if (old.some((m: any) => m && m.id === msgId)) return old;
          return [...old, synthetic];
        });
      };

      if (pushProjectId) {
        const parsedPid = parseInt(pushProjectId);
        // Seed the project-thread cache before any selection logic so the
        // synthetic bubble is present whether or not we early-return.
        seedThreadCache(['/api/communications/project-thread', parsedPid], seed.contactId ?? null);
        const currentPid = selectedRef.current?.type === 'project' ? selectedRef.current.projectId : null;
        if (currentPid === parsedPid) return;
        projectIdRef.current = pushProjectId;
        if (!resolveAndSelectProject(parsedPid)) {
          // Render the right project pane immediately with a stub so the
          // thread query starts loading; the projectConversations effect
          // upgrades the stub once the real record arrives.
          pendingProjectIdRef.current = parsedPid;
          setSelected({ type: 'project', projectId: parsedPid, projectName: '', recipients: [] });
          dismissNotificationsByLink(`/messages?projectId=${parsedPid}`);
          queryClient.invalidateQueries({ queryKey: ['/api/communications/project-conversations'] });
        }
      } else if (pushContactId) {
        const parsedId = parseInt(pushContactId);
        // Seed the contact-thread cache before any selection logic.
        seedThreadCache(['/api/communications', parsedId], parsedId);
        const currentId = selectedRef.current?.type === 'contact' ? selectedRef.current.contact.id : null;
        if (currentId === parsedId) return;
        contactIdRef.current = pushContactId;
        const contact = conversationContactsRef.current?.find(c => c.id === parsedId);
        if (contact) {
          pendingContactIdRef.current = null;
          setSelected({ type: 'contact', contact });
          markAsRead({ contactId: contact.id });
          dismissNotificationsByLink(`/messages?contactId=${contact.id}`);
        } else {
          // Show the right thread instantly with a stub contact so the message
          // pane mounts on the correct conversation. The fetch below upgrades
          // it to the full Contact when it returns; the existing
          // conversationContacts/singleContact effect also enriches it.
          pendingContactIdRef.current = parsedId;
          setSelected({ type: 'contact', contact: makeStubContact(parsedId) });
          markAsRead({ contactId: parsedId });
          dismissNotificationsByLink(`/messages?contactId=${parsedId}`);
          fetch(`/api/contacts/${parsedId}`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(c => {
              if (c && pendingContactIdRef.current === parsedId) {
                pendingContactIdRef.current = null;
                contactIdRef.current = pushContactId;
                setSelected({ type: 'contact', contact: c });
              }
            })
            .catch(() => {});
        }
      } else if (pushPhone) {
        // Seed the phone-thread cache before any selection logic.
        seedThreadCache(['/api/communications/by-phone', pushPhone], null);
        const currentPhone = selectedRef.current?.type === 'phone' ? selectedRef.current.phoneNumber : null;
        if (currentPhone === pushPhone) return;
        phoneRef.current = pushPhone;
        pendingContactIdRef.current = null;
        setSelected({ type: 'phone', phoneNumber: pushPhone });
        markAsRead({ phoneNumber: pushPhone });
        dismissNotificationsByLink(`/messages?phone=${encodeURIComponent(pushPhone)}`);
      }
    };
    window.addEventListener('native-push-tapped', handlePushTap);
    return () => window.removeEventListener('native-push-tapped', handlePushTap);
  }, [setSelected, markAsRead, dismissNotificationsByLink, resolveAndSelectProject, queryClient]);

  // Self-healing deep-link recovery. The locked native-push-tapped handler above
  // catches the live event but can miss it in two real-world scenarios:
  //   1. Cold launch — the event fires before this component is mounted, OR
  //      auth restore strips the URL before Messages can read it.
  //   2. Bounce navigation — App.tsx's bounce dance unmounts/remounts Messages
  //      and dispatches inside RAF, so the new listener may not be attached
  //      when the event fires.
  // Fix: re-read the sessionStorage backup written by main.tsx after mount and
  // whenever the app becomes visible (e.g. tap notification → app resumes).
  // We replay through the same `native-push-tapped` event so the locked handler
  // owns all the actual selection logic — this effect only re-fires the trigger.
  useEffect(() => {
    const replayFromBackup = () => {
      try {
        const raw = sessionStorage.getItem('__pushDeepLink');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed?.url || typeof parsed.url !== 'string') return;
        if (Date.now() - (parsed.ts || 0) > 60_000) {
          sessionStorage.removeItem('__pushDeepLink');
          return;
        }
        if (!parsed.url.includes('/messages')) return;

        const sp = new URLSearchParams(parsed.url.includes('?') ? parsed.url.split('?')[1] : '');
        const cid = sp.get('contactId');
        const pid = sp.get('projectId');
        const ph = sp.get('phone');
        const cur = selectedRef.current;

        // If the right thread is already open, just clear the backup.
        const alreadyOpen =
          (pid && cur?.type === 'project' && cur.projectId === parseInt(pid)) ||
          (cid && cur?.type === 'contact' && cur.contact.id === parseInt(cid)) ||
          (ph && cur?.type === 'phone' && cur.phoneNumber === ph);
        if (alreadyOpen) {
          sessionStorage.removeItem('__pushDeepLink');
          return;
        }

        // Replay through the canonical event so the locked handler runs.
        // Forward the full seed payload so the cold-launch path also seeds
        // the thread cache (instant bubble) instead of waiting for fetch+WS.
        window.dispatchEvent(new CustomEvent('native-push-tapped', { detail: { url: parsed.url, seed: parsed } }));
      } catch {}
    };

    // Run shortly after mount so refs (selectedRef, conversationContactsRef) settle.
    const t = setTimeout(replayFromBackup, 150);

    // Replay whenever the app comes back to the foreground (push tap from
    // background resumes the WebView and fires visibilitychange).
    const onVis = () => {
      if (document.visibilityState === 'visible') replayFromBackup();
    };
    document.addEventListener('visibilitychange', onVis);

    // Capacitor App resume covers the native bridge case where visibilitychange
    // doesn't fire reliably (e.g. iOS PIP / split-view edge cases).
    let appResumeRemove: (() => void) | null = null;
    (async () => {
      try {
        const mod = await import('@capacitor/app');
        const App = (mod as any).App;
        if (App?.addListener) {
          const handle = await App.addListener('resume', replayFromBackup);
          appResumeRemove = () => { try { handle?.remove?.(); } catch {} };
        }
      } catch {}
    })();

    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVis);
      appResumeRemove?.();
    };
  }, []);

  // Clear the sessionStorage backup once the right thread is actually selected,
  // so a later cold launch with no fresh push doesn't re-open a stale thread.
  useEffect(() => {
    if (!selected) return;
    try {
      const raw = sessionStorage.getItem('__pushDeepLink');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.url || typeof parsed.url !== 'string') return;
      const sp = new URLSearchParams(parsed.url.includes('?') ? parsed.url.split('?')[1] : '');
      const cid = sp.get('contactId');
      const pid = sp.get('projectId');
      const ph = sp.get('phone');
      const matches =
        (pid && selected.type === 'project' && selected.projectId === parseInt(pid)) ||
        (cid && selected.type === 'contact' && selected.contact.id === parseInt(cid)) ||
        (ph && selected.type === 'phone' && selected.phoneNumber === ph);
      if (matches) sessionStorage.removeItem('__pushDeepLink');
    } catch {}
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const handlePush = () => {
      if (selected.type === 'contact') {
        dismissNotificationsByLink(`/messages?contactId=${selected.contact.id}`);
        markAsRead({ contactId: selected.contact.id });
      } else if (selected.type === 'phone') {
        dismissNotificationsByLink(`/messages?phone=${encodeURIComponent(selected.phoneNumber)}`);
        markAsRead({ phoneNumber: selected.phoneNumber });
      }
    };
    window.addEventListener('native-push-received', handlePush);
    return () => window.removeEventListener('native-push-received', handlePush);
  }, [selected, dismissNotificationsByLink, markAsRead]);

  const lastMarkedReadRef = useRef<{ key: string; count: number }>({ key: '', count: 0 });
  useEffect(() => {
    if (!selected || !communications || !Array.isArray(communications)) return;
    const unreadInbound = communications.filter((m: any) => m.direction === 'inbound' && !m.isRead);
    if (unreadInbound.length === 0) return;
    const selKey = selected.type === 'contact' ? `c-${selected.contact.id}` : selected.type === 'phone' ? `p-${selected.phoneNumber}` : `proj-${selected.projectId}`;
    const currentCount = unreadInbound.length;
    if (lastMarkedReadRef.current.key === selKey && lastMarkedReadRef.current.count === currentCount) return;
    lastMarkedReadRef.current = { key: selKey, count: currentCount };
    if (selected.type === 'contact') {
      markAsRead({ contactId: selected.contact.id });
    } else if (selected.type === 'phone') {
      markAsRead({ phoneNumber: selected.phoneNumber });
    } else if (selected.type === 'project' && selected.recipients.length > 0) {
      markAsRead({ contactId: selected.recipients[0].contactId });
    }
  }, [communications, selected, markAsRead]);

  const navigatingAwayRef = useRef(false);

  // Stable identifier for the currently-selected thread. Using this (instead
  // of the full `selected` object) as the effect dep prevents the back-
  // gesture handler from tearing down and re-arming when the SAME thread's
  // contact stub gets enriched with the real Contact record (e.g., right
  // after a push-notification tap, when /api/contacts/:id resolves and we
  // call setSelected with the real contact object). Re-running this effect
  // on stub→real swap caused a race where the cleanup's history.back()
  // fired a popstate that the freshly-registered popstate listener of the
  // re-run caught and immediately cleared `selected` — landing the user on
  // the messages list instead of the deep-linked conversation. See the
  // push-notification deep-link bug fix.
  const selectedThreadKey = selected
    ? selected.type === 'contact'
      ? `c-${selected.contact.id}`
      : selected.type === 'phone'
      ? `p-${selected.phoneNumber}`
      : selected.type === 'project'
      ? `pj-${selected.projectId}`
      : null
    : null;

  useEffect(() => {
    if (!selectedThreadKey) return;
    const isMobile = window.innerWidth < 1024;
    if (!isMobile) return;

    const isNative = (() => {
      const Cap = (window as any).Capacitor;
      return Cap?.isNativePlatform?.() || Cap?.isNative || false;
    })();

    navigatingAwayRef.current = false;

    if (isNative) {
      window.history.pushState({ messagesConversation: true }, '');
      let popped = false;
      const handlePopState = (e: PopStateEvent) => {
        popped = true;
        setSelected(null);
      };
      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
        const stillOnMessages = window.location.pathname === '/messages';
        if (!popped && !navigatingAwayRef.current && stillOnMessages) {
          window.history.back();
        }
      };
    } else {
      const handleSwipeBack = (e: Event) => {
        e.preventDefault();
        setSelected(null);
      };
      window.addEventListener('native-swipe-back', handleSwipeBack);
      return () => window.removeEventListener('native-swipe-back', handleSwipeBack);
    }
  }, [selectedThreadKey, setSelected]);

  const smsMessages = (Array.isArray(communications) ? communications : [])
    .filter(c => c.type === 'sms' || c.type === 'email' || c.type === 'call')
    .sort((a, b) => (parseUtcTimestamp(a.timestamp)?.getTime() || 0) - (parseUtcTimestamp(b.timestamp)?.getTime() || 0));

  const newMessageFilteredContacts = allContacts?.filter(c => {
    if (!newMessageSearch.trim()) return false;
    const q = newMessageSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  })?.slice(0, 8) || [];

  const isPhoneNumberFormat = (str: string) => /^[+\d\s()-]{7,}$/.test(str.trim());
  const normalizePhoneForMatch = (p: string) => (p || '').replace(/\D/g, '').slice(-10);

  const hasMatchingContactByPhone = (search: string): boolean => {
    const normalized = normalizePhoneForMatch(search);
    if (normalized.length < 7) return false;
    return (allContacts || []).some(c => c.phone && normalizePhoneForMatch(c.phone) === normalized);
  };

  const findContactByPhone = (search: string): Contact | undefined => {
    const normalized = normalizePhoneForMatch(search);
    if (normalized.length < 7) return undefined;
    return (allContacts || []).find(c => c.phone && normalizePhoneForMatch(c.phone) === normalized);
  };

  const handleSelectNewMessageContact = (contact: Contact) => {
    if (!contact.phone && !contact.email) {
      toast({ title: "No contact info", description: "This contact doesn't have a phone number or email address.", variant: "destructive" });
      return;
    }
    setSelected({ type: 'contact', contact });
    setShowNewMessage(false);
    setNewMessageSearch('');
    markAsRead({ contactId: contact.id });
  };

  const handleStartPhoneConversation = () => {
    const phone = newMessageSearch.trim();
    if (!phone) return;
    const matchingContact = findContactByPhone(phone);
    if (matchingContact) {
      setSelected({ type: 'contact', contact: matchingContact });
      markAsRead({ contactId: matchingContact.id });
    } else {
      setSelected({ type: 'phone', phoneNumber: phone });
    }
    setShowNewMessage(false);
    setNewMessageSearch('');
  };

  const handleDeleteConversationClick = (target: ConversationTarget) => {
    setConversationToDelete(target);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (conversationToDelete) {
      deleteConversation(conversationToDelete);
    }
    setShowDeleteConfirm(false);
    setConversationToDelete(null);
  };

  const handleTouchStart = (e: React.TouchEvent, itemId: string) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, id: itemId };
  };

  const handleTouchMove = (e: React.TouchEvent, itemId: string) => {
    if (!touchStartRef.current || touchStartRef.current.id !== itemId) return;
    const touch = e.touches[0];
    const deltaX = touchStartRef.current.x - touch.clientX;
    const deltaY = Math.abs(touchStartRef.current.y - touch.clientY);
    if (deltaY > 30) { touchStartRef.current = null; return; }
    if (deltaX > 60) { setSwipedItem(itemId); touchStartRef.current = null; }
    else if (deltaX < -30 && swipedItem === itemId) { setSwipedItem(null); touchStartRef.current = null; }
  };

  const handleTouchEnd = () => { touchStartRef.current = null; };

  useEffect(() => {
    if (!swipedItem) return;
    const dismiss = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-swipe-action]')) return;
      setSwipedItem(null);
    };
    const timer = setTimeout(() => {
      document.addEventListener('click', dismiss, true);
      document.addEventListener('touchstart', dismiss, true);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', dismiss, true);
      document.removeEventListener('touchstart', dismiss, true);
    };
  }, [swipedItem]);

  const getTargetPhone = (): string | null => {
    if (!selected) return null;
    if (selected.type === 'contact') return selected.contact.phone;
    if (selected.type === 'project') return projectSendRecipient?.phone || null;
    return selected.phoneNumber;
  };

  const handleSendToAll = async (text: string, mediaUrls: string[], recipients: Array<{ contactId: number; name: string; phone: string }>) => {
    if (!selected || selected.type !== 'project') return;

    const cacheKey = ['/api/communications/project-thread', selectedProjectId];
    const optimisticIds: number[] = [];
    const firstMediaUrl = mediaUrls[0] || null;

    for (const recipient of recipients) {
      const optimisticId = -(Date.now() + recipient.contactId);
      optimisticIds.push(optimisticId);
      const optimisticMsg: any = {
        id: optimisticId,
        userId: '',
        contactId: recipient.contactId,
        phoneNumber: recipient.phone,
        type: 'sms',
        direction: 'outbound',
        content: text,
        mediaUrl: firstMediaUrl,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        isRead: true,
        timestamp: new Date().toISOString(),
        messageSid: null,
        _optimistic: true,
        recipientName: recipient.name,
      };
      queryClient.setQueryData(cacheKey, (old: Communication[] | undefined) => {
        const arr = Array.isArray(old) ? old : [];
        return [...arr, optimisticMsg];
      });
    }

    const sendAllProjectId = selected.projectId;
    console.log(`[handleSendToAll] projectId=${sendAllProjectId}, recipients=${recipients.length}`);
    if (!sendAllProjectId) {
      console.error('[handleSendToAll] WARNING: No projectId on selected!', JSON.stringify(selected));
    }
    const results = await Promise.allSettled(
      recipients.map(recipient =>
        apiRequest('POST', '/api/twilio/send-sms', {
          to: recipient.phone,
          body: text,
          contactId: recipient.contactId,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          skipAutoSend: true,
          projectId: sendAllProjectId,
        })
      )
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    queryClient.setQueryData(cacheKey, (old: Communication[] | undefined) => {
      const arr = Array.isArray(old) ? old : [];
      return arr.filter((m: any) => !optimisticIds.includes(m.id));
    });

    await refetchComms();
    queryClient.invalidateQueries({ queryKey: ['/api/communications/project-conversations'] });

    if (failed === 0) {
      toast({ title: `Sent to all ${succeeded} recipients` });
    } else if (succeeded === 0) {
      toast({ title: "Failed to send", description: `All ${failed} messages failed`, variant: "destructive" });
    } else {
      toast({ title: `Sent to ${succeeded} of ${succeeded + failed}`, description: `${failed} failed`, variant: "destructive" });
    }
  };

  // handleSendToGroup removed — message_groups feature retired.

  const handleSend = (text: string, mediaUrls: string[], mediaContentTypes?: string[]) => {
    if (!selected || (!text.trim() && mediaUrls.length === 0)) return;

    if (selected.type === 'project' && projectSendRecipient?.contactId === -1) {
      const recipients = selected.recipients.filter(r => r.phone);
      if (recipients.length === 0) return;
      handleSendToAll(text, mediaUrls, recipients);
      return;
    }

    if (selected.type === 'project' && projectSendRecipient && projectSendRecipient.contactId !== -1) {
      setPendingSendData({ text, mediaUrls, mediaContentTypes });
      setShowRecipientWarning(true);
      return;
    }

    if (selected.type === 'contact' && (selected.contact as any).recipient_of_project_id) {
      setPendingSendData({ text, mediaUrls, mediaContentTypes });
      setShowRecipientWarning(true);
      return;
    }

    const contactIsEmailOnly = selected.type === 'contact' && !selected.contact.phone && !!selected.contact.email;

    if (contactIsEmailOnly) {
      const contactId = selected.contact.id;
      const emailAddr = selected.contact.email!;
      const companyName = settings?.companyName || '';

      const optimisticId = -(Date.now());
      const optimisticMsg: any = {
        id: optimisticId,
        userId: '',
        contactId,
        phoneNumber: emailAddr,
        type: 'email',
        direction: 'outbound',
        content: `Subject: Message from ${companyName}\n${text}`,
        isRead: true,
        timestamp: new Date().toISOString(),
        messageSid: null,
        _optimistic: true,
      };

      const cacheKey = ['/api/communications', selectedContactId];
      queryClient.setQueryData(cacheKey, (old: Communication[] | undefined) => {
        const arr = Array.isArray(old) ? old : [];
        return [...arr, optimisticMsg];
      });

      queryClient.setQueryData<ConversationContact[]>(
        ['/api/communications/conversation-contacts'],
        (old) => {
          if (!Array.isArray(old)) return old;
          const updated = old.map((c) =>
            c.id === contactId
              ? {
                  ...c,
                  last_message: `Subject: Message from ${companyName}\n${text}`,
                  last_message_time: new Date().toISOString(),
                  last_message_direction: 'outbound' as const,
                  last_message_type: 'email' as const,
                }
              : c
          );
          updated.sort((a, b) => {
            const ta = parseUtcTimestamp(a.last_message_time)?.getTime() || 0;
            const tb = parseUtcTimestamp(b.last_message_time)?.getTime() || 0;
            return tb - ta;
          });
          return updated;
        }
      );

      sendEmail({
        to: emailAddr,
        subject: `Message from ${companyName || 'your contractor'}`,
        body: text,
        fromName: companyName || undefined,
        contactId,
      }, {
        onSuccess: async () => {
          await refetchComms();
          queryClient.setQueryData(cacheKey, (old: Communication[] | undefined) => {
            const arr = Array.isArray(old) ? old : [];
            return arr.filter((m: any) => m.id !== optimisticId);
          });
          queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
        },
        onError: (error) => {
          queryClient.setQueryData(cacheKey, (old: Communication[] | undefined) => {
            const arr = Array.isArray(old) ? old : [];
            return arr.map((m: any) =>
              m.id === optimisticId ? { ...m, _optimistic: false, _failed: true, _errorMessage: error.message || 'Failed to send email' } : m
            );
          });
          toast({ title: "Failed to send email", description: error.message, variant: "destructive" });
        }
      });
      return;
    }

    const phone = getTargetPhone();
    if (!phone) return;

    const contactId = selected?.type === 'contact' 
      ? selected.contact.id 
      : selected?.type === 'project' 
        ? projectSendRecipient?.contactId 
        : undefined;

    const firstMediaUrl = (Array.isArray(mediaUrls) ? mediaUrls[0] : null) || null;
    let optimisticMediaType: string | undefined;
    if (mediaContentTypes && mediaContentTypes.length > 0) {
      const typeSet = new Set<string>();
      for (const ct of mediaContentTypes) {
        if (ct.startsWith('image/')) typeSet.add('image');
        else if (ct.startsWith('video/')) typeSet.add('video');
        else if (ct.startsWith('audio/')) typeSet.add('audio');
        else if (ct === 'application/pdf') typeSet.add('pdf');
      }
      if (typeSet.size > 1) optimisticMediaType = 'mixed';
      else if (typeSet.size === 1) optimisticMediaType = [...typeSet][0];
    } else if (firstMediaUrl) {
      optimisticMediaType = 'image';
    }
    const optimisticId = -(Date.now());
    const optimisticMsg: any = {
      id: optimisticId,
      userId: '',
      contactId: contactId || null,
      phoneNumber: phone,
      type: 'sms',
      direction: 'outbound',
      content: text,
      mediaUrl: firstMediaUrl,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      mediaContentTypes: mediaContentTypes && mediaContentTypes.length > 0 ? mediaContentTypes : undefined,
      mediaType: optimisticMediaType,
      isRead: true,
      timestamp: new Date().toISOString(),
      messageSid: null,
      _optimistic: true,
    };

    const getCacheKey = (): any[] | null => {
      if (selected?.type === 'contact') return ['/api/communications', selectedContactId];
      if (selected?.type === 'phone') return ['/api/communications/by-phone', selectedPhone];
      if (selected?.type === 'project') return ['/api/communications/project-thread', selectedProjectId];
      return null;
    };

    const cacheKey = getCacheKey();
    if (cacheKey) {
      // Cancel any in-flight thread fetch BEFORE writing the optimistic
      // bubble. On iOS, tapping Send closes the keyboard which fires a
      // window focus event; without this the focus-triggered GET would
      // race the optimistic write and clobber it (causing the bubble to
      // disappear for ~1-2s before WS sms.sent re-adds it). The query
      // also has refetchOnWindowFocus:false now, so this is belt-and-
      // suspenders against any other in-flight refetch.
      queryClient.cancelQueries({ queryKey: cacheKey });
      queryClient.setQueryData(cacheKey, (old: Communication[] | undefined) => {
        const arr = Array.isArray(old) ? old : [];
        return [...arr, optimisticMsg];
      });
    }

    if (contactId) {
      queryClient.setQueryData<ConversationContact[]>(
        ['/api/communications/conversation-contacts'],
        (old) => {
          if (!Array.isArray(old)) return old;
          const updated = old.map((c) =>
            c.id === contactId
              ? {
                  ...c,
                  last_message: text || (mediaUrls.length > 0 ? '📎 Media' : c.last_message),
                  last_message_time: new Date().toISOString(),
                  last_message_direction: 'outbound' as const,
                  last_message_type: 'sms' as const,
                }
              : c
          );
          updated.sort((a, b) => {
            const ta = parseUtcTimestamp(a.last_message_time)?.getTime() || 0;
            const tb = parseUtcTimestamp(b.last_message_time)?.getTime() || 0;
            return tb - ta;
          });
          return updated;
        }
      );
    }

    const safeMediaUrls = Array.isArray(mediaUrls) ? mediaUrls : [];
    const smsProjectId = selected?.type === 'project' ? selected.projectId : undefined;
    const smsPayload: any = {
      to: phone,
      body: text,
      contactId,
      mediaUrls: safeMediaUrls.length > 0 ? safeMediaUrls : undefined,
      mediaContentTypes: mediaContentTypes && mediaContentTypes.length > 0 ? mediaContentTypes : undefined,
    };
    if (smsProjectId) {
      smsPayload.projectId = smsProjectId;
    }
    sendSms(smsPayload, {
      onSuccess: (data: any) => {
        if (data?.alsoSentTo && data.alsoSentTo.length > 0) {
          const names = data.alsoSentTo.join(', ');
          toast({ title: "Also sent to " + names });
        }
        // Atomic swap: replace the optimistic placeholder with the real
        // row returned by the server (carries the real id + messageSid).
        // No refetch is awaited here — the realtime "sms.sent" event also
        // upserts into the same cache and is deduped by id, so whichever
        // arrives first wins and there is never a gap in the bubble.
        const realComm = data?.communication;
        if (cacheKey) {
          queryClient.setQueryData(cacheKey, (old: Communication[] | undefined) => {
            const arr = Array.isArray(old) ? old : [];
            const withoutOptimistic = arr.filter((m: any) => m.id !== optimisticId);
            if (!realComm) return withoutOptimistic;
            if (withoutOptimistic.some((m: any) => m.id === realComm.id)) return withoutOptimistic;
            return [...withoutOptimistic, realComm];
          });
        }
        queryClient.invalidateQueries({ queryKey: ['/api/communications/unknown-numbers'] });
        queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/communications/project-conversations'] });
      },
      onError: (error) => {
        if (cacheKey) {
          queryClient.setQueryData(cacheKey, (old: Communication[] | undefined) => {
            const arr = Array.isArray(old) ? old : [];
            return arr.map((m: any) =>
              m.id === optimisticId ? { ...m, _optimistic: false, _failed: true, _errorMessage: error.message || 'Failed to send' } : m
            );
          });
        }
        toast({ title: "Failed to send", description: error.message, variant: "destructive" });
      }
    });
  };

  const handleCallConfirm = () => {
    if (!selected) return;
    setShowCallConfirm(false);
    const phone = getTargetPhone();
    if (!phone) return;
    const callData: any = { to: phone };
    if (selected.type === 'contact') {
      callData.contactId = selected.contact.id;
      callData.contactName = selected.contact.name;
    }
    makeCall(callData, {
      onSuccess: (data: any) => {
        const name = selected.type === 'contact' ? selected.contact.name : phone;
        if (data.twoLeg) {
          toast({ title: "Calling your office first", description: `Answer to be connected to ${name}` });
        } else {
          toast({ title: "Call initiated", description: `Calling ${name}...` });
        }
        refetchComms();
      },
      onError: (error) => {
        toast({ title: "Failed to call", description: error.message, variant: "destructive" });
      }
    });
  };

  const handleRecipientWarningConfirm = async () => {
    if (!selected || !pendingSendData) return;
    try {
      if (selected.type === 'project' && projectSendRecipient) {
        const projectId = selected.projectId;
        const recipientContactId = projectSendRecipient.contactId;
        const recipientPhone = projectSendRecipient.phone;
        const recipientName = projectSendRecipient.name;
        try {
          const recipRes = await fetch(`/api/projects/${projectId}/recipients`, { credentials: 'include' });
          if (recipRes.ok) {
            const recips = await recipRes.json();
            const match = recips.find((r: any) => r.contactId === recipientContactId);
            if (match) {
              await apiRequest('DELETE', `/api/projects/${projectId}/recipients/${match.id}`);
              queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'recipients'] });
              queryClient.invalidateQueries({ queryKey: ['/api/communications/project-conversations'] });
              queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
            }
          }
        } catch (err) {
          console.error('Failed to remove from group:', err);
        }
        setShowRecipientWarning(false);
        const { text, mediaUrls, mediaContentTypes: pendingContentTypes } = pendingSendData;
        setPendingSendData(null);
        const contactRes = await fetch(`/api/contacts?search=${encodeURIComponent(recipientPhone)}`, { credentials: 'include' });
        if (contactRes.ok) {
          const contacts = await contactRes.json();
          const contactMatch = contacts.find((c: any) => c.id === recipientContactId);
          if (contactMatch) {
            setSelected({ type: 'contact', contact: contactMatch });
            setTimeout(() => {
              handleSend(text, Array.isArray(mediaUrls) ? mediaUrls : [], pendingContentTypes);
            }, 100);
            return;
          }
        }
        handleSend(text, Array.isArray(mediaUrls) ? mediaUrls : [], pendingContentTypes);
      } else if (selected.type === 'contact') {
        const projectId = (selected.contact as any).recipient_of_project_id;
        if (projectId) {
          try {
            const recipRes = await fetch(`/api/projects/${projectId}/recipients`, { credentials: 'include' });
            if (recipRes.ok) {
              const recips = await recipRes.json();
              const match = recips.find((r: any) => r.contactId === selected.contact.id);
              if (match) {
                await apiRequest('DELETE', `/api/projects/${projectId}/recipients/${match.id}`);
                queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'recipients'] });
                queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
              }
            }
          } catch (err) {
            console.error('Failed to remove from group:', err);
          }
        }
        (selected.contact as any).recipient_of_project_id = null;
        setShowRecipientWarning(false);
        const { text, mediaUrls, mediaContentTypes: pendingContentTypes } = pendingSendData;
        setPendingSendData(null);
        handleSend(text, Array.isArray(mediaUrls) ? mediaUrls : [], pendingContentTypes);
      }
    } catch (err) {
      console.error('Error in handleRecipientWarningConfirm:', err);
    }
  };

  const handleRecipientWarningCancel = () => {
    setShowRecipientWarning(false);
    setPendingSendData(null);
  };

  const resolveDocId = useCallback((info: ReturnType<typeof extractDocInfo>): string | null => {
    if (!info) return null;
    if (info.type === 'slug') return info.docId;
    const doc = (contactDocuments || []).find(d => d.publicToken === info.token);
    return doc ? String(doc.id) : null;
  }, [contactDocuments]);

  const handleExternalLink = useCallback((url: string) => {
    const Cap = (window as any).Capacitor;
    const isNative = Cap?.isNativePlatform?.() || Cap?.isNative || false;
    if (isNative) {
      import('@capacitor/browser').then(({ Browser }) => {
        Browser.open({ url });
      }).catch(() => {
        window.open(url, '_blank');
      });
    } else {
      window.open(url, '_blank');
    }
  }, []);

  const handleDocumentLinkClick = useCallback(async (e: React.MouseEvent, docInfo: ReturnType<typeof extractDocInfo>, docId: string | null) => {
    e.preventDefault();
    if (docId) {
      navigatingAwayRef.current = true;
      navigate(`/documents/${docId}`);
      return;
    }
    if (docInfo?.type === 'token') {
      try {
        const res = await fetch(`/api/documents/resolve-token/${docInfo.token}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.id) {
            navigatingAwayRef.current = true;
            navigate(`/documents/${data.id}`);
            return;
          }
        }
      } catch {}
    }
    navigatingAwayRef.current = true;
    navigate(`/documents`);
  }, [navigate]);

  const renderLinkedContent = useCallback((content: string, isOutbound: boolean) => {
    const parts = content.split(URL_REGEX);
    if (parts.length === 1) return content;
    return parts.map((part, i) => {
      if (URL_TEST.test(part)) {
        const docInfo = extractDocInfo(part);
        const docId = resolveDocId(docInfo);
        if (docInfo) {
          return (
            <a
              key={i}
              href={docId ? `/documents/${docId}` : '#'}
              onClick={(e) => handleDocumentLinkClick(e, docInfo, docId)}
              className={cn(
                "underline underline-offset-2 break-all",
                isOutbound ? "text-primary-foreground/90 hover:text-primary-foreground" : "text-primary hover:text-primary/80"
              )}
              data-testid={`link-internal-${i}`}
            >
              {part}
            </a>
          );
        }
        return (
          <a
            key={i}
            href={part}
            onClick={(e) => { e.preventDefault(); handleExternalLink(part); }}
            rel="noopener noreferrer"
            className={cn(
              "underline underline-offset-2 break-all",
              isOutbound ? "text-primary-foreground/90 hover:text-primary-foreground" : "text-primary hover:text-primary/80"
            )}
            data-testid={`link-external-${i}`}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  }, [navigate, resolveDocId, handleExternalLink, handleDocumentLinkClick]);

  const renderMedia = (msg: Communication) => {
    if (!msg.mediaUrl) return null;

    if (msg.mediaType === 'pdf') {
      return (
        <a
          href={msg.mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 mt-2 text-sm underline"
        >
          <FileText className="w-4 h-4" />
          View PDF
        </a>
      );
    }

    const urls = Array.isArray(msg.mediaUrls) && msg.mediaUrls.length > 0 ? msg.mediaUrls : [msg.mediaUrl!];
    const contentTypes = Array.isArray(msg.mediaContentTypes) ? msg.mediaContentTypes : undefined;
    const mediaItems = buildMediaItems(urls, contentTypes, msg.mediaType);

    if (mediaItems.length === 0) return null;

    return (
      <MessageMediaCarousel
        items={mediaItems}
        isOutbound={msg.direction === 'outbound'}
      />
    );
  };

  const isConversationSelected = !!selected;
  const mobileOverlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isConversationSelected) return;
    const isMobile = window.innerWidth < 1024;
    if (!isMobile) return;

    const el = mobileOverlayRef.current;
    const isCapacitor = !!(window as any).Capacitor;

    const applyHeight = (h: number, top = 0) => {
      if (!el) return;
      el.style.height = `${h}px`;
      el.style.top = `${top}px`;
      window.scrollTo(0, 0);
    };

    const setKeyboardOpen = (open: boolean) => {
      if (open) {
        document.documentElement.classList.add('keyboard-open');
      } else {
        document.documentElement.classList.remove('keyboard-open');
      }
    };

    applyHeight(window.innerHeight);

    if (isCapacitor) {
      let showListener: any;
      let hideListener: any;
      (async () => {
        try {
          const { Keyboard } = await import('@capacitor/keyboard');
          showListener = await Keyboard.addListener('keyboardWillShow', (info) => {
            setKeyboardOpen(true);
            applyHeight(window.innerHeight - info.keyboardHeight);
            requestAnimationFrame(() => {
              window.dispatchEvent(new CustomEvent('keyboard-did-resize', { detail: { open: true } }));
            });
          });
          hideListener = await Keyboard.addListener('keyboardWillHide', () => {
            setKeyboardOpen(false);
            applyHeight(window.innerHeight);
          });
        } catch (_) {}
      })();
      return () => {
        setKeyboardOpen(false);
        showListener?.remove?.();
        hideListener?.remove?.();
      };
    } else {
      const vv = window.visualViewport;
      if (!vv) return;
      const sync = () => {
        const kbOpen = (window.innerHeight - vv.height) > 50;
        setKeyboardOpen(kbOpen);
        applyHeight(vv.height, vv.offsetTop);
      };
      sync();
      vv.addEventListener('resize', sync);
      vv.addEventListener('scroll', sync);
      return () => {
        setKeyboardOpen(false);
        vv.removeEventListener('resize', sync);
        vv.removeEventListener('scroll', sync);
      };
    }
  }, [isConversationSelected]);

  if ((contactsLoading && !conversationContacts) || (settingsLoading && !settings)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }


  const mobileThreadPanel = isConversationSelected && selected && window.innerWidth < 1024 ? (
    <div
      ref={mobileOverlayRef}
      className="fixed left-0 right-0 z-40 flex flex-col bg-background lg:hidden"
      style={{ top: 0, height: '100dvh' }}
      data-testid="mobile-thread-overlay"
    >
      <div style={{ height: 'calc(3.5rem + env(safe-area-inset-top, 0px))', flexShrink: 0 }} />
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <MessageThread
          selected={selected}
          onBack={() => setSelected(null)}
          smsMessages={smsMessages}
          commsLoading={commsLoading}
          contactProject={contactProjectForPause}
          contactProjectRecipients={contactProjectRecipients || []}
          contactProjectId={contactProjectAny?.id}
          onAddRecipient={contactProjectAny?.id ? () => {
            setAddRecipientMode('contact');
            setAddRecipientName('');
            setAddRecipientPhone('');
            setAddRecipientEmail('');
            setAddRecipientAddress('');
            setAddRecipientCity('');
            setAddRecipientState('');
            setAddRecipientZip('');
            setAddRecipientSameAddress(false);
            setAddRecipientContactId(null);
            setShowAddRecipientDialog(true);
          } : undefined}
          onAddParticipant={(selected?.type === 'contact' && contactProjectAny?.id && !(contactProjectRecipients || []).length) ? () => {
            setAddParticipantMode('contact');
            setAddParticipantName('');
            setAddParticipantPhone('');
            setAddParticipantContactId(null);
            setShowAddParticipantDialog(true);
          } : undefined}
          onRemoveRecipient={selected?.type === 'contact' && contactProjectAny?.id ? (recipientId: number, recipientName: string) => {
            if (confirm(`Remove ${recipientName}? Messages will no longer be sent to them.`)) {
              removeRecipientMutation.mutate({ recipientId });
            }
          } : undefined}
          isCalling={isCalling}
          onCallClick={() => {
            const phone = getTargetPhone();
            if (!phone) return;
            if (isOpenPhoneProvider) {
              setShowOpenPhoneCallDialog(true);
            } else if (isTwilioConfigured) {
              setShowCallConfirm(true);
            } else {
              window.location.href = `tel:${phone}`;
            }
          }}
          onCreateContact={() => { setNewContactName(''); setShowCreateContact(true); }}
          renderLinkedContent={renderLinkedContent}
          renderMedia={renderMedia}
          canCall={settings?.phoneProvider !== 'openphone'}
          scheduledMessages={conversationScheduledMessages}
          onEditScheduled={(sm) => {
            setEditingScheduledMsg(sm);
            setEditScheduleBody(sm.body);
            const dt = parseUtcTimestamp(sm.scheduledAt) || new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            setEditScheduleDate(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`);
          }}
          onCancelScheduled={(id) => cancelScheduledMutation.mutate(id)}
          projectWarningName={projectSendRecipient && projectSendRecipient.contactId !== -1 ? maskName(projectSendRecipient.name) : null}
          onRetryMessage={handleRetryMessage}
        />
      </div>
      {isMessagingConfigured ? (
        <ComposeBar
          selected={selected}
          settings={settings}
          contactDocuments={contactDocuments}
          isSending={isSending}
          onSend={handleSend}
          initialDraft={params.get('draft') ? decodeURIComponent(params.get('draft')!) : undefined}
          retryDraft={retryDraft}
          onRetryDraftConsumed={() => setRetryDraft(undefined)}
          projectSendRecipient={projectSendRecipient}
          onProjectRecipientChange={setProjectSendRecipient}
        />
      ) : (
        <div className="border-t bg-yellow-500/5 border-yellow-500/30 px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0" />
            <p className="text-sm text-muted-foreground flex-1">
              Set up your phone integration to send messages.
            </p>
            <Link href="/settings/integrations">
              <Button size="sm" variant="outline" data-testid="link-setup-phone-inline-mobile">
                Set Up
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="flex flex-col lg:flex-row flex-1 min-h-0 h-full bg-background">
      {mobileThreadPanel}
      {/* Conversation list - hidden on mobile when conversation selected */}
      <div className={cn("w-full lg:w-80 border-b lg:border-b-0 lg:border-r bg-card", isConversationSelected && selected && window.innerWidth < 1024 && "hidden lg:block")} style={{ height: '100%' }}>
        <ConversationList
          contacts={conversationContacts || []}
          unknownConversations={unknownConversations || []}
          projectConversations={projectConversations || []}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selected={selected}
          onSelect={(target) => {
            setSelected(target);
            if (target.type === 'contact') {
              dismissNotificationsByLink(`/messages?contactId=${target.contact.id}`);
            } else if (target.type === 'phone') {
              dismissNotificationsByLink(`/messages?phone=${encodeURIComponent(target.phoneNumber)}`);
            }
          }}
          onNewMessage={() => {
            if (!isMessagingConfigured) {
              toast({ title: "Phone integration required", description: "Set up Twilio or OpenPhone in Settings > Integrations to send messages.", variant: "destructive" });
              return;
            }
            setShowNewMessage(true); setNewMessageSearch('');
          }}
          onDeleteConversation={handleDeleteConversationClick}
          swipedItem={swipedItem}
          setSwipedItem={setSwipedItem}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          markAsRead={markAsRead}
        />
      </div>

      <div className="hidden lg:flex lg:flex-col flex-1 min-h-0 bg-background">
        {isConversationSelected && selected ? (
          <>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <MessageThread
                selected={selected}
                onBack={() => setSelected(null)}
                smsMessages={smsMessages}
                commsLoading={commsLoading}
                contactProject={contactProjectForPause}
                contactProjectRecipients={contactProjectRecipients || []}
                contactProjectId={contactProjectAny?.id}
                onAddRecipient={contactProjectAny?.id ? () => {
                  setAddRecipientMode('contact');
                  setAddRecipientName('');
                  setAddRecipientPhone('');
                  setAddRecipientEmail('');
                  setAddRecipientAddress('');
                  setAddRecipientCity('');
                  setAddRecipientState('');
                  setAddRecipientZip('');
                  setAddRecipientSameAddress(false);
                  setAddRecipientContactId(null);
                  setShowAddRecipientDialog(true);
                } : undefined}
                onAddParticipant={(selected?.type === 'contact' && contactProjectAny?.id && !(contactProjectRecipients || []).length) ? () => {
                  setAddParticipantMode('contact');
                  setAddParticipantName('');
                  setAddParticipantPhone('');
                  setAddParticipantContactId(null);
                  setShowAddParticipantDialog(true);
                } : undefined}
                onRemoveRecipient={selected?.type === 'contact' && contactProjectAny?.id ? (recipientId: number, recipientName: string) => {
                  if (confirm(`Remove ${recipientName}? Messages will no longer be sent to them.`)) {
                    removeRecipientMutation.mutate({ recipientId });
                  }
                } : undefined}
                isCalling={isCalling}
                onCallClick={() => {
                  const phone = getTargetPhone();
                  if (!phone) return;
                  if (isOpenPhoneProvider) {
                    setShowOpenPhoneCallDialog(true);
                  } else if (isTwilioConfigured) {
                    setShowCallConfirm(true);
                  } else {
                    window.location.href = `tel:${phone}`;
                  }
                }}
                onCreateContact={() => { setNewContactName(''); setShowCreateContact(true); }}
                renderLinkedContent={renderLinkedContent}
                renderMedia={renderMedia}
                canCall={settings?.phoneProvider !== 'openphone'}
                scheduledMessages={conversationScheduledMessages}
                onEditScheduled={(sm) => {
                  setEditingScheduledMsg(sm);
                  setEditScheduleBody(sm.body);
                  const dt = parseUtcTimestamp(sm.scheduledAt) || new Date();
                  const pad = (n: number) => n.toString().padStart(2, '0');
                  setEditScheduleDate(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`);
                }}
                onCancelScheduled={(id) => cancelScheduledMutation.mutate(id)}
                projectWarningName={projectSendRecipient && projectSendRecipient.contactId !== -1 ? maskName(projectSendRecipient.name) : null}
                onRetryMessage={handleRetryMessage}
              />
            </div>
            {isMessagingConfigured ? (
              <ComposeBar
                selected={selected}
                settings={settings}
                contactDocuments={contactDocuments}
                isSending={isSending}
                onSend={handleSend}
                initialDraft={params.get('draft') ? decodeURIComponent(params.get('draft')!) : undefined}
                retryDraft={retryDraft}
                onRetryDraftConsumed={() => setRetryDraft(undefined)}
                projectSendRecipient={projectSendRecipient}
                onProjectRecipientChange={setProjectSendRecipient}
              />
            ) : (
              <div className="border-t bg-yellow-500/5 border-yellow-500/30 px-4 py-3">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0" />
                  <p className="text-sm text-muted-foreground flex-1">
                    Set up your phone integration to send messages.
                  </p>
                  <Link href="/settings/integrations">
                    <Button size="sm" variant="outline" data-testid="link-setup-phone-inline">
                      Set Up
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a conversation or start a new message</p>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showCallConfirm} onOpenChange={setShowCallConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Place a Call?
            </DialogTitle>
            <DialogDescription>
              You are about to place a call to {selected?.type === 'contact' ? maskName(selected.contact.name) : maskPhone(getTargetPhone())}
            </DialogDescription>
          </DialogHeader>
          {!hasOfficePhone && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Office phone not set. Go to Settings &gt; Integrations &gt; Twilio to add your office or cell number for call bridging.</span>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowCallConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleCallConfirm} disabled={!hasOfficePhone || isCalling} data-testid="button-confirm-call">
              <Phone className="w-4 h-4 mr-2" />
              Call via Office Phone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRecipientWarning} onOpenChange={(open) => { if (!open) handleRecipientWarningCancel(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Active Group Conversation
            </DialogTitle>
            <DialogDescription>
              {selected?.type === 'project' && projectSendRecipient
                ? `${maskName(projectSendRecipient.name)} is part of this group conversation. Sending here will remove them from the group and start a separate 1-on-1 conversation.`
                : selected?.type === 'contact' 
                  ? `${maskName(selected.contact.name)} is currently part of a group conversation. Sending a message here will remove them from that group and continue as a separate conversation.`
                  : 'Sending a message here will remove this person from the group and continue as a separate conversation.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleRecipientWarningCancel} data-testid="button-cancel-recipient-warning">
              Cancel
            </Button>
            <Button onClick={handleRecipientWarningConfirm} data-testid="button-confirm-recipient-warning">
              Remove & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showOpenPhoneCallDialog} onOpenChange={setShowOpenPhoneCallDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Call {selected?.type === 'contact' ? maskName(selected.contact.name) : maskPhone(getTargetPhone())}
            </DialogTitle>
            <DialogDescription>
              Your phone system is managed through OpenPhone. You can make the call from OpenPhone or use your device directly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button onClick={() => { setShowOpenPhoneCallDialog(false); window.open('https://app.openphone.com', '_blank'); }} data-testid="button-open-openphone">
              Open OpenPhone
            </Button>
            <Button variant="outline" onClick={() => { setShowOpenPhoneCallDialog(false); window.location.href = `tel:${getTargetPhone()}`; }} data-testid="button-call-device">
              <Phone className="w-4 h-4 mr-2" />
              Use Device to Call
            </Button>
            <Button variant="ghost" onClick={() => setShowOpenPhoneCallDialog(false)} data-testid="button-cancel-openphone">
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddParticipantDialog} onOpenChange={(open) => {
        setShowAddParticipantDialog(open);
        if (!open) { setAddParticipantName(''); setAddParticipantPhone(''); setAddParticipantContactId(null); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Person</DialogTitle>
            <DialogDescription>
              Add someone to this conversation. Messages will be sent to everyone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant={addParticipantMode === 'contact' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setAddParticipantMode('contact'); setAddParticipantContactId(null); setAddParticipantName(''); setAddParticipantPhone(''); }}
                data-testid="button-participant-mode-contact"
              >
                Pick Contact
              </Button>
              <Button
                variant={addParticipantMode === 'manual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setAddParticipantMode('manual'); setAddParticipantContactId(null); }}
                data-testid="button-participant-mode-manual"
              >
                Enter Details
              </Button>
            </div>

            {addParticipantMode === 'contact' ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Select a contact to add:</p>
                <div className="max-h-[200px] overflow-y-auto border rounded-md divide-y">
                  {allContacts?.filter(c =>
                    c.id !== (selected?.type === 'contact' ? selected.contact.id : -1) &&
                    c.phone
                  ).map(c => (
                    <button
                      key={c.id}
                      className={cn(
                        "w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 transition-colors",
                        addParticipantContactId === c.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      )}
                      onClick={() => {
                        setAddParticipantContactId(c.id);
                        setAddParticipantName(c.name);
                        setAddParticipantPhone(c.phone || '');
                      }}
                      data-testid={`select-participant-${c.id}`}
                    >
                      <User className="w-4 h-4 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{formatPhoneDisplay(c.phone)}</p>
                      </div>
                      {addParticipantContactId === c.id && <Check className="w-4 h-4 ml-auto text-primary flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium">Name</p>
                  <Input
                    value={addParticipantName}
                    onChange={(e) => setAddParticipantName(e.target.value)}
                    placeholder="Participant name"
                    data-testid="input-add-participant-name"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium">Phone</p>
                  <Input
                    value={addParticipantPhone}
                    onChange={(e) => setAddParticipantPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    inputMode="tel"
                    data-testid="input-add-participant-phone"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!addParticipantName.trim() || !addParticipantPhone.trim()) {
                  toast({ title: "Name and phone are required", variant: "destructive" });
                  return;
                }
                addParticipantMutation.mutate({
                  participantName: addParticipantName.trim(),
                  participantPhone: addParticipantPhone.trim(),
                  participantContactId: addParticipantContactId,
                });
              }}
              disabled={!addParticipantName.trim() || !addParticipantPhone.trim() || addParticipantMutation.isPending}
              data-testid="button-confirm-add-participant"
            >
              {addParticipantMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!recipientConflict} onOpenChange={(open) => { if (!open) setRecipientConflict(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Already Added</DialogTitle>
            <DialogDescription>
              <span className="font-semibold">{recipientConflict?.contactName}</span> is already added to <span className="font-semibold">"{recipientConflict?.existingProjectTitle}"</span>. Moving them here will remove them from that project. The old conversation will stay in your messages.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setRecipientConflict(null)}
              data-testid="button-cancel-move-recipient"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!recipientConflict) return;
                addParticipantMutation.mutate({
                  participantName: recipientConflict.participantName,
                  participantPhone: recipientConflict.participantPhone,
                  participantContactId: recipientConflict.participantContactId,
                  force: true,
                });
              }}
              disabled={addParticipantMutation.isPending}
              data-testid="button-confirm-move-recipient"
            >
              {addParticipantMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Move Here
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* showGroupManageModal Dialog removed — message_groups feature retired. */}

      <Dialog open={showRecipientManageModal} onOpenChange={setShowRecipientManageModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {selected?.type === 'contact' 
                ? `${maskName(selected.contact.name).split(' ')[0]} & ${(contactProjectRecipients || []).filter(r => r.contactId !== selected.contact.id).map(r => maskName(r.name).split(' ')[0]).join(', ')}`
                : 'Conversation'}
            </DialogTitle>
            <DialogDescription>
              Messages are sent to everyone in this conversation
            </DialogDescription>
          </DialogHeader>
          {selected?.type === 'contact' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between py-2 px-2 rounded-md">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{maskName(selected.contact.name)}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {(!selected.contact.phone && !!selected.contact.email) && <Mail className="w-3 h-3 text-blue-500" />}
                      {maskPhone(selected.contact.phone) || maskEmail(selected.contact.email)}
                    </p>
                  </div>
                </div>
              </div>
              {(contactProjectRecipients || []).filter(r => r.contactId !== selected.contact.id).map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{maskName(r.name)}</p>
                      <p className="text-xs text-muted-foreground">{maskPhone(r.phone)}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0 text-muted-foreground hover:text-red-500"
                    onClick={() => {
                      if (confirm(`Remove ${maskName(r.name)}? Messages will no longer be sent to them.`)) {
                        removeRecipientMutation.mutate({ recipientId: r.id });
                        setShowRecipientManageModal(false);
                      }
                    }}
                    data-testid={`button-manage-remove-recipient-${r.id}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* showAddMemberToGroupDialog and showCreateGroupDialog removed — message_groups feature retired. */}

      <Dialog open={showNewMessage} onOpenChange={(open) => { setShowNewMessage(open); if (!open) setNewMessageSearch(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription>
              Search for a contact or enter a phone number
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search contact or enter phone number..."
              value={newMessageSearch}
              onChange={(e) => setNewMessageSearch(e.target.value)}
              className="pl-9"
              autoFocus
              data-testid="input-new-message-search"
            />
          </div>
          {!newMessageSearch.trim() && (
            <p className="text-sm text-muted-foreground text-center py-3">
              Type a contact name or phone number to get started
            </p>
          )}
          {newMessageSearch.trim() && (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {newMessageFilteredContacts.map(contact => (
                <button
                  key={contact.id}
                  className="w-full p-3 text-left rounded-md hover-elevate flex items-center gap-3"
                  onClick={() => handleSelectNewMessageContact(contact)}
                  data-testid={`new-msg-contact-${contact.id}`}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{maskName(contact.name)}</p>
                    <p className="text-xs text-muted-foreground truncate">{maskPhone(contact.phone) || maskEmail(contact.email)}</p>
                  </div>
                </button>
              ))}
              {newMessageFilteredContacts.length === 0 && !isPhoneNumberFormat(newMessageSearch) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No contacts found. Enter a full phone number to message directly.
                </p>
              )}
              {isPhoneNumberFormat(newMessageSearch) && !hasMatchingContactByPhone(newMessageSearch) && (
                <button
                  className="w-full p-3 text-left rounded-md hover-elevate flex items-center gap-3 border border-dashed"
                  onClick={handleStartPhoneConversation}
                  data-testid="button-message-phone-number"
                >
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">Message {newMessageSearch.trim()}</p>
                    <p className="text-xs text-muted-foreground">Send to this phone number</p>
                  </div>
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={(open) => { setShowDeleteConfirm(open); if (!open) { setConversationToDelete(null); setSwipedItem(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Delete Conversation?
            </DialogTitle>
            <DialogDescription>
              {`This will permanently delete all messages with ${conversationToDelete?.type === 'contact' ? maskName(conversationToDelete.contact.name) : conversationToDelete?.type === 'phone' ? maskPhone(conversationToDelete.phoneNumber) : ''}. This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setConversationToDelete(null); setSwipedItem(null); }} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting} data-testid="button-confirm-delete">
              {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete Conversation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateContactDialog
        open={showCreateContact}
        onOpenChange={setShowCreateContact}
        hideTrigger
        defaultType="lead"
        defaultPhone={selectedPhone || ''}
        defaultName={newContactName || ''}
        onCreated={async (contact) => {
          setNewContactName('');
          setSelected({ type: 'contact', contact });
          const phoneToLink = selectedPhone;
          const invalidate = () => {
            queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
            queryClient.invalidateQueries({ queryKey: ['/api/communications/unknown-numbers'] });
            queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
            queryClient.invalidateQueries({ queryKey: ['/api/communications', contact.id] });
          };
          if (phoneToLink) {
            try {
              await apiRequest('POST', '/api/communications/link-to-contact', {
                phoneNumber: phoneToLink,
                contactId: contact.id,
              });
            } catch (err: any) {
              toast({
                title: "Contact created, but couldn't link past messages",
                description: err?.message || 'Please refresh to see the conversation.',
                variant: 'destructive',
              });
            } finally {
              invalidate();
            }
          } else {
            invalidate();
          }
        }}
      />

      <Dialog open={showAddRecipientDialog} onOpenChange={(open) => {
        setShowAddRecipientDialog(open);
        if (!open) { setAddRecipientName(''); setAddRecipientPhone(''); setAddRecipientEmail(''); setAddRecipientAddress(''); setAddRecipientCity(''); setAddRecipientState(''); setAddRecipientZip(''); setAddRecipientSameAddress(false); setAddRecipientContactId(null); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Recipient</DialogTitle>
            <DialogDescription>
              Add someone to also receive your messages for this conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant={addRecipientMode === 'contact' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setAddRecipientMode('contact'); setAddRecipientContactId(null); setAddRecipientName(''); setAddRecipientPhone(''); setAddRecipientEmail(''); setAddRecipientAddress(''); setAddRecipientCity(''); setAddRecipientState(''); setAddRecipientZip(''); setAddRecipientSameAddress(false); }}
                data-testid="button-recipient-mode-contact"
              >
                Pick Contact
              </Button>
              <Button
                variant={addRecipientMode === 'manual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setAddRecipientMode('manual'); setAddRecipientContactId(null); }}
                data-testid="button-recipient-mode-manual"
              >
                Enter Details
              </Button>
            </div>

            {addRecipientMode === 'contact' ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Select a contact:</p>
                <div className="max-h-[200px] overflow-y-auto border rounded-md divide-y">
                  {allContacts?.filter(c =>
                    c.id !== (selected?.type === 'contact' ? selected.contact.id : -1) &&
                    c.phone &&
                    !(contactProjectRecipients || []).some(r => r.contactId === c.id)
                  ).map(c => (
                    <button
                      key={c.id}
                      className={cn(
                        "w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 transition-colors",
                        addRecipientContactId === c.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      )}
                      onClick={() => {
                        setAddRecipientContactId(c.id);
                        setAddRecipientName(c.name);
                        setAddRecipientPhone(c.phone || '');
                      }}
                      data-testid={`select-recipient-${c.id}`}
                    >
                      <User className="w-4 h-4 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{formatPhoneDisplay(c.phone)}</p>
                      </div>
                      {addRecipientContactId === c.id && <Check className="w-4 h-4 ml-auto text-primary flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium">Name</p>
                  <Input
                    value={addRecipientName}
                    onChange={(e) => setAddRecipientName(e.target.value)}
                    placeholder="Recipient name"
                    data-testid="input-add-recipient-name"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium">Phone</p>
                  <Input
                    value={addRecipientPhone}
                    onChange={(e) => setAddRecipientPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    inputMode="tel"
                    data-testid="input-add-recipient-phone"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium">Email <span className="text-muted-foreground font-normal">(optional)</span></p>
                  <Input
                    value={addRecipientEmail}
                    onChange={(e) => setAddRecipientEmail(e.target.value)}
                    placeholder="email@example.com"
                    inputMode="email"
                    data-testid="input-add-recipient-email"
                  />
                </div>
                {selected?.type === 'contact' && selected.contact.address && (
                  <label className="flex items-center gap-2 cursor-pointer" data-testid="checkbox-same-address">
                    <input
                      type="checkbox"
                      checked={addRecipientSameAddress}
                      onChange={(e) => {
                        setAddRecipientSameAddress(e.target.checked);
                        if (e.target.checked) {
                          setAddRecipientAddress(selected.contact.address || '');
                          setAddRecipientCity(selected.contact.city || '');
                          setAddRecipientState(selected.contact.state || '');
                          setAddRecipientZip(selected.contact.zipCode || '');
                        } else {
                          setAddRecipientAddress('');
                          setAddRecipientCity('');
                          setAddRecipientState('');
                          setAddRecipientZip('');
                        }
                      }}
                      className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                    />
                    <span className="text-sm">Same address as {maskName(selected.contact.name)}</span>
                  </label>
                )}
                {!addRecipientSameAddress && (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Address</p>
                      <Input
                        value={addRecipientAddress}
                        onChange={(e) => setAddRecipientAddress(e.target.value)}
                        placeholder="123 Main St"
                        data-testid="input-add-recipient-address"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1 col-span-1">
                        <p className="text-xs font-medium">City</p>
                        <Input
                          value={addRecipientCity}
                          onChange={(e) => setAddRecipientCity(e.target.value)}
                          placeholder="City"
                          data-testid="input-add-recipient-city"
                        />
                      </div>
                      <div className="space-y-1 col-span-1">
                        <p className="text-xs font-medium">State</p>
                        <Input
                          value={addRecipientState}
                          onChange={(e) => setAddRecipientState(e.target.value)}
                          placeholder="State"
                          data-testid="input-add-recipient-state"
                        />
                      </div>
                      <div className="space-y-1 col-span-1">
                        <p className="text-xs font-medium">Zip</p>
                        <Input
                          value={addRecipientZip}
                          onChange={(e) => setAddRecipientZip(e.target.value)}
                          placeholder="Zip"
                          inputMode="numeric"
                          data-testid="input-add-recipient-zip"
                        />
                      </div>
                    </div>
                  </>
                )}
                {addRecipientSameAddress && selected?.type === 'contact' && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                    {[selected.contact.address, selected.contact.city, selected.contact.state, selected.contact.zipCode].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowAddRecipientDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!addRecipientName.trim()) {
                  toast({ title: "Name is required", variant: "destructive" });
                  return;
                }
                addRecipientMutation.mutate({
                  name: addRecipientName.trim(),
                  phone: addRecipientPhone.trim() || undefined,
                  email: addRecipientEmail.trim() || undefined,
                  address: addRecipientAddress.trim() || undefined,
                  city: addRecipientCity.trim() || undefined,
                  state: addRecipientState.trim() || undefined,
                  zipCode: addRecipientZip.trim() || undefined,
                  contactId: addRecipientContactId,
                });
              }}
              disabled={addRecipientMutation.isPending || !addRecipientName.trim()}
              data-testid="button-save-add-recipient"
            >
              {addRecipientMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Recipient
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingScheduledMsg} onOpenChange={(open) => { if (!open) { setEditingScheduledMsg(null); setEditScheduleDate(''); setEditScheduleBody(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Edit Scheduled Message
            </DialogTitle>
            <DialogDescription>
              Edit the message text and when it will be sent
            </DialogDescription>
          </DialogHeader>
          {editingScheduledMsg && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Message</label>
                <Textarea
                  value={editScheduleBody}
                  onChange={(e) => setEditScheduleBody(e.target.value)}
                  rows={4}
                  className="text-sm max-h-[200px] overflow-y-auto"
                  placeholder="Message text..."
                  data-testid="input-edit-schedule-body"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Send at</label>
                <input
                  type="datetime-local"
                  value={editScheduleDate}
                  onChange={(e) => setEditScheduleDate(e.target.value)}
                  min={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="input-edit-schedule-date"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setEditingScheduledMsg(null); setEditScheduleDate(''); setEditScheduleBody(''); }} data-testid="button-cancel-edit-schedule">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editingScheduledMsg) return;
                const hasNewDate = editScheduleDate && new Date(editScheduleDate) > new Date();
                const hasNewBody = editScheduleBody.trim() && editScheduleBody.trim() !== editingScheduledMsg.body;
                if (!hasNewDate && !hasNewBody) return;
                updateScheduledMutation.mutate({
                  id: editingScheduledMsg.id,
                  ...(hasNewDate ? { scheduledAt: new Date(editScheduleDate).toISOString() } : {}),
                  ...(hasNewBody ? { body: editScheduleBody.trim() } : {}),
                });
              }}
              disabled={(() => {
                if (updateScheduledMutation.isPending) return true;
                if (!editingScheduledMsg) return true;
                const hasNewDate = editScheduleDate && new Date(editScheduleDate) > new Date();
                const hasNewBody = editScheduleBody.trim() && editScheduleBody.trim() !== editingScheduledMsg.body;
                return !hasNewDate && !hasNewBody;
              })()}
              data-testid="button-save-schedule"
            >
              {updateScheduledMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface UserCapabilities {
  isOwner: boolean;
  role: string | null;
  capabilities: Record<string, boolean>;
}

export default function Messages() {
  const search = useSearch();
  const params = new URLSearchParams(search || window.location.search);
  const tabFromUrl = params.get('tab');
  const channelIdFromUrl = params.get('channelId');
  const parsedChannelId = channelIdFromUrl ? parseInt(channelIdFromUrl) : NaN;
  const teamChannelId = Number.isFinite(parsedChannelId) ? parsedChannelId : null;

  const { data: userCaps, isLoading: capsLoading } = useQuery<UserCapabilities>({
    queryKey: ['/api/user/capabilities'],
  });
  const { isAdmin } = useSubscription();

  const canViewCustomer = userCaps?.isOwner || userCaps?.capabilities?.viewCustomerMessages;
  // Team chat is hidden behind a feature flag while we polish it.
  // Admins can still access the live team chat for internal testing.
  // Owners (Elite) see the tab as "Coming Soon" — visible teaser, no functionality yet.
  const teamFeatureOn = FEATURE_FLAGS.TEAM_MESSAGES_ENABLED || !!isAdmin;
  const teamComingSoon = !teamFeatureOn && !!userCaps?.isOwner;
  const canViewTeam = (teamFeatureOn || teamComingSoon)
    && (userCaps?.isOwner || userCaps?.capabilities?.viewTeamMessages);

  const resolvedDefault = tabFromUrl === 'team' ? 'team' : 'customers';
  const [activeTab, setActiveTab] = useState<"customers" | "team">(resolvedDefault);

  useEffect(() => {
    if (tabFromUrl === 'team') {
      setActiveTab('team');
    }
  }, [tabFromUrl]);

  useEffect(() => {
    if (userCaps && !canViewCustomer && canViewTeam && activeTab === 'customers') {
      setActiveTab('team');
    }
  }, [userCaps, canViewCustomer, canViewTeam, activeTab]);

  const { data: unreadCounts } = useQuery<{ unreadTeamMessages: number }>({
    queryKey: ['/api/notifications/unread'],
  });
  const teamUnread = unreadCounts?.unreadTeamMessages ?? 0;

  useEffect(() => {
    if (canViewCustomer && activeTab === 'customers') {
      apiRequest('POST', '/api/communications/mark-all-read', { type: 'sms' })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
        })
        .catch(() => {});
    }
    if (canViewTeam && !teamComingSoon && activeTab === 'team') {
      apiRequest('POST', '/api/team/messages/mark-read', {})
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
          queryClient.invalidateQueries({ queryKey: ['/api/team/channels'] });
        })
        .catch(() => {});
    }
  }, [activeTab, canViewCustomer, canViewTeam, teamComingSoon]);

  const showTabs = canViewCustomer && canViewTeam;

  if (capsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {showTabs && (
        <div className="flex items-center border-b bg-card px-1 shrink-0">
          <button
            onClick={() => setActiveTab("customers")}
            className={cn(
              "flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors",
              activeTab === "customers"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            data-testid="tab-customers"
          >
            Customers
          </button>
          <button
            onClick={() => setActiveTab("team")}
            className={cn(
              "flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors relative",
              activeTab === "team"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            data-testid="tab-team"
          >
            Team
            {teamComingSoon && (
              <span className="ml-1.5 inline-flex items-center justify-center h-[18px] rounded-full bg-primary/10 text-primary text-[10px] font-semibold px-1.5" data-testid="badge-team-soon">
                Soon
              </span>
            )}
            {!teamComingSoon && teamUnread > 0 && activeTab !== "team" && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1" data-testid="badge-team-unread">
                {teamUnread > 99 ? '99+' : teamUnread}
              </span>
            )}
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0">
        {(activeTab === "team" && canViewTeam) ? (
          teamComingSoon ? (
            <div className="flex items-center justify-center h-full p-6">
              <Card className="max-w-md w-full border-primary/30">
                <CardContent className="pt-8 pb-8 text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Users className="w-7 h-7 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold" data-testid="text-team-coming-soon-title">Team Messages — Coming Soon</h2>
                    <p className="text-sm text-muted-foreground" data-testid="text-team-coming-soon-body">
                      Internal channels, direct messages, and team voice calling are on the way for your crew. We'll let you know as soon as it's ready.
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Included with your Elite plan when it launches.
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <TeamChatComponent initialChannelId={teamChannelId} />
          )
        ) : canViewCustomer ? (
          <CustomerMessages />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            You don't have access to messaging.
          </div>
        )}
      </div>
    </div>
  );
}
