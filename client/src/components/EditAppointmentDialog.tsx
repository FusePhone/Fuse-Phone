import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TeamMember } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Loader2, AlertTriangle, Trash2, MapPin, Phone, MessageSquare, CalendarIcon, Image, Navigation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseISO, isBefore, format } from "date-fns";
import { useLocation } from "wouter";
import { useCompanySettings } from "@/hooks/use-company-settings";
import type { Appointment } from "@shared/schema";

// Generate 15-minute increment time options
const TIME_OPTIONS = (() => {
  const options: { value: string; label: string }[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const h = hour.toString().padStart(2, '0');
      const m = minute.toString().padStart(2, '0');
      const value = `${h}:${m}`;
      const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const ampm = hour < 12 ? 'AM' : 'PM';
      const label = `${hour12}:${m} ${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
})();

const appointmentSchema = z.object({
  type: z.string().min(1, "Type is required"),
  date: z.string().min(1, "Date is required"),
  time: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
  assignedToId: z.number().nullable().optional(),
});

type AppointmentFormData = z.infer<typeof appointmentSchema>;

interface BookingRequestInfo {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  requestedDate?: string;
  requestedTime?: string;
  alternateDate?: string;
  alternateTime?: string;
  projectDescription?: string;
  uploadedFiles?: string[];
}

interface EditAppointmentDialogProps {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName?: string;
  contactAddress?: string;
  contactPhone?: string;
  bookingRequest?: BookingRequestInfo | null;
  onDelete?: (id: number) => void;
}

const appointmentTypes = [
  { value: 'estimate', label: 'Proposal (On-Site)' },
  { value: 'payment', label: 'Collect Payment' },
  { value: 'walkthrough', label: 'Final Walk-Through' },
  { value: 'site_visit', label: 'On-Site Visit' },
  { value: 'callback', label: 'Callback' },
  { value: 'follow_up', label: 'Follow-Up' },
  { value: 'phone_call', label: 'Phone Call' },
  { value: 'text_schedule', label: 'Text Follow-Up' },
  { value: 'check_in', label: 'Check-In' },
  { value: 'other', label: 'Other' },
];

export function EditAppointmentDialog({ 
  appointment,
  open,
  onOpenChange,
  contactName,
  contactAddress,
  contactPhone,
  bookingRequest,
  onDelete,
}: EditAppointmentDialogProps) {
  const [showDelayWarning, setShowDelayWarning] = useState(false);
  const [pendingData, setPendingData] = useState<AppointmentFormData | null>(null);
  const [notifyOnSave, setNotifyOnSave] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: companySettings } = useCompanySettings();
  const hasPhoneIntegration = !!(companySettings?.twilioPhoneNumber || (companySettings as any)?.openphonePhoneNumber);
  const displayPhone = contactPhone || bookingRequest?.phone;
  const bookingAddr = bookingRequest ? [bookingRequest.address, bookingRequest.city, bookingRequest.state, bookingRequest.zipCode].filter(Boolean).join(', ') : '';
  const displayAddress = contactAddress || bookingAddr || undefined;

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
    enabled: open,
  });

  const form = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      type: 'estimate',
      date: '',
      time: '',
      notes: '',
      status: 'scheduled',
      assignedToId: null,
    },
  });

  useEffect(() => {
    if (appointment && open) {
      form.reset({
        type: appointment.type as any,
        date: appointment.date,
        time: appointment.time || '',
        notes: appointment.notes || '',
        status: appointment.status as 'scheduled' | 'completed' | 'cancelled',
        assignedToId: appointment.assignedToId ?? null,
      });
    }
  }, [appointment, open, form]);

  const isCancelled = appointment?.status === 'cancelled';
  const isCompleted = appointment?.status === 'completed';

  const updateMutation = useMutation({
    mutationFn: async (data: AppointmentFormData & { sendNotification?: boolean }) => {
      const res = await apiRequest('PUT', `/api/appointments/${appointment?.id}`, data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      const msg = data?.notifyMsg ? ` ${data.notifyMsg}` : '';
      toast({ title: `Appointment updated.${msg}` });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update appointment", description: error.message, variant: "destructive" });
    },
  });

  const notifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/appointments/${appointment?.id}/notify`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: data?.message || "Notification sent" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send notification", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: AppointmentFormData) => {
    if (!appointment) return;

    const originalDate = parseISO(appointment.date);
    const newDate = parseISO(data.date);

    if (isBefore(originalDate, newDate)) {
      setPendingData(data);
      setShowDelayWarning(true);
      return;
    }

    updateMutation.mutate({ ...data, sendNotification: notifyOnSave });
  };

  const confirmDelay = () => {
    if (pendingData) {
      updateMutation.mutate({ ...pendingData, sendNotification: notifyOnSave });
    }
    setShowDelayWarning(false);
    setPendingData(null);
  };

  const cancelDelay = () => {
    setShowDelayWarning(false);
    setPendingData(null);
  };

  if (!appointment) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Appointment{contactName ? ` for ${contactName}` : ''}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {(displayAddress || displayPhone) && (
              <div className="space-y-1.5">
                {displayAddress && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm text-muted-foreground" data-testid="text-edit-appt-address">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1 break-words">{displayAddress}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1"
                      onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayAddress)}`, '_blank')}
                      data-testid="button-navigate-edit-appt"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Navigate</span>
                    </Button>
                  </div>
                )}
                {displayPhone && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm text-muted-foreground" data-testid="text-edit-appt-phone">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1">{displayPhone}</span>
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs gap-1"
                        onClick={() => appointment && (hasPhoneIntegration ? setLocation(`/messages?contactId=${appointment.contactId}&call=1`) : window.open(`tel:${displayPhone}`, '_self'))}
                        data-testid="button-call-edit-appt"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-xs gap-1"
                        onClick={() => appointment && (hasPhoneIntegration ? setLocation(`/messages?contactId=${appointment.contactId}`) : window.open(`sms:${displayPhone}`, '_self'))}
                        data-testid="button-text-edit-appt"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Text</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {bookingRequest?.alternateDate && (
              <div className="px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm" data-testid="text-edit-appt-alt-dates">
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-0.5">Alternate Date Suggested</p>
                <p className="text-blue-600 dark:text-blue-400">
                  {(() => { try { return format(parseISO(bookingRequest.alternateDate), 'EEEE, MMM d, yyyy'); } catch { return bookingRequest.alternateDate; } })()}
                  {bookingRequest.alternateTime ? ` at ${bookingRequest.alternateTime}` : ''}
                </p>
              </div>
            )}

            {bookingRequest?.uploadedFiles && bookingRequest.uploadedFiles.length > 0 && (
              <div className="space-y-1.5" data-testid="edit-appt-photos">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5" />
                  Submitted Photos ({bookingRequest.uploadedFiles.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {bookingRequest.uploadedFiles.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Photo ${i + 1}`}
                      className="w-20 h-20 rounded-lg object-cover border cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => window.open(url, '_blank')}
                    />
                  ))}
                </div>
              </div>
            )}

            {isCancelled && (
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  This appointment is cancelled. Change status to "Scheduled" to reinstate.
                </p>
              </div>
            )}

            {(isCancelled || isCompleted) && (
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select 
                  value={form.watch('status')} 
                  onValueChange={(value) => form.setValue('status', value as 'scheduled' | 'completed' | 'cancelled')}
                >
                  <SelectTrigger className="h-9" data-testid="select-edit-appointment-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">{isCancelled ? 'Scheduled (Reinstate)' : 'Scheduled'}</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select 
                value={form.watch('type')} 
                onValueChange={(value) => form.setValue('type', value as any)}
              >
                <SelectTrigger className="h-9" data-testid="select-edit-appointment-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {appointmentTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input
                  id="date"
                  type="date"
                  className="h-9"
                  {...form.register("date")}
                  data-testid="input-edit-appointment-date"
                />
                {form.formState.errors.date && (
                  <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Time</Label>
                <Select 
                  value={form.watch('time') || ''} 
                  onValueChange={(value) => form.setValue('time', value)}
                >
                  <SelectTrigger className="h-9" data-testid="select-edit-appointment-time">
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea
                id="notes"
                {...form.register("notes")}
                placeholder="Additional details..."
                rows={4}
                className="min-h-0 resize-y"
                data-testid="input-edit-appointment-notes"
              />
            </div>

            {teamMembers.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Assign To</Label>
                <Select
                  value={form.watch('assignedToId') ? String(form.watch('assignedToId')) : 'unassigned'}
                  onValueChange={(value) => form.setValue('assignedToId', value === 'unassigned' ? null : Number(value))}
                >
                  <SelectTrigger className="h-9" data-testid="select-edit-appointment-assignee">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {teamMembers.map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.name}{m.role ? ` (${m.role})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Switch checked={notifyOnSave} onCheckedChange={setNotifyOnSave} data-testid="switch-notify-on-save" />
              <div>
                <Label className="text-sm font-medium">Notify customer</Label>
                <p className="text-xs text-muted-foreground">Send SMS & email when you save</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {onDelete && appointment ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    onDelete(appointment.id);
                    onOpenChange(false);
                  }}
                  data-testid="button-delete-appointment-dialog"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              ) : <div />}
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={updateMutation.isPending} data-testid="button-save-appointment">
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDelayWarning} onOpenChange={setShowDelayWarning}>
        <AlertDialogContent className="z-[10001]" overlayClassName="z-[10001]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Delaying Appointment
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are moving this appointment to a later date 
              (from {appointment?.date ? format(parseISO(appointment.date), 'MMM d, yyyy') : ''} to {pendingData?.date ? format(parseISO(pendingData.date), 'MMM d, yyyy') : ''}).
              This may affect scheduling and customer expectations.
              <br /><br />
              Are you sure you want to delay this appointment?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDelay}>Keep Original Date</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelay} data-testid="button-confirm-delay">
              Yes, Delay Appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
