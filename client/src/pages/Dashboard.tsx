import { useState, useCallback, useEffect, useRef } from "react";
import { useDashboardPipeline } from "@/hooks/use-dashboard";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Phone, DollarSign, Clock, ArrowRight,
  FileSignature, Receipt, Plus, UserPlus,
  Briefcase, CalendarCheck, Hammer, MessageSquare, MapPin, User,
  PhoneMissed, ChevronRight, ChevronDown, ChevronUp, TrendingUp, Bell, AlertTriangle, Pause, Calendar, CalendarPlus,
  Target, ArrowUpRight, ArrowDownRight, BarChart3, ShoppingBag, Sparkles, X, Heart, Pencil
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { differenceInDays, formatDistanceToNowStrict, format } from "date-fns";
import { cn } from "@/lib/utils";
import type { ProjectWithContact } from "@shared/schema";
import { FeatureTipBanner } from "@/components/FeatureTipBanner";
import { AppointmentCard } from "@/components/AppointmentCard";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { AssignedJob, ClockInBanner, useClockInOverlay, formatTime } from "@/pages/MyJobs";

type AttentionType = 'low_sentiment' | 'reminder' | 'paused' | 'needs_scheduling' | 'idle';
const ATTENTION_PRIORITY: Record<AttentionType, number> = {
  low_sentiment: 1,
  reminder: 2,
  paused: 3,
  needs_scheduling: 4,
  idle: 5,
};

function situationHash(p: ProjectWithContact): string {
  return `${p.stage}|${p.stageChangedAt || ''}|${(p as any).automationPausedAt || ''}|${p.reminderAt || ''}|${(p as any).scheduledDate || ''}|${(p as any).sentimentScore ?? ''}`;
}

const DISMISS_STORAGE_KEY = 'dismissed_attention';

function getDismissedAttentionMap(): Record<string, string> {
  try {
    Object.keys(localStorage).filter(k => k.startsWith('dismissed_attention_')).forEach(k => localStorage.removeItem(k));
    const stored = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {};
}

function isProjectDismissed(map: Record<string, string>, projectId: number, hash: string): boolean {
  return map[`project-${projectId}`] === hash;
}

function dismissProject(projectId: number, hash: string) {
  const map = getDismissedAttentionMap();
  map[`project-${projectId}`] = hash;
  localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(map));
}


interface ConsolidatedAttentionItem {
  projectId: number;
  project: ProjectWithContact;
  primaryType: AttentionType;
  allTypes: AttentionType[];
  dismissKey: string;
  hash: string;
}

function consolidateAttentionItems(
  rawItems: Array<{ type: AttentionType; project: ProjectWithContact }>
): ConsolidatedAttentionItem[] {
  const byProject = new Map<number, { project: ProjectWithContact; types: AttentionType[] }>();
  for (const item of rawItems) {
    const existing = byProject.get(item.project.id);
    if (existing) {
      if (!existing.types.includes(item.type)) existing.types.push(item.type);
    } else {
      byProject.set(item.project.id, { project: item.project, types: [item.type] });
    }
  }
  return Array.from(byProject.values()).map(({ project, types }) => {
    const sorted = types.sort((a, b) => ATTENTION_PRIORITY[a] - ATTENTION_PRIORITY[b]);
    return {
      projectId: project.id,
      project,
      primaryType: sorted[0],
      allTypes: sorted,
      dismissKey: `project-${project.id}`,
      hash: situationHash(project),
    };
  });
}

const SALES_STAGES = ['new_lead', 'appointment_requested', 'draft', 'proposal_sent', 'accepted'] as const;
const JOB_STAGES = ['scheduled', 'in_progress', 'invoiced', 'paid'] as const;

const STAGE_CONFIG: Record<string, { label: string; icon: typeof UserPlus; color: string; bgColor: string; accentBar: string; headerBg: string; headerText: string; countBg: string }> = {
  new_lead: { label: 'New Leads', icon: UserPlus, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-500/10', accentBar: 'bg-blue-500', headerBg: 'bg-blue-50 dark:bg-blue-950/40', headerText: 'text-blue-800 dark:text-blue-200', countBg: 'bg-blue-500 text-white' },
  appointment_requested: { label: 'Appt Requested', icon: CalendarCheck, color: 'text-cyan-600 dark:text-cyan-400', bgColor: 'bg-cyan-500/10', accentBar: 'bg-cyan-500', headerBg: 'bg-cyan-50 dark:bg-cyan-950/40', headerText: 'text-cyan-800 dark:text-cyan-200', countBg: 'bg-cyan-500 text-white' },
  draft: { label: 'Drafts', icon: FileSignature, color: 'text-slate-600 dark:text-slate-400', bgColor: 'bg-slate-500/10', accentBar: 'bg-slate-400', headerBg: 'bg-slate-50 dark:bg-slate-950/40', headerText: 'text-slate-700 dark:text-slate-300', countBg: 'bg-slate-500 text-white' },
  proposal_sent: { label: 'Proposal Sent', icon: FileSignature, color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500/10', accentBar: 'bg-amber-500', headerBg: 'bg-amber-50 dark:bg-amber-950/40', headerText: 'text-amber-800 dark:text-amber-200', countBg: 'bg-amber-500 text-white' },
  accepted: { label: 'Accepted & Ready to Schedule', icon: CalendarCheck, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/10', accentBar: 'bg-emerald-500', headerBg: 'bg-emerald-50 dark:bg-emerald-950/40', headerText: 'text-emerald-800 dark:text-emerald-200', countBg: 'bg-emerald-500 text-white' },
  scheduled: { label: 'Scheduled', icon: CalendarCheck, color: 'text-violet-600 dark:text-violet-400', bgColor: 'bg-violet-500/10', accentBar: 'bg-violet-500', headerBg: 'bg-violet-50 dark:bg-violet-950/40', headerText: 'text-violet-800 dark:text-violet-200', countBg: 'bg-violet-500 text-white' },
  in_progress: { label: 'In Progress', icon: Hammer, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-500/10', accentBar: 'bg-blue-500', headerBg: 'bg-blue-50 dark:bg-blue-950/40', headerText: 'text-blue-800 dark:text-blue-200', countBg: 'bg-blue-500 text-white' },
  invoiced: { label: 'Invoiced', icon: Receipt, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-500/10', accentBar: 'bg-orange-500', headerBg: 'bg-orange-50 dark:bg-orange-950/40', headerText: 'text-orange-800 dark:text-orange-200', countBg: 'bg-orange-500 text-white' },
  paid: { label: 'Paid', icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/10', accentBar: 'bg-emerald-500', headerBg: 'bg-emerald-50 dark:bg-emerald-950/40', headerText: 'text-emerald-800 dark:text-emerald-200', countBg: 'bg-emerald-500 text-white' },
  completed: { label: 'Completed', icon: Briefcase, color: 'text-muted-foreground', bgColor: 'bg-muted', accentBar: 'bg-gray-400', headerBg: 'bg-gray-50 dark:bg-gray-900/40', headerText: 'text-gray-700 dark:text-gray-300', countBg: 'bg-gray-500 text-white' },
};

function getStageDateLabel(stage: string): string {
  switch (stage) {
    case 'new_lead': return 'Created';
    case 'appointment_requested': return 'Appt Set';
    case 'draft': return 'Drafted';
    case 'proposal_sent': return 'Sent';
    case 'accepted': return 'Accepted';
    case 'scheduled': return 'Scheduled';
    case 'in_progress': return 'Started';
    case 'invoiced': return 'Invoiced';
    case 'paid': return 'Paid';
    case 'completed': return 'Completed';
    default: return 'Updated';
  }
}

function getStageDate(project: ProjectWithContact): string {
  try {
    const stageDate = project.stageChangedAt;
    const d = stageDate ? new Date(stageDate) : project.createdAt ? new Date(project.createdAt) : null;
    if (!d || isNaN(d.getTime())) return '';
    return format(d, "MMM d");
  } catch { return ''; }
}

function getCreatedDate(project: ProjectWithContact): string {
  try {
    const d = project.createdAt ? new Date(project.createdAt) : null;
    if (!d || isNaN(d.getTime())) return '';
    return format(d, "MMM d");
  } catch { return ''; }
}

function getAgingDays(project: ProjectWithContact): number {
  try {
    const date = project.updatedAt ? new Date(project.updatedAt) : project.createdAt ? new Date(project.createdAt) : new Date();
    if (isNaN(date.getTime())) return 0;
    return differenceInDays(new Date(), date);
  } catch (e) {
    console.error("[Dashboard] getAgingDays error for project", project?.id, e);
    return 0;
  }
}

function getAgingColor(days: number, stage: string): string {
  if (stage === 'paid' || stage === 'completed') return '';
  if (stage === 'new_lead' || stage === 'appointment_requested') {
    if (days >= 3) return 'border-l-red-500';
    if (days >= 1) return 'border-l-amber-500';
    return 'border-l-emerald-500';
  }
  if (days >= 7) return 'border-l-red-500';
  if (days >= 3) return 'border-l-amber-500';
  return '';
}

function getNextAction(stage: string): { label: string; hint: string } {
  switch (stage) {
    case 'new_lead': return { label: 'Reach Out', hint: 'Call or send a proposal' };
    case 'appointment_requested': return { label: 'Send Proposal', hint: 'Create and send estimate' };
    case 'proposal_sent': return { label: 'Follow Up', hint: 'Waiting for signature' };
    case 'accepted': return { label: 'Schedule', hint: 'Set start & end dates' };
    case 'scheduled': return { label: 'Start Work', hint: 'Begin the job' };
    case 'in_progress': return { label: 'Invoice', hint: 'Create invoice when done' };
    case 'invoiced': return { label: 'Collect', hint: 'Waiting for payment' };
    case 'paid': return { label: 'Complete', hint: 'Mark project complete' };
    default: return { label: 'View', hint: '' };
  }
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(cents / 100);
}

function formatCurrencyCompact(cents: number) {
  const dollars = cents / 100;
  if (dollars >= 1000000) return `$${(dollars / 1000000).toFixed(1)}M`;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
  return `$${dollars.toFixed(0)}`;
}

function ProjectCard({ project }: { project: ProjectWithContact }) {
  const [, navigate] = useLocation();
  const { maskName, maskProjectTitle } = useDemoMode();
  const days = getAgingDays(project);
  const agingColor = getAgingColor(days, project.stage);
  const action = getNextAction(project.stage);
  const stageDate = getStageDate(project);
  const createdDate = getCreatedDate(project);
  const stageDateLabel = getStageDateLabel(project.stage);

  const hasPausedAutomation = !!(project.automationPausedReason && project.automationPausedAt);
  const hasReminder = !!project.reminderAt;
  const reminderOverdue = hasReminder && new Date(project.reminderAt!).getTime() <= Date.now();
  const reminderUrgent = hasReminder && !reminderOverdue && new Date(project.reminderAt!).getTime() <= Date.now() + 24 * 60 * 60 * 1000;

  const borderColor = reminderOverdue
    ? "border-l-red-500"
    : reminderUrgent
      ? "border-l-amber-500"
      : hasPausedAutomation
        ? "border-l-amber-400"
        : agingColor || "border-l-transparent";

  const showIndicator = borderColor !== "border-l-transparent";
  const indicatorBg = borderColor.replace("border-l-", "bg-");

  return (
    <div
      className="p-3 rounded-md border bg-card hover-elevate cursor-pointer transition-colors flex gap-2"
      onClick={() => navigate(`/projects/${project.id}`)}
      data-testid={`project-card-${project.id}`}
    >
      {showIndicator && (
        <div className={cn("w-1 rounded-full flex-shrink-0 self-stretch", indicatorBg)} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-medium text-sm truncate" data-testid={`project-name-${project.id}`}>
                {maskName(project.contact.name)}
              </p>
              {hasPausedAutomation && (
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex-shrink-0" data-testid={`indicator-paused-${project.id}`}>
                  <Pause className="w-2.5 h-2.5" />
                  Paused
                </span>
              )}
              {reminderOverdue && (
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 animate-pulse flex-shrink-0" data-testid={`indicator-reminder-overdue-${project.id}`}>
                  <Bell className="w-2.5 h-2.5" />
                  Overdue
                </span>
              )}
              {reminderUrgent && !reminderOverdue && (
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex-shrink-0" data-testid={`indicator-reminder-urgent-${project.id}`}>
                  <Bell className="w-2.5 h-2.5" />
                  Soon
                </span>
              )}
              {(project as any).sentimentScore != null && (
                <span className={cn(
                  "inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded flex-shrink-0",
                  (project as any).sentimentScore >= 60 ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" :
                  (project as any).sentimentScore >= 40 ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" :
                  "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                )} data-testid={`sentiment-indicator-${project.id}`}>
                  <Sparkles className="w-2.5 h-2.5" />
                  {(project as any).sentimentScore}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              #{project.projectNumber}
              {project.title && <span className="ml-1 opacity-70">{maskProjectTitle(project.title, project.contact?.name)}</span>}
            </p>
          </div>
          {project.totalAmount && project.stage !== 'new_lead' ? (
            <div className="text-right flex-shrink-0" data-testid={`project-amount-${project.id}`}>
              {(project as any).totalPaid > 0 ? (
                <>
                  <span className="text-sm font-bold text-foreground whitespace-nowrap">
                    {formatCurrency(project.totalAmount - (project as any).totalPaid)}
                  </span>
                  <span className="block text-[10px] text-muted-foreground line-through whitespace-nowrap">
                    {formatCurrency(project.totalAmount)}
                  </span>
                </>
              ) : (
                <span className="text-sm font-bold text-foreground whitespace-nowrap">
                  {formatCurrency(project.totalAmount)}
                </span>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {stageDate && (
              <span className="text-[10px] flex items-center gap-0.5 text-muted-foreground" data-testid={`project-stage-date-${project.id}`}>
                <Calendar className="w-3 h-3" />
                {stageDateLabel} {stageDate}
              </span>
            )}
            {createdDate && createdDate !== stageDate && project.stage !== 'new_lead' && (
              <span className="text-[10px] text-muted-foreground opacity-70">
                Created {createdDate}
              </span>
            )}
            {days > 0 && (
              <span className={cn(
                "text-[10px] flex items-center gap-0.5",
                days >= 7 ? "text-red-500" : days >= 3 ? "text-amber-500" : "text-muted-foreground"
              )}>
                <Clock className="w-3 h-3" />
                {(() => { try { const d = project.updatedAt ? new Date(project.updatedAt) : project.createdAt ? new Date(project.createdAt) : new Date(); return isNaN(d.getTime()) ? `${days}d` : formatDistanceToNowStrict(d); } catch { return `${days}d`; } })()}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium text-muted-foreground flex-shrink-0">{action.hint}</span>
        </div>
      </div>
    </div>
  );
}

function PipelineColumn({ stage, projects: stageProjects }: { stage: string; projects: ProjectWithContact[] }) {
  const { maskName } = useDemoMode();
  const [isExpanded, setIsExpanded] = useState(false);
  const config = STAGE_CONFIG[stage];
  if (!config) return null;
  const Icon = config.icon;
  const stageTotal = stageProjects.reduce((sum, p) => sum + ((p.totalAmount || 0) - ((p as any).totalPaid || 0)), 0);
  const sorted = [...stageProjects].sort((a, b) => {
    const da = a.stageChangedAt ? new Date(a.stageChangedAt).getTime() : a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.stageChangedAt ? new Date(b.stageChangedAt).getTime() : b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });
  const newestProject = sorted[0];

  return (
    <div className="flex flex-col min-w-[220px] flex-1" data-testid={`pipeline-column-${stage}`}>
      <div
        className={cn("rounded-md mb-3 overflow-hidden cursor-pointer")}
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid={`pipeline-header-${stage}`}
      >
        <div className={cn("h-1.5 w-full", config.accentBar)} />
        <div className={cn("px-3 py-2.5", config.headerBg)}>
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-md", config.bgColor)}>
              <Icon className={cn("w-4 h-4", config.color)} />
            </div>
            <span className={cn("text-sm font-bold", config.headerText)}>{config.label}</span>
            {stage !== 'new_lead' && stageTotal > 0 && (
              <span className={cn("text-sm font-bold", config.headerText)} data-testid={`pipeline-total-${stage}`}>
                {formatCurrencyCompact(stageTotal)}
              </span>
            )}
            <span className={cn("ml-auto text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center", config.countBg)} data-testid={`pipeline-count-${stage}`}>
              {stageProjects.length}
            </span>
            {isExpanded ? (
              <ChevronDown className={cn("w-4 h-4 flex-shrink-0", config.headerText)} />
            ) : (
              <ChevronRight className={cn("w-4 h-4 flex-shrink-0", config.headerText)} />
            )}
          </div>
          {!isExpanded && newestProject && (
            <p className={cn("text-xs mt-1.5 pl-9 truncate opacity-80", config.headerText)}>
              Latest: {maskName(newestProject.contact.name)}
              {newestProject.totalAmount && stage !== 'new_lead' ? ` - ${formatCurrency((newestProject as any).totalPaid > 0 ? newestProject.totalAmount - (newestProject as any).totalPaid : newestProject.totalAmount)}` : ''}
            </p>
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="space-y-2 flex-1">
          {sorted.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground opacity-60">
              No projects
            </div>
          ) : (
            sorted.map(p => <ProjectCard key={p.id} project={p} />)
          )}
        </div>
      )}
    </div>
  );
}

function JobRow({ project }: { project: ProjectWithContact }) {
  const { maskName, maskAddress } = useDemoMode();
  const config = STAGE_CONFIG[project.stage];
  const days = getAgingDays(project);
  const action = getNextAction(project.stage);
  const stageDate = getStageDate(project);
  const stageDateLabel = getStageDateLabel(project.stage);
  if (!config) return null;

  return (
    <Link href={`/projects/${project.id}`}>
      <div className="flex items-center gap-3 p-3 rounded-md border bg-card hover-elevate cursor-pointer" data-testid={`job-row-${project.id}`}>
        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0", config.bgColor)}>
          <config.icon className={cn("w-4 h-4", config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm truncate">{maskName(project.contact.name)}</p>
            <span className="text-xs text-muted-foreground">#{project.projectNumber}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground truncate">
              {project.scheduledDate ? `Starts ${project.scheduledDate}` : action.hint}
            </p>
            {stageDate && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Calendar className="w-3 h-3" />
                {stageDateLabel} {stageDate}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {project.totalAmount ? (
            <div className="text-right">
              {(project as any).totalPaid > 0 ? (
                <>
                  <span className="text-sm font-semibold">{formatCurrency(project.totalAmount - (project as any).totalPaid)}</span>
                  <span className="block text-[10px] text-muted-foreground line-through">{formatCurrency(project.totalAmount)}</span>
                </>
              ) : (
                <span className="text-sm font-semibold">{formatCurrency(project.totalAmount)}</span>
              )}
            </div>
          ) : null}
          {days > 0 && project.stage !== 'paid' && (
            <span className={cn(
              "text-[10px] whitespace-nowrap",
              days >= 7 ? "text-red-500" : days >= 3 ? "text-amber-500" : "text-muted-foreground"
            )}>
              {days}d
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    </Link>
  );
}

function JobSection({ stage, projects: stageProjects }: { stage: string; projects: ProjectWithContact[] }) {
  const { maskName } = useDemoMode();
  const [isExpanded, setIsExpanded] = useState(false);
  const config = STAGE_CONFIG[stage];
  if (!config) return null;
  const stageTotal = stageProjects.reduce((sum, p) => sum + ((p.totalAmount || 0) - ((p as any).totalPaid || 0)), 0);
  const sorted = [...stageProjects].sort((a, b) => {
    const da = a.stageChangedAt ? new Date(a.stageChangedAt).getTime() : a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.stageChangedAt ? new Date(b.stageChangedAt).getTime() : b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });
  const newestProject = sorted[0];

  return (
    <div data-testid={`job-section-${stage}`}>
      <div
        className={cn("rounded-md mb-3 overflow-hidden cursor-pointer")}
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid={`job-header-${stage}`}
      >
        <div className={cn("h-1.5 w-full", config.accentBar)} />
        <div className={cn("px-3 py-2.5", config.headerBg)}>
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-md", config.bgColor)}>
              <config.icon className={cn("w-4 h-4", config.color)} />
            </div>
            <span className={cn("text-sm font-bold", config.headerText)}>{config.label}</span>
            {stageTotal > 0 && (
              <span className={cn("text-sm font-bold", config.headerText)} data-testid={`job-total-${stage}`}>
                {formatCurrencyCompact(stageTotal)}
              </span>
            )}
            <span className={cn("ml-auto text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center", config.countBg)} data-testid={`job-count-${stage}`}>
              {stageProjects.length}
            </span>
            {isExpanded ? (
              <ChevronDown className={cn("w-4 h-4 flex-shrink-0", config.headerText)} />
            ) : (
              <ChevronRight className={cn("w-4 h-4 flex-shrink-0", config.headerText)} />
            )}
          </div>
          {!isExpanded && newestProject && (
            <p className={cn("text-xs mt-1.5 pl-9 truncate opacity-80", config.headerText)}>
              Latest: {maskName(newestProject.contact.name)}
              {newestProject.totalAmount ? ` - ${formatCurrency((newestProject as any).totalPaid > 0 ? newestProject.totalAmount - (newestProject as any).totalPaid : newestProject.totalAmount)}` : ''}
            </p>
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="space-y-2">
          {sorted.map(p => <JobRow key={p.id} project={p} />)}
        </div>
      )}
    </div>
  );
}

interface UserCapabilities {
  isOwner: boolean;
  role: string | null;
  capabilities: Record<string, boolean>;
  linkedTeamMemberId: number | null;
}


function ElapsedTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    const update = () => {
      const diff = Date.now() - new Date(since).getTime();
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      setElapsed(hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`);
    };
    update();
    const iv = setInterval(update, 60000);
    return () => clearInterval(iv);
  }, [since]);
  return <span>{elapsed}</span>;
}

function FieldWorkerHome() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: userCaps } = useQuery<UserCapabilities>({
    queryKey: ['/api/user/capabilities'],
  });
  const { data: assignedJobs = [], isLoading: jobsLoading } = useQuery<AssignedJob[]>({
    queryKey: ['/api/my-jobs'],
  });
  const linkedMemberId = userCaps?.linkedTeamMemberId;
  const { data: timeEntries = [], isLoading: clockLoading } = useQuery<any[]>({
    queryKey: ['/api/time-entries', { teamMemberId: linkedMemberId }],
    queryFn: async () => {
      if (!linkedMemberId) return [];
      const res = await fetch(`/api/time-entries?teamMemberId=${linkedMemberId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!linkedMemberId,
  });
  const { data: weeklySummary } = useQuery<{ hoursThisWeek: number; earningsThisWeek: number; hourlyRate: number; entries: number }>({
    queryKey: ['/api/my-jobs/weekly-summary'],
  });
  const activeEntry = timeEntries.find((e: any) => !e.clockOut);
  const clockReady = !clockLoading && !!userCaps;
  const clockStatus = activeEntry ? { isClockedIn: true, clockInTime: activeEntry.clockIn, projectId: activeEntry.projectId } : { isClockedIn: false, clockInTime: null, projectId: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = format(today, 'yyyy-MM-dd');
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');

  const todayJobs = assignedJobs.filter(j => j.scheduledDate === todayStr);
  const tomorrowJobs = assignedJobs.filter(j => j.scheduledDate === tomorrowStr);
  const upcomingJobs = assignedJobs
    .filter(j => j.scheduledDate && j.scheduledDate > todayStr)
    .sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''))
    .slice(0, 5);

  const activeJobName = clockStatus.projectId ? assignedJobs.find(j => j.id === clockStatus.projectId)?.title : null;

  const clockOverlay = useClockInOverlay(assignedJobs, jobsLoading);

  const roleName = userCaps?.role === 'crew_lead' ? 'Crew Lead' : 'Team Member';
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      {clockOverlay.show && clockOverlay.job && (
        <ClockInBanner
          job={clockOverlay.job}
          urgency={clockOverlay.urgency}
          minutesLate={clockOverlay.minutesLate || 0}
          onClockIn={() => navigate(`/crew-clock?projectId=${clockOverlay.job!.id}`)}
          onDismiss={clockOverlay.dismiss}
        />
      )}
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-field-greeting">
          {greeting}, {user?.firstName || 'Team'}
        </h1>
        <p className="text-sm text-muted-foreground">{roleName} · {format(today, 'EEEE, MMM d')}</p>
      </div>

      {todayJobs.length > 0 && !clockStatus.isClockedIn && clockReady && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 shadow-sm" data-testid="card-clock-in-reminder">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                    Don't forget to clock in!
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 truncate">
                    {todayJobs.length === 1 ? todayJobs[0].title : `${todayJobs.length} jobs today`}
                    {todayJobs.length === 1 && todayJobs[0].scheduledTime ? ` · ${todayJobs[0].scheduledTime}` : ''}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                onClick={() => navigate('/crew-clock')}
                data-testid="button-reminder-clock-in"
              >
                <Clock className="w-4 h-4 mr-1.5" />
                Clock In
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {clockStatus.isClockedIn && clockStatus.clockInTime && (() => {
        const activeJob = clockStatus.projectId ? todayJobs.find(j => j.id === clockStatus.projectId) || assignedJobs.find(j => j.id === clockStatus.projectId) : null;
        const endTimeStr = activeJob?.scheduledEndTime;
        if (!endTimeStr) return null;
        const [eh, em] = endTimeStr.split(':').map(Number);
        if (isNaN(eh)) return null;
        const now = new Date();
        const endToday = new Date(now);
        endToday.setHours(eh, em || 0, 0, 0);
        const minsUntilEnd = (endToday.getTime() - now.getTime()) / 60000;
        if (minsUntilEnd > 15) return null;
        const isPastEnd = minsUntilEnd <= 0;
        return (
          <Card className="border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 shadow-sm" data-testid="card-clock-out-reminder">
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
                    <Bell className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-orange-900 dark:text-orange-100">
                      {isPastEnd ? 'Shift ended — clock out!' : 'Shift ending soon'}
                    </p>
                    <p className="text-xs text-orange-700 dark:text-orange-300">
                      {isPastEnd
                        ? `Scheduled end was ${endTimeStr.replace(/^0/, '')}`
                        : `Ends at ${endTimeStr.replace(/^0/, '')} — about ${Math.ceil(minsUntilEnd)} min left`}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-orange-600 hover:bg-orange-700 text-white shrink-0"
                  onClick={() => navigate('/crew-clock')}
                  data-testid="button-reminder-clock-out"
                >
                  <Clock className="w-4 h-4 mr-1.5" />
                  Clock Out
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {tomorrowJobs.length > 0 && !clockStatus.isClockedIn && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20" data-testid="card-tomorrow-reminder">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm text-blue-900 dark:text-blue-100">
                  Tomorrow: {tomorrowJobs.length === 1 ? tomorrowJobs[0].title : `${tomorrowJobs.length} jobs`}
                </p>
                {tomorrowJobs.length === 1 && (
                  <>
                    {(tomorrowJobs[0].address || tomorrowJobs[0].city) && (
                      <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />{[tomorrowJobs[0].address, tomorrowJobs[0].city, tomorrowJobs[0].state].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {tomorrowJobs[0].scheduledTime && (
                      <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />{tomorrowJobs[0].scheduledTime}
                      </p>
                    )}
                  </>
                )}
                <p className="text-[11px] text-blue-600/70 dark:text-blue-400/70 mt-1.5">
                  Plan ahead — allow extra time for parking and setup
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-clock-status">
        <CardContent className="py-4">
          {!clockReady ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
              <div className="space-y-2 flex-1">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-3 w-16 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ) : clockStatus.isClockedIn ? (
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-emerald-700 dark:text-emerald-300">Clocked In</p>
                    {activeJobName && (
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">{activeJobName}</p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate('/crew-clock')}
                  data-testid="button-clock-out"
                >
                  Clock Out
                </Button>
              </div>
              {clockStatus.clockInTime && (
                <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Since {format(new Date(clockStatus.clockInTime), 'h:mm a')}
                  </p>
                  <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400" data-testid="text-elapsed-time">
                    <ElapsedTimer since={clockStatus.clockInTime} />
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">Not Clocked In</p>
                  <p className="text-xs text-muted-foreground">Ready to start your day?</p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => navigate('/crew-clock')}
                data-testid="button-clock-in"
              >
                Clock In
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {weeklySummary && (weeklySummary.hoursThisWeek > 0 || weeklySummary.entries > 0) && (
        <Card data-testid="card-weekly-summary">
          <CardContent className="py-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">This Week</p>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xl font-bold tabular-nums" data-testid="text-weekly-hours">
                  {weeklySummary.hoursThisWeek.toFixed(1)}h
                </p>
                <p className="text-[11px] text-muted-foreground">Hours worked</p>
              </div>
              {weeklySummary.hourlyRate > 0 && (
                <div className="border-l border-border pl-6">
                  <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400" data-testid="text-weekly-earnings">
                    ${(weeklySummary.earningsThisWeek / 100).toFixed(2)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Estimated earnings</p>
                </div>
              )}
              <div className="border-l border-border pl-6">
                <p className="text-xl font-bold tabular-nums" data-testid="text-weekly-entries">
                  {weeklySummary.entries}
                </p>
                <p className="text-[11px] text-muted-foreground">Shifts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold" data-testid="text-today-jobs-header">
            Today's Jobs {todayJobs.length > 0 && <Badge variant="secondary" className="ml-2">{todayJobs.length}</Badge>}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => navigate('/my-jobs')} data-testid="button-view-all-jobs">
            All Jobs <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {jobsLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <Card key={i}><CardContent className="py-4"><div className="h-16 bg-muted animate-pulse rounded" /></CardContent></Card>
            ))}
          </div>
        ) : todayJobs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Briefcase className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No jobs scheduled for today</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {todayJobs.map(job => (
              <Card
                key={job.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => navigate(`/my-jobs?job=${job.id}`)}
                data-testid={`card-today-job-${job.id}`}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{job.title}</p>
                      {job.contactName && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3" />{job.contactName}
                        </p>
                      )}
                      {(job.address || job.city) && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />{[job.address, job.city, job.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                      {job.scheduledTime && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />{job.scheduledTime}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {upcomingJobs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3" data-testid="text-upcoming-jobs-header">Upcoming</h2>
          <div className="space-y-2">
            {upcomingJobs.map(job => (
              <Card
                key={job.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => navigate(`/my-jobs?job=${job.id}`)}
                data-testid={`card-upcoming-job-${job.id}`}
              >
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{job.title}</p>
                        {job.scheduledDate && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {format(new Date(job.scheduledDate + 'T12:00:00'), 'EEE, MMM d')}
                          </Badge>
                        )}
                      </div>
                      {(job.address || job.city) && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />{[job.address, job.city, job.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data: userCaps, isLoading: capsLoading } = useQuery<UserCapabilities>({
    queryKey: ['/api/user/capabilities'],
  });

  if (capsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isFieldWorker = userCaps ? (userCaps.role === 'laborer' || userCaps.role === 'crew_lead') && !userCaps.isOwner : false;

  if (isFieldWorker) {
    return <FieldWorkerHome />;
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const { user } = useAuth();
  const { maskName, maskPhone, maskEmail, maskAddress, maskCity } = useDemoMode();
  const userTier = user?.subscriptionTier || 'starter';
  const [, navigate] = useLocation();
  const { data, isLoading, error } = useDashboardPipeline();

  const { data: bookingRequests } = useQuery<any[]>({ queryKey: ['/api/booking-requests'] });
  const { data: aiActions } = useQuery<any[]>({ queryKey: ['/api/ai-actions?status=pending'] });
  const { data: upcomingAppointments = [] } = useQuery<any[]>({
    queryKey: ['/api/appointments', 'upcoming'],
    queryFn: async () => {
      const res = await fetch('/api/appointments', { credentials: 'include' });
      if (!res.ok) return [];
      const all = await res.json();
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      return all.filter((a: any) => a.status === 'scheduled' && a.date && new Date(a.date) >= now)
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    },
  });
  const [appointmentsExpanded, setAppointmentsExpanded] = useState(false);
  const dismissAction = useMutation({
    mutationFn: (id: number) => apiRequest('PATCH', `/api/ai-actions/${id}`, { status: 'dismissed' }),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ['/api/ai-actions?status=pending'] });
      const previous = queryClient.getQueryData<any[]>(['/api/ai-actions?status=pending']);
      queryClient.setQueryData(['/api/ai-actions?status=pending'], (old: any[] | undefined) =>
        old ? old.filter((a: any) => a.id !== id) : []
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['/api/ai-actions?status=pending'], context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['/api/ai-actions?status=pending'] }),
  });
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [summaryPeriod, setSummaryPeriod] = useState<'month' | 'year' | 'custom'>('month');
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickingStart, setPickingStart] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<'single' | 'range'>('single');

  useEffect(() => {
    if (showMonthPicker) {
      const scrollY = window.scrollY;
      const body = document.body;
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.overflow = 'hidden';
      return () => {
        body.style.position = '';
        body.style.top = '';
        body.style.left = '';
        body.style.right = '';
        body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [showMonthPicker]);
  const metricsUrl = customRange ? `/api/metrics?customFrom=${customRange.from}&customTo=${customRange.to}` : '/api/metrics';
  const { data: metrics } = useQuery<any>({ queryKey: ['/api/metrics', customRange?.from, customRange?.to], queryFn: () => fetch(metricsUrl, { credentials: 'include' }).then(r => r.json()) });
  const { data: serverDismissed } = useQuery<{ items: Record<string, string> }>({ queryKey: ['/api/dismissed-attention'] });
  const [dismissedMap, setDismissedMap] = useState(() => getDismissedAttentionMap());
  useEffect(() => {
    if (serverDismissed?.items && typeof serverDismissed.items === 'object') {
      setDismissedMap(prev => {
        const merged = { ...prev, ...serverDismissed.items };
        if (JSON.stringify(merged) !== JSON.stringify(prev)) {
          localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(merged));
          return merged;
        }
        return prev;
      });
    }
  }, [serverDismissed]);
  const dismissSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDismissProject = useCallback((projectId: number, hash: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    dismissProject(projectId, hash);
    setDismissedMap(prev => {
      const next = { ...prev, [`project-${projectId}`]: hash };
      if (dismissSyncTimer.current) clearTimeout(dismissSyncTimer.current);
      dismissSyncTimer.current = setTimeout(() => {
        const latest = getDismissedAttentionMap();
        apiRequest('POST', '/api/dismissed-attention', { items: latest }).catch(() => {});
      }, 500);
      return next;
    });
  }, []);
  const handleDismissBooking = useCallback((bookingId: number, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const key = `booking-${bookingId}`;
    const map = getDismissedAttentionMap();
    map[key] = '1';
    localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(map));
    setDismissedMap(prev => {
      const next = { ...prev, [key]: '1' };
      if (dismissSyncTimer.current) clearTimeout(dismissSyncTimer.current);
      dismissSyncTimer.current = setTimeout(() => {
        const latest = getDismissedAttentionMap();
        apiRequest('POST', '/api/dismissed-attention', { items: latest }).catch(() => {});
      }, 500);
      return next;
    });
  }, []);
  const unscheduledBookings = (bookingRequests || []).filter(b => b.status === 'new');
  const pendingAiActions = (aiActions || []).filter((a: any) => a.status === 'pending');

  if (isLoading && !data) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" data-testid="loading-spinner" />
      </div>
    );
  }

  if (error) {
    console.error("[Dashboard] Pipeline query error:", error);
  }

  if (data) {
    console.log("[Dashboard] Pipeline data loaded:", {
      projectCount: data.projects?.length ?? "missing",
      statsKeys: data.stats ? Object.keys(data.stats) : "missing",
    });
  }

  const allProjects: ProjectWithContact[] = data?.projects || [];
  const pausedProjects = allProjects.filter(p => {
    try {
      return p.automationPausedReason && p.automationPausedAt;
    } catch (e) {
      console.error("[Dashboard] Error filtering paused project:", p?.id, e);
      return false;
    }
  });
  const reminderProjects = allProjects.filter(p => {
    try {
      return p.reminderAt && new Date(p.reminderAt).getTime() <= Date.now() + 24 * 60 * 60 * 1000;
    } catch { return false; }
  }).sort((a, b) => new Date(a.reminderAt!).getTime() - new Date(b.reminderAt!).getTime());
  const lowSentimentProjects = allProjects.filter(p => {
    const score = (p as any).sentimentScore;
    const updatedAt = (p as any).sentimentUpdatedAt;
    const isRecent = updatedAt ? (Date.now() - new Date(updatedAt).getTime()) < 14 * 24 * 60 * 60 * 1000 : false;
    return score != null && score < 40 && isRecent && p.stage !== 'completed' && p.stage !== 'cancelled';
  }).sort((a, b) => ((a as any).sentimentScore || 0) - ((b as any).sentimentScore || 0));

  const idleProjects = allProjects.filter(p => {
    if (['completed', 'paid'].includes(p.stage) || p.archived) return false;
    const lastAction = p.stageChangedAt ? new Date(p.stageChangedAt) : p.createdAt ? new Date(p.createdAt) : null;
    if (!lastAction) return false;
    const idleDays = Math.floor((Date.now() - lastAction.getTime()) / (1000 * 60 * 60 * 24));
    const threshold = ['new_lead', 'appointment_requested', 'draft'].includes(p.stage) ? 3
      : ['proposal_sent'].includes(p.stage) ? 5
      : ['invoiced'].includes(p.stage) ? 7 : 7;
    return idleDays >= threshold;
  }).sort((a, b) => {
    const da = a.stageChangedAt ? new Date(a.stageChangedAt).getTime() : a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.stageChangedAt ? new Date(b.stageChangedAt).getTime() : b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return da - db;
  });

  const needsScheduling = allProjects.filter(p => 
    p.stage === 'accepted' && !p.scheduledDate && !p.archived
  );

  const rawAttentionItems: Array<{ type: AttentionType; project: ProjectWithContact }> = [
    ...lowSentimentProjects.map(p => ({ type: 'low_sentiment' as const, project: p })),
    ...reminderProjects.filter(p => new Date(p.reminderAt!).getTime() <= Date.now()).map(p => ({ type: 'reminder' as const, project: p })),
    ...pausedProjects.map(p => ({ type: 'paused' as const, project: p })),
    ...needsScheduling.map(p => ({ type: 'needs_scheduling' as const, project: p })),
    ...idleProjects.slice(0, 5).map(p => ({ type: 'idle' as const, project: p })),
    ...reminderProjects.filter(p => new Date(p.reminderAt!).getTime() > Date.now()).map(p => ({ type: 'reminder' as const, project: p })),
  ];
  const consolidatedItems = consolidateAttentionItems(rawAttentionItems);
  const attentionItems = consolidatedItems.filter(item => !isProjectDismissed(dismissedMap, item.projectId, item.hash));
  const stats = data?.stats || {
    newLeadsThisWeek: 0, proposalsPending: 0, activeJobsCount: 0,
    monthlyRevenue: 0, yearlyRevenue: 0, pendingInvoicesAmount: 0,
    pendingInvoicesCount: 0, unreadMessages: 0, missedCalls: 0,
  };

  const projectsByStage = (stage: string) => allProjects.filter(p => p.stage === stage);
  const activeSalesStages = userTier === 'starter'
    ? (['new_lead', 'appointment_requested', 'proposal_sent', 'accepted'] as const)
    : SALES_STAGES;
  const activeJobStages = userTier === 'starter'
    ? (['in_progress', 'completed'] as const)
    : JOB_STAGES;
  const salesProjects = allProjects.filter(p => (activeSalesStages as readonly string[]).includes(p.stage));
  const jobProjects = allProjects.filter(p => (activeJobStages as readonly string[]).includes(p.stage));

  const pipelineValue = salesProjects.reduce((sum, p) => sum + ((p.totalAmount || 0) - ((p as any).totalPaid || 0)), 0);
  const jobsValue = jobProjects.reduce((sum, p) => sum + ((p.totalAmount || 0) - ((p as any).totalPaid || 0)), 0);
  const activeJobsValue = jobProjects.filter(p => ['scheduled', 'in_progress'].includes(p.stage)).reduce((sum, p) => sum + ((p.totalAmount || 0) - ((p as any).totalPaid || 0)), 0);

  const revenueAmount = summaryPeriod === 'month' ? (metrics?.pnl?.revenueThisMonth ?? 0) : summaryPeriod === 'year' ? (metrics?.pnl?.revenueYTD ?? 0) : (metrics?.pnl?.customRevenue ?? 0);

  const customPeriodLabel = (() => {
    if (!customRange) return '';
    const [fy, fm] = customRange.from.split('-').map(Number);
    const [ty, tm] = customRange.to.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (customRange.from === customRange.to) return `${months[fm-1]} '${String(fy).slice(2)}`;
    return `${months[fm-1]} - ${months[tm-1]} '${String(ty).slice(2)}`;
  })();

  const alerts: Array<{ icon: typeof MessageSquare; label: string; count: number; color: string; link: string }> = [];
  if (stats.unreadMessages > 0 && userTier === 'elite') {
    alerts.push({ icon: MessageSquare, label: 'unread', count: stats.unreadMessages, color: 'text-blue-500', link: '/messages' });
  }
  if (stats.missedCalls > 0 && userTier === 'elite') {
    alerts.push({ icon: PhoneMissed, label: 'missed', count: stats.missedCalls, color: 'text-red-500', link: '/calls' });
  }
  if (stats.newLeadsThisWeek > 0) {
    alerts.push({ icon: UserPlus, label: 'new this week', count: stats.newLeadsThisWeek, color: 'text-blue-600 dark:text-blue-400', link: '/projects' });
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="space-y-6 p-4 pb-24 lg:p-6 lg:pb-24 max-w-[1400px] mx-auto w-full animate-in fade-in duration-500">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground" data-testid="text-dashboard-title">Dashboard</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">Your sales pipeline and active jobs</p>
          </div>
          <Link href="/projects">
            <Button size="sm" data-testid="button-new-project">
              <Plus className="w-4 h-4 mr-1" />
              New Project
            </Button>
          </Link>
        </div>

        <FeatureTipBanner
          id="dashboard-welcome"
          title="Welcome to Fuse Phone"
          description="Start by adding your first contact and creating a project. Your pipeline will track every job from lead to payment."
        />

        <Card className="shadow-md" data-testid="card-business-summary">
          <CardContent className="p-0">
            <div
              className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 dark:bg-muted/20 cursor-pointer rounded-t-md"
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              data-testid="button-summary-toggle"
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground" data-testid="text-summary-title">Overview</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="flex rounded-md border border-primary/30 bg-background p-0.5"
                  onClick={(e) => e.stopPropagation()}
                  data-testid="summary-period-toggle"
                >
                  <Button
                    variant={summaryPeriod === 'month' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setSummaryPeriod('month')}
                    data-testid="button-period-month"
                  >
                    Mo
                  </Button>
                  <Button
                    variant={summaryPeriod === 'year' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setSummaryPeriod('year')}
                    data-testid="button-period-year"
                  >
                    Yr
                  </Button>
                  <Button
                    variant={summaryPeriod === 'custom' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => {
                      setPickerMode('single');
                      setPickingStart(null);
                      setShowMonthPicker(true);
                    }}
                    className="gap-1 px-1.5"
                    data-testid="button-period-custom"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {summaryPeriod === 'custom' && customRange ? <span className="text-[10px]">{customPeriodLabel}</span> : null}
                  </Button>
                </div>
                {summaryExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 px-3 py-2.5">
              <div className="rounded-md border bg-background px-3 py-2.5" data-testid="card-sales-metric">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-blue-500/10 flex-shrink-0">
                    <ShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className="text-[10px] text-muted-foreground font-medium leading-none flex items-center gap-1">Sales <InfoTooltip text="Total value of accepted proposals and closed deals. This measures how much work you've sold in the selected time period." /></p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {(summaryPeriod === 'month' ? (metrics?.sales?.thisMonth ?? 0) : summaryPeriod === 'year' ? (metrics?.sales?.ytd ?? 0) : (metrics?.sales?.custom ?? 0))} deals
                      </span>
                    </div>
                    <p className="text-base font-bold tabular-nums leading-tight truncate" data-testid="text-summary-sales">
                      ${(summaryPeriod === 'month' ? (metrics?.sales?.amountThisMonth ?? 0) : summaryPeriod === 'year' ? (metrics?.sales?.amountYTD ?? 0) : (metrics?.sales?.amountCustom ?? 0)).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-md border bg-background px-3 py-2.5" data-testid="card-revenue-metric">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-emerald-500/10 flex-shrink-0">
                    <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className="text-[10px] text-muted-foreground font-medium leading-none flex items-center gap-1">Revenue <InfoTooltip text="Actual payments collected from customers. Unlike sales, revenue only counts money you've received, not just proposals accepted." /></p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {summaryPeriod === 'month' ? 'this mo' : summaryPeriod === 'year' ? 'YTD' : customPeriodLabel || 'custom'}
                      </span>
                    </div>
                    <p className="text-base font-bold tabular-nums leading-tight truncate text-emerald-600 dark:text-emerald-400" data-testid="text-summary-revenue">
                      ${revenueAmount.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {summaryExpanded && (
              <div className="space-y-2.5 px-3 pb-3" data-testid="summary-expanded">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border bg-background px-2.5 py-2" data-testid="stat-pipeline">
                    <div className="flex items-center gap-1.5">
                      <div className="p-1 rounded-md bg-amber-500/10 flex-shrink-0">
                        <FileSignature className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] text-muted-foreground font-medium leading-none mb-px flex items-center gap-0.5">Pipeline <InfoTooltip text="Total dollar value of all active deals in your sales pipeline that haven't been won or lost yet." /></p>
                        <p className="text-xs font-bold leading-tight truncate">{formatCurrencyCompact(pipelineValue)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border bg-background px-2.5 py-2" data-testid="stat-active-jobs">
                    <div className="flex items-center gap-1.5">
                      <div className="p-1 rounded-md bg-violet-500/10 flex-shrink-0">
                        <Briefcase className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] text-muted-foreground font-medium leading-none mb-px flex items-center gap-0.5">Jobs <InfoTooltip text="Number of active jobs (scheduled + in progress) and their combined value. Shows your current workload." /></p>
                        <p className="text-xs font-bold leading-tight">{stats.activeJobsCount} / {formatCurrencyCompact(activeJobsValue)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border bg-background px-2.5 py-2" data-testid="stat-outstanding">
                    <div className="flex items-center gap-1.5">
                      <div className="p-1 rounded-md bg-orange-500/10 flex-shrink-0">
                        <Receipt className="w-3 h-3 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] text-muted-foreground font-medium leading-none mb-px flex items-center gap-0.5">Owed <InfoTooltip text="Total amount from invoices that haven't been paid yet. Follow up on outstanding invoices to improve cash flow." /></p>
                        <p className="text-xs font-bold leading-tight truncate">{stats.pendingInvoicesCount > 0 ? formatCurrencyCompact(stats.pendingInvoicesAmount) : '$0'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {alerts.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {alerts.map((alert) => (
                      <Link key={alert.label} href={alert.link}>
                        <Badge variant="outline" className="cursor-pointer gap-1.5 whitespace-nowrap" data-testid={`alert-${alert.label.split(' ')[0]}`}>
                          <alert.icon className={cn("w-3 h-3", alert.color)} />
                          <span className="font-semibold" data-testid={`alert-count-${alert.label.split(' ')[0]}`}>{alert.count}</span>
                          <span className="text-muted-foreground" data-testid={`alert-label-${alert.label.split(' ')[0]}`}>{alert.label}</span>
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}

                {metrics?.pnl && (() => {
                  const pnl = metrics.pnl;
                  const periodLabel = summaryPeriod === 'month' ? 'Monthly' : summaryPeriod === 'year' ? 'Year-to-Date' : (customPeriodLabel || 'Custom');
                  const overheadVal = summaryPeriod === 'month' ? pnl.overhead : summaryPeriod === 'year' ? pnl.ytdOverhead : pnl.customOverhead;
                  const laborVal = summaryPeriod === 'month' ? pnl.labor : summaryPeriod === 'year' ? pnl.ytdLabor : pnl.customLabor;
                  const breakEvenVal = summaryPeriod === 'month' ? pnl.breakEven : summaryPeriod === 'year' ? pnl.ytdBreakEven : pnl.customBreakEven;
                  const remainingVal = summaryPeriod === 'month' ? pnl.remainingToBreakEven : summaryPeriod === 'year' ? pnl.remainingToBreakEvenYTD : pnl.customRemainingToBreakEven;
                  const progressVal = summaryPeriod === 'month' ? pnl.breakEvenProgress : summaryPeriod === 'year' ? pnl.breakEvenProgressYTD : pnl.customBreakEvenProgress;
                  const profitVal = summaryPeriod === 'month' ? pnl.estimatedProfit : summaryPeriod === 'year' ? pnl.estimatedProfitYTD : pnl.customEstimatedProfit;
                  return (
                  <div className="rounded-md border bg-background px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="p-1 rounded-md bg-primary/10">
                        <Target className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{periodLabel} Break-even</span>
                      <span className="text-xs font-bold ml-auto tabular-nums" data-testid="text-breakeven-target">${(breakEvenVal ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", (progressVal ?? 0) >= 100 ? "bg-emerald-500" : "bg-primary")}
                          style={{ width: `${Math.min(100, progressVal ?? 0)}%` }}
                          data-testid="progress-breakeven"
                        />
                      </div>
                      <span className="text-[10px] font-semibold tabular-nums" data-testid="text-breakeven-pct">{progressVal ?? 0}%</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap text-[10px]">
                      <span className="text-muted-foreground">OH <strong className="text-foreground tabular-nums" data-testid="text-overhead">${(overheadVal ?? 0).toLocaleString()}</strong></span>
                      <span className="text-muted-foreground">Labor <strong className="text-foreground tabular-nums" data-testid="text-labor">${(laborVal ?? 0).toLocaleString()}</strong></span>
                      <span className="text-muted-foreground">Left <strong className={cn("tabular-nums", (remainingVal ?? 0) > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")} data-testid="text-remaining-breakeven">{(remainingVal ?? 0) > 0 ? `$${(remainingVal ?? 0).toLocaleString()}` : 'Hit!'}</strong></span>
                      {(profitVal ?? 0) > 0 && (
                        <span className="text-muted-foreground ml-auto flex items-center gap-1">
                          Surplus <strong className="tabular-nums text-emerald-600 dark:text-emerald-400" data-testid="text-est-profit">${(profitVal ?? 0).toLocaleString()}</strong>
                          <InfoTooltip text="Cash collected this period above your costs. Sales aren't included — only payments actually received count toward break-even." />
                        </span>
                      )}
                    </div>
                  </div>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        {showMonthPicker && (() => {
          const now = new Date();
          const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const tiles: { key: string; label: string; year: number; month: number }[] = [];
          for (let i = 23; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            tiles.push({
              key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
              label: monthNames[d.getMonth()],
              year: d.getFullYear(),
              month: d.getMonth(),
            });
          }
          const years = [...new Set(tiles.map(t => t.year))];

          const handleMonthTap = (key: string) => {
            if (pickerMode === 'single') {
              setCustomRange({ from: key, to: key });
              setSummaryPeriod('custom');
              setPickingStart(null);
              setShowMonthPicker(false);
            } else {
              if (!pickingStart) {
                setPickingStart(key);
              } else {
                const from = pickingStart <= key ? pickingStart : key;
                const to = pickingStart <= key ? key : pickingStart;
                setCustomRange({ from, to });
                setSummaryPeriod('custom');
                setPickingStart(null);
                setShowMonthPicker(false);
              }
            }
          };

          const isInRange = (key: string) => {
            if (pickingStart) return key === pickingStart;
            if (customRange && summaryPeriod === 'custom') {
              return key >= customRange.from && key <= customRange.to;
            }
            return false;
          };

          return (
            <div
              className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24"
              onClick={() => { setShowMonthPicker(false); setPickingStart(null); }}
              style={{ overscrollBehavior: 'contain' }}
              data-testid="month-picker-overlay"
            >
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
              <div
                className="relative w-full max-w-sm mx-3 rounded-2xl border border-white/20 dark:border-white/10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300 max-h-[80vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                style={{ overscrollBehavior: 'contain' }}
                data-testid="month-picker-modal"
              >
                <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {pickerMode === 'single' ? 'Select Month' : 'Select Range'}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {pickerMode === 'single'
                        ? 'Tap a month'
                        : pickingStart ? 'Tap end month' : 'Tap start month'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-full"
                    onClick={() => { setShowMonthPicker(false); setPickingStart(null); }}
                    data-testid="button-close-month-picker"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="px-5 pb-3">
                  <div className="flex rounded-lg border border-primary/20 bg-muted/30 p-0.5">
                    <button
                      className={cn("flex-1 text-xs font-medium py-1.5 rounded-md transition-all", pickerMode === 'single' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                      onClick={() => { setPickerMode('single'); setPickingStart(null); }}
                      data-testid="button-picker-single"
                    >
                      Month
                    </button>
                    <button
                      className={cn("flex-1 text-xs font-medium py-1.5 rounded-md transition-all", pickerMode === 'range' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                      onClick={() => { setPickerMode('range'); setPickingStart(null); }}
                      data-testid="button-picker-range"
                    >
                      Custom Range
                    </button>
                  </div>
                </div>

                <div className="px-5 pb-5 space-y-4">
                  {years.map(year => (
                    <div key={year}>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">{year}</p>
                      <div className="grid grid-cols-6 gap-1.5">
                        {tiles.filter(t => t.year === year).map(t => {
                          const selected = isInRange(t.key);
                          const isStart = t.key === pickingStart;
                          const isCurrent = t.month === now.getMonth() && t.year === now.getFullYear();
                          return (
                            <button
                              key={t.key}
                              onClick={() => handleMonthTap(t.key)}
                              className={cn(
                                "relative py-2 px-1 rounded-lg text-xs font-medium transition-all duration-150",
                                "hover:scale-105 active:scale-95",
                                selected
                                  ? "bg-primary text-primary-foreground shadow-md"
                                  : isStart
                                    ? "bg-primary/70 text-primary-foreground ring-2 ring-primary ring-offset-1"
                                    : isCurrent
                                      ? "bg-muted/80 text-foreground ring-1 ring-primary/30"
                                      : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                              )}
                              data-testid={`month-tile-${t.key}`}
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {pickerMode === 'range' && pickingStart && (
                  <div className="px-5 pb-4">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      <span className="text-xs text-muted-foreground">
                        From <strong className="text-foreground">{(() => { const [y,m] = pickingStart.split('-').map(Number); return `${monthNames[m-1]} ${y}`; })()}</strong> — tap end month
                      </span>
                    </div>
                  </div>
                )}

                {customRange && !pickingStart && (
                  <div className="px-5 pb-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => {
                        setCustomRange(null);
                        setSummaryPeriod('month');
                        setShowMonthPicker(false);
                      }}
                      data-testid="button-clear-custom"
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setShowMonthPicker(false)}
                      data-testid="button-apply-custom"
                    >
                      Done
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {false && (
          <Card data-testid="needs-attention-card-deprecated">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-amber-500/10">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <CardTitle className="text-sm font-semibold">Needs Your Attention</CardTitle>
                <Badge variant="secondary" className="text-xs ml-auto" data-testid="attention-count">{attentionItems.length + unscheduledBookings.filter(b => !dismissedMap[`booking-${b.id}`]).length + pendingAiActions.length + (upcomingAppointments.length > 0 ? 1 : 0)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="space-y-1.5">
                {upcomingAppointments.length > 0 && (
                  <div data-testid="attention-appointments">
                    <div
                      className="flex items-center gap-3 p-2.5 rounded-md border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20 hover-elevate cursor-pointer"
                      onClick={() => setAppointmentsExpanded(!appointmentsExpanded)}
                      data-testid="button-toggle-appointments"
                    >
                      <Calendar className="w-4 h-4 text-teal-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Appointments Scheduled</p>
                        <p className="text-xs text-muted-foreground">{upcomingAppointments.length} upcoming</p>
                      </div>
                      <Badge variant="secondary" className="text-xs">{upcomingAppointments.length}</Badge>
                      {appointmentsExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    </div>
                    {appointmentsExpanded && (
                      <div className="mt-1.5 space-y-1.5 pl-2">
                        {upcomingAppointments.map((appt: any) => (
                          <AppointmentCard
                            key={appt.id}
                            appointment={appt}
                            compact
                            onClick={() => navigate('/calendar?tab=appointments')}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {attentionItems.map((item) => {
                  const p = item.project;
                  const projectName = p.contact?.name ? `${maskName(p.contact.name)} #${p.projectNumber}` : `#${p.projectNumber}`;
                  const attentionContext = encodeURIComponent(item.allTypes.join(','));
                  const linkHref = `/projects/${p.id}?attention=${attentionContext}`;
                  if (item.primaryType === 'low_sentiment') {
                    const score = (p as any).sentimentScore;
                    const label = ((p as any).sentimentLabel || 'negative').replace(/_/g, ' ');
                    const isVeryLow = score < 20;
                    return (
                      <div key={`attention-${p.id}`} className={cn(
                        "flex items-center gap-3 p-2.5 rounded-md border hover-elevate",
                        isVeryLow
                          ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
                          : "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20"
                      )} data-testid={`attention-item-${p.id}`}>
                        <Heart className={cn("w-4 h-4 flex-shrink-0", isVeryLow ? "text-red-500" : "text-orange-500")} />
                        <Link href={linkHref} className="flex-1 min-w-0 cursor-pointer" onClick={() => handleDismissProject(item.projectId, item.hash)}>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{projectName}</p>
                            <Badge variant="secondary" className="text-[10px] flex-shrink-0">{label} ({score})</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">Customer unhappy — reach out now</p>
                        </Link>
                        <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={(e) => handleDismissProject(item.projectId, item.hash, e)} data-testid={`dismiss-attention-${p.id}`}><X className="w-3.5 h-3.5" /></Button>
                      </div>
                    );
                  }
                  if (item.primaryType === 'paused') {
                    return (
                      <div key={`attention-${p.id}`} className="flex items-center gap-3 p-2.5 rounded-md border hover-elevate" data-testid={`attention-item-${p.id}`}>
                        <Pause className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        <Link href={linkHref} className="flex-1 min-w-0 cursor-pointer" onClick={() => handleDismissProject(item.projectId, item.hash)}>
                          <p className="text-sm font-medium truncate">{projectName}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            Follow-ups paused — {p.automationPausedReason === 'customer_replied' ? 'customer replied' : 'you messaged'}
                          </p>
                        </Link>
                        <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={(e) => handleDismissProject(item.projectId, item.hash, e)} data-testid={`dismiss-attention-${p.id}`}><X className="w-3.5 h-3.5" /></Button>
                      </div>
                    );
                  }
                  if (item.primaryType === 'needs_scheduling') {
                    return (
                      <div key={`attention-${p.id}`} className="flex items-center gap-3 p-2.5 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 hover-elevate" data-testid={`attention-item-${p.id}`}>
                        <CalendarPlus className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        <Link href={linkHref} className="flex-1 min-w-0 cursor-pointer" onClick={() => handleDismissProject(item.projectId, item.hash)}>
                          <p className="text-sm font-medium truncate">{projectName}</p>
                          <p className="text-xs text-muted-foreground truncate">Accepted — schedule the job</p>
                        </Link>
                        <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={(e) => handleDismissProject(item.projectId, item.hash, e)} data-testid={`dismiss-attention-${p.id}`}><X className="w-3.5 h-3.5" /></Button>
                      </div>
                    );
                  }
                  if (item.primaryType === 'idle') {
                    const lastAction = p.stageChangedAt ? new Date(p.stageChangedAt) : p.createdAt ? new Date(p.createdAt) : null;
                    const idleDays = lastAction ? Math.floor((Date.now() - lastAction.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                    const suggestion = ['new_lead', 'appointment_requested', 'draft'].includes(p.stage)
                      ? `No contact in ${idleDays}d — call now`
                      : p.stage === 'proposal_sent'
                        ? `No reply in ${idleDays}d — follow up`
                        : p.stage === 'invoiced'
                          ? `Payment ${idleDays}d overdue — follow up`
                          : `${idleDays}d idle — check in`;
                    return (
                      <div key={`attention-${p.id}`} className="flex items-center gap-3 p-2.5 rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 hover-elevate" data-testid={`attention-item-${p.id}`}>
                        <Clock className="w-4 h-4 text-orange-500 flex-shrink-0" />
                        <Link href={linkHref} className="flex-1 min-w-0 cursor-pointer" onClick={() => handleDismissProject(item.projectId, item.hash)}>
                          <p className="text-sm font-medium truncate">{projectName}</p>
                          <p className="text-xs text-muted-foreground truncate">{suggestion}</p>
                        </Link>
                        <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={(e) => handleDismissProject(item.projectId, item.hash, e)} data-testid={`dismiss-attention-${p.id}`}><X className="w-3.5 h-3.5" /></Button>
                      </div>
                    );
                  }
                  const reminderDate = new Date(p.reminderAt!);
                  const isOverdue = reminderDate.getTime() <= Date.now();
                  return (
                    <div key={`attention-${p.id}`} className={cn(
                      "flex items-center gap-3 p-2.5 rounded-md border hover-elevate",
                      isOverdue && "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
                    )} data-testid={`attention-item-${p.id}`}>
                      <Bell className={cn("w-4 h-4 flex-shrink-0", isOverdue ? "text-red-500 animate-pulse" : "text-blue-500")} />
                      <Link href={linkHref} className="flex-1 min-w-0 cursor-pointer" onClick={() => handleDismissProject(item.projectId, item.hash)}>
                        <p className="text-sm font-medium truncate">{projectName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {isOverdue ? "Overdue:" : "Due soon:"}{" "}
                          {p.reminderType === "call" ? "Call" : "Message"}{" "}
                          {(() => { try { return format(reminderDate, "MMM d 'at' h:mm a"); } catch { return ""; } })()}
                          {p.reminderNote ? ` — ${p.reminderNote}` : ""}
                        </p>
                      </Link>
                      <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={(e) => handleDismissProject(item.projectId, item.hash, e)} data-testid={`dismiss-attention-${p.id}`}><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  );
                })}
                {unscheduledBookings.filter(b => !dismissedMap[`booking-${b.id}`]).map((b) => (
                  <div key={`booking-${b.id}`} className="flex items-center gap-3 p-2.5 rounded-md border hover-elevate" data-testid={`attention-booking-${b.id}`}>
                    <CalendarPlus className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <Link href="/calendar" className="flex-1 min-w-0 cursor-pointer" onClick={() => handleDismissBooking(b.id)}>
                      <p className="text-sm font-medium truncate" data-testid={`attention-booking-name-${b.id}`}>{maskName(`${b.firstName} ${b.lastName}`)}</p>
                      <p className="text-xs text-muted-foreground truncate">Appointment request — not yet scheduled</p>
                    </Link>
                    <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={(e) => handleDismissBooking(b.id, e)} data-testid={`dismiss-booking-${b.id}`}><X className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
                {pendingAiActions.map((action: any) => {
                  const isReminder = action.type === 'reminder';
                  const isCreateLead = action.type === 'create_lead';
                  const isUpdateContact = action.type === 'update_contact';
                  const borderClass = isCreateLead
                    ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20'
                    : isUpdateContact
                    ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20'
                    : isReminder 
                    ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20' 
                    : 'border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20';
                  const iconClass = isCreateLead ? 'text-green-500' : isUpdateContact ? 'text-blue-500' : isReminder ? 'text-amber-500' : 'text-violet-500';
                  const ActionIcon = isCreateLead ? UserPlus : isUpdateContact ? Pencil : isReminder ? Bell : Sparkles;
                  const subtitle = isCreateLead
                    ? `AI detected a new lead${action.details?.source === 'sms' ? ' from SMS' : action.details?.source === 'phone_call' ? ' from call' : ''}`
                    : isUpdateContact
                    ? `AI found new info for ${action.details?.name || 'contact'}${action.details?.source === 'sms' ? ' from SMS' : action.details?.source === 'phone_call' ? ' from call' : ''}`
                    : action.type === 'reminder' 
                    ? `AI Reminder${action.details?.contactName ? ` — ${action.details.contactName}` : ''}`
                    : action.type === 'proposal_suggestion' ? 'AI suggests creating a proposal' 
                    : action.type === 'scheduling_suggestion' ? 'Customer wants to schedule' 
                    : 'AI suggestion';
                  const isScheduleRelated = action.type === 'scheduling_suggestion' || 
                    (action.type === 'reminder' && /schedul|appointment|site visit|walkthrough|meeting|call back|follow.?up|come (out|by|over)/i.test(action.summary || ''));
                  const aiLinkHref = isCreateLead
                    ? `/contacts?ai_action=${action.id}`
                    : isUpdateContact
                    ? `/contacts/${action.contactId}?ai_action=${action.id}`
                    : isScheduleRelated
                    ? '/calendar?tab=appointments'
                    : action.projectId 
                    ? `/projects/${action.projectId}?attention=ai_action` 
                    : action.contactId 
                    ? `/messages?contactId=${action.contactId}` 
                    : '#';

                  return (
                    <div key={`ai-action-${action.id}`} className={`flex items-center gap-3 p-2.5 rounded-md border ${borderClass}`} data-testid={`attention-ai-action-${action.id}`}>
                      <ActionIcon className={`w-4 h-4 ${iconClass} flex-shrink-0`} />
                      <Link href={aiLinkHref} className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                        if (!isCreateLead && !isUpdateContact) {
                          dismissAction.mutate(action.id);
                        }
                      }}>
                        <p className="text-sm font-medium truncate">{action.summary}</p>
                        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                      </Link>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 flex-shrink-0"
                        onClick={(e) => { e.stopPropagation(); dismissAction.mutate(action.id); }}
                        data-testid={`dismiss-ai-action-${action.id}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5"><h2 className="text-lg font-semibold" data-testid="text-sales-pipeline">Sales Pipeline</h2> <InfoTooltip text="Visual overview of every deal in your sales process. Projects move left to right as they progress from new lead to accepted. Deals sitting too long in one stage will show aging indicators." /></span>
              {pipelineValue > 0 && (
                <Badge variant="outline" className="text-xs">
                  {formatCurrencyCompact(pipelineValue)} potential
                </Badge>
              )}
            </div>
            <Link href="/projects">
              <Button variant="ghost" size="sm" data-testid="button-view-all-projects">
                All Projects <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          <Card data-testid="card-sales-pipeline">
            <CardContent className="pt-5 pb-5">
              <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-6", userTier === 'starter' ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
                {activeSalesStages.map(stage => (
                  <PipelineColumn key={stage} stage={stage} projects={projectsByStage(stage)} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold" data-testid="text-active-jobs">Active Jobs</h2>
              {jobsValue > 0 && (
                <Badge variant="outline" className="text-xs">
                  {formatCurrencyCompact(jobsValue)} value
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>YTD Revenue: <strong className="text-foreground">{formatCurrencyCompact(stats.yearlyRevenue)}</strong></span>
            </div>
          </div>
          <Card data-testid="card-active-jobs">
            <CardContent className="pt-5 pb-5">
              {jobProjects.length === 0 ? (
                <div className="py-12 text-center">
                  <Briefcase className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                  <p className="text-muted-foreground text-sm">No active jobs yet</p>
                  <p className="text-muted-foreground text-xs mt-1">Projects move here after proposals are accepted</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {activeJobStages.map(stage => (
                    <JobSection key={stage} stage={stage} projects={projectsByStage(stage)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
