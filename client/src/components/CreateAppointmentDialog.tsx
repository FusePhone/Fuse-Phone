import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CalendarPlus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function getNearestQuarterTime(): string {
  const now = new Date();
  let minutes = now.getMinutes();
  const remainder = minutes % 15;
  if (remainder > 0) minutes += 15 - remainder;
  let hours = now.getHours();
  if (minutes >= 60) { minutes = 0; hours++; }
  if (hours >= 24) { hours = 0; }
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

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
});

type AppointmentFormData = z.infer<typeof appointmentSchema>;

interface CreateAppointmentDialogProps {
  contactId: number;
  contactName?: string;
  triggerLabel?: string;
  onAppointmentCreated?: (id: number) => void;
}

const appointmentTypes = [
  { value: 'site_visit', label: 'On-Site Visit' },
  { value: 'estimate', label: 'Proposal' },
  { value: 'walkthrough', label: 'Walk-Through' },
  { value: 'payment', label: 'Collect Payment' },
  { value: 'callback', label: 'Callback' },
  { value: 'follow_up', label: 'Follow-Up' },
  { value: 'phone_call', label: 'Phone Call' },
  { value: 'text_schedule', label: 'Text Follow-Up' },
  { value: 'check_in', label: 'Check-In' },
  { value: 'other', label: 'Other' },
];

export function CreateAppointmentDialog({ 
  contactId, 
  contactName,
  triggerLabel = "Appointment",
  onAppointmentCreated 
}: CreateAppointmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      type: 'site_visit',
      date: '',
      time: getNearestQuarterTime(),
      notes: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AppointmentFormData) => {
      const res = await apiRequest('POST', '/api/appointments', {
        ...data,
        contactId,
        status: 'scheduled',
        sendNotification: notifyCustomer,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications'] });
      toast({ title: "Appointment scheduled" });
      setOpen(false);
      form.reset({ type: 'site_visit', date: '', time: getNearestQuarterTime(), notes: '' });
      setNotifyCustomer(true);
      onAppointmentCreated?.(data.id);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create appointment", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: AppointmentFormData) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-create-appointment">
          <CalendarPlus className="w-4 h-4 mr-2" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Appointment{contactName ? ` for ${contactName}` : ''}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select 
              value={form.watch('type')} 
              onValueChange={(value) => form.setValue('type', value as any)}
            >
              <SelectTrigger className="h-9" data-testid="select-appointment-type">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input
                id="date"
                type="date"
                className="h-[44px] text-sm"
                {...form.register("date")}
                data-testid="input-appointment-date"
              />
              {form.formState.errors.date && (
                <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Time</Label>
              <Select 
                value={form.watch('time') || ''} 
                onValueChange={(value) => form.setValue('time', value)}
              >
                <SelectTrigger className="h-[44px] text-sm" data-testid="select-appointment-time">
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
              rows={2}
              className="min-h-0"
              data-testid="input-appointment-notes"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-2.5">
            <div>
              <Label className="text-sm font-medium">Notify customer</Label>
              <p className="text-xs text-muted-foreground">Send confirmation via SMS & email</p>
            </div>
            <Switch
              checked={notifyCustomer}
              onCheckedChange={(checked) => setNotifyCustomer(checked === true)}
              data-testid="switch-notify-customer"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending} data-testid="button-submit-appointment">
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Schedule
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
