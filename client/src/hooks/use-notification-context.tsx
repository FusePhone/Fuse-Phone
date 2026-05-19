import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotifications, markMessageSeen, isMessageSeen, markSignatureSeen, isSignatureSeen, markPaymentSeen, isPaymentSeen } from '@/hooks/use-notifications';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  timestamp: Date;
}

interface DbNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  link?: string;
  readAt: string | null;
  createdAt: string;
}

interface Communication {
  id: number;
  contactId: number | null;
  phoneNumber: string | null;
  type: string;
  direction: string;
  content: string;
  timestamp: string;
  contact?: { name: string };
}

interface Document {
  id: number;
  contactId: number;
  type: string;
  status: string;
  signedAt: string | null;
  contact: { name: string };
}

interface Payment {
  id: number;
  documentId: number;
  amount: number;
  createdAt: string;
}

interface NotificationContextType {
  notifications: Notification[];
  notificationsEnabled: boolean;
  toggleNotifications: () => void;
  clearNotifications: () => void;
  dismissNotificationsByLink: (link: string) => void;
  dismissNotificationsByType: (type: string) => void;
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

function updateAppBadge(count: number) {
  try {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        (navigator as any).setAppBadge(count);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: count > 0 ? 'SET_BADGE' : 'CLEAR_BADGE',
        count: count,
      });
    }
  } catch (e) {}
}

function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
    return true;
  } catch (e) {
    console.error('Failed to play sound:', e);
    return false;
  }
}

interface UserCapabilities {
  isOwner: boolean;
  role: string | null;
  capabilities: Record<string, boolean>;
}

export function NotificationContextProvider({ children }: { children: React.ReactNode }) {
  const { permission, requestPermission, notifyNewMessage, notifyProposalSigned, notifyPaymentReceived } = useNotifications();
  const { toast } = useToast();
  const [currentLocation, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: userCaps } = useQuery<UserCapabilities>({
    queryKey: ['/api/user/capabilities'],
    enabled: !!user,
  });

  const canViewMessages = !userCaps || userCaps.isOwner || !!userCaps.capabilities.viewCustomerMessages;
  const canViewDocuments = !userCaps || userCaps.isOwner || !!userCaps.capabilities.viewDocuments;
  const canViewFinancials = !userCaps || userCaps.isOwner || !!userCaps.capabilities.viewFinancials;

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    try {
      const saved = localStorage.getItem('notification_history');
      if (saved) {
        const parsed = JSON.parse(saved)
          .filter((n: any) => n.type !== 'app_update')
          .map((n: any) => ({
            ...n,
            timestamp: new Date(n.timestamp)
          }));
        localStorage.setItem('notification_history', JSON.stringify(parsed));
        return parsed;
      }
    } catch (e) {}
    return [];
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem('notifications_enabled') === 'true';
  });
  
  const messagesInitialLoadRef = useRef(true);
  const signaturesInitialLoadRef = useRef(true);
  const paymentsInitialLoadRef = useRef(true);
  const pushSubscribedRef = useRef(false);
  const pushNavigatedUrlRef = useRef<string | null>(null);

  const { data: dbNotifications } = useQuery<DbNotification[]>({
    queryKey: ['/api/notifications'],
    enabled: !!user,
  });

  const dbNotificationsRef = useRef<DbNotification[]>([]);
  dbNotificationsRef.current = dbNotifications || [];

  const dismissNotificationsByLink = useCallback((link: string) => {
    setNotifications(prev => {
      const updated = prev.filter(n => n.link !== link);
      localStorage.setItem('notification_history', JSON.stringify(updated));
      updateAppBadge(updated.length);
      return updated;
    });
    const dbNotif = dbNotificationsRef.current.find(n => n.link === link && !n.readAt);
    if (dbNotif) {
      apiRequest("POST", `/api/notifications/${dbNotif.id}/read`);
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    }
  }, [queryClient]);

  const dismissNotificationsByType = useCallback((type: string) => {
    setNotifications(prev => {
      const updated = prev.filter(n => n.type !== type);
      localStorage.setItem('notification_history', JSON.stringify(updated));
      updateAppBadge(updated.length);
      return updated;
    });
  }, []);

  useEffect(() => {
    if (!notificationsEnabled || pushSubscribedRef.current) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    async function registerPush() {
      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        await navigator.serviceWorker.ready;

        if ('periodicSync' in registration) {
          try {
            await (registration as any).periodicSync.register('sync-data', {
              minInterval: 12 * 60 * 60 * 1000,
            });
            await (registration as any).periodicSync.register('check-notifications', {
              minInterval: 60 * 60 * 1000,
            });
          } catch (e) {
            console.log('[SW] Periodic sync not available:', e);
          }
        }

        const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
          console.warn('[Push] No VAPID public key available');
          return;
        }

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const urlBase64ToUint8Array = (base64String: string) => {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
              outputArray[i] = rawData.charCodeAt(i);
            }
            return outputArray;
          };

          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          });
        }

        const subJson = subscription.toJSON();
        await apiRequest('POST', '/api/push/subscribe', {
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys?.p256dh,
            auth: subJson.keys?.auth,
          },
        });

        pushSubscribedRef.current = true;
        console.log('[Push] Subscribed successfully');
      } catch (err) {
        console.error('[Push] Registration failed:', err);
      }
    }

    registerPush();
  }, [notificationsEnabled]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED') {
        queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'], refetchType: 'all' });
        queryClient.invalidateQueries({ queryKey: ['/api/communications/unknown-numbers'], refetchType: 'all' });
        queryClient.invalidateQueries({ queryKey: ['/api/communications/recent-incoming'], refetchType: 'all' });
        queryClient.invalidateQueries({ queryKey: ['/api/communications/by-phone'], refetchType: 'all' });
        queryClient.invalidateQueries({ queryKey: ['/api/communications/calls'], refetchType: 'all' });
        queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
        queryClient.invalidateQueries({ queryKey: ['/api/ai-drafts/pending'] });
        queryClient.invalidateQueries({ queryKey: ['/api/ai-actions'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/pipeline'] });
        return;
      }
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        pushNavigatedUrlRef.current = event.data.url;
        setTimeout(() => { pushNavigatedUrlRef.current = null; }, 5000);

        queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/communications/unknown-numbers'] });
        queryClient.invalidateQueries({ queryKey: ['/api/communications/recent-incoming'] });
        queryClient.invalidateQueries({ queryKey: ['/api/communications/calls'] });
        queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'], refetchType: 'all' });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'], refetchType: 'all' });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/pipeline'] });

        if (event.data.url.includes('tab=team')) {
          queryClient.invalidateQueries({ queryKey: ['/api/team/channels'], refetchType: 'all' });
        }

        dismissNotificationsByLink(event.data.url);

        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_BADGE' });
        }
        if (navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then(reg => {
            reg.getNotifications().then(notifications => {
              notifications.forEach(n => n.close());
            });
          });
        }

        setLocation(event.data.url);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [setLocation, queryClient, dismissNotificationsByLink]);

  const { data: messages } = useQuery<Communication[]>({
    queryKey: ['/api/communications/recent-incoming'],
    enabled: notificationsEnabled && canViewMessages,
  });

  const { data: signedDocs } = useQuery<Document[]>({
    queryKey: ['/api/documents/recently-signed'],
    enabled: notificationsEnabled && canViewDocuments,
  });

  const { data: payments } = useQuery<Payment[]>({
    queryKey: ['/api/payments/recent'],
    enabled: notificationsEnabled && canViewFinancials,
  });

  const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    const newNotification = {
      ...notification,
      id: `${notification.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    setNotifications(prev => {
      const updated = [newNotification, ...prev].slice(0, 50);
      localStorage.setItem('notification_history', JSON.stringify(updated));
      return updated;
    });
  }, []);

  useEffect(() => {
    const handleSwUpdate = () => {
      setNotifications(prev => {
        if (prev.some(n => n.type === 'app_update')) return prev;
        const updateNotif: Notification = {
          id: `app-update-${Date.now()}`,
          type: 'app_update',
          title: 'App update available',
          message: 'A new version is ready. Tap here to refresh.',
          timestamp: new Date(),
        };
        const updated = [updateNotif, ...prev].slice(0, 50);
        localStorage.setItem('notification_history', JSON.stringify(updated));
        return updated;
      });
    };

    window.addEventListener('sw-update-available', handleSwUpdate);
    return () => window.removeEventListener('sw-update-available', handleSwUpdate);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleControllerChange = () => {
      setNotifications(prev => {
        const updated = prev.filter(n => n.type !== 'app_update');
        localStorage.setItem('notification_history', JSON.stringify(updated));
        return updated;
      });
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }, []);

  useEffect(() => {
    const handleNativePush = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/unknown-numbers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/recent-incoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/by-phone'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/calls'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai-drafts/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai-actions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents/recently-signed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payments/recent'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });

      const data = detail?.data || detail;
      if (data?.title && data?.body) {
        const url = data.url || '';
        let notifType = 'message';
        if (url.includes('/documents/') || /proposal|estimate|invoice/i.test(data.title)) {
          notifType = url.includes('invoice') || /invoice|payment/i.test(data.title) ? 'payment' : 'proposal_signed';
        } else if (/payment|paid/i.test(data.title)) {
          notifType = 'payment';
        } else if (/signed|viewed|opened/i.test(data.title)) {
          notifType = 'proposal_signed';
        }
        addNotification({
          type: notifType,
          title: data.title,
          message: data.body,
          link: data.url,
          timestamp: new Date(),
        });
      }
    };

    let deferredTapTimer: ReturnType<typeof setTimeout> | null = null;
    // LOCKED — Task #37: This handler does NOT navigate. The single source
    // of truth for push-tap navigation is `usePendingPushNavigation` in
    // App.tsx. We only do cache invalidations and mark-as-read here so the
    // UI is fresh by the time the navigation lands. Do not re-introduce
    // setLocation here — it caused duplicate navigations and races.
    const handleNativeTap = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const url = detail?.url;
      if (url) {
        dismissNotificationsByLink(url);
        const tapParams = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
        const tapContactId = tapParams.get('contactId');
        const tapPhone = tapParams.get('phone');
        const tapProjectId = tapParams.get('projectId');
        if (tapContactId) {
          const cid = parseInt(tapContactId);
          queryClient.invalidateQueries({ queryKey: ['/api/communications', 'contact', cid] });
          queryClient.invalidateQueries({ queryKey: ['/api/communications', cid] });
        }
        if (tapPhone) {
          queryClient.invalidateQueries({ queryKey: ['/api/communications/by-phone'] });
        }
        if (tapProjectId) {
          queryClient.invalidateQueries({ queryKey: ['/api/communications/project-conversations'] });
          queryClient.invalidateQueries({ queryKey: ['/api/communications/project-thread', parseInt(tapProjectId)] });
        }
        queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'], refetchType: 'all' });
        if (deferredTapTimer) clearTimeout(deferredTapTimer);
        deferredTapTimer = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['/api/communications/unknown-numbers'] });
          queryClient.invalidateQueries({ queryKey: ['/api/communications/recent-incoming'] });
          queryClient.invalidateQueries({ queryKey: ['/api/communications/calls'] });
          queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
          queryClient.invalidateQueries({ queryKey: ['/api/notifications'], refetchType: 'all' });
          queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['/api/dashboard/pipeline'] });
          queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
          queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
          if (url.includes('tab=team')) {
            queryClient.invalidateQueries({ queryKey: ['/api/team/channels'], refetchType: 'all' });
          }
          if (url.includes('/messages/') || url.includes('/communications/')) {
            const contactMatch = url.match(/\/(?:messages|communications)\/(\d+)/);
            if (contactMatch) {
              queryClient.invalidateQueries({ queryKey: ['/api/communications', 'contact', parseInt(contactMatch[1])] });
            }
          }
        }, 1000);
      }
    };

    window.addEventListener('native-push-received', handleNativePush);
    window.addEventListener('native-push-tapped', handleNativeTap);
    return () => {
      window.removeEventListener('native-push-received', handleNativePush);
      window.removeEventListener('native-push-tapped', handleNativeTap);
      if (deferredTapTimer) clearTimeout(deferredTapTimer);
    };
  }, [queryClient, addNotification, dismissNotificationsByLink]);

  const wsSeenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!notificationsEnabled) return;

    const handleWsMessage = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const dedupKey = `${detail.contactId}-${detail.content?.substring(0, 30)}`;
      if (wsSeenIdsRef.current.has(dedupKey)) return;
      wsSeenIdsRef.current.add(dedupKey);
      if (wsSeenIdsRef.current.size > 200) {
        const arr = Array.from(wsSeenIdsRef.current);
        wsSeenIdsRef.current = new Set(arr.slice(arr.length - 100));
      }

      const contactName = detail.contactName || detail.phoneNumber || 'Unknown';
      const link = detail.contactId
        ? `/messages?contactId=${detail.contactId}`
        : detail.phoneNumber
          ? `/messages?phone=${encodeURIComponent(detail.phoneNumber)}`
          : '/messages';
      const isPushDuplicate = pushNavigatedUrlRef.current && pushNavigatedUrlRef.current === link;
      if (!isPushDuplicate) {
        notifyNewMessage(contactName);
        addNotification({
          type: 'message',
          title: `New message from ${contactName}`,
          message: (detail.content || '').substring(0, 100),
          link,
          timestamp: new Date(),
        });
      }
    };

    window.addEventListener('ws-incoming-message', handleWsMessage);
    return () => window.removeEventListener('ws-incoming-message', handleWsMessage);
  }, [notificationsEnabled, notifyNewMessage, addNotification]);

  useEffect(() => {
    if (!messages || !notificationsEnabled) return;
    
    if (messagesInitialLoadRef.current) {
      messagesInitialLoadRef.current = false;
      messages.forEach(m => markMessageSeen(m.id));
      return;
    }

    messages.forEach(msg => {
      if (!isMessageSeen(msg.id)) {
        markMessageSeen(msg.id);
        const dedupKey = `${msg.contactId}-${(msg.content || '').substring(0, 30)}`;
        if (wsSeenIdsRef.current.has(dedupKey)) return;

        const contactName = msg.contact?.name || msg.phoneNumber || 'Unknown';
        const link = msg.contactId
          ? `/messages?contactId=${msg.contactId}`
          : msg.phoneNumber
            ? `/messages?phone=${encodeURIComponent(msg.phoneNumber)}`
            : '/messages';
        const isPushDuplicate = pushNavigatedUrlRef.current && pushNavigatedUrlRef.current === link;
        if (!isPushDuplicate) {
          notifyNewMessage(contactName);
          addNotification({
            type: 'message',
            title: `New message from ${contactName}`,
            message: msg.content.substring(0, 100),
            link,
            timestamp: new Date(),
          });
        }
      }
    });
  }, [messages, notificationsEnabled, notifyNewMessage, addNotification]);

  useEffect(() => {
    if (!signedDocs || !notificationsEnabled) return;
    
    if (signaturesInitialLoadRef.current) {
      signaturesInitialLoadRef.current = false;
      signedDocs.forEach(d => markSignatureSeen(d.id));
      return;
    }

    signedDocs.forEach(doc => {
      if (!isSignatureSeen(doc.id)) {
        markSignatureSeen(doc.id);
      }
    });
  }, [signedDocs, notificationsEnabled]);

  useEffect(() => {
    if (!payments || !notificationsEnabled) return;
    
    if (paymentsInitialLoadRef.current) {
      paymentsInitialLoadRef.current = false;
      payments.forEach(p => markPaymentSeen(p.id));
      return;
    }

    payments.forEach(payment => {
      if (!isPaymentSeen(payment.id)) {
        markPaymentSeen(payment.id);
        const amountFormatted = `$${(payment.amount / 100).toFixed(2)}`;
        notifyPaymentReceived(payment.amount, 'Customer');
        addNotification({
          type: 'payment',
          title: `Payment received: ${amountFormatted}`,
          message: `You received a payment of ${amountFormatted}.`,
          link: `/documents/${payment.documentId}`,
          timestamp: new Date(),
        });
      }
    });
  }, [payments, notificationsEnabled, notifyPaymentReceived, addNotification]);

  const toggleNotifications = useCallback(async () => {
    if (!notificationsEnabled) {
      const soundPlayed = playNotificationSound();
      
      const notificationsSupported = 'Notification' in window;
      
      if (notificationsSupported && permission !== 'granted') {
        await requestPermission();
      }
      
      setNotificationsEnabled(true);
      localStorage.setItem('notifications_enabled', 'true');
      toast({
        title: "Notifications Enabled",
        description: soundPlayed 
          ? "You'll receive alerts for new messages, signatures, and payments." 
          : "Notifications are on, but sound may not work on this browser.",
      });
    } else {
      setNotificationsEnabled(false);
      localStorage.setItem('notifications_enabled', 'false');
      toast({
        title: "Notifications Disabled",
        description: "You won't receive alerts anymore.",
      });
    }
  }, [notificationsEnabled, permission, requestPermission, toast]);

  const clearNotifications = useCallback(async () => {
    setNotifications([]);
    localStorage.setItem('notification_history', JSON.stringify([]));
    updateAppBadge(0);

    queryClient.setQueryData<DbNotification[]>(['/api/notifications'], (old) =>
      (old || []).map(n => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
    );

    try {
      await apiRequest("POST", "/api/notifications/read-all");
    } catch {}
    queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
  }, [queryClient]);

  const prevLocationRef = useRef(currentLocation);
  useEffect(() => {
    if (currentLocation === prevLocationRef.current) return;
    prevLocationRef.current = currentLocation;

    if (currentLocation.startsWith('/messages')) {
      const params = new URLSearchParams(currentLocation.split('?')[1] || '');
      const contactId = params.get('contactId');
      const phone = params.get('phone');
      if (contactId) {
        dismissNotificationsByLink(`/messages?contactId=${contactId}`);
      } else if (phone) {
        dismissNotificationsByLink(`/messages?phone=${encodeURIComponent(phone)}`);
      }
    }

    if (currentLocation.startsWith('/calls')) {
      dismissNotificationsByType('missed_call');
    }

    setNotifications(prev => {
      const matching = prev.filter(n => n.link && currentLocation === n.link);
      if (matching.length === 0) return prev;
      const updated = prev.filter(n => !(n.link && currentLocation === n.link));
      localStorage.setItem('notification_history', JSON.stringify(updated));
      updateAppBadge(updated.length);
      for (const n of matching) {
        const dbNotif = dbNotificationsRef.current.find(d => d.link === n.link && !d.readAt);
        if (dbNotif) {
          apiRequest("POST", `/api/notifications/${dbNotif.id}/read`);
        }
      }
      if (matching.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      }
      return updated;
    });
  }, [currentLocation, dismissNotificationsByLink, dismissNotificationsByType, queryClient]);

  const unreadDbNotifications = useMemo(() => {
    return (dbNotifications || [])
      .filter(n => !n.readAt)
      .map(n => ({
        id: `db-${n.id}`,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        timestamp: new Date(n.createdAt),
      }));
  }, [dbNotifications]);

  const mergedNotifications = useMemo(() => {
    return [...notifications, ...unreadDbNotifications].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }, [notifications, unreadDbNotifications]);

  const unreadCount = mergedNotifications.length;

  useEffect(() => {
    updateAppBadge(unreadCount);
  }, [unreadCount]);

  return (
    <NotificationContext.Provider value={{
      notifications: mergedNotifications,
      notificationsEnabled,
      toggleNotifications,
      clearNotifications,
      dismissNotificationsByLink,
      dismissNotificationsByType,
      unreadCount,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within NotificationContextProvider');
  }
  return context;
}
