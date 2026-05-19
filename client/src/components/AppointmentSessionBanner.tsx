import { useQuery } from "@tanstack/react-query";
import { MapPin, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import type { AppointmentSession, Appointment, Contact } from "@shared/schema";

type ActiveSession = AppointmentSession & {
  appointment: Appointment & { contact: Contact };
};

interface AppointmentSessionBannerProps {
  onFinish?: (session: ActiveSession) => void;
  hidden?: boolean;
}

export function AppointmentSessionBanner({ onFinish, hidden }: AppointmentSessionBannerProps) {
  const { data: session } = useQuery<ActiveSession | null>({
    queryKey: ["/api/appointment-sessions/active"],
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!session || session.status !== 'active') {
      setElapsed(0);
      return;
    }
    const startMs = new Date(session.startTime).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session?.id, session?.startTime, session?.status]);

  if (!session || session.status !== 'active' || hidden) return null;

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const timeStr = hours > 0
    ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const contact = session.appointment?.contact;
  const clientName = contact?.name || 'Unknown';
  const address = contact?.address || '';

  return (
    <div
      className="mx-4 mt-2 lg:mx-6 lg:mt-3 rounded-xl p-3 flex items-center gap-3 shadow-lg"
      style={{ backgroundColor: '#1e3a2f' }}
      data-testid="banner-appointment-session"
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-green-500/20">
        <MapPin className="w-4 h-4 text-green-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">
          Appointment in Progress
        </p>
        <p className="text-xs text-gray-300 truncate">
          Client: {clientName}
          {address ? ` · ${address}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1 text-green-400">
          <Clock className="w-3.5 h-3.5" />
          <span className="text-sm font-mono font-semibold" data-testid="text-appointment-elapsed">{timeStr}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs border-green-500/50 text-green-400 hover:bg-green-500/20 hover:text-green-300"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFinish?.(session);
          }}
          data-testid="button-finish-appointment"
        >
          <CheckCircle className="w-3 h-3 mr-1" />
          Finish
        </Button>
      </div>
    </div>
  );
}
