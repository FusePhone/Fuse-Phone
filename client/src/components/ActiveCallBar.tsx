import { useQuery } from "@tanstack/react-query";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneOff } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useCallEvents } from "@/hooks/use-call-events";

interface ActiveCallData {
  conferenceName: string;
  direction: 'inbound' | 'outbound';
  contactId?: number;
  contactName?: string;
  customerPhone: string;
  status: 'ringing' | 'in-progress' | 'completed';
  endReason?: string | null;
  participants: { label: string; phone: string; callSid?: string; role: string }[];
  startedAt: number;
}

export function ActiveCallBar() {
  useCallEvents();

  const { data: activeCall } = useQuery<ActiveCallData | null>({
    queryKey: ['/api/calls/active'],
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeCall || activeCall.status === 'completed') {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - activeCall.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall?.startedAt, activeCall?.status]);

  if (!activeCall) return null;

  const isCompleted = activeCall.status === 'completed';
  const isRinging = activeCall.status === 'ringing';
  const isInbound = activeCall.direction === 'inbound';

  if (isCompleted && !activeCall.endReason) return null;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const iconColor = isCompleted ? "text-red-400" : isRinging ? "text-amber-400" : "text-green-400";
  const iconBg = isCompleted ? "bg-red-500/20" : isRinging ? "bg-amber-500/20" : "bg-green-500/20";

  return (
    <Link href="/calls/active">
      <div
        className={cn(
          "mx-4 mt-2 lg:mx-6 lg:mt-3 rounded-xl p-3 flex items-center gap-3 cursor-pointer shadow-lg",
          isRinging && "animate-pulse"
        )}
        style={{ backgroundColor: '#232d3b' }}
        data-testid="banner-active-call"
      >
        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", iconBg)}>
          {isCompleted ? (
            <PhoneOff className={cn("w-4 h-4", iconColor)} />
          ) : isInbound ? (
            <PhoneIncoming className={cn("w-4 h-4", iconColor)} />
          ) : (
            <PhoneOutgoing className={cn("w-4 h-4", iconColor)} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {isCompleted
              ? "Call Ended"
              : isRinging
                ? (isInbound ? "Incoming Call" : "Calling...")
                : "Active Call"}
            {" — "}
            {activeCall.contactName || activeCall.customerPhone}
          </p>
          <p className={cn("text-xs", isCompleted ? "text-red-400" : "text-white/60")}>
            {isCompleted
              ? activeCall.endReason || "Call ended"
              : isRinging
                ? "Ringing..."
                : `${timeStr} · ${activeCall.participants.length} participant${activeCall.participants.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", iconBg)}>
          <Phone className={cn("w-4 h-4", iconColor)} />
        </div>
      </div>
    </Link>
  );
}
