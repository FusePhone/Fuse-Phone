import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useContact, useDeleteContact } from "@/hooks/use-contacts";
import { useMakeCall, useCompanySettings, useCommunications } from "@/hooks/use-company-settings";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { CreateAppointmentDialog } from "@/components/CreateAppointmentDialog";
import { EditAppointmentDialog } from "@/components/EditAppointmentDialog";
import { EditContactDialog } from "@/components/EditContactDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Loader2, ArrowLeft, Mail, Phone, MapPin, Trash2, MessageSquare, PhoneCall, Pencil, Globe, AlertTriangle, ChevronUp, ChevronDown, Calendar, Clock, X, BellOff, Plus, FolderOpen, ChevronRight, Bell, Info, Navigation, Archive, ArchiveRestore, PhoneIncoming, PhoneOutgoing, PhoneMissed, Voicemail } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Appointment, Project } from "@shared/schema";
import { AddressDisplay } from "@/components/AddressMapLink";
import { Link, useLocation } from "wouter";
import { useSafeBack } from "@/hooks/use-safe-back";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SmartNudge {
  text: string;
  urgency: "low" | "medium" | "high";
  action: "call" | "message" | "reminder";
}

function getContactProjectNudge(stage: string, stageChangedAt: string | Date | null, activities?: any[]): SmartNudge | null {
  if (stage === "completed") return null;
  const now = new Date();
  const dates = [
    stageChangedAt ? new Date(stageChangedAt) : null,
    ...(activities?.map((a: any) => new Date(a.createdAt)) || []),
  ].filter(Boolean) as Date[];
  const lastAction = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
  const idle = lastAction ? Math.floor((now.getTime() - lastAction.getTime()) / 86400000) : 999;

  switch (stage) {
    case "new_lead":
    case "appointment_requested":
    case "draft":
      if (idle >= 3) return { text: `No contact in ${idle}d`, urgency: "high", action: "call" };
      if (idle >= 1) return { text: "Needs intro call", urgency: "medium", action: "call" };
      return null;
    case "proposal_sent":
      if (idle >= 5) return { text: `No reply in ${idle}d`, urgency: "high", action: "call" };
      if (idle >= 2) return { text: "Follow up on proposal", urgency: "medium", action: "call" };
      return null;
    case "accepted":
      if (idle >= 3) return { text: `Schedule the job — ${idle}d idle`, urgency: "high", action: "call" };
      if (idle >= 1) return { text: "Confirm & schedule", urgency: "medium", action: "call" };
      return null;
    case "scheduled":
      if (idle >= 5) return { text: "Confirm before start", urgency: "medium", action: "call" };
      return null;
    case "in_progress":
      if (idle >= 7) return { text: `${idle}d since update`, urgency: "high", action: "call" };
      if (idle >= 3) return { text: "Update client", urgency: "medium", action: "message" };
      return null;
    case "invoiced":
      if (idle >= 7) return { text: `Payment ${idle}d overdue`, urgency: "high", action: "call" };
      if (idle >= 3) return { text: "Send reminder", urgency: "medium", action: "message" };
      return null;
    case "paid":
      if (idle >= 3) return { text: "Close out project", urgency: "medium", action: "reminder" };
      return null;
    default:
      return null;
  }
}

export default function ContactDetail({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const { maskName, maskPhone, maskEmail, maskAddress, maskCity } = useDemoMode();
  const userTier = user?.subscriptionTier || 'starter';
  const contactId = parseInt(params.id)
  const { data: contact, isLoading: contactLoading, isError: contactError, refetch: refetchContact } = useContact(contactId);
  const { data: contactProjects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['/api/projects', { contactId }],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/projects?contactId=${contactId}`);
      if (!res.ok) throw new Error(`${res.status}: Failed to fetch projects`);
      return res.json();
    },
  });
  const { mutate: deleteContact, isPending: isDeleting } = useDeleteContact();
  const { mutate: makeCall, isPending: isCalling } = useMakeCall();
  const { data: companySettings } = useCompanySettings();
  const isOpenPhoneProvider = companySettings?.phoneProvider === 'openphone';
  const isOpenPhoneConfigured = isOpenPhoneProvider && !!companySettings?.openphonePhoneNumber;
  const isTwilioConfigured = !isOpenPhoneProvider && !!companySettings?.twilioAccountSid && !!companySettings?.twilioAuthToken && !!companySettings?.twilioPhoneNumber;
  const hasOfficePhone = !!companySettings?.twilioOfficePhone;
  const [, setLocation] = useLocation();
  const handleBack = useSafeBack("/contacts");
  const { toast } = useToast();
  const [showCallConfirm, setShowCallConfirm] = useState(false);
  const [showOpenPhoneCallDialog, setShowOpenPhoneCallDialog] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreateProjectConfirm, setShowCreateProjectConfirm] = useState(false);
  const [associations, setAssociations] = useState<{ projectCount: number; documentCount: number; projectTitles: string[] } | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [cancellingAppointment, setCancellingAppointment] = useState<Appointment | null>(null);
  const [aiSuggestionDismissed, setAiSuggestionDismissed] = useState(false);
  const queryClient = useQueryClient();

  const aiActionId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('ai_action');
  }, []);

  const { data: aiActionData } = useQuery<any>({
    queryKey: [`/api/ai-actions/${aiActionId}`],
    enabled: !!aiActionId && !aiSuggestionDismissed,
  });

  const applyAiSuggestionMutation = useMutation({
    mutationFn: async () => {
      const details = aiActionData?.details;
      if (!details || !contact) return;
      const updates: Record<string, any> = {};
      if (details.address && !contact.address) updates.address = details.address;
      if (details.city && !contact.city) updates.city = details.city;
      if (details.state && !contact.state) updates.state = details.state;
      if (details.zip && !contact.zipCode) updates.zipCode = details.zip;
      if (details.email && !contact.email) updates.email = details.email;
      if (details.name && contact.name === contact.phone) updates.name = details.name;
      if (Object.keys(updates).length === 0) return;
      await apiRequest('PUT', `/api/contacts/${contactId}`, updates);
      if (aiActionId) {
        await apiRequest('PATCH', `/api/ai-actions/${aiActionId}`, { status: 'acted' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts', contactId] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai-actions'] });
      setAiSuggestionDismissed(true);
      toast({ title: "Contact updated with AI suggestions" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const { data: appointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ['/api/appointments', contactId],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/appointments?contactId=${contactId}`);
      if (!res.ok) throw new Error(`${res.status}: Failed to fetch appointments`);
      return res.json();
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest('PUT', `/api/appointments/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments', contactId] });
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      toast({ title: "Appointment updated" });
    },
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/appointments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments', contactId] });
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      toast({ title: "Appointment deleted" });
    },
  });

  const pauseAutomationsMutation = useMutation({
    mutationFn: async ({ id, pauseAutomations }: { id: number; pauseAutomations: boolean }) => {
      await apiRequest('PUT', `/api/contacts/${id}`, { pauseAutomations });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts', contactId] });
      toast({ title: vars.pauseAutomations ? "Automations paused" : "Automations resumed" });
    },
  });

  const { data: commHistory } = useCommunications(contactId ? parseInt(contactId) : undefined);

  const recentComms = useMemo(() => {
    if (!Array.isArray(commHistory)) return [];
    return [...commHistory]
      .sort((a, b) => {
        const ta = new Date(String(a.timestamp).endsWith('Z') ? a.timestamp : a.timestamp + 'Z').getTime();
        const tb = new Date(String(b.timestamp).endsWith('Z') ? b.timestamp : b.timestamp + 'Z').getTime();
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      })
      .slice(0, 20);
  }, [commHistory]);

  const archiveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/contacts/${contactId}/archive`);
    },
    onSuccess: () => {
      toast({ title: "Contact archived", description: "All automations have been cancelled." });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes?.('/api/contacts') });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/contacts/${contactId}/unarchive`);
    },
    onSuccess: () => {
      toast({ title: "Contact restored", description: "Contact is now active again." });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes?.('/api/contacts') });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
    },
  });

  const { data: nextProjectNumberData } = useQuery<{ nextNumber: number }>({
    queryKey: ["/api/projects/next-number"],
    enabled: showCreateProjectConfirm,
  });

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      if (!contact) throw new Error("Contact not loaded");
      const title = `${contact.name} #${nextProjectNumberData?.nextNumber || 4200}`;
      const hasExisting = (contactProjects?.length || 0) > 0;
      const source = hasExisting ? 'repeat_customer' : (contact.leadSource || null);
      const res = await apiRequest("POST", "/api/projects", {
        contactId: contact.id,
        title,
        source,
        stage: "new_lead",
      });
      return res.json();
    },
    onSuccess: (project: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', { contactId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/next-number"] });
      setShowCreateProjectConfirm(false);
      toast({ title: "Project created" });
      setLocation(`/projects/${project.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Failed to create project", description: err?.message, variant: "destructive" });
    },
  });

  if (contactLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (contactError || !contact) {
    return (
      <div className="p-8 text-center space-y-4">
        <h2 className="text-2xl font-bold">{contactError ? "Couldn't load contact" : "Contact not found"}</h2>
        <p className="text-muted-foreground text-sm">
          {contactError ? "There was a problem loading this contact. Please try again." : "This contact may have been deleted."}
        </p>
        <div className="flex items-center justify-center gap-3">
          {contactError && (
            <Button onClick={() => refetchContact()} data-testid="button-retry-contact">
              Try Again
            </Button>
          )}
          <Link href="/contacts" className="text-primary hover:underline inline-block">
            Return to Contacts
          </Link>
        </div>
      </div>
    );
  }

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/contacts/${contactId}/associations`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAssociations(data);
      } else {
        setAssociations({ projectCount: 0, documentCount: 0, projectTitles: [] });
      }
    } catch {
      setAssociations({ projectCount: 0, documentCount: 0, projectTitles: [] });
    }
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    deleteContact(contactId, {
      onSuccess: () => {
        toast({ title: "Contact deleted" });
        queryClient.invalidateQueries({ queryKey: ['/api/communications/conversation-contacts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/communications/unknown-numbers'] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
        setLocation("/");
      },
    });
    setShowDeleteConfirm(false);
  };

  const handleMessage = () => {
    if (!contact.phone && !contact.email) {
      toast({
        title: "No phone or email",
        description: "Add a phone number or email to this contact before messaging.",
        variant: "destructive",
      });
      return;
    }
    const hasInAppMessaging = userTier === 'elite' && (isTwilioConfigured || isOpenPhoneConfigured);
    if (hasInAppMessaging || !contact.phone) {
      setLocation(`/messages?contactId=${contact.id}`);
    } else {
      window.location.href = `sms:${contact.phone}`;
    }
  };

  const handleCallClick = () => {
    if (!contact.phone) {
      toast({ title: "No phone number", description: "This contact doesn't have a phone number yet.", variant: "destructive" });
      return;
    }
    if (isOpenPhoneProvider) {
      setShowOpenPhoneCallDialog(true);
    } else if (isTwilioConfigured) {
      setShowCallConfirm(true);
    } else {
      window.location.href = `tel:${contact.phone}`;
    }
  };

  const handleCallConfirm = () => {
    setShowCallConfirm(false);
    makeCall({ to: contact.phone, contactId: contact.id, contactName: contact.name }, {
      onSuccess: (data: any) => {
        if (data.twoLeg) {
          toast({ 
            title: "Calling your office first", 
            description: `Answer to be connected to ${contact.name}`
          });
        } else {
          toast({ title: "Call initiated", description: `Calling ${contact.name}...` });
        }
      },
      onError: (err) => {
        toast({ title: "Failed to call", description: err.message, variant: "destructive" });
      }
    });
  };

  const activeProjects = contactProjects?.filter(p => !p.archived) || [];
  const archivedProjects = contactProjects?.filter(p => p.archived) || [];

  const totalProjectValue = activeProjects.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

  const openProjects = activeProjects.filter(p => !['completed', 'cancelled', 'lost'].includes(p.stage));

  const stageLabels: Record<string, string> = {
    new_lead: "New Lead",
    appointment_requested: "Appt Requested",
    draft: "Draft",
    proposal_sent: "Proposal Sent",
    accepted: "Accepted",
    scheduled: "Scheduled",
    in_progress: "In Progress",
    invoiced: "Invoiced",
    paid: "Paid",
    completed: "Completed",
  };

  const stageColors: Record<string, string> = {
    new_lead: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
    appointment_requested: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300",
    draft: "bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300",
    proposal_sent: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    accepted: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
    scheduled: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
    in_progress: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    invoiced: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
    paid: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    completed: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  };

  const aiDetails = aiActionData?.details as any;
  const aiSuggestionFields = aiDetails ? [
    aiDetails.address && !contact?.address && `Address: ${aiDetails.address}`,
    aiDetails.city && !contact?.city && `City: ${aiDetails.city}`,
    aiDetails.state && !contact?.state && `State: ${aiDetails.state}`,
    aiDetails.zip && !contact?.zipCode && `ZIP: ${aiDetails.zip}`,
    aiDetails.email && !contact?.email && `Email: ${aiDetails.email}`,
    aiDetails.description && `Project: ${aiDetails.description}`,
  ].filter(Boolean) : [];

  return (
    <div className="space-y-6 p-6 pb-24 lg:p-8 lg:pb-24 animate-in fade-in duration-300">
      {aiActionData && !aiSuggestionDismissed && aiSuggestionFields.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20" data-testid="ai-suggestion-banner">
          <Pencil className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">AI found new info for this contact</p>
            <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {aiSuggestionFields.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={() => applyAiSuggestionMutation.mutate()}
                disabled={applyAiSuggestionMutation.isPending}
                data-testid="button-apply-ai-suggestion"
              >
                {applyAiSuggestionMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Apply Updates
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAiSuggestionDismissed(true);
                  if (aiActionId) apiRequest('PATCH', `/api/ai-actions/${aiActionId}`, { status: 'dismissed' });
                }}
                data-testid="button-dismiss-ai-suggestion"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}
      {contact.archived && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 flex items-center justify-between gap-3" data-testid="banner-archived-contact">
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">This contact is archived</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">No automations or messages will be sent. Restore to make active again.</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => unarchiveMutation.mutate()}
            disabled={unarchiveMutation.isPending}
            className="shrink-0"
            data-testid="button-restore-archived-contact"
          >
            {unarchiveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ArchiveRestore className="w-4 h-4 mr-1" />}
            Restore
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back-contacts">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-xl font-bold text-primary-foreground">
              {maskName(contact.name)[0]}
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display">{maskName(contact.name)}</h1>
              <div className="flex items-center gap-2">
                <Badge variant={contact.type === 'client' ? 'default' : 'secondary'}>
                  {contact.type.toUpperCase()}
                </Badge>
                {contact.archived && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700">
                    ARCHIVED
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  Added {contact.createdAt ? format(new Date(contact.createdAt), "MMM d, yyyy") : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 w-full md:w-auto md:flex md:flex-wrap md:justify-end">
          <EditContactDialog contact={contact} />
          {!contact.archived ? (
            <Button variant="outline" className="text-xs sm:text-sm min-h-8 w-full md:w-auto justify-center" size="sm" onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending} data-testid="button-archive-contact">
              {archiveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1 shrink-0" /> : <Archive className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 shrink-0" />}
              Archive
            </Button>
          ) : (
            <Button variant="outline" className="text-xs sm:text-sm min-h-8 w-full md:w-auto justify-center" size="sm" onClick={() => unarchiveMutation.mutate()} disabled={unarchiveMutation.isPending} data-testid="button-unarchive-contact">
              {unarchiveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1 shrink-0" /> : <ArchiveRestore className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 shrink-0" />}
              Restore
            </Button>
          )}
          <Button variant="outline" className="text-destructive text-xs sm:text-sm min-h-8 w-full md:w-auto justify-center" size="sm" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 shrink-0" />
            Delete
          </Button>
          <Button
            variant="default"
            size="sm"
            className="text-xs sm:text-sm w-full md:w-auto justify-center"
            onClick={() => setShowCreateProjectConfirm(true)}
            data-testid="button-new-project"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 shrink-0" />
            New Project
          </Button>
          <CreateAppointmentDialog contactId={contactId} contactName={maskName(contact.name)} onAppointmentCreated={() => setLocation('/calendar')} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar Info */}
        <div className="space-y-4">
          {/* Quick Actions - Always Visible */}
          <div className="flex gap-2" style={{ display: userTier === 'elite' ? undefined : 'none' }}>
            <div className="flex-1 flex items-center gap-1">
              <Button variant="outline" className="flex-1" onClick={handleCallClick} disabled={isCalling} data-testid="button-call-contact">
                {isCalling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PhoneCall className="w-4 h-4 mr-2" />}
                Call
              </Button>
              {isTwilioConfigured && !hasOfficePhone && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-amber-500 shrink-0 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px]">
                    <p className="text-xs">Add your office or cell number in Settings &gt; Integrations &gt; Twilio to enable call bridging</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <Button variant="outline" className="flex-1" onClick={handleMessage} data-testid="button-message-contact">
              <MessageSquare className="w-4 h-4 mr-2" /> Text
            </Button>
          </div>

          {totalProjectValue > 0 && (
            <Card>
              <CardContent className="p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Project Value</p>
                  <p className="text-xl font-bold">
                    ${(totalProjectValue / 100).toFixed(2)}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Collapsible Contact Info */}
          <Card>
            <CardHeader 
              className="cursor-pointer py-3" 
              onClick={() => setShowContactInfo(!showContactInfo)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Contact Info</CardTitle>
                <Button variant="ghost" size="icon" className="h-6 w-6" data-testid="button-toggle-contact-info">
                  {showContactInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </div>
            </CardHeader>
            {showContactInfo && (
              <CardContent className="pt-0 space-y-4">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Email</p>
                    <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                      {maskEmail(contact.email)}
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Phone</p>
                    <p>{maskPhone(contact.phone)}</p>
                  </div>
                </div>

                {(contact.address || contact.city || contact.state) && (
                  <div className="flex items-start gap-3 text-sm">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Address</p>
                      <AddressDisplay
                        address={maskAddress(contact.address)}
                        city={maskCity(contact.city)}
                        state={contact.state}
                        zipCode={contact.zipCode}
                        showMapIcon={false}
                      />
                    </div>
                  </div>
                )}

                {contact.leadSource && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">Lead Source</p>
                      <p className="capitalize">{contact.leadSource.replace('_', ' ')}</p>
                    </div>
                  </div>
                )}

                {(contact.metadata as any)?.leadTracking && (() => {
                  const t = (contact.metadata as any).leadTracking;
                  return (
                    <div className="space-y-2 p-3 bg-muted/30 rounded-lg" data-testid="lead-tracking-info">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lead Tracking</p>
                      {t.sourceChannel && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Channel:</span>{' '}
                          <span className="font-medium" data-testid="text-source-channel">{t.sourceChannel}</span>
                        </div>
                      )}
                      {t.utmSource && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Source:</span> {t.utmSource}
                          {t.utmMedium && <> / {t.utmMedium}</>}
                        </div>
                      )}
                      {t.utmCampaign && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Campaign:</span> {t.utmCampaign}
                        </div>
                      )}
                      {t.landingPage && (
                        <div className="text-sm truncate">
                          <span className="text-muted-foreground">Landing:</span>{' '}
                          <span className="text-xs">{t.landingPage}</span>
                        </div>
                      )}
                      {t.formPage && t.formPage !== t.landingPage && (
                        <div className="text-sm truncate">
                          <span className="text-muted-foreground">Form Page:</span>{' '}
                          <span className="text-xs">{t.formPage}</span>
                        </div>
                      )}
                      {t.referrer && (
                        <div className="text-sm truncate">
                          <span className="text-muted-foreground">Referrer:</span>{' '}
                          <span className="text-xs">{t.referrer}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <BellOff className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <Label htmlFor="pause-automations" className="font-medium cursor-pointer">Pause Automations</Label>
                      <p className="text-xs text-muted-foreground">Stop all automated messages for this contact</p>
                    </div>
                  </div>
                  <Switch
                    id="pause-automations"
                    checked={contact.pauseAutomations === true}
                    onCheckedChange={(checked) => {
                      pauseAutomationsMutation.mutate({ id: contactId, pauseAutomations: checked });
                    }}
                    data-testid="switch-pause-automations"
                  />
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Main Content - Projects */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold">Projects</h2>
          </div>

          {projectsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : activeProjects.length === 0 && archivedProjects.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-xl">
              <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-medium text-lg">No projects yet</h3>
              <p className="text-muted-foreground mb-4">Create a project to start tracking work for this contact.</p>
              <Button
                onClick={() => setShowCreateProjectConfirm(true)}
                data-testid="button-create-first-project"
              >
                <Plus className="w-4 h-4 mr-1" />
                Create First Project
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeProjects.map((project) => (
                <Card
                  key={project.id}
                  className="hover-elevate cursor-pointer"
                  onClick={() => setLocation(`/projects/${project.id}`)}
                  data-testid={`project-card-${project.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{project.title}</p>
                          <Badge variant="secondary" className={cn("text-[10px]", stageColors[project.stage] || "")}>
                            {stageLabels[project.stage] || project.stage}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {project.totalAmount != null && project.totalAmount > 0 && (
                            <span className="font-medium">
                              {(project.totalAmount / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                            </span>
                          )}
                          {project.createdAt && (
                            <span>{format(new Date(project.createdAt), "MMM d, yyyy")}</span>
                          )}
                          {project.source && (
                            <span className="capitalize">{project.source.replace('_', ' ')}</span>
                          )}
                          {project.reminderAt && (
                            <span className={cn(
                              "inline-flex items-center gap-1",
                              new Date(project.reminderAt) < new Date() ? "text-destructive" : "text-orange-500 dark:text-orange-400"
                            )} data-testid={`text-followup-${project.id}`}>
                              <Clock className="w-3 h-3" />
                              Follow-up {format(new Date(project.reminderAt), "MMM d")}
                            </span>
                          )}
                          {!project.reminderAt && (() => {
                            const nudge = getContactProjectNudge(project.stage, (project as any).stageChangedAt, (project as any).activities);
                            if (!nudge) return null;
                            const NIcon = nudge.action === "call" ? Phone : nudge.action === "message" ? MessageSquare : Bell;
                            return (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 cursor-pointer",
                                  nudge.urgency === "high" ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (nudge.action === "call" && contact?.phone) {
                                    if (userTier !== 'elite' || (!isOpenPhoneProvider && !isTwilioConfigured)) {
                                      window.location.href = `tel:${contact.phone}`;
                                    } else if (isOpenPhoneProvider) {
                                      setShowOpenPhoneCallDialog(true);
                                    } else if (!hasOfficePhone) {
                                      window.location.href = `tel:${contact.phone}`;
                                    } else {
                                      setShowCallConfirm(true);
                                    }
                                  } else if (nudge.action === "message" && contact?.phone) {
                                    const hasInAppMessaging = userTier === 'elite' && (isTwilioConfigured || isOpenPhoneConfigured);
                                    if (hasInAppMessaging) {
                                      setLocation(`/messages?contactId=${contactId}`);
                                    } else {
                                      window.location.href = `sms:${contact.phone}`;
                                    }
                                  } else {
                                    setLocation(`/projects/${project.id}`);
                                  }
                                }}
                                data-testid={`text-nudge-${project.id}`}
                              >
                                <NIcon className="w-3 h-3" />
                                {nudge.text}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))}

              {archivedProjects.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">{archivedProjects.length} archived project{archivedProjects.length !== 1 ? 's' : ''}</p>
                  {archivedProjects.map((project) => (
                    <Card
                      key={project.id}
                      className="hover-elevate cursor-pointer opacity-60 mb-2"
                      onClick={() => setLocation(`/projects/${project.id}`)}
                      data-testid={`project-card-archived-${project.id}`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm truncate">{project.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {project.totalAmount != null && project.totalAmount > 0 && `${(project.totalAmount / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} · `}
                              {stageLabels[project.stage] || project.stage}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Appointments Section */}
          {appointments && appointments.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold mb-3">Appointments</h2>
              <div className="space-y-3">
                {appointments.map((appt) => {
                  const ON_SITE_TYPES = ['estimate', 'walkthrough', 'site_visit', 'other'];
                  const isOnSite = ON_SITE_TYPES.includes(appt.type);
                  const addr = contact?.address;
                  const city = contact?.city;
                  const state = contact?.state;
                  const fullAddr = [addr, city, state].filter(Boolean).join(', ');
                  const apptTypeColors: Record<string, string> = {
                    estimate: 'bg-blue-500', proposal: 'bg-blue-500', payment: 'bg-green-500',
                    walkthrough: 'bg-purple-500', site_visit: 'bg-orange-500', callback: 'bg-amber-500',
                    follow_up: 'bg-cyan-500', phone_call: 'bg-violet-500', text_schedule: 'bg-emerald-500',
                    check_in: 'bg-red-500', other: 'bg-gray-500',
                  };
                  const apptTypeLabels: Record<string, string> = {
                    estimate: 'Estimate', proposal: 'Proposal', payment: 'Payment',
                    walkthrough: 'Walk-Through', site_visit: 'On-Site Visit', callback: 'Callback',
                    follow_up: 'Follow-Up', phone_call: 'Phone Call', text_schedule: 'Text Follow-Up',
                    check_in: 'Check-In', other: 'Other',
                  };
                  return (
                    <div
                      key={appt.id}
                      className={cn(
                        "rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md active:scale-[0.99] bg-card",
                        appt.status === 'cancelled' && "opacity-60"
                      )}
                      onClick={() => setEditingAppointment(appt)}
                      data-testid={`appointment-card-${appt.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={cn("text-[11px] font-medium text-white", apptTypeColors[appt.type] || 'bg-gray-500')}>
                              {apptTypeLabels[appt.type] || appt.type.replace('_', ' ')}
                            </Badge>
                            {appt.status !== 'scheduled' && (
                              <Badge 
                                variant={appt.status === 'cancelled' ? 'destructive' : 'secondary'}
                                className="text-[11px] capitalize"
                              >
                                {appt.status}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1.5">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                              {format(new Date(appt.date), 'MMM d, yyyy')}
                            </span>
                            {appt.time && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                                {appt.time}
                              </span>
                            )}
                          </div>
                          {appt.notes && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{appt.notes}</p>
                          )}
                        </div>
                        {appt.status === 'scheduled' && isOnSite && fullAddr && (
                          <Button
                            size="icon"
                            className="h-9 w-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex-shrink-0"
                            onClick={(e) => { e.stopPropagation(); window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddr)}`, '_blank'); }}
                            data-testid={`button-navigate-appt-${appt.id}`}
                          >
                            <Navigation className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {recentComms.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold mb-3">Recent History</h2>
              <div className="space-y-2">
                {recentComms.map((comm: any) => {
                  const isCall = comm.type === 'call';
                  const isEmail = comm.type === 'email';
                  const isMissed = isCall && comm.content?.toLowerCase()?.includes('missed');
                  const isVoicemail = isCall && comm.content?.toLowerCase()?.includes('voicemail');
                  const isInbound = comm.direction === 'inbound';
                  const rawTs = comm.timestamp ? String(comm.timestamp) : null;
                  const ts = rawTs ? (() => { const d = new Date(rawTs.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(rawTs) ? rawTs : rawTs + 'Z'); return isNaN(d.getTime()) ? null : d; })() : null;
                  const hasRecording = isCall && comm.mediaUrl && comm.mediaType === 'audio';

                  let icon;
                  let iconBg;
                  let label;
                  if (isCall) {
                    if (isVoicemail) {
                      icon = <Voicemail className="w-3.5 h-3.5 text-amber-600" />;
                      iconBg = 'bg-amber-100 dark:bg-amber-900/30';
                      label = 'Voicemail';
                    } else if (isMissed) {
                      icon = <PhoneMissed className="w-3.5 h-3.5 text-red-500" />;
                      iconBg = 'bg-red-100 dark:bg-red-900/30';
                      label = 'Missed Call';
                    } else {
                      icon = isInbound ? <PhoneIncoming className="w-3.5 h-3.5 text-green-600" /> : <PhoneOutgoing className="w-3.5 h-3.5 text-blue-600" />;
                      iconBg = isInbound ? 'bg-green-100 dark:bg-green-900/30' : 'bg-blue-100 dark:bg-blue-900/30';
                      label = isInbound ? 'Inbound Call' : 'Outbound Call';
                    }
                  } else if (isEmail) {
                    icon = <Mail className="w-3.5 h-3.5 text-blue-500" />;
                    iconBg = 'bg-blue-100 dark:bg-blue-900/30';
                    label = isInbound ? 'Email Received' : 'Email Sent';
                  } else {
                    icon = <MessageSquare className="w-3.5 h-3.5 text-primary" />;
                    iconBg = 'bg-primary/10';
                    label = isInbound ? 'SMS Received' : 'SMS Sent';
                  }

                  return (
                    <div
                      key={comm.id}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => {
                        if (isCall) {
                          setLocation('/calls');
                        } else {
                          setLocation(`/messages?contactId=${contactId}`);
                        }
                      }}
                      data-testid={`comm-history-${comm.id}`}
                    >
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", iconBg)}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{label}</span>
                          <span className="text-[11px] text-muted-foreground flex-shrink-0">
                            {ts ? format(ts, 'MMM d, h:mm a') : ''}
                          </span>
                        </div>
                        {comm.content && !isCall && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{comm.content}</p>
                        )}
                        {hasRecording && (
                          <p className="text-xs text-primary mt-0.5">Recording available</p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Call Confirmation Dialog */}
      <Dialog open={showCallConfirm} onOpenChange={setShowCallConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Place a Call?
            </DialogTitle>
            <DialogDescription>
              You are about to place a call to {maskName(contact.name)}
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

      <Dialog open={showOpenPhoneCallDialog} onOpenChange={setShowOpenPhoneCallDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Call {maskName(contact.name)}
            </DialogTitle>
            <DialogDescription>
              Your phone system is managed through OpenPhone. You can make the call from OpenPhone or use your device directly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button onClick={() => { setShowOpenPhoneCallDialog(false); window.open('https://app.openphone.com', '_blank'); }} data-testid="button-open-openphone">
              Open OpenPhone
            </Button>
            <Button variant="outline" onClick={() => { setShowOpenPhoneCallDialog(false); window.location.href = `tel:${contact.phone}`; }} data-testid="button-call-device">
              <Phone className="w-4 h-4 mr-2" />
              Use Device to Call
            </Button>
            <Button variant="ghost" onClick={() => setShowOpenPhoneCallDialog(false)} data-testid="button-cancel-openphone">
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <EditAppointmentDialog
        appointment={editingAppointment}
        open={!!editingAppointment}
        onOpenChange={(open) => !open && setEditingAppointment(null)}
        contactName={maskName(contact.name)}
        onDelete={(id) => { if (confirm("Delete this appointment?")) deleteAppointmentMutation.mutate(id); }}
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
              {cancellingAppointment?.date ? ` on ${format(new Date(cancellingAppointment.date), 'MMM d, yyyy')}` : ''}?
              <br /><br />
              This action cannot be undone. The customer will not be automatically notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (cancellingAppointment) {
                  updateAppointmentMutation.mutate({ id: cancellingAppointment.id, status: 'cancelled' });
                  setCancellingAppointment(null);
                }
              }}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="button-confirm-cancel-appt"
            >
              Yes, Cancel Appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete Contact
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>Are you sure you want to delete <strong>{maskName(contact.name)}</strong>? This action cannot be undone.</p>
                {associations && (associations.projectCount > 0 || associations.documentCount > 0) && (
                  <div className="mt-3 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                    <p className="font-medium text-destructive text-sm">The following will also be deleted:</p>
                    <ul className="mt-1 text-sm space-y-1 list-disc list-inside">
                      {associations.projectCount > 0 && (
                        <li>{associations.projectCount} project{associations.projectCount > 1 ? 's' : ''}{associations.projectTitles.length > 0 && `: ${associations.projectTitles.join(', ')}`}</li>
                      )}
                      {associations.documentCount > 0 && (
                        <li>{associations.documentCount} document{associations.documentCount > 1 ? 's' : ''} (estimates, proposals, invoices)</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-contact"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Contact"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCreateProjectConfirm} onOpenChange={setShowCreateProjectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create new project?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Start a new project for <strong>{contact.name}</strong>
                  {contact.phone ? <> ({contact.phone})</> : null}?
                </p>
                {openProjects.length > 0 && (
                  <div className="mt-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-sm">
                    <p className="font-medium">Heads up: this contact already has {openProjects.length} active project{openProjects.length > 1 ? 's' : ''}.</p>
                    <p className="text-xs mt-0.5">Most recent: {openProjects[0].title}</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-new-project" disabled={createProjectMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); createProjectMutation.mutate(); }}
              disabled={createProjectMutation.isPending}
              data-testid="button-confirm-new-project"
            >
              {createProjectMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : "Create Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
