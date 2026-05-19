import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, CheckCircle, Send, UserX, Calendar, FileText, DollarSign } from "lucide-react";
import type { Appointment, Contact } from "@shared/schema";

interface ArrivalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: (Appointment & { contact: Contact }) | null;
  onStartAppointment: () => void;
  onDismiss: () => void;
}

export function ArrivalDialog({ open, onOpenChange, appointment, onStartAppointment, onDismiss }: ArrivalDialogProps) {
  if (!appointment) return null;

  const contact = appointment.contact;
  const clientName = contact.name || 'Unknown';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="dialog-arrival-detected">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-2">
            <MapPin className="w-6 h-6 text-green-500" />
          </div>
          <DialogTitle className="text-center">You have arrived at the appointment location.</DialogTitle>
          <DialogDescription className="text-center">
            {clientName} · {contact.address || 'No address'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-4">
          <Button
            onClick={onStartAppointment}
            className="w-full bg-green-600 hover:bg-green-700"
            data-testid="button-start-appointment-session"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Start Appointment
          </Button>
          <Button
            variant="outline"
            onClick={onDismiss}
            className="w-full"
            data-testid="button-dismiss-arrival"
          >
            Dismiss
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const RESULT_OPTIONS = [
  { value: 'sold', label: 'Sold', icon: DollarSign, color: 'text-green-500' },
  { value: 'proposal_sent', label: 'Proposal Sent', icon: Send, color: 'text-blue-500' },
  { value: 'follow_up_needed', label: 'Follow Up Needed', icon: FileText, color: 'text-amber-500' },
  { value: 'not_interested', label: 'Not Interested', icon: UserX, color: 'text-red-500' },
  { value: 'reschedule', label: 'Reschedule', icon: Calendar, color: 'text-purple-500' },
];

interface ResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectResult: (result: string) => void;
  isSubmitting?: boolean;
}

export function ResultDialog({ open, onOpenChange, onSelectResult, isSubmitting }: ResultDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="dialog-appointment-result">
        <DialogHeader>
          <DialogTitle className="text-center">Appointment Result</DialogTitle>
          <DialogDescription className="text-center">
            How did the appointment go?
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-4">
          {RESULT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <Button
                key={opt.value}
                variant="outline"
                className="w-full justify-start h-12 text-left"
                onClick={() => onSelectResult(opt.value)}
                disabled={isSubmitting}
                data-testid={`button-result-${opt.value}`}
              >
                <Icon className={`w-5 h-5 mr-3 ${opt.color}`} />
                <span className="text-sm font-medium">{opt.label}</span>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
