import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock, Navigation, Phone, MessageSquare, User, CheckCircle } from "lucide-react";
import { parseISO, isBefore, startOfDay } from "date-fns";
import type { Appointment, Contact } from "@shared/schema";
import { useDemoMode } from "@/contexts/DemoModeContext";

export const appointmentTypeLabels: Record<string, string> = {
  estimate: 'Proposal',
  payment: 'Payment',
  walkthrough: 'Walk-Through',
  site_visit: 'On-Site Visit',
  callback: 'Callback',
  follow_up: 'Follow-Up',
  phone_call: 'Phone Call',
  text_schedule: 'Text Follow-Up',
  check_in: 'Check-In',
  other: 'Other',
};

export const appointmentTypeColors: Record<string, string> = {
  estimate: 'bg-blue-500',
  payment: 'bg-green-500',
  walkthrough: 'bg-purple-500',
  site_visit: 'bg-orange-500',
  callback: 'bg-amber-500',
  follow_up: 'bg-cyan-500',
  phone_call: 'bg-indigo-500',
  text_schedule: 'bg-teal-500',
  check_in: 'bg-rose-500',
  other: 'bg-gray-500',
};

const ON_SITE_TYPES = ['estimate', 'walkthrough', 'site_visit', 'other'];
const CALL_TYPES = ['payment', 'callback', 'follow_up', 'phone_call', 'check_in'];
const TEXT_TYPES = ['text_schedule'];

function buildAddress(contact: Contact, project?: { jobAddress?: string | null; jobCity?: string | null; jobState?: string | null } | null): string {
  const addr = project?.jobAddress || contact.address;
  const city = project?.jobCity || contact.city;
  const state = project?.jobState || contact.state;
  return [addr, city, state].filter(Boolean).join(', ');
}

type AppointmentWithContact = Appointment & { contact: Contact; assignedToName?: string | null };

interface AppointmentCardProps {
  appointment: AppointmentWithContact;
  project?: { jobAddress?: string | null; jobCity?: string | null; jobState?: string | null } | null;
  hasPhoneIntegration?: boolean;
  onNavigateToMessages?: (contactId: number, call?: boolean) => void;
  onClick?: () => void;
  compact?: boolean;
}

export function AppointmentCard({
  appointment: appt,
  project,
  hasPhoneIntegration,
  onNavigateToMessages,
  onClick,
  compact = false,
}: AppointmentCardProps) {
  const { maskName, maskAddress, maskCity } = useDemoMode();
  const fullAddr = buildAddress(appt.contact, project);
  const isOnSite = ON_SITE_TYPES.includes(appt.type);
  const isCallType = CALL_TYPES.includes(appt.type);
  const isTextType = TEXT_TYPES.includes(appt.type);
  const phone = appt.contact.phone;
  const isPast = appt.date ? isBefore(parseISO(appt.date), startOfDay(new Date())) : false;
  const isInactive = isPast || appt.status === 'completed' || appt.status === 'cancelled';

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all",
        !isInactive && "cursor-pointer hover:shadow-md active:scale-[0.99]",
        isInactive && "opacity-80",
        appt.status === 'completed' && "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
        appt.status === 'cancelled' && "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 opacity-60",
        appt.status === 'pending_ai' && "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800",
        isPast && appt.status === 'scheduled' && "bg-muted/50 border-muted-foreground/20",
        appt.status === 'scheduled' && !isPast && "bg-card",
        compact && "p-3"
      )}
      onClick={isInactive ? undefined : onClick}
      data-testid={`appointment-card-${appt.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge className={cn("text-[11px] font-medium text-white", appointmentTypeColors[appt.type] || 'bg-gray-500')}>
              {appointmentTypeLabels[appt.type] || appt.type}
            </Badge>
            {appt.status === 'completed' && (
              <Badge variant="outline" className="text-[11px] text-green-600 border-green-300 dark:text-green-400">Done</Badge>
            )}
            {appt.status === 'cancelled' && (
              <Badge variant="outline" className="text-[11px] text-red-600 border-red-300 dark:text-red-400">Cancelled</Badge>
            )}
            {appt.status === 'pending_ai' && (
              <Badge variant="outline" className="text-[11px] text-purple-600 border-purple-300 dark:text-purple-400">AI Suggested</Badge>
            )}
            {isPast && appt.status === 'scheduled' && (
              <Badge variant="outline" className="text-[11px] text-muted-foreground border-muted-foreground/30">Past</Badge>
            )}
          </div>
          <p className={cn("font-semibold leading-tight truncate", compact ? "text-sm" : "text-[15px]")} data-testid={`text-appt-contact-${appt.id}`}>
            {maskName(appt.contact.name)}
          </p>
          {appt.time && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1.5" data-testid={`text-appt-time-${appt.id}`}>
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              {appt.time}
            </p>
          )}
          {appt.assignedToName && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1" data-testid={`text-appt-assignee-${appt.id}`}>
              {appt.status === 'completed' ? (
                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 text-green-500" />
              ) : (
                <User className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              {appt.status === 'completed' ? `Done by ${appt.assignedToName}` : appt.assignedToName}
            </p>
          )}
          {appt.status === 'completed' && !appt.assignedToName && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 text-green-500" />
              Completed
            </p>
          )}
          {appt.notes && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-1" data-testid={`text-appt-notes-${appt.id}`}>{appt.notes}</p>
          )}
        </div>
        {appt.status === 'scheduled' && !isPast && !compact && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isOnSite && fullAddr && (
              <Button
                size="icon"
                className="h-9 w-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                onClick={(e) => { e.stopPropagation(); window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddr)}`, '_blank'); }}
                data-testid={`button-navigate-${appt.id}`}
              >
                <Navigation className="w-4 h-4" />
              </Button>
            )}
            {isCallType && phone && onNavigateToMessages && (
              <Button
                size="icon"
                className="h-9 w-9 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-sm"
                onClick={(e) => { e.stopPropagation(); hasPhoneIntegration ? onNavigateToMessages(appt.contactId, true) : window.open(`tel:${phone}`, '_self'); }}
                data-testid={`button-call-${appt.id}`}
              >
                <Phone className="w-4 h-4" />
              </Button>
            )}
            {isTextType && phone && onNavigateToMessages && (
              <Button
                size="icon"
                className="h-9 w-9 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-sm"
                onClick={(e) => { e.stopPropagation(); hasPhoneIntegration ? onNavigateToMessages(appt.contactId) : window.open(`sms:${phone}`, '_self'); }}
                data-testid={`button-text-${appt.id}`}
              >
                <MessageSquare className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
        {isInactive && !compact && (
          <div className="flex-shrink-0">
            {appt.status === 'completed' && (
              <CheckCircle className="w-5 h-5 text-green-500" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
