import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FeatureTipBanner } from "@/components/FeatureTipBanner";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import { cn, formatPhoneDisplay } from "@/lib/utils";
import { normalizePhone, isValidPhone, stripPhoneInput } from "@/lib/phone";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  FolderKanban,
  ChevronRight,
  ChevronDown,
  Filter,
  User,
  Loader2,
  Calendar,
  DollarSign,
  MapPin,
  MoreVertical,
  Archive,
  ArchiveRestore,
  Trash2,
  UserPlus,
  FileEdit,
  FileSignature,
  CalendarCheck,
  CalendarDays,
  Hammer,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Bell,
  Clock,
  CalendarX,
  MessageCircle,
  Phone as PhoneIcon,
} from "lucide-react";
import type { Contact, ProjectWithContact } from "@shared/schema";
import { useDemoMode } from "@/contexts/DemoModeContext";

interface ProjectBadge {
  label: string;
  icon: typeof Bell;
  variant: "destructive" | "warning" | "info";
  className: string;
}

function getProjectBadges(project: ProjectWithContact): ProjectBadge[] {
  const badges: ProjectBadge[] = [];
  const now = new Date();

  if (project.reminderAt) {
    const reminderDate = new Date(project.reminderAt);
    if (reminderDate < now) {
      badges.push({
        label: "Overdue",
        icon: Bell,
        variant: "destructive",
        className: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
      });
    }
  }

  if (project.stage === 'accepted' && !project.scheduledDate) {
    badges.push({
      label: "Needs scheduling",
      icon: CalendarX,
      variant: "warning",
      className: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    });
  }

  const lastAction = project.stageChangedAt
    ? new Date(project.stageChangedAt)
    : project.createdAt
      ? new Date(project.createdAt)
      : null;
  if (lastAction && project.stage !== 'completed' && project.stage !== 'paid') {
    const idleDays = Math.floor((now.getTime() - lastAction.getTime()) / (1000 * 60 * 60 * 24));
    const threshold = ['new_lead', 'appointment_requested', 'draft'].includes(project.stage) ? 3
      : ['proposal_sent'].includes(project.stage) ? 5
      : ['invoiced'].includes(project.stage) ? 7
      : 7;
    if (idleDays >= threshold) {
      badges.push({
        label: `${idleDays}d idle`,
        icon: Clock,
        variant: "warning",
        className: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
      });
    }
  }

  if (project.automationPausedReason && !project.automationPausedReason.includes('dismissed')) {
    badges.push({
      label: "Action needed",
      icon: AlertTriangle,
      variant: "warning",
      className: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
    });
  }

  return badges;
}

const stages = [
  { value: "new_lead", label: "New Leads", shortLabel: "Lead", icon: UserPlus, color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300", accentBar: "bg-blue-500", headerBg: "bg-blue-50 dark:bg-blue-950/40", headerText: "text-blue-800 dark:text-blue-200", iconColor: "text-blue-600 dark:text-blue-400", iconBg: "bg-blue-500/10", countBg: "bg-blue-500 text-white" },
  { value: "appointment_requested", label: "Appt Requested", shortLabel: "Appt", icon: CalendarCheck, color: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300", accentBar: "bg-cyan-500", headerBg: "bg-cyan-50 dark:bg-cyan-950/40", headerText: "text-cyan-800 dark:text-cyan-200", iconColor: "text-cyan-600 dark:text-cyan-400", iconBg: "bg-cyan-500/10", countBg: "bg-cyan-500 text-white" },
  { value: "draft", label: "Drafts", shortLabel: "Draft", icon: FileEdit, color: "bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300", accentBar: "bg-slate-400", headerBg: "bg-slate-50 dark:bg-slate-950/40", headerText: "text-slate-700 dark:text-slate-300", iconColor: "text-slate-600 dark:text-slate-400", iconBg: "bg-slate-500/10", countBg: "bg-slate-500 text-white" },
  { value: "proposal_sent", label: "Proposal Sent", shortLabel: "Sent", icon: FileSignature, color: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300", accentBar: "bg-amber-500", headerBg: "bg-amber-50 dark:bg-amber-950/40", headerText: "text-amber-800 dark:text-amber-200", iconColor: "text-amber-600 dark:text-amber-400", iconBg: "bg-amber-500/10", countBg: "bg-amber-500 text-white" },
  { value: "accepted", label: "Accepted", shortLabel: "Accepted", icon: CalendarCheck, color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300", accentBar: "bg-emerald-500", headerBg: "bg-emerald-50 dark:bg-emerald-950/40", headerText: "text-emerald-800 dark:text-emerald-200", iconColor: "text-emerald-600 dark:text-emerald-400", iconBg: "bg-emerald-500/10", countBg: "bg-emerald-500 text-white" },
  { value: "scheduled", label: "Scheduled", shortLabel: "Scheduled", icon: CalendarDays, color: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300", accentBar: "bg-violet-500", headerBg: "bg-violet-50 dark:bg-violet-950/40", headerText: "text-violet-800 dark:text-violet-200", iconColor: "text-violet-600 dark:text-violet-400", iconBg: "bg-violet-500/10", countBg: "bg-violet-500 text-white" },
  { value: "in_progress", label: "In Progress", shortLabel: "In Progress", icon: Hammer, color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300", accentBar: "bg-blue-500", headerBg: "bg-blue-50 dark:bg-blue-950/40", headerText: "text-blue-800 dark:text-blue-200", iconColor: "text-blue-600 dark:text-blue-400", iconBg: "bg-blue-500/10", countBg: "bg-blue-500 text-white" },
  { value: "invoiced", label: "Invoiced", shortLabel: "Invoiced", icon: Receipt, color: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300", accentBar: "bg-orange-500", headerBg: "bg-orange-50 dark:bg-orange-950/40", headerText: "text-orange-800 dark:text-orange-200", iconColor: "text-orange-600 dark:text-orange-400", iconBg: "bg-orange-500/10", countBg: "bg-orange-500 text-white" },
  { value: "paid", label: "Paid", shortLabel: "Paid", icon: DollarSign, color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300", accentBar: "bg-emerald-500", headerBg: "bg-emerald-50 dark:bg-emerald-950/40", headerText: "text-emerald-800 dark:text-emerald-200", iconColor: "text-emerald-600 dark:text-emerald-400", iconBg: "bg-emerald-500/10", countBg: "bg-emerald-500 text-white" },
  { value: "completed", label: "Completed", shortLabel: "Done", icon: CheckCircle2, color: "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300", accentBar: "bg-gray-400", headerBg: "bg-gray-50 dark:bg-gray-900/40", headerText: "text-gray-700 dark:text-gray-300", iconColor: "text-gray-500 dark:text-gray-400", iconBg: "bg-gray-500/10", countBg: "bg-gray-500 text-white" },
];

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
  { value: "_other", label: "Other (custom)" },
];

function getStageInfo(stage: string) {
  return stages.find(s => s.value === stage) || stages[0];
}

function ProjectCardRow({ project, showArchived, onArchive, onDelete, onUnarchive, onNavigate }: {
  project: ProjectWithContact;
  showArchived: boolean;
  onArchive: (p: ProjectWithContact) => void;
  onDelete: (p: ProjectWithContact) => void;
  onUnarchive: (id: number) => void;
  onNavigate: (path: string) => void;
}) {
  const { maskName, maskAddress, maskCity, maskProjectTitle } = useDemoMode();
  const stageInfo = getStageInfo(project.stage);
  const badges = showArchived ? [] : getProjectBadges(project);
  return (
    <Card
      className="hover-elevate cursor-pointer"
      onClick={() => onNavigate(`/projects/${project.id}`)}
      data-testid={`card-project-${project.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className="text-[10px] font-mono shrink-0" data-testid={`badge-number-${project.id}`}>
                #{project.projectNumber}
              </Badge>
              <p className="font-semibold truncate" data-testid={`text-project-title-${project.id}`}>
                {maskProjectTitle(project.title, project.contact?.name)}
              </p>
              <Badge variant="secondary" className={cn("text-[10px] shrink-0", stageInfo.color)} data-testid={`badge-stage-${project.id}`}>
                {stageInfo.shortLabel}
              </Badge>
              {project.leadQuality === 'good' && (
                <Badge variant="secondary" className="text-[10px] shrink-0 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" data-testid={`badge-lead-quality-${project.id}`}>
                  Good Lead
                </Badge>
              )}
              {project.leadQuality === 'bad' && (
                <Badge variant="secondary" className="text-[10px] shrink-0 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" data-testid={`badge-lead-quality-${project.id}`}>
                  Bad Lead
                </Badge>
              )}
              {project.leadQuality === 'not_qualified' && (
                <Badge variant="secondary" className="text-[10px] shrink-0 bg-gray-100 dark:bg-gray-800/30 text-gray-600 dark:text-gray-400" data-testid={`badge-lead-quality-${project.id}`}>
                  Not Qualified
                </Badge>
              )}
              {badges.map((badge, i) => {
                const Icon = badge.icon;
                return (
                  <Badge key={i} variant="outline" className={cn("text-[10px] shrink-0 gap-0.5", badge.className)} data-testid={`badge-indicator-${project.id}-${i}`}>
                    <Icon className="w-3 h-3" />
                    {badge.label}
                  </Badge>
                );
              })}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {maskName(project.contact.name)}
              </span>
              {project.totalAmount != null && project.totalAmount > 0 && project.stage !== 'new_lead' && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  {(project.totalAmount / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                </span>
              )}
              {project.createdAt && (
                <span className="flex items-center gap-1 text-xs" data-testid={`project-created-${project.id}`}>
                  <Calendar className="w-3 h-3" />
                  Created {(() => { try { return format(new Date(project.createdAt), "MMM d, yyyy"); } catch { return ''; } })()}
                </span>
              )}
              {project.scheduledDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {format(new Date(project.scheduledDate + "T00:00:00"), "MMM d")}
                </span>
              )}
              {project.source && (
                <span className="text-xs capitalize">
                  {project.source.replace(/_/g, " ")}
                </span>
              )}
            </div>
            {(project.jobAddress || project.jobCity) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <MapPin className="w-3 h-3" />
                {[maskAddress(project.jobAddress), maskCity(project.jobCity), project.jobState].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 mt-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" data-testid={`button-project-menu-${project.id}`}>
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {showArchived ? (
                  <DropdownMenuItem
                    onClick={() => onUnarchive(project.id)}
                    data-testid={`menu-unarchive-${project.id}`}
                  >
                    <ArchiveRestore className="w-4 h-4 mr-2" />
                    Restore Project
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => onArchive(project)}
                    data-testid={`menu-archive-${project.id}`}
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    Archive
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(project)}
                  data-testid={`menu-delete-${project.id}`}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StageGroup({ stage, projects: stageProjects, showArchived, onArchive, onDelete, onUnarchive, onNavigate }: {
  stage: typeof stages[0];
  projects: ProjectWithContact[];
  showArchived: boolean;
  onArchive: (p: ProjectWithContact) => void;
  onDelete: (p: ProjectWithContact) => void;
  onUnarchive: (id: number) => void;
  onNavigate: (path: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = stage.icon;
  const stageTotal = stageProjects.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
  const sorted = [...stageProjects].sort((a, b) => {
    const da = a.stageChangedAt ? new Date(a.stageChangedAt).getTime() : a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.stageChangedAt ? new Date(b.stageChangedAt).getTime() : b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });
  const newestProject = sorted[0];

  return (
    <div data-testid={`stage-group-${stage.value}`}>
      <div
        className={cn("rounded-md mb-3 overflow-hidden sticky top-0 z-50 cursor-pointer")}
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid={`stage-header-${stage.value}`}
      >
        <div className={cn("h-1.5 w-full", stage.accentBar)} />
        <div className={cn("px-4 py-3", stage.headerBg)}>
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-md", stage.iconBg)}>
              <Icon className={cn("w-5 h-5", stage.iconColor)} />
            </div>
            <span className={cn("text-base font-bold", stage.headerText)}>{stage.label}</span>
            {stage.value !== 'new_lead' && stageTotal > 0 && (
              <span className={cn("text-sm font-medium opacity-80", stage.headerText)}>
                {(stageTotal / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 })}
              </span>
            )}
            <span className={cn("ml-auto text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center", stage.countBg)} data-testid={`stage-count-${stage.value}`}>
              {stageProjects.length}
            </span>
            {isExpanded ? (
              <ChevronDown className={cn("w-4 h-4 flex-shrink-0", stage.headerText)} />
            ) : (
              <ChevronRight className={cn("w-4 h-4 flex-shrink-0", stage.headerText)} />
            )}
          </div>
          {!isExpanded && newestProject && (
            <p className={cn("text-xs mt-1.5 pl-10 truncate opacity-80", stage.headerText)}>
              Latest: {newestProject.contact?.name || newestProject.title}
              {newestProject.totalAmount && stage.value !== 'new_lead' ? ` - ${(newestProject.totalAmount / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 })}` : ''}
            </p>
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="space-y-2">
          {sorted.map(project => (
            <ProjectCardRow key={project.id} project={project} showArchived={showArchived} onArchive={onArchive} onDelete={onDelete} onUnarchive={onUnarchive} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Projects() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [preselectedContactId, setPreselectedContactId] = useState<number | undefined>(undefined);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ProjectWithContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectWithContact | null>(null);

  useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('newProject') === 'true') {
      const cId = params.get('contactId');
      if (cId) setPreselectedContactId(parseInt(cId));
      setShowCreateDialog(true);
      window.history.replaceState({}, '', '/projects');
    }
  });

  const { data: projects, isLoading } = useQuery<ProjectWithContact[]>({
    queryKey: ["/api/projects", { archived: showArchived }],
    queryFn: async () => {
      const res = await fetch(`/api/projects?archived=${showArchived}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });


  const archiveMutation = useMutation({
    mutationFn: async (projectId: number) => {
      return apiRequest("POST", `/api/projects/${projectId}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project archived" });
      setArchiveTarget(null);
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (projectId: number) => {
      return apiRequest("POST", `/api/projects/${projectId}/unarchive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project restored" });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      return apiRequest("DELETE", `/api/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project deleted" });
      setDeleteTarget(null);
    },
  });

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    let filtered = projects;
    if (stageFilter !== "all") {
      filtered = filtered.filter(p => p.stage === stageFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.contact.name.toLowerCase().includes(q) ||
        p.contact.phone?.toLowerCase().includes(q) ||
        p.contact.email?.toLowerCase().includes(q) ||
        `#${p.projectNumber}`.includes(q)
      );
    }
    return filtered;
  }, [projects, stageFilter, searchQuery]);

  const stageCounts = useMemo(() => {
    if (!projects) return {};
    const counts: Record<string, number> = {};
    for (const p of projects) {
      counts[p.stage] = (counts[p.stage] || 0) + 1;
    }
    return counts;
  }, [projects]);

  const groupedByStage = useMemo(() => {
    if (!filteredProjects || stageFilter !== "all") return null;
    const groups: Array<{ stage: typeof stages[0]; projects: ProjectWithContact[] }> = [];
    for (const stage of stages) {
      const stageProjects = filteredProjects.filter(p => p.stage === stage.value);
      if (stageProjects.length > 0) {
        groups.push({ stage, projects: stageProjects });
      }
    }
    return groups;
  }, [filteredProjects, stageFilter]);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-projects-title">Projects</h1>
          <p className="text-sm text-muted-foreground">Track every lead from start to finish</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-project">
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      <FeatureTipBanner
        id="projects-getting-started"
        title="Your Project Pipeline"
        description="Each project moves through stages — from new lead to paid. Create your first project and follow the guided next steps."
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, phone, email, or project number..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search-projects"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {!showArchived && (
          <>
            <Button
              variant={stageFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setStageFilter("all")}
              data-testid="filter-all"
            >
              All {projects?.length ? `(${projects.length})` : ""}
            </Button>
            {stages.map(stage => (
              <Button
                key={stage.value}
                variant={stageFilter === stage.value ? "default" : "outline"}
                size="sm"
                onClick={() => setStageFilter(stage.value)}
                className="whitespace-nowrap"
                data-testid={`filter-${stage.value}`}
              >
                {stage.shortLabel} {stageCounts[stage.value] ? `(${stageCounts[stage.value]})` : ""}
              </Button>
            ))}
          </>
        )}
        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => { setShowArchived(!showArchived); setStageFilter("all"); }}
          className="whitespace-nowrap ml-auto"
          data-testid="filter-archived"
        >
          <Archive className="w-3.5 h-3.5 mr-1" />
          Archived
        </Button>
      </div>

      {isLoading && !projects ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-12">
          <FolderKanban className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            {searchQuery || stageFilter !== "all"
              ? "No projects match your filters"
              : "No projects yet. Create your first one!"}
          </p>
        </div>
      ) : groupedByStage ? (
        <div className="space-y-6">
          {groupedByStage.map(({ stage, projects: stageProjects }) => (
            <StageGroup
              key={stage.value}
              stage={stage}
              projects={stageProjects}
              showArchived={showArchived}
              onArchive={setArchiveTarget}
              onDelete={setDeleteTarget}
              onUnarchive={(id) => unarchiveMutation.mutate(id)}
              onNavigate={setLocation}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredProjects.map(project => (
            <ProjectCardRow key={project.id} project={project} showArchived={showArchived} onArchive={setArchiveTarget} onDelete={setDeleteTarget} onUnarchive={(id) => unarchiveMutation.mutate(id)} onNavigate={setLocation} />
          ))}
        </div>
      )}

      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Project</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive <span className="font-semibold">{archiveTarget?.title}</span> and cancel all scheduled automations (follow-ups, reminders). The project will be hidden from your main list but can be restored later. Automations will NOT restart automatically if you restore it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-archive">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget.id)}
              data-testid="button-confirm-archive"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold">{deleteTarget?.title}</span> and all its activity notes. The contact and any documents will remain. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteProjectMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setPreselectedContactId(undefined);
        }}
        preselectedContactId={preselectedContactId}
      />
    </div>
  );
}

function CreateProjectDialog({ open, onOpenChange, preselectedContactId }: { open: boolean; onOpenChange: (open: boolean) => void; preselectedContactId?: number }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [contactId, setContactId] = useState<string>(preselectedContactId ? String(preselectedContactId) : "");
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactAddress, setNewContactAddress] = useState("");
  const [newContactCity, setNewContactCity] = useState("");
  const [newContactState, setNewContactState] = useState("");
  const [newContactZip, setNewContactZip] = useState("");
  const [newContactLeadSource, setNewContactLeadSource] = useState("");
  const [newContactCustomSource, setNewContactCustomSource] = useState("");
  const [showNewContactCustomSource, setShowNewContactCustomSource] = useState(false);
  const [source, setSource] = useState("");
  const [customSource, setCustomSource] = useState("");
  const [showCustomSource, setShowCustomSource] = useState(false);
  const [sourceAutoSet, setSourceAutoSet] = useState(false);
  const [description, setDescription] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [showRecipient, setShowRecipient] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [phoneDuplicate, setPhoneDuplicate] = useState<{ id: number; name: string; phone: string } | null>(null);
  const [existingProjectWarning, setExistingProjectWarning] = useState<{projectId: number; title: string} | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const phoneCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useState(() => {
    if (preselectedContactId) {
      setContactId(String(preselectedContactId));
    }
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: allProjects } = useQuery<ProjectWithContact[]>({
    queryKey: ["/api/projects"],
    enabled: open,
  });

  const { data: nextNumberData } = useQuery<{ nextNumber: number }>({
    queryKey: ["/api/projects/next-number"],
    enabled: open,
  });

  const selectedContact = contacts?.find(c => c.id === parseInt(contactId));
  const isRepeatCustomer = useMemo(() => {
    if (!selectedContact || !allProjects) return false;
    return allProjects.some(p => p.contactId === selectedContact.id);
  }, [selectedContact, allProjects]);

  const handleSelectContact = (id: string) => {
    setContactId(id);
    setContactSearch("");
    const openProjects = allProjects?.filter(p =>
      p.contactId === parseInt(id) &&
      !['completed', 'archived', 'cancelled', 'lost'].includes(p.stage)
    );
    if (openProjects && openProjects.length > 0) {
      setExistingProjectWarning({ projectId: openProjects[0].id, title: openProjects[0].title });
    } else {
      setExistingProjectWarning(null);
    }
    const contact = contacts?.find(c => c.id === parseInt(id));
    if (contact) {
      const hasExistingProjects = allProjects?.some(p => p.contactId === contact.id);
      if (hasExistingProjects) {
        setSource("repeat_customer");
        setShowCustomSource(false);
        setCustomSource("");
        setSourceAutoSet(true);
      } else if (contact.leadSource) {
        const isKnownSource = leadSources.some(s => s.value === contact.leadSource);
        if (isKnownSource) {
          setSource(contact.leadSource);
          setShowCustomSource(false);
          setCustomSource("");
        } else {
          setShowCustomSource(true);
          setCustomSource(contact.leadSource);
          setSource("");
        }
        setSourceAutoSet(true);
      } else {
        setSource("");
        setShowCustomSource(false);
        setCustomSource("");
        setSourceAutoSet(false);
      }
    }
  };

  const checkPhoneDuplicate = (phone: string) => {
    if (phoneCheckTimerRef.current) clearTimeout(phoneCheckTimerRef.current);
    setPhoneDuplicate(null);
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) return;
    phoneCheckTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts/check-phone?phone=${encodeURIComponent(digits)}`, { credentials: 'include' });
        const data = await res.json();
        if (data.exists && data.contact) {
          setPhoneDuplicate(data.contact);
        }
      } catch {}
    }, 500);
  };

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    if (!contactSearch.trim()) return contacts;
    const q = contactSearch.toLowerCase();
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  }, [contacts, contactSearch]);

  const createContactMutation = useMutation({
    mutationFn: async (data: { name: string; phone: string; email: string; address?: string; city?: string; state?: string; zipCode?: string; leadSource?: string }) => {
      const res = await apiRequest("POST", "/api/contacts", {
        name: data.name,
        phone: data.phone,
        email: data.email || "",
        address: data.address || "",
        city: data.city || "",
        state: data.state || "",
        zipCode: data.zipCode || "",
        leadSource: data.leadSource || null,
        type: "lead",
        status: "new",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: { contactId: number; source?: string; description?: string; recipient?: { name: string; phone: string; email: string } }) => {
      const contact = contacts?.find(c => c.id === data.contactId);
      const title = `${contact?.name || "New"} #${nextNumberData?.nextNumber || 4200}`;
      const res = await apiRequest("POST", "/api/projects", {
        contactId: data.contactId,
        title,
        source: data.source || null,
        description: data.description || null,
        stage: "new_lead",
      });
      const project = await res.json();
      resetForm();
      onOpenChange(false);
      toast({ title: "Project created" });
      setLocation(`/projects/${project.id}`);
      if (data.recipient?.name) {
        apiRequest("POST", `/api/projects/${project.id}/recipients`, {
          name: data.recipient.name,
          phone: data.recipient.phone || null,
          email: data.recipient.email || null,
          role: "spouse",
        }).catch(() => {});
      }
      return project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/next-number"] });
    },
    onError: () => {
      toast({ title: "Failed to create project", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setContactId("");
    setShowNewContact(false);
    setNewContactName("");
    setNewContactPhone("");
    setNewContactEmail("");
    setNewContactAddress("");
    setNewContactCity("");
    setNewContactState("");
    setNewContactZip("");
    setNewContactLeadSource("");
    setNewContactCustomSource("");
    setShowNewContactCustomSource(false);
    setSource("");
    setCustomSource("");
    setShowCustomSource(false);
    setSourceAutoSet(false);
    setDescription("");
    setContactSearch("");
    setShowRecipient(false);
    setRecipientName("");
    setRecipientPhone("");
    setRecipientEmail("");
    setPhoneDuplicate(null);
    setExistingProjectWarning(null);
    setSubmitAttempted(false);
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    let finalContactId = contactId ? parseInt(contactId) : 0;

    if (showNewContact) {
      if (!newContactName.trim()) {
        toast({ title: "Contact name is required", variant: "destructive" });
        return;
      }
      if (!newContactPhone.trim()) {
        toast({ title: "Phone number is required", variant: "destructive" });
        return;
      }
      if (newContactPhone.length > 0 && !isValidPhone(newContactPhone)) {
        toast({ title: "Invalid phone number", description: "Enter a valid US/Canada phone number", variant: "destructive" });
        return;
      }
      const contactLeadSource = showNewContactCustomSource ? newContactCustomSource.trim() : newContactLeadSource;
      try {
        const newContact = await createContactMutation.mutateAsync({
          name: newContactName.trim(),
          phone: normalizePhone(newContactPhone.trim()),
          email: newContactEmail.trim(),
          address: newContactAddress.trim(),
          city: newContactCity.trim(),
          state: newContactState.trim(),
          zipCode: newContactZip.trim(),
          leadSource: contactLeadSource || undefined,
        });
        finalContactId = newContact.id;
        if (contactLeadSource && !source && !showCustomSource) {
          const isKnownSource = leadSources.some(s => s.value === contactLeadSource);
          if (isKnownSource) {
            setSource(contactLeadSource);
          } else {
            setShowCustomSource(true);
            setCustomSource(contactLeadSource);
          }
        }
      } catch (err: any) {
        const rawMsg = err?.message || "";
        let displayMsg = "Failed to create contact";
        try {
          const jsonPart = rawMsg.substring(rawMsg.indexOf('{'));
          const parsed = JSON.parse(jsonPart);
          if (parsed.message) displayMsg = parsed.message;
        } catch {
          if (rawMsg.includes("already exists")) displayMsg = rawMsg;
        }
        toast({ title: displayMsg.includes("already exists") ? "Duplicate contact" : "Error", description: displayMsg, variant: "destructive" });
        return;
      }
    }

    if (!finalContactId) {
      toast({ title: "Please select or create a contact", variant: "destructive" });
      return;
    }

    const finalSource = showCustomSource ? customSource.trim() : source;
    createProjectMutation.mutate({
      contactId: finalContactId,
      source: finalSource || undefined,
      description: description.trim() || undefined,
      recipient: showRecipient && recipientName.trim() ? {
        name: recipientName.trim(),
        phone: recipientPhone.trim(),
        email: recipientEmail.trim(),
      } : undefined,
    });
  };

  const useExistingDuplicate = () => {
    if (phoneDuplicate) {
      setShowNewContact(false);
      setContactId(String(phoneDuplicate.id));
      setContactSearch("");
      setNewContactPhone("");
      setPhoneDuplicate(null);
      handleSelectContact(String(phoneDuplicate.id));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            Project #{nextNumberData?.nextNumber || "..."} will be created
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 -mx-6 px-6">
          <div className="space-y-2">
            <Label>Contact</Label>
            {!showNewContact ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search contacts..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-contact"
                  />
                </div>
                {selectedContact ? (
                  <>
                  <Card className="border-primary">
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{selectedContact.name}</p>
                        <p className="text-xs text-muted-foreground">{formatPhoneDisplay(selectedContact.phone)}</p>
                        {isRepeatCustomer && (
                          <Badge variant="secondary" className="mt-1">
                            <RefreshCw className="w-3 h-3 mr-1" /> Repeat Customer
                          </Badge>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { setContactId(""); setSource(""); setSourceAutoSet(false); setShowCustomSource(false); setCustomSource(""); setExistingProjectWarning(null); }} data-testid="button-clear-contact">
                        Change
                      </Button>
                    </CardContent>
                  </Card>
                  {existingProjectWarning && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                            This contact already has an open project: "{existingProjectWarning.title}"
                          </p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setLocation(`/projects/${existingProjectWarning.projectId}`);
                                resetForm();
                                onOpenChange(false);
                              }}
                              data-testid="button-go-to-existing-project"
                            >
                              Go to Existing Project
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExistingProjectWarning(null)}
                              data-testid="button-create-new-anyway"
                            >
                              Create New Anyway
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  </>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
                    {filteredContacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        {contactSearch ? "No contacts found" : "No contacts yet"}
                      </p>
                    ) : (
                      filteredContacts.slice(0, 20).map(contact => (
                        <div
                          key={contact.id}
                          className="p-2 rounded-md hover-elevate cursor-pointer flex items-center justify-between gap-2"
                          onClick={() => handleSelectContact(String(contact.id))}
                          data-testid={`select-contact-${contact.id}`}
                        >
                          <div>
                            <p className="text-sm font-medium">{contact.name}</p>
                            <p className="text-xs text-muted-foreground">{formatPhoneDisplay(contact.phone)}</p>
                          </div>
                          {allProjects?.some(p => p.contactId === contact.id) && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              <RefreshCw className="w-3 h-3 mr-1" /> Repeat
                            </Badge>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowNewContact(true)}
                  data-testid="button-new-contact"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Contact
                </Button>
              </div>
            ) : (
              <div className="space-y-3 border rounded-md p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">New Contact</Label>
                  <Button variant="ghost" size="sm" onClick={() => { setShowNewContact(false); setPhoneDuplicate(null); }} data-testid="button-existing-contact">
                    Use Existing
                  </Button>
                </div>
                <div>
                  <Input
                    placeholder="Full name *"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    className={cn(submitAttempted && !newContactName.trim() ? 'border-destructive' : '')}
                    data-testid="input-new-contact-name"
                  />
                  {submitAttempted && !newContactName.trim() && (
                    <p className="text-xs text-destructive mt-1">Name is required</p>
                  )}
                </div>
                <div>
                  <Input
                    value={newContactPhone}
                    onChange={(e) => {
                      const val = stripPhoneInput(e.target.value);
                      setNewContactPhone(val);
                      checkPhoneDuplicate(val);
                    }}
                    inputMode="tel"
                    placeholder="+15551234567"
                    data-testid="input-new-contact-phone"
                    className={cn(
                      (newContactPhone.length > 0 && !isValidPhone(newContactPhone)) || (submitAttempted && !newContactPhone.trim())
                        ? 'border-destructive' : ''
                    )}
                  />
                  {newContactPhone && newContactPhone.length > 0 && !isValidPhone(newContactPhone) && (
                    <p className="text-xs text-destructive mt-1">Enter a valid US/Canada phone number</p>
                  )}
                  {submitAttempted && !newContactPhone.trim() && (
                    <p className="text-xs text-destructive mt-1">Phone number is required</p>
                  )}
                  {phoneDuplicate && (
                    <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                            This phone number belongs to {phoneDuplicate.name}
                          </p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={useExistingDuplicate}
                              data-testid="button-use-existing-duplicate"
                            >
                              Use {phoneDuplicate.name}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setNewContactPhone(""); setPhoneDuplicate(null); }}
                              data-testid="button-change-phone"
                            >
                              Change Number
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <Input
                  placeholder="Email (optional)"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  data-testid="input-new-contact-email"
                />
                <Input
                  placeholder="Street address (optional)"
                  value={newContactAddress}
                  onChange={(e) => setNewContactAddress(e.target.value)}
                  data-testid="input-new-contact-address"
                />
                <div className="grid grid-cols-5 gap-2">
                  <Input
                    placeholder="City"
                    value={newContactCity}
                    onChange={(e) => setNewContactCity(e.target.value)}
                    className="col-span-2"
                    data-testid="input-new-contact-city"
                  />
                  <Input
                    placeholder="State"
                    value={newContactState}
                    onChange={(e) => setNewContactState(e.target.value)}
                    className="col-span-1"
                    data-testid="input-new-contact-state"
                  />
                  <Input
                    placeholder="Zip"
                    value={newContactZip}
                    onChange={(e) => setNewContactZip(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    className="col-span-2"
                    data-testid="input-new-contact-zip"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">Lead Source <InfoTooltip text="How did this customer find you? Tracking lead sources helps you see which marketing channels (Google, Thumbtack, referrals, etc.) generate the most business." /></Label>
                  <Select
                    value={showNewContactCustomSource ? "_other" : newContactLeadSource}
                    onValueChange={(val) => {
                      if (val === "_other") {
                        setShowNewContactCustomSource(true);
                        setNewContactLeadSource("");
                      } else {
                        setShowNewContactCustomSource(false);
                        setNewContactCustomSource("");
                        setNewContactLeadSource(val);
                        if (!source && !showCustomSource) {
                          setSource(val);
                          setSourceAutoSet(true);
                        }
                      }
                    }}
                  >
                    <SelectTrigger data-testid="select-new-contact-lead-source">
                      <SelectValue placeholder="How did they find you?" />
                    </SelectTrigger>
                    <SelectContent>
                      {leadSources.map(s => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {showNewContactCustomSource && (
                    <Input
                      placeholder="Enter custom source..."
                      value={newContactCustomSource}
                      onChange={(e) => {
                        setNewContactCustomSource(e.target.value);
                        if (!source && !showCustomSource) {
                          setShowCustomSource(true);
                          setCustomSource(e.target.value);
                          setSourceAutoSet(true);
                        }
                      }}
                      className="mt-2"
                      data-testid="input-new-contact-custom-source"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {(contactId || showNewContact) && !showRecipient && (
            <button
              className="w-full flex items-center gap-2 p-3 rounded-md border border-dashed text-sm text-muted-foreground hover-elevate transition-colors"
              onClick={() => setShowRecipient(true)}
              data-testid="button-add-recipient"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              <span>Add a second decision-maker (e.g. spouse) to keep both in the loop</span>
            </button>
          )}

          {showRecipient && (
            <div className="space-y-3 border rounded-md p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Additional Recipient</Label>
                <Button variant="ghost" size="sm" onClick={() => { setShowRecipient(false); setRecipientName(""); setRecipientPhone(""); setRecipientEmail(""); }} data-testid="button-remove-recipient">
                  Remove
                </Button>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">Both people will receive proposals, invoices, and updates.</p>
              <Input
                placeholder="Name *"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                data-testid="input-recipient-name"
              />
              <Input
                placeholder="Phone number"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                data-testid="input-recipient-phone"
              />
              <Input
                placeholder="Email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                data-testid="input-recipient-email"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="flex items-center gap-1">Source <InfoTooltip text="The marketing channel or referral source for this project. This helps you measure ROI on advertising and know which lead sources to invest more in." /></Label>
              {sourceAutoSet && (
                <span className="text-xs text-muted-foreground">(auto-filled from contact)</span>
              )}
            </div>
            <Select
              value={showCustomSource ? "_other" : source}
              onValueChange={(val) => {
                setSourceAutoSet(false);
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
              <SelectTrigger data-testid="select-source">
                <SelectValue placeholder="Where did this lead come from?" />
              </SelectTrigger>
              <SelectContent>
                {leadSources.map(s => (
                  <SelectItem key={s.value} value={s.value} data-testid={`source-option-${s.value}`}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showCustomSource && (
              <Input
                placeholder="Enter custom source..."
                value={customSource}
                onChange={(e) => setCustomSource(e.target.value)}
                data-testid="input-custom-source"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              placeholder="Brief project description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-testid="input-project-description"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t">
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }} data-testid="button-cancel-project">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createProjectMutation.isPending || createContactMutation.isPending || (!contactId && !showNewContact)}
            data-testid="button-submit-project"
          >
            {(createProjectMutation.isPending || createContactMutation.isPending) && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
