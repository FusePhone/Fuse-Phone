import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isCapacitorNative } from "@/lib/iap";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateDocument } from "@/hooks/use-documents";
import { copyToClipboard } from "@/lib/clipboard";
import { useMobileNavVisibility } from "@/components/layout/Sidebar";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { CrewNotesSection } from "@/components/CrewNotes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useNavigationGuard } from "@/hooks/use-navigation-guard";
import { savePendingUpload, removePendingUpload, getPendingUploads, notifyUploadsComplete, checkStaleUploads } from "@/lib/pending-uploads";
import { compressImage, compressBlob } from "@/lib/compress-image";
import { AutomationPausedBanner } from "@/components/AutomationPausedBanner";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useMakeCall, useCompanySettings, useSendSms, useSendEmail } from "@/hooks/use-company-settings";
import { useLocation, Link } from "wouter";
import { useSafeBack } from "@/hooks/use-safe-back";
import { format, formatDistanceToNow, addDays, parseISO, differenceInCalendarDays } from "date-fns";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { normalizePhone, isValidPhone, stripPhoneInput } from "@/lib/phone";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  User,
  Users,
  Phone,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  FileText,
  MessageSquare,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Edit,
  Trash2,
  Send,
  Plus,
  Loader2,
  Clock,
  StickyNote,
  Activity,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Settings,
  Check,
  ClipboardList,
  Hammer,
  Receipt,
  CircleDot,
  Circle,
  CheckCircle2,
  Sparkles,
  CalendarPlus,
  Camera,
  ImagePlus,
  X,
  Wrench,
  HardHat,
  TrendingUp,
  TrendingDown,
  Upload,
  MoreVertical,
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  AlertCircle,
  XCircle,
  Heart,
  ThumbsUp,
  ThumbsDown,
  Mic,
  Paintbrush,
  Search,
  Droplets,
  Info,
  CalendarClock,
  AlertTriangle,
  ChevronUp,
  ImageIcon,
  ZoomIn,
  Shield,
  Lock,
  Copy,
  Link2,
  Eye,
  EyeOff,
  CheckSquare,
  Share2,
  CheckCircle,
  CloudUpload,
  PenLine,
  RotateCcw,
  Star,
  FileDown,
  Store,
  Layers,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { CreateDocumentDialog } from "@/components/CreateDocumentDialog";
import { AppointmentCard } from "@/components/AppointmentCard";
import { EditAppointmentDialog } from "@/components/EditAppointmentDialog";
import type { ProjectWithDetails, ProjectActivity, Contact, Document, Communication, ProjectExpenseWithPhotos, CrewAssignmentWithMember, TimeEntryWithMember, TeamMember, ProjectRecipient, JobScheduleDate } from "@shared/schema";
import { AddressAutocomplete, type AddressComponents } from "@/components/AddressAutocomplete";
import { WorkOrderTab } from "@/components/WorkOrderTab";
import { useUpload } from "@/hooks/use-upload";
import { useUploadProgress } from "@/contexts/UploadProgressContext";
import { Editor as PhotoEditor, type Annotation } from "@/components/PhotoEditor";
import { PhotoGalleryViewer } from "@/components/PhotoGalleryViewer";
import { AnnotatedThumb } from "@/components/DocumentPhotos";
import { CameraCapture } from "@/components/CameraCapture";

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

const stages = [
  { value: "new_lead", label: "Lead", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" },
  { value: "appointment_requested", label: "Appt", color: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300" },
  { value: "draft", label: "Draft", color: "bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300" },
  { value: "proposal_sent", label: "Sent", color: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" },
  { value: "accepted", label: "Accepted", color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" },
  { value: "scheduled", label: "Scheduled", color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300" },
  { value: "in_progress", label: "In Progress", color: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300" },
  { value: "invoiced", label: "Invoiced", color: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" },
  { value: "paid", label: "Paid", color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" },
  { value: "completed", label: "Done", color: "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300" },
];

function getStageInfo(stage: string) {
  return stages.find(s => s.value === stage) || stages[0];
}

interface SmartNudge {
  text: string;
  urgency: "low" | "medium" | "high";
  action: "call" | "message" | "reminder";
}

function getSmartNudge(
  stage: string,
  stageChangedAt: string | Date | null,
  lastActivityDate: Date | null,
  lastCommDate: Date | null,
): SmartNudge | null {
  if (stage === "completed") return null;

  const now = new Date();
  const lastAction = [lastActivityDate, lastCommDate, stageChangedAt ? new Date(stageChangedAt) : null]
    .filter(Boolean)
    .sort((a, b) => b!.getTime() - a!.getTime())[0];
  const idleDays = lastAction ? Math.floor((now.getTime() - lastAction.getTime()) / (1000 * 60 * 60 * 24)) : 999;

  switch (stage) {
    case "new_lead":
    case "appointment_requested":
    case "draft":
      if (idleDays >= 3) return { text: `No contact in ${idleDays}d — call now`, urgency: "high", action: "call" };
      if (idleDays >= 1) return { text: "Call to introduce yourself", urgency: "medium", action: "call" };
      return { text: "Set follow-up", urgency: "low", action: "reminder" };

    case "proposal_sent":
      if (idleDays >= 5) return { text: `No reply in ${idleDays}d — call now`, urgency: "high", action: "call" };
      if (idleDays >= 2) return { text: "Follow up on proposal", urgency: "medium", action: "call" };
      return { text: "Waiting on response", urgency: "low", action: "reminder" };

    case "accepted":
      if (idleDays >= 3) return { text: `Schedule the job — ${idleDays}d idle`, urgency: "high", action: "call" };
      if (idleDays >= 1) return { text: "Call to confirm & schedule", urgency: "medium", action: "call" };
      return { text: "Confirm & schedule", urgency: "low", action: "reminder" };

    case "scheduled":
      if (idleDays >= 5) return { text: "Confirm before start date", urgency: "medium", action: "call" };
      return { text: "Remind before start", urgency: "low", action: "reminder" };

    case "in_progress":
      if (idleDays >= 7) return { text: `${idleDays}d since update — check in`, urgency: "high", action: "call" };
      if (idleDays >= 3) return { text: "Update client on progress", urgency: "medium", action: "message" };
      return { text: "Log progress", urgency: "low", action: "reminder" };

    case "invoiced":
      if (idleDays >= 7) return { text: `Payment ${idleDays}d overdue — call`, urgency: "high", action: "call" };
      if (idleDays >= 3) return { text: "Send payment reminder", urgency: "medium", action: "message" };
      return { text: "Waiting on payment", urgency: "low", action: "reminder" };

    case "paid":
      if (idleDays >= 3) return { text: "Close out this project", urgency: "medium", action: "reminder" };
      return { text: "Wrap up & close", urgency: "low", action: "reminder" };

    default:
      return { text: "Set follow-up", urgency: "low", action: "reminder" };
  }
}

function getStageIndex(stage: string) {
  return stages.findIndex(s => s.value === stage);
}

interface StageAction {
  label: string;
  description: string;
  icon: typeof FileText;
  action: string;
  variant?: "default" | "outline";
}

function getSuggestedMessage(stage: string, project: ProjectWithDetails): string {
  const name = project.contact?.name?.split(' ')[0] || '';
  const greeting = name ? `Hi ${name}` : 'Hi';

  switch (stage) {
    case "new_lead":
    case "draft":
      return `${greeting}, thank you for reaching out! I'd love to learn more about your project. When would be a good time to discuss the details?`;
    case "proposal_sent":
      return `${greeting}, just checking in on the estimate I sent over. Let me know if you have any questions or if you'd like to go over anything together.`;
    case "accepted":
      return `${greeting}, great news that you've accepted the proposal! Let's get your project scheduled. What dates work best for you?`;
    case "scheduled":
      return `${greeting}, just a reminder that we're scheduled to start your project soon. Please let me know if anything has changed or if you have any questions before we begin.`;
    case "in_progress":
      return `${greeting}, quick update on your project — things are going well! I'll keep you posted as we make more progress.`;
    case "invoiced":
      return `${greeting}, just a friendly reminder about the invoice I sent over. Please let me know if you have any questions about it.`;
    case "completed":
      return `${greeting}, thank you so much for your business! It was a pleasure working on your project. If you're happy with the results, I'd really appreciate a review. Thank you!`;
    default:
      return `${greeting}, just checking in. Let me know if there's anything you need!`;
  }
}

function getCallScript(stage: string, project: ProjectWithDetails): string {
  const name = project.contact?.name?.split(' ')[0] || 'the customer';

  switch (stage) {
    case "new_lead":
    case "draft":
      return `Introduce yourself and thank ${name} for reaching out. Ask about the project scope, timeline, and budget. Offer to schedule a visit for an estimate.`;
    case "proposal_sent":
      return `Follow up on the estimate sent to ${name}. Ask if they had a chance to review it and if they have any questions. Address any concerns about pricing.`;
    case "accepted":
      return `Congratulate ${name} on accepting the proposal. Discuss scheduling — find dates that work. Confirm project details and set expectations.`;
    case "scheduled":
      return `Confirm the upcoming job with ${name}. Review start date/time, access requirements, and any prep needed. Set expectations for the first day.`;
    case "in_progress":
      return `Update ${name} on project progress. Discuss any changes or issues found. Confirm timeline is on track.`;
    case "invoiced":
      return `Follow up with ${name} about the invoice. Ask if they received it and if they have questions. Discuss payment options if needed.`;
    default:
      return `Check in with ${name} about the project status.`;
  }
}

function getRecommendedActions(stage: string, project: ProjectWithDetails, docs: any[]): StageAction[] {
  const hasProposal = docs.some(d => d.type === "estimate" || d.type === "proposal");
  const hasSentDoc = docs.some(d => (d.type === "estimate" || d.type === "proposal") && d.status === "sent");
  const hasAcceptedDoc = docs.some(d => (d.type === "estimate" || d.type === "proposal") && d.status === "accepted");
  const hasInvoice = docs.some(d => d.type === "invoice");
  const hasSchedule = !!project.scheduledDate;

  switch (stage) {
    case "draft":
      return [
        {
          label: "Add Contact Info",
          description: "Fill in customer details",
          icon: User,
          action: "edit_project",
          variant: "default" as const,
        },
        ...(!hasProposal ? [{
          label: "Create Proposal",
          description: "Send a price quote to the customer",
          icon: ClipboardList,
          action: "create_proposal",
        }] : []),
      ];
    case "new_lead":
      return [
        ...(!hasProposal ? [{
          label: "Create Proposal",
          description: "Send a price quote to the customer",
          icon: ClipboardList,
          action: "create_proposal",
          variant: "default" as const,
        }] : []),
        {
          label: "Call Customer",
          description: "Reach out to discuss the project",
          icon: Phone,
          action: "call",
        },
        {
          label: "Send Message",
          description: "Text the customer",
          icon: MessageSquare,
          action: "message",
        },
      ];
    case "proposal_sent":
      return [
        {
          label: "Follow Up",
          description: "Call or text to check in",
          icon: Phone,
          action: "call",
          variant: "default" as const,
        },
        {
          label: "Send Reminder",
          description: "Remind them about the proposal",
          icon: Send,
          action: "message",
        },
      ];
    case "accepted":
      return [
        ...(!hasSchedule ? [{
          label: "Schedule Job",
          description: "Set a date to start the work",
          icon: Calendar,
          action: "schedule",
          variant: "default" as const,
        }] : []),
        {
          label: "Call to Confirm",
          description: "Confirm details with customer",
          icon: Phone,
          action: "call",
        },
      ];
    case "scheduled":
      return [
        {
          label: "Mark In Progress",
          description: "Start working on the job",
          icon: Hammer,
          action: "start_work",
          variant: "default" as const,
        },
        {
          label: "Call Customer",
          description: "Confirm before starting",
          icon: Phone,
          action: "call",
        },
      ];
    case "in_progress":
      return [
        ...(!hasInvoice ? [{
          label: "Create Invoice",
          description: "Bill the customer for the work",
          icon: Receipt,
          action: "create_invoice",
          variant: "default" as const,
        }] : []),
        ...(!hasSchedule ? [{
          label: "Schedule Job",
          description: "Set a date for the work",
          icon: Calendar,
          action: "schedule",
        }] : []),
      ];
    case "invoiced":
      return [
        {
          label: "Record Payment",
          description: "Mark when you receive payment",
          icon: DollarSign,
          action: "record_payment",
          variant: "default" as const,
        },
        ...(!hasSchedule ? [{
          label: "Schedule Job",
          description: "Set a date for the work",
          icon: Calendar,
          action: "schedule",
        }] : []),
        {
          label: "Send Reminder",
          description: "Follow up on payment",
          icon: Send,
          action: "message",
        },
      ];
    case "paid":
      return [
        {
          label: "Complete Project",
          description: "Mark the job as finished",
          icon: CheckCircle2,
          action: "complete",
          variant: "default" as const,
        },
        ...(!hasSchedule ? [{
          label: "Schedule Job",
          description: "Set a date for the work",
          icon: Calendar,
          action: "schedule",
        }] : []),
      ];
    case "completed":
      return [
        {
          label: "Send Thank You",
          description: "Thank the customer",
          icon: Sparkles,
          action: "message",
        },
      ];
    default:
      return [];
  }
}

function StageProgressTracker({ currentStage, userTier = 'core' }: { currentStage: string; userTier?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);

  // NOTE: All hooks (useRef above, useEffect below) MUST run on every render
  // regardless of currentStage. Do not early-return before this useEffect or
  // React will throw "Rendered fewer hooks than expected" when the stage
  // transitions to 'lost'.
  useEffect(() => {
    if (currentStage === 'lost') return;
    if (currentRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = currentRef.current;
      const scrollLeft = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
    }
  }, [currentStage]);

  if (currentStage === 'lost') {
    return (
      <div className="w-full" data-testid="stage-progress-tracker">
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="text-xs" data-testid="badge-lost">
            <X className="w-3 h-3 mr-1" />
            Lost
          </Badge>
          <span className="text-xs text-muted-foreground">This project has been marked as lost</span>
        </div>
      </div>
    );
  }

  const filteredStages = userTier === 'starter'
    ? stages.filter(s => ['new_lead', 'appointment_requested', 'proposal_sent', 'accepted', 'in_progress', 'completed'].includes(s.value))
    : stages;
  const currentFilteredIndex = filteredStages.findIndex(s => s.value === currentStage);
  const progressPercent = filteredStages.length > 1
    ? Math.round((currentFilteredIndex / (filteredStages.length - 1)) * 100)
    : 0;

  return (
    <div className="w-full" data-testid="stage-progress-tracker">
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-[10px] text-muted-foreground font-medium">Project Stage</span>
        <InfoTooltip text="Track your project from initial lead through completion. Each stage represents a milestone: Lead (new inquiry), Draft (preparing estimate), Sent (proposal delivered), Accepted (customer agreed), Scheduled (dates set), In Progress (work underway), Invoiced (bill sent), Paid (payment received), Done (project closed)." />
        <span className="ml-auto text-[10px] text-muted-foreground font-medium">{progressPercent}%</span>
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full mb-2 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
          data-testid="stage-progress-bar"
        />
      </div>
      <div ref={scrollRef} className="flex items-center gap-1.5 overflow-x-auto pb-1 scroll-smooth">
        {filteredStages.map((stage, index) => {
          const isCompleted = currentFilteredIndex >= 0 && index < currentFilteredIndex;
          const isCurrent = index === currentFilteredIndex;

          return (
            <div
              key={stage.value}
              ref={isCurrent ? currentRef : undefined}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full text-xs whitespace-nowrap transition-all shrink-0",
                isCurrent && "bg-primary text-primary-foreground font-semibold ring-2 ring-primary/30 ring-offset-1 ring-offset-background",
                isCompleted && "bg-primary/15 text-primary font-medium",
                !isCurrent && !isCompleted && "bg-muted text-muted-foreground",
              )}
              data-testid={`stage-step-${stage.value}`}
            >
              {isCompleted && <Check className="w-3 h-3 shrink-0" />}
              {isCurrent && <CircleDot className="w-3 h-3 shrink-0" />}
              {!isCompleted && !isCurrent && <Circle className="w-2.5 h-2.5 shrink-0" />}
              {stage.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const smartIconMap: Record<string, typeof FileText> = {
  MessageSquare, Phone, ClipboardList, Calendar, Hammer, Receipt, Send, DollarSign, CheckCircle2, Sparkles, FileText,
};

interface SmartSuggestionsData {
  suggestions: Array<{
    label: string;
    description: string;
    action: string;
    variant: 'default' | 'outline';
    icon: string;
    draftMessage?: string;
    urgencyNote?: string;
  }>;
  urgency: 'fresh' | 'attention' | 'cold';
  daysSinceLastContact: number | null;
  hasUnansweredInbound: boolean;
  lastMessagePreview: string | null;
  lastMessageDirection: string | null;
}

function RecommendedActions({
  project,
  docs,
  onAction,
  onActionWithDraft,
}: {
  project: ProjectWithDetails;
  docs: any[];
  onAction: (action: string) => void;
  onActionWithDraft?: (action: string, draft?: string) => void;
}) {
  const { data: smartData, isLoading } = useQuery<SmartSuggestionsData>({
    queryKey: ['/api/projects', project.id, 'smart-suggestions'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/smart-suggestions`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch suggestions');
      return res.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const stageInfo = getStageInfo(project.stage);

  const fallbackActions = getRecommendedActions(project.stage, project, docs);
  const useFallback = !smartData && !isLoading;
  const suggestions = smartData?.suggestions;
  const urgency = smartData?.urgency || 'fresh';

  if (useFallback && fallbackActions.length === 0) return null;
  if (!useFallback && (!suggestions || suggestions.length === 0) && !isLoading) return null;

  const urgencyConfig = {
    fresh: { label: 'On Track', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
    attention: { label: 'Needs Attention', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
    cold: { label: 'Going Cold', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', dot: 'bg-red-500' },
  };
  const uc = urgencyConfig[urgency];

  return (
    <div data-testid="recommended-actions">
      <div className="flex items-center justify-center gap-2 mb-1.5">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="flex items-center gap-1"><p className="text-xs font-medium text-muted-foreground">Next Steps</p> <InfoTooltip text="Smart suggestions that adapt based on your communications. They change over time — if you haven't heard back in days, they'll suggest escalating. If a customer just messaged, they'll prompt you to reply." /></span>
        {smartData && (
          <Badge variant="secondary" className={cn("text-[10px] gap-1", uc.color)} data-testid="badge-urgency">
            <span className={cn("w-1.5 h-1.5 rounded-full inline-block", uc.dot)} />
            {uc.label}
          </Badge>
        )}
        {!smartData && (
          <Badge variant="secondary" className={cn("text-[10px]", stageInfo.color)}>
            {stageInfo.label}
          </Badge>
        )}
      </div>

      {smartData?.hasUnansweredInbound && smartData.lastMessagePreview && (
        <div className="flex items-center justify-center gap-1.5 mb-1.5 px-3">
          <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full flex items-center gap-1 max-w-full" data-testid="text-unanswered-alert">
            <MessageSquare className="w-3 h-3 shrink-0" />
            <span className="truncate">Unanswered: &ldquo;{smartData.lastMessagePreview}&rdquo;</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-1.5">
        {isLoading ? (
          <div className="flex gap-1.5">
            <div className="h-8 w-28 bg-muted rounded animate-pulse" />
            <div className="h-8 w-24 bg-muted rounded animate-pulse" />
          </div>
        ) : suggestions ? (
          suggestions.map((s, i) => {
            const IconComponent = smartIconMap[s.icon] || FileText;
            return (
              <div key={s.action + i} className="flex flex-col items-center gap-0.5">
                <Button
                  variant={s.variant === "default" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (s.draftMessage && onActionWithDraft) {
                      onActionWithDraft(s.action, s.draftMessage);
                    } else {
                      onAction(s.action);
                    }
                  }}
                  data-testid={`action-${s.action}`}
                  title={s.description}
                >
                  <IconComponent className="w-3.5 h-3.5 mr-1.5" />
                  {s.label}
                </Button>
                {s.urgencyNote && (
                  <span className="text-[10px] text-muted-foreground" data-testid={`urgency-note-${i}`}>{s.urgencyNote}</span>
                )}
              </div>
            );
          })
        ) : (
          fallbackActions.map((action, i) => (
            <Button
              key={action.action + i}
              variant={action.variant === "default" ? "default" : "outline"}
              size="sm"
              onClick={() => onAction(action.action)}
              data-testid={`action-${action.action}`}
            >
              <action.icon className="w-3.5 h-3.5 mr-1.5" />
              {action.label}
            </Button>
          ))
        )}
      </div>
    </div>
  );
}

function getActivityIcon(type: string) {
  switch (type) {
    case "note": return <StickyNote className="w-4 h-4" />;
    case "stage_change": return <Activity className="w-4 h-4" />;
    case "document_created": return <FileText className="w-4 h-4" />;
    case "document_sent": return <Send className="w-4 h-4" />;
    case "document_viewed": return <FileText className="w-4 h-4" />;
    case "document_accepted": return <FileText className="w-4 h-4" />;
    case "call": return <Phone className="w-4 h-4" />;
    case "call_recording": return <Mic className="w-4 h-4" />;
    case "message": return <MessageSquare className="w-4 h-4" />;
    case "payment": return <DollarSign className="w-4 h-4" />;
    case "appointment": return <CalendarPlus className="w-4 h-4" />;
    case "appointment_completed": return <CheckCircle2 className="w-4 h-4" />;
    case "lead_received": return <Plus className="w-4 h-4" />;
    case "system": return <Settings className="w-4 h-4" />;
    case "sentiment_update": return <Sparkles className="w-4 h-4" />;
    case "ai_reminder": return <Bell className="w-4 h-4" />;
    case "portal_verification": return <Shield className="w-4 h-4" />;
    default: return <Clock className="w-4 h-4" />;
  }
}

function getActivityColor(type: string) {
  switch (type) {
    case "note": return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300";
    case "stage_change": return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300";
    case "document_created":
    case "document_sent":
    case "document_viewed":
    case "document_accepted": return "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300";
    case "call":
    case "call_recording": return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";
    case "message": return "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300";
    case "payment": return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300";
    case "appointment": return "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300";
    case "appointment_completed": return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";
    case "lead_received": return "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300";
    case "sentiment_update": return "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300";
    case "ai_reminder": return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300";
    case "portal_verification": return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300";
    default: return "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300";
  }
}

interface SentimentSuggestion {
  icon: typeof Phone;
  label: string;
  description: string;
  action: string;
  urgency: "high" | "medium" | "low";
}

function getSentimentSuggestions(
  sentimentScore: number,
  sentimentLabel: string | null,
  stage: string,
  contactHasPhone: boolean,
  contactHasEmail: boolean,
): SentimentSuggestion[] {
  const suggestions: SentimentSuggestion[] = [];

  if (sentimentScore < 20) {
    if (contactHasPhone) {
      suggestions.push({
        icon: Phone,
        label: "Call Now",
        description: "Customer is very unhappy — a personal call can help turn things around",
        action: "call",
        urgency: "high",
      });
    }
    if (contactHasEmail) {
      suggestions.push({
        icon: Mail,
        label: "Send Reassurance Email",
        description: "Follow up in writing to address their concerns",
        action: "email",
        urgency: "high",
      });
    }
    if (contactHasPhone) {
      suggestions.push({
        icon: MessageSquare,
        label: "Text to Check In",
        description: "Send a quick message acknowledging their concerns",
        action: "message",
        urgency: "medium",
      });
    }
  } else if (sentimentScore < 40) {
    if (contactHasPhone) {
      suggestions.push({
        icon: Phone,
        label: "Check In by Phone",
        description: "Customer seems frustrated — call to address concerns before they escalate",
        action: "call",
        urgency: "high",
      });
      suggestions.push({
        icon: MessageSquare,
        label: "Send a Friendly Text",
        description: "A quick message to show you're on top of things",
        action: "message",
        urgency: "medium",
      });
    }
    if (contactHasEmail && !contactHasPhone) {
      suggestions.push({
        icon: Mail,
        label: "Send a Follow-Up Email",
        description: "Reach out to understand their concerns",
        action: "email",
        urgency: "high",
      });
    }
  } else if (sentimentScore < 60) {
    if ((stage === "proposal_sent" || stage === "new_lead") && contactHasPhone) {
      suggestions.push({
        icon: Phone,
        label: "Follow Up Call",
        description: "Customer is on the fence — a call could help move things forward",
        action: "call",
        urgency: "medium",
      });
    }
    if (contactHasPhone) {
      suggestions.push({
        icon: MessageSquare,
        label: "Send Update Text",
        description: "Keep them informed to maintain positive momentum",
        action: "message",
        urgency: "medium",
      });
    }
    if (contactHasEmail && !contactHasPhone) {
      suggestions.push({
        icon: Mail,
        label: "Send an Update Email",
        description: "Keep the customer informed about their project",
        action: "email",
        urgency: "medium",
      });
    }
  } else if (sentimentScore >= 80) {
    if (stage === "new_lead" || stage === "draft") {
      if (contactHasPhone) {
        suggestions.push({
          icon: Phone,
          label: "Build the Relationship",
          description: "Customer is excited — call to keep the momentum going",
          action: "call",
          urgency: "low",
        });
      }
    }
    if (stage === "proposal_sent" && contactHasPhone) {
      suggestions.push({
        icon: Phone,
        label: "Close the Deal",
        description: "Customer is enthusiastic — call to finalize details",
        action: "call",
        urgency: "medium",
      });
    }
    if (stage === "accepted" || stage === "scheduled") {
      if (contactHasPhone) {
        suggestions.push({
          icon: MessageSquare,
          label: "Confirm Details",
          description: "Customer is happy — great time to confirm project details",
          action: "message",
          urgency: "low",
        });
      }
    }
    if (stage === "in_progress" || stage === "invoiced" || stage === "paid" || stage === "completed") {
      if (contactHasEmail) {
        suggestions.push({
          icon: Mail,
          label: "Request a Review",
          description: "Customer is very happy — perfect time to ask for a review or referral",
          action: "email",
          urgency: "low",
        });
      }
      if (contactHasPhone) {
        suggestions.push({
          icon: MessageSquare,
          label: "Say Thank You",
          description: "Send a thank-you message to strengthen the relationship",
          action: "message",
          urgency: "low",
        });
      }
    }
  } else {
    if (stage === "in_progress" && contactHasPhone) {
      suggestions.push({
        icon: MessageSquare,
        label: "Send Progress Update",
        description: "Keep the customer in the loop on how the job is going",
        action: "message",
        urgency: "low",
      });
    }
    if (stage === "invoiced" && contactHasPhone) {
      suggestions.push({
        icon: Phone,
        label: "Follow Up on Payment",
        description: "Friendly reminder call about the invoice",
        action: "call",
        urgency: "medium",
      });
    }
    if ((stage === "new_lead" || stage === "proposal_sent") && contactHasPhone) {
      suggestions.push({
        icon: MessageSquare,
        label: "Stay in Touch",
        description: "A quick text to keep the conversation going",
        action: "message",
        urgency: "low",
      });
    }
  }

  return suggestions;
}

function AttentionContextBanner() {
  const [visible, setVisible] = useState(true);
  const params = new URLSearchParams(window.location.search);
  const attentionParam = params.get('attention');
  if (!attentionParam || !visible) return null;
  const types = decodeURIComponent(attentionParam).split(',').filter(Boolean);
  const descriptions: string[] = [];
  for (const t of types) {
    if (t === 'low_sentiment') descriptions.push('Customer sentiment is low — consider reaching out');
    else if (t === 'reminder') descriptions.push('You have an overdue or upcoming reminder');
    else if (t === 'paused') descriptions.push('Follow-up automation is paused');
    else if (t === 'needs_scheduling') descriptions.push('This job was accepted but not yet scheduled');
    else if (t === 'idle') descriptions.push('This project has been idle — time to follow up');
    else if (t === 'ai_action') descriptions.push('AI flagged this project for your review');
  }
  if (descriptions.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-3" data-testid="attention-context-banner">
      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Why this needs attention</p>
        <ul className="mt-1 space-y-0.5">
          {descriptions.map((desc, i) => (
            <li key={i} className="text-xs text-amber-800 dark:text-amber-300">{desc}</li>
          ))}
        </ul>
      </div>
      <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0 text-amber-600 dark:text-amber-400" onClick={() => setVisible(false)} data-testid="dismiss-attention-banner"><X className="w-3.5 h-3.5" /></Button>
    </div>
  );
}

function ColorDeadlineBanner({ projectId, submission }: { projectId: number; submission: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [dateVal, setDateVal] = useState("");
  const datePickerRef = useRef<HTMLInputElement>(null);

  const currentDeadline = submission?.deadline;
  const hasDeadline = !!currentDeadline;

  useEffect(() => {
    if (currentDeadline) {
      const d = new Date(currentDeadline);
      setDateVal(d.toISOString().split('T')[0]);
    }
  }, [currentDeadline]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const deadlineStr = `${dateVal}T17:00:00`;
      const res = await fetch(`/api/projects/${projectId}/color-submission/${submission.id}/deadline`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ deadline: deadlineStr }),
      });
      if (!res.ok) throw new Error('Failed to update deadline');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-submission"] });
      setEditing(false);
      toast({ title: "Deadline updated" });
    },
    onError: () => toast({ title: "Failed to update deadline", variant: "destructive" }),
  });

  if (!hasDeadline && !editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-dashed border-red-400/50 bg-red-500/10 hover:bg-red-500/20 transition-colors"
        data-testid="button-set-deadline"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
        <span className="text-xs font-medium text-red-300">No deadline set · Tap to add</span>
      </button>
    );
  }

  if (editing) {
    return (
      <div className="space-y-2 py-2" data-testid="deadline-editor">
        <input
          ref={datePickerRef}
          type="date"
          value={dateVal}
          onChange={e => setDateVal(e.target.value)}
          className="sr-only"
          data-testid="input-edit-deadline-date"
        />
        <button
          type="button"
          onClick={() => datePickerRef.current?.showPicker?.() || datePickerRef.current?.focus()}
          className="mx-auto flex items-center gap-2 py-2 px-4 rounded-lg bg-white/10 hover:bg-white/15 transition-colors"
        >
          <Calendar className="w-3.5 h-3.5 text-white/50" />
          <span className="text-sm font-medium text-white">
            {dateVal ? new Date(dateVal + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pick a date'}
          </span>
          <PenLine className="w-3 h-3 text-white/30" />
        </button>
        <div className="flex gap-2 justify-center">
          <Button size="sm" className="h-7 text-xs bg-white/20 hover:bg-white/30 text-white border-0" disabled={!dateVal || saveMutation.isPending} onClick={() => saveMutation.mutate()} data-testid="button-save-deadline">
            {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
            Save
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-white/60 hover:text-white hover:bg-white/10" onClick={() => setEditing(false)} data-testid="button-cancel-deadline">Cancel</Button>
        </div>
      </div>
    );
  }

  const dl = new Date(currentDeadline);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const daysLeft = Math.ceil((dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const formatted = dl.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  let dateColor: string;
  let pillBg: string;
  let pillText: string;
  let urgencyLabel: string;
  let iconEl: JSX.Element;

  if (daysLeft <= 0) {
    dateColor = 'text-red-400';
    pillBg = 'bg-red-500/25';
    pillText = 'text-red-300';
    urgencyLabel = daysLeft === 0 ? 'Due Today' : 'Past Due';
    iconEl = <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  } else if (daysLeft <= 3) {
    dateColor = 'text-red-300';
    pillBg = 'bg-red-500/20';
    pillText = 'text-red-300';
    urgencyLabel = `${daysLeft}d left`;
    iconEl = <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  } else if (daysLeft <= 7) {
    dateColor = 'text-orange-300';
    pillBg = 'bg-orange-500/20';
    pillText = 'text-orange-300';
    urgencyLabel = `${daysLeft}d left`;
    iconEl = <Clock className="w-3.5 h-3.5 text-orange-400 shrink-0" />;
  } else {
    dateColor = 'text-white/80';
    pillBg = 'bg-white/10';
    pillText = 'text-white/60';
    urgencyLabel = `${daysLeft}d left`;
    iconEl = <Clock className="w-3.5 h-3.5 text-white/50 shrink-0" />;
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-white/10 hover:bg-white/15 transition-colors"
      data-testid="color-deadline-banner"
    >
      {iconEl}
      <span className={`text-xs font-medium ${dateColor}`}>{formatted}</span>
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${pillBg} ${pillText}`}>
        {urgencyLabel}
      </span>
      <PenLine className="w-3 h-3 text-white/30 shrink-0 ml-0.5" />
    </button>
  );
}

function CreateGroupInline({ defaultName, onSubmit }: { defaultName: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(defaultName);
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name"
        className="h-7 text-xs"
        data-testid="input-new-group-name"
      />
      <Button
        size="sm"
        className="h-7 text-xs px-2"
        disabled={!name.trim()}
        onClick={() => { if (name.trim()) onSubmit(name.trim()); }}
        data-testid="button-create-group"
      >
        Create
      </Button>
    </div>
  );
}

export function ColorsTab({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSelectedColor, setSearchSelectedColor] = useState<{ id: number; name: string; code: string; brand: string; hexColor: string } | null>(null);
  const [activeSurface, setActiveSurface] = useState<{ roomId: string; roomName: string; surfaceKey: string; surfaceLabel: string } | null>(null);
  const [manualRooms, setManualRooms] = useState<Array<{ id: string; name: string; surfaces: Array<{ key: string; label: string }> }>>([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);
  const [sendSelection, setSendSelection] = useState<Set<string>>(new Set());
  const [contractorSurfaceNotes, setContractorSurfaceNotes] = useState<Record<string, string>>({});
  const contractorNoteTimers = useRef<Record<string, NodeJS.Timeout>>({});
  // Inline customer-note drafts per group (autosaved, debounced)
  const [groupCustomerNoteDrafts, setGroupCustomerNoteDrafts] = useState<Record<number, string>>({});
  const groupCustomerNoteTimers = useRef<Record<number, NodeJS.Timeout>>({});
  // Inline "Add area" form inside the group editor
  const [groupAddAreaOpen, setGroupAddAreaOpen] = useState(false);
  const [groupAddAreaName, setGroupAddAreaName] = useState("");
  const [groupAddAreaSurfaces, setGroupAddAreaSurfaces] = useState<Set<string>>(new Set());
  const [groupAddAreaCustom, setGroupAddAreaCustom] = useState("");

  const { data: surfaceData, isLoading: surfacesLoading } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "color-surfaces"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/color-surfaces`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load surfaces");
      return res.json();
    },
  });

  const { data: colorSelections = [], isLoading: colorsLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "colors"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/colors`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load colors");
      return res.json();
    },
  });

  const { data: paintColors = [] } = useQuery<any[]>({
    queryKey: ["/api/paint-colors"],
    enabled: true,
  });

  const { data: colorSubmission } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "color-submission"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/color-submission`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });


  const [showColorMatch, setShowColorMatch] = useState(false);
  const [colorMatchDesc, setColorMatchDesc] = useState("");
  const [colorMatchFile, setColorMatchFile] = useState<File | null>(null);
  const [colorMatchPreview, setColorMatchPreview] = useState("");
  const colorMatchFileRef = useRef<HTMLInputElement>(null);
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const pendingBlobUrls = useRef<Record<string, string>>({});
  const existingPhotoRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<number | null>(null);

  const uploadPhotoMutation = useMutation({
    mutationFn: async ({ selectionId, file }: { selectionId: number; file: File }) => {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`/api/projects/${projectId}/colors/${selectionId}/image`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Photo upload failed");
    },
    onMutate: async ({ selectionId, file }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/projects", projectId, "colors"] });
      const prev = queryClient.getQueryData(["/api/projects", projectId, "colors"]);
      const localUrl = URL.createObjectURL(file);
      queryClient.setQueryData(["/api/projects", projectId, "colors"], (old: any) =>
        old?.map((s: any) => s.id === selectionId ? { ...s, customImage: localUrl } : s)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/projects", projectId, "colors"], ctx.prev);
      toast({ title: "Failed to upload photo", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "colors"] });
      setUploadTargetId(null);
    },
  });

  const [selectedSheen, setSelectedSheen] = useState("");
  const [manualColorName, setManualColorName] = useState("");
  const [manualColorBrand, setManualColorBrand] = useState("");
  const [showManualEntry, setShowManualEntry] = useState(false);

  const assignMutation = useMutation({
    mutationFn: async ({ paintColorId, area, notes, customColorName, customHex, imageFile, sheen }: { paintColorId?: number; area: string; notes?: string; customColorName?: string; customHex?: string; imageFile?: File; sheen?: string }) => {
      // If this area belongs to a group, update the group so the change propagates to all surfaces in the group.
      const grp = (queryClient.getQueryData(["/api/projects", projectId, "color-groups"]) as any[] | undefined)?.find(
        (g: any) => Array.isArray(g.surfaces) && g.surfaces.includes(area),
      );
      if (grp) {
        // Server-side group PATCH propagates color to every member surface,
        // so we only POST the primary area (for notes + image attachment) and skip fan-out.
        await apiRequest("PATCH", `/api/color-groups/${grp.id}`, {
          paintColorId: paintColorId || null,
          customColorName: customColorName || null,
          customHex: customHex || null,
          finish: sheen || null,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-groups"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-totals"] });
      }
      const res = await apiRequest("POST", `/api/projects/${projectId}/colors`, {
        paintColorId: paintColorId || null,
        area,
        notes,
        customColorName: customColorName || null,
        customHex: customHex || null,
        sheen: sheen || null,
      });
      const primarySelection = await res.json();

      if (imageFile && primarySelection?.id) {
        const formData = new FormData();
        formData.append("image", imageFile);
        const uploadRes = await fetch(`/api/projects/${projectId}/colors/${primarySelection.id}/image`, {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!uploadRes.ok) {
          throw new Error("Color saved but photo upload failed. You can try re-uploading later.");
        }
      }
    },
    onMutate: async ({ area, customColorName, customHex, imageFile, paintColorId }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/projects", projectId, "colors"] });
      const prev = queryClient.getQueryData(["/api/projects", projectId, "colors"]);
      const matchedColor = paintColorId ? paintColors.find((c: any) => c.id === paintColorId) : null;
      const blobUrl = imageFile ? URL.createObjectURL(imageFile) : '';
      if (blobUrl) {
        pendingBlobUrls.current[area] = blobUrl;
      } else {
        delete pendingBlobUrls.current[area];
      }
      queryClient.setQueryData(["/api/projects", projectId, "colors"], (old: any) => {
        const base: any = {
          id: Date.now(),
          area,
          customColorName: customColorName || null,
          customHex: customHex || null,
          paintColorId: paintColorId || null,
          customImage: blobUrl,
          paintColor: matchedColor || null,
        };
        if (!old) return [base];
        const idx = old.findIndex((s: any) => s.area === area);
        if (idx >= 0) {
          const updated = [...old];
          updated[idx] = { ...base, id: updated[idx].id };
          return updated;
        }
        return [...old, base];
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/projects", projectId, "colors"], ctx.prev);
      toast({ title: "Failed to assign color", variant: "destructive" });
    },
    onSuccess: () => {
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "colors"] });
      setLookupResult(null);
      setLookupError("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (selectionId: number) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/colors/${selectionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "colors"] });
      toast({ title: "Color removed" });
    },
    onError: () => toast({ title: "Failed to remove color", variant: "destructive" }),
  });

  // ===== Color Groups =====
  const { data: colorGroups = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "color-groups"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/color-groups`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const findGroupForArea = (area: string) =>
    colorGroups.find((g: any) => Array.isArray(g.surfaces) && g.surfaces.includes(area)) || null;

  const createGroupMutation = useMutation({
    mutationFn: async (payload: { area: string; name: string }) => {
      const assigned = colorSelections.find((s: any) => s.area === payload.area);
      const body: any = {
        name: payload.name,
        surfaces: [payload.area],
        paintColorId: assigned?.paintColorId || null,
        customColorName: assigned?.customColorName || null,
        customHex: assigned?.customHex || null,
        brand: assigned?.paintColor?.brand || null,
        finish: assigned?.sheen || null,
      };
      const res = await apiRequest("POST", `/api/projects/${projectId}/color-groups`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-totals"] });
      toast({ title: "Group created" });
    },
    onError: () => toast({ title: "Failed to create group", variant: "destructive" }),
  });

  const addToGroupMutation = useMutation({
    mutationFn: async ({ groupId, area }: { groupId: number; area: string }) => {
      const group = colorGroups.find((g: any) => g.id === groupId);
      if (!group) throw new Error("Group not found");
      const surfaces = Array.from(new Set([...(group.surfaces || []), area]));
      // Apply group's color to this area
      const assigned = colorSelections.find((s: any) => s.area === area);
      await apiRequest("POST", `/api/projects/${projectId}/colors`, {
        paintColorId: group.paintColorId || null,
        area,
        notes: assigned?.notes || null,
        customColorName: group.customColorName || null,
        customHex: group.customHex || null,
        sheen: group.finish || null,
      });
      const res = await apiRequest("PATCH", `/api/color-groups/${groupId}`, { surfaces });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "colors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-totals"] });
      toast({ title: "Added to group" });
    },
    onError: () => toast({ title: "Failed to add to group", variant: "destructive" }),
  });

  const removeFromGroupMutation = useMutation({
    mutationFn: async ({ groupId, area }: { groupId: number; area: string }) => {
      const group = colorGroups.find((g: any) => g.id === groupId);
      if (!group) throw new Error("Group not found");
      const surfaces = (group.surfaces || []).filter((a: string) => a !== area);
      if (surfaces.length === 0) {
        await apiRequest("DELETE", `/api/color-groups/${groupId}`);
      } else {
        await apiRequest("PATCH", `/api/color-groups/${groupId}`, { surfaces });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-totals"] });
      toast({ title: "Removed from group" });
    },
    onError: () => toast({ title: "Failed to remove from group", variant: "destructive" }),
  });

  const allAreas = useMemo(() => {
    const set = new Set<string>();
    for (const sel of colorSelections) set.add(sel.area);
    return Array.from(set);
  }, [colorSelections]);

  const [groupEditor, setGroupEditor] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    groupId?: number;
    name: string;
    surfaces: Set<string>;
    notes: string;
    customerNotes: string;
  } | null>(null);

  const saveGroupMutation = useMutation({
    mutationFn: async (payload: { mode: 'create' | 'edit'; groupId?: number; name: string; surfaces: string[]; notes?: string | null; customerNotes?: string | null }) => {
      const surfaces = payload.surfaces;
      // Pick a representative color from any included surface that already has one
      const sourceArea = surfaces.find(a => {
        const sel = colorSelections.find((s: any) => s.area === a);
        return sel && (sel.paintColorId || sel.customColorName || sel.customHex);
      });
      const sourceSel = sourceArea ? colorSelections.find((s: any) => s.area === sourceArea) : null;
      const colorFields = {
        paintColorId: sourceSel?.paintColorId || null,
        customColorName: sourceSel?.customColorName || null,
        customHex: sourceSel?.customHex || null,
        brand: sourceSel?.paintColor?.brand || null,
        finish: sourceSel?.sheen || null,
      };

      if (payload.mode === 'create') {
        const res = await apiRequest("POST", `/api/projects/${projectId}/color-groups`, {
          name: payload.name,
          surfaces,
          notes: payload.notes ?? null,
          customerNotes: payload.customerNotes ?? null,
          ...colorFields,
        });
        const created = await res.json();
        // Propagate the group's color to every member surface
        if (colorFields.paintColorId || colorFields.customColorName || colorFields.customHex) {
          await Promise.all(surfaces.filter(a => a !== sourceArea).map(area =>
            apiRequest("POST", `/api/projects/${projectId}/colors`, {
              area,
              paintColorId: colorFields.paintColorId,
              customColorName: colorFields.customColorName,
              customHex: colorFields.customHex,
              sheen: colorFields.finish,
            })
          ));
        }
        return created;
      } else {
        const existing = colorGroups.find((g: any) => g.id === payload.groupId);
        const res = await apiRequest("PATCH", `/api/color-groups/${payload.groupId}`, {
          name: payload.name,
          surfaces,
          notes: payload.notes ?? null,
          customerNotes: payload.customerNotes ?? null,
        });
        // Propagate existing group color to newly added surfaces
        const newlyAdded = surfaces.filter(a => !(existing?.surfaces || []).includes(a));
        if (existing && newlyAdded.length > 0 && (existing.paintColorId || existing.customColorName || existing.customHex)) {
          await Promise.all(newlyAdded.map(area =>
            apiRequest("POST", `/api/projects/${projectId}/colors`, {
              area,
              paintColorId: existing.paintColorId || null,
              customColorName: existing.customColorName || null,
              customHex: existing.customHex || null,
              sheen: existing.finish || null,
            })
          ));
        }
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "colors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-totals"] });
      setGroupEditor(null);
      toast({ title: "Group saved" });
    },
    onError: (err: any) => {
      const msg = err?.message?.includes('409') || err?.message?.toLowerCase?.().includes('already')
        ? "One or more surfaces are already in another group."
        : "Failed to save group";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const { data: savedSubmission, isLoading: isSubmissionLoading } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "color-submission"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/color-submission`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const [manualRoomsInitialized, setManualRoomsInitialized] = useState(false);
  useEffect(() => {
    if (manualRoomsInitialized || isSubmissionLoading) return;
    const saved = savedSubmission?.manualRooms;
    if (saved && Array.isArray(saved) && saved.length > 0) {
      setManualRooms(saved);
      setManualRoomsInitialized(true);
    } else if (!isSubmissionLoading) {
      setManualRoomsInitialized(true);
    }
  }, [savedSubmission, isSubmissionLoading, manualRoomsInitialized]);

  const manualRoomsSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevManualRoomsRef = useRef<string>('');
  useEffect(() => {
    if (!manualRoomsInitialized) return;
    const serialized = JSON.stringify(manualRooms);
    if (serialized === prevManualRoomsRef.current) return;
    if (!prevManualRoomsRef.current) { prevManualRoomsRef.current = serialized; return; }
    prevManualRoomsRef.current = serialized;

    if (manualRoomsSaveRef.current) clearTimeout(manualRoomsSaveRef.current);
    manualRoomsSaveRef.current = setTimeout(async () => {
      try {
        if (!savedSubmission) {
          const areas = manualRooms.flatMap(r => r.surfaces.map(s => `${r.name} - ${s.label}`));
          await apiRequest("POST", `/api/projects/${projectId}/color-submission/auto-sync`, { selectedAreas: areas });
          await queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-submission"] });
          const freshRes = await fetch(`/api/projects/${projectId}/color-submission`, { credentials: "include" });
          if (freshRes.ok) {
            await apiRequest("PATCH", `/api/projects/${projectId}/color-submission/manual-rooms`, { manualRooms });
          }
        } else {
          await apiRequest("PATCH", `/api/projects/${projectId}/color-submission/manual-rooms`, { manualRooms });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-submission"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "colors"] });
      } catch {}
    }, 500);
    return () => { if (manualRoomsSaveRef.current) clearTimeout(manualRoomsSaveRef.current); };
  }, [manualRooms, manualRoomsInitialized, savedSubmission, projectId]);

  useEffect(() => {
    if (!savedSubmission?.entries) return;
    const entries = (savedSubmission.entries as any[]) || [];
    setContractorSurfaceNotes(prev => {
      const merged = { ...prev };
      for (const e of entries) {
        const key = e.paintGroupKey;
        if (key && !(key in contractorNoteTimers.current)) {
          merged[key] = e.surfaceNote || '';
        }
      }
      return merged;
    });
  }, [savedSubmission?.entries]);

  const handleContractorSurfaceNote = useCallback((paintGroupKey: string, value: string) => {
    setContractorSurfaceNotes(prev => ({ ...prev, [paintGroupKey]: value }));
    if (contractorNoteTimers.current[paintGroupKey]) clearTimeout(contractorNoteTimers.current[paintGroupKey]);
    contractorNoteTimers.current[paintGroupKey] = setTimeout(async () => {
      delete contractorNoteTimers.current[paintGroupKey];
      try {
        await apiRequest("PATCH", `/api/projects/${projectId}/color-submission/surface-note`, { paintGroupKey, surfaceNote: value });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-submission"] });
      } catch {}
    }, 800);
  }, [projectId]);

  // Section-level contractor → customer note (for standalone room/section cards).
  // Mirrors the group's customerNotes behavior: inline-editable with debounced autosave.
  const [sectionNoteDrafts, setSectionNoteDrafts] = useState<Record<string, string>>({});
  const sectionNoteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const handleSectionNote = useCallback((sectionId: string, value: string) => {
    setSectionNoteDrafts(prev => ({ ...prev, [sectionId]: value }));
    if (sectionNoteTimers.current[sectionId]) clearTimeout(sectionNoteTimers.current[sectionId]);
    sectionNoteTimers.current[sectionId] = setTimeout(async () => {
      delete sectionNoteTimers.current[sectionId];
      try {
        await apiRequest("PATCH", `/api/projects/${projectId}/color-submission/section-note`, { sectionId, note: value });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-submission"] });
      } catch {}
    }, 600);
  }, [projectId]);

  const [sendSelectionInitialized, setSendSelectionInitialized] = useState(false);
  useEffect(() => {
    if (sendSelectionInitialized || isSubmissionLoading) return;
    const saved = savedSubmission?.selectedAreas;
    if (saved && Array.isArray(saved)) {
      setSendSelection(new Set(saved));
      setSendSelectionInitialized(true);
      return;
    }
    // No saved submission yet — every surface (including production-rate areas)
    // starts as "Internal only". User must explicitly toggle Share to send to customer.
    setSendSelection(new Set());
    setSendSelectionInitialized(true);
  }, [sendSelectionInitialized, savedSubmission, isSubmissionLoading]);

  const isProductionRate = surfaceData?.isProductionRate || false;
  const prodSurfaces: any[] = surfaceData?.surfaces || [];

  const roomMap = new Map<string, { roomName: string; surfaces: any[] }>();
  for (const s of prodSurfaces) {
    if (!roomMap.has(s.roomId)) roomMap.set(s.roomId, { roomName: s.roomName, surfaces: [] });
    roomMap.get(s.roomId)!.surfaces.push(s);
  }

  const savedRooms = new Map<string, Set<string>>();
  if (!isProductionRate && manualRooms.length === 0) {
    for (const sel of colorSelections) {
      const parts = sel.area?.split(' - ');
      if (parts?.length === 2) {
        const [rName, sLabel] = parts;
        if (!savedRooms.has(rName)) savedRooms.set(rName, new Set());
        savedRooms.get(rName)!.add(sLabel);
      }
    }
  }
  const reconstructedRooms = Array.from(savedRooms.entries()).map(([rName, surfaces], idx) => ({
    id: `saved-${idx}`,
    name: rName,
    surfaces: Array.from(surfaces).map(label => ({ key: label.toLowerCase().replace(/\s/g, ''), label })),
    fromProduction: false,
  }));

  const [hiddenProdSurfaces, setHiddenProdSurfaces] = useState<Set<string>>(new Set());
  const [hiddenProdInitialized, setHiddenProdInitialized] = useState(false);
  useEffect(() => {
    if (hiddenProdInitialized || isSubmissionLoading) return;
    const saved = savedSubmission?.hiddenProdSurfaces;
    if (saved && Array.isArray(saved) && saved.length > 0) {
      const hiddenSet = new Set(saved);
      setHiddenProdSurfaces(hiddenSet);
      const hiddenAreas = new Set<string>();
      for (const hk of saved) {
        for (const [rId, room] of roomMap.entries()) {
          const prefix = `${rId}-`;
          if (!hk.startsWith(prefix)) continue;
          const sKey = hk.substring(prefix.length);
          const surf = room.surfaces.find((s: any) => (s.surfaceKey || s.key) === sKey);
          if (surf) hiddenAreas.add(`${room.roomName} - ${surf.surfaceLabel || surf.label}`);
          break;
        }
      }
      if (hiddenAreas.size > 0) {
        setSendSelection(prev => {
          const next = new Set(prev);
          hiddenAreas.forEach(a => next.delete(a));
          return next;
        });
      }
    }
    if (!isSubmissionLoading) setHiddenProdInitialized(true);
  }, [savedSubmission, isSubmissionLoading, hiddenProdInitialized, roomMap]);

  const saveHiddenProdSurfaces = (nextHidden: Set<string>) => {
    const arr = Array.from(nextHidden);
    console.log("[HiddenProd] Saving hidden surfaces:", arr);
    apiRequest("PATCH", `/api/projects/${projectId}/color-submission/hidden-prod-surfaces`, {
      hiddenProdSurfaces: arr,
    }).then(() => {
      console.log("[HiddenProd] Save success");
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-submission"] });
    }).catch((err) => {
      console.error("[HiddenProd] Save FAILED:", err);
    });
  };

  const saveSelectedAreasRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedAreasInitRef = useRef(true);
  useEffect(() => {
    if (!sendSelectionInitialized) return;
    if (selectedAreasInitRef.current) {
      selectedAreasInitRef.current = false;
      return;
    }
    if (saveSelectedAreasRef.current) clearTimeout(saveSelectedAreasRef.current);
    saveSelectedAreasRef.current = setTimeout(() => {
      apiRequest("PATCH", `/api/projects/${projectId}/color-submission/selected-areas`, {
        selectedAreas: Array.from(sendSelection),
      }).catch(() => {});
    }, 500);
  }, [sendSelection, sendSelectionInitialized, projectId]);

  const [prodRoomExtras, setProdRoomExtras] = useState<Map<string, Array<{ key: string; label: string }>>>(new Map());

  const allRooms = [
    ...Array.from(roomMap.entries()).map(([roomId, data]) => {
      const visibleProdSurfaces = data.surfaces
        .filter((s: any) => !hiddenProdSurfaces.has(`${roomId}-${s.surfaceKey}`))
        .map((s: any) => ({
          key: s.surfaceKey,
          label: s.surfaceLabel,
          category: s.category,
          productName: s.productName,
          defaultColor: s.defaultColor,
        }));
      const extras = (prodRoomExtras.get(roomId) || []).map(s => ({
        ...s, category: 'other' as const, productName: undefined, defaultColor: undefined,
      }));
      return {
        id: roomId,
        name: data.roomName,
        surfaces: [...visibleProdSurfaces, ...extras],
        fromProduction: true,
      };
    }),
    ...manualRooms.map(r => ({ ...r, fromProduction: false, surfaces: r.surfaces.map(s => ({ ...s, category: 'other' as const, productName: undefined, defaultColor: undefined })) })),
    ...(manualRooms.length === 0 ? reconstructedRooms.map(r => ({ ...r, surfaces: r.surfaces.map(s => ({ ...s, category: 'other' as const, productName: undefined, defaultColor: undefined })) })) : []),
  ];

  const getColorForSurface = (roomName: string, surfaceLabel: string) => {
    const area = `${roomName} - ${surfaceLabel}`;
    const assigned = colorSelections.find((s: any) => s.area === area);
    if (!assigned) return assigned;
    const hasColor = assigned.paintColorId || assigned.customColorName || assigned.customHex;
    if (!hasColor) return assigned;
    const subEntries = (savedSubmission?.entries as any[]) || [];
    const subEntry = subEntries.find((e: any) => e.paintGroupKey === area);
    const isCustomerPick = subEntry?.customerSubmitted === true;
    return {
      ...assigned,
      _fromCustomer: isCustomerPick,
      _entryBrand: subEntry?.brand || '',
      _entryImage: subEntry?.customImage || '',
    };
  };

  const filteredColors = searchQuery.trim().length > 0
    ? paintColors.filter((c: any) => {
        const q = searchQuery.toLowerCase();
        return c.name?.toLowerCase().includes(q) || c.code?.toLowerCase().includes(q) || c.brand?.toLowerCase().includes(q);
      }).slice(0, 20)
    : [];

  const MANUAL_SURFACE_OPTIONS = [
    { key: 'walls', label: 'Walls' },
    { key: 'ceiling', label: 'Ceiling' },
    { key: 'trim', label: 'Trim' },
    { key: 'doors', label: 'Doors' },
    { key: 'cabinets', label: 'Cabinets' },
    { key: 'accent', label: 'Accent Wall' },
  ];

  const [modalSelectedSurfaces, setModalSelectedSurfaces] = useState<Array<{ key: string; label: string }>>([]);
  const [customSurfaceInput, setCustomSurfaceInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [collapsedRooms, setCollapsedRooms] = useState<Set<string>>(new Set());
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);

  const toggleModalSurface = (surface: { key: string; label: string }) => {
    setModalSelectedSurfaces(prev => {
      const exists = prev.some(s => s.key === surface.key);
      if (exists) return prev.filter(s => s.key !== surface.key);
      return [...prev, surface];
    });
  };

  const addCustomSurface = () => {
    const label = customSurfaceInput.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/\s+/g, '-');
    if (modalSelectedSurfaces.some(s => s.key === key)) return;
    setModalSelectedSurfaces(prev => [...prev, { key, label }]);
    setCustomSurfaceInput("");
    setShowCustomInput(false);
  };

  const handleAddManualRoom = () => {
    if (!newRoomName.trim() || modalSelectedSurfaces.length === 0) return;
    const editingProdRoom = editingRoomId && roomMap.has(editingRoomId);
    if (editingProdRoom && editingRoomId) {
      const prodRoom = roomMap.get(editingRoomId)!;
      const prodSurfaceKeys = new Set(prodRoom.surfaces.map((s: any) => s.surfaceKey || s.key));
      const extraSurfaces = modalSelectedSurfaces.filter(s => !prodSurfaceKeys.has(s.key));
      const nextExtras = new Map(prodRoomExtras);
      if (extraSurfaces.length > 0) {
        nextExtras.set(editingRoomId, extraSurfaces);
      } else {
        nextExtras.delete(editingRoomId);
      }
      setProdRoomExtras(nextExtras);
      const selectedKeys = new Set(modalSelectedSurfaces.map(s => s.key));
      const nextHidden = new Set(hiddenProdSurfaces);
      const areasToRemove: string[] = [];
      for (const ps of prodRoom.surfaces) {
        const sk = ps.surfaceKey || ps.key;
        const sl = ps.surfaceLabel || ps.label;
        const hk = `${editingRoomId}-${sk}`;
        if (!selectedKeys.has(sk)) {
          nextHidden.add(hk);
          const assigned = getColorForSurface(prodRoom.roomName, sl);
          if (assigned?.id) deleteMutation.mutate(assigned.id);
          areasToRemove.push(`${prodRoom.roomName} - ${sl}`);
        } else {
          nextHidden.delete(hk);
        }
      }
      setHiddenProdSurfaces(nextHidden);
      saveHiddenProdSurfaces(nextHidden);
      if (areasToRemove.length > 0) {
        setSendSelection(prev => {
          const next = new Set(prev);
          areasToRemove.forEach(a => next.delete(a));
          return next;
        });
      }
    } else if (editingRoomId) {
      setManualRooms(prev => prev.map(r => r.id === editingRoomId ? {
        ...r,
        name: newRoomName.trim(),
        surfaces: modalSelectedSurfaces.map(s => ({ key: s.key, label: s.label })),
      } : r));
    } else {
      setManualRooms(prev => [...prev, {
        id: `manual-${Date.now()}`,
        name: newRoomName.trim(),
        surfaces: modalSelectedSurfaces.map(s => ({ key: s.key, label: s.label })),
      }]);
    }
    setNewRoomName("");
    setModalSelectedSurfaces([]);
    setAddingRoom(false);
    setEditingRoomId(null);
    setShowCustomInput(false);
    setCustomSurfaceInput("");
  };

  const handleDeleteSurface = (room: any, surface: any) => {
    const assigned = getColorForSurface(room.name, surface.label);
    const hasColor = !!(assigned && (assigned.paintColorId || assigned.customColorName || assigned.customHex));
    const msg = hasColor
      ? `Remove "${surface.label}" from "${room.name}"?\n\nThe color assigned to it will also be cleared. This can't be undone.`
      : `Remove "${surface.label}" from "${room.name}"?`;
    if (!window.confirm(msg)) return;
    if (assigned?.id) {
      deleteMutation.mutate(assigned.id);
    }
    const deletedArea = `${room.name} - ${surface.label}`;
    setSendSelection(prev => {
      const next = new Set(prev);
      next.delete(deletedArea);
      return next;
    });
    if (room.fromProduction) {
      const hk = `${room.id}-${surface.key}`;
      const nextHidden = new Set(hiddenProdSurfaces);
      nextHidden.add(hk);
      setHiddenProdSurfaces(nextHidden);
      saveHiddenProdSurfaces(nextHidden);
      const nextExtras = new Map(prodRoomExtras);
      const extras = nextExtras.get(room.id) || [];
      nextExtras.set(room.id, extras.filter(s => s.key !== surface.key));
      if ((nextExtras.get(room.id) || []).length === 0) nextExtras.delete(room.id);
      setProdRoomExtras(nextExtras);
    } else {
      setManualRooms(prev => prev.map(r => r.id === room.id ? {
        ...r,
        surfaces: r.surfaces.filter(s => s.key !== surface.key),
      } : r).filter(r => r.surfaces.length > 0));
    }
    toast({ title: `Removed "${surface.label}" from "${room.name}"` });
  };

  const openEditRoomModal = (room: any) => {
    setEditingRoomId(room.id);
    setNewRoomName(room.name);
    setModalSelectedSurfaces(room.surfaces.map((s: any) => ({ key: s.key, label: s.label })));
    setShowCustomInput(false);
    setCustomSurfaceInput("");
    setAddingRoom(true);
  };

  const toggleRoomCollapse = (roomId: string) => {
    setCollapsedRooms(prev => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const isLoading = surfacesLoading || colorsLoading;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Card key={i} className="p-4">
            <div className="h-5 w-32 bg-muted animate-pulse rounded mb-3" />
            <div className="space-y-2">
              <div className="h-10 bg-muted animate-pulse rounded" />
              <div className="h-10 bg-muted animate-pulse rounded" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  const topColors = colorSelections
    .filter((s: any) => s.paintColor?.hexColor || s.customHex)
    .slice(0, 6)
    .map((s: any) => s.paintColor?.hexColor || s.customHex);

  return (
    <div className="space-y-4" data-testid="colors-tab">
      <div className="rounded-2xl overflow-hidden shadow-md">
        <div className="relative px-4 py-6 text-center overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%)' }}>
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 30%, white 1px, transparent 1px), radial-gradient(circle at 50% 80%, white 1px, transparent 1px)', backgroundSize: '40px 40px, 60px 60px, 50px 50px' }} />
          <div className="relative flex flex-col items-center">
            <div className="flex justify-center gap-2 mb-3">
              {topColors.length > 0 ? topColors.map((c: string, i: number) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full shadow-lg ring-2 ring-white/20"
                  style={{ backgroundColor: c }}
                />
              )) : (
                <>
                  <div className="w-8 h-8 rounded-full shadow-lg ring-2 ring-white/20 bg-[#D4C7E2]" />
                  <div className="w-8 h-8 rounded-full shadow-lg ring-2 ring-white/20 bg-[#798064]" />
                  <div className="w-8 h-8 rounded-full shadow-lg ring-2 ring-white/20 bg-[#E8DFD0]" />
                  <div className="w-8 h-8 rounded-full shadow-lg ring-2 ring-white/20 bg-[#6B8E9B]" />
                </>
              )}
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              {isProductionRate ? 'Room Colors' : 'Color Selection'}
            </h3>
            <p className="text-xs text-white/60 mt-1">
              {allRooms.length > 0
                ? `${allRooms.length} room${allRooms.length > 1 ? 's' : ''} · ${colorSelections.filter((s: any) => s.paintColorId || s.customColorName || s.customHex).length} color${colorSelections.filter((s: any) => s.paintColorId || s.customColorName || s.customHex).length !== 1 ? 's' : ''} assigned`
                : 'Assign colors to rooms and surfaces'}
            </p>
            {colorSubmission && (
              <div className="mt-3 w-full max-w-[260px]">
                <ColorDeadlineBanner projectId={projectId} submission={colorSubmission} />
              </div>
            )}
            <p className="text-[10px] text-white/40 mt-2">
              {sendSelection.size} surface{sendSelection.size !== 1 ? 's' : ''} selected
            </p>
          </div>
        </div>
      </div>

      <Dialog open={addingRoom} onOpenChange={(open) => {
        if (!open && (newRoomName.trim() || modalSelectedSurfaces.length > 0)) {
          if (!window.confirm("You have unsaved changes. Discard?")) return;
        }
        if (!open) {
          setAddingRoom(false);
          setNewRoomName("");
          setModalSelectedSurfaces([]);
          setShowCustomInput(false);
          setCustomSurfaceInput("");
          setEditingRoomId(null);
        }
      }}>
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editingRoomId ? 'Edit Section' : 'Add Section'}</DialogTitle>
            <DialogDescription>{editingRoomId ? 'Update the name or add/remove surfaces.' : 'Name the section and select which surfaces need colors.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Section Name</Label>
              <Input
                placeholder="e.g. Master Bedroom"
                value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newRoomName.trim() && modalSelectedSurfaces.length > 0) handleAddManualRoom(); }}
                disabled={!!(editingRoomId && roomMap.has(editingRoomId))}
                data-testid="input-new-room-name"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Surfaces</Label>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const editingProd = editingRoomId && roomMap.has(editingRoomId);
                  const prodSurfaces = editingProd && editingRoomId
                    ? roomMap.get(editingRoomId)!.surfaces.map((s: any) => ({ key: s.surfaceKey, label: s.surfaceLabel }))
                    : [];
                  const prodKeys = new Set(prodSurfaces.map(s => s.key));
                  const standardOptions = editingProd
                    ? [...prodSurfaces, ...MANUAL_SURFACE_OPTIONS.filter(m => !prodKeys.has(m.key))]
                    : MANUAL_SURFACE_OPTIONS;
                  const standardKeys = new Set(standardOptions.map(s => s.key));
                  return (
                    <>
                      {editingProd && prodSurfaces.length > 0 && (
                        <p className="w-full text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">From Estimate</p>
                      )}
                      {standardOptions.map(surface => {
                        const isSelected = modalSelectedSurfaces.some(s => s.key === surface.key);
                        const isProd = prodKeys.has(surface.key);
                        return (
                          <button
                            key={surface.key}
                            type="button"
                            onClick={() => toggleModalSurface(surface)}
                            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border ${
                              isSelected
                                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                : 'bg-muted/40 text-foreground border-border hover:bg-muted hover:border-primary/30'
                            }`}
                            data-testid={`pill-surface-${surface.key}`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                            {surface.label}
                          </button>
                        );
                      })}
                      {modalSelectedSurfaces.filter(s => !standardKeys.has(s.key)).map(surface => (
                        <button
                          key={surface.key}
                          type="button"
                          onClick={() => toggleModalSurface(surface)}
                          className="px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700 shadow-sm"
                          data-testid={`pill-surface-custom-${surface.key}`}
                        >
                          <Check className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                          {surface.label}
                          <X className="w-3 h-3 inline ml-1 -mt-0.5" />
                        </button>
                      ))}
                    </>
                  );
                })()}
                {!showCustomInput ? (
                  <button
                    type="button"
                    onClick={() => setShowCustomInput(true)}
                    className="px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border-2 border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:border-primary/60"
                    data-testid="button-add-custom-surface"
                  >
                    <Plus className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                    Add Other
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 w-full mt-1">
                    <Input
                      placeholder="e.g. Stripes, Wainscoting..."
                      value={customSurfaceInput}
                      onChange={e => setCustomSurfaceInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addCustomSurface(); if (e.key === 'Escape') { e.stopPropagation(); setShowCustomInput(false); setCustomSurfaceInput(""); } }}
                      className="flex-1 h-8 text-sm"
                      autoFocus
                      data-testid="input-custom-surface"
                    />
                    <Button size="sm" className="h-8 px-2.5" onClick={addCustomSurface} disabled={!customSurfaceInput.trim()} data-testid="button-save-custom-surface">
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setShowCustomInput(false); setCustomSurfaceInput(""); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 sm:justify-between">
            {editingRoomId && (() => {
              const editingRoom = allRooms.find(r => r.id === editingRoomId);
              if (!editingRoom || editingRoom.fromProduction) return <div />;
              return (
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 sm:mr-auto"
                  onClick={() => {
                    const surfaceCount = editingRoom.surfaces.length;
                    const colorCount = editingRoom.surfaces.filter((s: any) => {
                      const c = getColorForSurface(editingRoom.name, s.label);
                      return !!(c && (c.paintColorId || c.customColorName || c.customHex));
                    }).length;
                    const lines = [`Delete section "${editingRoom.name}"?`];
                    if (surfaceCount > 0) lines.push(`This will remove ${surfaceCount} surface${surfaceCount !== 1 ? 's' : ''}${colorCount > 0 ? ` and clear ${colorCount} assigned color${colorCount !== 1 ? 's' : ''}` : ''}.`);
                    lines.push("This can't be undone.");
                    if (!window.confirm(lines.join('\n\n'))) return;
                    // Delete each color selection for surfaces in this section
                    for (const s of editingRoom.surfaces) {
                      const assigned = getColorForSurface(editingRoom.name, s.label);
                      if (assigned?.id) deleteMutation.mutate(assigned.id);
                    }
                    // Drop sendSelection entries for this section
                    setSendSelection(prev => {
                      const next = new Set(prev);
                      for (const s of editingRoom.surfaces) next.delete(`${editingRoom.name} - ${s.label}`);
                      return next;
                    });
                    // Remove the section itself
                    setManualRooms(prev => prev.filter(r => r.id !== editingRoomId));
                    toast({ title: `Deleted section "${editingRoom.name}"` });
                    setAddingRoom(false); setNewRoomName(""); setModalSelectedSurfaces([]); setShowCustomInput(false); setCustomSurfaceInput(""); setEditingRoomId(null);
                  }}
                  data-testid="button-delete-section"
                >
                  <X className="w-4 h-4 mr-1" />
                  Delete Section
                </Button>
              );
            })()}
            <div className="flex gap-2 sm:ml-auto">
              <Button variant="outline" onClick={() => {
                if (!editingRoomId && (newRoomName.trim() || modalSelectedSurfaces.length > 0)) {
                  if (!window.confirm("You have unsaved changes. Discard?")) return;
                }
                setAddingRoom(false); setNewRoomName(""); setModalSelectedSurfaces([]); setShowCustomInput(false); setCustomSurfaceInput(""); setEditingRoomId(null);
              }} data-testid="button-cancel-room">
                Cancel
              </Button>
              <Button onClick={handleAddManualRoom} disabled={!newRoomName.trim() || modalSelectedSurfaces.length === 0} data-testid="button-save-room">
                {editingRoomId ? <Check className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                {editingRoomId ? 'Save Changes' : `Add Section (${modalSelectedSurfaces.length} surface${modalSelectedSurfaces.length !== 1 ? 's' : ''})`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unified Add menu */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground">
          {allRooms.length === 0
            ? 'No rooms yet — sections from your production rates will show here automatically.'
            : <>Surfaces from your production rates appear below. Toggle <span className="font-semibold text-foreground">Share</span> to send a surface to the customer for color review.</>}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" className="h-8 text-xs" data-testid="button-colors-add-menu">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="end">
            <button
              type="button"
              className="w-full flex items-start gap-2 px-2 py-2 rounded-md hover:bg-muted text-sm text-left"
              onClick={() => { setEditingRoomId(null); setNewRoomName(""); setModalSelectedSurfaces([]); setAddingRoom(true); }}
              data-testid="button-add-section-menu"
            >
              <Plus className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium leading-tight">Add Section</div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">Custom area + surfaces (editable later)</div>
              </div>
            </button>
            <button
              type="button"
              className="w-full flex items-start gap-2 px-2 py-2 rounded-md hover:bg-muted text-sm text-left"
              onClick={() => setGroupEditor({ open: true, mode: 'create', name: '', surfaces: new Set(), notes: '', customerNotes: '' })}
              data-testid="button-add-color-group-menu"
            >
              <Layers className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium leading-tight">Add Color Group</div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">Share one color across surfaces</div>
              </div>
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Bulk share by surface — top-level chips. Clicking a surface toggles share
          for every room that has that surface, so contractors don't have to enable
          "Walls" / "Ceiling" / "Trim" room-by-room. Per-room overrides still work
          via the existing share checkboxes below. */}
      {allRooms.length > 0 && (() => {
        const labelToAreas = new Map<string, string[]>();
        for (const room of allRooms) {
          for (const s of room.surfaces) {
            const area = `${room.name} - ${s.label}`;
            const list = labelToAreas.get(s.label) || [];
            list.push(area);
            labelToAreas.set(s.label, list);
          }
        }
        if (labelToAreas.size === 0) return null;
        const entries = Array.from(labelToAreas.entries());
        return (
          <div
            className="rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50/30 dark:bg-violet-950/15 px-3 py-2.5"
            data-testid="bulk-surface-picker"
          >
            <div className="flex items-center gap-2 mb-2">
              <Paintbrush className="w-3.5 h-3.5 text-violet-700 dark:text-violet-300 shrink-0" />
              <div className="text-[11px] font-semibold text-violet-900 dark:text-violet-200">
                Bulk share by surface
              </div>
              <div className="text-[10px] text-muted-foreground hidden sm:block truncate">
                Click a surface to share it across every room. Uncheck individual rooms below to override.
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {entries.map(([label, areas]) => {
                const sharedCount = areas.filter(a => sendSelection.has(a)).length;
                const allShared = sharedCount === areas.length;
                const someShared = sharedCount > 0 && !allShared;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setSendSelection(prev => {
                        const next = new Set(prev);
                        if (allShared) {
                          for (const a of areas) next.delete(a);
                        } else {
                          for (const a of areas) next.add(a);
                        }
                        return next;
                      });
                    }}
                    className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors border ${
                      allShared
                        ? 'bg-violet-600 text-white border-violet-600 hover:bg-violet-700'
                        : someShared
                        ? 'bg-violet-100 text-violet-900 border-violet-300 hover:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-100 dark:border-violet-800'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-background dark:text-gray-300 dark:border-gray-700'
                    }`}
                    data-testid={`bulk-surface-${label.toLowerCase().replace(/\s+/g, '-')}`}
                    title={allShared ? `Unshare ${label} from all ${areas.length} room${areas.length !== 1 ? 's' : ''}` : `Share ${label} across all ${areas.length} room${areas.length !== 1 ? 's' : ''}`}
                  >
                    {allShared
                      ? <Check className="w-3 h-3" />
                      : someShared
                      ? <span className="w-2 h-2 rounded-full bg-violet-500" />
                      : <span className="w-2 h-2 rounded-full border border-gray-400" />}
                    <span>{label}</span>
                    <span className="text-[9px] opacity-70">{sharedCount}/{areas.length}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Group cards */}
      {colorGroups.map((group: any) => {
        const surfaces: string[] = Array.isArray(group.surfaces) ? group.surfaces : [];
        // Parse "Room - Surface" entries; preserve order, dedupe rooms and surface labels
        const roomNames: string[] = [];
        const surfaceLabels: string[] = [];
        // Group surfaces by room: { Bedroom: [Walls, Ceiling], Kids Bedroom: [Walls], ... }
        const roomToSurfaces = new Map<string, string[]>();
        for (const a of surfaces) {
          const idx = a.lastIndexOf(' - ');
          const r = idx >= 0 ? a.slice(0, idx) : a;
          const s = idx >= 0 ? a.slice(idx + 3) : '';
          if (r && !roomNames.includes(r)) roomNames.push(r);
          if (s && !surfaceLabels.includes(s)) surfaceLabels.push(s);
          if (r) {
            const list = roomToSurfaces.get(r) || [];
            if (s && !list.includes(s)) list.push(s);
            roomToSurfaces.set(r, list);
          }
        }

        // Resolve color (group fields take precedence; fall back to any selection on a member surface)
        const memberSels = colorSelections.filter((s: any) => surfaces.includes(s.area));
        const colorRef = memberSels.find((s: any) => s.paintColorId || s.customColorName || s.customHex);
        const groupPaintColor = group.paintColorId
          ? paintColors.find((c: any) => c.id === group.paintColorId)
          : null;
        // Resolve color from a SINGLE consistent source so name/code/hex never get mixed across sources.
        let hex: string | undefined;
        let colorName: string | null = null;
        let colorCode: string | undefined;
        let brand = '';
        if (groupPaintColor) {
          hex = groupPaintColor.hexColor;
          colorName = groupPaintColor.name;
          colorCode = groupPaintColor.code;
          brand = groupPaintColor.brand || '';
        } else if (group.customColorName || group.customHex) {
          hex = group.customHex;
          colorName = group.customColorName || null;
          colorCode = undefined;
          brand = group.brand || '';
        } else if (colorRef?.paintColor) {
          hex = colorRef.paintColor.hexColor;
          colorName = colorRef.paintColor.name;
          colorCode = colorRef.paintColor.code;
          brand = colorRef.paintColor.brand || '';
        } else if (colorRef) {
          hex = colorRef.customHex;
          colorName = colorRef.customColorName || null;
          colorCode = undefined;
          brand = '';
        }
        const finish = group.finish || colorRef?.sheen || '';
        const hasColor = !!(hex || colorName);

        // sendSelection toggle for whole group
        const groupSelectedCount = surfaces.filter(a => sendSelection.has(a)).length;
        const allGroupSelected = groupSelectedCount === surfaces.length && surfaces.length > 0;
        const someGroupSelected = groupSelectedCount > 0 && !allGroupSelected;

        const openColorPickerForGroup = () => {
          if (surfaces.length === 0) return;
          // Use the first surface as the picker context; assignMutation fans out to all group surfaces.
          const firstArea = surfaces[0];
          const idx = firstArea.lastIndexOf(' - ');
          const roomName = idx >= 0 ? firstArea.slice(0, idx) : firstArea;
          const surfaceLabel = idx >= 0 ? firstArea.slice(idx + 3) : '';
          const matchingRoom = allRooms.find(r => r.name === roomName);
          const matchingSurface = matchingRoom?.surfaces.find((s: any) => s.label === surfaceLabel);
          setActiveSurface({
            roomId: matchingRoom?.id || `group-${group.id}`,
            roomName,
            surfaceKey: matchingSurface?.key || 'group',
            surfaceLabel,
          });
          setSearchQuery("");
          setSelectedSheen(finish || '');
          if (group.paintColorId && groupPaintColor) {
            setShowManualEntry(false);
            setSearchSelectedColor({
              id: group.paintColorId,
              name: groupPaintColor.name,
              code: groupPaintColor.code,
              brand: groupPaintColor.brand,
              hexColor: groupPaintColor.hexColor,
            });
          } else if (group.customColorName) {
            setShowManualEntry(true);
            setManualColorName(group.customColorName || '');
            setManualColorBrand(group.brand || '');
            setSearchSelectedColor(null);
          } else {
            setSearchSelectedColor(null);
            setShowManualEntry(false);
            setManualColorName('');
            setManualColorBrand('');
          }
          setColorMatchFile(null);
          setColorMatchPreview('');
          setLookupResult(null);
          setLookupError('');
        };

        return (
          <div
            key={group.id}
            className="rounded-lg border-2 overflow-hidden cursor-pointer transition-all hover:shadow-md border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20"
            onClick={() => setGroupEditor({
              open: true,
              mode: 'edit',
              groupId: group.id,
              name: group.name,
              surfaces: new Set(surfaces),
              notes: group.notes || '',
              customerNotes: group.customerNotes || '',
            })}
            data-testid={`group-card-${group.id}`}
          >
            <div className="px-3 py-2.5 space-y-2">
              {/* Row 1: checkbox + name (left), Change + delete (right) */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={allGroupSelected}
                    ref={el => { if (el) el.indeterminate = someGroupSelected; }}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      const next = new Set(sendSelection);
                      if (allGroupSelected) {
                        for (const a of surfaces) next.delete(a);
                      } else {
                        for (const a of surfaces) next.add(a);
                      }
                      setSendSelection(next);
                    }}
                    className="h-4 w-4 rounded border-gray-300 accent-primary shrink-0"
                    data-testid={`checkbox-group-${group.id}`}
                  />
                  <span className="text-sm font-semibold truncate" data-testid={`text-group-name-${group.id}`}>{group.name}</span>
                </div>
                <span
                  role="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!window.confirm(`Delete group "${group.name}"? Surfaces keep their assigned colors.`)) return;
                    try {
                      await apiRequest('DELETE', `/api/color-groups/${group.id}`);
                      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-groups"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-totals"] });
                      toast({ title: "Group deleted" });
                    } catch {
                      toast({ title: "Failed to delete group", variant: "destructive" });
                    }
                  }}
                  className="text-muted-foreground/60 hover:text-destructive p-1 shrink-0"
                  data-testid={`button-delete-group-${group.id}`}
                >
                  <X className="w-4 h-4" />
                </span>
              </div>

              {/* Row 2: group by surface — "Walls for: Bedroom, Kitchen, Dining Room ·
                  Base Molding for: Living Room". One line per surface, rooms listed after. */}
              {(() => {
                if (roomNames.length === 0) {
                  return <div className="ml-7 text-xs text-muted-foreground italic">No surfaces yet</div>;
                }
                const surfaceToRooms = new Map<string, string[]>();
                const surfaceOrder: string[] = [];
                for (const r of roomNames) {
                  for (const s of (roomToSurfaces.get(r) || [])) {
                    if (!surfaceToRooms.has(s)) {
                      surfaceToRooms.set(s, []);
                      surfaceOrder.push(s);
                    }
                    const list = surfaceToRooms.get(s)!;
                    if (!list.includes(r)) list.push(r);
                  }
                }
                return (
                  <div className="ml-7 flex flex-wrap gap-x-2 gap-y-0.5 text-xs min-w-0">
                    {surfaceOrder.map((s, i) => (
                      <span key={s} className="whitespace-normal">
                        {i > 0 && <span className="text-muted-foreground/50 mr-2">·</span>}
                        <span className="font-semibold text-foreground">{s} for:</span>
                        <span className="text-muted-foreground"> {(surfaceToRooms.get(s) || []).join(', ')}</span>
                      </span>
                    ))}
                  </div>
                );
              })()}

              {/* Row 3: bigger color preview (left) + color name + sheen + Change button (right) */}
              <div className="flex items-center gap-3 ml-7">
                {hex ? (
                  <div
                    className="w-12 h-12 rounded-md shadow-sm border border-black/10 shrink-0"
                    style={{ backgroundColor: hex }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-md shrink-0 bg-muted border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                    <Paintbrush className="w-4 h-4 text-muted-foreground/50" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {hasColor ? (
                    <>
                      <div className="text-sm font-medium truncate" data-testid={`text-group-color-${group.id}`}>
                        {colorName || 'Custom color'}
                      </div>
                      {(colorCode || brand) && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {[colorCode, brand].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {finish && (
                        <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                          <Droplets className="w-3 h-3 shrink-0" />
                          <span className="capitalize">{finish}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No color picked yet</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 shrink-0"
                  onClick={(e) => { e.stopPropagation(); openColorPickerForGroup(); }}
                  data-testid={`button-change-group-color-${group.id}`}
                >
                  <Paintbrush className="w-3.5 h-3.5 mr-1" />
                  {hasColor ? 'Change' : 'Pick color'}
                </Button>
              </div>

              {/* Row 4: notes preview */}
              {group.notes && (
                <div className="text-[11px] text-muted-foreground/90 flex items-start gap-1.5" title={group.notes}>
                  <StickyNote className="w-3 h-3 shrink-0 mt-0.5" />
                  <span className="truncate italic">{group.notes}</span>
                </div>
              )}

              {/* Row 4b: customer-facing note (contractor → customer) — inline editable with autosave */}
              {(() => {
                const draftValue = groupCustomerNoteDrafts[group.id] !== undefined
                  ? groupCustomerNoteDrafts[group.id]
                  : (group.customerNotes || '');
                return (
                  <div className="rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/10 px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <MessageSquare className="w-3 h-3 shrink-0 text-blue-600 dark:text-blue-400" />
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">Note to customer</div>
                    </div>
                    <Textarea
                      placeholder="Add a note for the customer..."
                      value={draftValue}
                      maxLength={150}
                      rows={1}
                      className="text-[11px] min-h-[2rem] bg-white/70 dark:bg-background border-blue-200 dark:border-blue-900 focus-visible:ring-blue-300"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const val = e.target.value.slice(0, 150);
                        setGroupCustomerNoteDrafts(prev => ({ ...prev, [group.id]: val }));
                        if (groupCustomerNoteTimers.current[group.id]) clearTimeout(groupCustomerNoteTimers.current[group.id]);
                        groupCustomerNoteTimers.current[group.id] = setTimeout(() => {
                          apiRequest("PATCH", `/api/color-groups/${group.id}`, {
                            name: group.name,
                            surfaces: group.surfaces || [],
                            notes: group.notes ?? null,
                            customerNotes: val.trim() ? val.trim() : null,
                          })
                            .then(() => {
                              queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-groups"] });
                              queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/color-submission`] });
                            })
                            .catch(() => {
                              toast({ title: "Failed to save note", variant: "destructive" });
                            });
                        }, 600);
                      }}
                      data-testid={`textarea-group-customer-note-${group.id}`}
                    />
                    <p className={`text-[10px] text-right mt-0.5 ${draftValue.length >= 140 ? 'text-amber-500' : 'text-blue-700/60 dark:text-blue-400/60'}`}>
                      {draftValue.length}/150
                    </p>
                  </div>
                );
              })()}

              {(() => {
                // Customer's note(s) for this group — scan ALL entries (by colorGroupId or by surface membership)
                const subEntries: any[] = (savedSubmission?.entries as any[]) || [];
                const surfaceSet = new Set(group.surfaces || []);
                const noteMap = new Map<string, string>();
                for (const e of subEntries) {
                  const note = (e?.surfaceNote || '').trim();
                  if (!note) continue;
                  const belongs = e.colorGroupId === group.id || surfaceSet.has(e.paintGroupKey);
                  if (!belongs) continue;
                  if (!noteMap.has(e.paintGroupKey)) noteMap.set(e.paintGroupKey, note);
                }
                if (noteMap.size === 0) return null;
                return (
                  <div className="rounded-md border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-2 space-y-1.5" data-testid={`group-customer-note-${group.id}`}>
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                      <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        Note from customer{noteMap.size > 1 ? `s (${noteMap.size})` : ''}
                      </div>
                    </div>
                    {Array.from(noteMap.entries()).map(([key, note]) => (
                      <div key={key} className="pl-5">
                        {noteMap.size > 1 && (
                          <div className="text-[10px] font-medium text-emerald-700/80 dark:text-emerald-400/80">{key}</div>
                        )}
                        <div className="text-[12px] text-foreground whitespace-pre-wrap break-words">{note}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {!allGroupSelected && (
                <div className="text-[10px] text-muted-foreground/70 italic ml-7">
                  {someGroupSelected ? 'Some surfaces not shared with customer' : 'Internal only — not shared with customer'}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Standalone section cards (production + manual). Mirrors the group card layout — uses a violet
          accent and a SECTION badge to distinguish from emerald GROUP cards. Surfaces already inside a
          color group are hidden here. */}
      {allRooms.map((room: any) => {
        const ungroupedSurfaces = room.surfaces.filter((s: any) => {
          const area = `${room.name} - ${s.label}`;
          return !colorGroups.some((g: any) => Array.isArray(g.surfaces) && g.surfaces.includes(area));
        });
        if (ungroupedSurfaces.length === 0) return null;

        const surfaceAreas = ungroupedSurfaces.map((s: any) => `${room.name} - ${s.label}`);
        const sharedCount = surfaceAreas.filter(a => sendSelection.has(a)).length;
        const allShared = sharedCount === surfaceAreas.length && surfaceAreas.length > 0;
        const someShared = sharedCount > 0 && !allShared;

        return (
          <div
            key={`room-${room.id}`}
            className="rounded-lg border-2 overflow-hidden transition-all hover:shadow-md border-violet-200 dark:border-violet-900 bg-violet-50/40 dark:bg-violet-950/20"
            data-testid={`room-card-${room.id}`}
          >
            <div className="px-3 py-2.5 space-y-2">
              {/* Row 1: select-all checkbox + section name + badge | edit/delete (right) */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={allShared}
                    ref={el => { if (el) el.indeterminate = someShared; }}
                    onChange={() => {
                      setSendSelection(prev => {
                        const next = new Set(prev);
                        if (allShared) {
                          for (const a of surfaceAreas) next.delete(a);
                        } else {
                          for (const a of surfaceAreas) next.add(a);
                        }
                        return next;
                      });
                    }}
                    className="h-4 w-4 rounded border-gray-300 accent-violet-600 shrink-0"
                    data-testid={`checkbox-section-${room.id}`}
                  />
                  <span className="text-sm font-semibold truncate" data-testid={`text-room-name-${room.id}`}>
                    {room.name}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-200/70 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200 shrink-0">
                    Section
                  </span>
                  {room.fromProduction && (
                    <Lock className="w-3 h-3 text-violet-700/70 dark:text-violet-300/70 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {!room.fromProduction && (
                    <button
                      type="button"
                      onClick={() => openEditRoomModal(room)}
                      className="p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/40 text-muted-foreground hover:text-foreground"
                      data-testid={`button-edit-room-${room.id}`}
                      aria-label="Edit section"
                    >
                      <PenLine className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Per-surface rows (each surface has its own color + share toggle).
                  No summary line above — the surface labels are already shown in each row. */}
              <div className="ml-7 rounded-md border border-violet-200/70 dark:border-violet-900/70 bg-white/60 dark:bg-background/40 divide-y divide-violet-100 dark:divide-violet-900/50">
                {ungroupedSurfaces.map((s: any) => {
                  const area = `${room.name} - ${s.label}`;
                  const assigned = getColorForSurface(room.name, s.label);
                  const isShared = sendSelection.has(area);
                  const hex = assigned?.paintColor?.hexColor || assigned?.customHex;
                  const colorName = assigned?.paintColor?.name || assigned?.customColorName;
                  const sheen = assigned?.sheen;
                  const brand = assigned?.paintColor?.brand;
                  const code = assigned?.paintColor?.code;
                  const hasColor = !!hex || !!colorName;
                  return (
                    <div
                      key={s.key}
                      className={`flex items-center gap-2.5 px-2.5 py-2 transition-opacity ${isShared ? '' : 'opacity-60'}`}
                      data-testid={`surface-row-${room.id}-${s.key}`}
                    >
                      {hex ? (
                        <div className="w-10 h-10 rounded-md shadow-sm border border-black/10 shrink-0" style={{ backgroundColor: hex }} />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-muted border-2 border-dashed border-muted-foreground/30 flex items-center justify-center shrink-0">
                          <Paintbrush className="w-3.5 h-3.5 text-muted-foreground/60" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{s.label}</div>
                        {hasColor ? (
                          <>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {colorName || 'Custom color'}
                              {(code || brand) ? ` · ${[code, brand].filter(Boolean).join(' · ')}` : ''}
                            </div>
                            {sheen && (
                              <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                                <Droplets className="w-2.5 h-2.5 shrink-0" />
                                <span className="capitalize">{sheen}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-[11px] text-muted-foreground/70 italic">No color picked</div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 shrink-0"
                        onClick={() => {
                          setActiveSurface({
                            roomId: room.id,
                            roomName: room.name,
                            surfaceKey: s.key,
                            surfaceLabel: s.label,
                          });
                          setSearchQuery("");
                          setSearchSelectedColor(null);
                          setSelectedSheen(sheen || '');
                          setShowManualEntry(false);
                          setManualColorName("");
                          setManualColorBrand("");
                          setLookupResult(null);
                          setLookupError("");
                        }}
                        data-testid={`button-pick-color-${room.id}-${s.key}`}
                      >
                        <Paintbrush className="w-3.5 h-3.5 mr-1" />
                        {hasColor ? 'Change' : 'Pick'}
                      </Button>
                      <label className="flex items-center gap-1.5 shrink-0 cursor-pointer select-none" title={isShared ? 'Shared with customer' : 'Internal only — toggle to share'}>
                        <input
                          type="checkbox"
                          checked={isShared}
                          onChange={(e) => {
                            setSendSelection(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(area);
                              else next.delete(area);
                              return next;
                            });
                          }}
                          className="h-4 w-4 rounded border-gray-300 accent-violet-600"
                          data-testid={`toggle-share-${room.id}-${s.key}`}
                        />
                      </label>
                      {!room.fromProduction && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSurface(room, s)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground/60 hover:text-destructive shrink-0"
                          data-testid={`button-delete-surface-${room.id}-${s.key}`}
                          aria-label="Remove surface"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Note to customer (contractor → customer) — inline editable, autosaved */}
              {(() => {
                const savedNote = (savedSubmission?.sectionNotes as Record<string, string> | undefined)?.[room.id] || '';
                const draftValue = sectionNoteDrafts[room.id] !== undefined
                  ? sectionNoteDrafts[room.id]
                  : savedNote;
                return (
                  <div className="ml-7 rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/10 px-2 py-1.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <MessageSquare className="w-3 h-3 shrink-0 text-blue-600 dark:text-blue-400" />
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">Note to customer</div>
                    </div>
                    <Textarea
                      placeholder="Add a note for the customer..."
                      value={draftValue}
                      maxLength={150}
                      onChange={(e) => handleSectionNote(room.id, e.target.value)}
                      className="min-h-[44px] text-xs bg-white/80 dark:bg-background/60 border-blue-200/60 dark:border-blue-900/60"
                      data-testid={`textarea-section-customer-note-${room.id}`}
                    />
                    <p className={`text-[10px] text-right mt-0.5 ${draftValue.length >= 140 ? 'text-amber-500' : 'text-blue-700/60 dark:text-blue-400/60'}`}>
                      {draftValue.length}/150
                    </p>
                  </div>
                );
              })()}

              {/* Note(s) from customer — scan entries for surfaces in this section */}
              {(() => {
                const subEntries: any[] = (savedSubmission?.entries as any[]) || [];
                const surfaceSet = new Set(surfaceAreas);
                const noteMap = new Map<string, string>();
                for (const e of subEntries) {
                  const note = (e?.surfaceNote || '').trim();
                  if (!note) continue;
                  if (!surfaceSet.has(e.paintGroupKey)) continue;
                  if (!noteMap.has(e.paintGroupKey)) noteMap.set(e.paintGroupKey, note);
                }
                if (noteMap.size === 0) return null;
                return (
                  <div className="ml-7 rounded-md border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-2 space-y-1.5" data-testid={`section-customer-note-${room.id}`}>
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                      <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        Note from customer{noteMap.size > 1 ? `s (${noteMap.size})` : ''}
                      </div>
                    </div>
                    {Array.from(noteMap.entries()).map(([key, note]) => (
                      <div key={key} className="pl-5">
                        {noteMap.size > 1 && (
                          <div className="text-[10px] font-medium text-emerald-700/80 dark:text-emerald-400/80">{key}</div>
                        )}
                        <div className="text-[12px] text-foreground whitespace-pre-wrap break-words">{note}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Footer hint */}
              {!allShared && (
                <div className="text-[10px] text-muted-foreground/70 italic ml-7">
                  {someShared ? 'Some surfaces not shared with customer' : 'Internal only — not shared with customer'}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Empty hint when nothing yet */}
      {allRooms.length === 0 && colorGroups.length === 0 && (
        <Card className="p-6">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Layers className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm font-medium">No rooms or colors yet</p>
            <p className="text-xs text-muted-foreground max-w-[280px]">
              Add a section, or set up production rates so rooms appear here automatically.
            </p>
          </div>
        </Card>
      )}


      <Dialog open={!!activeSurface} onOpenChange={(open) => {
        if (!open) {
          setActiveSurface(null);
          setSearchQuery("");
          setSearchSelectedColor(null);
          setShowManualEntry(false);
          setManualColorName("");
          setManualColorBrand("");
          setColorMatchFile(null);
          setColorMatchPreview("");
          setLookupResult(null);
          setLookupError("");
        }
      }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeSurface ? `${activeSurface.roomName} — ${activeSurface.surfaceLabel}` : 'Select Color'}</DialogTitle>
            <DialogDescription>Search our paint color library or enter a color manually.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex items-center justify-center">
              <div className="inline-flex rounded-full bg-muted p-0.5 border" data-testid="pill-toggle-mode">
                <button
                  type="button"
                  className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${!showManualEntry ? 'bg-black text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setShowManualEntry(false)}
                  data-testid="pill-search-mode"
                >
                  Search
                </button>
                <button
                  type="button"
                  className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${showManualEntry ? 'bg-black text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => { setShowManualEntry(true); setManualColorName(searchQuery.trim()); setSearchQuery(""); }}
                  data-testid="pill-manual-mode"
                >
                  Manual Entry
                </button>
              </div>
            </div>

            {!showManualEntry ? (
            <>
              <>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search paint color name or code..."
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setLookupResult(null); setLookupError(""); }}
                      className="pl-9 pr-9 h-10 text-sm"
                      data-testid="input-color-search"
                    />
                    {searchQuery ? (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                      >
                        <X className="w-4 h-4 text-muted-foreground" />
                      </button>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                            data-testid="button-search-tip"
                            aria-label="Search tips"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                          <p className="font-semibold mb-1">Tip: include the brand</p>
                          <p className="mb-1">For best results, type the brand name with the color. Examples:</p>
                          <ul className="list-disc pl-4 space-y-0.5">
                            <li>Farrow and Ball Scallop</li>
                            <li>Benjamin Moore White Dove</li>
                            <li>Sherwin-Williams SW 7015</li>
                          </ul>
                          <p className="mt-1 text-muted-foreground">If a color isn't in our library, tap "Find this color" and we'll look it up.</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>

                {filteredColors.length > 0 && (
                  <div className="max-h-56 overflow-y-auto rounded-lg border bg-background">
                    {filteredColors.map((color: any) => {
                      const isCurrentlySelected = searchSelectedColor?.id === color.id;
                      return (
                      <button
                        key={color.id}
                        type="button"
                        className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 active:bg-muted transition-colors text-left border-b last:border-0 ${isCurrentlySelected ? 'bg-green-50 dark:bg-green-950/20' : ''}`}
                        onClick={() => {
                          if (activeSurface) {
                            const area = `${activeSurface.roomName} - ${activeSurface.surfaceLabel}`;
                            assignMutation.mutate({ paintColorId: color.id, area, sheen: selectedSheen && selectedSheen !== "none" ? selectedSheen : undefined });
                          }
                          setSearchSelectedColor(color);
                          setSearchQuery("");
                        }}
                        data-testid={`color-result-${color.id}`}
                      >
                        <div
                          className="w-10 h-10 rounded-lg shadow-sm border shrink-0"
                          style={{ backgroundColor: color.hexColor || '#ccc' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{color.name}</p>
                          <p className="text-[10px] text-muted-foreground">{color.code} · {color.brand}</p>
                        </div>
                        {isCurrentlySelected && <Check className="w-4 h-4 text-green-600 shrink-0" />}
                      </button>
                      );
                    })}
                  </div>
                )}

                {searchQuery.trim() && filteredColors.length === 0 && !lookupResult && (
                  <div className="text-center space-y-2 py-2">
                    <p className="text-xs text-muted-foreground">No colors match "{searchQuery}"</p>
                    <div className="flex gap-2 justify-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        disabled={lookupLoading}
                        onClick={async () => {
                          setLookupLoading(true);
                          setLookupError("");
                          setLookupResult(null);
                          try {
                            const res = await apiRequest("POST", "/api/paint-colors/lookup", { query: searchQuery.trim() });
                            const data = await res.json();
                            setLookupResult(data);
                          } catch (err: any) {
                            setLookupError(err.message || "Could not look up this color");
                          } finally {
                            setLookupLoading(false);
                          }
                        }}
                        data-testid="button-ai-color-lookup"
                      >
                        {lookupLoading ? (
                          <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Searching...</>
                        ) : (
                          <><Search className="w-3.5 h-3.5 mr-1" /> Find this color</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => {
                          setShowManualEntry(true);
                          setManualColorName(searchQuery.trim());
                        }}
                        data-testid="button-manual-entry"
                      >
                        <Paintbrush className="w-3.5 h-3.5 mr-1" />
                        Enter manually
                      </Button>
                    </div>
                    {lookupError && <p className="text-xs text-destructive">{lookupError}</p>}
                  </div>
                )}

                {lookupResult && !lookupResult.alreadyExists && (
                  <div className="p-3 rounded-lg border bg-muted/10 space-y-2" data-testid="color-lookup-result">
                    <p className="text-[10px] uppercase text-muted-foreground font-medium">Found color</p>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl shadow-sm border shrink-0" style={{ backgroundColor: lookupResult.hexColor || '#ccc' }} />
                      <div>
                        <p className="text-sm font-semibold">{lookupResult.name}</p>
                        <p className="text-xs text-muted-foreground">{lookupResult.code} · {lookupResult.brand}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Is this the right color?</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={assignMutation.isPending}
                        onClick={async () => {
                          try {
                            const addRes = await apiRequest("POST", "/api/paint-colors", lookupResult);
                            const newColor = await addRes.json();
                            queryClient.invalidateQueries({ queryKey: ["/api/paint-colors"] });
                            if (activeSurface) {
                              const area = `${activeSurface.roomName} - ${activeSurface.surfaceLabel}`;
                              assignMutation.mutate({ paintColorId: newColor.id, area, sheen: selectedSheen && selectedSheen !== "none" ? selectedSheen : undefined });
                            }
                            setLookupResult(null);
                          } catch {
                            toast({ title: "Failed to add color", variant: "destructive" });
                          }
                        }}
                        data-testid="button-add-found-color"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Yes, add & assign
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setLookupResult(null); setLookupError(""); }}
                      >
                        Not this one
                      </Button>
                    </div>
                  </div>
                )}

                {lookupResult?.alreadyExists && (
                  <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-950/20 space-y-2" data-testid="color-already-exists">
                    <p className="text-[10px] uppercase text-green-700 font-medium">Already in your colors</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg shadow-sm border shrink-0" style={{ backgroundColor: lookupResult.hexColor || lookupResult.hex_color || '#ccc' }} />
                      <div>
                        <p className="text-sm font-semibold">{lookupResult.name}</p>
                        <p className="text-xs text-muted-foreground">{lookupResult.code} · {lookupResult.brand}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={assignMutation.isPending}
                        onClick={() => {
                          if (activeSurface) {
                            const area = `${activeSurface.roomName} - ${activeSurface.surfaceLabel}`;
                            assignMutation.mutate({ paintColorId: lookupResult.id, area, sheen: selectedSheen && selectedSheen !== "none" ? selectedSheen : undefined });
                          }
                          setLookupResult(null);
                        }}
                        data-testid="button-assign-existing-color"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Assign to surface
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setLookupResult(null); setLookupError(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {!searchQuery.trim() && !lookupResult && !searchSelectedColor && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Type a color name or number to search
                  </p>
                )}

                {searchSelectedColor && (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                    <div
                      className="w-10 h-10 rounded-lg shadow-sm border shrink-0"
                      style={{ backgroundColor: searchSelectedColor.hexColor || '#ccc' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{searchSelectedColor.name}</p>
                      <p className="text-[10px] text-muted-foreground">{searchSelectedColor.code} · {searchSelectedColor.brand}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSearchSelectedColor(null); setSearchQuery(""); }}
                      className="p-1 rounded-full hover:bg-muted transition-colors"
                      data-testid="button-clear-selected-color"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-muted-foreground">Finish</label>
                    {searchSelectedColor && (!selectedSheen || selectedSheen === 'none') && (
                      <span className="text-[9px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Required</span>
                    )}
                  </div>
                  <Select value={selectedSheen} onValueChange={(val) => {
                    setSelectedSheen(val);
                    if (searchSelectedColor && activeSurface) {
                      const area = `${activeSurface.roomName} - ${activeSurface.surfaceLabel}`;
                      assignMutation.mutate({ paintColorId: searchSelectedColor.id, area, sheen: val !== "none" ? val : undefined });
                    }
                  }}>
                    <SelectTrigger className={`h-10 text-sm ${searchSelectedColor && (!selectedSheen || selectedSheen === 'none') ? 'border-red-300 ring-1 ring-red-200' : ''}`} data-testid="select-sheen">
                      <SelectValue placeholder="Select finish..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Finish</SelectItem>
                      <SelectItem value="flat">Flat</SelectItem>
                      <SelectItem value="matte">Matte</SelectItem>
                      <SelectItem value="eggshell">Eggshell</SelectItem>
                      <SelectItem value="satin">Satin</SelectItem>
                      <SelectItem value="semi-gloss">Semi-Gloss</SelectItem>
                      <SelectItem value="high-gloss">High-Gloss</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {searchSelectedColor && (!selectedSheen || selectedSheen === 'none') && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <span className="text-xs text-red-600 font-medium">Please select a finish before saving</span>
                  </div>
                )}

                <Button
                  className="w-full h-10"
                  disabled={!!searchSelectedColor && (!selectedSheen || selectedSheen === 'none')}
                  onClick={() => {
                    setActiveSurface(null);
                    setSearchQuery("");
                    setSearchSelectedColor(null);
                    setShowManualEntry(false);
                    setSelectedSheen("");
                    setShowColorMatch(false);
                    setColorMatchDesc("");
                    setColorMatchFile(null);
                    setColorMatchPreview("");
                    setManualColorName("");
                    setManualColorBrand("");
                  }}
                  data-testid="button-done-color"
                >
                  <Check className="w-4 h-4 mr-1.5" />
                  Save
                </Button>
              </>
            </>
            ) : (
            <div className="space-y-3" data-testid="manual-color-entry">
              <Input
                placeholder="Color name (e.g. Sea Salt)"
                value={manualColorName}
                onChange={e => setManualColorName(e.target.value)}
                className="h-10 text-sm"
                data-testid="input-manual-color-name"
              />
              <div className="flex gap-2">
                <Select value={manualColorBrand} onValueChange={setManualColorBrand}>
                  <SelectTrigger className="h-10 text-sm flex-1" data-testid="select-manual-brand">
                    <SelectValue placeholder="Select brand..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Benjamin Moore">Benjamin Moore</SelectItem>
                    <SelectItem value="Sherwin-Williams">Sherwin-Williams</SelectItem>
                    <SelectItem value="PPG">PPG</SelectItem>
                    <SelectItem value="Behr">Behr</SelectItem>
                    <SelectItem value="Valspar">Valspar</SelectItem>
                    <SelectItem value="Farrow & Ball">Farrow & Ball</SelectItem>
                    <SelectItem value="Dunn-Edwards">Dunn-Edwards</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedSheen} onValueChange={setSelectedSheen}>
                  <SelectTrigger className="w-[110px] h-10 text-xs" data-testid="select-manual-sheen">
                    <SelectValue placeholder="Sheen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Sheen</SelectItem>
                    <SelectItem value="flat">Flat</SelectItem>
                    <SelectItem value="matte">Matte</SelectItem>
                    <SelectItem value="eggshell">Eggshell</SelectItem>
                    <SelectItem value="satin">Satin</SelectItem>
                    <SelectItem value="semi-gloss">Semi-Gloss</SelectItem>
                    <SelectItem value="high-gloss">High-Gloss</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <input
                type="file"
                accept="image/*"
                ref={colorMatchFileRef}
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setColorMatchFile(f);
                    setColorMatchPreview(URL.createObjectURL(f));
                  }
                }}
              />

              {colorMatchPreview ? (
                <div className="relative">
                  <img
                    src={colorMatchPreview}
                    alt="Color sample"
                    className="w-full h-28 object-cover rounded-lg border"
                  />
                  <button
                    type="button"
                    className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1"
                    onClick={() => { setColorMatchFile(null); setColorMatchPreview(""); }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-3 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
                  onClick={() => colorMatchFileRef.current?.click()}
                  data-testid="button-upload-color-photo"
                >
                  <Camera className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Upload a photo of the color</span>
                </button>
              )}

              <Button
                size="sm"
                className="w-full h-10"
                disabled={!manualColorName.trim() || assignMutation.isPending}
                onClick={() => {
                  if (activeSurface) {
                    const area = `${activeSurface.roomName} - ${activeSurface.surfaceLabel}`;
                    const brandStr = manualColorBrand ? ` (${manualColorBrand})` : "";
                    assignMutation.mutate({
                      area,
                      customColorName: `${manualColorName.trim()}${brandStr}`,
                      sheen: selectedSheen && selectedSheen !== "none" ? selectedSheen : undefined,
                      imageFile: colorMatchFile || undefined,
                    });
                  }
                  setActiveSurface(null);
                  setShowManualEntry(false);
                  setManualColorName("");
                  setManualColorBrand("");
                  setColorMatchFile(null);
                  setColorMatchPreview("");
                }}
                data-testid="button-save-manual-color"
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                Save
              </Button>
            </div>
            )}
          </div>
        </DialogContent>
      </Dialog>


      <PaintOrderPanel projectId={projectId} colorSelections={colorSelections} />

      {allRooms.length > 0 && (
        <ColorSubmissionPanel
          projectId={projectId}
          colorSelections={colorSelections.filter((s: any) => sendSelection.has(s.area))}
          selectedAreas={Array.from(sendSelection)}
        />
      )}

      <Dialog open={!!groupEditor?.open} onOpenChange={(o) => { if (!o) setGroupEditor(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" data-testid="dialog-group-editor">
          <DialogHeader>
            <DialogTitle>{groupEditor?.mode === 'edit' ? 'Edit color group' : 'Create color group'}</DialogTitle>
            <DialogDescription>
              Pick the surfaces that should share one color. Editing the color on any of them updates the whole group, and the Paint Order tallies gallons together.
            </DialogDescription>
          </DialogHeader>

          {groupEditor && (
            <div className="space-y-4 overflow-y-auto pr-1">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Group name</label>
                <Input
                  value={groupEditor.name}
                  onChange={(e) => setGroupEditor({ ...groupEditor, name: e.target.value })}
                  placeholder="e.g. Trim white, Main wall color"
                  data-testid="input-group-name"
                />
              </div>

              {allRooms.length === 0 && (
                <p className="text-xs text-muted-foreground border rounded-md p-3">No rooms or surfaces yet. Add surfaces in the Colors tab first.</p>
              )}

              {allRooms.length > 0 && (() => {
                // Per-room metadata: which surfaces are eligible (not locked in another group), and which are selected
                const roomMeta = allRooms.map(room => {
                  const eligibleSurfaces = room.surfaces.filter((s: any) => {
                    const a = `${room.name} - ${s.label}`;
                    return !colorGroups.some((g: any) => g.id !== groupEditor.groupId && (g.surfaces || []).includes(a));
                  });
                  const selectedSurfaces = room.surfaces.filter((s: any) => groupEditor.surfaces.has(`${room.name} - ${s.label}`));
                  return { room, eligibleSurfaces, selectedSurfaces, isIncluded: selectedSurfaces.length > 0 };
                });
                const includedRooms = roomMeta.filter(r => r.isIncluded);
                const includedRoomCount = includedRooms.length;
                const allRoomsIncluded = includedRoomCount === roomMeta.length;

                // Build deduped surface label list across ALL rooms (not just included)
                // so the user sees every possible surface up-front, with claimed ones cross-referenced.
                const surfaceLabelMap = new Map<string, { label: string; key: string }>();
                for (const { room } of roomMeta) {
                  for (const s of room.surfaces) {
                    if (!surfaceLabelMap.has(s.label)) surfaceLabelMap.set(s.label, { label: s.label, key: s.key });
                  }
                }
                const surfaceLabels = Array.from(surfaceLabelMap.values());

                // Helper: which group currently claims a given "Room - Surface" cell (if any).
                const claimingGroupForCell = (cell: string) =>
                  colorGroups.find((g: any) => g.id !== groupEditor.groupId && (g.surfaces || []).includes(cell));

                const surfaceStateForLabel = (label: string) => {
                  let active = 0, eligible = 0, conflict = 0;
                  const conflictGroupNames = new Set<string>();
                  for (const { room, isIncluded, eligibleSurfaces } of roomMeta) {
                    const surfaceMatch = room.surfaces.find((s: any) => s.label === label);
                    if (!surfaceMatch) continue;
                    const a = `${room.name} - ${label}`;
                    const claimedBy = claimingGroupForCell(a);
                    if (claimedBy) {
                      conflict++;
                      conflictGroupNames.add(claimedBy.name);
                      continue;
                    }
                    if (!isIncluded) continue;
                    if (!eligibleSurfaces.some((s: any) => s.label === label)) continue;
                    eligible++;
                    if (groupEditor.surfaces.has(a)) active++;
                  }
                  return { active, eligible, conflict, conflictGroupNames: Array.from(conflictGroupNames) };
                };

                return (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Areas Included</Label>
                        {!allRoomsIncluded && (
                          <button
                            type="button"
                            className="text-[11px] text-primary/70 hover:text-primary"
                            onClick={() => {
                              const next = new Set(groupEditor.surfaces);
                              for (const { room, eligibleSurfaces } of roomMeta) {
                                for (const s of eligibleSurfaces) next.add(`${room.name} - ${s.label}`);
                              }
                              setGroupEditor({ ...groupEditor, surfaces: next });
                            }}
                            data-testid="button-select-all-areas"
                          >
                            Select all
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {roomMeta.map(({ room, eligibleSurfaces, selectedSurfaces, isIncluded }) => {
                          // Build a clear summary: show every surface, with claimed ones noted
                          const totalSurfaces = room.surfaces.length;
                          const claimedCount = totalSurfaces - eligibleSurfaces.length;
                          const labels = (isIncluded ? selectedSurfaces : eligibleSurfaces).map((s: any) => s.label);
                          const baseSummary = labels.length === 0
                            ? (eligibleSurfaces.length === 0 ? "all surfaces in other groups" : "no surfaces")
                            : labels.length <= 3
                              ? labels.join(", ")
                              : `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
                          const summary = !isIncluded && claimedCount > 0 && eligibleSurfaces.length > 0
                            ? `${baseSummary} · ${claimedCount} claimed`
                            : baseSummary;
                          const noEligible = eligibleSurfaces.length === 0 && !isIncluded;
                          return (
                            <button
                              key={room.id}
                              type="button"
                              disabled={noEligible}
                              title={noEligible
                                ? `All surfaces in ${room.name} are already in other groups`
                                : claimedCount > 0
                                  ? `${claimedCount} surface(s) in this room are claimed by other groups`
                                  : labels.join(", ")}
                              onClick={() => {
                                const next = new Set(groupEditor.surfaces);
                                if (isIncluded) {
                                  for (const s of room.surfaces) next.delete(`${room.name} - ${s.label}`);
                                } else {
                                  for (const s of eligibleSurfaces) next.add(`${room.name} - ${s.label}`);
                                }
                                setGroupEditor({ ...groupEditor, surfaces: next });
                              }}
                              className={`px-2.5 py-1 rounded-md text-xs border font-medium transition-colors text-left ${
                                isIncluded
                                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                  : noEligible
                                    ? 'bg-background border-dashed border-border text-foreground/70 cursor-not-allowed line-through'
                                    : 'bg-background border-border text-foreground hover:border-primary/40'
                              }`}
                              data-testid={`area-chip-${room.id}`}
                            >
                              <div>{room.name}</div>
                              <div className="text-[10px] font-normal opacity-70 mt-0.5">{summary}</div>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => {
                            setGroupAddAreaOpen(v => !v);
                            setGroupAddAreaName("");
                            setGroupAddAreaSurfaces(new Set());
                            setGroupAddAreaCustom("");
                          }}
                          className="px-3 py-2 rounded-md text-xs border border-dashed border-primary/40 text-primary hover:bg-primary/5 font-medium"
                          data-testid="button-group-add-area"
                        >
                          + Add area
                        </button>
                      </div>

                      {groupAddAreaOpen && (
                        <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                          <Input
                            placeholder="Area name (e.g. Hallway, Kitchen Cabinets)"
                            value={groupAddAreaName}
                            onChange={e => setGroupAddAreaName(e.target.value)}
                            className="h-9 text-sm bg-background"
                            data-testid="input-group-add-area-name"
                          />
                          <div>
                            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 block">Surfaces in this area</Label>
                            <div className="flex flex-wrap gap-1.5">
                              {MANUAL_SURFACE_OPTIONS.map(s => {
                                const active = groupAddAreaSurfaces.has(s.label);
                                return (
                                  <button
                                    key={s.key}
                                    type="button"
                                    onClick={() => {
                                      setGroupAddAreaSurfaces(prev => {
                                        const next = new Set(prev);
                                        if (next.has(s.label)) next.delete(s.label); else next.add(s.label);
                                        return next;
                                      });
                                    }}
                                    className={`px-2.5 py-1 rounded-md text-xs border ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-primary/40'}`}
                                    data-testid={`button-group-add-area-surface-${s.key}`}
                                  >
                                    {s.label}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="flex gap-1.5 mt-2">
                              <Input
                                placeholder="Custom surface (optional)"
                                value={groupAddAreaCustom}
                                onChange={e => setGroupAddAreaCustom(e.target.value)}
                                className="h-8 text-xs bg-background"
                                data-testid="input-group-add-area-custom"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!groupAddAreaCustom.trim()}
                                onClick={() => {
                                  const label = groupAddAreaCustom.trim();
                                  if (!label) return;
                                  setGroupAddAreaSurfaces(prev => {
                                    const next = new Set(prev);
                                    next.add(label);
                                    return next;
                                  });
                                  setGroupAddAreaCustom("");
                                }}
                                data-testid="button-group-add-area-custom-add"
                              >
                                Add
                              </Button>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => { setGroupAddAreaOpen(false); setGroupAddAreaName(""); setGroupAddAreaSurfaces(new Set()); setGroupAddAreaCustom(""); }}
                              data-testid="button-group-add-area-cancel"
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={!groupAddAreaName.trim() || groupAddAreaSurfaces.size === 0}
                              onClick={() => {
                                const name = groupAddAreaName.trim();
                                if (!name || groupAddAreaSurfaces.size === 0) return;
                                // Avoid name collision with an existing room
                                const collision = allRooms.some(r => r.name.toLowerCase() === name.toLowerCase());
                                const finalName = collision ? `${name} (new)` : name;
                                const surfaceLabelsArr = Array.from(groupAddAreaSurfaces);
                                const newRoom = {
                                  id: `manual-${Date.now()}`,
                                  name: finalName,
                                  surfaces: surfaceLabelsArr.map(label => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label })),
                                };
                                setManualRooms(prev => [...prev, newRoom]);
                                // Auto-include all new surfaces in this group
                                const next = new Set(groupEditor.surfaces);
                                for (const label of surfaceLabelsArr) next.add(`${finalName} - ${label}`);
                                setGroupEditor({ ...groupEditor, surfaces: next });
                                setGroupAddAreaOpen(false);
                                setGroupAddAreaName("");
                                setGroupAddAreaSurfaces(new Set());
                                setGroupAddAreaCustom("");
                              }}
                              data-testid="button-group-add-area-save"
                            >
                              Add area
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {includedRoomCount > 0 && (
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Surfaces</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {surfaceLabels.map(({ label, key }) => {
                            const { active, eligible, conflict, conflictGroupNames } = surfaceStateForLabel(label);
                            const allActive = eligible > 0 && active === eligible;
                            const partial = active > 0 && !allActive;
                            const fullyDisabled = eligible === 0 && conflict > 0;
                            const tooltip = fullyDisabled
                              ? `Already used by ${conflictGroupNames.join(", ")}`
                              : conflict > 0
                                ? `Also in ${conflictGroupNames.join(", ")}`
                                : undefined;
                            return (
                              <button
                                key={key}
                                type="button"
                                disabled={fullyDisabled}
                                title={tooltip}
                                onClick={() => {
                                  const next = new Set(groupEditor.surfaces);
                                  for (const { room, isIncluded, eligibleSurfaces } of roomMeta) {
                                    if (!isIncluded) continue;
                                    if (!eligibleSurfaces.some((s: any) => s.label === label)) continue;
                                    const a = `${room.name} - ${label}`;
                                    if (allActive) next.delete(a); else next.add(a);
                                  }
                                  setGroupEditor({ ...groupEditor, surfaces: next });
                                }}
                                className={`px-3 py-1.5 rounded-md text-xs border font-medium transition-colors ${
                                  allActive
                                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                    : partial
                                      ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100/80'
                                      : fullyDisabled
                                        ? 'bg-background border-dashed border-border text-foreground/70 cursor-not-allowed line-through'
                                        : 'bg-background border-border text-foreground hover:border-primary/40'
                                }`}
                                data-testid={`surface-chip-${key}`}
                              >
                                {label}{partial && ' •'}
                                {conflict > 0 && !fullyDisabled && (
                                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">({conflict} claimed)</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2">Crossed-out surfaces are already in another group. Amber dot · = applied to only some included rooms. Tap to apply across all included rooms.</p>
                      </div>
                    )}

                    {(() => {
                      // Read current group color (from any included surface that has one, or from existing group)
                      const existingGroup = groupEditor.mode === 'edit' ? colorGroups.find((g: any) => g.id === groupEditor.groupId) : null;
                      const groupSelections = colorSelections.filter((s: any) => groupEditor.surfaces.has(s.area));
                      const colored = groupSelections.find((s: any) => s.paintColorId || s.customColorName || s.customHex);
                      const swatchHex = existingGroup?.customHex || colored?.customHex || colored?.paintColor?.hexColor;
                      const colorName = existingGroup?.customColorName
                        || colored?.paintColor?.name
                        || colored?.customColorName
                        || null;
                      const brandName = existingGroup?.brand || colored?.paintColor?.brand || null;
                      const code = colored?.paintColor?.code || null;
                      const finish = existingGroup?.finish || colored?.sheen || null;
                      const hasColor = !!(colorName || swatchHex);
                      const firstSurface = Array.from(groupEditor.surfaces)[0];
                      const canPick = !!firstSurface;
                      const openPicker = () => {
                        if (!firstSurface) {
                          toast({ title: 'Select at least one surface first', description: 'Pick the rooms and surfaces this group covers, then choose a color.' });
                          return;
                        }
                        const dashIdx = firstSurface.lastIndexOf(' - ');
                        const roomName = dashIdx >= 0 ? firstSurface.slice(0, dashIdx) : firstSurface;
                        const surfaceLabel = dashIdx >= 0 ? firstSurface.slice(dashIdx + 3) : '';
                        const room = allRooms.find((r: any) => r.name === roomName);
                        const surf = room?.surfaces.find((s: any) => s.label === surfaceLabel);
                        setActiveSurface({
                          roomId: room?.id || roomName,
                          roomName,
                          surfaceKey: surf?.key || surfaceLabel,
                          surfaceLabel,
                        });
                        setSelectedSheen(finish || '');
                      };
                      return (
                        <div className="border rounded-md p-2.5 bg-muted/30 space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block">Color</Label>
                          {hasColor ? (
                            <div className="flex items-center gap-2.5">
                              {swatchHex
                                ? <div className="w-10 h-10 rounded-md border shrink-0" style={{ backgroundColor: swatchHex }} />
                                : <div className="w-10 h-10 rounded-md border bg-muted shrink-0 flex items-center justify-center"><Paintbrush className="w-4 h-4 text-muted-foreground" /></div>}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{colorName || 'Custom color'}</p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {[code, brandName, finish].filter(Boolean).join(' · ') || 'Tap Change to update color'}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No color picked yet. Use the button below to search the library or enter one manually.</p>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant={hasColor ? 'outline' : 'default'}
                            className="w-full h-9 text-xs font-medium"
                            disabled={!canPick}
                            onClick={openPicker}
                            data-testid="button-pick-color-in-builder"
                          >
                            <Paintbrush className="w-3.5 h-3.5 mr-1.5" />
                            {hasColor ? 'Change color' : 'Pick color'}
                          </Button>
                        </div>
                      );
                    })()}

                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                        Internal note <span className="text-muted-foreground/60 normal-case">(crew only)</span>
                      </Label>
                      <Textarea
                        value={groupEditor.notes}
                        onChange={(e) => setGroupEditor({ ...groupEditor, notes: e.target.value })}
                        placeholder="Notes for the crew (e.g. 'Two coats minimum', 'Use leftover gallons')"
                        className="text-sm min-h-[64px] resize-none"
                        data-testid="textarea-group-notes"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-medium text-blue-700 uppercase tracking-wide mb-1.5 block">
                        Customer note <span className="text-blue-700/60 normal-case">(visible to customer)</span>
                      </Label>
                      <Textarea
                        value={groupEditor.customerNotes}
                        onChange={(e) => setGroupEditor({ ...groupEditor, customerNotes: e.target.value })}
                        placeholder="A note shown to the customer on the color review page (e.g. 'We recommend eggshell here for easy cleanup')"
                        className="text-sm min-h-[64px] resize-none border-blue-200 focus-visible:ring-blue-300"
                        data-testid="textarea-group-customer-notes"
                      />
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          <DialogFooter className="flex-row justify-between gap-2">
            {groupEditor?.mode === 'edit' && groupEditor.groupId && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={async () => {
                  if (!confirm('Delete this group? Surfaces keep their assigned colors.')) return;
                  try {
                    await apiRequest('DELETE', `/api/color-groups/${groupEditor.groupId}`);
                    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-groups"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-totals"] });
                    setGroupEditor(null);
                    toast({ title: 'Group deleted' });
                  } catch {
                    toast({ title: 'Failed to delete group', variant: 'destructive' });
                  }
                }}
                data-testid="button-delete-group"
              >
                Delete group
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setGroupEditor(null)} data-testid="button-cancel-group">Cancel</Button>
              <Button
                disabled={saveGroupMutation.isPending}
                onClick={() => {
                  if (!groupEditor) return;
                  const trimmedName = groupEditor.name.trim();
                  if (!trimmedName) {
                    toast({ title: 'Group name required', description: 'Give this color group a name (e.g. "Trim white").', variant: 'destructive' });
                    return;
                  }
                  if (groupEditor.surfaces.size === 0) {
                    toast({ title: 'Select at least one area & surface', description: 'Pick the rooms and surfaces this color group covers.', variant: 'destructive' });
                    return;
                  }
                  // Make sure at least one room AND one surface label are represented
                  let hasRoom = false;
                  let hasSurface = false;
                  for (const a of groupEditor.surfaces) {
                    const idx = a.lastIndexOf(' - ');
                    if (idx >= 0) {
                      if (a.slice(0, idx)) hasRoom = true;
                      if (a.slice(idx + 3)) hasSurface = true;
                    }
                  }
                  if (!hasRoom || !hasSurface) {
                    toast({ title: 'Pick at least one area and one surface', description: 'A color group needs both an area (room) and a surface (e.g. Walls).', variant: 'destructive' });
                    return;
                  }
                  saveGroupMutation.mutate({
                    mode: groupEditor.mode,
                    groupId: groupEditor.groupId,
                    name: trimmedName,
                    surfaces: Array.from(groupEditor.surfaces),
                    notes: groupEditor.notes.trim() || null,
                    customerNotes: groupEditor.customerNotes.trim() || null,
                  });
                }}
                data-testid="button-save-group"
              >
                {saveGroupMutation.isPending ? 'Saving…' : (groupEditor?.mode === 'edit' ? 'Save changes' : 'Create group')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input
        type="file"
        accept="image/*"
        ref={existingPhotoRef}
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f && uploadTargetId) {
            uploadPhotoMutation.mutate({ selectionId: uploadTargetId, file: f });
          }
          if (existingPhotoRef.current) existingPhotoRef.current.value = "";
        }}
      />

      {expandedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
          data-testid="image-lightbox"
        >
          <button
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2"
            onClick={() => setExpandedImage(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={expandedImage}
            alt="Color sample"
            className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}


function PaintOrderPanel({ projectId, colorSelections }: { projectId: number; colorSelections: any[] }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [viaSms, setViaSms] = useState(true);
  const [viaEmail, setViaEmail] = useState(true);
  const [smsMessage, setSmsMessage] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [orderItems, setOrderItems] = useState<Record<string, Array<{ size: string; quantity: number }>>>({});
  const [orderNotes, setOrderNotes] = useState('');
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);

  const { data: suppliersList = [] } = useQuery<any[]>({
    queryKey: ['/api/suppliers'],
  });

  const { data: companySettingsData } = useCompanySettings();

  const { data: existingOrders = [] } = useQuery<any[]>({
    queryKey: ['/api/projects', projectId, 'paint-orders'],
    queryFn: async () => {
      const { authFetch } = await import('@/lib/queryClient');
      const res = await authFetch(`/api/projects/${projectId}/paint-orders`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: colorTotalsData } = useQuery<any>({
    queryKey: ['/api/projects', projectId, 'color-totals'],
    queryFn: async () => {
      const { authFetch } = await import('@/lib/queryClient');
      const res = await authFetch(`/api/projects/${projectId}/color-totals`);
      if (!res.ok) return { colorTotals: [] };
      return res.json();
    },
  });

  const colorTotals: any[] = colorTotalsData?.colorTotals || [];

  const uniqueColors = useMemo(() => {
    if (colorTotals.length > 0) {
      return colorTotals.map((ct: any) => {
        const firstSurface = (ct.surfaces || [])[0] || '';
        const [r = '', s = ''] = firstSurface.split(' - ');
        const colorKey = ct.isGroup
          ? `group-${ct.groupId}`
          : `${ct.colorName}-${ct.colorCode || ''}-${ct.brand || ''}`;
        return {
          key: colorKey,
          colorName: ct.colorName || ct.groupName || 'TBD',
          colorCode: ct.colorCode || '',
          brand: ct.brand || '',
          hexColor: ct.hexColor || '',
          finish: ct.finish || '',
          roomName: r,
          surfaceLabel: s,
          isGroup: ct.isGroup,
          groupName: ct.groupName,
          surfaces: ct.surfaces || [],
          gallonsExact: ct.gallonsExact || 0,
          gallonsToBuy: ct.gallonsToBuy || 0,
          totalSqft: ct.totalSqft || 0,
        };
      });
    }
    // Fallback to selections-only path when totals not loaded yet
    const seen = new Map<string, any>();
    for (const s of colorSelections) {
      const name = s.paintColor?.name || s.customColorName;
      if (!name) continue;
      const key = `${name}-${s.paintColor?.code || ''}-${s.paintColor?.brand || ''}`;
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          colorName: name,
          colorCode: s.paintColor?.code || '',
          brand: s.paintColor?.brand || '',
          hexColor: s.paintColor?.hexColor || s.customHex || '',
          finish: s.sheen || '',
          roomName: s.area?.split(' - ')[0] || '',
          surfaceLabel: s.area?.split(' - ')[1] || '',
          isGroup: false,
          surfaces: [s.area],
          gallonsExact: 0,
          gallonsToBuy: 0,
          totalSqft: 0,
        });
      }
    }
    return Array.from(seen.values());
  }, [colorTotals, colorSelections]);

  const getContainers = (colorKey: string) => {
    return orderItems[colorKey] || [];
  };

  const addContainer = (colorKey: string) => {
    setOrderItems(prev => ({
      ...prev,
      [colorKey]: [...(prev[colorKey] || []), { size: 'one_gallon', quantity: 1 }],
    }));
  };

  const updateContainer = (colorKey: string, idx: number, field: 'size' | 'quantity', value: string | number) => {
    setOrderItems(prev => {
      const list = [...(prev[colorKey] || [])];
      list[idx] = { ...list[idx], [field]: value };
      return { ...prev, [colorKey]: list };
    });
  };

  const removeContainer = (colorKey: string, idx: number) => {
    setOrderItems(prev => {
      const list = [...(prev[colorKey] || [])];
      list.splice(idx, 1);
      return { ...prev, [colorKey]: list };
    });
  };

  const hasAnyItems = Object.values(orderItems).some(c => c.length > 0 && c.some(x => x.quantity > 0));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const items = uniqueColors
        .filter(c => (orderItems[c.key] || []).some(x => x.quantity > 0))
        .map(c => ({
          colorName: c.colorName,
          colorCode: c.colorCode,
          brand: c.brand,
          hexColor: c.hexColor,
          finish: c.finish,
          roomName: c.roomName,
          surfaceLabel: c.surfaceLabel,
          containers: (orderItems[c.key] || []).filter(x => x.quantity > 0),
        }));
      const { authFetch } = await import('@/lib/queryClient');
      const res = await authFetch(`/api/projects/${projectId}/paint-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, notes: orderNotes || null }),
      });
      if (!res.ok) throw new Error('Failed to save order');
      return res.json();
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'paint-orders'] });
      toast({ title: 'Paint order saved' });
      return order;
    },
    onError: () => toast({ title: 'Failed to save order', variant: 'destructive' }),
  });

  const selectedSupplier = suppliersList.find((s: any) => s.id === selectedSupplierId) || null;

  const canSms = !!(companySettingsData?.twilioAccountSid || companySettingsData?.twilioPhone);
  const canEmail = !!(companySettingsData?.googleEmail || companySettingsData?.smtpConnectedAt);

  const buildOrderText = () => {
    const companyName = companySettingsData?.companyName || 'Our Company';
    const sizeLabelsMap: Record<string, string> = { five_gallon: '5-gal', one_gallon: '1-gal', quart: 'qt' };
    const colorsWithItems = uniqueColors.filter(c => (orderItems[c.key] || []).some(x => x.quantity > 0));
    const lines = colorsWithItems.map(c => {
      const containers = (orderItems[c.key] || [])
        .filter(x => x.quantity > 0)
        .map(x => `${x.quantity} ${sizeLabelsMap[x.size] || x.size}`)
        .join(', ');
      const colorInfo = [c.colorName, c.colorCode, c.brand].filter(Boolean).join(' / ');
      const finishInfo = c.finish ? ` (${c.finish})` : '';
      return `${colorInfo}${finishInfo}: ${containers}`;
    });
    return `Paint Order from ${companyName}:\n\n${lines.join('\n')}${orderNotes ? '\n\nNotes: ' + orderNotes : ''}`;
  };

  const buildOrderTextFromSaved = (order: any) => {
    const companyName = companySettingsData?.companyName || 'Our Company';
    const sizeLabelsMap: Record<string, string> = { five_gallon: '5-gal', one_gallon: '1-gal', quart: 'qt' };
    const items = (order.items || []) as any[];
    const lines = items
      .filter((item: any) => (item.containers || []).some((c: any) => c.quantity > 0))
      .map((item: any) => {
        const containers = (item.containers || [])
          .filter((c: any) => c.quantity > 0)
          .map((c: any) => `${c.quantity} ${sizeLabelsMap[c.size] || c.size}`)
          .join(', ');
        const colorInfo = [item.colorName, item.colorCode, item.brand].filter(Boolean).join(' / ');
        const finishInfo = item.finish ? ` (${item.finish})` : '';
        return `${colorInfo}${finishInfo}: ${containers}`;
      });
    return `Paint Order from ${companyName}:\n\n${lines.join('\n')}${order.notes ? '\n\nNotes: ' + order.notes : ''}`;
  };

  const openSendDialog = (orderId: number) => {
    setPendingOrderId(orderId);
    const companyName = companySettingsData?.companyName || 'Our Company';
    const savedOrder = existingOrders.find((o: any) => o.id === orderId);
    const orderText = savedOrder ? buildOrderTextFromSaved(savedOrder) : buildOrderText();
    setSmsMessage(orderText);
    setEmailSubject(`Paint Order - ${companyName}`);
    setEmailBody(orderText);
    if (suppliersList.length === 1 && !selectedSupplierId) {
      setSelectedSupplierId(suppliersList[0].id);
    }
    setSendDialogOpen(true);
  };

  const sendMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const supplier = suppliersList.find((s: any) => s.id === selectedSupplierId);
      const payload: any = {
        viaSms: viaSms && canSms && !!supplier?.phone,
        viaEmail: viaEmail && canEmail && !!supplier?.email,
        smsTo: supplier?.phone || null,
        emailTo: supplier?.email || null,
        smsMessage: smsMessage || undefined,
        emailSubject: emailSubject || undefined,
        emailBody: emailBody || undefined,
      };
      if (!payload.viaSms && !payload.viaEmail) throw new Error('Select a send method and supplier with contact info');
      const { authFetch } = await import('@/lib/queryClient');
      const res = await authFetch(`/api/paint-orders/${orderId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to send');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'paint-orders'] });
      const methods = [];
      if (data.smsOk) methods.push('Text');
      if (data.emailOk) methods.push('Email');
      toast({ title: `Order sent via ${methods.join(' & ')}!` });
      setSendDialogOpen(false);
      setPendingOrderId(null);
    },
    onError: (err: any) => toast({ title: err.message || 'Failed to send', variant: 'destructive' }),
  });

  const sizeLabels: Record<string, string> = { five_gallon: '5-gal bucket', one_gallon: '1-gallon', quart: 'Quart' };

  if (uniqueColors.length === 0) return null;

  return (
    <Card className="mt-4" data-testid="paint-order-panel">
      <div
        className="px-3 py-2 bg-muted/30 border-b cursor-pointer flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
        data-testid="paint-order-toggle"
      >
        <div className="flex items-center gap-2">
          <Droplets className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium">Paint Order</span>
          {existingOrders.length > 0 && (
            <Badge variant="outline" className="text-[10px]">{existingOrders.length} order{existingOrders.length !== 1 ? 's' : ''}</Badge>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </div>

      {expanded && (
        <CardContent className="p-3 space-y-4">
          {existingOrders.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Previous Orders</p>
              {existingOrders.map((o: any) => (
                <div key={o.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs" data-testid={`paint-order-${o.id}`}>
                  <div>
                    <span className="font-medium">{(o.items || []).length} color{(o.items || []).length !== 1 ? 's' : ''}</span>
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    <Badge variant={o.status === 'sent' ? 'default' : 'outline'} className="text-[10px]">
                      {o.status === 'sent' ? 'Sent' : 'Draft'}
                    </Badge>
                    {o.sentAt && <span className="ml-1.5 text-muted-foreground">{new Date(o.sentAt).toLocaleDateString()}</span>}
                  </div>
                  {o.status === 'draft' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs"
                      onClick={() => openSendDialog(o.id)}
                      data-testid={`send-order-${o.id}`}
                    >
                      <Send className="w-3 h-3 mr-1" /> Send
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Order</p>
              {uniqueColors.some((c: any) => c.gallonsToBuy > 0) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] px-2"
                  onClick={() => {
                    setOrderItems(prev => {
                      const next = { ...prev };
                      for (const c of uniqueColors as any[]) {
                        if (c.gallonsToBuy > 0 && !(next[c.key]?.length)) {
                          // Smart packaging: 5-gal buckets first, then 1-gal, then quart
                          let remaining = c.gallonsToBuy;
                          const items: { size: string; quantity: number }[] = [];
                          const fives = Math.floor(remaining / 5);
                          if (fives > 0) {
                            items.push({ size: 'five_gallon', quantity: fives });
                            remaining -= fives * 5;
                          }
                          const ones = Math.floor(remaining);
                          if (ones > 0) {
                            items.push({ size: 'one_gallon', quantity: ones });
                            remaining -= ones;
                          }
                          if (remaining > 0) {
                            const quarts = Math.ceil(remaining / 0.25);
                            if (quarts > 0) items.push({ size: 'quart', quantity: quarts });
                          }
                          if (items.length > 0) next[c.key] = items;
                        }
                      }
                      return next;
                    });
                    toast({ title: 'Auto-filled from estimate' });
                  }}
                  data-testid="button-autofill-from-estimate"
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  Auto-fill from estimate
                </Button>
              )}
            </div>
            {uniqueColors.map(color => {
              const containers = getContainers(color.key);
              return (
                <div key={color.key} className="border rounded-lg p-2.5 space-y-2" data-testid={`order-color-${color.key}`}>
                  <div className="flex items-center gap-2">
                    {color.hexColor && (
                      <div className="w-6 h-6 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color.hexColor }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">
                        {color.isGroup && <span className="inline-flex items-center gap-0.5 mr-1 text-indigo-600"><Layers className="w-2.5 h-2.5" />{color.groupName}: </span>}
                        {color.colorName}{color.colorCode ? ` (${color.colorCode})` : ''}
                      </p>
                      {color.brand && <p className="text-[10px] text-muted-foreground">{color.brand}{color.finish ? ` · ${color.finish}` : ''}</p>}
                      {(color.surfaces?.length > 1 || color.isGroup) && (
                        <p className="text-[10px] text-muted-foreground/80 italic truncate">{color.surfaces?.length || 0} surface{color.surfaces?.length !== 1 ? 's' : ''}</p>
                      )}
                      {color.gallonsToBuy > 0 && (
                        <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                          ≈ {color.gallonsToBuy} gal needed <span className="text-muted-foreground font-normal">({color.gallonsExact} exact · {Math.round(color.totalSqft)} sqft)</span>
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2 text-blue-600"
                      onClick={() => addContainer(color.key)}
                      data-testid={`add-container-${color.key}`}
                    >
                      + Add
                    </Button>
                  </div>
                  {containers.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2 ml-8" data-testid={`container-row-${color.key}-${idx}`}>
                      <select
                        value={c.size}
                        onChange={e => updateContainer(color.key, idx, 'size', e.target.value)}
                        className="h-7 text-xs border rounded px-1.5 bg-background"
                        data-testid={`select-size-${color.key}-${idx}`}
                      >
                        <option value="five_gallon">5-gal bucket</option>
                        <option value="one_gallon">1-gallon</option>
                        <option value="quart">Quart</option>
                      </select>
                      <span className="text-xs text-muted-foreground">×</span>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={c.quantity}
                        onChange={e => updateContainer(color.key, idx, 'quantity', parseInt(e.target.value) || 1)}
                        className="h-7 w-14 text-xs text-center border rounded bg-background"
                        data-testid={`input-qty-${color.key}-${idx}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removeContainer(color.key, idx)}
                        data-testid={`remove-container-${color.key}-${idx}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })}

            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wide">Order Notes</label>
              <Textarea
                placeholder="Any special instructions..."
                value={orderNotes}
                onChange={e => setOrderNotes(e.target.value)}
                rows={2}
                className="text-xs"
                data-testid="textarea-order-notes"
              />
            </div>

            {hasAnyItems && (
              <div className="pt-1 space-y-3">
                <div className="border rounded-lg p-2.5 bg-muted/20">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Order Summary</p>
                  {uniqueColors.filter(c => (orderItems[c.key] || []).some(x => x.quantity > 0)).map(c => (
                    <div key={c.key} className="flex items-start gap-2 py-1 text-xs">
                      {c.hexColor && <div className="w-3 h-3 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: c.hexColor }} />}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{c.colorName}</span>
                        {c.colorCode && <span className="text-muted-foreground"> ({c.colorCode})</span>}
                        <div className="text-muted-foreground">
                          {(orderItems[c.key] || []).filter(x => x.quantity > 0).map((x, i) => (
                            <span key={i}>{i > 0 ? ', ' : ''}{x.quantity}× {sizeLabels[x.size] || x.size}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(() => {
                    let totalEstimate = 0;
                    let totalOrdered = 0;
                    for (const c of uniqueColors as any[]) {
                      totalEstimate += c.gallonsToBuy || 0;
                      const containers = orderItems[c.key] || [];
                      for (const x of containers) {
                        if (x.size === 'five_gallon') totalOrdered += 5 * (x.quantity || 0);
                        else if (x.size === 'one_gallon') totalOrdered += 1 * (x.quantity || 0);
                        else if (x.size === 'quart') totalOrdered += 0.25 * (x.quantity || 0);
                      }
                    }
                    if (totalEstimate === 0 && totalOrdered === 0) return null;
                    const diff = totalOrdered - totalEstimate;
                    return (
                      <div className="border-t mt-2 pt-2 flex items-center justify-between text-xs" data-testid="order-grand-total">
                        <span className="font-semibold">Total</span>
                        <span className="text-muted-foreground">
                          Ordered: <span className="font-semibold text-foreground">{totalOrdered} gal</span>
                          {totalEstimate > 0 && (
                            <> · Est: <span className="font-medium">{totalEstimate} gal</span></>
                          )}
                          {totalEstimate > 0 && diff !== 0 && (
                            <span className={`ml-1 ${diff < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              ({diff > 0 ? '+' : ''}{diff})
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={async () => {
                      const order = await saveMutation.mutateAsync();
                      if (order?.id) {
                        openSendDialog(order.id);
                      }
                    }}
                    disabled={saveMutation.isPending}
                    data-testid="button-save-and-send-order"
                  >
                    <Send className="w-3.5 h-3.5 mr-1" />
                    {saveMutation.isPending ? 'Saving...' : 'Save & Send'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    data-testid="button-save-order-draft"
                  >
                    Save Draft
                  </Button>
                </div>
              </div>
            )}
          </div>

          {suppliersList.length > 0 ? (
            <div className="border rounded-lg p-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Supplier</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Store className="w-3.5 h-3.5" />
                <span>{suppliersList.length} supplier{suppliersList.length !== 1 ? 's' : ''} saved</span>
                <a href="/settings/crew" className="text-primary text-[10px] ml-auto hover:underline" data-testid="link-manage-suppliers">Manage</a>
              </div>
            </div>
          ) : (
            <div className="border border-dashed rounded-lg p-2.5 text-center">
              <p className="text-xs text-muted-foreground">No suppliers yet</p>
              <a href="/settings/crew" className="text-primary text-[10px] hover:underline" data-testid="link-add-suppliers">Add suppliers in Crew Management</a>
            </div>
          )}
        </CardContent>
      )}

      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="send-order-dialog">
          <DialogHeader>
            <DialogTitle>Send Paint Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Send to Supplier</Label>
              {suppliersList.length > 0 ? (
                <select
                  value={selectedSupplierId || ''}
                  onChange={e => setSelectedSupplierId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full h-9 text-sm border rounded px-2 bg-background mt-1"
                  data-testid="select-supplier"
                >
                  <option value="">Select a supplier...</option>
                  {suppliersList.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">No suppliers saved. <a href="/settings/crew" className="text-primary hover:underline">Add in Crew Management</a></p>
              )}
            </div>

            {selectedSupplier && (
              <>
                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Text Message (SMS)</p>
                    <p className="text-xs text-muted-foreground">
                      {canSms
                        ? (selectedSupplier.phone ? `To: ${selectedSupplier.phone}` : 'No phone on file for this supplier')
                        : 'Phone not configured'}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={viaSms && canSms && !!selectedSupplier.phone}
                    onChange={e => setViaSms(e.target.checked)}
                    disabled={!canSms || !selectedSupplier.phone}
                    className="h-4 w-4"
                    data-testid="checkbox-order-sms"
                  />
                </div>

                {viaSms && canSms && selectedSupplier.phone && (
                  <div>
                    <Label className="text-xs">SMS Message</Label>
                    <Textarea
                      value={smsMessage}
                      onChange={e => setSmsMessage(e.target.value)}
                      rows={4}
                      className="text-sm mt-1"
                      data-testid="textarea-order-sms-message"
                    />
                  </div>
                )}

                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-xs text-muted-foreground">
                      {canEmail
                        ? (selectedSupplier.email ? `To: ${selectedSupplier.email}` : 'No email on file for this supplier')
                        : 'Email not configured'}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={viaEmail && canEmail && !!selectedSupplier.email}
                    onChange={e => setViaEmail(e.target.checked)}
                    disabled={!canEmail || !selectedSupplier.email}
                    className="h-4 w-4"
                    data-testid="checkbox-order-email"
                  />
                </div>

                {viaEmail && canEmail && selectedSupplier.email && (
                  <>
                    <div>
                      <Label className="text-xs">Subject</Label>
                      <Input
                        value={emailSubject}
                        onChange={e => setEmailSubject(e.target.value)}
                        className="h-8 text-sm mt-1"
                        data-testid="input-order-email-subject"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Email Body</Label>
                      <Textarea
                        value={emailBody}
                        onChange={e => setEmailBody(e.target.value)}
                        rows={6}
                        className="text-sm mt-1"
                        data-testid="textarea-order-email-body"
                      />
                    </div>
                  </>
                )}

                <Button
                  className="w-full"
                  onClick={() => {
                    if (pendingOrderId) sendMutation.mutate(pendingOrderId);
                  }}
                  disabled={
                    sendMutation.isPending ||
                    !pendingOrderId ||
                    ((!viaSms || !canSms || !selectedSupplier.phone) && (!viaEmail || !canEmail || !selectedSupplier.email))
                  }
                  data-testid="button-confirm-send-order"
                >
                  <Send className="w-4 h-4 mr-1.5" />
                  {sendMutation.isPending ? 'Sending...' : 'Send Paint Order'}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ColorSubmissionPanel({ projectId, colorSelections, selectedAreas }: { projectId: number; colorSelections: any[]; selectedAreas: string[] }) {
  const { toast } = useToast();
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [viaSms, setViaSms] = useState(true);
  const [viaEmail, setViaEmail] = useState(true);
  const [smsMessage, setSmsMessage] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const approvalRef = useRef<HTMLDivElement>(null);
  const scrolledToApproval = useRef(false);

  const handleCopyToClipboard = async (text: string) => {
    const { copyToClipboard } = await import("@/lib/clipboard");
    const ok = await copyToClipboard(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
    if (ok) {
      toast({ title: "Link copied!" });
    } else {
      toast({ title: "Link copied!" });
    }
  };

  const { data: settings } = useQuery<any>({ queryKey: ["/api/settings/company"] });

  const { data: submission, isLoading } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "color-submission"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/color-submission`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  useEffect(() => {
    if (scrolledToApproval.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') !== 'colors') return;
    if (!submission) return;
    scrolledToApproval.current = true;
    setTimeout(() => {
      approvalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  }, [submission]);

  const { data: projectData } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
  });

  const contactName = projectData?.contact?.name || 'there';
  const companyName = settings?.companyName || '';

  const canSms = !!(settings?.twilioAccountSid || settings?.twilioPhone);
  const canEmail = !!(settings?.googleEmail || settings?.smtpConnectedAt);

  const hasColors = colorSelections.some((s: any) => s.paintColorId || s.customColorName || s.customHex);
  const hasSelectedAreas = selectedAreas.length > 0;

  const autoSyncMutation = useMutation({
    mutationFn: async (areas: string[]) => {
      console.log(`[ColorSync] auto-sync sending ${areas.length} areas for project ${projectId}:`, areas);
      const res = await apiRequest("POST", `/api/projects/${projectId}/color-submission/auto-sync`, { selectedAreas: areas });
      const data = await res.json();
      console.log(`[ColorSync] auto-sync response:`, data?.id ? `submission #${data.id}` : 'null');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-submission"] });
    },
    onError: (err: any) => {
      console.error(`[ColorSync] auto-sync error:`, err?.message);
    },
  });

  const lastSyncRef = useRef<string>("");
  const initializedRef = useRef(false);
  useEffect(() => {
    const subStatus = submission?.status;
    const isLocked = subStatus === 'approved';
    const key = [...selectedAreas].sort().join('|') + '::' + colorSelections
      .filter((s: any) => selectedAreas.includes(s.area) && (s.paintColorId || s.customColorName || s.customHex))
      .map((s: any) => `${s.area}:${s.paintColorId || ''}:${s.customColorName || ''}:${s.customHex || ''}:${s.customImage || ''}`)
      .sort()
      .join('|');
    if (!initializedRef.current) {
      lastSyncRef.current = key;
      initializedRef.current = true;
      if (selectedAreas.length > 0 && !submission?.customerToken && !isSubmissionLoading && !isLocked) {
        autoSyncMutation.mutate(selectedAreas);
      }
      return;
    }
    if (key !== lastSyncRef.current && !isLocked) {
      lastSyncRef.current = key;
      autoSyncMutation.mutate(selectedAreas);
    }
  }, [colorSelections, selectedAreas]);

  const getSubmissionLink = () => {
    if (!submission?.customerToken) return '';
    if (settings?.customDomain && settings?.customDomainVerified) {
      return `https://${settings.customDomain}/color-review/${submission.customerToken}`;
    }
    return `${window.location.origin}/color-review/${submission.customerToken}`;
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      let sub = submission;
      if (!sub?.id) {
        const syncRes = await apiRequest("POST", `/api/projects/${projectId}/color-submission/auto-sync`, { selectedAreas });
        sub = await syncRes.json();
        if (!sub?.id) {
          const fetchRes = await fetch(`/api/projects/${projectId}/color-submission`, { credentials: "include" });
          if (fetchRes.ok) sub = await fetchRes.json();
        }
        if (!sub?.id) throw new Error("No submission created yet");
      }

      const sendRes = await apiRequest("POST", `/api/projects/${projectId}/color-submission/${sub.id}/send`, {
        viaSms: viaSms && canSms,
        viaEmail: viaEmail && canEmail,
        smsMessage: smsMessage || undefined,
        emailSubject: emailSubject || undefined,
        emailBody: emailBody || undefined,
      });
      return sendRes.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-submission"] });
      const methods = [];
      if (data.smsOk) methods.push('SMS');
      if (data.emailOk) methods.push('email');
      toast({ title: methods.length > 0 ? `Color selection sent via ${methods.join(' & ')}` : 'Color selection sent' });
      setSendDialogOpen(false);
    },
    onError: () => toast({ title: "Failed to send", variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!submission?.id) return;
      await apiRequest("POST", `/api/projects/${projectId}/color-submission/${submission.id}/contractor-approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-submission"] });
      toast({ title: "Colors approved" });
    },
    onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const reopenMutation = useMutation({
    mutationFn: async () => {
      if (!submission?.id) return;
      await apiRequest("POST", `/api/projects/${projectId}/color-submission/${submission.id}/reopen`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-submission"] });
      toast({ title: "Color selection reopened", description: "Customer can now continue selecting colors" });
    },
    onError: () => toast({ title: "Failed to reopen", variant: "destructive" }),
  });

  const [isSyncing, setIsSyncing] = useState(false);

  const [pendingOpenDialog, setPendingOpenDialog] = useState(false);

  useEffect(() => {
    if (pendingOpenDialog && submission?.customerToken) {
      setPendingOpenDialog(false);
      setIsSyncing(false);
      const link = getSubmissionLink();
      const deadlineStr = submission?.deadline ? new Date(submission.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
      const deadlineSms = deadlineStr ? ` To keep things running smoothly and avoid any delays, please submit by ${deadlineStr}.` : '';
      const deadlineEmail = deadlineStr ? `\n\nTo ensure your project stays on schedule and there are no delays, we kindly ask that you submit your selections by ${deadlineStr}.` : '';
      const needsCustomerChoices = !hasColors || selectedAreas.some(area => !colorSelections.some((s: any) => s.area === area && (s.paintColorId || s.customColorName || s.customHex)));
      if (needsCustomerChoices) {
        setSmsMessage(`Hi ${contactName}, we're ready to finalize colors for your project! Please use the link below to submit your color preferences.${deadlineSms}\n\n${link}`);
        setEmailSubject(`Action Needed: Color Selections for Your Project — ${companyName}`);
        setEmailBody(`Hi ${contactName},\n\nWe're excited to move forward with your project! To keep everything on track, we need your color selections. Please click the link below to choose your preferred colors for each room and surface.\n\n${link}${deadlineEmail}\n\nYou can type in your color choices or upload a photo of a paint swatch — whichever is easiest for you.\n\nThank you for your prompt attention,\n${companyName}`);
      } else {
        setSmsMessage(`Hi ${contactName}, your color selections are ready for review! Please take a moment to review and approve them so we can keep your project moving forward.${deadlineSms}\n\n${link}`);
        setEmailSubject(`Your Color Selections Are Ready for Approval — ${companyName}`);
        setEmailBody(`Hi ${contactName},\n\nGreat news — your color selections are ready for review! Please click the link below to look everything over and approve your choices so we can keep your project on schedule.\n\n${link}${deadlineEmail}\n\nOnce you're happy with the selections, simply approve them and we'll take it from there.\n\nThank you,\n${companyName}`);
      }
      setSendDialogOpen(true);
    }
  }, [pendingOpenDialog, submission]);

  const openSendDialog = async () => {
    if (!submission?.customerToken && hasSelectedAreas) {
      setIsSyncing(true);
      try {
        await apiRequest("POST", `/api/projects/${projectId}/color-submission/auto-sync`, { selectedAreas });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "color-submission"] });
        setPendingOpenDialog(true);
      } catch (err: any) {
        const msg = err?.message || "Failed to prepare submission";
        const cleanMsg = msg.replace(/^\d+:\s*/, '').replace(/^{.*"message":"/, '').replace(/".*$/, '');
        console.error('[ColorSync] openSendDialog error:', msg);
        toast({ title: cleanMsg || "Failed to prepare submission", variant: "destructive" });
        setIsSyncing(false);
      }
      return;
    }

    const link = getSubmissionLink();
    const deadlineStr2 = submission?.deadline ? new Date(submission.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
    const deadlineSms2 = deadlineStr2 ? ` To keep things running smoothly and avoid any delays, please submit by ${deadlineStr2}.` : '';
    const deadlineEmail2 = deadlineStr2 ? `\n\nTo ensure your project stays on schedule and there are no delays, we kindly ask that you submit your selections by ${deadlineStr2}.` : '';
    const needsCustomerChoices = !hasColors || selectedAreas.some(area => !colorSelections.some((s: any) => s.area === area && (s.paintColorId || s.customColorName || s.customHex)));
    if (needsCustomerChoices) {
      setSmsMessage(`Hi ${contactName}, we're ready to finalize colors for your project! Please use the link below to submit your color preferences.${deadlineSms2}\n\n${link}`);
      setEmailSubject(`Action Needed: Color Selections for Your Project — ${companyName}`);
      setEmailBody(`Hi ${contactName},\n\nWe're excited to move forward with your project! To keep everything on track, we need your color selections. Please click the link below to choose your preferred colors for each room and surface.\n\n${link}${deadlineEmail2}\n\nYou can type in your color choices or upload a photo of a paint swatch — whichever is easiest for you.\n\nThank you for your prompt attention,\n${companyName}`);
    } else {
      setSmsMessage(`Hi ${contactName}, your color selections are ready for review! Please take a moment to review and approve them so we can keep your project moving forward.${deadlineSms2}\n\n${link}`);
      setEmailSubject(`Your Color Selections Are Ready for Approval — ${companyName}`);
      setEmailBody(`Hi ${contactName},\n\nGreat news — your color selections are ready for review! Please click the link below to look everything over and approve your choices so we can keep your project on schedule.\n\n${link}${deadlineEmail2}\n\nOnce you're happy with the selections, simply approve them and we'll take it from there.\n\nThank you,\n${companyName}`);
    }
    setSendDialogOpen(true);
  };

  if (isLoading) return null;

  const status = submission?.status;
  const contractorApproved = submission?.contractorApproved;
  const customerApproved = submission?.customerApproved;
  const isSent = status === 'sent' || status === 'contractor_approved' || status === 'customer_approved' || status === 'customer_submitted' || status === 'approved';
  const submissionLink = getSubmissionLink();

  return (
    <>
      <Card className="mt-4" data-testid="color-submission-panel">
        <div className="px-3 py-2 bg-muted/30 border-b">
          <span className="text-sm font-medium">Color Submission</span>
        </div>
        <div className="p-3 space-y-3">
          {!isSent ? (
            <div className="flex flex-col gap-2">
              {!submission?.deadline && (
                <p className="text-[10px] text-red-500">Set a deadline in the Room Colors card above before sending</p>
              )}
              <Button
                size="sm"
                onClick={() => openSendDialog()}
                disabled={(!hasColors && !hasSelectedAreas) || isSyncing || !submission?.deadline}
                data-testid="button-open-send-dialog"
              >
                <Send className="w-4 h-4 mr-1" />
                {isSyncing ? 'Preparing...' : 'Send to Customer'}
              </Button>
            </div>
          ) : (
            <>
              <div ref={approvalRef} className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                  Sent
                </Badge>
                {contractorApproved && (
                  <Badge variant="default" className="text-xs">✓ You approved</Badge>
                )}
                {customerApproved && (
                  <Badge variant="default" className="text-xs">✓ Customer approved</Badge>
                )}
                {customerApproved && !contractorApproved && status !== 'approved' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs text-amber-600 hover:text-amber-700 px-2"
                    onClick={() => reopenMutation.mutate()}
                    disabled={reopenMutation.isPending}
                    data-testid="button-reopen-colors"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    {reopenMutation.isPending ? 'Reopening...' : 'Reopen'}
                  </Button>
                )}
                {status === 'approved' && (
                  <Badge className="text-xs bg-green-600">Fully Approved</Badge>
                )}
              </div>

              {contractorApproved && !customerApproved && status !== 'approved' && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-800">Waiting for customer to re-approve</p>
                    <p className="text-[10px] text-amber-600">You've approved — the customer needs to review your changes and approve again.</p>
                  </div>
                </div>
              )}

              {submission?.entries && submission.entries.length > 0 && submission.entries.some((e: any) => e.customerSubmitted) && (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Customer Selections</p>
                  {(() => {
                    const groupedByArea: Record<string, any[]> = {};
                    for (const e of submission.entries) {
                      if (!e.customerSubmitted && !(e.surfaceNote && e.surfaceNote.trim())) continue;
                      const area = e.colorGroupName || e.area || e.paintGroupKey || 'Other';
                      if (!groupedByArea[area]) groupedByArea[area] = [];
                      groupedByArea[area].push(e);
                    }
                    return Object.entries(groupedByArea).map(([area, entries]: [string, any[]]) => (
                      <div key={area} className="bg-muted/20 rounded-lg p-2 border">
                        <p className="text-xs font-semibold mb-1">{area}</p>
                        <div className="space-y-1">
                          {entries.map((e: any, i: number) => (
                            <div key={i} className="space-y-1">
                              <div className="flex items-center gap-2">
                                {e.hexColor && (
                                  <div className="w-5 h-5 rounded border shrink-0" style={{ backgroundColor: e.hexColor }} />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{e.colorName || 'Custom color'}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {[e.surfaceName, e.brand, e.finish].filter(Boolean).join(' · ')}
                                  </p>
                                </div>
                              </div>
                              {e.surfaceNote && (
                                <div className="ml-7 bg-background/50 rounded px-2 py-1 border border-border/50">
                                  <p className="text-[10px] text-muted-foreground uppercase font-medium mb-0.5">Surface Note</p>
                                  <p className="text-[11px] text-foreground">{e.surfaceNote}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {submission?.customerNote && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium mb-1">Customer Notes (from customer portal)</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">{submission.customerNote}</p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {!contractorApproved && status !== 'approved' && (
                  <Button
                    size="sm"
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending}
                    data-testid="button-contractor-approve"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Approve Colors
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={openSendDialog}
                  data-testid="button-resend-colors"
                >
                  <Send className="w-4 h-4 mr-1" />
                  Resend to Customer
                </Button>
              </div>

              {submission?.activityLog && submission.activityLog.length > 0 && (() => {
                // Only show meaningful milestones — skip noisy internal events
                // (submission_created, contractor_modified) so the log stays short.
                const KEY_ACTIONS = new Set([
                  'sent_to_customer',
                  'customer_submitted_colors',
                  'customer_approved',
                  'contractor_approved',
                  'change_requested',
                  'reopened',
                ]);
                const filtered = (submission.activityLog as Array<{ action: string; timestamp: string; actor?: string; note?: string }>)
                  .filter((log: any) => KEY_ACTIONS.has(log.action));
                if (filtered.length === 0) return null;
                const labels: Record<string, string> = {
                  sent_to_customer: 'Sent to customer',
                  customer_submitted_colors: 'Customer submitted colors',
                  customer_approved: 'Customer approved',
                  contractor_approved: 'Contractor approved',
                  change_requested: 'Change requested',
                  reopened: 'Reopened for customer',
                };
                // Newest first — the most recent entry is the last item in the array.
                const ordered = [...filtered].reverse();
                const latest = ordered[0];
                const renderEntry = (log: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs" data-testid={`activity-entry-${i}`}>
                    <Clock className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <span className="font-medium">{labels[log.action] || log.action}</span>
                      {log.note && <span className="text-muted-foreground"> — {log.note}</span>}
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(log.timestamp).toLocaleDateString()} at {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
                return (
                <div className="mt-2 pt-2 border-t" data-testid="color-activity-log">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium mb-1.5">Activity</p>
                  <div className="space-y-1">
                    {renderEntry(latest, 0)}
                  </div>
                  {ordered.length > 1 && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 mt-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setActivityModalOpen(true)}
                        data-testid="button-show-all-activity"
                      >
                        Show all activity ({ordered.length})
                      </Button>
                      <Dialog open={activityModalOpen} onOpenChange={setActivityModalOpen}>
                        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Activity history</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3 pt-2" data-testid="color-activity-log-full">
                            {ordered.map((log: any, i: number) => renderEntry(log, i))}
                          </div>
                          <div className="flex justify-end pt-3 border-t mt-2">
                            <Button
                              size="sm"
                              onClick={() => setActivityModalOpen(false)}
                              data-testid="button-close-activity-modal"
                            >
                              Done
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </>
                  )}
                </div>
                );
              })()}
            </>
          )}
        </div>
      </Card>

      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send Color Selection</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" data-testid="send-color-dialog">
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className="flex-1">
                <p className="text-sm font-medium">Text Message (SMS)</p>
                <p className="text-xs text-muted-foreground">{canSms ? 'Send via your phone number' : 'Phone not configured'}</p>
              </div>
              <input
                type="checkbox"
                checked={viaSms && canSms}
                onChange={e => setViaSms(e.target.checked)}
                disabled={!canSms}
                className="h-4 w-4"
                data-testid="checkbox-sms"
              />
            </div>

            {viaSms && canSms && (
              <div>
                <Label className="text-xs">SMS Message</Label>
                <Textarea
                  value={smsMessage}
                  onChange={e => setSmsMessage(e.target.value)}
                  rows={3}
                  className="text-sm mt-1"
                  data-testid="textarea-sms-message"
                />
              </div>
            )}

            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className="flex-1">
                <p className="text-sm font-medium">Email</p>
                <p className="text-xs text-muted-foreground">{canEmail ? 'Send via email' : 'Email not configured'}</p>
              </div>
              <input
                type="checkbox"
                checked={viaEmail && canEmail}
                onChange={e => setViaEmail(e.target.checked)}
                disabled={!canEmail}
                className="h-4 w-4"
                data-testid="checkbox-email"
              />
            </div>

            {viaEmail && canEmail && (
              <>
                <div>
                  <Label className="text-xs">Subject</Label>
                  <Input
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    className="h-8 text-sm mt-1"
                    data-testid="input-email-subject"
                  />
                </div>
                <div>
                  <Label className="text-xs">Email Body</Label>
                  <Textarea
                    value={emailBody}
                    onChange={e => setEmailBody(e.target.value)}
                    rows={5}
                    className="text-sm mt-1"
                    data-testid="textarea-email-body"
                  />
                </div>
              </>
            )}

            <Button
              className="w-full"
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending || ((!viaSms || !canSms) && (!viaEmail || !canEmail))}
              data-testid="button-confirm-send"
            >
              <Send className="w-4 h-4 mr-1.5" />
              {sendMutation.isPending ? 'Sending...' : 'Send Color Selection'}
            </Button>

            <div className="relative">
              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 border-t" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 border-t" />
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => { if (submissionLink) handleCopyToClipboard(submissionLink); }}
                disabled={!submissionLink}
                data-testid="button-copy-link-dialog"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 mr-1.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-1.5" />
                    Copy Link Instead
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}

function PhotoShareSmsButton({ phone, shareUrl, companyName }: { phone: string; shareUrl: string; companyName: string }) {
  const { mutate: sendSms } = useSendSms();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  return (
    <div className="p-3 border rounded-lg space-y-2">
      <div className="flex items-center gap-3">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Text Message</span>
        <span className="text-xs text-muted-foreground ml-auto">{phone}</span>
      </div>
      <button
        type="button"
        disabled={sending}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
        onClick={() => {
          setSending(true);
          const message = `${companyName ? companyName + ": " : ""}Here are the project photos: ${shareUrl}`;
          sendSms({ to: normalizePhone(phone), body: message }, {
            onSuccess: () => { setSending(false); toast({ title: "Photos sent via text!" }); },
            onError: (err: any) => { setSending(false); toast({ title: "Failed to send text", description: err.message, variant: "destructive" }); },
          });
        }}
        data-testid="button-photo-share-sms"
      >
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
        Send via Text
      </button>
    </div>
  );
}

function PhotoShareEmailButton({ email, contactName, shareUrl, companyName }: { email: string; contactName: string; shareUrl: string; companyName: string }) {
  const { mutate: sendEmail } = useSendEmail();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  return (
    <div className="p-3 border rounded-lg space-y-2">
      <div className="flex items-center gap-3">
        <Mail className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Email</span>
        <span className="text-xs text-muted-foreground ml-auto truncate max-w-[140px]">{email}</span>
      </div>
      <button
        type="button"
        disabled={sending}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
        onClick={() => {
          setSending(true);
          sendEmail({
            to: email,
            subject: `${companyName || "Your contractor"} shared project photos with you`,
            body: `Hi ${contactName || "there"},\n\nHere are photos from your project. You can view them anytime using the link below:\n\n${shareUrl}\n\nThank you,\n${companyName || "Your contractor"}`,
            fromName: companyName || undefined,
            ctaText: "View Photos",
            ctaUrl: shareUrl,
          }, {
            onSuccess: () => { setSending(false); toast({ title: "Photos sent via email!" }); },
            onError: (err: any) => { setSending(false); toast({ title: "Failed to send email", description: err.message, variant: "destructive" }); },
          });
        }}
        data-testid="button-photo-share-email"
      >
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
        Send via Email
      </button>
    </div>
  );
}

/**
 * Banner that explains WHY the user landed on this project page when they
 * tapped a "Needs Your Attention" push notification. Reads `?attentionReason=`
 * from the URL, shows a short human-readable line, and removes both itself
 * and the query param when dismissed. Renders nothing when the param is absent.
 */
function AttentionReasonBanner() {
  const [reasonParam, setReasonParam] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("attentionReason");
  });
  const [dismissed, setDismissed] = useState(false);

  // Re-read on URL change (back/forward, in-app nav between project pages).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      const p = new URLSearchParams(window.location.search).get("attentionReason");
      setReasonParam(p);
      setDismissed(false);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    // Strip the query param from the URL so a refresh or back-nav doesn't
    // re-trigger the banner. Preserve any other existing query keys.
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("attentionReason");
        const newSearch = url.searchParams.toString();
        const newPath = url.pathname + (newSearch ? `?${newSearch}` : "") + url.hash;
        window.history.replaceState({}, "", newPath);
      } catch {}
    }
  };

  if (!reasonParam || dismissed) return null;

  // Keep these labels matched to shared/attention.ts AttentionType union.
  const labelMap: Record<string, { label: string; hint: string }> = {
    low_sentiment:    { label: "Customer seems unhappy",  hint: "Review the latest messages and reach out to smooth things over." },
    reminder:         { label: "Reminder due",            hint: "A reminder on this project is overdue or coming up in the next 24 hours." },
    paused:           { label: "Automation paused",       hint: "Automated follow-ups are paused. Resume them when you're ready." },
    needs_scheduling: { label: "Needs scheduling",        hint: "The proposal was accepted but no work dates are on the calendar yet." },
    idle:             { label: "Going stale",             hint: "This project hasn't moved in a while. A nudge to the customer could help." },
  };
  const entry = labelMap[reasonParam] || { label: "Needs your attention", hint: "Tap reviewed when you've handled this." };

  return (
    <div
      className="border-t pt-2 mt-2"
      data-testid="banner-attention-reason"
    >
      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 p-3 flex items-start gap-3">
        <div className="p-1.5 rounded-md bg-amber-500/10 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100" data-testid="text-attention-reason-label">
            {entry.label}
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
            {entry.hint}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0 text-amber-700 hover:text-amber-900 dark:text-amber-300"
          onClick={dismiss}
          data-testid="button-dismiss-attention-reason"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function ProjectDetail({ id }: { id: number }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const handleBack = useSafeBack("/projects");
  const { user } = useAuth();
  const { maskName, maskPhone, maskEmail, maskAddress, maskCity, maskProjectTitle } = useDemoMode();
  const userTier = user?.subscriptionTier || 'starter';
  const { data: userCaps } = useQuery<{ role: string | null; isOwner: boolean }>({
    queryKey: ['/api/user/capabilities'],
    staleTime: 60000,
  });
  const isFieldWorker = userCaps ? (userCaps.role === 'laborer' || userCaps.role === 'crew_lead') && !userCaps.isOwner : false;
  const { setHidden: setNavHidden } = useMobileNavVisibility();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab && ['activity', 'documents', 'photos', 'timelog', 'receipts', 'colors', 'workorder'].includes(tab)) {
        return tab;
      }
    }
    return "activity";
  });
  const [noteText, setNoteText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [expandedTranscripts, setExpandedTranscripts] = useState<Set<number>>(new Set());
  const [editNoteText, setEditNoteText] = useState("");
  const [plExpanded, setPlExpanded] = useState(false);
  const [litePlExpanded, setLitePlExpanded] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCallConfirm, setShowCallConfirm] = useState(false);
  const [showOpenPhoneCallDialog, setShowOpenPhoneCallDialog] = useState(false);
  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('openSchedule') === '1';
    }
    return false;
  });
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [deferredNotification, setDeferredNotification] = useState<{
    automationId: number;
    templateSlug: string;
    nextBusinessWindow: string;
  } | null>(null);
  const [sendReviewRequest, setSendReviewRequest] = useState(true);
  const [appointmentType, setAppointmentType] = useState("site_visit");
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState(getNearestQuarterTime());
  const [appointmentNotes, setAppointmentNotes] = useState("");
  const [appointmentNotify, setAppointmentNotify] = useState(true);
  const [appointmentAssignee, setAppointmentAssignee] = useState<number | null>(null);
  const [createDocType, setCreateDocType] = useState<string | null>(null);
  const [schedStartDate, setSchedStartDate] = useState("");
  const [schedStartTime, setSchedStartTime] = useState("08:00");
  const [schedEndDate, setSchedEndDate] = useState("");
  const [schedEndTime, setSchedEndTime] = useState("17:00");
  const [schedIncludeSat, setSchedIncludeSat] = useState(false);
  const [schedIncludeSun, setSchedIncludeSun] = useState(false);
  const [schedStartCalOpen, setSchedStartCalOpen] = useState(false);
  const [schedEndCalOpen, setSchedEndCalOpen] = useState(false);
  const [schedNotifyCustomer, setSchedNotifyCustomer] = useState(true);
  const [workDays, setWorkDays] = useState<Array<{ date: string; startTime: string; endTime: string; notes: string }>>([]);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const SCHEDULE_TIME_OPTIONS = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const h = hour.toString().padStart(2, "0");
        const m = minute.toString().padStart(2, "0");
        const value = `${h}:${m}`;
        const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        const ampm = hour < 12 ? "AM" : "PM";
        const label = `${hour12}:${m} ${ampm}`;
        opts.push({ value, label });
      }
    }
    return opts;
  }, []);

  const generateWorkDays = (startDate: string, endDate: string, clockIn: string, clockOut: string, includeSat: boolean, includeSun: boolean) => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const dayCount = differenceInCalendarDays(end, start);
    if (dayCount < 0 || dayCount > 90) return [];
    const generated: Array<{ date: string; startTime: string; endTime: string; notes: string }> = [];
    for (let i = 0; i <= dayCount; i++) {
      const d = addDays(start, i);
      const dow = d.getDay();
      if (dow === 0 && !includeSun) continue;
      if (dow === 6 && !includeSat) continue;
      generated.push({ date: format(d, "yyyy-MM-dd"), startTime: clockIn, endTime: clockOut, notes: "" });
    }
    return generated;
  };

  const snapTo15Min = (time: string, fallback: string): string => {
    if (!time) return fallback;
    const parts = time.split(":");
    if (parts.length < 2) return fallback;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
    const snapped = Math.round(m / 15) * 15;
    const finalM = snapped >= 60 ? 0 : snapped;
    const finalH = Math.min(snapped >= 60 ? h + 1 : h, 23);
    return `${finalH.toString().padStart(2, "0")}:${finalM.toString().padStart(2, "0")}`;
  };
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLostDialog, setShowLostDialog] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ProjectExpenseWithPhotos | null>(null);
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseCategoryCustom, setExpenseCategoryCustom] = useState(false);
  const [expenseVendor, setExpenseVendor] = useState("");
  const [expenseReceiptDate, setExpenseReceiptDate] = useState("");
  const [scanningReceipt, setScanningReceipt] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<any[] | null>(null);
  const [expandedExpenseId, setExpandedExpenseId] = useState<number | null>(null);
  const [expandedLaborId, setExpandedLaborId] = useState<number | null>(null);
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showTimeEntryDialog, setShowTimeEntryDialog] = useState(false);
  const [timeEntryMemberId, setTimeEntryMemberId] = useState(""); // legacy single-select (kept for back-compat refs)
  const [timeEntryMemberIds, setTimeEntryMemberIds] = useState<number[]>([]); // bulk multi-select
  const [timeEntryDate, setTimeEntryDate] = useState("");
  const [timeEntryHours, setTimeEntryHours] = useState("");
  const [timeEntryStartTime, setTimeEntryStartTime] = useState("08:00");
  const [timeEntryEndTime, setTimeEntryEndTime] = useState("16:00");
  // Ad-hoc one-time worker fields (Elite). Defaults are 0 — owner types exact paid rates.
  const [timeEntryAdHocOpen, setTimeEntryAdHocOpen] = useState(false);
  const [timeEntryAdHocName, setTimeEntryAdHocName] = useState("");
  const [timeEntryAdHocRate, setTimeEntryAdHocRate] = useState("");
  const [timeEntryAdHocBurden, setTimeEntryAdHocBurden] = useState("0");
  const [timeEntryAdHocWc, setTimeEntryAdHocWc] = useState("0");
  const [timeEntryAdHocBenefits, setTimeEntryAdHocBenefits] = useState("0");
  const [timeEntryAdHocSaveToTeam, setTimeEntryAdHocSaveToTeam] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [showStopFollowupsConfirm, setShowStopFollowupsConfirm] = useState(false);
  const openResumeRef = useRef<(() => void) | null>(null);
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [reminderType, setReminderType] = useState("call");
  const [reminderNote, setReminderNote] = useState("");
  const [showAddRecipientDialog, setShowAddRecipientDialog] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientMode, setRecipientMode] = useState<'manual' | 'contact'>('manual');
  const [recipientContactId, setRecipientContactId] = useState<number | null>(null);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientCity, setRecipientCity] = useState("");
  const [recipientState, setRecipientState] = useState("");
  const [recipientZip, setRecipientZip] = useState("");
  const [useClientAddress, setUseClientAddress] = useState(false);
  const [saveAsContact, setSaveAsContact] = useState(false);

  const { data: project, isLoading, isError: projectError, refetch: refetchProject } = useQuery<ProjectWithDetails>({
    queryKey: ["/api/projects", id],
    placeholderData: () => {
      const pipeline = queryClient.getQueryData<{ projects: any[] }>(["/api/dashboard/pipeline"]);
      const fromPipeline = pipeline?.projects?.find((p: any) => p.id === id);
      if (fromPipeline) return fromPipeline;
      const list = queryClient.getQueryData<any[]>(["/api/projects", { archived: false }]);
      return list?.find((p: any) => p.id === id);
    },
  });

  const { data: projectPhotos = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", id, "photos"],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/projects/${id}/photos`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === "photos",
  });
  const [projectPhotoEditing, setProjectPhotoEditing] = useState<{ photo: any; documentId: number } | null>(null);
  const projEditSessionRef = useRef(0);
  const [projectPhotoViewing, setProjectPhotoViewing] = useState<{ index: number; documentId: number } | null>(null);
  const [photoSelectMode, setPhotoSelectMode] = useState(false);
  const [photoSelectedIds, setPhotoSelectedIds] = useState<Set<string>>(new Set());
  const [photoSharing, setPhotoSharing] = useState(false);
  const [photoShareUrl, setPhotoShareUrl] = useState<string | null>(null);
  const [photoShareDialog, setPhotoShareDialog] = useState(false);
  const [photoLinkCopied, setPhotoLinkCopied] = useState(false);
  const [photoShareDocId, setPhotoShareDocId] = useState<number>(0);
  const [projectCameraOpen, setProjectCameraOpen] = useState(false);
  const [projectPhotoUploading, setProjectPhotoUploading] = useState(false);
  const projectPhotoFileRef = useRef<HTMLInputElement>(null);
  const projectCameraCaptureCount = useRef(0);
  const [pendingPhotos, setPendingPhotos] = useState<Array<{ tempId: string; blobUrl: string; fileName: string; createdAt: string; uploaded?: boolean }>>([]);
  const pendingPhotosRef = useRef(pendingPhotos);
  pendingPhotosRef.current = pendingPhotos;
  const uploadProgress = useUploadProgress();
  const activeBatchRef = useRef<string | null>(null);
  useNavigationGuard(useCallback(() => pendingPhotosRef.current.some(p => !p.uploaded), []), "Photos are still uploading. Please keep the app open until the upload is complete.");
  useEffect(() => {
    return () => {
      pendingPhotosRef.current.forEach(p => URL.revokeObjectURL(p.blobUrl));
    };
  }, []);

  useEffect(() => {
    const handleVisChange = () => {
      if (document.visibilityState !== 'visible') return;
      const hasPending = pendingPhotosRef.current.some(p => !p.uploaded);
      if (hasPending) return;
      const docId = primaryDocIdRef.current;
      if (!docId) return;
      (async () => {
        const queued = await getPendingUploads();
        const mine = queued.filter(q => q.documentId === docId);
        if (mine.length === 0) return;
        for (const item of mine) {
          const file = new File([item.blob], item.fileName, { type: item.mimeType });
          const blobUrl = URL.createObjectURL(file);
          setPendingPhotos(prev => {
            if (prev.some(p => p.tempId === item.id)) return prev;
            return [{ tempId: item.id, blobUrl, fileName: item.fileName, createdAt: item.createdAt }, ...prev];
          });
          try {
            const result = await projectUploadFile(file);
            if (result) {
              await addProjectPhotoMutation.mutateAsync({ fileName: item.fileName, storageKey: result.objectPath, sortOrder: 0, documentId: docId });
              await removePendingUpload(item.id);
              setPendingPhotos(prev => prev.map(p => p.tempId === item.id ? { ...p, uploaded: true } : p));
            }
          } catch {
            setPendingPhotos(prev => prev.filter(p => p.tempId !== item.id));
            URL.revokeObjectURL(blobUrl);
          }
        }
      })();
    };
    document.addEventListener('visibilitychange', handleVisChange);
    return () => document.removeEventListener('visibilitychange', handleVisChange);
  }, []);

  const { uploadFile: projectUploadFile } = useUpload({});

  const primaryDocIdRef = useRef<number | undefined>();

  const addProjectPhotoMutation = useMutation({
    mutationFn: async (data: { fileName: string; storageKey: string; sortOrder: number; documentId?: number }) => {
      if (data.documentId) {
        const res = await apiRequest("POST", `/api/documents/${data.documentId}/photos`, { fileName: data.fileName, storageKey: data.storageKey, sortOrder: data.sortOrder });
        return res.json();
      } else {
        const res = await apiRequest("POST", `/api/projects/${id}/photos`, { fileName: data.fileName, storageKey: data.storageKey, sortOrder: data.sortOrder });
        return res.json();
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "photos"] });
      if (variables.documentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/documents", variables.documentId, "photos"] });
      }
    },
  });

  const retryRanRef = useRef(false);

  const handleProjectFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const docId = primaryDocIdRef.current;
    if (!files || files.length === 0) return;
    setProjectPhotoUploading(true);

    const tempEntries: Array<{ tempId: string; blobUrl: string; fileName: string; file: File }> = [];
    for (let i = 0; i < files.length; i++) {
      const compressed = await compressImage(files[i]);
      const tempId = `pending-${crypto.randomUUID()}`;
      const blobUrl = URL.createObjectURL(compressed);
      tempEntries.push({ tempId, blobUrl, fileName: compressed.name, file: compressed });
    }
    setPendingPhotos(prev => [...tempEntries.map(e => ({ tempId: e.tempId, blobUrl: e.blobUrl, fileName: e.fileName, createdAt: new Date().toISOString() })), ...prev]);
    const projectLabel = project?.contact?.name ? `${project.contact.name}'s project` : `Project #${id}`;
    const batchId = uploadProgress.startBatch(Number(id), projectLabel, tempEntries.length);
    activeBatchRef.current = batchId;

    for (const entry of tempEntries) {
      try {
        if (docId) {
          await savePendingUpload({ id: entry.tempId, documentId: docId, fileName: entry.fileName, file: entry.file, createdAt: new Date().toISOString() });
        }
        const result = await projectUploadFile(entry.file);
        if (result) {
          await addProjectPhotoMutation.mutateAsync({
            fileName: entry.fileName,
            storageKey: result.objectPath,
            sortOrder: 0,
            ...(docId ? { documentId: docId } : {}),
          });
          if (docId) {
            await removePendingUpload(entry.tempId);
          }
          setPendingPhotos(prev => prev.map(p => p.tempId === entry.tempId ? { ...p, uploaded: true } : p));
          uploadProgress.markCompleted(batchId);
        } else {
          throw new Error("Upload returned no result");
        }
      } catch (err: any) {
        toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
        setPendingPhotos(prev => prev.filter(p => p.tempId !== entry.tempId));
        URL.revokeObjectURL(entry.blobUrl);
        uploadProgress.markFailed(batchId);
      }
    }
    setProjectPhotoUploading(false);
    if (projectPhotoFileRef.current) projectPhotoFileRef.current.value = "";
    setTimeout(() => {
      setPendingPhotos(prev => {
        const done = prev.filter(p => p.uploaded);
        done.forEach(p => URL.revokeObjectURL(p.blobUrl));
        return prev.filter(p => !p.uploaded);
      });
    }, 2000);
    if (docId) {
      const remaining = await getPendingUploads();
      if (remaining.filter(r => r.documentId === docId).length === 0) {
        notifyUploadsComplete(tempEntries.length);
      }
    }
  };

  const handleProjectCameraCapture = useCallback(async (blob: Blob) => {
    const docId = primaryDocIdRef.current;
    projectCameraCaptureCount.current += 1;
    const n = projectCameraCaptureCount.current;
    const ts = new Date();
    const fileName = `Photo ${ts.toLocaleDateString("en-US", { month: "short", day: "numeric" })} #${n}.jpg`;
    const file = await compressBlob(blob, fileName);
    const tempId = `pending-cam-${crypto.randomUUID()}`;
    const blobUrl = URL.createObjectURL(blob);
    setPendingPhotos(prev => [{ tempId, blobUrl, fileName, createdAt: new Date().toISOString() }, ...prev]);
    let camBatchId = activeBatchRef.current;
    if (!camBatchId) {
      const projectLabel = project?.contact?.name ? `${project.contact.name}'s project` : `Project #${id}`;
      camBatchId = uploadProgress.startBatch(Number(id), projectLabel, 1);
      activeBatchRef.current = camBatchId;
    } else {
      uploadProgress.incrementTotal(camBatchId);
    }
    const currentBatchId = camBatchId;
    try {
      if (docId) {
        await savePendingUpload({ id: tempId, documentId: docId, fileName, file, createdAt: new Date().toISOString() });
      }
      const result = await projectUploadFile(file);
      if (result) {
        await addProjectPhotoMutation.mutateAsync({
          fileName,
          storageKey: result.objectPath,
          sortOrder: 0,
          ...(docId ? { documentId: docId } : {}),
        });
        if (docId) {
          await removePendingUpload(tempId);
          const remaining = await getPendingUploads();
          if (remaining.filter(r => r.documentId === docId).length === 0) {
            notifyUploadsComplete(1);
          }
        }
        setPendingPhotos(prev => prev.map(p => p.tempId === tempId ? { ...p, uploaded: true } : p));
        uploadProgress.markCompleted(currentBatchId);
      } else {
        throw new Error("Upload returned no result");
      }
      setTimeout(() => {
        setPendingPhotos(prev => {
          const target = prev.find(p => p.tempId === tempId && p.uploaded);
          if (target) URL.revokeObjectURL(target.blobUrl);
          return prev.filter(p => p.tempId !== tempId || !p.uploaded);
        });
      }, 2000);
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
      setPendingPhotos(prev => prev.filter(p => p.tempId !== tempId));
      URL.revokeObjectURL(blobUrl);
      uploadProgress.markFailed(currentBatchId);
    }
  }, [projectUploadFile, addProjectPhotoMutation, toast, project, id, uploadProgress]);

  const exitPhotoSelectMode = () => {
    setPhotoSelectMode(false);
    setPhotoSelectedIds(new Set());
  };

  const togglePhotoSelected = (key: string) => {
    setPhotoSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const { data: projectSourcePhotos = [] } = useQuery<{ source: string; url: string; date: string; contactName?: string }[]>({
    queryKey: ["/api/projects", id, "source-photos"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${id}/source-photos`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === "photos",
  });

  const docFlatPhotos = projectPhotos.flatMap((group: any) =>
    group.photos.map((photo: any) => ({
      ...photo,
      documentId: group.document.id,
      documentTitle: group.document.title,
      documentType: group.document.type,
      _isSource: false,
      _dateStr: photo.createdAt ? new Date(photo.createdAt).toISOString().split("T")[0] : "unknown",
      _sourceLabel: "Uploaded",
    }))
  );

  const sourceAsFlat = (projectSourcePhotos || []).map((sp: any, i: number) => ({
    id: -(i + 1),
    fileName: `Photo ${i + 1}`,
    storageKey: sp.url,
    caption: null,
    annotations: null,
    annotatedStorageKey: null,
    documentId: 0,
    documentTitle: sp.source === 'message' ? 'Customer Message' : 'Form Submission',
    documentType: 'source',
    _isSource: true,
    _sourceUrl: sp.url,
    _dateStr: sp.date || "unknown",
    _sourceLabel: sp.source === 'message' ? 'From Text Message' : 'From Form Submission',
    _sourceType: sp.source,
  }));

  const pendingAsFlat = pendingPhotos.map((p) => ({
    id: p.tempId,
    fileName: p.fileName,
    storageKey: p.blobUrl,
    caption: null,
    annotations: null,
    annotatedStorageKey: null,
    documentId: 0,
    documentTitle: "",
    documentType: "pending",
    _isSource: false,
    _isPending: true,
    uploaded: !!p.uploaded,
    _dateStr: p.createdAt ? new Date(p.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
    _sourceLabel: p.uploaded ? "Uploaded" : "Uploading",
    createdAt: p.createdAt,
  }));

  const docPhotoUrls = new Set(docFlatPhotos.map((p: any) => p.storageKey));
  const dedupedSourceFlat = sourceAsFlat.filter((sp: any) => !docPhotoUrls.has(sp.storageKey));
  const allFlatPhotosBase = [...pendingAsFlat, ...dedupedSourceFlat, ...docFlatPhotos];
  const allBaseUrls = new Set(allFlatPhotosBase.map((p: any) => p.storageKey));

  const proposalDocIds = new Set(
    projectPhotos
      .map((g: any) => g.document.id)
  );

  useEffect(() => {
    setNavHidden(!!(projectPhotoViewing || projectPhotoEditing));
    return () => setNavHidden(false);
  }, [projectPhotoViewing, projectPhotoEditing, setNavHidden]);
  const { uploadFile: uploadProjectPhoto } = useUpload({
    onError: (error) => toast({ title: "Upload failed", description: error.message, variant: "destructive" }),
  });

  const { data: nextAutomation } = useQuery<{ next: { slug: string; label: string; category: string; scheduledFor: string } | null }>({
    queryKey: ["/api/projects", id, "next-automation"],
  });

  const { data: projectDocuments, isLoading: docsLoading } = useQuery<(Document & { contact: Contact })[]>({
    queryKey: ["/api/documents", "project", id],
    queryFn: async () => {
      const res = await fetch(`/api/documents?projectId=${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    enabled: !!project,
  });

  const companyCamProjectId = (projectDocuments || []).find((d: any) => d.companyCamProjectId)?.companyCamProjectId;
  const companyCamDocId = (projectDocuments || []).find((d: any) => d.companyCamProjectId)?.id;
  const { data: ccSettings } = useCompanySettings();
  const companyCamConnected = !!(ccSettings as any)?.companyCamApiToken;
  const { data: companyCamPhotos = [] } = useQuery<any[]>({
    queryKey: ["/api/companycam/projects", companyCamProjectId, "photos"],
    queryFn: async () => {
      const res = await fetch(`/api/companycam/projects/${companyCamProjectId}/photos`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: companyCamConnected && !!companyCamProjectId && activeTab === "photos",
    staleTime: 5 * 60 * 1000,
  });

  const ccText = (v: any): string | null => {
    if (v == null) return null;
    if (typeof v === "string") return v || null;
    if (typeof v === "object") return v.plain_text_content || v.text || v.content || null;
    return null;
  };
  const companyCamAsFlat = companyCamPhotos.map((p: any) => {
    const ccCaption = ccText(p.description) || ccText(p.caption) || null;
    const uri = p.uris?.find((u: any) => u.type === "medium")?.uri || p.uris?.find((u: any) => u.type === "original")?.uri || p.uris?.[0]?.uri;
    const dateStr = p.captured_at ? new Date(p.captured_at * 1000).toISOString().split("T")[0] : p.created_at ? new Date(p.created_at).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
    return {
      id: `cc-${p.id}`,
      fileName: ccCaption || `CompanyCam photo`,
      storageKey: uri || "",
      caption: ccCaption,
      annotations: null,
      annotatedStorageKey: null,
      documentId: companyCamDocId || 0,
      documentTitle: "CompanyCam",
      documentType: "companycam",
      _isSource: false,
      _isPending: false,
      _isCompanyCam: true,
      _dateStr: dateStr,
      _sourceLabel: "CompanyCam",
      createdAt: p.created_at || new Date().toISOString(),
    };
  }).filter((p: any) => p.storageKey);

  const areaPhotosFlat = (projectDocuments || []).flatMap((doc: any) => {
    const blocks = doc.content?.productionRateBlocks || [];
    const docLabel = doc.title || `${doc.type} #${doc.id}`;
    return blocks.flatMap((block: any) => {
      const rooms = block.roomBuilderData?.rooms || [];
      return rooms.flatMap((room: any) => {
        if (!room.photos?.length) return [];
        return room.photos.filter((p: any) => p.url && !p.uploading).map((photo: any, i: number) => {
          let hash = 0;
          const s = `${doc.id}-${room.name || ''}-${photo.url}-${i}`;
          for (let c = 0; c < s.length; c++) { hash = ((hash << 5) - hash + s.charCodeAt(c)) | 0; }
          return {
          id: hash < 0 ? hash : -(hash + 10000),
          fileName: `${room.name || 'Area'} photo ${i + 1}`,
          storageKey: photo.url,
          caption: null,
          annotations: photo.annotations || null,
          annotatedStorageKey: null,
          documentId: doc.id,
          documentTitle: docLabel,
          documentType: doc.type,
          _isSource: true,
          _isAreaPhoto: true,
          _areaPhotoUrl: photo.url,
          _areaShowOnProposal: photo.showOnProposal === true,
          _sourceUrl: photo.url,
          _dateStr: photo.timestamp ? new Date(photo.timestamp).toISOString().split("T")[0] : "unknown",
          _sourceLabel: docLabel,
        };});
      });
    });
  });
  const dedupedAreaPhotos = areaPhotosFlat.filter((ap: any) => !allBaseUrls.has(ap.storageKey));
  const allBaseAndAreaUrls = new Set([...allBaseUrls, ...dedupedAreaPhotos.map((p: any) => p.storageKey)]);
  const dedupedCompanyCam = companyCamAsFlat.filter((cp: any) => !allBaseAndAreaUrls.has(cp.storageKey));
  const allFlatPhotos = [...allFlatPhotosBase, ...dedupedAreaPhotos, ...dedupedCompanyCam].sort((a: any, b: any) => (b._dateStr || "").localeCompare(a._dateStr || ""));

  const projectPhotoDateGroups: { dateStr: string; label: string; items: any[] }[] = [];
  for (const item of allFlatPhotos) {
    const last = projectPhotoDateGroups[projectPhotoDateGroups.length - 1];
    if (last && last.dateStr === item._dateStr) {
      last.items.push(item);
    } else {
      const label = (!item._dateStr || item._dateStr === "unknown") ? "Unknown date" : (() => {
        try { return new Date(item._dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return item._dateStr; }
      })();
      projectPhotoDateGroups.push({ dateStr: item._dateStr, label, items: [item] });
    }
  }

  const primaryDocId = projectDocuments?.[0]?.id;
  primaryDocIdRef.current = primaryDocId;

  useEffect(() => {
    if (!primaryDocId || retryRanRef.current) return;
    retryRanRef.current = true;
    let cancelled = false;
    (async () => {
      await checkStaleUploads();
      const queued = await getPendingUploads();
      const mine = queued.filter(q => q.documentId === primaryDocId);
      if (mine.length === 0 || cancelled) return;
      let uploaded = 0;
      for (const item of mine) {
        if (cancelled) break;
        const file = new File([item.blob], item.fileName, { type: item.mimeType });
        const tempId = item.id;
        const blobUrl = URL.createObjectURL(file);
        setPendingPhotos(prev => {
          if (prev.some(p => p.tempId === tempId)) return prev;
          return [{ tempId, blobUrl, fileName: item.fileName, createdAt: item.createdAt }, ...prev];
        });
        try {
          const result = await projectUploadFile(file);
          if (result) {
            await addProjectPhotoMutation.mutateAsync({ fileName: item.fileName, storageKey: result.objectPath, sortOrder: 0, documentId: primaryDocId });
            await removePendingUpload(tempId);
            uploaded++;
            setPendingPhotos(prev => prev.map(p => p.tempId === tempId ? { ...p, uploaded: true } : p));
          } else {
            setPendingPhotos(prev => prev.filter(p => p.tempId !== tempId));
            URL.revokeObjectURL(blobUrl);
          }
        } catch {
          setPendingPhotos(prev => prev.filter(p => p.tempId !== tempId));
          URL.revokeObjectURL(blobUrl);
        }
      }
      if (uploaded > 0) {
        const remaining = await getPendingUploads();
        if (remaining.filter(r => r.documentId === primaryDocId).length === 0) {
          notifyUploadsComplete(uploaded);
        }
      }
      setTimeout(() => {
        setPendingPhotos(prev => {
          const done = prev.filter(p => p.uploaded);
          done.forEach(p => URL.revokeObjectURL(p.blobUrl));
          return prev.filter(p => !p.uploaded);
        });
      }, 2000);
    })();
    return () => { cancelled = true; };
  }, [primaryDocId]);

  const proposalHiddenPhotoIds = new Set<number>();
  for (const doc of (projectDocuments || [])) {
    const hidden: number[] = (doc.content as any)?.hiddenDocumentPhotoIds || [];
    for (const hid of hidden) proposalHiddenPhotoIds.add(hid);
  }

  const { mutate: updateDocForPhoto } = useUpdateDocument();

  const togglePhotoProposalVisibility = (photoId: number, documentId: number) => {
    const targetDocId = documentId > 0 ? documentId : primaryDocId;
    if (!targetDocId) return;
    const doc = (projectDocuments || []).find((d: any) => d.id === targetDocId);
    if (!doc) return;
    const content = { ...(doc.content as any) };
    const current: number[] = content.hiddenDocumentPhotoIds || [];
    if (current.includes(photoId)) {
      content.hiddenDocumentPhotoIds = current.filter((hid: number) => hid !== photoId);
    } else {
      content.hiddenDocumentPhotoIds = [...current, photoId];
    }
    queryClient.setQueryData(
      ["/api/documents", "project", id],
      (old: any) => old?.map((d: any) => d.id === targetDocId ? { ...d, content } : d)
    );
    updateDocForPhoto({ id: targetDocId, data: { content } });
  };

  const toggleAreaPhotoProposalVisibility = (photoUrl: string, documentId: number) => {
    const doc = (projectDocuments || []).find((d: any) => d.id === documentId);
    if (!doc) return;
    const content = JSON.parse(JSON.stringify(doc.content || {}));
    const blocks = content.productionRateBlocks || [];
    let found = false;
    for (const block of blocks) {
      const rooms = block.roomBuilderData?.rooms || [];
      for (const room of rooms) {
        if (!room.photos?.length) continue;
        for (const photo of room.photos) {
          if (photo.url === photoUrl) {
            photo.showOnProposal = !photo.showOnProposal;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) return;
    queryClient.setQueryData(
      ["/api/documents", "project", id],
      (old: any) => old?.map((d: any) => d.id === documentId ? { ...d, content } : d)
    );
    updateDocForPhoto({ id: documentId, data: { content } });
  };

  const toggleCompanyCamPhotoVisibility = (photoUrl: string) => {
    const targetDocId = companyCamDocId || primaryDocId;
    if (!targetDocId) return;
    const doc = (projectDocuments || []).find((d: any) => d.id === targetDocId);
    if (!doc) return;
    const content = { ...(doc.content as any) };
    const current: string[] = content.includedCompanyCamPhotos || [];
    if (current.includes(photoUrl)) {
      content.includedCompanyCamPhotos = current.filter((u: string) => u !== photoUrl);
    } else {
      content.includedCompanyCamPhotos = [...current, photoUrl];
    }
    queryClient.setQueryData(
      ["/api/documents", "project", id],
      (old: any) => old?.map((d: any) => d.id === targetDocId ? { ...d, content } : d)
    );
    updateDocForPhoto({ id: targetDocId, data: { content } });
  };

  const includedCompanyCamUrls = new Set<string>(
    (projectDocuments || []).flatMap((d: any) =>
      (d.content as any)?.includedCompanyCamPhotos || []
    )
  );

  const { data: contactComms } = useQuery<Communication[]>({
    queryKey: ["/api/communications", project?.contactId],
    queryFn: async () => {
      const res = await fetch(`/api/communications?contactId=${project!.contactId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch communications");
      return res.json();
    },
    enabled: !!project?.contactId,
  });

  const { data: contactAppointments = [] } = useQuery<any[]>({
    queryKey: ["/api/appointments", { contactId: project?.contactId }],
    queryFn: async () => {
      const res = await fetch(`/api/appointments?contactId=${project!.contactId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!project?.contactId,
  });

  const { data: projectRecipientsList = [] } = useQuery<ProjectRecipient[]>({
    queryKey: ["/api/projects", id, "recipients"],
    enabled: !!project,
  });

  const { data: contactProjects } = useQuery<any[]>({
    queryKey: ["/api/projects", { contactId: project?.contactId }],
    queryFn: async () => {
      const res = await fetch(`/api/projects?contactId=${project!.contactId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch contact projects");
      return res.json();
    },
    enabled: !!project?.contactId,
  });
  const otherProjectsCount = contactProjects ? contactProjects.filter((p: any) => p.id !== Number(id)).length : 0;

  const { data: allContacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: showAddRecipientDialog && recipientMode === 'contact',
  });

  const addRecipientMutation = useMutation({
    mutationFn: async (data: { name: string; email?: string; phone?: string; contactId?: number | null; address?: string; city?: string; state?: string; zipCode?: string }) => {
      const res = await fetch(`/api/projects/${id}/recipients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "recipients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/project-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/project-thread", Number(id)] });
      setShowAddRecipientDialog(false);
      setRecipientName('');
      setRecipientEmail('');
      setRecipientPhone('');
      setRecipientContactId(null);
      setRecipientAddress('');
      setRecipientCity('');
      setRecipientState('');
      setRecipientZip('');
      setUseClientAddress(false);
      setSaveAsContact(false);
      setRecipientMode('manual');
      if (data.matchedExisting) {
        toast({ title: "Recipient added", description: "Linked to an existing contact." });
      } else {
        toast({ title: "Recipient added" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add recipient", description: err.message, variant: "destructive" });
    },
  });

  const removeRecipientMutation = useMutation({
    mutationFn: async (recipientId: number) => {
      const res = await fetch(`/api/projects/${id}/recipients/${recipientId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error("Failed to remove");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "recipients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/project-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/project-thread", Number(id)] });
      toast({ title: "Recipient removed" });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: async (payload: string | { stage: string; sendReviewRequest?: boolean }) => {
      const body = typeof payload === 'string' ? { stage: payload } : payload;
      const res = await apiRequest("PUT", `/api/projects/${id}`, body);
      return { stage: body.stage, data: await res.json() };
    },
    onSuccess: ({ stage: newStage, data }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (newStage === "completed") {
        toast({ title: "Project completed", description: "Completion notifications sent to contacts." });
      } else {
        toast({ title: "Stage updated" });
      }
      if (data?.notificationDeferred) {
        setDeferredNotification(data.notificationDeferred);
      }
    },
  });

  const updateLeadQualityMutation = useMutation({
    mutationFn: async (leadQuality: string | null) => {
      return apiRequest("PUT", `/api/projects/${id}`, { leadQuality });
    },
    onMutate: async (leadQuality: string | null) => {
      await queryClient.cancelQueries({ queryKey: ["/api/projects", id] });
      const previous = queryClient.getQueryData<ProjectWithDetails>(["/api/projects", id]);
      queryClient.setQueryData(["/api/projects", id], (old: any) =>
        old ? { ...old, leadQuality } : old
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/projects", id], context.previous);
      }
      toast({ title: "Failed to update lead quality", variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Lead quality updated" });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `/api/projects/${id}/activities`, {
        content,
        type: "note",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      setNoteText("");
      toast({ title: "Note added" });
    },
  });

  const editNoteMutation = useMutation({
    mutationFn: async ({ activityId, content }: { activityId: number; content: string }) => {
      return apiRequest("PUT", `/api/projects/${id}/activities/${activityId}`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      setEditingNoteId(null);
      setEditNoteText("");
      toast({ title: "Note updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save note", description: err.message, variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (activityId: number) => {
      return apiRequest("DELETE", `/api/projects/${id}/activities/${activityId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project deleted" });
      setLocation("/projects");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/projects/${id}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project archived" });
      setShowArchiveConfirm(false);
      setLocation("/projects");
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/projects/${id}/unarchive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project restored" });
    },
  });

  const setReminderMutation = useMutation({
    mutationFn: async (data: { reminderAt: string; reminderType: string; reminderNote: string }) => {
      return apiRequest("POST", `/api/projects/${id}/reminder`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      setShowReminderDialog(false);
      toast({ title: "Reminder set" });
    },
  });

  const clearReminderMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/projects/${id}/reminder`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      toast({ title: "Reminder cleared" });
    },
  });

  const requestReviewMutation = useMutation({
    mutationFn: async (type: 'in_progress' | 'completed') => {
      return apiRequest("POST", `/api/projects/${id}/request-review`, { type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/activities`] });
      setShowReviewDialog(false);
      toast({ title: "Review request sent!" });
    },
    onError: (err: any) => {
      toast({ title: err.message || "Failed to send review request", variant: "destructive" });
    },
  });

  const makeCallMutation = useMakeCall();
  const { data: companySettings } = useCompanySettings();
  const isOpenPhoneProvider = companySettings?.phoneProvider === 'openphone';
  const isOpenPhoneConfigured = isOpenPhoneProvider && !!companySettings?.openphonePhoneNumber;
  const isTwilioConfigured = !isOpenPhoneProvider && !!companySettings?.twilioAccountSid && !!companySettings?.twilioAuthToken && !!companySettings?.twilioPhoneNumber;
  const hasInAppMessaging = userTier === 'elite' && (isTwilioConfigured || isOpenPhoneConfigured);
  const hasOfficePhone = !!companySettings?.twilioOfficePhone;

  const handleCallAction = () => {
    if (!project?.contact?.phone) {
      toast({ title: "No phone number", description: "This contact doesn't have a phone number yet.", variant: "destructive" });
      return;
    }
    if (isOpenPhoneProvider) {
      setShowOpenPhoneCallDialog(true);
    } else if (isTwilioConfigured) {
      setShowCallConfirm(true);
    } else {
      window.location.href = `tel:${project.contact.phone}`;
    }
  };

  const createAppointmentMutation = useMutation({
    mutationFn: async (data: { contactId: number; type: string; date: string; time?: string; notes?: string; sendNotification?: boolean; assignedToId?: number | null }) => {
      await apiRequest("POST", "/api/appointments", data);
      const dateStr = format(new Date(data.date + "T00:00:00"), "MMM d, yyyy");
      const timeStr = data.time ? ` at ${data.time}` : "";
      const typeLabel = data.type.charAt(0).toUpperCase() + data.type.slice(1);
      let note = `${typeLabel} appointment scheduled for ${dateStr}${timeStr}`;
      if (data.notes) note += ` — ${data.notes}`;
      await apiRequest("POST", `/api/projects/${id}/activities`, {
        content: note,
        type: "appointment",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/activities`] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/conversation-contacts"] });
      toast({ title: "Appointment scheduled" });
      setShowAppointmentDialog(false);
      setAppointmentType("proposal");
      setAppointmentDate("");
      setAppointmentTime(getNearestQuarterTime());
      setAppointmentNotes("");
      setAppointmentAssignee(null);
    },
  });

  const scheduleProjectMutation = useMutation({
    mutationFn: async (data: { scheduledDate: string; scheduledTime: string; scheduledEndDate: string; scheduledEndTime: string; notifyCustomer: boolean }) => {
      const res = await apiRequest("PUT", `/api/projects/${id}`, {
        scheduledDate: data.scheduledDate,
        scheduledTime: data.scheduledTime,
        scheduledEndDate: data.scheduledEndDate,
        scheduledEndTime: data.scheduledEndTime,
        stage: "scheduled",
        notifyCustomer: data.notifyCustomer,
      });
      const result = await res.json();
      const startStr = format(new Date(data.scheduledDate + "T00:00:00"), "MMM d, yyyy");
      const endStr = format(new Date(data.scheduledEndDate + "T00:00:00"), "MMM d, yyyy");
      await apiRequest("POST", `/api/projects/${id}/activities`, {
        content: `Project scheduled: ${startStr} ${data.scheduledTime} — ${endStr} ${data.scheduledEndTime}`,
        type: "stage_change",
      });
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "schedule-dates"] });
      toast({ title: "Project scheduled" });
      setShowScheduleDialog(false);
      setSchedIncludeSat(false);
      setSchedIncludeSun(false);
      setWorkDays([]);
      if (result?.notificationDeferred) {
        setDeferredNotification(result.notificationDeferred);
      }
    },
  });

  const { data: existingScheduleDates = [] } = useQuery<JobScheduleDate[]>({
    queryKey: ["/api/projects", id, "schedule-dates"],
    enabled: !!id,
  });

  const { data: workedDates = [] } = useQuery<string[]>({
    queryKey: ["/api/projects", id, "schedule-dates", "worked-dates"],
    enabled: !!id && showScheduleDialog,
  });

  const addWorkDaysMutation = useMutation({
    mutationFn: async (dates: Array<{ date: string; startTime?: string; endTime?: string; notes?: string }>) => {
      await apiRequest("POST", `/api/projects/${id}/schedule-dates`, { dates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "schedule-dates"] });
      setWorkDays([]);
    },
  });

  const deleteScheduleDateMutation = useMutation({
    mutationFn: async (dateId: number) => {
      const res = await apiRequest("DELETE", `/api/projects/${id}/schedule-dates/${dateId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete schedule date");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "schedule-dates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "schedule-dates", "worked-dates"] });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const { data: jobCosting } = useQuery<{ totalMaterials: number; totalLabor: number; totalCosts: number; totalLaborMinutes: number; expenseCount: number; crewCount: number; timeEntryCount: number; missingRateMembers?: string[]; overheadAllocation?: number; overheadPerHour?: number; isSnapshot?: boolean; snapshotAt?: string }>({
    queryKey: ["/api/projects", id, "job-costing"],
    enabled: !!project && userTier === 'elite',
  });

  type LitePnL = { revenue: number; materialsAndReceipts: number; manualLaborCostCents: number | null; netProfit: number; margin: number };
  type ManualLaborEntryRow = { id: number; projectId: number; userId: string; workDate: string; amountCents: number; note: string | null; createdAt: string | null };
  type ManualLaborResponse = { entries: ManualLaborEntryRow[]; totalCents: number };
  type ManualLaborMutationResponse = { entry: ManualLaborEntryRow; entries: ManualLaborEntryRow[]; totalCents: number; pnl: LitePnL };
  type ManualLaborDeleteResponse = { entries: ManualLaborEntryRow[]; totalCents: number; pnl: LitePnL };

  const { data: litePnl } = useQuery<LitePnL>({
    queryKey: ["/api/projects", id, "lite-pnl"],
    enabled: !!project && userTier === 'core',
  });

  const { data: manualLabor } = useQuery<ManualLaborResponse>({
    queryKey: ["/api/projects", id, "manual-labor"],
    enabled: !!project && userTier === 'core',
  });

  const manualLaborEntries: ManualLaborEntryRow[] = manualLabor?.entries ?? [];
  const storedLaborCents: number | null = useMemo(() => {
    if (manualLabor && typeof manualLabor.totalCents === 'number') {
      return manualLabor.totalCents > 0 ? manualLabor.totalCents : null;
    }
    return litePnl?.manualLaborCostCents ?? null;
  }, [manualLabor, litePnl]);

  const todayIso = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);
  const [newLaborDate, setNewLaborDate] = useState<string>(todayIso);
  const [newLaborAmount, setNewLaborAmount] = useState<string>("");
  const [newLaborNote, setNewLaborNote] = useState<string>("");
  const [showLaborDialog, setShowLaborDialog] = useState(false);
  const [confirmDeleteLaborId, setConfirmDeleteLaborId] = useState<number | null>(null);
  const [confirmDeleteExpenseId, setConfirmDeleteExpenseId] = useState<number | null>(null);

  const addLaborEntryMutation = useMutation<ManualLaborMutationResponse, Error, { workDate: string; amountCents: number; note: string | null }>({
    mutationFn: async (vars) => {
      const res = await apiRequest("POST", `/api/projects/${id}/manual-labor`, vars);
      return (await res.json()) as ManualLaborMutationResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "lite-pnl"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "manual-labor"] });
      setNewLaborAmount("");
      setNewLaborNote("");
      setNewLaborDate(todayIso);
      setShowLaborDialog(false);
    },
    onError: (err) => {
      toast({ title: "Couldn't add labor entry", description: err.message, variant: "destructive" });
    },
  });

  const deleteLaborEntryMutation = useMutation<ManualLaborDeleteResponse, Error, number, { prev: ManualLaborResponse | undefined; prevPnl: LitePnL | undefined }>({
    mutationFn: async (entryId) => {
      const res = await apiRequest("DELETE", `/api/projects/${id}/manual-labor/${entryId}`);
      return (await res.json()) as ManualLaborDeleteResponse;
    },
    onMutate: async (entryId) => {
      await queryClient.cancelQueries({ queryKey: ["/api/projects", id, "manual-labor"] });
      await queryClient.cancelQueries({ queryKey: ["/api/projects", id, "lite-pnl"] });
      const prev = queryClient.getQueryData<ManualLaborResponse>(["/api/projects", id, "manual-labor"]);
      const prevPnl = queryClient.getQueryData<LitePnL>(["/api/projects", id, "lite-pnl"]);
      if (prev) {
        const removed = prev.entries.find(e => e.id === entryId);
        const remaining = prev.entries.filter(e => e.id !== entryId);
        const newTotal = Math.max(0, prev.totalCents - (removed?.amountCents ?? 0));
        queryClient.setQueryData<ManualLaborResponse>(["/api/projects", id, "manual-labor"], { entries: remaining, totalCents: newTotal });
        if (prevPnl) {
          const netProfit = (prevPnl.revenue || 0) - (prevPnl.materialsAndReceipts || 0) - newTotal;
          const margin = prevPnl.revenue > 0 ? (netProfit / prevPnl.revenue) * 100 : 0;
          queryClient.setQueryData<LitePnL>(["/api/projects", id, "lite-pnl"], { ...prevPnl, manualLaborCostCents: newTotal > 0 ? newTotal : null, netProfit, margin });
        }
      }
      return { prev, prevPnl };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/projects", id, "manual-labor"], ctx.prev);
      if (ctx?.prevPnl) queryClient.setQueryData(["/api/projects", id, "lite-pnl"], ctx.prevPnl);
      toast({ title: "Couldn't delete labor entry", description: err.message, variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "lite-pnl"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "manual-labor"] });
    },
  });

  const submitLaborEntry = useCallback(() => {
    const trimmed = newLaborAmount.trim();
    if (trimmed === "") return;
    const parsed = parseFloat(trimmed.replace(/,/g, ""));
    if (isNaN(parsed) || parsed <= 0) {
      toast({ title: "Enter a valid amount", description: "Amount must be greater than zero.", variant: "destructive" });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newLaborDate)) {
      toast({ title: "Invalid date", description: "Pick a valid work date.", variant: "destructive" });
      return;
    }
    addLaborEntryMutation.mutate({
      workDate: newLaborDate,
      amountCents: Math.round(parsed * 100),
      note: newLaborNote.trim() === "" ? null : newLaborNote.trim(),
    });
  }, [newLaborAmount, newLaborDate, newLaborNote, addLaborEntryMutation, toast]);

  const handleReceiptFile = useCallback(async (file: File) => {
    setReceiptFile(file);
    if (userTier === 'core') {
      toast({ title: "Receipt attached", description: "Saved with this expense. Fill in the details below." });
      return;
    }
    setScanningReceipt(true);
    const progressMessages = ["Reading receipt...", "Extracting details...", "Detecting vendor...", "Identifying items...", "Almost done..."];
    let msgIdx = 0;
    setScanProgress(progressMessages[0]);
    const progressInterval = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, progressMessages.length - 1);
      setScanProgress(progressMessages[msgIdx]);
    }, 2500);
    try {
      const formData = new FormData();
      formData.append("receipt", file);
      const res = await fetch("/api/ai/scan-receipt", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Scan failed");
      const data = await res.json();
      if (data.title) setExpenseTitle(data.title);
      if (data.amount != null) setExpenseAmount((data.amount / 100).toFixed(2));
      if (data.vendor) setExpenseVendor(data.vendor);
      if (data.category) {
        const presets = ["Materials", "Paint & Supplies", "Equipment Rental", "Subcontractor", "Travel/Gas", "Permits", "Dump/Disposal", "Food/Meals", "Other"];
        setExpenseCategory(data.category);
        setExpenseCategoryCustom(!presets.includes(data.category));
      }
      if (data.description) setExpenseDescription(data.description);
      if (data.receiptDate) setExpenseReceiptDate(data.receiptDate);
      toast({ title: "Receipt scanned", description: "Fields auto-filled from receipt" });
    } catch {
      toast({ title: "Scan failed", description: "Could not read receipt. Please fill in manually.", variant: "destructive" });
    } finally {
      clearInterval(progressInterval);
      setScanningReceipt(false);
      setScanProgress("");
    }
  }, [userTier, toast]);

  const { data: materialsSummary = [] } = useQuery<{
    paintGroupKey: string;
    label: string;
    totalPaintableSqft: number;
    colorName?: string;
    finish?: string;
    brand?: string;
    itemNames: string[];
    gallonsExact: number;
    gallonsToBuy: number;
    materialName: string;
    materialConfigured: boolean;
    coverage: number;
    waste: number;
  }[]>({
    queryKey: ["/api/projects", id, "materials-summary"],
    enabled: !!project,
  });

  const { data: crewAssignments = [] } = useQuery<CrewAssignmentWithMember[]>({
    queryKey: ["/api/projects", id, "crew"],
    enabled: activeTab === "costing" || activeTab === "work-order",
  });

  const { data: allTeamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const { data: crewGroups = [] } = useQuery<{ id: number; name: string; memberIds: number[] }[]>({
    queryKey: ["/api/crew-groups"],
    enabled: activeTab === "costing",
  });

  const { data: expenses = [] } = useQuery<ProjectExpenseWithPhotos[]>({
    queryKey: ["/api/projects", id, "expenses"],
    enabled: activeTab === "costing",
  });

  const { data: pendingReceipts = [] } = useQuery<{
    id: number; projectId: number; userId: string; fileName: string; storageKey: string;
    status: string; title: string | null; amount: number | null; vendor: string | null;
    category: string | null; paidByWorker: boolean | null; workerReimbursementAmount: number | null;
    submitterName: string; createdAt: string;
  }[]>({
    queryKey: ["/api/projects", id, "pending-receipts"],
    staleTime: 30000,
  });

  const { data: timeEntries = [] } = useQuery<TimeEntryWithMember[]>({
    queryKey: [`/api/time-entries?projectId=${id}`],
    enabled: activeTab === "costing",
  });

  const crewQueryKey = ["/api/projects", id, "crew"];

  const addCrewMutation = useMutation({
    mutationFn: async (teamMemberId: number) => {
      return apiRequest("POST", `/api/projects/${id}/crew`, { teamMemberId });
    },
    onMutate: async (teamMemberId: number) => {
      await queryClient.cancelQueries({ queryKey: crewQueryKey });
      const prev = queryClient.getQueryData<CrewAssignmentWithMember[]>(crewQueryKey);
      const member = allTeamMembers.find(m => m.id === teamMemberId);
      if (member) {
        queryClient.setQueryData<CrewAssignmentWithMember[]>(crewQueryKey, (old = []) => [
          ...old,
          { id: -Date.now(), projectId: parseInt(id!), teamMemberId, teamMember: member, userId: '' } as CrewAssignmentWithMember,
        ]);
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(crewQueryKey, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: crewQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "job-costing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "lite-pnl"] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'work-order'] });
    },
    onSuccess: () => {
      toast({ title: "Crew member added" });
    },
  });

  const addCrewGroupMutation = useMutation({
    mutationFn: async (memberIds: number[]) => {
      const assignedIds = new Set(crewAssignments.map(a => a.teamMemberId));
      const newIds = memberIds.filter(mid => !assignedIds.has(mid));
      let added = 0;
      for (const tmId of newIds) {
        try {
          await apiRequest("POST", `/api/projects/${id}/crew`, { teamMemberId: tmId });
          added++;
        } catch {}
      }
      return added;
    },
    onMutate: async (memberIds: number[]) => {
      await queryClient.cancelQueries({ queryKey: crewQueryKey });
      const prev = queryClient.getQueryData<CrewAssignmentWithMember[]>(crewQueryKey);
      const assignedIds = new Set(crewAssignments.map(a => a.teamMemberId));
      const newMembers = memberIds
        .filter(mid => !assignedIds.has(mid))
        .map(mid => allTeamMembers.find(m => m.id === mid))
        .filter(Boolean) as TeamMember[];
      if (newMembers.length > 0) {
        queryClient.setQueryData<CrewAssignmentWithMember[]>(crewQueryKey, (old = []) => [
          ...old,
          ...newMembers.map((member, i) => ({
            id: -(Date.now() + i), projectId: parseInt(id!), teamMemberId: member.id, teamMember: member, userId: '',
          } as CrewAssignmentWithMember)),
        ]);
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(crewQueryKey, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: crewQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "job-costing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "lite-pnl"] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'work-order'] });
    },
    onSuccess: (count) => {
      if (count === 0) {
        toast({ title: "All group members already assigned" });
      } else {
        toast({ title: `${count} crew member${count !== 1 ? 's' : ''} added from group` });
      }
    },
  });

  const removeCrewMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      return apiRequest("DELETE", `/api/crew-assignments/${assignmentId}`);
    },
    onMutate: async (assignmentId: number) => {
      await queryClient.cancelQueries({ queryKey: crewQueryKey });
      const prev = queryClient.getQueryData<CrewAssignmentWithMember[]>(crewQueryKey);
      queryClient.setQueryData<CrewAssignmentWithMember[]>(crewQueryKey, (old = []) =>
        old.filter(a => a.id !== assignmentId)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(crewQueryKey, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: crewQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "job-costing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "lite-pnl"] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'work-order'] });
    },
    onSuccess: () => {
      toast({ title: "Crew member removed" });
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: async (data: { title: string; amount: number; description?: string; category?: string; vendor?: string; receiptDate?: string; receiptImage?: File }) => {
      const { receiptImage, ...fields } = data;
      const formData = new FormData();
      formData.append("title", fields.title);
      formData.append("amount", String(fields.amount));
      if (fields.description) formData.append("description", fields.description);
      if (fields.category) formData.append("category", fields.category);
      if (fields.vendor) formData.append("vendor", fields.vendor);
      if (fields.receiptDate) formData.append("receiptDate", fields.receiptDate);
      if (receiptImage) formData.append("receiptImage", receiptImage);
      const res = await fetch(`/api/projects/${id}/expenses`, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error(await res.text() || "Failed to create expense");
      return res.json();
    },
    onSuccess: (result: any) => {
      setShowExpenseDialog(false);
      setExpenseTitle("");
      setExpenseAmount("");
      setExpenseDescription("");
      setExpenseCategory("");
      setExpenseCategoryCustom(false);
      setExpenseVendor("");
      setExpenseReceiptDate("");
      setReceiptFile(null);
      if (result?.possibleDuplicates?.length > 0) {
        setDuplicateWarning(result.possibleDuplicates);
        toast({ title: "Expense added", description: "Possible duplicate detected — check the warning below.", variant: "destructive" });
      } else {
        toast({ title: "Expense saved" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "job-costing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "lite-pnl"] });
    },
    onError: () => {
      toast({ title: "Failed to save expense", variant: "destructive" });
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: async ({ expenseId, data }: { expenseId: number; data: { title: string; amount: number; description?: string; category?: string; vendor?: string; receiptDate?: string } }) => {
      return apiRequest("PATCH", `/api/expenses/${expenseId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "job-costing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "lite-pnl"] });
      setShowExpenseDialog(false);
      setEditingExpense(null);
      setExpenseTitle("");
      setExpenseAmount("");
      setExpenseDescription("");
      setExpenseCategory("");
      setExpenseCategoryCustom(false);
      setExpenseVendor("");
      setExpenseReceiptDate("");
      toast({ title: "Expense updated" });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: number) => {
      return apiRequest("DELETE", `/api/expenses/${expenseId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "job-costing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "lite-pnl"] });
      toast({ title: "Expense deleted" });
    },
  });

  const approveReceiptMutation = useMutation({
    mutationFn: async (receiptId: number) => {
      return apiRequest("POST", `/api/projects/${id}/receipts/${receiptId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "pending-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "job-costing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "lite-pnl"] });
      toast({ title: "Receipt approved", description: "Expense created from receipt" });
    },
    onError: (err: any) => {
      toast({ title: "Approval failed", description: err.message || "Could not approve receipt", variant: "destructive" });
    },
  });

  const rejectReceiptMutation = useMutation({
    mutationFn: async (receiptId: number) => {
      return apiRequest("POST", `/api/projects/${id}/receipts/${receiptId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "pending-receipts"] });
      toast({ title: "Receipt rejected" });
    },
  });

  const removeExpenseImageMutation = useMutation({
    mutationFn: async (expenseId: number) => {
      await apiRequest("PATCH", `/api/expenses/${expenseId}`, { receiptImageUrl: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "expenses"] });
      toast({ title: "Receipt image removed" });
    },
  });

  const timeEntryQueryKey = `/api/time-entries?projectId=${id}`;

  // Single mutation handles three modes:
  //  - bulk team-member entries (teamMemberIds: number[])
  //  - single team-member entry (teamMemberId)  [legacy]
  //  - one ad-hoc worker entry (adHocWorkerName + locked rates)
  const createTimeEntryMutation = useMutation({
    mutationFn: async (data: {
      teamMemberIds?: number[];
      teamMemberId?: number;
      projectId: number;
      clockIn: string;
      clockOut: string;
      totalMinutes: number;
      adHocWorkerName?: string;
      adHocHourlyRateCents?: number;
      adHocPayrollBurden?: number;
      adHocWorkersComp?: number;
      adHocBenefitsPerHour?: number;
      saveAdHocToTeam?: boolean;
    }) => {
      return apiRequest("POST", "/api/time-entries", data);
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: [timeEntryQueryKey] });
      const prev = queryClient.getQueryData<TimeEntryWithMember[]>([timeEntryQueryKey]);
      const ids = data.teamMemberIds && data.teamMemberIds.length > 0
        ? data.teamMemberIds
        : (data.teamMemberId ? [data.teamMemberId] : []);
      const optimisticBase = {
        projectId: parseInt(id!), userId: '',
        clockIn: new Date(data.clockIn), clockOut: new Date(data.clockOut),
        totalMinutes: data.totalMinutes, notes: null, clockInLat: null, clockInLng: null,
        clockOutLat: null, clockOutLng: null,
        lockedPayrollBurden: null, lockedWorkersComp: null, lockedBenefitsPerHour: null,
        editedAt: null, editedBy: null, editReason: null, originalMinutes: null,
        adHocWorkerName: null,
      } as any;
      if (ids.length > 0) {
        queryClient.setQueryData<TimeEntryWithMember[]>([timeEntryQueryKey], (old = []) => {
          const additions: TimeEntryWithMember[] = [];
          for (const tmId of ids) {
            const member = allTeamMembers.find(m => m.id === tmId);
            if (!member) continue;
            additions.push({
              ...optimisticBase,
              id: -(Date.now() + tmId),
              teamMemberId: tmId,
              lockedHourlyRate: member.hourlyRate || null,
              teamMember: member,
            } as TimeEntryWithMember);
          }
          return [...old, ...additions];
        });
      } else if (data.adHocWorkerName) {
        queryClient.setQueryData<TimeEntryWithMember[]>([timeEntryQueryKey], (old = []) => [
          ...old,
          {
            ...optimisticBase,
            id: -Date.now(),
            teamMemberId: null,
            adHocWorkerName: data.adHocWorkerName!,
            lockedHourlyRate: data.adHocHourlyRateCents ?? 0,
            lockedPayrollBurden: String(data.adHocPayrollBurden ?? 0),
            lockedWorkersComp: String(data.adHocWorkersComp ?? 0),
            lockedBenefitsPerHour: String(data.adHocBenefitsPerHour ?? 0),
            teamMember: null,
          } as TimeEntryWithMember,
        ]);
      }
      // Reset dialog state
      setTimeEntryMemberId("");
      setTimeEntryMemberIds([]);
      setTimeEntryDate("");
      setTimeEntryHours("");
      setTimeEntryAdHocOpen(false);
      setTimeEntryAdHocName("");
      setTimeEntryAdHocRate("");
      setTimeEntryAdHocBurden("0");
      setTimeEntryAdHocWc("0");
      setTimeEntryAdHocBenefits("0");
      setTimeEntryAdHocSaveToTeam(false);
      setShowTimeEntryDialog(false);
      const count = ids.length || 1;
      toast({ title: count > 1 ? `${count} time entries added` : "Time entry added" });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([timeEntryQueryKey], ctx.prev);
      toast({ title: "Failed to add time entry", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: [timeEntryQueryKey] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "job-costing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "lite-pnl"] });
      // If we saved ad-hoc to team, refresh the team-members list too
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
    },
  });

  const deleteTimeEntryMutation = useMutation({
    mutationFn: async (entryId: number) => {
      return apiRequest("DELETE", `/api/time-entries/${entryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: [`/api/time-entries?projectId=${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "job-costing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "lite-pnl"] });
      toast({ title: "Time entry removed" });
    },
  });

  const availableCrewMembers = useMemo(() => {
    const assignedIds = new Set(crewAssignments.map(a => a.teamMemberId));
    return allTeamMembers.filter(m => ["crew", "lead", "helper", "mechanic"].includes(m.role) && m.isActive && !assignedIds.has(m.id));
  }, [allTeamMembers, crewAssignments]);

  const { data: djFiles = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", id, "dripjobs-files"],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/projects/${id}/dripjobs-files`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!project,
  });

  const docs = useMemo(() => {
    if (!projectDocuments) return [];
    return projectDocuments;
  }, [projectDocuments]);

  const recentComms = useMemo(() => {
    if (!contactComms) return [];
    return contactComms.slice(0, 20);
  }, [contactComms]);

  if (isLoading && !project) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto text-center py-12 space-y-4">
        <p className="text-muted-foreground">{projectError ? "Couldn't load project. Please try again." : "Project not found"}</p>
        <div className="flex items-center justify-center gap-3">
          {projectError && (
            <Button onClick={() => refetchProject()} data-testid="button-retry-project">
              Try Again
            </Button>
          )}
          <Button variant="outline" onClick={() => setLocation("/projects")}>
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-3">
      <AttentionContextBanner />
      {userTier === 'core' && project && (() => {
        const revenue = litePnl?.revenue ?? (project.totalAmount || 0);
        const materials = litePnl?.materialsAndReceipts ?? 0;
        const manualLabor = storedLaborCents ?? 0;
        const profit = litePnl ? litePnl.netProfit : revenue - materials - manualLabor;
        const margin = litePnl ? litePnl.margin : (revenue > 0 ? (profit / revenue) * 100 : 0);
        const isPositive = profit >= 0;
        const profitFormatted = (profit / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

        return (
          <Card data-testid="pl-summary-card-lite">
            <button
              className="w-full flex items-center justify-between gap-3 p-4 text-left"
              onClick={() => setLitePlExpanded(!litePlExpanded)}
              data-testid="button-toggle-pl-lite"
            >
              <div className="flex items-center gap-2">
                {isPositive ? (
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                )}
                <span className="flex items-center gap-1">
                  <span className="font-semibold text-base">Job P&L</span>
                  <InfoTooltip text="Quick profit snapshot. Revenue and Materials & Receipts are pulled in automatically. Set your labor cost in the Costing tab." />
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-base font-bold",
                  isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                )} data-testid="text-pl-profit-lite">
                  {profitFormatted}
                </span>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", litePlExpanded && "rotate-180")} />
              </div>
            </button>
            {litePlExpanded && (
              <CardContent className="pt-0 px-4 pb-4">
                <div className="border-t pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">Revenue <InfoTooltip text="The total amount the customer will pay for this project." /></p>
                      <p className="text-lg font-bold" data-testid="text-pl-revenue-lite">
                        {(revenue / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">Materials &amp; Receipts <InfoTooltip text="Auto-summed from receipts and expenses you've added to this project." /></p>
                      <p className="text-lg font-semibold text-muted-foreground" data-testid="text-pl-materials-lite">
                        {(materials / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        Labor Cost <InfoTooltip text="Set this in the Costing tab under Labor Cost." />
                      </p>
                      <p className="text-lg font-semibold text-muted-foreground" data-testid="text-pl-labor-lite">
                        {storedLaborCents != null
                          ? (storedLaborCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="pt-3 border-t grid grid-cols-2 gap-4">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">Net Profit <InfoTooltip text="Revenue minus materials & receipts minus your labor cost." /></p>
                      <p className={cn(
                        "text-lg font-bold",
                        isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                      )} data-testid="text-pl-net-profit-lite">
                        {profitFormatted}
                      </p>
                    </div>
                    <div className="space-y-0.5 text-right">
                      <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">Margin <InfoTooltip text="Net profit as a percentage of revenue." /></p>
                      <p className={cn(
                        "text-lg font-bold",
                        isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                      )} data-testid="text-pl-margin-lite">
                        {revenue > 0 ? `${margin.toFixed(1)}%` : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })()}
      {userTier === 'elite' && project && jobCosting && ((project.totalAmount && project.totalAmount > 0) || jobCosting.totalCosts > 0) && (() => {
        const revenue = project.totalAmount || 0;
        const materialCosts = jobCosting.totalMaterials;
        const laborCosts = jobCosting.totalLabor;
        const overheadAllocation = jobCosting.overheadAllocation || 0;
        const overheadPerHourCents = jobCosting.overheadPerHour || 0;
        const totalCosts = jobCosting.totalCosts;
        const profit = revenue - totalCosts;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        const isPositive = profit >= 0;
        const profitFormatted = (profit / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
        const grossProfit = revenue - materialCosts - laborCosts;
        const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
        const isGrossPositive = grossProfit >= 0;

        return (
          <Card data-testid="pl-summary-card">
            <button
              className="w-full flex items-center justify-between gap-3 p-4 text-left"
              onClick={() => setPlExpanded(!plExpanded)}
              data-testid="button-toggle-pl"
            >
              <div className="flex items-center gap-2">
                {isPositive ? (
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                )}
                <span className="flex items-center gap-1">
                  <span className="font-semibold text-base">Job P&L</span>
                  {jobCosting.isSnapshot && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Locked</span>
                  )}
                  <InfoTooltip text={jobCosting.isSnapshot ? "These numbers were locked when the project was completed, reflecting the actual overhead and costs at that time." : "Profit & Loss summary for this project. Compares your revenue against material costs, fully-loaded labor costs (with burden & workers comp), and allocated overhead to show your true net profit."} />
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-base font-bold",
                  isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                )} data-testid="text-pl-profit">
                  {profitFormatted}
                </span>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", plExpanded && "rotate-180")} />
              </div>
            </button>
            {plExpanded && (
              <CardContent className="pt-0 px-4 pb-4">
                {jobCosting.missingRateMembers && jobCosting.missingRateMembers.length > 0 && (
                  <div className="flex items-start gap-2 p-3 mb-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800" data-testid="warning-missing-rates">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-amber-800 dark:text-amber-300">
                      <p className="font-medium">Missing hourly rates</p>
                      <p>{jobCosting.missingRateMembers.join(", ")} {jobCosting.missingRateMembers.length === 1 ? "has" : "have"} logged hours but no hourly rate set. Their time is counted but labor cost is $0. Set rates in Team Settings.</p>
                    </div>
                  </div>
                )}
                <div className="border-t pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">Revenue <InfoTooltip text="The total amount the customer will pay for this project, based on your proposal or invoice total." /></p>
                      <p className="text-lg font-bold" data-testid="text-pl-revenue">
                        {(revenue / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">Material Costs <InfoTooltip text="Cost of all materials, supplies, and equipment purchased for this job." /></p>
                      <p className="text-lg font-semibold text-muted-foreground">
                        {(materialCosts / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">Labor Costs <InfoTooltip text="Fully-loaded labor cost for production crew only. Includes base wages plus payroll burden, workers comp, and benefits. Non-production employees (sales) are excluded." /></p>
                      <p className="text-lg font-semibold text-muted-foreground">
                        {(laborCosts / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">Overhead <InfoTooltip text={`Your share of business overhead allocated to this project based on production labor hours worked. Calculated at $${(overheadPerHourCents / 100).toFixed(2)}/hr from your monthly overhead expenses.`} /></p>
                      <p className="text-lg font-semibold text-muted-foreground" data-testid="text-pl-overhead">
                        {(overheadAllocation / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </p>
                      {overheadPerHourCents === 0 && (
                        <a href="/financials" className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline" data-testid="link-setup-overhead">
                          Set up overhead expenses
                        </a>
                      )}
                    </div>
                    <div className="space-y-1 col-span-2">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">Total Costs <InfoTooltip text="Materials + loaded labor + overhead allocation. This is the true total cost of this project." /></p>
                      <p className="text-lg font-semibold text-muted-foreground">
                        {(totalCosts / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">Gross Margin <InfoTooltip text="Percentage of revenue remaining after direct costs (materials + labor) but before overhead. Shows how efficiently the job itself performs." /></p>
                        <p className={cn(
                          "text-lg font-bold",
                          isGrossPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )} data-testid="text-pl-gross-margin">
                          {grossMargin.toFixed(1)}%
                        </p>
                        <p className={cn(
                          "text-xs",
                          isGrossPositive ? "text-green-600/70 dark:text-green-400/70" : "text-red-600/70 dark:text-red-400/70"
                        )} data-testid="text-pl-gross-profit">
                          {(grossProfit / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                        </p>
                      </div>
                      <div className="space-y-0.5 text-right">
                        <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">Net Profit <InfoTooltip text="Percentage of revenue remaining after ALL costs including overhead. This is your true net margin on the job." /></p>
                        <p className={cn(
                          "text-lg font-bold",
                          isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )} data-testid="text-pl-margin">
                          {margin.toFixed(1)}%
                        </p>
                        <p className={cn(
                          "text-xs",
                          isPositive ? "text-green-600/70 dark:text-green-400/70" : "text-red-600/70 dark:text-red-400/70"
                        )} data-testid="text-pl-net-profit">
                          {profitFormatted}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t" data-testid="materials-summary-section">
                    <div className="flex items-center gap-2 mb-2">
                      <Paintbrush className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Materials Summary</span>
                      <InfoTooltip text="Estimated paint quantities grouped by surface type across all proposal items. Updates automatically as you add items." />
                    </div>
                    {materialsSummary.length === 0 ? (
                      <p className="text-xs text-muted-foreground" data-testid="text-no-materials">No paint surfaces configured in proposal items</p>
                    ) : (
                      <div className="space-y-2">
                        {materialsSummary.map((group) => (
                          <div
                            key={group.paintGroupKey}
                            className="rounded-md border p-2.5 space-y-1"
                            data-testid={`material-group-${group.paintGroupKey}`}
                          >
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold" data-testid={`text-material-label-${group.paintGroupKey}`}>{group.label}</p>
                                {(group.colorName || group.finish || group.brand) && (
                                  <p className="text-xs text-muted-foreground">
                                    {[group.colorName, group.finish, group.brand].filter(Boolean).join(" · ")}
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-medium" data-testid={`text-material-sqft-${group.paintGroupKey}`}>
                                  {group.totalPaintableSqft.toLocaleString()} sq ft total
                                </p>
                                <p className="text-sm font-semibold text-primary" data-testid={`text-material-gallons-${group.paintGroupKey}`}>
                                  {group.gallonsToBuy} gallons needed
                                </p>
                              </div>
                            </div>
                            {!group.materialConfigured && (
                              <Badge variant="secondary" className="text-[10px]" data-testid={`badge-default-coverage-${group.paintGroupKey}`}>
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Default Coverage
                              </Badge>
                            )}
                            {group.itemNames.length > 0 && (
                              <p className="text-[11px] text-muted-foreground" data-testid={`text-material-items-${group.paintGroupKey}`}>
                                {group.itemNames.join(", ")}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })()}

      <Card>
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back-projects" className="shrink-0">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <Link href={`/contacts/${project.contactId}`} className="flex items-center gap-2 hover-elevate rounded-md p-1 -m-1 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold shrink-0">
                  {maskName(project.contact.name)[0]}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-semibold text-sm" data-testid="text-project-contact-name">{maskName(project.contact.name)}</p>
                    <span className="text-sm font-bold text-primary" data-testid="text-project-number">#{project.projectNumber}</span>
                    {otherProjectsCount > 0 && (
                      <Badge variant="secondary" className="text-[10px]" data-testid="badge-multi-project">
                        +{otherProjectsCount} project{otherProjectsCount > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{maskPhone(project.contact.phone)}</p>
                </div>
              </Link>
              {projectRecipientsList.map((r) => (
                <div key={r.id} className="flex items-center gap-1.5 pl-1 border-l border-border ml-1" data-testid={`recipient-chip-${r.id}`}>
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-[10px] font-semibold shrink-0">
                    {maskName(r.name)[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate max-w-[100px]">{maskName(r.name)}</p>
                  </div>
                  <button
                    onClick={() => removeRecipientMutation.mutate(r.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    data-testid={`button-remove-recipient-${r.id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {projectRecipientsList.length < 2 && userTier === 'elite' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowAddRecipientDialog(true)}
                  data-testid="button-add-recipient"
                >
                  <Users className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {nextAutomation?.next && (
                <div className="flex items-center gap-1 mr-1 px-1.5 py-0.5 rounded bg-muted/50" data-testid="next-automation-info">
                  <InfoTooltip text="Automated follow-ups send texts or emails on a schedule to keep leads engaged. You can stop them anytime." />
                  <Send className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-[10px] text-muted-foreground truncate leading-tight">
                    {nextAutomation.next.label} · <span className="font-bold">{formatDistanceToNow(new Date(nextAutomation.next.scheduledFor), { addSuffix: true })}</span>
                  </span>
                  <button
                    className="ml-0.5 p-0.5 rounded hover-elevate text-muted-foreground"
                    title="Stop all follow-ups"
                    data-testid="button-stop-followups"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowStopFollowupsConfirm(true);
                    }}
                  >
                    <BellOff className="w-3 h-3" />
                  </button>
                </div>
              )}
              {project.contact.phone && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (hasInAppMessaging) {
                        setLocation(`/messages?contactId=${project.contactId}`);
                      } else {
                        window.location.href = `sms:${project.contact.phone}`;
                      }
                    }}
                    data-testid="button-quick-text"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </Button>
                  {isTwilioConfigured && !hasOfficePhone ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleCallAction}
                          data-testid="button-quick-call"
                        >
                          <Phone className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[220px]">
                        <p className="text-xs">Add your office or cell number in Settings &gt; Integrations &gt; Twilio to enable call bridging</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCallAction}
                      data-testid="button-quick-call"
                    >
                      <Phone className="w-4 h-4" />
                    </Button>
                  )}
                </>
              )}
              <Button variant="ghost" size="icon" onClick={() => setShowEditDialog(true)} data-testid="button-edit-project">
                <Edit className="w-4 h-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" data-testid="button-project-add">
                    <Plus className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[60]">
                  {!project.scheduledDate && (
                    <DropdownMenuItem onClick={() => setShowScheduleDialog(true)} data-testid="menu-schedule-job-plus">
                      <Calendar className="w-4 h-4 mr-2" />
                      Schedule Job
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setShowAppointmentDialog(true)} data-testid="menu-schedule-appointment">
                    <CalendarPlus className="w-4 h-4 mr-2" />
                    Schedule Appointment
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setReminderDate("");
                      setReminderTime("");
                      setReminderType("call");
                      setReminderNote("");
                      setShowReminderDialog(true);
                    }}
                    data-testid="menu-add-reminder-plus"
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    {project.reminderAt ? "Edit Reminder" : "Add Reminder"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setCreateDocType("proposal")} data-testid="menu-create-proposal">
                    <ClipboardList className="w-4 h-4 mr-2" />
                    Add New Proposal
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCreateDocType("invoice")} data-testid="menu-create-invoice">
                    <Receipt className="w-4 h-4 mr-2" />
                    Add New Invoice
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {['accepted', 'in_progress', 'completed'].includes(project.stage) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowReviewDialog(true)}
                      data-testid="button-request-review"
                    >
                      <Star className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Request Review</TooltipContent>
                </Tooltip>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-project-more">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[60]" sideOffset={4}>
                  <DropdownMenuItem
                    onClick={() => {
                      if (project.reminderAt) {
                        const d = new Date(project.reminderAt);
                        setReminderDate(format(d, "yyyy-MM-dd"));
                        setReminderTime(format(d, "HH:mm"));
                        setReminderType(project.reminderType || "call");
                        setReminderNote(project.reminderNote || "");
                      } else {
                        setReminderDate("");
                        setReminderTime("");
                        setReminderType("call");
                        setReminderNote("");
                      }
                      setShowReminderDialog(true);
                    }}
                    data-testid="menu-set-reminder"
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    {project.reminderAt ? "Edit Reminder" : "Set Reminder"}
                  </DropdownMenuItem>
                  {project.reminderAt && (
                    <DropdownMenuItem
                      onClick={() => clearReminderMutation.mutate()}
                      data-testid="menu-clear-reminder"
                    >
                      <BellOff className="w-4 h-4 mr-2" />
                      Clear Reminder
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {project.stage === 'lost' ? (
                    <DropdownMenuItem
                      onClick={() => updateStageMutation.mutate('new_lead')}
                      data-testid="menu-reactivate-project"
                    >
                      <ArchiveRestore className="w-4 h-4 mr-2" />
                      Reactivate Project
                    </DropdownMenuItem>
                  ) : project.stage !== 'completed' ? (
                    <DropdownMenuItem
                      onClick={() => { setLostReason(""); setShowLostDialog(true); }}
                      data-testid="menu-mark-lost"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Mark as Lost
                    </DropdownMenuItem>
                  ) : null}
                  {project.archived ? (
                    <DropdownMenuItem
                      onClick={() => unarchiveMutation.mutate()}
                      data-testid="menu-unarchive-project"
                    >
                      <ArchiveRestore className="w-4 h-4 mr-2" />
                      Restore Project
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => setShowArchiveConfirm(true)}
                      data-testid="menu-archive-project"
                    >
                      <Archive className="w-4 h-4 mr-2" />
                      Archive
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setShowDeleteConfirm(true)}
                    data-testid="menu-delete-project"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {(() => {
            if (project.reminderAt) {
              const isOverdue = new Date(project.reminderAt) < new Date();
              return (
                <div
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium cursor-pointer",
                    isOverdue
                      ? "bg-destructive/10 text-destructive"
                      : "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                  )}
                  onClick={() => {
                    const d = new Date(project.reminderAt!);
                    setReminderDate(format(d, "yyyy-MM-dd"));
                    setReminderTime(format(d, "HH:mm"));
                    setReminderType(project.reminderType || "call");
                    setReminderNote(project.reminderNote || "");
                    setShowReminderDialog(true);
                  }}
                  data-testid="text-next-followup"
                >
                  <Bell className="w-3 h-3 shrink-0" />
                  {isOverdue ? "Overdue" : project.reminderType === "follow_up" ? "Follow-up" : project.reminderType === "call" ? "Call" : project.reminderType === "message" ? "Message" : "Follow-up"} {format(new Date(project.reminderAt), "MMM d")}
                </div>
              );
            }
            if (project.automationPausedReason) {
              return (
                <div
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium cursor-pointer bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  data-testid="text-automation-paused"
                  onClick={() => openResumeRef.current?.()}
                >
                  <BellOff className="w-3 h-3 shrink-0" />
                  Paused
                </div>
              );
            }
            if (nextAutomation?.next) {
              return null;
            }
            const lastActivityDate = project.activities?.length
              ? new Date(Math.max(...project.activities.map((a: any) => new Date(a.createdAt).getTime())))
              : null;
            const lastCommDate = contactComms?.length
              ? new Date(Math.max(...contactComms.map((c: any) => new Date(c.timestamp).getTime())))
              : null;
            const nudge = getSmartNudge(project.stage, project.stageChangedAt, lastActivityDate, lastCommDate);
            if (nudge) {
              const nudgeIcon = nudge.action === "call" ? Phone : nudge.action === "message" ? MessageSquare : Bell;
              const NudgeIcon = nudgeIcon;
              return (
                <div
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium cursor-pointer",
                    nudge.urgency === "high"
                      ? "bg-destructive/10 text-destructive"
                      : nudge.urgency === "medium"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  )}
                  onClick={() => {
                    if (nudge.action === "call" && project.contact.phone) {
                      handleCallAction();
                    } else if (nudge.action === "message" && project.contact.phone) {
                      const suggestedMsg = getSuggestedMessage(project.stage, project);
                      if (hasInAppMessaging) {
                        setLocation(`/messages?contactId=${project.contactId}&draft=${encodeURIComponent(suggestedMsg)}`);
                      } else {
                        window.location.href = `sms:${project.contact.phone}?body=${encodeURIComponent(suggestedMsg)}`;
                      }
                    } else if (project.automationPausedReason && openResumeRef.current) {
                      openResumeRef.current();
                    } else {
                      setReminderDate("");
                      setReminderTime("");
                      setReminderType(nudge.action === "message" ? "message" : "call");
                      setReminderNote("");
                      setShowReminderDialog(true);
                    }
                  }}
                  data-testid="text-stage-nudge"
                >
                  <NudgeIcon className="w-3 h-3 shrink-0" />
                  {nudge.text}
                </div>
              );
            }
            return null;
          })()}

          {project.contact.email && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="w-3.5 h-3.5" />
              {maskEmail(project.contact.email)}
            </div>
          )}


          {(project.jobAddress || project.contact.address) && (() => {
            const addr = maskAddress(project.jobAddress || project.contact.address || '');
            const city = maskCity(project.jobCity || project.contact.city || '');
            const state = project.jobState || project.contact.state || '';
            const zip = project.jobZipCode || project.contact.zipCode || '';
            const fullAddr = [addr, [city, state, zip].filter(Boolean).join(', ')].filter(Boolean).join(', ');
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddr)}`;
            return (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group cursor-pointer"
                title="Open in Google Maps"
                data-testid="link-project-address-map"
              >
                <MapPin className="w-3.5 h-3.5 group-hover:text-primary" />
                <span className="group-hover:underline">{fullAddr}</span>
              </a>
            );
          })()}

          {project.totalAmount != null && project.totalAmount > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="w-3.5 h-3.5" />
              {(project.totalAmount / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </div>
          )}

          {project.scheduledDate && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                Start: {format(new Date(project.scheduledDate + "T00:00:00"), "MMM d, yyyy")}
                {project.scheduledTime && ` at ${project.scheduledTime}`}
                {(project as any).scheduledEndDate && (
                  <> — End: {format(new Date((project as any).scheduledEndDate + "T00:00:00"), "MMM d, yyyy")}
                  {(project as any).scheduledEndTime && ` at ${(project as any).scheduledEndTime}`}</>
                )}
              </span>
            </div>
          )}

          {project.description && (
            <p className="text-sm text-muted-foreground border-t pt-2 mt-2">{project.description}</p>
          )}

          <AttentionReasonBanner />

          {project.automationPausedReason && project.automationPausedAt && project.automationPausedCategory && project.automationPausedStep && (
            <div className="border-t pt-2 mt-2">
              <AutomationPausedBanner
                projectId={project.id}
                reason={project.automationPausedReason}
                pausedAt={String(project.automationPausedAt)}
                category={project.automationPausedCategory}
                step={project.automationPausedStep}
                openResumeRef={openResumeRef}
                onAddReminder={() => {
                  setReminderDate("");
                  setReminderTime("");
                  setReminderType("call");
                  setReminderNote("");
                  setShowReminderDialog(true);
                }}
              />
            </div>
          )}

          {project.reminderAt && (() => {
            const reminderDate = new Date(project.reminderAt);
            const now = new Date();
            const diffMs = reminderDate.getTime() - now.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);
            const isOverdue = diffMs <= 0;
            const isUrgent = diffHours > 0 && diffHours <= 24;
            const bgColor = isOverdue ? "bg-red-50 dark:bg-red-950/30" : isUrgent ? "bg-amber-50 dark:bg-amber-950/30" : "bg-blue-50 dark:bg-blue-950/30";
            const textColor = isOverdue ? "text-red-700 dark:text-red-300" : isUrgent ? "text-amber-700 dark:text-amber-300" : "text-blue-700 dark:text-blue-300";
            const iconColor = isOverdue ? "text-red-500" : isUrgent ? "text-amber-500" : "text-blue-500";
            return (
              <div className={cn("border-t pt-2 mt-2 -mx-3 px-3 pb-1", bgColor)} data-testid="reminder-banner">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Bell className={cn("w-5 h-5 flex-shrink-0", iconColor, isOverdue && "animate-pulse")} />
                    <div className="min-w-0">
                      <p className={cn("text-sm font-medium", textColor)} data-testid="reminder-text">
                        {isOverdue ? "Overdue:" : isUrgent ? "Due soon:" : "Reminder:"}{" "}
                        {project.reminderType === "call" ? "Call" : "Message"} {project.contact?.name || "contact"}
                      </p>
                      <p className={cn("text-xs", textColor, "opacity-75")}>
                        {format(reminderDate, "MMM d, yyyy 'at' h:mm a")}
                        {project.reminderNote && ` — ${project.reminderNote}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (project.reminderType === "call" && project.contact?.phone) {
                          handleCallAction();
                        } else if (project.contact?.phone) {
                          const suggestedMsg = getSuggestedMessage(project.stage, project);
                          if (hasInAppMessaging) {
                            setLocation(`/messages?contactId=${project.contactId}&draft=${encodeURIComponent(suggestedMsg)}`);
                          } else {
                            window.location.href = `sms:${project.contact.phone}?body=${encodeURIComponent(suggestedMsg)}`;
                          }
                        }
                        clearReminderMutation.mutate();
                      }}
                      data-testid="button-action-reminder"
                    >
                      {project.reminderType === "call" ? <Phone className="w-3.5 h-3.5 mr-1" /> : <MessageSquare className="w-3.5 h-3.5 mr-1" />}
                      {project.reminderType === "call" ? "Call Now" : "Message"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => clearReminderMutation.mutate()}
                      data-testid="button-dismiss-reminder"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}



          {project.sentimentScore != null && (() => {
            const sentimentSuggestions = getSentimentSuggestions(
              project.sentimentScore,
              project.sentimentLabel || null,
              project.stage,
              !!project.contact?.phone,
              !!project.contact?.email,
            );
            const sentimentIcon = project.sentimentScore >= 60 ? ThumbsUp :
              project.sentimentScore >= 40 ? AlertCircle : ThumbsDown;
            const sentimentColorClass = project.sentimentScore >= 80 ? "text-emerald-600 dark:text-emerald-400" :
              project.sentimentScore >= 60 ? "text-green-600 dark:text-green-400" :
              project.sentimentScore >= 40 ? "text-amber-600 dark:text-amber-400" :
              project.sentimentScore >= 20 ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400";
            const SentimentIcon = sentimentIcon;

            return (
              <div className="border-t pt-3 mt-2" data-testid="project-sentiment">
                <div className="flex items-center gap-2 mb-2">
                  <SentimentIcon className={cn("w-4 h-4", sentimentColorClass)} />
                  <span className="text-xs font-medium">Customer Sentiment</span>
                  <Badge variant="secondary" className="text-xs ml-auto" data-testid="sentiment-badge">
                    {project.sentimentLabel?.replace(/_/g, ' ') || 'neutral'} ({project.sentimentScore}/100)
                  </Badge>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
                  <div
                    className={cn("h-full rounded-full transition-all",
                      project.sentimentScore >= 80 ? "bg-emerald-500" :
                      project.sentimentScore >= 60 ? "bg-green-500" :
                      project.sentimentScore >= 40 ? "bg-amber-500" :
                      project.sentimentScore >= 20 ? "bg-orange-500" : "bg-red-500"
                    )}
                    style={{ width: `${Math.max(project.sentimentScore, 3)}%` }}
                  />
                </div>
                {sentimentSuggestions.length > 0 && (
                  <div className="space-y-1.5 mt-2" data-testid="sentiment-suggestions">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Suggested Actions</p>
                    {sentimentSuggestions.map((suggestion, i) => (
                      <button
                        key={suggestion.action + i}
                        className={cn(
                          "w-full flex items-start gap-2.5 p-2 rounded-md border text-left hover-elevate cursor-pointer",
                          suggestion.urgency === "high" && "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20",
                          suggestion.urgency === "medium" && "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20",
                        )}
                        onClick={() => {
                          if (suggestion.action === "call" && project.contact?.phone) {
                            handleCallAction();
                          } else if (suggestion.action === "message" && project.contact?.phone) {
                            const suggestedMsg = getSuggestedMessage(project.stage, project);
                            if (hasInAppMessaging) {
                              setLocation(`/messages?contactId=${project.contactId}&draft=${encodeURIComponent(suggestedMsg)}`);
                            } else {
                              window.location.href = `sms:${project.contact.phone}?body=${encodeURIComponent(suggestedMsg)}`;
                            }
                          } else if (suggestion.action === "email" && project.contact?.email) {
                            setLocation(`/messages?contactId=${project.contactId}`);
                          } else {
                            toast({ title: "Missing contact info", description: "Add a phone number or email to this contact first.", variant: "destructive" });
                          }
                        }}
                        data-testid={`sentiment-action-${suggestion.action}-${i}`}
                      >
                        <suggestion.icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0",
                          suggestion.urgency === "high" ? "text-red-500" :
                          suggestion.urgency === "medium" ? "text-amber-500" : "text-muted-foreground"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{suggestion.label}</p>
                          <p className="text-xs text-muted-foreground">{suggestion.description}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="border-t pt-2 mt-2">
            <StageProgressTracker currentStage={project.stage} userTier={userTier} />
          </div>

          {['new_lead', 'appointment_requested', 'draft', 'proposal_sent'].includes(project.stage) && (
            <div className="border-t pt-2 mt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1.5 text-center">Lead Quality</p>
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {[
                  { value: 'good', label: 'Good Lead', activeClass: 'bg-emerald-500 text-white hover:bg-emerald-600', inactiveClass: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800' },
                  { value: 'bad', label: 'Bad Lead', activeClass: 'bg-red-500 text-white hover:bg-red-600', inactiveClass: 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800' },
                  { value: 'not_qualified', label: 'Not Qualified', activeClass: 'bg-gray-500 text-white hover:bg-gray-600', inactiveClass: 'bg-gray-50 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/40 border border-gray-200 dark:border-gray-700' },
                ].map(opt => {
                  const isActive = project.leadQuality === opt.value;
                  return (
                    <button
                      key={opt.value}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                        isActive ? opt.activeClass : opt.inactiveClass
                      )}
                      onClick={() => updateLeadQualityMutation.mutate(isActive ? null : opt.value)}
                      disabled={updateLeadQualityMutation.isPending}
                      data-testid={`button-lead-quality-${opt.value}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {userTier === 'starter' && (
            <div className="border-t pt-3 mt-2 flex items-center gap-2 flex-wrap">
              {project.stage === 'accepted' && (
                <Button
                  size="sm"
                  onClick={() => updateStageMutation.mutate('in_progress')}
                  disabled={updateStageMutation.isPending}
                  data-testid="button-start-job"
                >
                  {updateStageMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Hammer className="w-3.5 h-3.5 mr-1.5" />}
                  Start Job
                </Button>
              )}
              {project.stage === 'in_progress' && (
                <Button
                  size="sm"
                  onClick={() => { setSendReviewRequest(true); setShowCompleteDialog(true); }}
                  disabled={updateStageMutation.isPending}
                  data-testid="button-mark-complete"
                >
                  {updateStageMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                  Mark Complete
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!docsLoading && userTier !== 'starter' && <RecommendedActions
        project={project}
        docs={docs}
        onAction={(action) => {
          switch (action) {
            case "create_proposal":
              setCreateDocType("proposal");
              break;
            case "create_invoice":
              setCreateDocType("invoice");
              break;
            case "call":
              handleCallAction();
              break;
            case "message":
              if (project.contact.phone) {
                const suggestedMsg = getSuggestedMessage(project.stage, project);
                if (hasInAppMessaging) {
                  setLocation(`/messages?contactId=${project.contactId}&draft=${encodeURIComponent(suggestedMsg)}`);
                } else {
                  window.location.href = `sms:${project.contact.phone}?body=${encodeURIComponent(suggestedMsg)}`;
                }
              } else {
                toast({ title: "No phone number", description: "This contact doesn't have a phone number yet.", variant: "destructive" });
              }
              break;
            case "edit_project":
              setShowEditDialog(true);
              break;
            case "schedule":
              if (project) {
                setSchedStartDate(project.scheduledDate || "");
                setSchedStartTime(snapTo15Min(project.scheduledTime || "", "08:00"));
                setSchedEndDate((project as any).scheduledEndDate || "");
                setSchedEndTime(snapTo15Min((project as any).scheduledEndTime || "", "17:00"));
                setSchedNotifyCustomer(true);
                setShowScheduleDialog(true);
              }
              break;
            case "start_work":
              updateStageMutation.mutate("in_progress");
              break;
            case "record_payment": {
              const invoice = docs.find(d => d.type === "invoice");
              if (invoice) {
                setLocation(`/documents/${invoice.id}`);
              } else {
                toast({ title: "No invoice found", description: "Create an invoice first to record payments." });
              }
              break;
            }
            case "complete":
              setSendReviewRequest(true);
              setShowCompleteDialog(true);
              break;
          }
        }}
        onActionWithDraft={(action, draft) => {
          if (action === 'message' && project.contact.phone) {
            const msg = draft || getSuggestedMessage(project.stage, project);
            if (hasInAppMessaging) {
              setLocation(`/messages?contactId=${project.contactId}&draft=${encodeURIComponent(msg)}`);
            } else {
              window.location.href = `sms:${project.contact.phone}?body=${encodeURIComponent(msg)}`;
            }
          } else if (action === 'call') {
            handleCallAction();
          } else {
            switch (action) {
              case "create_proposal": setCreateDocType("proposal"); break;
              case "create_invoice": setCreateDocType("invoice"); break;
              case "schedule":
                if (project) {
                  setSchedStartDate(project.scheduledDate || "");
                  setSchedStartTime(snapTo15Min(project.scheduledTime || "", "08:00"));
                  setSchedEndDate((project as any).scheduledEndDate || "");
                  setSchedEndTime(snapTo15Min((project as any).scheduledEndTime || "", "17:00"));
                  setSchedNotifyCustomer(true);
                  setShowScheduleDialog(true);
                }
                break;
              case "start_work": updateStageMutation.mutate("in_progress"); break;
              case "complete": setSendReviewRequest(true); setShowCompleteDialog(true); break;
              default: break;
            }
          }
        }}
      />}

      {(() => {
        const today = new Date().toISOString().split('T')[0];
        const upcomingAppts = contactAppointments
          .filter((a: any) => a.status === 'scheduled' && a.date >= today)
          .sort((a: any, b: any) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            if (a.time && b.time) return a.time < b.time ? -1 : 1;
            return a.time ? -1 : 1;
          });
        if (upcomingAppts.length === 0) return null;
        return (
          <div className="mb-4" data-testid="upcoming-appointments-section">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Upcoming Appointments</h3>
            <div className="space-y-2">
              {upcomingAppts.map((appt: any) => (
                <AppointmentCard
                  key={appt.id}
                  appointment={appt}
                  project={project}
                  hasPhoneIntegration={!!companySettings?.twilioAccountSid}
                  onNavigateToMessages={(contactId, call) => {
                    const params = new URLSearchParams({ contactId: String(contactId) });
                    if (call) params.set('call', '1');
                    window.location.href = `/communications?${params.toString()}`;
                  }}
                  onClick={() => setEditingAppointment(appt)}
                />
              ))}
            </div>
          </div>
        );
      })()}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
          <TabsList className="inline-flex gap-1.5 w-max bg-transparent h-auto p-0">
            <TabsTrigger value="activity" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none" data-testid="tab-activity">
              <Activity className="w-4 h-4 mr-1.5" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="documents" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none" data-testid="tab-documents">
              <FileText className="w-4 h-4 mr-1.5" />
              Docs
            </TabsTrigger>
            <TabsTrigger value="photos" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none" data-testid="tab-photos">
              <Camera className="w-4 h-4 mr-1.5" />
              Photos
            </TabsTrigger>
            {/* Per-proposal restructure: Work Order and Colors are no
                longer top-level tabs — they're accessed from inside
                each Proposal Card on the Documents tab. The TabsContent
                blocks below remain so click-throughs from a proposal
                card can still surface those (unchanged) viewers. */}
            {userTier === 'elite' && (
              <TabsTrigger value="comms" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none" data-testid="tab-comms">
                <MessageSquare className="w-4 h-4 mr-1.5" />
                Comms
              </TabsTrigger>
            )}
            {(userTier === 'core' || userTier === 'elite') && ['accepted','scheduled','in_progress','invoiced','paid','completed'].includes(project.stage) && (
              <TabsTrigger value="costing" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none relative" data-testid="tab-costing">
                <DollarSign className="w-4 h-4 mr-1.5" />
                Costing
                {pendingReceipts.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center" data-testid="badge-pending-receipts">
                    {pendingReceipts.length}
                  </span>
                )}
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="activity" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Textarea
              placeholder="Add a note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
              className="flex-1"
              data-testid="input-note"
            />
            <Button
              size="icon"
              onClick={() => {
                if (noteText.trim()) {
                  addNoteMutation.mutate(noteText.trim());
                }
              }}
              disabled={!noteText.trim() || addNoteMutation.isPending}
              data-testid="button-add-note"
            >
              {addNoteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </Button>
          </div>

          {(() => {
            const timelineItems: Array<{
              id: string;
              type: string;
              content: string;
              date: Date;
              isActivity?: boolean;
              activityData?: any;
              appointmentData?: any;
            }> = [];

            if (project.createdAt) {
              const sourceLabel = project.source
                ? ` from ${project.source.charAt(0).toUpperCase() + project.source.slice(1).replace(/_/g, ' ')}`
                : project.contact?.leadSource
                  ? ` from ${project.contact.leadSource.charAt(0).toUpperCase() + project.contact.leadSource.slice(1).replace(/_/g, ' ')}`
                  : '';
              timelineItems.push({
                id: 'lead-created',
                type: 'lead_received',
                content: `Lead received${sourceLabel}`,
                date: new Date(project.createdAt),
              });
            }

            for (const appt of contactAppointments) {
              const apptDate = appt.date && appt.time
                ? new Date(`${appt.date}T${appt.time}`)
                : appt.date ? new Date(appt.date) : appt.createdAt ? new Date(appt.createdAt) : null;
              if (!apptDate) continue;
              const typeLabels: Record<string, string> = {
                estimate: 'On-site Estimate',
                site_visit: 'Site Visit',
                walkthrough: 'Walkthrough',
                payment: 'Payment Appointment',
                other: 'Appointment',
              };
              const label = typeLabels[appt.type] || 'Appointment';
              const statusBadge = appt.status === 'cancelled' ? ' (Cancelled)' : appt.status === 'completed' ? ' (Completed)' : '';
              const timeStr = appt.time ? ` at ${format(apptDate, 'h:mm a')}` : '';
              timelineItems.push({
                id: `appt-${appt.id}`,
                type: 'appointment',
                content: `${label}${statusBadge} — ${format(apptDate, 'MMM d, yyyy')}${timeStr}${appt.notes ? ` · ${appt.notes}` : ''}`,
                date: apptDate,
                appointmentData: appt,
              });
            }

            if (project.activities) {
              for (const activity of project.activities) {
                timelineItems.push({
                  id: `activity-${activity.id}`,
                  type: activity.type,
                  content: activity.content,
                  date: activity.createdAt ? new Date(activity.createdAt) : new Date(),
                  isActivity: true,
                  activityData: activity,
                });
              }
            }

            timelineItems.sort((a, b) => b.date.getTime() - a.date.getTime());

            if (timelineItems.length === 0) {
              return <p className="text-center text-muted-foreground py-6">No activity yet</p>;
            }

            const hasPhoneIntegration = !!(companySettings?.twilioAccountSid && companySettings?.twilioPhoneNumber) || !!(companySettings?.openphoneApiKey && companySettings?.openphonePhoneNumber);

            return (
              <div className="space-y-1">
                {timelineItems.map(item => {
                  const activity = item.activityData;

                  if (item.type === 'appointment' && item.appointmentData) {
                    return (
                      <AppointmentCard
                        key={item.id}
                        appointment={item.appointmentData}
                        project={project}
                        hasPhoneIntegration={hasPhoneIntegration}
                        onNavigateToMessages={(contactId, call) => setLocation(call ? `/messages?contactId=${contactId}&call=1` : `/messages?contactId=${contactId}`)}
                        onClick={() => setEditingAppointment(item.appointmentData)}
                        compact
                      />
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-3 rounded-md"
                      data-testid={item.id}
                    >
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5", getActivityColor(item.type))}>
                        {getActivityIcon(item.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        {item.isActivity && activity && editingNoteId === activity.id ? (
                          <div className="space-y-2">
                            <Input
                              value={editNoteText}
                              onChange={(e) => setEditNoteText(e.target.value)}
                              className="text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && editNoteText.trim()) {
                                  editNoteMutation.mutate({ activityId: activity.id, content: editNoteText.trim() });
                                }
                                if (e.key === "Escape") {
                                  setEditingNoteId(null);
                                  setEditNoteText("");
                                }
                              }}
                              data-testid={`input-edit-note-${activity.id}`}
                            />
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                disabled={!editNoteText.trim() || editNoteMutation.isPending}
                                onClick={() => editNoteMutation.mutate({ activityId: activity.id, content: editNoteText.trim() })}
                                data-testid={`button-save-note-${activity.id}`}
                              >
                                {editNoteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setEditingNoteId(null); setEditNoteText(""); }}
                                data-testid={`button-cancel-edit-${activity.id}`}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : item.isActivity && activity?.type === "call_recording" ? (
                          (() => {
                            const lines = activity.content.split('\n');
                            const headerLine = lines[0];
                            const transcript = lines.slice(1).join('\n').trim();
                            const isExpanded = expandedTranscripts.has(activity.id);
                            const audioUrl = activity.metadata?.audioUrl;
                            return (
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-medium" data-testid={`text-recording-header-${activity.id}`}>{headerLine}</p>
                                  {transcript && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-xs"
                                      onClick={() => {
                                        setExpandedTranscripts(prev => {
                                          const next = new Set(prev);
                                          if (next.has(activity.id)) next.delete(activity.id);
                                          else next.add(activity.id);
                                          return next;
                                        });
                                      }}
                                      data-testid={`button-toggle-transcript-${activity.id}`}
                                    >
                                      {isExpanded ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                                      {isExpanded ? "Hide transcript" : "View transcript"}
                                    </Button>
                                  )}
                                </div>
                                {isExpanded && transcript && (
                                  <div className="mt-2 p-3 rounded-md bg-muted/50 text-sm whitespace-pre-wrap" data-testid={`text-transcript-${activity.id}`}>
                                    {transcript}
                                  </div>
                                )}
                                {audioUrl && isExpanded && (
                                  <audio controls className="mt-2 w-full max-w-md h-8" data-testid={`audio-recording-${activity.id}`}>
                                    <source src={audioUrl} type="audio/mpeg" />
                                  </audio>
                                )}
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {activity.createdAt && format(new Date(activity.createdAt), "MMM d, h:mm a")}
                                </p>
                              </div>
                            );
                          })()
                        ) : (
                          <>
                            <p className="text-sm">{item.content}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {format(item.date, "MMM d, h:mm a")}
                            </p>
                          </>
                        )}
                      </div>
                      {item.isActivity && activity?.type === "note" && editingNoteId !== activity.id && (
                        <div className="flex gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingNoteId(activity.id);
                              setEditNoteText(activity.content);
                            }}
                            data-testid={`button-edit-note-${activity.id}`}
                          >
                            <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteNoteMutation.mutate(activity.id)}
                            data-testid={`button-delete-note-${activity.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-sm text-muted-foreground">{docs.length} document{docs.length !== 1 ? "s" : ""}</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-add-doc-tab">
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCreateDocType("proposal")} data-testid="menu-tab-create-proposal">
                  <ClipboardList className="w-4 h-4 mr-2" />
                  Add New Proposal
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreateDocType("invoice")} data-testid="menu-tab-create-invoice">
                  <Receipt className="w-4 h-4 mr-2" />
                  Add New Invoice
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {docs.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">No documents linked to this project yet</p>
            </div>
          ) : (() => {
            const parentDocs = docs.filter(d => d.type === "proposal" || d.type === "estimate");
            const childDocs = docs.filter(d => d.type !== "proposal" && d.type !== "estimate");
            const grouped: { parent: typeof docs[0]; children: typeof docs }[] = [];
            const usedChildIds = new Set<number>();

            parentDocs.forEach(parent => {
              const children = childDocs.filter(c =>
                c.sourceDocumentId === parent.id || c.linkedInvoiceId === parent.id ||
                parent.linkedInvoiceId === c.id
              );
              children.forEach(c => usedChildIds.add(c.id));
              grouped.push({ parent, children });
            });

            const orphans = childDocs.filter(c => !usedChildIds.has(c.id));

            const getDocTypeIcon = (type: string) => {
              switch (type) {
                case "proposal": return <ClipboardList className="w-3.5 h-3.5" />;
                case "estimate": return <ClipboardList className="w-3.5 h-3.5" />;
                case "invoice": return <Receipt className="w-3.5 h-3.5" />;
                case "change_order": return <FileText className="w-3.5 h-3.5" />;
                default: return <FileText className="w-3.5 h-3.5" />;
              }
            };

            const getStatusColor = (status: string) => {
              switch (status) {
                case "draft": return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300";
                case "sent": return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300";
                case "viewed": return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300";
                case "accepted": return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";
                case "paid": return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300";
                case "rejected": return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";
                default: return "";
              }
            };

            const renderDocRow = (doc: typeof docs[0], isChild = false) => (
              <div
                key={doc.id}
                className={cn(
                  "flex items-center gap-2 py-2 px-3 hover-elevate cursor-pointer",
                  isChild ? "ml-4 border-l-2 border-muted pl-3" : "rounded-md",
                )}
                onClick={() => {
                  // For change orders, open the parent proposal and signal it
                  // to auto-open the new fullscreen CO viewer overlay instead
                  // of routing to the older page-style CO viewer.
                  if (doc.type === "change_order" && (doc as any).sourceDocumentId) {
                    try {
                      sessionStorage.setItem(
                        "openChangeOrderId",
                        JSON.stringify({ coId: doc.id, parentId: (doc as any).sourceDocumentId }),
                      );
                    } catch {}
                    setLocation(`/documents/${(doc as any).sourceDocumentId}`);
                    return;
                  }
                  setLocation(`/documents/${doc.id}`);
                }}
                data-testid={`doc-card-${doc.id}`}
              >
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                  doc.type === "invoice" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                    : doc.type === "change_order" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                    : "bg-primary/10 text-primary"
                )}>
                  {getDocTypeIcon(doc.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <Badge variant="secondary" className="text-[10px] capitalize">{doc.type === "change_order" ? "Change Order" : doc.type}</Badge>
                    <Badge variant="secondary" className={cn("text-[10px]", getStatusColor(doc.status))}>{doc.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(doc.totalAmount / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    {doc.createdAt && ` · ${format(new Date(doc.createdAt), "MMM d")}`}
                    {doc.viewCount > 0 && ` · ${doc.viewCount} view${doc.viewCount !== 1 ? "s" : ""}`}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            );

            // Per-proposal restructure: each proposal/estimate becomes
            // a self-contained "Proposal Card" with its child documents
            // (invoices, change orders) plus its own Colors and Work
            // Order access rows. Existing viewers are unchanged — these
            // rows just navigate the user there.
            const showWorkOrderRow = ['accepted','scheduled','in_progress','invoiced','paid','completed'].includes(project.stage);
            const renderInlineAccessRow = (
              opts: { icon: React.ReactNode; label: string; sublabel: string; testId: string; onClick?: () => void; disabled?: boolean }
            ) => {
              const isDisabled = opts.disabled || !opts.onClick;
              return (
                <div
                  className={cn(
                    "flex items-center gap-2 py-2 px-3 ml-4 border-l-2 border-muted pl-3",
                    isDisabled ? "opacity-60" : "hover-elevate cursor-pointer",
                  )}
                  onClick={isDisabled ? undefined : opts.onClick}
                  data-testid={opts.testId}
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
                    {opts.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{opts.label}</p>
                    <p className="text-xs text-muted-foreground">{opts.sublabel}</p>
                  </div>
                  {!isDisabled && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                </div>
              );
            };

            return (
              <div className="space-y-2">
                {parentDocs.length > 1 && (
                  <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" data-testid="banner-multi-proposal">
                    <CardContent className="p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-900 dark:text-amber-200">
                        This project has multiple proposals. Existing colors and the work order were attached to the oldest proposal — open a different proposal card if you want to manage colors or the work order somewhere else.
                      </p>
                    </CardContent>
                  </Card>
                )}
                {grouped.map(group => {
                  const isAccepted = ['accepted', 'paid'].includes(group.parent.status);
                  return (
                    <Card key={group.parent.id} data-testid={`doc-group-${group.parent.id}`}>
                      <CardContent className="p-1.5">
                        {renderDocRow(group.parent)}
                        {group.children.map(child => renderDocRow(child, true))}
                        {!isFieldWorker && renderInlineAccessRow({
                          icon: <Paintbrush className="w-3.5 h-3.5" />,
                          label: 'Colors',
                          sublabel: 'Room palette and customer color review',
                          testId: `proposal-colors-${group.parent.id}`,
                          onClick: () => setLocation(`/projects/${project.id}/proposals/${group.parent.id}/colors`),
                        })}
                        {showWorkOrderRow && renderInlineAccessRow({
                          icon: <ClipboardList className="w-3.5 h-3.5" />,
                          label: 'Work Order',
                          sublabel: isAccepted ? 'Crew-facing job sheet' : 'Available after proposal is accepted',
                          testId: `proposal-work-order-${group.parent.id}`,
                          disabled: !isAccepted,
                          onClick: isAccepted ? () => setLocation(`/projects/${project.id}/proposals/${group.parent.id}/work-order`) : undefined,
                        })}
                      </CardContent>
                    </Card>
                  );
                })}
                {orphans.length > 0 && (
                  <Card data-testid="doc-group-orphans">
                    <CardContent className="p-1.5">
                      {orphans.map(doc => renderDocRow(doc))}
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}

          <ProjectCoiUpload project={project} />

          {djFiles.length > 0 && (
            <Card className="mt-4 border-orange-200 dark:border-orange-800" data-testid="card-dripjobs-files">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <FileDown className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-semibold text-orange-900 dark:text-orange-200">DripJobs Archive Files</span>
                </div>
                <div className="space-y-1">
                  {djFiles.map((file: any) => (
                    <div key={file.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted transition-colors text-sm" data-testid={`dripjobs-file-${file.id}`}>
                      <a
                        href={file.storageKey}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 min-w-0 flex-1"
                      >
                        <FileText className="w-4 h-4 text-red-500 shrink-0" />
                        <span className="font-medium truncate">{file.caption || file.fileName}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">PDF</span>
                      </a>
                      {file.portalUrl && (
                        <button
                          type="button"
                          className="shrink-0 p-1 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600"
                          title="Copy shareable link"
                          data-testid={`copy-portal-link-${file.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(file.portalUrl);
                            toast({ title: "Link copied", description: file.portalUrl });
                          }}
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Work Order moved to its own route at
            /projects/:projectId/proposals/:docId/work-order — accessed
            from each Proposal Card on the Documents tab. */}

        <TabsContent value="comms" className="mt-4">
          {recentComms.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">No communications yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentComms.map(comm => {
                const isCall = comm.type === "call" || comm.type === "missed_call" || comm.type === "voicemail";
                const isSMS = comm.type === "sms";
                const isInbound = comm.direction === "inbound";
                return (
                  <div
                    key={comm.id}
                    className="flex items-start gap-3 p-3 rounded-md"
                    data-testid={`comm-${comm.id}`}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      isCall
                        ? isInbound ? "bg-green-100 dark:bg-green-900/30 text-green-600" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600"
                        : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600"
                    )}>
                      {isCall ? (
                        isInbound ? <PhoneIncoming className="w-4 h-4" /> : <PhoneOutgoing className="w-4 h-4" />
                      ) : (
                        <MessageSquare className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium capitalize">{isCall ? "Call" : "Message"}</p>
                        <Badge variant="secondary" className="text-[10px]">
                          {isInbound ? "Inbound" : "Outbound"}
                        </Badge>
                      </div>
                      {comm.content && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5">{comm.content}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {comm.timestamp && format(new Date(comm.timestamp), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="photos" className="mt-4">
          {projectCameraOpen && (
            <CameraCapture
              onCapture={handleProjectCameraCapture}
              onClose={() => setProjectCameraOpen(false)}
            />
          )}
          <input
            ref={projectPhotoFileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.heic,.heif,.webp,.gif,.bmp,.tiff,.tif"
            multiple
            className="hidden"
            onChange={handleProjectFileSelect}
            data-testid="project-photo-file-input"
          />
          {allFlatPhotos.length === 0 ? (
            <div className="text-center py-8">
              <Camera className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">No photos yet</p>
              <p className="text-muted-foreground text-xs mt-1">Photos from documents and messages will appear here</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  onClick={() => setProjectCameraOpen(true)}
                  data-testid="button-project-camera-empty"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Take Photo
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
                  onClick={() => projectPhotoFileRef.current?.click()}
                  disabled={projectPhotoUploading}
                  data-testid="button-project-upload-empty"
                >
                  {projectPhotoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                  Upload
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">All Photos</span>
                  {allFlatPhotos.length > 0 && (
                    <span className="text-xs text-muted-foreground">({allFlatPhotos.length})</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!photoSelectMode && (
                    <>
                      <button
                        type="button"
                        className="p-2 rounded-md hover:bg-green-50 dark:hover:bg-green-900/30 active:bg-green-100 transition-colors"
                        onClick={() => setProjectCameraOpen(true)}
                        data-testid="button-project-camera"
                      >
                        <Camera className="h-4 w-4 text-green-600 dark:text-green-400" />
                      </button>
                      <button
                        type="button"
                        className="p-2 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 active:bg-blue-100 transition-colors"
                        onClick={() => projectPhotoFileRef.current?.click()}
                        disabled={projectPhotoUploading}
                        data-testid="button-project-upload"
                      >
                        {projectPhotoUploading ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> : <ImagePlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                      </button>
                    </>
                  )}
                  {allFlatPhotos.length > 0 && !photoSelectMode && (
                    <button
                      type="button"
                      className="p-2 rounded-md hover:bg-orange-50 dark:hover:bg-orange-900/30 active:bg-orange-100 transition-colors"
                      onClick={() => setPhotoSelectMode(true)}
                      data-testid="button-photo-select-mode"
                    >
                      <CheckSquare className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    </button>
                  )}
                  {photoSelectMode && (
                    <>
                      {photoSelectedIds.size > 0 && (() => {
                        const allSelected = Array.from(photoSelectedIds)
                          .filter(key => !key.includes('cc-'))
                          .map(key => {
                            const [docIdStr, photoIdStr] = key.split(':');
                            return { documentId: parseInt(docIdStr), photoId: parseInt(photoIdStr) };
                          });
                        const ccSelectedCount = Array.from(photoSelectedIds).filter(key => key.includes('cc-')).length;
                        const projectPhotosSelected = allSelected.filter(s => s.documentId === 0);
                        const docPhotosSelected = allSelected.filter(s => s.documentId !== 0);
                        const docIds = [...new Set(docPhotosSelected.map(s => s.documentId))];
                        const canShare = (projectPhotosSelected.length > 0 && docPhotosSelected.length === 0) || (projectPhotosSelected.length === 0 && docIds.length === 1);
                        return (
                          <>
                            <span className="text-xs text-muted-foreground">{photoSelectedIds.size} selected</span>
                            {canShare && (
                              <button
                                type="button"
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
                                disabled={photoSharing}
                                onClick={async () => {
                                  setPhotoSharing(true);
                                  try {
                                    let res;
                                    if (projectPhotosSelected.length > 0) {
                                      const photoIds = projectPhotosSelected.map(s => s.photoId);
                                      res = await apiRequest("POST", `/api/projects/${id}/photos/share`, { photoIds });
                                    } else {
                                      const photoIds = docPhotosSelected.map(s => s.photoId);
                                      res = await apiRequest("POST", `/api/documents/${docIds[0]}/photos/share`, { photoIds });
                                    }
                                    let data;
                                    try { data = await res.json(); } catch { throw new Error("Invalid server response"); }
                                    if (!data.url) throw new Error(data.message || "No share link returned");
                                    setPhotoShareUrl(data.url);
                                    setPhotoShareDocId(projectPhotosSelected.length > 0 ? 0 : docIds[0]);
                                    setPhotoLinkCopied(false);
                                    setPhotoShareDialog(true);
                                  } catch (err: any) {
                                    const raw = err?.message || "Something went wrong";
                                    const friendly = (raw.includes("Failed to fetch") || raw.includes("NetworkError") || raw.includes("502") || raw.includes("503") || raw.includes("<!") || raw.length > 200)
                                      ? "Could not reach the server. Please try again."
                                      : raw.replace(/^\d+:\s*/, "");
                                    toast({ title: "Share failed", description: friendly, variant: "destructive" });
                                  } finally {
                                    setPhotoSharing(false);
                                  }
                                }}
                                data-testid="button-photo-share"
                              >
                                {photoSharing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
                                Share
                              </button>
                            )}
                            <button
                              type="button"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors"
                              onClick={async () => {
                                if (allSelected.length === 0 && ccSelectedCount > 0) {
                                  toast({ title: "Can't delete CompanyCam photos", description: "CompanyCam photos are managed in CompanyCam. Deselect them and try again.", variant: "destructive" });
                                  return;
                                }
                                const totalCount = allSelected.length;
                                if (!confirm(`Delete ${totalCount} photo${totalCount > 1 ? "s" : ""}?${ccSelectedCount > 0 ? ` (${ccSelectedCount} CompanyCam photo${ccSelectedCount > 1 ? "s" : ""} will be skipped)` : ""}`)) return;
                                try {
                                  const areaPhotoKeys = new Set(
                                    allFlatPhotos.filter((p: any) => p._isAreaPhoto).map((p: any) => `${p.documentId}:${p.id}`)
                                  );
                                  const areaSelected = allSelected.filter(s => areaPhotoKeys.has(`${s.documentId}:${s.photoId}`));
                                  const regularSelected = allSelected.filter(s => !areaPhotoKeys.has(`${s.documentId}:${s.photoId}`));
                                  const projectPhotosRegular = regularSelected.filter(s => s.documentId === 0);
                                  const docPhotosRegular = regularSelected.filter(s => s.documentId !== 0);

                                  if (projectPhotosRegular.length > 0) {
                                    const photoIds = projectPhotosRegular.map(s => s.photoId);
                                    await apiRequest("POST", `/api/projects/${id}/photos/bulk-delete`, { photoIds });
                                  }
                                  if (docPhotosRegular.length > 0) {
                                    const byDoc = new Map<number, number[]>();
                                    for (const s of docPhotosRegular) {
                                      if (!byDoc.has(s.documentId)) byDoc.set(s.documentId, []);
                                      byDoc.get(s.documentId)!.push(s.photoId);
                                    }
                                    for (const [docId, photoIds] of byDoc) {
                                      await apiRequest("POST", `/api/documents/${docId}/photos/bulk-delete`, { photoIds });
                                      queryClient.invalidateQueries({ queryKey: ["/api/documents", docId, "photos"] });
                                    }
                                  }

                                  if (areaSelected.length > 0) {
                                    const areaPhotoLookup = new Map(
                                      allFlatPhotos.filter((p: any) => p._isAreaPhoto).map((p: any) => [`${p.documentId}:${p.id}`, p])
                                    );
                                    const byDocArea = new Map<number, string[]>();
                                    for (const s of areaSelected) {
                                      const photo = areaPhotoLookup.get(`${s.documentId}:${s.photoId}`);
                                      if (!photo) continue;
                                      if (!byDocArea.has(s.documentId)) byDocArea.set(s.documentId, []);
                                      byDocArea.get(s.documentId)!.push(photo._areaPhotoUrl);
                                    }
                                    for (const [docId, urls] of byDocArea) {
                                      const doc = projectDocuments?.find((d: any) => d.id === docId);
                                      if (!doc) continue;
                                      const content = JSON.parse(JSON.stringify(doc.content || {}));
                                      const urlSet = new Set(urls);
                                      for (const block of (content.productionRateBlocks || [])) {
                                        for (const room of (block.roomBuilderData?.rooms || [])) {
                                          if (room.photos) {
                                            room.photos = room.photos.filter((p: any) => !urlSet.has(p.url));
                                          }
                                        }
                                      }
                                      await apiRequest("PATCH", `/api/documents/${docId}`, { content });
                                      queryClient.invalidateQueries({ queryKey: ["/api/documents", docId] });
                                    }
                                    queryClient.invalidateQueries({ queryKey: ["/api/documents", "project", id] });
                                  }

                                  queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "photos"] });
                                  exitPhotoSelectMode();
                                  toast({ title: `${totalCount} photo${totalCount > 1 ? "s" : ""} deleted` });
                                } catch (err: any) {
                                  toast({ title: "Delete failed", description: err.message, variant: "destructive" });
                                }
                              }}
                              data-testid="button-photo-bulk-delete"
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </button>
                          </>
                        );
                      })()}
                      <button
                        type="button"
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
                        onClick={exitPhotoSelectMode}
                        data-testid="button-photo-cancel-select"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>

              {pendingPhotos.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 mb-2" data-testid="upload-progress-banner">
                  {pendingPhotos.some(p => !p.uploaded) ? (
                    <>
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                      <span className="text-sm text-blue-700 dark:text-blue-300">
                        Uploading {pendingPhotos.filter(p => !p.uploaded).length} photo{pendingPhotos.filter(p => !p.uploaded).length !== 1 ? 's' : ''}
                        {pendingPhotos.some(p => p.uploaded) && ` · ${pendingPhotos.filter(p => p.uploaded).length} done`}
                      </span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="text-sm text-green-700 dark:text-green-300">
                        {pendingPhotos.length} photo{pendingPhotos.length !== 1 ? 's' : ''} uploaded
                      </span>
                    </>
                  )}
                </div>
              )}

              <div className="space-y-3" data-testid="project-photo-grid">
                {projectPhotoDateGroups.map((group) => {
                  const globalStartIdx = allFlatPhotos.indexOf(group.items[0]);
                  const sourceLabels = [...new Set(group.items.map((it: any) => it._sourceLabel))];
                  return (
                    <div key={group.dateStr}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[11px] font-medium text-muted-foreground">{group.label}</span>
                        <span className="text-[10px] text-muted-foreground/60">{sourceLabels.join(" · ")}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {group.items.map((photo: any, gi: number) => {
                          const idx = globalStartIdx + gi;
                          const isSource = photo._isSource;
                          const isPending = !!photo._isPending;
                          const selectKey = `${photo.documentId}:${photo.id}`;
                          const isOnProposal = !isSource && !isPending && proposalDocIds.has(photo.documentId) && !proposalHiddenPhotoIds.has(photo.id);
                          return (
                            <div
                              key={`${photo.documentId}-${photo.id}-${idx}`}
                              className="relative rounded-lg overflow-hidden cursor-pointer active:opacity-80"
                              data-testid={isPending ? `pending-photo-${photo.id}` : isSource ? `source-photo-${idx}` : `project-photo-${photo.id}`}
                              onClick={() => {
                                if (photoSelectMode && !isPending) {
                                  togglePhotoSelected(selectKey);
                                } else if (!photoSelectMode) {
                                  setProjectPhotoViewing({ index: allFlatPhotos.indexOf(photo), documentId: photo.documentId });
                                }
                              }}
                            >
                              <div className="aspect-square">
                                {isPending ? (
                                  <img src={photo.storageKey} alt="Uploading photo" className="w-full h-full object-cover" />
                                ) : photo._isCompanyCam ? (
                                  <img src={photo.storageKey} alt={photo.fileName || "CompanyCam photo"} className="w-full h-full object-cover" loading="lazy" />
                                ) : (isSource && !(photo.annotations as any[])?.length) ? (
                                  <img src={photo.storageKey} alt="Source photo" className="w-full h-full object-cover" loading="lazy" />
                                ) : (
                                  <AnnotatedThumb
                                    photo={photo}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                              </div>
                              {photoSelectMode && (
                                <div className={`absolute inset-0 flex items-start justify-end p-1.5 ${photoSelectedIds.has(selectKey) ? "bg-blue-500/20" : ""}`}>
                                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${photoSelectedIds.has(selectKey) ? "bg-blue-500 border-blue-500 text-white" : "border-white/80 bg-black/30"}`}>
                                    {photoSelectedIds.has(selectKey) && <Check className="w-3 h-3" />}
                                  </div>
                                </div>
                              )}
                              {isPending && (
                                <div className={`absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center ${photo.uploaded ? "bg-green-600/80" : "bg-black/50"}`} data-testid={`upload-indicator-${photo.id}`}>
                                  {photo.uploaded ? <Check className="w-3.5 h-3.5 text-white" /> : <CloudUpload className="w-3.5 h-3.5 text-white/80 animate-pulse" />}
                                </div>
                              )}
                              {!photoSelectMode && !isPending && !isSource && !photo._isCompanyCam && proposalDocIds.has(photo.documentId) && (
                                <button
                                  className={`absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center ${isOnProposal ? "bg-green-600/90 text-white" : "bg-gray-500/70 text-white/70"}`}
                                  data-testid={`toggle-proposal-photo-${photo.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePhotoProposalVisibility(photo.id, photo.documentId);
                                  }}
                                >
                                  {isOnProposal ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                </button>
                              )}
                              {!photoSelectMode && !isPending && photo._isAreaPhoto && (
                                <button
                                  className={`absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center ${photo._areaShowOnProposal ? "bg-green-600/90 text-white" : "bg-gray-500/70 text-white/70"}`}
                                  data-testid={`toggle-area-photo-proposal-${idx}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleAreaPhotoProposalVisibility(photo._areaPhotoUrl, photo.documentId);
                                  }}
                                >
                                  {photo._areaShowOnProposal ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                </button>
                              )}
                              {photo._isCompanyCam && photo.caption && (
                                <div
                                  className="absolute bottom-0 left-0 right-0 px-1.5 pt-3 pb-1 pr-8 bg-gradient-to-t from-black/70 to-transparent pointer-events-none"
                                  data-testid={`cc-caption-${photo.id}`}
                                >
                                  <p className="text-[10px] text-white leading-tight line-clamp-2">
                                    {photo.caption}
                                  </p>
                                </div>
                              )}
                              {photo._isCompanyCam && (
                                <div className="absolute top-1 left-1 px-1 py-0.5 bg-orange-600/80 rounded text-[9px] font-semibold text-white leading-none" data-testid={`cc-badge-${idx}`}>CC</div>
                              )}
                              {!photoSelectMode && !isPending && photo._isCompanyCam && (
                                <button
                                  className={`absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center ${includedCompanyCamUrls.has(photo.storageKey) ? "bg-green-600/90 text-white" : "bg-gray-500/70 text-white/70"}`}
                                  data-testid={`toggle-cc-photo-proposal-${idx}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCompanyCamPhotoVisibility(photo.storageKey);
                                  }}
                                >
                                  {includedCompanyCamUrls.has(photo.storageKey) ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Dialog open={photoShareDialog} onOpenChange={(open) => { if (!open) { setPhotoShareDialog(false); setPhotoShareUrl(null); exitPhotoSelectMode(); } }}>
            <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto" data-testid="dialog-project-share-photos">
              <DialogHeader>
                <DialogTitle>Share Photos</DialogTitle>
              </DialogHeader>
              {photoShareUrl && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {photoSelectedIds.size} photo{photoSelectedIds.size !== 1 ? "s" : ""} selected
                    {project?.contact?.name ? ` — share with ${maskName(project.contact.name)}` : ""}
                  </p>
                  <div className="p-3 border rounded-lg">
                    <button
                      type="button"
                      className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${photoLinkCopied ? "bg-green-500/10 text-green-600" : "bg-muted hover:bg-muted/80 text-foreground"}`}
                      onClick={async () => {
                        const ok = await copyToClipboard(photoShareUrl);
                        if (ok) {
                          setPhotoLinkCopied(true);
                          toast({ title: "Link copied!" });
                          setTimeout(() => setPhotoLinkCopied(false), 3000);
                        } else {
                          toast({ title: "Couldn't copy — try long-pressing the link", variant: "destructive" });
                        }
                      }}
                      data-testid="button-copy-photo-share-url"
                    >
                      {photoLinkCopied ? <CheckCircle className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                      {photoLinkCopied ? "Link Copied!" : "Copy Link"}
                    </button>
                  </div>

                  {!!(companySettings?.twilioAccountSid || companySettings?.twilioPhone) && project?.contact?.phone && (
                    <PhotoShareSmsButton
                      phone={project.contact.phone}
                      shareUrl={photoShareUrl}
                      companyName={companySettings?.companyName || ""}
                    />
                  )}
                  {!!(companySettings?.googleEmail || companySettings?.smtpConnectedAt || companySettings?.sendgridFromEmail || companySettings?.googleConnectedAt) && project?.contact?.email && (
                    <PhotoShareEmailButton
                      email={project.contact.email}
                      contactName={project?.contact?.name || "there"}
                      shareUrl={photoShareUrl}
                      companyName={companySettings?.companyName || ""}
                    />
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>

          {projectPhotoViewing && (() => {
            const viewerPhotos = allFlatPhotos.map((p: any) => ({
              id: p.id,
              fileName: p.fileName,
              storageKey: p.storageKey,
              caption: p.caption,
              annotations: p.annotations || null,
              annotatedStorageKey: p.annotatedStorageKey || null,
            }));
            const getDocId = (photoId: number | string) => {
              const p = allFlatPhotos.find((x: any) => x.id === photoId);
              return p?.documentId || projectPhotoViewing.documentId;
            };
            return (
              <PhotoGalleryViewer
                photos={viewerPhotos}
                initialIndex={projectPhotoViewing.index}
                onClose={() => setProjectPhotoViewing(null)}
                canEditPhoto={(idx) => {
                  const photo = allFlatPhotos[idx];
                  if (!photo) return false;
                  if (photo._isPending) return false;
                  return true;
                }}
                onEdit={(idx) => {
                  const photo = allFlatPhotos[idx];
                  if (!photo || photo._isPending) return;
                  projEditSessionRef.current++;
                  setProjectPhotoEditing({ photo, documentId: photo.documentId || projectPhotoViewing.documentId });
                }}
                onDelete={(photoId) => {
                  if (typeof photoId === 'string' || photoId < 0) return;
                  if (confirm("Remove this photo?")) {
                    const docId = getDocId(photoId);
                    apiRequest("DELETE", `/api/documents/${docId}/photos/${photoId}`).then(() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "photos"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/documents", docId, "photos"] });
                    });
                    setProjectPhotoViewing(null);
                  }
                }}
                onRename={(photoId, newName) => {
                  if (typeof photoId === 'string' || photoId < 0) return;
                  const docId = getDocId(photoId);
                  apiRequest("PUT", `/api/documents/${docId}/photos/${photoId}`, { caption: newName }).then(() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "photos"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/documents", docId, "photos"] });
                  });
                }}
              />
            );
          })()}

          {projectPhotoEditing && (() => {
            const { photo, documentId: docId } = projectPhotoEditing;
            const url = photo.storageKey.startsWith("http") ? photo.storageKey : photo.storageKey.startsWith("/objects/") ? photo.storageKey : `/objects/${photo.storageKey}`;
            return (
              <PhotoEditor
                key={`proj-editor-${photo.id}-${projEditSessionRef.current}`}
                initialSrc={url}
                initialName={photo.caption || photo.fileName}
                initialAnnotations={photo.annotations as Annotation[] | undefined}
                onSave={(annots, rotatedImageDataUrl) => {
                  setProjectPhotoEditing(null);

                  const isAreaPhoto = !!photo._isAreaPhoto;
                  const existingAnnots = (photo.annotations as any[] | null) || [];
                  const annotsChanged = JSON.stringify(annots) !== JSON.stringify(existingAnnots);

                  if (isAreaPhoto) {
                    queryClient.setQueryData(
                      ["/api/documents", "project", id],
                      (old: any) => old?.map((d: any) => {
                        if (d.id !== docId) return d;
                        const content = JSON.parse(JSON.stringify(d.content || {}));
                        const blocks = content.productionRateBlocks || [];
                        const areaUrl = photo._areaPhotoUrl;
                        for (const block of blocks) {
                          for (const room of (block.roomBuilderData?.rooms || [])) {
                            for (const p of (room.photos || [])) {
                              if (p.url === areaUrl) {
                                p.annotations = annots;
                                return { ...d, content };
                              }
                            }
                          }
                        }
                        return d;
                      })
                    );
                  } else {
                    queryClient.setQueryData(
                      ["/api/projects", id, "photos"],
                      (old: any) => old?.map((group: any) => ({
                        ...group,
                        photos: group.photos.map((p: any) =>
                          p.id === photo.id ? { ...p, annotations: annots } : p
                        ),
                      }))
                    );
                    queryClient.setQueryData(
                      ["/api/documents", docId, "photos"],
                      (old: any) => old?.map((p: any) =>
                        p.id === photo.id ? { ...p, annotations: annots } : p
                      )
                    );
                  }

                  (async () => {
                    let newStorageKey: string | undefined;
                    if (rotatedImageDataUrl) {
                      try {
                        const blob = await (await fetch(rotatedImageDataUrl)).blob();
                        URL.revokeObjectURL(rotatedImageDataUrl);
                        const fileName = `rotated_${photo.id}_${Date.now()}.jpg`;
                        const file = await compressBlob(blob, fileName);
                        const urlRes = await fetch("/api/uploads/request-url", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
                        });
                        if (urlRes.ok) {
                          const { uploadURL, objectPath } = await urlRes.json();
                          await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
                          newStorageKey = objectPath;
                        }
                      } catch (err) {
                        console.error("Failed to upload rotated image:", err);
                      }
                    }

                    if (!annotsChanged && !newStorageKey) return;

                    if (isAreaPhoto) {
                      try {
                        const docRes = await fetch(`/api/documents/${docId}`, { credentials: "include" });
                        if (!docRes.ok) throw new Error("Failed to fetch document");
                        const docData = await docRes.json();
                        const content = JSON.parse(JSON.stringify(docData.content || {}));
                        const blocks = content.productionRateBlocks || [];
                        const areaUrl = photo._areaPhotoUrl;
                        let found = false;
                        for (const block of blocks) {
                          for (const room of (block.roomBuilderData?.rooms || [])) {
                            for (const p of (room.photos || [])) {
                              if (p.url === areaUrl || (newStorageKey && p.url === photo.storageKey)) {
                                if (newStorageKey) p.url = newStorageKey.startsWith("/objects/") ? newStorageKey : `/objects/${newStorageKey}`;
                                p.annotations = annots;
                                found = true;
                                break;
                              }
                            }
                            if (found) break;
                          }
                          if (found) break;
                        }
                        if (found) {
                          await apiRequest("PUT", `/api/documents/${docId}`, { content });
                        } else {
                          toast({ title: "Save failed", description: "Could not find area photo in document", variant: "destructive" });
                        }
                      } catch (err: any) {
                        toast({ title: "Save failed", description: err.message, variant: "destructive" });
                      }
                    } else if (photo._isSource && !photo._isAreaPhoto) {
                      try {
                        const matRes = await apiRequest("POST", `/api/projects/${id}/materialize-source-photo`, {
                          url: photo._sourceUrl || photo.storageKey,
                          source: photo._sourceType === 'form_submission' ? 'booking_form' : 'customer_message',
                          caption: photo.caption || photo.fileName || 'Photo',
                        });
                        const materializedPhoto = await matRes.json();
                        if (materializedPhoto?.id) {
                          const updateData: any = { annotations: annots };
                          if (newStorageKey) updateData.storageKey = newStorageKey;
                          await apiRequest("PUT", `/api/documents/0/photos/${materializedPhoto.id}`, updateData);
                        }
                        queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "photos"] });
                        queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "source-photos"] });
                      } catch (err: any) {
                        toast({ title: "Save failed", description: err.message, variant: "destructive" });
                      }
                    } else {
                      const updateData: any = { annotations: annots };
                      if (newStorageKey) updateData.storageKey = newStorageKey;
                      try {
                        const res = await apiRequest("PUT", `/api/documents/${docId}/photos/${photo.id}`, updateData);
                        const saved = await res.json();
                        queryClient.setQueryData(
                          ["/api/projects", id, "photos"],
                          (old: any) => old?.map((group: any) => ({
                            ...group,
                            photos: group.photos.map((p: any) =>
                              p.id === saved.id ? { ...p, ...saved } : p
                            ),
                          }))
                        );
                        queryClient.setQueryData(
                          ["/api/documents", docId, "photos"],
                          (old: any) => old?.map((p: any) =>
                            p.id === saved.id ? { ...p, ...saved } : p
                          )
                        );
                      } catch (err: any) {
                        toast({ title: "Save failed", description: err.message, variant: "destructive" });
                        queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "photos"] });
                        queryClient.invalidateQueries({ queryKey: ["/api/documents", docId, "photos"] });
                      }
                    }
                  })();
                }}
                onCancel={() => setProjectPhotoEditing(null)}
              />
            );
          })()}
        </TabsContent>

        {/* Colors moved to its own route at
            /projects/:projectId/proposals/:docId/colors — accessed
            from each Proposal Card on the Documents tab. */}

        <TabsContent value="costing" className="mt-4 space-y-6">
          {userTier === 'elite' && (<>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <HardHat className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Assigned Crew</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {crewGroups.length > 0 && (
                    <Select onValueChange={(val) => {
                      const group = crewGroups.find(g => g.id.toString() === val);
                      if (group) addCrewGroupMutation.mutate(group.memberIds);
                    }}>
                      <SelectTrigger className="w-[160px]" data-testid="button-add-crew-group">
                        <SelectValue placeholder="Add group" />
                      </SelectTrigger>
                      <SelectContent>
                        {crewGroups.map(g => (
                          <SelectItem key={g.id} value={g.id.toString()}>{g.name} ({g.memberIds.length})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {availableCrewMembers.length > 0 && (
                    <Select
                      key={crewAssignments.length}
                      onValueChange={(val) => { const num = parseInt(val); if (!isNaN(num)) addCrewMutation.mutate(num); }}
                    >
                      <SelectTrigger className="w-[180px]" data-testid="button-add-crew">
                        <SelectValue placeholder="Add member" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCrewMembers.map(m => (
                          <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              {crewAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No crew assigned yet</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {crewAssignments.map(assignment => (
                    <Badge
                      key={assignment.id}
                      variant="secondary"
                      className="gap-1"
                      data-testid={`crew-member-${assignment.id}`}
                    >
                      <Users className="w-3 h-3" />
                      {assignment.teamMember.name}
                      <button
                        onClick={() => removeCrewMutation.mutate(assignment.id)}
                        className="ml-1"
                        data-testid={`button-remove-crew-${assignment.id}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <CrewNotesSection projectId={project.id} isOwner={true} compact />
            </CardContent>
          </Card>
          </>)}

          {userTier === 'elite' && pendingReceipts.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Receipt className="w-4 h-4 text-amber-500" />
                  <p className="text-sm font-medium">Pending Crew Receipts</p>
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]" data-testid="badge-pending-count">
                    {pendingReceipts.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {pendingReceipts.map(r => (
                    <div key={r.id} className="flex items-start gap-3 p-2.5 rounded-lg border bg-muted/30" data-testid={`pending-receipt-${r.id}`}>
                      <div className="w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0 cursor-pointer" onClick={() => {
                        const url = r.storageKey.startsWith("/objects/") ? r.storageKey : `/objects/${r.storageKey}`;
                        window.open(url, '_blank');
                      }}>
                        <img
                          src={r.storageKey.startsWith("/objects/") ? r.storageKey : `/objects/${r.storageKey}`}
                          alt={r.fileName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium" data-testid={`text-pending-submitter-${r.id}`}>{r.submitterName}</span>
                          {r.paidByWorker && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700" data-testid={`badge-reimbursement-${r.id}`}>
                              Reimbursement
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {r.title && <span>{r.title}</span>}
                          {r.amount != null && r.amount > 0 && (
                            <span className="font-semibold text-foreground" data-testid={`text-pending-amount-${r.id}`}>
                              ${(r.amount / 100).toFixed(2)}
                            </span>
                          )}
                          {r.vendor && <span>{r.vendor}</span>}
                          {!r.amount && !r.title && <span className="italic">AI scanning...</span>}
                        </div>
                        <div className="flex gap-1.5 mt-2">
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => approveReceiptMutation.mutate(r.id)}
                            disabled={approveReceiptMutation.isPending || rejectReceiptMutation.isPending}
                            data-testid={`button-approve-receipt-${r.id}`}
                          >
                            {approveReceiptMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => rejectReceiptMutation.mutate(r.id)}
                            disabled={approveReceiptMutation.isPending || rejectReceiptMutation.isPending}
                            data-testid={`button-reject-receipt-${r.id}`}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Materials & Spendings</p>
                  {expenses.length > 0 && (
                    <span className="text-sm font-bold text-foreground" data-testid="text-expenses-total">
                      {(expenses.reduce((s, e) => s + e.amount, 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  {expenses.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={exportingPdf}
                      onClick={async () => {
                        setExportingPdf(true);
                        try {
                          const { default: jsPDF } = await import("jspdf");
                          const doc = new jsPDF({ unit: "pt", format: "letter" });
                          doc.setFontSize(18);
                          doc.text("Project Expense Report", 40, 50);
                          doc.setFontSize(10);
                          doc.setTextColor(120);
                          doc.text(`${project.title || "Project"} — ${expenses.length} expense${expenses.length !== 1 ? 's' : ''} — Total: ${(expenses.reduce((s, e) => s + e.amount, 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}`, 40, 70);
                          doc.setTextColor(0);
                          let y = 100;
                          for (const exp of expenses) {
                            if (y > 680) { doc.addPage(); y = 40; }
                            doc.setFontSize(12);
                            doc.setFont("helvetica", "bold");
                            doc.text(exp.title, 40, y);
                            doc.setFont("helvetica", "normal");
                            doc.text((exp.amount / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }), 400, y);
                            y += 18;
                            doc.setFontSize(9);
                            const details: string[] = [];
                            if ((exp as any).vendor) details.push(`Vendor: ${(exp as any).vendor}`);
                            if ((exp as any).category) details.push(`Category: ${(exp as any).category}`);
                            if ((exp as any).receiptDate) details.push(`Purchased: ${format(new Date((exp as any).receiptDate), "MMM d, yyyy")}`);
                            if (exp.createdAt) details.push(`Logged: ${format(new Date(exp.createdAt), "MMM d, yyyy")}`);
                            if (details.length > 0) { doc.text(details.join("  •  "), 40, y); y += 14; }
                            if (exp.description) { doc.text(exp.description, 40, y); y += 14; }
                            if (exp.photos && exp.photos.length > 0) {
                              for (const photo of exp.photos) {
                                try {
                                  const url = photo.storageKey.startsWith("/objects/") ? photo.storageKey : `/objects/${photo.storageKey}`;
                                  const resp = await fetch(url);
                                  const blob = await resp.blob();
                                  const reader = new FileReader();
                                  const dataUrl = await new Promise<string>((resolve) => { reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(blob); });
                                  if (y > 500) { doc.addPage(); y = 40; }
                                  doc.addImage(dataUrl, "JPEG", 40, y, 200, 160);
                                  y += 170;
                                } catch {}
                              }
                            }
                            y += 10;
                            doc.setDrawColor(200);
                            doc.line(40, y, 560, y);
                            y += 15;
                          }
                          doc.save(`expense-report-${project.title?.replace(/\s+/g, '-').toLowerCase() || 'project'}.pdf`);
                        } catch {
                          toast({ title: "PDF export failed", variant: "destructive" });
                        } finally {
                          setExportingPdf(false);
                        }
                      }}
                      data-testid="button-export-all-expenses"
                    >
                      {exportingPdf ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <FileText className="w-3 h-3 mr-1" />}
                      Export PDF
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingExpense(null);
                      setExpenseTitle("");
                      setExpenseAmount("");
                      setExpenseDescription("");
                      setExpenseCategory("");
                      setExpenseCategoryCustom(false);
                      setExpenseVendor("");
                      setExpenseReceiptDate("");
                      setDuplicateWarning(null);
                      setReceiptFile(null);
                      setShowExpenseDialog(true);
                    }}
                    data-testid="button-add-expense"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Expense
                  </Button>
                </div>
              </div>
              {expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No expenses recorded yet</p>
              ) : (
                <div className="space-y-1">
                  {duplicateWarning && duplicateWarning.length > 0 && (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-2" data-testid="duplicate-warning">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Possible duplicate detected</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                          A similar expense already exists: {duplicateWarning.map(d => `"${d.title}" - $${(d.amount / 100).toFixed(2)}${d.vendor ? ` at ${d.vendor}` : ''}`).join(', ')}
                        </p>
                        <Button variant="ghost" size="sm" className="mt-1 h-6 text-xs text-amber-700" onClick={() => setDuplicateWarning(null)}>Dismiss</Button>
                      </div>
                    </div>
                  )}
                  {expenses.map((expense) => {
                    const purchaseDate = (expense as any).receiptDate ? format(new Date((expense as any).receiptDate), "MMM d") : null;
                    const addedDate = expense.createdAt ? format(new Date(expense.createdAt), "MMM d") : null;
                    const vendor = (expense as any).vendor;
                    const category = (expense as any).category;
                    const isExpanded = expandedExpenseId === expense.id;
                    const imgUrl = (expense as any).receiptImageUrl as string | null;
                    const hasReceiptData = !!(vendor || (expense as any).receiptDate);
                    const hasReceipt = !!imgUrl || hasReceiptData;
                    const isComplete = expense.title && expense.amount > 0 && hasReceipt;
                    return (
                    <div key={expense.id} className="rounded-md border border-transparent hover:border-border/50" data-testid={`expense-item-${expense.id}`}>
                      <div
                        className="flex items-center gap-2 py-2 px-3 cursor-pointer hover:bg-muted/50 rounded-md"
                        onClick={() => setExpandedExpenseId(isExpanded ? null : expense.id)}
                      >
                        {imgUrl && userTier !== 'core' ? (
                          <div className="w-9 h-9 rounded-md overflow-hidden border shrink-0 relative" onClick={(e) => { e.stopPropagation(); setViewingReceiptUrl(imgUrl); }}>
                            <img src={imgUrl} alt="Receipt" className="w-full h-full object-cover" loading="lazy" />
                          </div>
                        ) : hasReceiptData ? (
                          <div className="w-9 h-9 rounded-md border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 shrink-0 flex items-center justify-center">
                            <Receipt className="w-4 h-4 text-green-600 dark:text-green-400" />
                          </div>
                        ) : (
                          <div className="w-9 h-9 rounded-md border border-dashed border-muted-foreground/30 shrink-0 flex items-center justify-center">
                            <Receipt className="w-4 h-4 text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-sm">
                            {isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                            <span className="font-medium truncate">{expense.title}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="font-semibold whitespace-nowrap">{(expense.amount / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
                            {category && <Badge variant="outline" className="text-[10px] ml-1 shrink-0">{category}</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {[vendor, purchaseDate ? `Bought ${purchaseDate}` : null, addedDate ? `Added ${addedDate}` : null].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                      </div>
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/50">
                          {imgUrl && userTier !== 'core' && (
                            <div className="inline-block pt-1">
                              <div className="w-20 h-20 rounded-lg overflow-hidden border cursor-pointer relative group" onClick={() => setViewingReceiptUrl(imgUrl)} data-testid={`expense-receipt-img-${expense.id}`}>
                                <img src={imgUrl} alt="Receipt" className="w-full h-full object-cover" loading="lazy" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                  <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            {vendor && <><span className="text-muted-foreground">Vendor</span><span>{vendor}</span></>}
                            {category && <><span className="text-muted-foreground">Category</span><span>{category}</span></>}
                            {purchaseDate && <><span className="text-muted-foreground">Purchased</span><span>{format(new Date((expense as any).receiptDate), "MMMM d, yyyy")}</span></>}
                            {expense.createdAt && <><span className="text-muted-foreground">Logged</span><span>{format(new Date(expense.createdAt), "MMM d, yyyy h:mm a")}</span></>}
                          </div>
                          {expense.description && <p className="text-xs text-muted-foreground">{expense.description}</p>}
                          <div className="flex flex-wrap gap-1 pt-1">
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={(e) => {
                              e.stopPropagation();
                              setEditingExpense(expense);
                              setExpenseTitle(expense.title);
                              setExpenseAmount((expense.amount / 100).toString());
                              setExpenseDescription(expense.description || "");
                              const cat = (expense as any).category || "";
                              const presetCategories = ["Materials", "Paint & Supplies", "Equipment Rental", "Subcontractor", "Travel/Gas", "Permits", "Dump/Disposal", "Food/Meals", "Other"];
                              setExpenseCategory(cat);
                              setExpenseCategoryCustom(cat !== "" && !presetCategories.includes(cat));
                              setExpenseVendor((expense as any).vendor || "");
                              setExpenseReceiptDate((expense as any).receiptDate ? new Date((expense as any).receiptDate).toISOString().split('T')[0] : "");
                              setDuplicateWarning(null);
                              setShowExpenseDialog(true);
                            }} data-testid={`button-edit-expense-${expense.id}`}>
                              <Edit className="w-3 h-3 mr-1" />Edit
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setConfirmDeleteExpenseId(expense.id); }} data-testid={`button-delete-expense-${expense.id}`}>
                              <Trash2 className="w-3 h-3 mr-1" />Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );})}
                  {expenses.length >= 2 && (() => {
                    const categoryTotals: Record<string, number> = {};
                    for (const exp of expenses) {
                      const cat = (exp as any).category || "Uncategorized";
                      categoryTotals[cat] = (categoryTotals[cat] || 0) + exp.amount;
                    }
                    const sorted = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
                    return (
                      <div className="mt-3 pt-3 border-t border-border/50" data-testid="expense-category-breakdown">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Breakdown by Category</p>
                        <div className="space-y-1">
                          {sorted.map(([cat, total]) => (
                            <div key={cat} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{cat}</span>
                              <span className="font-medium tabular-nums">{(total / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>

          {userTier === 'core' && (
          <Card data-testid="manual-labor-cost-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Labor Log</p>
                </div>
                {storedLaborCents != null && (
                  <span className="text-sm font-bold text-foreground" data-testid="text-manual-labor-saved">
                    {(storedLaborCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </span>
                )}
              </div>

              {manualLaborEntries.length > 0 && (
                <div className="space-y-2 mb-3" data-testid="list-manual-labor-entries">
                  {manualLaborEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/30 p-2"
                      data-testid={`row-manual-labor-${entry.id}`}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium text-foreground" data-testid={`text-labor-date-${entry.id}`}>
                          {(() => {
                            const [y, m, d] = entry.workDate.split('-').map(Number);
                            const dt = new Date(y, (m || 1) - 1, d || 1);
                            return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                          })()}
                        </span>
                        {entry.note && (
                          <span className="text-xs text-muted-foreground truncate" data-testid={`text-labor-note-${entry.id}`}>
                            {entry.note}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold tabular-nums" data-testid={`text-labor-amount-${entry.id}`}>
                          {(entry.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmDeleteLaborId(entry.id)}
                          disabled={deleteLaborEntryMutation.isPending}
                          aria-label="Delete labor entry"
                          data-testid={`button-delete-labor-${entry.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={() => {
                  setNewLaborDate(todayIso);
                  setNewLaborAmount("");
                  setNewLaborNote("");
                  setShowLaborDialog(true);
                }}
                className="w-full h-9"
                size="sm"
                data-testid="button-open-add-labor"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Labor
              </Button>
              <p className="text-xs text-muted-foreground mt-3">
                Log labor day-by-day (wages, subs, etc.). Totals roll up into your project profit summary above.
              </p>
            </CardContent>
          </Card>
          )}

          {userTier === 'elite' && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Labor Hours</p>
                  {timeEntries.length > 0 && (
                    <span className="text-sm font-bold text-foreground" data-testid="text-labor-total-cost">
                      {(timeEntries.reduce((sum, e) => {
                        const hours = (e.totalMinutes || 0) / 60;
                        // Prefer the locked rate snapshot (correct for ad-hoc workers and historical entries)
                        const rate = e.lockedHourlyRate ?? e.teamMember?.hourlyRate ?? 0;
                        return sum + hours * (rate / 100);
                      }, 0)).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTimeEntryDialog(true)}
                  data-testid="button-add-time-entry-open"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Entry
                </Button>
              </div>

              {timeEntries.length === 0 && !expandedLaborId ? (
                <p className="text-sm text-muted-foreground">No labor hours recorded yet</p>
              ) : (
                <div className="space-y-1">
                  {timeEntries.map(entry => {
                    const hours = entry.totalMinutes ? entry.totalMinutes / 60 : 0;
                    const isAdHoc = !entry.teamMemberId && !!entry.adHocWorkerName;
                    // Locked snapshot wins over live team-member values so historical
                    // cost stays correct when rates change later (and is the only
                    // source of truth for ad-hoc one-time workers).
                    const hasLocked = entry.lockedHourlyRate != null;
                    const rate = hasLocked ? entry.lockedHourlyRate! : (entry.teamMember?.hourlyRate || 0);
                    // Ad-hoc workers are always treated as production for costing.
                    const isProduction = isAdHoc || entry.teamMember?.employeeType === 'production';
                    const burdenPct = hasLocked ? parseFloat(entry.lockedPayrollBurden || '0') : (entry.teamMember?.payrollBurdenPercentage || 0);
                    const wcPct = hasLocked ? parseFloat(entry.lockedWorkersComp || '0') : (entry.teamMember?.workersCompPercentage || 0);
                    const benefitsHr = hasLocked ? parseFloat(entry.lockedBenefitsPerHour || '0') : (entry.teamMember?.benefitsPerHour || 0);
                    const burdenMult = isProduction ? (1 + burdenPct + wcPct) : 1;
                    const benefitsCentsPerHr = isProduction ? Math.round(benefitsHr * 100) : 0;
                    const fullyLoadedRate = Math.round(rate * burdenMult) + benefitsCentsPerHr;
                    const laborCost = isProduction ? hours * (fullyLoadedRate / 100) : 0;
                    const displayName = entry.teamMember?.name || entry.adHocWorkerName || "Unknown";
                    const isExpanded = expandedLaborId === entry.id;
                    const clockInDate = entry.clockIn ? format(new Date(entry.clockIn), "MMM d") : null;
                    return (
                      <div key={entry.id} className="rounded-md border border-transparent hover:border-border/50" data-testid={`labor-entry-${entry.id}`}>
                        <div
                          className="flex items-center gap-2 py-2 px-3 cursor-pointer hover:bg-muted/50 rounded-md"
                          onClick={() => setExpandedLaborId(isExpanded ? null : entry.id)}
                        >
                          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            <User className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 text-sm flex-wrap">
                              <span className="font-medium truncate">{displayName}</span>
                              {isAdHoc && (
                                <Badge variant="outline" className="text-[10px] text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700" data-testid={`badge-onetime-${entry.id}`}>
                                  One-time
                                </Badge>
                              )}
                              <span className="text-muted-foreground">·</span>
                              <span className="font-semibold whitespace-nowrap">{hours.toFixed(1)}h</span>
                              {isProduction && rate > 0 && (
                                <>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="font-semibold whitespace-nowrap">{laborCost.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
                                </>
                              )}
                              {!rate && entry.totalMinutes && entry.totalMinutes > 0 && (
                                <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 ml-1">
                                  No rate set
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {[clockInDate, !isProduction ? "Non-production" : null].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                        </div>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/50">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              {entry.clockIn && <><span className="text-muted-foreground">Clock In</span><span>{format(new Date(entry.clockIn), "MMM d, yyyy h:mm a")}</span></>}
                              {entry.clockOut && <><span className="text-muted-foreground">Clock Out</span><span>{format(new Date(entry.clockOut), "MMM d, yyyy h:mm a")}</span></>}
                              <span className="text-muted-foreground">Hours</span><span>{hours.toFixed(1)}h</span>
                              {rate > 0 && <><span className="text-muted-foreground">Rate</span><span>${(rate / 100).toFixed(2)}/hr</span></>}
                              {isProduction && rate > 0 && <><span className="text-muted-foreground">Loaded Cost</span><span>{laborCost.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span></>}
                            </div>
                            {(entry.clockInLat || entry.clockOutLat) && (
                              <div className="flex items-center gap-3 pt-1">
                                {entry.clockInLat && entry.clockInLng && (
                                  <a href={`https://www.google.com/maps?q=${entry.clockInLat},${entry.clockInLng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline" data-testid={`link-labor-clockin-gps-${entry.id}`}>
                                    <MapPin className="w-3 h-3" />Clock In Location
                                  </a>
                                )}
                                {entry.clockOutLat && entry.clockOutLng && (
                                  <a href={`https://www.google.com/maps?q=${entry.clockOutLat},${entry.clockOutLng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline" data-testid={`link-labor-clockout-gps-${entry.id}`}>
                                    <MapPin className="w-3 h-3" />Clock Out Location
                                  </a>
                                )}
                              </div>
                            )}
                            {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
                            <div className="flex flex-wrap gap-1 pt-1">
                              <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteTimeEntryMutation.mutate(entry.id); }} data-testid={`button-delete-labor-${entry.id}`}>
                                <Trash2 className="w-3 h-3 mr-1" />Delete
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {timeEntries.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Total Hours</span>
                        <span className="font-medium">{(timeEntries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0) / 60).toFixed(1)}h</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </CardContent>
          </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showTimeEntryDialog} onOpenChange={(open) => {
        setShowTimeEntryDialog(open);
        if (!open) {
          setTimeEntryMemberId("");
          setTimeEntryMemberIds([]);
          setTimeEntryDate("");
          setTimeEntryHours("");
          setTimeEntryStartTime("08:00");
          setTimeEntryEndTime("16:00");
          setTimeEntryAdHocOpen(false);
          setTimeEntryAdHocName("");
          setTimeEntryAdHocRate("");
          setTimeEntryAdHocBurden("0");
          setTimeEntryAdHocWc("0");
          setTimeEntryAdHocBenefits("0");
          setTimeEntryAdHocSaveToTeam(false);
        }
      }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Time Entry</DialogTitle>
            <DialogDescription>Pick one or more team members, or log a one-time worker. Same date and hours apply to everyone selected.</DialogDescription>
          </DialogHeader>
          {(() => {
            const minDate = project.scheduledDate || '';
            const today = format(new Date(), 'yyyy-MM-dd');

            // Source of truth for the dropdown is now ALL active team members,
            // not just members already added to project_crew_assignments — so
            // owners can log hours for anyone on the team without first adding
            // them as project crew.
            const activeMembers = allTeamMembers.filter(m => m.isActive !== false);
            const membersWithDateStatus = activeMembers.map(m => {
              const alreadyLogged = timeEntryDate
                ? timeEntries.find(e => e.teamMemberId === m.id && e.clockIn && format(new Date(e.clockIn), 'yyyy-MM-dd') === timeEntryDate)
                : null;
              return { member: m, alreadyLogged };
            });

            return (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={timeEntryDate}
                    min={minDate}
                    max={today}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setTimeEntryDate(newDate);
                      // Drop any previously-selected members that already have an entry on the new date
                      if (newDate) {
                        setTimeEntryMemberIds(prev => prev.filter(id =>
                          !timeEntries.some(en => en.teamMemberId === id && en.clockIn && format(new Date(en.clockIn), 'yyyy-MM-dd') === newDate)
                        ));
                      }
                    }}
                    className={!timeEntryDate ? "border-red-500 dark:border-red-500 focus-visible:ring-red-500" : ""}
                    data-testid="input-time-entry-date"
                  />
                  {minDate && (
                    <p className="text-xs text-muted-foreground">Project starts {format(new Date(minDate + 'T00:00:00'), 'MMM d, yyyy')}</p>
                  )}
                </div>

                {!timeEntryAdHocOpen && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Team Members *</Label>
                      {timeEntryMemberIds.length > 0 && (
                        <span className="text-xs text-muted-foreground" data-testid="text-time-entry-selected-count">
                          {timeEntryMemberIds.length} selected
                        </span>
                      )}
                    </div>
                    {activeMembers.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2 rounded-md border border-dashed">
                        No active team members yet. Add one in Team Settings, or use a one-time worker below.
                      </p>
                    ) : (
                      <div className="rounded-md border max-h-56 overflow-y-auto divide-y" data-testid="list-time-entry-members">
                        {membersWithDateStatus.map(({ member, alreadyLogged }) => {
                          const checked = timeEntryMemberIds.includes(member.id);
                          const disabled = !!alreadyLogged;
                          const hrs = alreadyLogged ? ((alreadyLogged.totalMinutes || 0) / 60).toFixed(1) : null;
                          return (
                            <label
                              key={member.id}
                              className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                              data-testid={`checkbox-row-member-${member.id}`}
                            >
                              <Checkbox
                                checked={checked}
                                disabled={disabled}
                                onCheckedChange={(v) => {
                                  setTimeEntryMemberIds(prev => v
                                    ? Array.from(new Set([...prev, member.id]))
                                    : prev.filter(x => x !== member.id));
                                }}
                                data-testid={`checkbox-member-${member.id}`}
                              />
                              <span className="flex-1 truncate">{member.name}</span>
                              {hrs && (
                                <span className="text-xs text-amber-700 dark:text-amber-400 whitespace-nowrap">{hrs}h logged</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* One-time worker section */}
                <div className="rounded-md border border-dashed p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">One-time worker</div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const next = !timeEntryAdHocOpen;
                        setTimeEntryAdHocOpen(next);
                        if (next) setTimeEntryMemberIds([]);
                      }}
                      data-testid="button-toggle-adhoc-worker"
                    >
                      {timeEntryAdHocOpen ? 'Cancel' : '+ Add one-time worker'}
                    </Button>
                  </div>
                  {timeEntryAdHocOpen && (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Logs labor for someone not in your crew (e.g. a sub-contractor or one-day helper). Type the exact dollar amounts you actually paid — burden, workers' comp and benefits default to 0.
                      </p>
                      <div className="space-y-1">
                        <Label className="text-xs">Worker name *</Label>
                        <Input
                          value={timeEntryAdHocName}
                          onChange={(e) => setTimeEntryAdHocName(e.target.value)}
                          placeholder="e.g. John (helper)"
                          data-testid="input-adhoc-name"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Hourly rate ($/hr) *</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={timeEntryAdHocRate}
                            onChange={(e) => setTimeEntryAdHocRate(e.target.value)}
                            placeholder="25.00"
                            data-testid="input-adhoc-rate"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Benefits ($/hr)</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={timeEntryAdHocBenefits}
                            onChange={(e) => setTimeEntryAdHocBenefits(e.target.value)}
                            placeholder="0"
                            data-testid="input-adhoc-benefits"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Payroll burden (decimal)</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={timeEntryAdHocBurden}
                            onChange={(e) => setTimeEntryAdHocBurden(e.target.value)}
                            placeholder="0  (e.g. 0.12 for 12%)"
                            data-testid="input-adhoc-burden"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Workers' comp (decimal)</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={timeEntryAdHocWc}
                            onChange={(e) => setTimeEntryAdHocWc(e.target.value)}
                            placeholder="0  (e.g. 0.18 for 18%)"
                            data-testid="input-adhoc-wc"
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs cursor-pointer" data-testid="checkbox-adhoc-save-to-team">
                        <Checkbox
                          checked={timeEntryAdHocSaveToTeam}
                          onCheckedChange={(v) => setTimeEntryAdHocSaveToTeam(!!v)}
                        />
                        <span>Also save to my crew so I can pick them next time</span>
                      </label>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Time *</Label>
                    <Input
                      type="time"
                      value={timeEntryStartTime}
                      onChange={(e) => setTimeEntryStartTime(e.target.value)}
                      className={!timeEntryStartTime ? "border-red-500 dark:border-red-500 focus-visible:ring-red-500" : ""}
                      data-testid="input-time-entry-start"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time *</Label>
                    <Input
                      type="time"
                      value={timeEntryEndTime}
                      onChange={(e) => setTimeEntryEndTime(e.target.value)}
                      className={!timeEntryEndTime ? "border-red-500 dark:border-red-500 focus-visible:ring-red-500" : ""}
                      data-testid="input-time-entry-end"
                    />
                  </div>
                </div>
                {(() => {
                  const [sH, sM] = (timeEntryStartTime || '').split(':').map(Number);
                  const [eH, eM] = (timeEntryEndTime || '').split(':').map(Number);
                  if (isNaN(sH) || isNaN(eH)) return null;
                  const startMin = sH * 60 + (sM || 0);
                  const endMin = eH * 60 + (eM || 0);
                  const diffMin = endMin - startMin;
                  if (diffMin <= 0) {
                    return (
                      <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" data-testid="text-time-entry-invalid">
                        End time must be after start time.
                      </div>
                    );
                  }
                  const hrs = diffMin / 60;
                  return (
                    <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2 flex items-center justify-between" data-testid="text-time-entry-calculated">
                      <span className="text-xs text-muted-foreground">Total hours</span>
                      <span className="text-sm font-semibold">{hrs.toFixed(2)}h</span>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
          {(() => {
            const [sH, sM] = (timeEntryStartTime || '').split(':').map(Number);
            const [eH, eM] = (timeEntryEndTime || '').split(':').map(Number);
            const startMin = (isNaN(sH) ? 0 : sH * 60) + (sM || 0);
            const endMin = (isNaN(eH) ? 0 : eH * 60) + (eM || 0);
            const diffMin = endMin - startMin;
            const validTimes = !isNaN(sH) && !isNaN(eH) && diffMin > 0;

            // Validate ad-hoc fields when in ad-hoc mode; otherwise need at least
            // one team member checked.
            const adHocRateNum = parseFloat(timeEntryAdHocRate);
            const adHocReady = timeEntryAdHocOpen
              ? (timeEntryAdHocName.trim().length > 0 && Number.isFinite(adHocRateNum) && adHocRateNum > 0)
              : false;
            const teamReady = !timeEntryAdHocOpen && timeEntryMemberIds.length > 0;
            const canSubmit = (teamReady || adHocReady) && !!timeEntryDate && validTimes && !createTimeEntryMutation.isPending;
            const buttonLabel = timeEntryAdHocOpen
              ? 'Add Entry'
              : (timeEntryMemberIds.length > 1 ? `Add ${timeEntryMemberIds.length} Entries` : 'Add Entry');

            return (
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setShowTimeEntryDialog(false)}>Cancel</Button>
                <Button
                  disabled={!canSubmit}
                  onClick={() => {
                    const minutes = diffMin;
                    const clockIn = new Date(`${timeEntryDate}T${timeEntryStartTime}:00`).toISOString();
                    const clockOut = new Date(`${timeEntryDate}T${timeEntryEndTime}:00`).toISOString();
                    if (timeEntryAdHocOpen) {
                      const burdenNum = parseFloat(timeEntryAdHocBurden);
                      const wcNum = parseFloat(timeEntryAdHocWc);
                      const benefitsNum = parseFloat(timeEntryAdHocBenefits);
                      createTimeEntryMutation.mutate({
                        projectId: parseInt(id!),
                        clockIn, clockOut, totalMinutes: minutes,
                        adHocWorkerName: timeEntryAdHocName.trim(),
                        adHocHourlyRateCents: Math.round(adHocRateNum * 100),
                        adHocPayrollBurden: Number.isFinite(burdenNum) ? burdenNum : 0,
                        adHocWorkersComp: Number.isFinite(wcNum) ? wcNum : 0,
                        adHocBenefitsPerHour: Number.isFinite(benefitsNum) ? benefitsNum : 0,
                        saveAdHocToTeam: timeEntryAdHocSaveToTeam,
                      });
                    } else {
                      createTimeEntryMutation.mutate({
                        teamMemberIds: timeEntryMemberIds,
                        projectId: parseInt(id!),
                        clockIn, clockOut, totalMinutes: minutes,
                      });
                    }
                  }}
                  data-testid="button-add-time-entry"
                >
                  {createTimeEntryMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {buttonLabel}
                </Button>
              </DialogFooter>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={showLaborDialog} onOpenChange={(open) => {
        if (addLaborEntryMutation.isPending) return;
        setShowLaborDialog(open);
      }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-add-labor">
          <DialogHeader>
            <DialogTitle>Add Labor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="labor-date-input">Work date</Label>
              <Input
                id="labor-date-input"
                type="date"
                value={newLaborDate}
                onChange={(e) => setNewLaborDate(e.target.value)}
                className="h-10"
                data-testid="input-labor-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="labor-amount-input">Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  id="labor-amount-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="pl-7 h-10"
                  value={newLaborAmount}
                  onChange={(e) => setNewLaborAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitLaborEntry();
                    }
                  }}
                  autoFocus
                  data-testid="input-labor-amount"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="labor-note-input">Note (optional)</Label>
              <Input
                id="labor-note-input"
                type="text"
                placeholder="e.g. 2 painters, kitchen day"
                className="h-10"
                value={newLaborNote}
                onChange={(e) => setNewLaborNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitLaborEntry();
                  }
                }}
                data-testid="input-labor-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowLaborDialog(false)}
              disabled={addLaborEntryMutation.isPending}
              data-testid="button-cancel-labor"
            >
              Cancel
            </Button>
            <Button
              onClick={submitLaborEntry}
              disabled={addLaborEntryMutation.isPending || newLaborAmount.trim() === ""}
              data-testid="button-add-labor-entry"
            >
              {addLaborEntryMutation.isPending ? "Adding…" : "Add Labor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExpenseDialog} onOpenChange={(open) => {
        setShowExpenseDialog(open);
        if (!open) {
          setEditingExpense(null);
          setExpenseTitle("");
          setExpenseAmount("");
          setExpenseDescription("");
          setExpenseCategory("");
          setExpenseCategoryCustom(false);
          setExpenseVendor("");
          setExpenseReceiptDate("");
          setDuplicateWarning(null);
          setReceiptFile(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingExpense ? "Edit Expense" : "Add Expense"}</DialogTitle>
            <DialogDescription>
              {editingExpense ? "Update expense details" : "Record a new material or spending"}
            </DialogDescription>
          </DialogHeader>
          {editingExpense && (editingExpense as any).receiptImageUrl && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="relative">
                <div className="w-16 h-16 rounded-md overflow-hidden border cursor-pointer" onClick={() => setViewingReceiptUrl((editingExpense as any).receiptImageUrl)} data-testid="edit-receipt-thumb">
                  <img src={(editingExpense as any).receiptImageUrl} alt="Receipt" className="w-full h-full object-cover" loading="lazy" />
                </div>
                <button
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center text-xs shadow-sm hover:bg-destructive/90"
                  onClick={() => { if (confirm("Delete this receipt image? This cannot be undone — you'll need to scan a new receipt to add it back.")) { removeExpenseImageMutation.mutate(editingExpense.id); setEditingExpense({ ...editingExpense, receiptImageUrl: null } as any); } }}
                  data-testid="button-remove-edit-receipt"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium">Receipt attached</p>
                <p className="text-xs text-muted-foreground">Tap image to view full size</p>
              </div>
            </div>
          )}
          {!editingExpense && (
            <div className="flex gap-2">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                ref={(el) => { (window as any).__receiptCameraInput = el; }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = "";
                  await handleReceiptFile(file);
                }}
                data-testid="input-receipt-camera"
              />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={(el) => { (window as any).__receiptGalleryInput = el; }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = "";
                  await handleReceiptFile(file);
                }}
                data-testid="input-receipt-gallery"
              />
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={scanningReceipt}
                onClick={() => {
                  (window as any).__receiptCameraInput?.click();
                }}
                data-testid="button-scan-receipt"
              >
                {scanningReceipt ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 mr-2" />
                )}
                {scanningReceipt ? (scanProgress || "Scanning...") : "Take Photo"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={scanningReceipt}
                onClick={() => {
                  (window as any).__receiptGalleryInput?.click();
                }}
                data-testid="button-upload-receipt"
              >
                <Upload className="w-4 h-4 mr-2" />
                Gallery
              </Button>
            </div>
          )}
          {receiptFile && (
            <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
              <img
                src={URL.createObjectURL(receiptFile)}
                alt="Receipt"
                className="w-10 h-10 rounded object-cover"
              />
              <span className="text-xs text-muted-foreground truncate flex-1">{receiptFile.name}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReceiptFile(null)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              {expenseCategoryCustom ? (
                <div className="flex gap-2">
                  <Input
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    placeholder="Type custom category..."
                    autoFocus
                    data-testid="input-expense-custom-category"
                  />
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={() => { setExpenseCategoryCustom(false); setExpenseCategory(""); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Select value={expenseCategory} onValueChange={(val) => {
                  if (val === "__custom__") {
                    setExpenseCategoryCustom(true);
                    setExpenseCategory("");
                  } else {
                    setExpenseCategory(val);
                  }
                }}>
                  <SelectTrigger data-testid="select-expense-category">
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Materials">Materials</SelectItem>
                    <SelectItem value="Paint & Supplies">Paint & Supplies</SelectItem>
                    <SelectItem value="Equipment Rental">Equipment Rental</SelectItem>
                    <SelectItem value="Subcontractor">Subcontractor</SelectItem>
                    <SelectItem value="Travel/Gas">Travel/Gas</SelectItem>
                    <SelectItem value="Permits">Permits</SelectItem>
                    <SelectItem value="Dump/Disposal">Dump/Disposal</SelectItem>
                    <SelectItem value="Food/Meals">Food/Meals</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                    <SelectItem value="__custom__">+ Custom category...</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={expenseTitle}
                onChange={(e) => setExpenseTitle(e.target.value)}
                placeholder="e.g. Paint supplies"
                data-testid="input-expense-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-expense-amount"
                />
              </div>
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Input
                  value={expenseVendor}
                  onChange={(e) => setExpenseVendor(e.target.value)}
                  placeholder="e.g. Home Depot"
                  data-testid="input-expense-vendor"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Receipt Date</Label>
              <Input
                type="date"
                value={expenseReceiptDate}
                onChange={(e) => setExpenseReceiptDate(e.target.value)}
                data-testid="input-expense-receipt-date"
              />
              <p className="text-xs text-muted-foreground">Date on the receipt (auto-detected when scanning)</p>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
                placeholder="Additional details..."
                rows={2}
                data-testid="input-expense-description"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowExpenseDialog(false)}>Cancel</Button>
            <Button
              disabled={!expenseTitle.trim() || !expenseAmount || scanningReceipt || (editingExpense ? updateExpenseMutation.isPending : createExpenseMutation.isPending)}
              onClick={() => {
                const amountCents = Math.round(parseFloat(expenseAmount) * 100);
                const data = {
                  title: expenseTitle.trim(),
                  amount: amountCents,
                  description: expenseDescription.trim() || undefined,
                  category: expenseCategory || undefined,
                  vendor: expenseVendor.trim() || undefined,
                  receiptDate: expenseReceiptDate || undefined,
                };
                if (editingExpense) {
                  updateExpenseMutation.mutate({ expenseId: editingExpense.id, data });
                } else {
                  createExpenseMutation.mutate({ ...data, receiptImage: receiptFile || undefined });
                }
              }}
              data-testid="button-save-expense"
            >
              {(editingExpense ? updateExpenseMutation.isPending : createExpenseMutation.isPending) ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {createExpenseMutation.isPending && receiptFile ? "Uploading receipt..." : editingExpense ? "Update Expense" : "Add Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewingReceiptUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setViewingReceiptUrl(null)}
          data-testid="receipt-lightbox"
        >
          <div className="relative max-w-3xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-10 right-0 text-white hover:bg-white/20 h-8 w-8"
              onClick={() => setViewingReceiptUrl(null)}
              data-testid="button-close-receipt-lightbox"
            >
              <X className="w-5 h-5" />
            </Button>
            <img
              src={viewingReceiptUrl}
              alt="Receipt"
              className="max-w-full max-h-[85vh] rounded-lg object-contain"
            />
          </div>
        </div>
      )}

      <Dialog open={showCallConfirm} onOpenChange={setShowCallConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Place a Call?
            </DialogTitle>
            <DialogDescription>
              You are about to place a call to {maskName(project.contact.name)}
            </DialogDescription>
          </DialogHeader>
          {!hasOfficePhone && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Office phone not set. Go to Settings &gt; Integrations &gt; Twilio to add your office or cell number for call bridging.</span>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowCallConfirm(false)} data-testid="button-cancel-call">
              Cancel
            </Button>
            <Button
              disabled={makeCallMutation.isPending || !hasOfficePhone}
              onClick={() => {
                makeCallMutation.mutate(
                  { to: project.contact.phone, contactId: project.contactId, contactName: maskName(project.contact.name) },
                  {
                    onSuccess: () => {
                      setShowCallConfirm(false);
                      toast({ title: "Calling your office first", description: `Answer your office phone to connect to ${maskName(project.contact.name)}` });
                      apiRequest("POST", `/api/projects/${id}/activities`, {
                        content: `Called ${project.contact.name} at ${project.contact.phone}`,
                        type: "call",
                      }).then(() => {
                        queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
                      });
                    },
                    onError: (err: any) => {
                      toast({ title: "Call failed", description: err.message || "Could not place the call.", variant: "destructive" });
                    },
                  }
                );
              }}
              data-testid="button-confirm-call"
            >
              {makeCallMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Phone className="w-4 h-4 mr-2" />
              )}
              Call via Office Phone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OpenPhone Call Options Dialog */}
      <Dialog open={showOpenPhoneCallDialog} onOpenChange={setShowOpenPhoneCallDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Call {maskName(project.contact.name)}
            </DialogTitle>
            <DialogDescription>
              Your phone system is set to OpenPhone. You can call using the OpenPhone app, or use your device's phone dialer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button 
              variant="outline" 
              className="gap-2 justify-start"
              onClick={() => {
                setShowOpenPhoneCallDialog(false);
                window.open(`https://app.openphone.com`, '_blank');
              }}
              data-testid="button-call-openphone-app"
            >
              <Phone className="w-4 h-4" />
              Open OpenPhone App
            </Button>
            <Button 
              variant="outline" 
              className="gap-2 justify-start"
              onClick={() => {
                setShowOpenPhoneCallDialog(false);
                window.location.href = `tel:${project.contact.phone}`;
              }}
              data-testid="button-call-device-dialer"
            >
              <Phone className="w-4 h-4" />
              Call from Device
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowOpenPhoneCallDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAppointmentDialog} onOpenChange={setShowAppointmentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Appointment</DialogTitle>
            <DialogDescription>
              Schedule an appointment with {maskName(project.contact.name)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={appointmentType} onValueChange={setAppointmentType}>
                <SelectTrigger className="h-9" data-testid="select-appointment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="site_visit">On-Site Visit</SelectItem>
                  <SelectItem value="estimate">Proposal</SelectItem>
                  <SelectItem value="walkthrough">Walk-Through</SelectItem>
                  <SelectItem value="payment">Collect Payment</SelectItem>
                  <SelectItem value="callback">Callback</SelectItem>
                  <SelectItem value="follow_up">Follow-Up</SelectItem>
                  <SelectItem value="phone_call">Phone Call</SelectItem>
                  <SelectItem value="text_schedule">Text Follow-Up</SelectItem>
                  <SelectItem value="check_in">Check-In</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4 items-start">
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input
                  type="date"
                  className="h-[44px]"
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  data-testid="input-appointment-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Time</Label>
                <Select
                  value={appointmentTime || ''}
                  onValueChange={(value) => setAppointmentTime(value)}
                >
                  <SelectTrigger className="h-[44px]" data-testid="select-appointment-time">
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
                value={appointmentNotes}
                onChange={(e) => setAppointmentNotes(e.target.value)}
                placeholder="Any additional details..."
                rows={2}
                className="min-h-0"
                data-testid="input-appointment-notes"
              />
            </div>
            {allTeamMembers.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Assign To</Label>
                <Select
                  value={appointmentAssignee ? String(appointmentAssignee) : 'unassigned'}
                  onValueChange={(value) => setAppointmentAssignee(value === 'unassigned' ? null : Number(value))}
                >
                  <SelectTrigger className="h-9" data-testid="select-appointment-assignee">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {allTeamMembers.map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.name}{m.role ? ` (${m.role})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border p-2.5">
              <div>
                <Label className="text-sm font-medium">Notify customer</Label>
                <p className="text-xs text-muted-foreground">Send confirmation via SMS & email</p>
              </div>
              <Switch
                checked={appointmentNotify}
                onCheckedChange={(checked) => setAppointmentNotify(checked === true)}
                data-testid="switch-notify-customer"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAppointmentDialog(false)} data-testid="button-cancel-appointment">
              Cancel
            </Button>
            <Button
              disabled={!appointmentDate || createAppointmentMutation.isPending}
              onClick={() => {
                createAppointmentMutation.mutate({
                  contactId: project.contactId,
                  type: appointmentType,
                  date: appointmentDate,
                  time: appointmentTime || undefined,
                  notes: appointmentNotes || undefined,
                  sendNotification: appointmentNotify,
                  assignedToId: appointmentAssignee,
                });
              }}
              data-testid="button-save-appointment"
            >
              {createAppointmentMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CalendarPlus className="w-4 h-4 mr-2" />
              )}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingAppointment && (
        <EditAppointmentDialog
          appointment={editingAppointment}
          open={!!editingAppointment}
          onOpenChange={(open) => { if (!open) setEditingAppointment(null); }}
          contactName={maskName(editingAppointment.contact?.name || project.contact.name)}
        />
      )}

      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Complete Project</DialogTitle>
            <DialogDescription>
              Mark this project as finished.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <Label htmlFor="send-review" className="text-sm font-medium">Send review request</Label>
              <p className="text-xs text-muted-foreground">Send a thank-you message asking the customer for a review</p>
            </div>
            <Switch
              id="send-review"
              checked={sendReviewRequest}
              onCheckedChange={setSendReviewRequest}
              data-testid="switch-send-review"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompleteDialog(false)} data-testid="button-cancel-complete">
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowCompleteDialog(false);
                updateStageMutation.mutate({ stage: 'completed', sendReviewRequest });
              }}
              disabled={updateStageMutation.isPending}
              data-testid="button-confirm-complete"
            >
              {updateStageMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
              Complete Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deferredNotification} onOpenChange={(open) => { if (!open) setDeferredNotification(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              Outside Business Hours
            </DialogTitle>
            <DialogDescription>
              {deferredNotification?.templateSlug === 'job_scheduled'
                ? "The scheduling confirmation to the customer is set to send during your next business hours."
                : "The notification to the customer is set to send during your next business hours."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 px-3 rounded-lg bg-muted text-sm">
            Scheduled for: <span className="font-medium">{deferredNotification?.nextBusinessWindow ? format(new Date(deferredNotification.nextBusinessWindow), "EEEE, MMM d 'at' h:mm a") : ''}</span>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                if (deferredNotification) {
                  apiRequest("POST", `/api/automations/${deferredNotification.automationId}/cancel`)
                    .then(() => toast({ title: "Notification cancelled" }))
                    .catch(() => toast({ title: "Failed to cancel", variant: "destructive" }));
                }
                setDeferredNotification(null);
              }}
              data-testid="button-cancel-deferred"
            >
              <X className="w-4 h-4 mr-1.5" />
              Don't Send
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDeferredNotification(null)}
              data-testid="button-keep-scheduled"
            >
              <Clock className="w-4 h-4 mr-1.5" />
              Keep Scheduled
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                if (deferredNotification) {
                  apiRequest("POST", `/api/automations/${deferredNotification.automationId}/force-send`)
                    .then(() => toast({ title: "Notification sent now" }))
                    .catch(() => toast({ title: "Failed to send", variant: "destructive" }));
                }
                setDeferredNotification(null);
              }}
              data-testid="button-send-now"
            >
              <Send className="w-4 h-4 mr-1.5" />
              Send Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="max-w-[min(28rem,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Schedule Project</DialogTitle>
            <DialogDescription>
              Set when work starts and add work days
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Start Date</Label>
              <Popover open={schedStartCalOpen} onOpenChange={setSchedStartCalOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal h-10", !schedStartDate && "text-muted-foreground")}
                    data-testid="input-schedule-start-date"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {schedStartDate ? format(parseISO(schedStartDate), "EEE, MMM d, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarWidget
                    mode="single"
                    selected={schedStartDate ? parseISO(schedStartDate) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        const val = format(date, "yyyy-MM-dd");
                        const prevStart = schedStartDate;
                        setSchedStartDate(val);
                        setSchedStartCalOpen(false);
                        if (schedEndDate) {
                          setWorkDays(generateWorkDays(val, schedEndDate, schedStartTime, schedEndTime, schedIncludeSat, schedIncludeSun));
                        } else {
                          setWorkDays(prev => {
                            if (prev.length === 0) {
                              return [{ date: val, startTime: schedStartTime, endTime: schedEndTime, notes: "" }];
                            }
                            if (prevStart && prev.length > 0 && prev[0].date === prevStart) {
                              const updated = [...prev];
                              updated[0] = { ...updated[0], date: val };
                              return updated;
                            }
                            return prev;
                          });
                        }
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Clock In</Label>
                <Select value={schedStartTime} onValueChange={(val) => {
                  setSchedStartTime(val);
                  if (schedEndDate && schedStartDate) {
                    setWorkDays(generateWorkDays(schedStartDate, schedEndDate, val, schedEndTime, schedIncludeSat, schedIncludeSun));
                  }
                }}>
                  <SelectTrigger data-testid="input-schedule-clock-in" className="h-10">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_TIME_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Clock Out</Label>
                <Select value={schedEndTime} onValueChange={(val) => {
                  setSchedEndTime(val);
                  if (schedEndDate && schedStartDate) {
                    setWorkDays(generateWorkDays(schedStartDate, schedEndDate, schedStartTime, val, schedIncludeSat, schedIncludeSun));
                  }
                }}>
                  <SelectTrigger data-testid="input-schedule-clock-out" className="h-10">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_TIME_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-3 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Finish Date <span className="font-normal">(optional)</span></Label>
              <Popover open={schedEndCalOpen} onOpenChange={setSchedEndCalOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal h-10", !schedEndDate && "text-muted-foreground")}
                    data-testid="input-schedule-end-date"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {schedEndDate ? format(parseISO(schedEndDate), "EEE, MMM d, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarWidget
                    mode="single"
                    selected={schedEndDate ? parseISO(schedEndDate) : undefined}
                    disabled={schedStartDate ? { before: parseISO(schedStartDate) } : undefined}
                    defaultMonth={schedStartDate ? parseISO(schedStartDate) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        const finishDate = format(date, "yyyy-MM-dd");
                        setSchedEndDate(finishDate);
                        setSchedEndCalOpen(false);
                        if (schedStartDate) {
                          setWorkDays(generateWorkDays(schedStartDate, finishDate, schedStartTime, schedEndTime, schedIncludeSat, schedIncludeSun));
                        }
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {schedEndDate && schedStartDate && (
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer" data-testid="label-include-saturday">
                    <input
                      type="checkbox"
                      checked={schedIncludeSat}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSchedIncludeSat(checked);
                        setWorkDays(generateWorkDays(schedStartDate, schedEndDate, schedStartTime, schedEndTime, checked, schedIncludeSun));
                      }}
                      className="rounded border-input"
                      data-testid="checkbox-include-saturday"
                    />
                    <span className="text-xs">Include Sat</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer" data-testid="label-include-sunday">
                    <input
                      type="checkbox"
                      checked={schedIncludeSun}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSchedIncludeSun(checked);
                        setWorkDays(generateWorkDays(schedStartDate, schedEndDate, schedStartTime, schedEndTime, schedIncludeSat, checked));
                      }}
                      className="rounded border-input"
                      data-testid="checkbox-include-sunday"
                    />
                    <span className="text-xs">Include Sun</span>
                  </label>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Auto-fills weekday work days with the clock times above
              </p>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Work Days</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newDate = schedStartDate && workDays.length === 0 ? schedStartDate : "";
                    setWorkDays(prev => [...prev, { date: newDate, startTime: schedStartTime, endTime: schedEndTime, notes: "" }]);
                  }}
                  data-testid="button-add-work-day"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Day
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                These appear on the crew calendar
              </p>

              {existingScheduleDates.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {existingScheduleDates.map((sd) => {
                    const timeLabel = SCHEDULE_TIME_OPTIONS.find(t => t.value === sd.startTime)?.label || sd.startTime;
                    const endLabel = SCHEDULE_TIME_OPTIONS.find(t => t.value === sd.endTime)?.label || sd.endTime;
                    const todayStr = format(new Date(), "yyyy-MM-dd");
                    const isPast = sd.date < todayStr;
                    const hasWork = workedDates.includes(sd.date);
                    const canDelete = !isPast && !hasWork;
                    return (
                      <div key={sd.id} className={cn("flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs", isPast || hasWork ? "bg-muted/30 opacity-60" : "bg-muted/50")} data-testid={`schedule-date-existing-${sd.id}`}>
                        <Calendar className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium">{format(new Date(sd.date + "T00:00:00"), "EEE, MMM d")}</span>
                        {sd.startTime && (
                          <span className="text-muted-foreground">
                            {timeLabel}{sd.endTime ? ` – ${endLabel}` : ""}
                          </span>
                        )}
                        {hasWork && <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-auto">Worked</span>}
                        {canDelete ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 ml-auto flex-shrink-0"
                            onClick={() => deleteScheduleDateMutation.mutate(sd.id)}
                            data-testid={`button-delete-schedule-date-${sd.id}`}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        ) : !hasWork ? (
                          <Lock className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              {workDays.map((wd, idx) => (
                <div key={idx} className="mb-2 p-2 border rounded-md" data-testid={`work-day-row-${idx}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("flex-1 min-w-0 h-9 justify-start text-left font-normal text-sm", !wd.date && "text-muted-foreground")}
                          data-testid={`input-work-day-date-${idx}`}
                        >
                          <Calendar className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" />
                          {wd.date ? format(parseISO(wd.date), "EEE, MMM d") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarWidget
                          mode="single"
                          selected={wd.date ? parseISO(wd.date) : undefined}
                          onSelect={(date) => {
                            if (date) {
                              const updated = [...workDays];
                              updated[idx].date = format(date, "yyyy-MM-dd");
                              setWorkDays(updated);
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 flex-shrink-0"
                      onClick={() => setWorkDays(prev => prev.filter((_, i) => i !== idx))}
                      data-testid={`button-remove-work-day-${idx}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Select
                      value={wd.startTime}
                      onValueChange={(val) => {
                        const updated = [...workDays];
                        updated[idx].startTime = val;
                        setWorkDays(updated);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid={`input-work-day-start-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCHEDULE_TIME_OPTIONS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={wd.endTime}
                      onValueChange={(val) => {
                        const updated = [...workDays];
                        updated[idx].endTime = val;
                        setWorkDays(updated);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid={`input-work-day-end-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCHEDULE_TIME_OPTIONS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="text"
                    placeholder="Notes (optional)"
                    value={wd.notes}
                    onChange={(e) => {
                      const updated = [...workDays];
                      updated[idx].notes = e.target.value;
                      setWorkDays(updated);
                    }}
                    className="text-xs mt-1.5 h-7"
                    data-testid={`input-work-day-notes-${idx}`}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="border-t pt-3">
            <label className="flex items-center gap-2 cursor-pointer" data-testid="label-notify-customer">
              <input
                type="checkbox"
                checked={schedNotifyCustomer}
                onChange={(e) => setSchedNotifyCustomer(e.target.checked)}
                className="rounded border-input"
                data-testid="checkbox-notify-customer"
              />
              <span className="text-sm">Notify customer about scheduling</span>
            </label>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              disabled={!schedStartDate || scheduleProjectMutation.isPending || addWorkDaysMutation.isPending}
              onClick={async () => {
                try {
                  const finalEndDate = schedEndDate || (workDays.length > 0 ? [...workDays].filter(d => d.date).sort((a, b) => b.date.localeCompare(a.date))[0]?.date : "") || schedStartDate;
                  await scheduleProjectMutation.mutateAsync({
                    scheduledDate: schedStartDate,
                    scheduledTime: schedStartTime,
                    scheduledEndDate: finalEndDate,
                    scheduledEndTime: schedEndTime,
                    notifyCustomer: schedNotifyCustomer,
                  });
                  if (workDays.length > 0) {
                    const validDays = workDays.filter(d => d.date);
                    if (validDays.length > 0) {
                      await addWorkDaysMutation.mutateAsync(validDays);
                    }
                  }
                } catch {
                }
              }}
              className="w-full"
              data-testid="button-save-schedule"
            >
              {scheduleProjectMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Calendar className="w-4 h-4 mr-2" />
              )}
              Schedule Project
            </Button>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)} className="w-full" data-testid="button-cancel-schedule">
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {createDocType && (
        <CreateDocumentDialog
          contactId={project.contactId}
          projectId={project.id}
          defaultDocType={createDocType}
          autoOpen={true}
          onClose={() => setCreateDocType(null)}
          onDocumentCreated={(docId) => {
            setCreateDocType(null);
            queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
            queryClient.invalidateQueries({ queryKey: ["/api/documents", "project", id] });
            queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/activities`] });
            setLocation(`/documents/${docId}`);
          }}
        />
      )}

      <EditProjectDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        project={project}
        onDelete={() => setShowDeleteConfirm(true)}
      />

      <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Project</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive <span className="font-semibold">{maskProjectTitle(project.title, project.contact?.name)}</span> and cancel all scheduled automations (follow-ups, reminders). The project will be hidden from your main list but can be restored later. Automations will NOT restart automatically if you restore it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-archive">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveMutation.mutate()}
              data-testid="button-confirm-archive"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-sm" data-testid="dialog-request-review">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              Request a Review
            </DialogTitle>
            <DialogDescription>
              Send a review request to {project.contact?.name || 'the customer'}. Choose the message that fits the current project status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <button
              className="w-full text-left p-4 rounded-lg border-2 border-transparent hover:border-primary/50 bg-muted/50 hover:bg-muted transition-all"
              onClick={() => requestReviewMutation.mutate('in_progress')}
              disabled={requestReviewMutation.isPending}
              data-testid="button-review-in-progress"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                  <Wrench className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="font-medium text-sm">In Progress</p>
                  <p className="text-xs text-muted-foreground">"If you're loving the work so far, leave us a quick review!"</p>
                </div>
              </div>
            </button>
            <button
              className="w-full text-left p-4 rounded-lg border-2 border-transparent hover:border-primary/50 bg-muted/50 hover:bg-muted transition-all"
              onClick={() => requestReviewMutation.mutate('completed')}
              disabled={requestReviewMutation.isPending}
              data-testid="button-review-completed"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium text-sm">Completed</p>
                  <p className="text-xs text-muted-foreground">"We've finished the job — we'd love your honest review!"</p>
                </div>
              </div>
            </button>
          </div>
          {requestReviewMutation.isPending && (
            <p className="text-xs text-muted-foreground text-center">Sending review request...</p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showStopFollowupsConfirm} onOpenChange={setShowStopFollowupsConfirm}>
        <AlertDialogContent data-testid="dialog-stop-followups-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Stop Automated Follow-ups?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel all scheduled automated follow-ups for {maskName(project.contact?.name) || "this contact"}. The sequence will be paused and you'll be able to set a manual reminder or resume the sequence later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-stop-followups">Keep Running</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-stop-followups"
              onClick={async () => {
                try {
                  await apiRequest("PATCH", `/api/contacts/${project.contactId}`, {
                    pauseAutomations: true,
                  });
                  await apiRequest("POST", "/api/automations/cancel", {
                    contactId: project.contactId,
                    category: "lead_followup",
                  });
                  await apiRequest("POST", "/api/automations/cancel", {
                    contactId: project.contactId,
                    category: "followup_not_viewed",
                  });
                  await apiRequest("POST", "/api/automations/cancel", {
                    contactId: project.contactId,
                    category: "followup_viewed",
                  });
                  queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "next-automation"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
                  toast({ title: "Follow-ups stopped", description: "All scheduled follow-ups have been cancelled. You can resume them or set a manual reminder." });
                } catch (err) {
                  toast({ title: "Error", description: "Failed to stop follow-ups", variant: "destructive" });
                }
              }}
            >
              Stop Follow-ups
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showLostDialog} onOpenChange={setShowLostDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Lost</DialogTitle>
            <DialogDescription>
              This project will be moved to your Job History. You can optionally select a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Reason (optional)</Label>
            <Select value={lostReason} onValueChange={setLostReason}>
              <SelectTrigger data-testid="select-lost-reason">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="went_with_competitor">Went with another contractor</SelectItem>
                <SelectItem value="price_too_high">Price too high</SelectItem>
                <SelectItem value="not_responding">Customer not responding</SelectItem>
                <SelectItem value="not_a_good_fit">Not a good fit</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLostDialog(false)} data-testid="button-cancel-lost">Cancel</Button>
            <Button
              onClick={async () => {
                await apiRequest("PUT", `/api/projects/${id}`, { stage: 'lost', lostReason: lostReason || null });
                queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
                queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                toast({ title: "Project marked as lost", description: "Moved to Job History." });
                setShowLostDialog(false);
              }}
              data-testid="button-confirm-lost"
            >
              Mark as Lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeleteLaborId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteLaborId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete labor entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This labor entry will be permanently removed from this job and the running labor total. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-labor">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteLaborId !== null) {
                  deleteLaborEntryMutation.mutate(confirmDeleteLaborId);
                  setConfirmDeleteLaborId(null);
                }
              }}
              data-testid="button-confirm-delete-labor"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteExpenseId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteExpenseId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this receipt?</AlertDialogTitle>
            <AlertDialogDescription>
              This receipt and its photo will be permanently removed from this job and the cost totals. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-expense">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteExpenseId !== null) {
                  deleteExpenseMutation.mutate(confirmDeleteExpenseId);
                  setConfirmDeleteExpenseId(null);
                }
              }}
              data-testid="button-confirm-delete-expense"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold">{maskProjectTitle(project.title, project.contact?.name)}</span> and all its activity notes. The contact and any documents will remain. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteProjectMutation.mutate()}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showReminderDialog} onOpenChange={setShowReminderDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-set-reminder">
          <DialogHeader>
            <DialogTitle>Set Reminder</DialogTitle>
            <DialogDescription>
              Schedule a reminder to follow up with {maskName(project.contact?.name) || "this contact"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Action Type</Label>
              <Select value={reminderType} onValueChange={setReminderType}>
                <SelectTrigger data-testid="select-reminder-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      Call
                    </div>
                  </SelectItem>
                  <SelectItem value="message">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Message
                    </div>
                  </SelectItem>
                  <SelectItem value="follow_up">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4" />
                      Follow Up
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  data-testid="input-reminder-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  data-testid="input-reminder-time"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input
                placeholder="e.g., Follow up about the estimate"
                value={reminderNote}
                onChange={(e) => setReminderNote(e.target.value)}
                data-testid="input-reminder-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReminderDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!reminderDate || !reminderTime) {
                  toast({ title: "Date and time required", variant: "destructive" });
                  return;
                }
                setReminderMutation.mutate({
                  reminderAt: new Date(`${reminderDate}T${reminderTime}`).toISOString(),
                  reminderType,
                  reminderNote,
                });
              }}
              disabled={setReminderMutation.isPending}
              data-testid="button-save-reminder"
            >
              {setReminderMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Set Reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddRecipientDialog} onOpenChange={(open) => {
        setShowAddRecipientDialog(open);
        if (!open) {
          setRecipientName('');
          setRecipientEmail('');
          setRecipientPhone('');
          setRecipientContactId(null);
          setRecipientAddress('');
          setRecipientCity('');
          setRecipientState('');
          setRecipientZip('');
          setUseClientAddress(false);
          setSaveAsContact(false);
          setRecipientMode('manual');
        }
      }}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-add-recipient">
          <DialogHeader>
            <DialogTitle>Add Additional Recipient</DialogTitle>
            <DialogDescription>
              Add someone else who should receive documents for this project. They won't get their own project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Button
                variant={recipientMode === 'manual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setRecipientMode('manual'); setRecipientContactId(null); }}
                data-testid="button-mode-manual"
              >
                Enter Details
              </Button>
              <Button
                variant={recipientMode === 'contact' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRecipientMode('contact')}
                data-testid="button-mode-contact"
              >
                Pick Contact
              </Button>
            </div>

            {recipientMode === 'contact' ? (
              <div className="space-y-2">
                <Label>Select Contact</Label>
                <Select
                  value={recipientContactId?.toString() || ''}
                  onValueChange={(v) => {
                    const cid = parseInt(v);
                    setRecipientContactId(cid);
                    const c = allContacts?.find(ct => ct.id === cid);
                    if (c) {
                      setRecipientName(c.name);
                      setRecipientEmail(c.email || '');
                      setRecipientPhone(c.phone || '');
                      setRecipientAddress(c.address || '');
                      setRecipientCity(c.city || '');
                      setRecipientState(c.state || '');
                      setRecipientZip(c.zipCode || '');
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-recipient-contact">
                    <SelectValue placeholder="Choose a contact..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allContacts?.filter(c => c.id !== project.contactId).map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name} {c.phone ? `- ${c.phone}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Recipient name"
                    data-testid="input-recipient-name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="email@example.com"
                      data-testid="input-recipient-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(stripPhoneInput(e.target.value))}
                      placeholder="+15551234567"
                      inputMode="tel"
                      data-testid="input-recipient-phone"
                    />
                    {recipientPhone && recipientPhone.length > 0 && !isValidPhone(recipientPhone) && (
                      <p className="text-xs text-amber-500 mt-1">Enter a valid US/Canada phone number</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    id="useClientAddress"
                    checked={useClientAddress}
                    onChange={(e) => {
                      setUseClientAddress(e.target.checked);
                      if (e.target.checked && project.contact) {
                        setRecipientAddress(project.contact.address || '');
                        setRecipientCity(project.contact.city || '');
                        setRecipientState(project.contact.state || '');
                        setRecipientZip(project.contact.zipCode || '');
                      }
                    }}
                    className="h-4 w-4 rounded border-input"
                    data-testid="checkbox-use-client-address"
                  />
                  <Label htmlFor="useClientAddress" className="text-sm cursor-pointer">
                    Use same address as {project.contact?.name || 'primary client'}
                  </Label>
                </div>
                {!useClientAddress && (
                  <div className="space-y-2">
                    <div className="space-y-2">
                      <Label className="text-xs">Street Address</Label>
                      <AddressAutocomplete
                        value={recipientAddress}
                        onChange={(value) => setRecipientAddress(value)}
                        onAddressSelect={(components) => {
                          setRecipientAddress([components.streetNumber, components.route].filter(Boolean).join(' '));
                          setRecipientCity(components.city);
                          setRecipientState(components.state);
                          setRecipientZip(components.zipCode);
                        }}
                        placeholder="123 Main St"
                        data-testid="input-recipient-address"
                      />
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      <Input
                        placeholder="City"
                        value={recipientCity}
                        onChange={(e) => setRecipientCity(e.target.value)}
                        className="col-span-2"
                        data-testid="input-recipient-city"
                      />
                      <Input
                        placeholder="ST"
                        value={recipientState}
                        onChange={(e) => setRecipientState(e.target.value)}
                        className="col-span-1"
                        data-testid="input-recipient-state"
                      />
                      <Input
                        placeholder="ZIP"
                        value={recipientZip}
                        onChange={(e) => setRecipientZip(e.target.value.replace(/\D/g, ''))}
                        inputMode="numeric"
                        className="col-span-2"
                        data-testid="input-recipient-zip"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRecipientDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!recipientName.trim()) {
                  toast({ title: "Name is required", variant: "destructive" });
                  return;
                }
                if (recipientPhone.length > 0 && !isValidPhone(recipientPhone)) {
                  toast({ title: "Invalid phone number", description: "Enter a valid US/Canada phone number", variant: "destructive" });
                  return;
                }
                addRecipientMutation.mutate({
                  name: recipientName.trim(),
                  email: recipientEmail.trim() || undefined,
                  phone: recipientPhone ? normalizePhone(recipientPhone) : undefined,
                  contactId: recipientContactId,
                  address: recipientAddress.trim() || undefined,
                  city: recipientCity.trim() || undefined,
                  state: recipientState.trim() || undefined,
                  zipCode: recipientZip.trim() || undefined,
                });
              }}
              disabled={addRecipientMutation.isPending || !recipientName.trim()}
              data-testid="button-save-recipient"
            >
              {addRecipientMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Recipient
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditProjectDialog({
  open,
  onOpenChange,
  project,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectWithDetails;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description || "");
  const [source, setSource] = useState(project.source || "");
  const [leadQuality, setLeadQuality] = useState(project.leadQuality || "");
  const [jobAddress, setJobAddress] = useState(project.jobAddress || "");
  const [jobCity, setJobCity] = useState(project.jobCity || "");
  const [jobState, setJobState] = useState(project.jobState || "");
  const [jobZipCode, setJobZipCode] = useState(project.jobZipCode || "");
  const [scheduledDate, setScheduledDate] = useState(project.scheduledDate || "");
  const [scheduledTime, setScheduledTime] = useState(project.scheduledTime || "");
  const [scheduledEndDate, setScheduledEndDate] = useState((project as any).scheduledEndDate || "");
  const [scheduledEndTime, setScheduledEndTime] = useState((project as any).scheduledEndTime || "");
  const [totalAmount, setTotalAmount] = useState(
    project.totalAmount ? (project.totalAmount / 100).toString() : ""
  );

  const leadSources = [
    { value: "google", label: "Google" },
    { value: "thumbtack", label: "Thumbtack" },
    { value: "facebook", label: "Facebook" },
    { value: "angi", label: "Angi" },
    { value: "yelp", label: "Yelp" },
    { value: "networx", label: "Networx" },
    { value: "website", label: "Website Form" },
    { value: "referral", label: "Referral" },
    { value: "word_of_mouth", label: "Word of Mouth" },
    { value: "social_media", label: "Social Media" },
    { value: "cold_call", label: "Cold Call / Phone" },
    { value: "repeat_customer", label: "Repeat Customer" },
    { value: "trade_show", label: "Trade Show" },
  ];

  const [showCustomSource, setShowCustomSource] = useState(() => {
    const known = leadSources.map(s => s.value);
    return !!(project.source && !known.includes(project.source));
  });
  const [customSource, setCustomSource] = useState(() => {
    const known = leadSources.map(s => s.value);
    return project.source && !known.includes(project.source) ? project.source : "";
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", `/api/projects/${project.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project updated" });
      onOpenChange(false);
    },
  });

  const handleSave = () => {
    const finalSource = showCustomSource ? customSource.trim() : source;
    updateMutation.mutate({
      title: title.trim(),
      description: description.trim() || null,
      source: finalSource || null,
      leadQuality: leadQuality || null,
      jobAddress: jobAddress.trim() || null,
      jobCity: jobCity.trim() || null,
      jobState: jobState.trim() || null,
      jobZipCode: jobZipCode.trim() || null,
      scheduledDate: scheduledDate || null,
      scheduledTime: scheduledTime || null,
      scheduledEndDate: scheduledEndDate || null,
      scheduledEndTime: scheduledEndTime || null,
      totalAmount: totalAmount ? Math.round(parseFloat(totalAmount) * 100) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>Update project details</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 -mx-6 px-6">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-edit-title" />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} data-testid="input-edit-description" />
          </div>

          <div className="space-y-2">
            <Label>Source</Label>
            <Select
              value={showCustomSource ? "_other" : source}
              onValueChange={(val) => {
                if (val === "_other") {
                  setShowCustomSource(true);
                  setSource("");
                } else {
                  setShowCustomSource(false);
                  setCustomSource("");
                  setSource(val);
                }
              }}
            >
              <SelectTrigger data-testid="select-edit-source">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {leadSources.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
                <SelectItem value="_other">Other (custom)</SelectItem>
              </SelectContent>
            </Select>
            {showCustomSource && (
              <Input
                placeholder="Custom source..."
                value={customSource}
                onChange={(e) => setCustomSource(e.target.value)}
                data-testid="input-edit-custom-source"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Lead Quality</Label>
            <Select value={leadQuality || "_none"} onValueChange={(val) => setLeadQuality(val === "_none" ? "" : val)}>
              <SelectTrigger data-testid="select-edit-lead-quality">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Not set</SelectItem>
                <SelectItem value="good">Good Lead</SelectItem>
                <SelectItem value="bad">Bad Lead</SelectItem>
                <SelectItem value="not_qualified">Not Qualified</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Estimated Amount</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              data-testid="input-edit-amount"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} data-testid="input-edit-scheduled-date" />
            </div>
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} data-testid="input-edit-scheduled-time" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={scheduledEndDate} onChange={(e) => setScheduledEndDate(e.target.value)} data-testid="input-edit-scheduled-end-date" />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input type="time" value={scheduledEndTime} onChange={(e) => setScheduledEndTime(e.target.value)} data-testid="input-edit-scheduled-end-time" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Job Address</Label>
            <AddressAutocomplete
              value={jobAddress}
              onChange={setJobAddress}
              onAddressSelect={(components: AddressComponents) => {
                setJobAddress([components.streetNumber, components.route].filter(Boolean).join(' '));
                setJobCity(components.city);
                setJobState(components.state);
                setJobZipCode(components.zipCode);
              }}
              placeholder="Street address"
              data-testid="input-edit-job-address"
            />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="City" value={jobCity} onChange={(e) => setJobCity(e.target.value)} data-testid="input-edit-job-city" />
              <Input placeholder="State" value={jobState} onChange={(e) => setJobState(e.target.value)} data-testid="input-edit-job-state" />
              <Input placeholder="Zip" value={jobZipCode} onChange={(e) => setJobZipCode(e.target.value)} data-testid="input-edit-job-zip" />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t">
          <Button variant="destructive" size="sm" onClick={onDelete} data-testid="button-delete-project">
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-project">
            {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectCoiUpload({ project }: { project: ProjectWithDetails }) {
  const { toast } = useToast();
  const { uploadFile, isUploading } = useUpload();
  const coiInputRef = useRef<HTMLInputElement>(null);

  const updateMutation = useMutation({
    mutationFn: async (coiFilePath: string | null) => {
      await apiRequest("PUT", `/api/projects/${project.id}`, { coiFilePath });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
    },
  });

  const handleCoiUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!allowed.includes(file.type)) {
      toast({ title: "Please select a PDF or image file", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File must be less than 10MB", variant: "destructive" });
      return;
    }
    const result = await uploadFile(file);
    if (result) {
      updateMutation.mutate(result.objectPath, {
        onSuccess: () => toast({ title: "COI uploaded and saved" }),
        onError: () => toast({ title: "Failed to save COI", variant: "destructive" }),
      });
    }
  };

  const handleRemoveCoi = () => {
    updateMutation.mutate(null, {
      onSuccess: () => toast({ title: "COI removed" }),
      onError: () => toast({ title: "Failed to remove COI", variant: "destructive" }),
    });
  };

  return (
    <div className="mt-4 border rounded-lg p-4" data-testid="project-coi-section">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-semibold">Certificate of Insurance (COI)</h4>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Upload a COI for this project. It will be available for the customer to download on the proposal.</p>

      <input
        ref={coiInputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
        onChange={handleCoiUpload}
        className="hidden"
        data-testid="input-project-coi-upload"
      />

      {(project as any).coiFilePath ? (
        <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
          <FileText className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" data-testid="text-project-coi-uploaded">COI Uploaded</p>
            <p className="text-xs text-muted-foreground">{/\.(jpg|jpeg|png|webp|heic)$/i.test((project as any).coiFilePath || '') ? 'Image' : 'PDF'} document</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { const p = (project as any).coiFilePath; window.open(p?.startsWith('/objects/') ? p : `/objects/${p}`, '_blank'); }}
              data-testid="button-view-project-coi"
            >
              View
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => coiInputRef.current?.click()}
              disabled={isUploading || updateMutation.isPending}
              data-testid="button-replace-project-coi"
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Replace'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveCoi}
              disabled={updateMutation.isPending}
              data-testid="button-remove-project-coi"
            >
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => coiInputRef.current?.click()}
          disabled={isUploading || updateMutation.isPending}
          data-testid="button-upload-project-coi"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          Upload COI (PDF/Image)
        </Button>
      )}
    </div>
  );
}
