import { useCallback, useEffect, useRef, useState } from 'react';

type NotificationType = 'message' | 'proposal_signed' | 'payment_received';

interface NotificationOptions {
  title: string;
  body: string;
  type: NotificationType;
}

// Tone options for each notification type
export const MESSAGE_TONES = {
  'ding-ding': { name: 'Ding Ding', frequencies: [1318.5, 1568], durations: [0.1, 0.15], delays: [0, 0.12] },
  'chime': { name: 'Chime', frequencies: [880, 1108.7, 1318.5], durations: [0.15, 0.15, 0.2], delays: [0, 0.1, 0.2] },
  'pop': { name: 'Pop', frequencies: [600, 900], durations: [0.05, 0.08], delays: [0, 0.06] },
  'bubble': { name: 'Bubble', frequencies: [400, 600, 800], durations: [0.08, 0.08, 0.1], delays: [0, 0.08, 0.16] },
  'alert': { name: 'Alert', frequencies: [1000, 1200], durations: [0.1, 0.15], delays: [0, 0.15] },
} as const;

export const PROPOSAL_TONES = {
  'celebration': { name: 'Celebration', frequencies: [523, 659, 784, 1047], durations: [0.15, 0.15, 0.15, 0.3], delays: [0, 0.12, 0.24, 0.36] },
  'success': { name: 'Success', frequencies: [440, 554, 659], durations: [0.2, 0.2, 0.3], delays: [0, 0.15, 0.3] },
  'fanfare': { name: 'Fanfare', frequencies: [392, 523, 659, 784], durations: [0.1, 0.1, 0.1, 0.25], delays: [0, 0.1, 0.2, 0.3] },
  'triumph': { name: 'Triumph', frequencies: [523, 659, 784, 1047, 1318], durations: [0.1, 0.1, 0.1, 0.15, 0.3], delays: [0, 0.08, 0.16, 0.24, 0.35] },
} as const;

export const PAYMENT_TONES = {
  'cash-register': { name: 'Cash Register', frequencies: [800, 1000, 1200, 800], durations: [0.08, 0.08, 0.08, 0.15], delays: [0, 0.08, 0.16, 0.28] },
  'coins': { name: 'Coins', frequencies: [1500, 1800, 2000, 1600, 1400], durations: [0.05, 0.05, 0.05, 0.05, 0.08], delays: [0, 0.04, 0.08, 0.12, 0.18] },
  'cha-ching': { name: 'Cha-Ching', frequencies: [600, 900, 1200], durations: [0.1, 0.1, 0.2], delays: [0, 0.12, 0.24] },
  'money': { name: 'Money', frequencies: [880, 1108, 1320, 1760], durations: [0.12, 0.12, 0.12, 0.2], delays: [0, 0.1, 0.2, 0.32] },
} as const;

export type MessageToneKey = keyof typeof MESSAGE_TONES;
export type ProposalToneKey = keyof typeof PROPOSAL_TONES;
export type PaymentToneKey = keyof typeof PAYMENT_TONES;

const NOTIFICATION_SOUNDS = {
  message: 440, // A4 note (fallback)
  proposal_signed: 523, // C5 note  
  payment_received: 659, // E5 note
};

// Default tone preferences
const DEFAULT_TONE_PREFS = {
  message: 'ding-ding' as MessageToneKey,
  proposal: 'celebration' as ProposalToneKey,
  payment: 'cash-register' as PaymentToneKey,
};

export type TonePreferences = typeof DEFAULT_TONE_PREFS;

// Get stored tone preferences with defaults
export function getTonePreferences(): TonePreferences {
  try {
    const stored = localStorage.getItem('notification_tones');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        message: (parsed.message && MESSAGE_TONES[parsed.message as MessageToneKey]) ? parsed.message : DEFAULT_TONE_PREFS.message,
        proposal: (parsed.proposal && PROPOSAL_TONES[parsed.proposal as ProposalToneKey]) ? parsed.proposal : DEFAULT_TONE_PREFS.proposal,
        payment: (parsed.payment && PAYMENT_TONES[parsed.payment as PaymentToneKey]) ? parsed.payment : DEFAULT_TONE_PREFS.payment,
      };
    }
  } catch (e) {}
  return { ...DEFAULT_TONE_PREFS };
}

// Save tone preferences
export function setTonePreference(type: 'message' | 'proposal' | 'payment', tone: string) {
  const prefs = getTonePreferences();
  prefs[type] = tone;
  localStorage.setItem('notification_tones', JSON.stringify(prefs));
}

// Play a specific tone by type and key
export function playTonePreview(
  type: 'message' | 'proposal' | 'payment', 
  toneKey: string,
  audioContext?: AudioContext
) {
  const ctx = audioContext || new (window.AudioContext || (window as any).webkitAudioContext)();
  
  let toneConfig: { frequencies: readonly number[]; durations: readonly number[]; delays: readonly number[] } | undefined;
  
  if (type === 'message') {
    toneConfig = MESSAGE_TONES[toneKey as MessageToneKey];
  } else if (type === 'proposal') {
    toneConfig = PROPOSAL_TONES[toneKey as ProposalToneKey];
  } else if (type === 'payment') {
    toneConfig = PAYMENT_TONES[toneKey as PaymentToneKey];
  }
  
  if (!toneConfig) return;
  
  toneConfig.frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    const startTime = ctx.currentTime + toneConfig!.delays[i];
    gain.gain.setValueAtTime(0.35, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + toneConfig!.durations[i]);
    osc.start(startTime);
    osc.stop(startTime + toneConfig!.durations[i]);
  });
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications');
      return false;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  }, []);

  const playSound = useCallback((type: NotificationType) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      const prefs = getTonePreferences();
      
      // Get the appropriate tone based on type and user preference
      let toneType: 'message' | 'proposal' | 'payment';
      let toneKey: string;
      
      if (type === 'message') {
        toneType = 'message';
        toneKey = prefs.message || 'ding-ding';
      } else if (type === 'proposal_signed') {
        toneType = 'proposal';
        toneKey = prefs.proposal || 'celebration';
      } else {
        toneType = 'payment';
        toneKey = prefs.payment || 'cash-register';
      }
      
      // Play the selected tone
      playTonePreview(toneType, toneKey, ctx);
      
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  }, []);

  const showNotification = useCallback(async ({ title, body, type }: NotificationOptions) => {
    // Always try to play sound
    playSound(type);

    // Show browser notification if permission granted
    if (permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: `${type}-${Date.now()}`,
        });
      } catch (error) {
        console.warn('Could not show notification:', error);
      }
    }
  }, [permission, playSound]);

  const notifyNewMessage = useCallback((contactName: string) => {
    showNotification({
      title: 'New Message',
      body: `New message from ${contactName}`,
      type: 'message',
    });
  }, [showNotification]);

  const notifyProposalSigned = useCallback((documentType: string, contactName: string) => {
    showNotification({
      title: 'Document Signed!',
      body: `${contactName} has signed the ${documentType}`,
      type: 'proposal_signed',
    });
  }, [showNotification]);

  const notifyPaymentReceived = useCallback((amount: number, contactName: string) => {
    showNotification({
      title: 'Payment Received!',
      body: `$${(amount / 100).toFixed(2)} received from ${contactName}`,
      type: 'payment_received',
    });
  }, [showNotification]);

  return {
    permission,
    requestPermission,
    showNotification,
    notifyNewMessage,
    notifyProposalSigned,
    notifyPaymentReceived,
    playSound,
  };
}

// Global notification state for tracking seen items
const seenMessages = new Set<number>();
const seenSignatures = new Set<number>();
const seenPayments = new Set<number>();

export function markMessageSeen(id: number) {
  seenMessages.add(id);
}

export function isMessageSeen(id: number) {
  return seenMessages.has(id);
}

export function markSignatureSeen(id: number) {
  seenSignatures.add(id);
}

export function isSignatureSeen(id: number) {
  return seenSignatures.has(id);
}

export function markPaymentSeen(id: number) {
  seenPayments.add(id);
}

export function isPaymentSeen(id: number) {
  return seenPayments.has(id);
}
