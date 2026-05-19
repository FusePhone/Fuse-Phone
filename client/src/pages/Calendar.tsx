import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { useCompanySettings } from "@/hooks/use-company-settings";
import { useCallContact } from "@/hooks/use-call-contact";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Loader2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, User, Trash2, X, Pencil, AlertTriangle, Briefcase, MapPin, FileText, Play, CheckCircle, Send, Mail, MessageSquare, Bot, Check, Settings, Bell, Plus, Minus, Search, ChevronsUpDown, Navigation, Phone, ImageIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageMediaCarousel, buildMediaItems } from "@/components/MessageMediaCarousel";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, parseISO, isToday, isAfter, isBefore } from "date-fns";
import { Link } from "wouter";
import { cn, formatPhoneDisplay } from "@/lib/utils";
import { normalizePhone } from "@/lib/phone";
import { useToast } from "@/hooks/use-toast";
import { EditAppointmentDialog } from "@/components/EditAppointmentDialog";
import type { Appointment, Contact, ProjectWithContact, BookingRequest, JobScheduleDate } from "@shared/schema";

type AppointmentWithContact = Appointment & { contact: Contact };

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

function snapToQuarter(time: string): string {
  if (!time) return getNearestQuarterTime();
  const parts = time.split(':');
  if (parts.length < 2) return getNearestQuarterTime();
  let hours = parseInt(parts[0], 10);
  let minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return getNearestQuarterTime();
  const remainder = minutes % 15;
  if (remainder > 0) minutes += 15 - remainder;
  if (minutes >= 60) { minutes = 0; hours++; }
  if (hours >= 24) { hours = 0; }
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

const appointmentTypeLabels: Record<string, string> = {
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

const appointmentTypeColors: Record<string, string> = {
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

function buildAppointmentAddress(contact: Contact, projectAddress?: { jobAddress?: string | null; jobCity?: string | null; jobState?: string | null } | null): string {
  const addr = projectAddress?.jobAddress || contact.address;
  const city = projectAddress?.jobCity || contact.city;
  const state = projectAddress?.jobState || contact.state;
  return [addr, city, state].filter(Boolean).join(', ');
}

const JOB_STAGES = ['accepted', 'scheduled', 'in_progress'] as const;

const jobStageLabels: Record<string, string> = {
  accepted: 'Pending Schedule',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const jobStageColors: Record<string, string> = {
  accepted: 'bg-gray-500',
  scheduled: 'bg-emerald-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-teal-500',
};

function CalendarGrid({
  currentMonth,
  setCurrentMonth,
  selectedDate,
  setSelectedDate,
  items,
  dotRenderer,
  legend,
}: {
  currentMonth: Date;
  setCurrentMonth: (d: Date) => void;
  selectedDate: Date | null;
  setSelectedDate: (d: Date) => void;
  items: { date: string }[];
  dotRenderer: (date: Date) => JSX.Element | null;
  legend: JSX.Element;
}) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstDayOfWeek = monthStart.getDay();
  const paddingDays = Array(firstDayOfWeek).fill(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 gap-2">
        <CardTitle className="text-lg font-medium">
          {format(currentMonth, 'MMMM yyyy')}
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            data-testid="button-prev-month"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(new Date())}
            data-testid="button-today"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            data-testid="button-next-month"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {paddingDays.map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}
          {daysInMonth.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const hasItems = items.some(item => item.date === dateStr);
            const isSelected = selectedDate && isSameDay(day, selectedDate);

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  "aspect-square p-1 rounded-lg text-sm relative hover-elevate transition-colors",
                  isToday(day) && "ring-2 ring-primary",
                  isSelected && "bg-primary text-primary-foreground",
                  !isSelected && "hover:bg-muted"
                )}
                data-testid={`calendar-day-${dateStr}`}
              >
                <span className="block">{format(day, 'd')}</span>
                {hasItems && (
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                    {dotRenderer(day)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t flex flex-wrap gap-4 text-xs">
          {legend}
        </div>
      </CardContent>
    </Card>
  );
}

function AppointmentsTab() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { maskName, maskPhone, maskAddress, maskCity } = useDemoMode();
  const { data: companySettings } = useCompanySettings();
  const hasPhoneIntegration = !!(companySettings?.twilioPhoneNumber || companySettings?.openphonePhoneNumber);
  const { callContact, dialog: callDialog } = useCallContact();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [editingAppointment, setEditingAppointment] = useState<AppointmentWithContact | null>(null);
  const [cancellingAppointment, setCancellingAppointment] = useState<AppointmentWithContact | null>(null);
  const [confirmingBooking, setConfirmingBooking] = useState<BookingRequest | null>(null);
  const [editingAiAppt, setEditingAiAppt] = useState<AppointmentWithContact | null>(null);
  const [aiApptDate, setAiApptDate] = useState('');
  const [aiApptTime, setAiApptTime] = useState('');
  const [aiApptType, setAiApptType] = useState('estimate');
  const [aiApptNotes, setAiApptNotes] = useState('');
  const [confirmDate, setConfirmDate] = useState('');
  const [confirmTime, setConfirmTime] = useState('');
  const [confirmType, setConfirmType] = useState('estimate');
  const [confirmNotes, setConfirmNotes] = useState('');
  const [sendNotification, setSendNotification] = useState(true);
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [newApptContactId, setNewApptContactId] = useState('');
  const [newApptType, setNewApptType] = useState('on_site');
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [newApptNotify, setNewApptNotify] = useState(true);
  const [newApptDate, setNewApptDate] = useState('');
  const [newApptTime, setNewApptTime] = useState(getNearestQuarterTime());
  const [newApptNotes, setNewApptNotes] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: appointments } = useQuery<AppointmentWithContact[]>({
    queryKey: ['/api/appointments'],
  });

  const { data: bookingRequests } = useQuery<BookingRequest[]>({
    queryKey: ['/api/booking-requests'],
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ['/api/contacts'],
  });

  const { data: projects } = useQuery<any[]>({
    queryKey: ['/api/projects'],
  });

  const activeProjectByContact = useMemo(() => {
    const map = new Map<number, { id: number; title: string; jobAddress?: string | null; jobCity?: string | null; jobState?: string | null }>();
    if (!projects) return map;
    const excludedStages = ['completed', 'archived', 'cancelled', 'lost'];
    for (const p of projects) {
      if (p.contactId && !excludedStages.includes(p.stage)) {
        if (!map.has(p.contactId)) {
          map.set(p.contactId, { id: p.id, title: p.title, jobAddress: p.jobAddress, jobCity: p.jobCity, jobState: p.jobState });
        }
      }
    }
    return map;
  }, [projects]);

  const pendingBookings = useMemo(() =>
    (bookingRequests || []).filter(b => b.status === 'new'),
    [bookingRequests]
  );

  const contactByPhoneDigits = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts || []) {
      if (!c.phone) continue;
      const digits = c.phone.replace(/\D/g, '').slice(-10);
      if (digits.length === 10 && !map.has(digits)) map.set(digits, c);
    }
    return map;
  }, [contacts]);

  const findContactForPhone = useCallback((phone: string | null | undefined) => {
    if (!phone) return undefined;
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) return undefined;
    return contactByPhoneDigits.get(digits);
  }, [contactByPhoneDigits]);

  const pendingAiAppointments = useMemo(() =>
    (appointments || []).filter(a => a.status === 'pending_ai'),
    [appointments]
  );

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest('PUT', `/api/appointments/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
      toast({ title: "Appointment updated" });
    },
  });

  const approveAiApptMutation = useMutation({
    mutationFn: async ({ id, date, time, type, notes }: { id: number; date: string; time: string; type: string; notes: string }) => {
      const res = await apiRequest('PUT', `/api/appointments/${id}`, { status: 'scheduled', date, time, type, notes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai-actions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
      toast({ title: "Appointment approved", description: "The appointment has been confirmed." });
      setEditingAiAppt(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to approve", description: err.message || "Please try again", variant: "destructive" });
    },
  });

  const dismissAiApptMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/appointments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      toast({ title: "AI suggestion dismissed" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/appointments/${id}`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['/api/appointments'] });
      const prev = queryClient.getQueryData(['/api/appointments']);
      queryClient.setQueryData(['/api/appointments'], (old: any[] | undefined) =>
        (old || []).filter((a: any) => a.id !== id)
      );
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) queryClient.setQueryData(['/api/appointments'], context.prev);
      toast({ title: "Failed to delete appointment", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
    },
  });

  const confirmBookingMutation = useMutation({
    mutationFn: async ({ id, date, time, type, notes, notify }: { id: number; date: string; time: string; type: string; notes: string; notify: boolean }) => {
      const res = await apiRequest('POST', `/api/booking-requests/${id}/confirm`, { date, time, type, notes, sendNotification: notify });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/booking-requests'] });
      toast({
        title: "Appointment confirmed",
        description: variables.notify
          ? "The customer has been notified."
          : "No notification was sent.",
      });
      setConfirmingBooking(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to confirm", description: err.message || "Please try again", variant: "destructive" });
    },
  });

  const deleteBookingMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/booking-requests/${id}`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['/api/booking-requests'] });
      const prev = queryClient.getQueryData(['/api/booking-requests']);
      queryClient.setQueryData(['/api/booking-requests'], (old: any[] | undefined) =>
        (old || []).filter((b: any) => b.id !== id)
      );
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) queryClient.setQueryData(['/api/booking-requests'], context.prev);
      toast({ title: "Failed to delete", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking-requests'] });
    },
  });

  const createApptMutation = useMutation({
    mutationFn: async (data: { contactId: number; type: string; date: string; time: string; notes: string }) => {
      const res = await apiRequest('POST', '/api/appointments', { ...data, status: 'scheduled' });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
      toast({ title: "Appointment scheduled" });
      setShowNewAppt(false);
      setNewApptContactId('');
      setNewApptType('on_site');
      setNewApptDate('');
      setNewApptTime(getNearestQuarterTime());
      setNewApptNotes('');
    },
    onError: (err: any) => {
      toast({ title: "Failed to create", description: err.message, variant: "destructive" });
    },
  });

  const handleCreateAppt = () => {
    if (!newApptContactId || !newApptDate) return;
    createApptMutation.mutate({
      contactId: parseInt(newApptContactId),
      type: newApptType,
      date: newApptDate,
      time: newApptTime,
      notes: newApptNotes,
      sendNotification: newApptNotify,
    });
  };

  const openNewApptForDate = (date?: Date | null) => {
    setShowNewAppt(true);
    setNewApptDate(date ? format(date, 'yyyy-MM-dd') : '');
    setNewApptContactId('');
    setNewApptType('estimate');
    setNewApptTime(getNearestQuarterTime());
    setNewApptNotes('');
    setNewApptNotify(true);
  };

  const openAiApptDialog = (appt: AppointmentWithContact) => {
    setEditingAiAppt(appt);
    setAiApptDate(appt.date);
    setAiApptTime(snapToQuarter(appt.time || '09:00'));
    setAiApptType(appt.type || 'estimate');
    setAiApptNotes(appt.notes || '');
  };

  const handleApproveAiAppt = () => {
    if (!editingAiAppt || !aiApptDate) return;
    approveAiApptMutation.mutate({
      id: editingAiAppt.id,
      date: aiApptDate,
      time: aiApptTime,
      type: aiApptType,
      notes: aiApptNotes,
    });
  };

  const openConfirmDialog = useCallback((booking: BookingRequest) => {
    setConfirmingBooking(booking);
    setConfirmDate(booking.requestedDate || format(new Date(), 'yyyy-MM-dd'));
    setConfirmTime(snapToQuarter(booking.requestedTime || '09:00'));
    setConfirmType('');
    setConfirmNotes(booking.projectDescription || '');
    setSendNotification(true);
  }, []);

  useEffect(() => {
    if (!bookingRequests || !searchString) return;
    const params = new URLSearchParams(searchString);
    const bookingId = params.get('bookingId');
    if (!bookingId) return;
    const booking = bookingRequests.find(b => b.id === Number(bookingId));
    if (booking && !confirmingBooking) {
      openConfirmDialog(booking);
      setLocation('/calendar', { replace: true });
    }
  }, [bookingRequests, searchString, openConfirmDialog, confirmingBooking, setLocation]);

  const handleConfirmBooking = () => {
    if (!confirmingBooking || !confirmDate) return;
    confirmBookingMutation.mutate({
      id: confirmingBooking.id,
      date: confirmDate,
      time: confirmTime,
      type: confirmType,
      notes: confirmNotes,
      notify: sendNotification,
    });
  };

  const calendarItems = useMemo(() =>
    (appointments || []).map(a => ({ date: a.date })),
    [appointments]
  );

  const selectedAppointments = selectedDate
    ? (appointments || []).filter(a => a.date === format(selectedDate, 'yyyy-MM-dd'))
    : [];

  const confirmCancel = () => {
    if (cancellingAppointment) {
      updateMutation.mutate({ id: cancellingAppointment.id, status: 'cancelled' });
      setCancellingAppointment(null);
    }
  };

  return (
    <div className="space-y-6">
      {pendingBookings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2" data-testid="text-appointment-requests">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Appointment Requests ({pendingBookings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingBookings.map(b => {
                const fullName = `${b.firstName ?? ''} ${b.lastName ?? ''}`.trim();
                const displayName = fullName || b.phone || b.email || 'Unnamed';
                const bookingAddr = [b.address, b.city, b.state, b.zipCode].filter(Boolean).join(', ');
                const matchedContact = findContactForPhone(b.phone);
                const dialPhone = b.phone ? normalizePhone(b.phone) : '';
                const contactName = matchedContact?.name || fullName || undefined;
                return (
                <div
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openConfirmDialog(b)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openConfirmDialog(b); } }}
                  className="p-3 rounded-lg border bg-card border-slate-200 dark:border-slate-700 shadow-[0_2px_12px_-2px_rgba(15,23,42,0.20)] dark:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.55)] hover:shadow-[0_4px_18px_-2px_rgba(15,23,42,0.30)] dark:hover:shadow-[0_4px_18px_-2px_rgba(0,0,0,0.75)] hover:border-slate-300 dark:hover:border-slate-600 transition-all cursor-pointer"
                  data-testid={`booking-request-${b.id}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-medium" data-testid={`text-booking-name-${b.id}`}>
                          {maskName(displayName)}
                        </span>
                        <Badge className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100">
                          New Request
                        </Badge>
                      </div>
                      {b.requestedDate && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1" data-testid={`text-booking-requested-${b.id}`}>
                          <CalendarIcon className="w-3 h-3 flex-shrink-0" />
                          {b.requestedDate}{b.requestedTime ? ` at ${b.requestedTime}` : ''}
                        </p>
                      )}
                      {bookingAddr && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{maskAddress(bookingAddr)}</span>
                        </p>
                      )}
                      {b.projectDescription && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {b.projectDescription}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 items-center shrink-0">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        data-testid={`button-confirm-booking-${b.id}`}
                        onClick={(e) => { e.stopPropagation(); openConfirmDialog(b); }}
                      >
                        <CalendarIcon className="w-3 h-3 mr-1" />
                        Schedule
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        data-testid={`button-delete-booking-${b.id}`}
                        disabled={deleteBookingMutation.isPending}
                        onClick={(e) => { e.stopPropagation(); if (confirm("Delete this booking request?")) deleteBookingMutation.mutate(b.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  {b.phone && (
                    <div className="flex items-center gap-1.5 pt-2 border-t border-border">
                      <span className="text-xs text-muted-foreground flex-1 truncate flex items-center gap-1" data-testid={`text-booking-phone-${b.id}`}>
                        <Phone className="w-3 h-3 flex-shrink-0" />
                        {formatPhoneDisplay(b.phone)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs gap-1"
                        onClick={(e) => { e.stopPropagation(); callContact({ phone: dialPhone || b.phone, contactId: matchedContact?.id, contactName }); }}
                        data-testid={`button-call-booking-${b.id}`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (matchedContact && hasPhoneIntegration) {
                            setLocation(`/messages?contactId=${matchedContact.id}`);
                          } else if (hasPhoneIntegration) {
                            setLocation(`/messages?phone=${encodeURIComponent(dialPhone || b.phone)}`);
                          } else {
                            window.open(`sms:${dialPhone || b.phone}`, '_self');
                          }
                        }}
                        data-testid={`button-text-booking-${b.id}`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Text</span>
                      </Button>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {pendingAiAppointments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2" data-testid="text-ai-suggestions">
              <Bot className="w-5 h-5 text-purple-500" />
              AI-Suggested Appointments ({pendingAiAppointments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingAiAppointments.map(appt => (
                <div
                  key={appt.id}
                  className="flex items-center justify-between gap-2 p-3 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer hover-elevate"
                  onClick={() => openAiApptDialog(appt)}
                  data-testid={`ai-appointment-${appt.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" data-testid={`text-ai-appt-contact-${appt.id}`}>
                        {appt.contact?.name || 'Unknown'}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {appointmentTypeLabels[appt.type] || appt.type}
                      </Badge>
                      <Badge variant="outline" className="text-xs text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700">
                        AI Suggested
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5 space-y-0.5">
                      <p className="flex items-center gap-1">
                        <CalendarIcon className="w-3 h-3" />
                        {format(parseISO(appt.date), 'MMM d, yyyy')}{appt.time ? ` at ${appt.time}` : ''}
                      </p>
                      {appt.notes && (
                        <p className="line-clamp-1">{appt.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 items-center">
                    <Button size="sm" data-testid={`button-approve-ai-${appt.id}`} onClick={(e) => { e.stopPropagation(); openAiApptDialog(appt); }}>
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground"
                      data-testid={`button-dismiss-ai-${appt.id}`}
                      disabled={dismissAiApptMutation.isPending}
                      onClick={(e) => { e.stopPropagation(); dismissAiApptMutation.mutate(appt.id); }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CalendarGrid
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            items={calendarItems}
            dotRenderer={(day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayAppts = (appointments || []).filter(a => a.date === dateStr);
              return (
                <>
                  {dayAppts.slice(0, 3).map((a, i) => (
                    <div
                      key={`a-${i}`}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        a.status === 'pending_ai' ? 'bg-purple-500 ring-1 ring-purple-300' : (appointmentTypeColors[a.type] || 'bg-gray-500')
                      )}
                    />
                  ))}
                </>
              );
            }}
            legend={
              <>
                {Object.entries(appointmentTypeLabels).map(([type, label]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div className={cn("w-2.5 h-2.5 rounded-full", appointmentTypeColors[type])} />
                    <span className="text-muted-foreground">{label}</span>
                  </div>
                ))}
              </>
            }
          />
        </div>

        <div>
          <Card className="h-full">
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-lg" data-testid="text-selected-date">
                {selectedDate ? format(selectedDate, 'EEEE, MMM d') : 'Select a Date'}
              </CardTitle>
              {selectedDate && (
                <Button size="icon" variant="ghost" onClick={() => openNewApptForDate(selectedDate)} data-testid="button-add-appointment-date">
                  <Plus className="w-5 h-5" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!selectedDate ? (
                <p className="text-muted-foreground text-sm">Click on a date to see appointments</p>
              ) : selectedAppointments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No appointments on this date</p>
              ) : (
                <div className="space-y-3">
                  {selectedAppointments.map(appt => {
                    const proj = activeProjectByContact.get(appt.contactId);
                    const fullAddr = buildAppointmentAddress(appt.contact, proj);
                    const phone = appt.contact.phone;
                    const br = (appt as any).bookingRequest as {
                      firstName?: string; lastName?: string; email?: string; phone?: string;
                      address?: string; city?: string; state?: string; zipCode?: string;
                      requestedDate?: string; requestedTime?: string;
                      alternateDate?: string; alternateTime?: string;
                      projectDescription?: string; uploadedFiles?: string[];
                    } | null;
                    const bookingAddr = br ? [br.address, br.city, br.state, br.zipCode].filter(Boolean).join(', ') : '';
                    const displayAddr = fullAddr || bookingAddr;
                    const displayPhone = phone || br?.phone;

                    return (
                      <div
                        key={appt.id}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "p-3 rounded-lg border transition-all cursor-pointer active:scale-[0.99]",
                          appt.status === 'completed' && "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 hover:shadow-md",
                          appt.status === 'cancelled' && "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 opacity-60 hover:shadow-md",
                          appt.status === 'pending_ai' && "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 hover:shadow-md",
                          appt.status === 'scheduled' && "bg-card border-slate-200 dark:border-slate-700 shadow-[0_2px_12px_-2px_rgba(15,23,42,0.20)] dark:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.55)] hover:shadow-[0_4px_18px_-2px_rgba(15,23,42,0.30)] dark:hover:shadow-[0_4px_18px_-2px_rgba(0,0,0,0.75)] hover:border-slate-300 dark:hover:border-slate-600"
                        )}
                        onClick={() => {
                          if (appt.status === 'pending_ai') return openAiApptDialog(appt);
                          if (proj) return setLocation(`/projects/${proj.id}`);
                          setEditingAppointment(appt);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (appt.status === 'pending_ai') return openAiApptDialog(appt);
                            if (proj) return setLocation(`/projects/${proj.id}`);
                            setEditingAppointment(appt);
                          }
                        }}
                        data-testid={`appointment-${appt.id}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="font-medium" data-testid={`text-appt-contact-${appt.id}`}>
                                {maskName(appt.contact.name)}
                              </span>
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
                            </div>
                            {appt.time && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1" data-testid={`text-appt-time-${appt.id}`}>
                                <Clock className="w-3 h-3 flex-shrink-0" />
                                {appt.time}
                              </p>
                            )}
                            {displayAddr && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5" data-testid={`text-appt-address-${appt.id}`}>
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{maskAddress(displayAddr)}</span>
                              </p>
                            )}
                            {appt.notes && (
                              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-2" data-testid={`text-appt-notes-${appt.id}`}>{appt.notes}</p>
                            )}
                            {br?.alternateDate && (
                              <div className="mt-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1" data-testid={`text-appt-alt-dates-${appt.id}`}>
                                <span className="font-medium">Alt: </span>
                                {(() => { try { return format(parseISO(br.alternateDate), 'MMM d'); } catch { return br.alternateDate; } })()}
                                {br.alternateTime ? ` at ${br.alternateTime}` : ''}
                              </div>
                            )}
                            {br?.uploadedFiles && br.uploadedFiles.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid={`appt-photos-${appt.id}`}>
                                {br.uploadedFiles.map((url, i) => (
                                  <img
                                    key={i}
                                    src={url}
                                    alt={`Booking photo ${i + 1}`}
                                    className="w-12 h-12 rounded object-cover border cursor-pointer hover:opacity-80"
                                    onClick={(e) => { e.stopPropagation(); window.open(url, '_blank'); }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            onClick={(e) => { e.stopPropagation(); setEditingAppointment(appt); }}
                            data-testid={`button-edit-appt-${appt.id}`}
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                        </div>
                        {(displayPhone || displayAddr) && (
                          <div className="flex items-center gap-1.5 pt-2 border-t border-border">
                            {displayPhone ? (
                              <span className="text-xs text-muted-foreground flex-1 truncate flex items-center gap-1" data-testid={`text-appt-phone-${appt.id}`}>
                                <Phone className="w-3 h-3 flex-shrink-0" />
                                {formatPhoneDisplay(displayPhone)}
                              </span>
                            ) : (
                              <span className="flex-1" />
                            )}
                            {displayAddr && (
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 px-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1"
                                onClick={(e) => { e.stopPropagation(); window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(displayAddr)}`, '_blank'); }}
                                data-testid={`button-navigate-${appt.id}`}
                              >
                                <Navigation className="w-3.5 h-3.5" />
                                <span>Map</span>
                              </Button>
                            )}
                            {displayPhone && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 px-2 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs gap-1"
                                  onClick={(e) => { e.stopPropagation(); callContact({ phone: displayPhone, contactId: appt.contactId, contactName: appt.contact?.name }); }}
                                  data-testid={`button-call-${appt.id}`}
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                  <span>Call</span>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 px-2 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-xs gap-1"
                                  onClick={(e) => { e.stopPropagation(); hasPhoneIntegration ? setLocation(`/messages?contactId=${appt.contactId}`) : window.open(`sms:${displayPhone}`, '_self'); }}
                                  data-testid={`button-text-${appt.id}`}
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>Text</span>
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {appointments && appointments.filter(a => a.status === 'scheduled' || a.status === 'pending_ai').length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg" data-testid="text-upcoming-appointments">Upcoming Appointments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Date</th>
                    <th className="text-left py-2 px-3 font-medium">Time</th>
                    <th className="text-left py-2 px-3 font-medium">Type</th>
                    <th className="text-left py-2 px-3 font-medium">Contact</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments
                    .filter(a => a.status === 'scheduled' || a.status === 'pending_ai')
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map(appt => (
                      <tr key={appt.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => setEditingAppointment(appt)} data-testid={`row-appointment-${appt.id}`}>
                        <td className="py-2 px-3">{format(parseISO(appt.date), 'MMM d, yyyy')}</td>
                        <td className="py-2 px-3">{appt.time || '-'}</td>
                        <td className="py-2 px-3">
                          <Badge variant="secondary" className="text-xs">
                            {appointmentTypeLabels[appt.type] || appt.type}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">
                          {maskName(appt.contact.name)}
                        </td>
                        <td className="py-2 px-3">
                          {appt.status === 'pending_ai' ? (
                            <Badge variant="outline" className="text-xs text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700">AI Suggested</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs capitalize">{appt.status}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="sm:hidden space-y-3">
              {appointments
                .filter(a => a.status === 'scheduled' || a.status === 'pending_ai')
                .sort((a, b) => a.date.localeCompare(b.date))
                .map(appt => {
                  const proj = activeProjectByContact.get(appt.contactId);
                  const fullAddr = buildAppointmentAddress(appt.contact, proj);
                  const phone = appt.contact.phone;
                  const br = (appt as any).bookingRequest as { address?: string; city?: string; state?: string; zipCode?: string; phone?: string; alternateDate?: string; alternateTime?: string; uploadedFiles?: string[] } | null;
                  const bookingAddr = br ? [br.address, br.city, br.state, br.zipCode].filter(Boolean).join(', ') : '';
                  const displayAddr = fullAddr || bookingAddr;
                  const displayPhone = phone || br?.phone;

                  const isScheduled = appt.status === 'scheduled';
                  return (
                    <div
                      key={appt.id}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "p-3 rounded-lg border transition-all cursor-pointer active:scale-[0.99]",
                        isScheduled && "bg-card border-slate-200 dark:border-slate-700 shadow-[0_2px_12px_-2px_rgba(15,23,42,0.20)] dark:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.55)] hover:shadow-[0_4px_18px_-2px_rgba(15,23,42,0.30)] dark:hover:shadow-[0_4px_18px_-2px_rgba(0,0,0,0.75)] hover:border-slate-300 dark:hover:border-slate-600",
                        appt.status === 'pending_ai' && "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 hover:shadow-md"
                      )}
                      onClick={() => {
                        if (appt.status === 'pending_ai') return openAiApptDialog(appt);
                        if (proj) return setLocation(`/projects/${proj.id}`);
                        setEditingAppointment(appt);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (appt.status === 'pending_ai') return openAiApptDialog(appt);
                          if (proj) return setLocation(`/projects/${proj.id}`);
                          setEditingAppointment(appt);
                        }
                      }}
                      data-testid={`card-appointment-${appt.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-medium">
                              {maskName(appt.contact.name)}
                            </span>
                            <Badge className={cn("text-[11px] font-medium text-white", appointmentTypeColors[appt.type] || 'bg-gray-500')}>
                              {appointmentTypeLabels[appt.type] || appt.type}
                            </Badge>
                            {appt.status === 'pending_ai' && (
                              <Badge variant="outline" className="text-[11px] text-purple-600 border-purple-300 dark:text-purple-400">AI Suggested</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3 flex-shrink-0" />
                            {format(parseISO(appt.date), 'MMM d, yyyy')}
                            {appt.time ? ` at ${appt.time}` : ''}
                          </p>
                          {displayAddr && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5" data-testid={`text-address-upcoming-${appt.id}`}>
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{maskAddress(displayAddr)}</span>
                            </p>
                          )}
                          {appt.notes && (
                            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-2">{appt.notes}</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={(e) => { e.stopPropagation(); setEditingAppointment(appt); }}
                          data-testid={`button-edit-upcoming-${appt.id}`}
                        >
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      </div>
                      {(displayPhone || displayAddr) && (
                        <div className="flex items-center gap-1.5 pt-2 border-t border-border">
                          {displayPhone ? (
                            <span className="text-xs text-muted-foreground flex-1 truncate flex items-center gap-1">
                              <Phone className="w-3 h-3 flex-shrink-0" />
                              {formatPhoneDisplay(displayPhone)}
                            </span>
                          ) : (
                            <span className="flex-1" />
                          )}
                          {displayAddr && (
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 px-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1"
                              onClick={(e) => { e.stopPropagation(); window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(displayAddr)}`, '_blank'); }}
                              data-testid={`button-navigate-upcoming-${appt.id}`}
                            >
                              <Navigation className="w-3.5 h-3.5" />
                              <span>Map</span>
                            </Button>
                          )}
                          {displayPhone && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 px-2 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs gap-1"
                                onClick={(e) => { e.stopPropagation(); callContact({ phone: displayPhone, contactId: appt.contactId, contactName: appt.contact?.name }); }}
                                data-testid={`button-call-upcoming-${appt.id}`}
                              >
                                <Phone className="w-3.5 h-3.5" />
                                <span>Call</span>
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 px-2 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-xs gap-1"
                                onClick={(e) => { e.stopPropagation(); hasPhoneIntegration ? setLocation(`/messages?contactId=${appt.contactId}`) : window.open(`sms:${displayPhone}`, '_self'); }}
                                data-testid={`button-text-upcoming-${appt.id}`}
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>Text</span>
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showNewAppt} onOpenChange={setShowNewAppt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" />
              New Appointment
            </DialogTitle>
            <DialogDescription>Schedule an appointment with a contact</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Contact</Label>
              <Popover open={contactSearchOpen} onOpenChange={setContactSearchOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={contactSearchOpen} className="w-full justify-between font-normal" data-testid="select-new-appt-contact">
                    {newApptContactId
                      ? (contacts || []).find(c => String(c.id) === newApptContactId)?.name || 'Select a contact'
                      : 'Search contacts...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" side="bottom" sideOffset={4} collisionPadding={16} avoidCollisions={false}>
                  <div className="flex items-center border-b px-3">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                      className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                      placeholder="Search contacts..."
                      value={contactSearchQuery}
                      onChange={(e) => setContactSearchQuery(e.target.value)}
                      data-testid="input-contact-search"
                    />
                  </div>
                  <div className="max-h-[200px] overflow-y-auto p-1">
                    {(contacts || [])
                      .filter(c => c.name.toLowerCase().includes(contactSearchQuery.toLowerCase()))
                      .map(c => (
                        <button
                          key={c.id}
                          className={cn(
                            "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                            String(c.id) === newApptContactId && "bg-accent"
                          )}
                          onClick={() => {
                            setNewApptContactId(String(c.id));
                            setContactSearchOpen(false);
                            setContactSearchQuery('');
                          }}
                          data-testid={`option-contact-${c.id}`}
                        >
                          <Check className={cn("mr-2 h-4 w-4", String(c.id) === newApptContactId ? "opacity-100" : "opacity-0")} />
                          {c.name}
                        </button>
                      ))}
                    {(contacts || []).filter(c => c.name.toLowerCase().includes(contactSearchQuery.toLowerCase())).length === 0 && (
                      <p className="py-4 text-center text-sm text-muted-foreground">No contacts found</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {(() => {
              const selectedContact = newApptContactId ? (contacts || []).find(c => String(c.id) === newApptContactId) : null;
              const proj = selectedContact ? activeProjectByContact.get(selectedContact.id) : null;
              const addr = selectedContact ? buildAppointmentAddress(selectedContact, proj) : '';
              return addr ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm text-muted-foreground" data-testid="text-new-appt-address">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{addr}</span>
                </div>
              ) : null;
            })()}
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={newApptType} onValueChange={setNewApptType}>
                <SelectTrigger data-testid="select-new-appt-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="estimate">Proposal</SelectItem>
                  <SelectItem value="payment">Collect Payment</SelectItem>
                  <SelectItem value="walkthrough">Walk-Through</SelectItem>
                  <SelectItem value="site_visit">On-Site Visit</SelectItem>
                  <SelectItem value="callback">Callback</SelectItem>
                  <SelectItem value="follow_up">Follow-Up</SelectItem>
                  <SelectItem value="phone_call">Phone Call</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4 items-start">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" className="h-[44px]" value={newApptDate} onChange={(e) => setNewApptDate(e.target.value)} data-testid="input-new-appt-date" />
              </div>
              <div className="space-y-1.5">
                <Label>Time</Label>
                <Select value={newApptTime || ''} onValueChange={(value) => setNewApptTime(value)}>
                  <SelectTrigger className="h-[44px]" data-testid="select-new-appt-time">
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
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={newApptNotes} onChange={(e) => setNewApptNotes(e.target.value)} placeholder="Optional notes..." data-testid="input-new-appt-notes" />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Switch checked={newApptNotify} onCheckedChange={setNewApptNotify} data-testid="switch-new-appt-notify" />
              <div>
                <Label className="text-sm font-medium">Notify customer</Label>
                <p className="text-xs text-muted-foreground">Send confirmation via SMS & email</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewAppt(false)} data-testid="button-cancel-new-appt">Cancel</Button>
            <Button onClick={handleCreateAppt} disabled={!newApptContactId || !newApptDate || createApptMutation.isPending} data-testid="button-create-appt-submit">
              {createApptMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditAppointmentDialog
        appointment={editingAppointment}
        open={!!editingAppointment}
        onOpenChange={(open) => !open && setEditingAppointment(null)}
        contactName={editingAppointment ? maskName(editingAppointment.contact.name) : undefined}
        contactAddress={editingAppointment ? buildAppointmentAddress(editingAppointment.contact, activeProjectByContact.get(editingAppointment.contactId)) : undefined}
        contactPhone={editingAppointment?.contact.phone ? maskPhone(editingAppointment.contact.phone) : undefined}
        bookingRequest={(editingAppointment as any)?.bookingRequest || null}
        onDelete={(id) => { if (confirm("Delete this appointment?")) deleteMutation.mutate(id); }}
      />

      <AlertDialog open={!!cancellingAppointment} onOpenChange={(open) => !open && setCancellingAppointment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Cancel Appointment
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this appointment
              {cancellingAppointment?.contact?.name ? ` with ${maskName(cancellingAppointment.contact.name)}` : ''}
              {cancellingAppointment?.date ? ` on ${format(parseISO(cancellingAppointment.date), 'MMM d, yyyy')}` : ''}?
              <br /><br />
              This action cannot be undone. The customer will not be automatically notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="button-confirm-cancel"
            >
              Yes, Cancel Appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!confirmingBooking} onOpenChange={(open) => !open && setConfirmingBooking(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto p-0">
          <div className="px-5 pt-5 pb-4 bg-slate-900 dark:bg-slate-950 text-white">
            <DialogHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border-emerald-400/30 hover:bg-emerald-500/20">
                  New Request
                </Badge>
                <DialogTitle className="flex items-center gap-2 text-white">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-md">
                    <CalendarIcon className="w-4 h-4" />
                  </div>
                  {(() => {
                    const name = `${confirmingBooking?.firstName ?? ''} ${confirmingBooking?.lastName ?? ''}`.trim();
                    return name || confirmingBooking?.phone || confirmingBooking?.email || 'New booking request';
                  })()}
                </DialogTitle>
              </div>
              <DialogDescription className="text-slate-300">
                Confirm or adjust the appointment details below.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-3 px-5 py-4">
            <div className="flex items-start gap-3 p-3 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30">
              <Checkbox
                id="send-notification"
                checked={sendNotification}
                onCheckedChange={(checked) => setSendNotification(checked === true)}
                data-testid="checkbox-send-notification"
                className="mt-0.5 border-sky-400 data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
              />
              <div className="space-y-1">
                <Label htmlFor="send-notification" className="font-medium cursor-pointer text-sky-900 dark:text-sky-100">
                  Send automated confirmation via email and text
                </Label>
                <p className="text-xs text-sky-700/80 dark:text-sky-300/80">
                  Or whichever is available for this contact
                </p>
              </div>
            </div>
            {confirmingBooking && (confirmingBooking.email || confirmingBooking.phone || confirmingBooking.address || confirmingBooking.city) && (
              <div className="p-3 rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50/70 dark:bg-cyan-950/30 text-sm space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300 mb-1.5 flex items-center gap-1.5">
                  <User className="w-3 h-3" />
                  Contact
                </p>
                {confirmingBooking.email && (
                  <p className="flex items-start gap-2 break-all" data-testid="text-confirm-email">
                    <Mail className="w-3.5 h-3.5 mt-0.5 shrink-0 text-cyan-600 dark:text-cyan-400" />
                    <span>{confirmingBooking.email}</span>
                  </p>
                )}
                {confirmingBooking.phone && (
                  <p className="flex items-center gap-2" data-testid="text-confirm-phone">
                    <Phone className="w-3.5 h-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" />
                    <span>{formatPhoneDisplay(confirmingBooking.phone)}</span>
                  </p>
                )}
                {(confirmingBooking.address || confirmingBooking.city || confirmingBooking.state || confirmingBooking.zipCode) && (
                  <p className="flex items-start gap-2" data-testid="text-confirm-address">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-cyan-600 dark:text-cyan-400" />
                    <span>{[confirmingBooking.address, confirmingBooking.city, confirmingBooking.state, confirmingBooking.zipCode].filter(Boolean).join(', ')}</span>
                  </p>
                )}
              </div>
            )}
            {confirmingBooking?.projectDescription && (
              <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1.5 flex items-center gap-1.5">
                  <Pencil className="w-3 h-3" />
                  Customer Notes
                </p>
                <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-amber-950 dark:text-amber-100" style={{ wordBreak: 'break-word' }} data-testid="text-confirm-notes-display">{confirmingBooking.projectDescription}</div>
              </div>
            )}
            {confirmingBooking && (confirmingBooking.requestedDate || confirmingBooking.alternateDate || confirmingBooking.alternateTime) && (
              <div className="p-3 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/70 dark:bg-violet-950/30 text-sm space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  Customer Preferred Times
                </p>
                {confirmingBooking.requestedDate && (
                  <p className="flex items-start gap-2" data-testid="text-confirm-requested">
                    <CalendarIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-600 dark:text-violet-400" />
                    <span><span className="font-semibold text-violet-900 dark:text-violet-100">Requested:</span> {confirmingBooking.requestedDate}{confirmingBooking.requestedTime ? ` at ${confirmingBooking.requestedTime}` : ''}</span>
                  </p>
                )}
                {(confirmingBooking.alternateDate || confirmingBooking.alternateTime) && (
                  <p className="flex items-start gap-2" data-testid="text-confirm-alternate">
                    <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-600 dark:text-violet-400" />
                    <span><span className="font-semibold text-violet-900 dark:text-violet-100">Alternate:</span> {[confirmingBooking.alternateDate, confirmingBooking.alternateTime].filter(Boolean).join(' at ')}</span>
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2 p-3 rounded-xl border-2 border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <CalendarIcon className="w-3 h-3" />
                Schedule For
              </p>
              <div className="grid grid-cols-2 gap-4 items-start">
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-date">Date</Label>
                  <Input
                    id="confirm-date"
                    type="date"
                    className="h-[44px]"
                    value={confirmDate}
                    onChange={(e) => setConfirmDate(e.target.value)}
                    data-testid="input-confirm-date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-time">Time</Label>
                  <Select value={confirmTime || ''} onValueChange={(value) => setConfirmTime(value)}>
                    <SelectTrigger className="h-[44px]" data-testid="select-confirm-time">
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-type">Appointment Type</Label>
              <Select value={confirmType} onValueChange={setConfirmType}>
                <SelectTrigger data-testid="select-confirm-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(appointmentTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {confirmingBooking?.uploadedFiles && confirmingBooking.uploadedFiles.length > 0 && (
              <div className="space-y-2" data-testid="container-confirm-photos">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" />
                  Photos Submitted ({confirmingBooking.uploadedFiles.length})
                </p>
                <MessageMediaCarousel
                  items={buildMediaItems(confirmingBooking.uploadedFiles, null, 'image')}
                  isOutbound={false}
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
            <Button variant="outline" onClick={() => setConfirmingBooking(null)} data-testid="button-cancel-confirm">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmBooking}
              disabled={!confirmDate || confirmBookingMutation.isPending}
              data-testid="button-submit-confirm"
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-sm hover:shadow-md font-semibold"
            >
              {confirmBookingMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              )}
              Confirm Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingAiAppt} onOpenChange={(open) => !open && setEditingAiAppt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-500" />
              Approve AI Appointment
            </DialogTitle>
            <DialogDescription>
              Review and approve this AI-suggested appointment for{' '}
              <span className="font-medium text-foreground">
                {editingAiAppt?.contact?.name || 'Unknown'}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {editingAiAppt?.notes && (
              <div className="p-3 rounded-md bg-muted text-sm">
                <p className="text-xs font-medium text-muted-foreground mb-1">AI Context</p>
                <p className="max-h-32 overflow-y-auto">{editingAiAppt.notes}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 items-start">
              <div className="space-y-1.5">
                <Label htmlFor="ai-appt-date">Date</Label>
                <Input
                  id="ai-appt-date"
                  type="date"
                  className="h-[44px]"
                  value={aiApptDate}
                  onChange={(e) => setAiApptDate(e.target.value)}
                  data-testid="input-ai-appt-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-appt-time">Time</Label>
                <Select value={aiApptTime || ''} onValueChange={(value) => setAiApptTime(value)}>
                  <SelectTrigger className="h-[44px]" data-testid="select-ai-appt-time">
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
            <div className="space-y-2">
              <Label htmlFor="ai-appt-type">Appointment Type</Label>
              <Select value={aiApptType} onValueChange={setAiApptType}>
                <SelectTrigger data-testid="select-ai-appt-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(appointmentTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-appt-notes">Notes</Label>
              <Input
                id="ai-appt-notes"
                value={aiApptNotes}
                onChange={(e) => setAiApptNotes(e.target.value)}
                placeholder="Notes for this appointment..."
                data-testid="input-ai-appt-notes"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingAiAppt(null)} data-testid="button-cancel-ai-appt">
              Cancel
            </Button>
            <Button variant="ghost" className="text-destructive" onClick={() => { dismissAiApptMutation.mutate(editingAiAppt!.id); setEditingAiAppt(null); }} data-testid="button-dismiss-ai-appt">
              Dismiss
            </Button>
            <Button
              onClick={handleApproveAiAppt}
              disabled={!aiApptDate || approveAiApptMutation.isPending}
              data-testid="button-approve-ai-appt"
            >
              {approveAiApptMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              )}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {callDialog}
    </div>
  );
}

function JobSchedulingTab() {
  const { maskName, maskAddress, maskCity, maskProjectTitle } = useDemoMode();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [, setLocation] = useLocation();
  const { data: companySettings } = useCompanySettings();
  const hasPhoneIntegration = !!(companySettings?.twilioPhoneNumber || companySettings?.openphonePhoneNumber);
  const { callContact, dialog: callDialog } = useCallContact();

  const { data: allProjects } = useQuery<ProjectWithContact[]>({
    queryKey: ['/api/projects'],
  });

  const { data: allScheduleDates = [] } = useQuery<JobScheduleDate[]>({
    queryKey: ['/api/schedule-dates/all'],
  });

  const updateProjectStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: number; stage: string }) => {
      return apiRequest('PUT', `/api/projects/${id}`, { stage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: "Project updated" });
    },
  });

  const jobProjects = useMemo(() =>
    (allProjects || []).filter(p => JOB_STAGES.includes(p.stage as any)),
    [allProjects]
  );

  const scheduledProjects = useMemo(() =>
    jobProjects.filter(p => p.scheduledDate),
    [jobProjects]
  );

  const pendingProjects = useMemo(() =>
    (allProjects || []).filter(p => !p.scheduledDate && p.stage === 'accepted'),
    [allProjects]
  );

  const scheduleDatesByProject = useMemo(() => {
    const map = new Map<number, JobScheduleDate[]>();
    for (const sd of allScheduleDates) {
      if (!map.has(sd.projectId)) map.set(sd.projectId, []);
      map.get(sd.projectId)!.push(sd);
    }
    return map;
  }, [allScheduleDates]);

  const calendarDateMap = useMemo(() => {
    const dateMap = new Map<string, ProjectWithContact[]>();
    const addProjectToDate = (dateStr: string, p: ProjectWithContact) => {
      if (!dateMap.has(dateStr)) dateMap.set(dateStr, []);
      const existing = dateMap.get(dateStr)!;
      if (!existing.some(ep => ep.id === p.id)) existing.push(p);
    };

    for (const p of scheduledProjects) {
      const projectWorkDays = scheduleDatesByProject.get(p.id);
      if (projectWorkDays && projectWorkDays.length > 0) {
        for (const wd of projectWorkDays) {
          addProjectToDate(wd.date, p);
        }
        if (p.scheduledDate) {
          const alreadyCovered = projectWorkDays.some(wd => wd.date === p.scheduledDate);
          if (!alreadyCovered) {
            addProjectToDate(p.scheduledDate, p);
          }
        }
      } else {
        const startDate = parseISO(p.scheduledDate!);
        const endDate = p.scheduledEndDate ? parseISO(p.scheduledEndDate) : startDate;
        try {
          const days = eachDayOfInterval({ start: startDate, end: endDate });
          for (const day of days) {
            addProjectToDate(format(day, 'yyyy-MM-dd'), p);
          }
        } catch {
          addProjectToDate(format(startDate, 'yyyy-MM-dd'), p);
        }
      }
    }
    return dateMap;
  }, [scheduledProjects, scheduleDatesByProject]);

  const calendarItems = useMemo(() =>
    Array.from(calendarDateMap.keys()).map(date => ({ date })),
    [calendarDateMap]
  );

  const selectedProjects = selectedDate
    ? calendarDateMap.get(format(selectedDate, 'yyyy-MM-dd')) || []
    : [];

  const ongoingProjects = useMemo(() => {
    return jobProjects
      .filter(p => ['scheduled', 'in_progress'].includes(p.stage))
      .sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));
  }, [jobProjects]);

  const formatJobAddress = (p: ProjectWithContact) => {
    const parts = [p.jobAddress, p.jobCity, p.jobState, p.jobZipCode].filter(Boolean);
    if (parts.length === 0) return null;
    return `${p.jobAddress || ''}${p.jobCity ? `, ${p.jobCity}` : ''}${p.jobState ? ` ${p.jobState}` : ''} ${p.jobZipCode || ''}`.trim();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2" data-testid="text-pending-schedule">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Needs Scheduling {pendingProjects.length > 0 && `(${pendingProjects.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">All projects are scheduled</p>
          ) : (
            <div className="space-y-2">
              {pendingProjects.map(p => {
                const phone = p.contact?.phone;
                const jobAddr = formatJobAddress(p);
                return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setLocation(`/projects/${p.id}?openSchedule=1`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLocation(`/projects/${p.id}?openSchedule=1`); } }}
                  className="p-3 rounded-lg border bg-card border-amber-200 dark:border-amber-900/60 shadow-[0_2px_12px_-2px_rgba(245,158,11,0.35)] dark:shadow-[0_2px_12px_-2px_rgba(245,158,11,0.25)] hover:shadow-[0_4px_18px_-2px_rgba(245,158,11,0.5)] dark:hover:shadow-[0_4px_18px_-2px_rgba(245,158,11,0.4)] hover:border-amber-300 dark:hover:border-amber-700 transition-all cursor-pointer"
                  data-testid={`pending-project-${p.id}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="font-medium" data-testid={`link-pending-project-${p.id}`}>
                          {maskProjectTitle(p.title, p.contact?.name)}
                        </p>
                        <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border-amber-300 dark:border-amber-700">
                          {jobStageLabels[p.stage] || p.stage}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <User className="w-3 h-3 flex-shrink-0" />
                        {maskName(p.contact.name)}
                      </p>
                      {jobAddr && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{maskAddress(p.jobAddress || '')}{p.jobCity ? `, ${maskCity(p.jobCity)}` : ''}</span>
                        </p>
                      )}
                      {p.totalAmount != null && p.totalAmount > 0 && (
                        <p className="text-xs font-semibold mt-1">
                          ${(p.totalAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                      onClick={(e) => { e.stopPropagation(); setLocation(`/projects/${p.id}?openSchedule=1`); }}
                      data-testid={`button-schedule-pending-${p.id}`}
                    >
                      <CalendarIcon className="w-3 h-3 mr-1" />
                      Schedule
                    </Button>
                  </div>
                  {phone && (
                    <div className="flex items-center gap-1.5 pt-2 border-t border-border">
                      <span className="text-xs text-muted-foreground flex-1 truncate flex items-center gap-1">
                        <Phone className="w-3 h-3 flex-shrink-0" />
                        {formatPhoneDisplay(phone)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs gap-1"
                        onClick={(e) => { e.stopPropagation(); callContact({ phone, contactId: p.contactId, contactName: p.contact?.name }); }}
                        data-testid={`button-call-pending-${p.id}`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-xs gap-1"
                        onClick={(e) => { e.stopPropagation(); hasPhoneIntegration ? setLocation(`/messages?contactId=${p.contactId}`) : window.open(`sms:${phone}`, '_self'); }}
                        data-testid={`button-text-pending-${p.id}`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Text</span>
                      </Button>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CalendarGrid
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            items={calendarItems}
            dotRenderer={(day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayProjects = calendarDateMap.get(dateStr) || [];
              return (
                <>
                  {dayProjects.slice(0, 3).map((p, i) => (
                    <div
                      key={`p-${p.id}-${i}`}
                      className={cn("w-1.5 h-1.5 rounded-full ring-1 ring-white dark:ring-gray-800", jobStageColors[p.stage] || 'bg-emerald-500')}
                    />
                  ))}
                </>
              );
            }}
            legend={
              <>
                {(['accepted', 'scheduled', 'in_progress'] as const).map(stage => (
                  <div key={stage} className="flex items-center gap-1.5">
                    <div className={cn("w-2.5 h-2.5 rounded-full", jobStageColors[stage])} />
                    <span className="text-muted-foreground">{jobStageLabels[stage]}</span>
                  </div>
                ))}
              </>
            }
          />
        </div>

        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg" data-testid="text-job-selected-date">
                {selectedDate ? format(selectedDate, 'EEEE, MMM d') : 'Select a Date'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedDate ? (
                <p className="text-muted-foreground text-sm">Click on a date to see scheduled jobs</p>
              ) : selectedProjects.length === 0 ? (
                <p className="text-muted-foreground text-sm">No jobs scheduled on this date</p>
              ) : (
                <div className="space-y-3">
                  {selectedProjects.map(project => {
                    const workDays = scheduleDatesByProject.get(project.id) || [];
                    const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
                    const matchingWorkDay = workDays.find(wd => wd.date === selectedDateStr);
                    const displayTime = matchingWorkDay?.startTime || project.scheduledTime;
                    const displayEndTime = matchingWorkDay?.endTime || project.scheduledEndTime;
                    const workDayNotes = matchingWorkDay?.notes;

                    return (
                    <div
                      key={`proj-${project.id}`}
                      className="p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                      data-testid={`calendar-job-${project.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300">
                              <Briefcase className="w-3 h-3 mr-1" />
                              Job
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {jobStageLabels[project.stage]}
                            </Badge>
                            {workDays.length > 0 && (
                              <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700">
                                {workDays.length} work {workDays.length === 1 ? 'day' : 'days'}
                              </Badge>
                            )}
                          </div>
                          <Link href={`/projects/${project.id}`}>
                            <p className="font-medium hover:text-primary cursor-pointer" data-testid={`text-job-title-${project.id}`}>{maskProjectTitle(project.title, project.contact?.name)}</p>
                          </Link>
                          <Link href={`/contacts/${project.contactId}`} className="text-sm hover:text-primary flex items-center gap-1.5 text-muted-foreground" data-testid={`link-job-contact-${project.id}`}>
                            <User className="w-3.5 h-3.5" />
                            <span data-testid={`text-job-contact-${project.id}`}>{maskName(project.contact.name)}</span>
                          </Link>
                          {formatJobAddress(project) && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatJobAddress(project) || '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1.5 mt-1"
                            >
                              <MapPin className="w-3.5 h-3.5" />
                              <span className="truncate">{formatJobAddress(project)}</span>
                            </a>
                          )}
                          {displayTime && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                              <Clock className="w-3.5 h-3.5" />
                              {displayTime}
                              {displayEndTime && ` - ${displayEndTime}`}
                            </p>
                          )}
                          {workDayNotes && (
                            <p className="text-xs text-muted-foreground mt-1 italic">{workDayNotes}</p>
                          )}
                          {project.scheduledDate && project.scheduledEndDate && project.scheduledDate !== project.scheduledEndDate && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(parseISO(project.scheduledDate), 'MMM d')} - {format(parseISO(project.scheduledEndDate), 'MMM d')}
                            </p>
                          )}
                        </div>
                      </div>
                      {project.stage === 'scheduled' && (
                        <div className="flex gap-1 mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-800 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => updateProjectStageMutation.mutate({ id: project.id, stage: 'in_progress' })}
                            disabled={updateProjectStageMutation.isPending}
                            data-testid={`button-start-job-${project.id}`}
                          >
                            <Play className="w-3 h-3 mr-1" /> Start Job
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLocation(`/projects/${project.id}?openSchedule=1`)}
                            data-testid={`button-edit-schedule-${project.id}`}
                          >
                            <Pencil className="w-3 h-3 mr-1" /> Edit Schedule
                          </Button>
                          <Link href={`/projects/${project.id}`}>
                            <Button size="sm" variant="ghost" data-testid={`button-view-project-${project.id}`}>
                              Details
                            </Button>
                          </Link>
                        </div>
                      )}
                      {project.stage === 'in_progress' && (
                        <div className="flex gap-1 mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-800 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLocation(`/projects/${project.id}?openSchedule=1`)}
                            data-testid={`button-edit-schedule-${project.id}`}
                          >
                            <Pencil className="w-3 h-3 mr-1" /> Edit Schedule
                          </Button>
                          <Link href={`/projects/${project.id}`}>
                            <Button size="sm" variant="outline" className="flex-1" data-testid={`button-view-project-${project.id}`}>
                              View Project
                            </Button>
                          </Link>
                        </div>
                      )}
                      {project.stage === 'accepted' && (
                        <div className="flex gap-1 mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-800 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => setLocation(`/projects/${project.id}?openSchedule=1`)}
                            data-testid={`button-edit-schedule-${project.id}`}
                          >
                            <Pencil className="w-3 h-3 mr-1" /> Edit Schedule
                          </Button>
                          <Link href={`/projects/${project.id}`}>
                            <Button size="sm" variant="ghost" data-testid={`button-view-project-${project.id}`}>
                              Details
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  );})}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {ongoingProjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2" data-testid="text-ongoing-scheduled-jobs">
              <Briefcase className="w-5 h-5 text-blue-500" />
              Ongoing Scheduled Jobs ({ongoingProjects.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ongoingProjects.map(project => {
                const phone = project.contact?.phone;
                const jobAddr = formatJobAddress(project);
                return (
                  <div
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setLocation(`/projects/${project.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLocation(`/projects/${project.id}`); } }}
                    className="p-3 rounded-lg border bg-card border-blue-200 dark:border-blue-900/60 shadow-[0_2px_12px_-2px_rgba(59,130,246,0.30)] dark:shadow-[0_2px_12px_-2px_rgba(59,130,246,0.20)] hover:shadow-[0_4px_18px_-2px_rgba(59,130,246,0.45)] dark:hover:shadow-[0_4px_18px_-2px_rgba(59,130,246,0.35)] hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer"
                    data-testid={`row-ongoing-job-${project.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="font-medium" data-testid={`link-ongoing-project-${project.id}`}>
                            {maskProjectTitle(project.title, project.contact?.name)}
                          </p>
                          <Badge
                            className={cn(
                              "text-xs border",
                              project.stage === 'in_progress' && "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border-amber-300 dark:border-amber-700",
                              project.stage === 'scheduled' && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700"
                            )}
                            data-testid={`badge-job-stage-${project.id}`}
                          >
                            {jobStageLabels[project.stage]}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <User className="w-3 h-3 flex-shrink-0" />
                          {maskName(project.contact.name)}
                        </p>
                        {(project.scheduledDate || project.scheduledEndDate) && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <CalendarIcon className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">
                              {project.scheduledDate ? format(parseISO(project.scheduledDate), 'MMM d, yyyy') : '-'}
                              {project.scheduledTime && ` ${project.scheduledTime}`}
                              {project.scheduledEndDate && project.scheduledEndDate !== project.scheduledDate && (
                                <> – {format(parseISO(project.scheduledEndDate), 'MMM d, yyyy')}{project.scheduledEndTime && ` ${project.scheduledEndTime}`}</>
                              )}
                            </span>
                          </p>
                        )}
                        {jobAddr && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{maskAddress(project.jobAddress || '')}{project.jobCity ? `, ${maskCity(project.jobCity)}` : ''}</span>
                          </p>
                        )}
                        {project.totalAmount != null && project.totalAmount > 0 && (
                          <p className="text-xs font-semibold mt-1">
                            ${(project.totalAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={(e) => { e.stopPropagation(); setLocation(`/projects/${project.id}?openSchedule=1`); }}
                        data-testid={`button-edit-ongoing-${project.id}`}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                    </div>
                    {(phone || jobAddr) && (
                      <div className="flex items-center gap-1.5 pt-2 border-t border-border">
                        {phone ? (
                          <span className="text-xs text-muted-foreground flex-1 truncate flex items-center gap-1">
                            <Phone className="w-3 h-3 flex-shrink-0" />
                            {formatPhoneDisplay(phone)}
                          </span>
                        ) : (
                          <span className="flex-1" />
                        )}
                        {jobAddr && (
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1"
                            onClick={(e) => { e.stopPropagation(); window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(jobAddr)}`, '_blank'); }}
                            data-testid={`button-navigate-ongoing-${project.id}`}
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            <span>Map</span>
                          </Button>
                        )}
                        {phone && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 px-2 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs gap-1"
                              onClick={(e) => { e.stopPropagation(); callContact({ phone, contactId: project.contactId, contactName: project.contact?.name }); }}
                              data-testid={`button-call-ongoing-${project.id}`}
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Call</span>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 px-2 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-xs gap-1"
                              onClick={(e) => { e.stopPropagation(); hasPhoneIntegration ? setLocation(`/messages?contactId=${project.contactId}`) : window.open(`sms:${phone}`, '_self'); }}
                              data-testid={`button-text-ongoing-${project.id}`}
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Text</span>
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      {callDialog}
    </div>
  );
}

const REMINDER_OPTIONS = [
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 360, label: '6 hours before' },
  { value: 1440, label: '1 day before' },
  { value: 2880, label: '2 days before' },
];

function formatReminderLabel(minutes: number): string {
  const option = REMINDER_OPTIONS.find(o => o.value === minutes);
  if (option) return option.label;
  if (minutes < 60) return `${minutes} min before`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr before`;
  return `${Math.round(minutes / 1440)} day(s) before`;
}

function CalendarSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localIntervals, setLocalIntervals] = useState<number[]>([]);

  const { data, isLoading } = useQuery<{ intervals: number[] }>({
    queryKey: ['/api/settings/appointment-reminders'],
    enabled: open,
  });

  const { data: syncData, isLoading: syncLoading } = useQuery<{ enabled: boolean; connected: boolean; googleEmail: string | null }>({
    queryKey: ['/api/settings/calendar-sync'],
    enabled: open,
  });

  useEffect(() => {
    if (data?.intervals) {
      setLocalIntervals(data.intervals);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (intervals: number[]) => {
      const res = await apiRequest('PUT', '/api/settings/appointment-reminders', { intervals });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/appointment-reminders'] });
      toast({ title: 'Reminder settings saved' });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: 'Failed to save', variant: 'destructive' });
    },
  });

  const syncToggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest('PUT', '/api/settings/calendar-sync', { enabled });
      return res.json();
    },
    onSuccess: (result: { enabled: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/calendar-sync'] });
      toast({ title: result.enabled ? 'Google Calendar sync enabled' : 'Google Calendar sync disabled' });
    },
    onError: () => {
      toast({ title: 'Failed to update sync setting', variant: 'destructive' });
    },
  });

  const intervals = localIntervals;
  const hasChanges = JSON.stringify(localIntervals) !== JSON.stringify(data?.intervals || []);

  const addReminder = () => {
    if (intervals.length >= 3) return;
    const used = new Set(intervals);
    const next = REMINDER_OPTIONS.find(o => !used.has(o.value));
    if (next) setLocalIntervals([...intervals, next.value].sort((a, b) => b - a));
  };

  const removeReminder = (index: number) => {
    setLocalIntervals(intervals.filter((_, i) => i !== index));
  };

  const updateReminder = (index: number, value: number) => {
    const updated = [...intervals];
    updated[index] = value;
    setLocalIntervals([...new Set(updated)].sort((a, b) => b - a));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Calendar Settings
          </DialogTitle>
          <DialogDescription>
            Configure appointment reminders and Google Calendar sync.
          </DialogDescription>
        </DialogHeader>

        {(isLoading || syncLoading) ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Google Calendar Sync</Label>
                </div>
                <Switch
                  checked={syncData?.enabled || false}
                  onCheckedChange={(checked) => syncToggleMutation.mutate(checked)}
                  disabled={!syncData?.connected || syncToggleMutation.isPending}
                  data-testid="switch-calendar-sync"
                />
              </div>
              {syncData?.connected ? (
                <p className="text-xs text-muted-foreground pl-6">
                  {syncData.enabled
                    ? `Syncing appointments to ${syncData.googleEmail || 'Google Calendar'}`
                    : 'Enable to automatically sync appointments to Google Calendar'}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground pl-6">
                  Connect Google in Integrations to enable calendar sync.
                </p>
              )}
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Appointment Reminders</Label>
              </div>
              {intervals.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No reminders set. Add one below.
                </p>
              )}
              {intervals.map((mins, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-muted-foreground shrink-0 invisible" />
                  <Select
                    value={String(mins)}
                    onValueChange={(v) => updateReminder(idx, Number(v))}
                  >
                    <SelectTrigger className="flex-1" data-testid={`select-reminder-${idx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REMINDER_OPTIONS.filter(o => o.value === mins || !intervals.includes(o.value)).map(o => (
                        <SelectItem key={o.value} value={String(o.value)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeReminder(idx)}
                    data-testid={`button-remove-reminder-${idx}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {intervals.length < 3 && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={addReminder}
                  data-testid="button-add-reminder"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Reminder
                </Button>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-reminders">
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate(intervals)}
            disabled={saveMutation.isPending || !hasChanges}
            data-testid="button-save-reminders"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CalendarPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') === 'jobs' ? 'jobs' : 'appointments';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [showCalendarSettings, setShowCalendarSettings] = useState(false);

  const { data: appointments, isLoading: loadingAppointments } = useQuery<AppointmentWithContact[]>({
    queryKey: ['/api/appointments'],
  });

  const { data: allProjects, isLoading: loadingProjects } = useQuery<ProjectWithContact[]>({
    queryKey: ['/api/projects'],
  });

  const isLoading = loadingAppointments || loadingProjects;

  const jobProjects = useMemo(() =>
    (allProjects || []).filter(p => JOB_STAGES.includes(p.stage as any)),
    [allProjects]
  );

  if (isLoading && !appointments && !allProjects) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" data-testid="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-24 space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarIcon className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold" data-testid="text-calendar-title">Calendar</h1>
            <p className="text-muted-foreground text-sm">Manage appointments and job schedules</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowCalendarSettings(true)}
          className="shrink-0"
          data-testid="button-calendar-settings"
        >
          <Settings className="w-5 h-5" />
        </Button>
      </div>

      <CalendarSettingsDialog open={showCalendarSettings} onOpenChange={setShowCalendarSettings} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full sm:w-auto" data-testid="calendar-tabs">
          <TabsTrigger value="appointments" className="flex-1 sm:flex-none gap-2" data-testid="tab-appointments">
            <CalendarIcon className="w-4 h-4" />
            Appointments
            {appointments && appointments.filter(a => a.status === 'scheduled').length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {appointments.filter(a => a.status === 'scheduled').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="jobs" className="flex-1 sm:flex-none gap-2" data-testid="tab-jobs">
            <Briefcase className="w-4 h-4" />
            Job Scheduling
            {jobProjects.filter(p => !p.scheduledDate && p.stage === 'accepted').length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {jobProjects.filter(p => !p.scheduledDate && p.stage === 'accepted').length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="mt-6">
          <AppointmentsTab />
        </TabsContent>

        <TabsContent value="jobs" className="mt-6">
          <JobSchedulingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
