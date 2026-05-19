import { useState, useCallback, useEffect, useRef } from "react";
import { useDashboardPipeline } from "@/hooks/use-dashboard";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Clock, AlertTriangle, Pause, Calendar, CalendarPlus,
  Bell, X, Heart, Sparkles, UserPlus, Pencil, ChevronDown, ChevronUp, Settings2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { ProjectWithContact } from "@shared/schema";
import { AppointmentCard } from "@/components/AppointmentCard";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useDemoMode } from "@/contexts/DemoModeContext";
import {
  ATTENTION_PRIORITY,
  isLowSentiment,
  hasOverdueOrSoonReminder,
  isPaused as isPausedFn,
  needsScheduling as needsSchedulingFn,
  isIdle as isIdleFn,
  type AttentionType,
} from "@shared/attention";

const DISMISS_STORAGE_KEY = "dismissed_attention";

function situationHash(p: ProjectWithContact): string {
  return `${p.stage}|${p.stageChangedAt || ""}|${(p as any).automationPausedAt || ""}|${p.reminderAt || ""}|${(p as any).scheduledDate || ""}|${(p as any).sentimentScore ?? ""}`;
}

function getDismissedAttentionMap(): Record<string, string> {
  try {
    const stored = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {};
}

function isProjectDismissed(map: Record<string, string>, projectId: number, hash: string): boolean {
  return map[`project-${projectId}`] === hash;
}

interface ConsolidatedItem {
  projectId: number;
  project: ProjectWithContact;
  primaryType: AttentionType;
  allTypes: AttentionType[];
  hash: string;
}

function consolidate(raw: Array<{ type: AttentionType; project: ProjectWithContact }>): ConsolidatedItem[] {
  const byProject = new Map<number, { project: ProjectWithContact; types: AttentionType[] }>();
  for (const item of raw) {
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
      hash: situationHash(project),
    };
  });
}

export default function Attention() {
  const [, navigate] = useLocation();
  const { maskName } = useDemoMode();
  const { data, isLoading } = useDashboardPipeline();
  const { data: bookingRequests } = useQuery<any[]>({ queryKey: ["/api/booking-requests"] });
  const { data: aiActions } = useQuery<any[]>({ queryKey: ["/api/ai-actions?status=pending"] });
  const { data: upcomingAppointments = [] } = useQuery<any[]>({
    queryKey: ["/api/appointments", "upcoming"],
    queryFn: async () => {
      const res = await fetch("/api/appointments", { credentials: "include" });
      if (!res.ok) return [];
      const all = await res.json();
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      return all
        .filter((a: any) => a.status === "scheduled" && a.date && new Date(a.date) >= now)
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    },
  });

  const { data: serverDismissed } = useQuery<{ items: Record<string, string> }>({ queryKey: ["/api/dismissed-attention"] });
  const [dismissedMap, setDismissedMap] = useState(() => getDismissedAttentionMap());
  const [appointmentsExpanded, setAppointmentsExpanded] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  // Notification preferences for this Attention page (immediate push + daily
  // digest at user's chosen hour). Pulled from company_settings; updates
  // PATCH back via the same endpoint.
  const { data: companySettings } = useQuery<any>({ queryKey: ["/api/settings/company"] });
  const immediateEnabled = companySettings?.attentionImmediateEnabled ?? true;
  const digestEnabled = companySettings?.attentionDigestEnabled ?? true;
  const digestHour = companySettings?.attentionDigestHour ?? 6;

  const updatePrefs = useMutation({
    mutationFn: (patch: Partial<{ attentionImmediateEnabled: boolean; attentionDigestEnabled: boolean; attentionDigestHour: number }>) =>
      apiRequest("PUT", "/api/settings/company", patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings/company"] }),
  });

  const formatHour = (h: number) => {
    const period = h < 12 ? "AM" : "PM";
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}:00 ${period}`;
  };

  useEffect(() => {
    if (serverDismissed?.items && typeof serverDismissed.items === "object") {
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

  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDismissProject = useCallback((projectId: number, hash: string, e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const map = getDismissedAttentionMap();
    map[`project-${projectId}`] = hash;
    localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(map));
    setDismissedMap(prev => {
      const next = { ...prev, [`project-${projectId}`]: hash };
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        apiRequest("POST", "/api/dismissed-attention", { items: getDismissedAttentionMap() })
          .then(() => queryClient.invalidateQueries({ queryKey: ["/api/attention/count"] }))
          .catch(() => {});
      }, 500);
      return next;
    });
  }, []);
  const handleDismissBooking = useCallback((bookingId: number, e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const key = `booking-${bookingId}`;
    const map = getDismissedAttentionMap();
    map[key] = "1";
    localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(map));
    setDismissedMap(prev => {
      const next = { ...prev, [key]: "1" };
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        apiRequest("POST", "/api/dismissed-attention", { items: getDismissedAttentionMap() }).catch(() => {});
      }, 500);
      return next;
    });
  }, []);

  const dismissAction = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/ai-actions/${id}`, { status: "dismissed" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/ai-actions?status=pending"] }),
  });

  if (isLoading && !data) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" data-testid="loading-spinner" />
      </div>
    );
  }

  const allProjects: ProjectWithContact[] = data?.projects || [];
  const lowSentimentProjects = allProjects.filter(isLowSentiment as any).sort((a, b) => ((a as any).sentimentScore || 0) - ((b as any).sentimentScore || 0));
  const reminderProjects = allProjects.filter(hasOverdueOrSoonReminder as any).sort((a, b) => new Date(a.reminderAt!).getTime() - new Date(b.reminderAt!).getTime());
  const pausedProjects = allProjects.filter(isPausedFn as any);
  const needsSchedulingList = allProjects.filter(needsSchedulingFn as any);
  const idleProjects = allProjects.filter(isIdleFn as any).sort((a, b) => {
    const da = a.stageChangedAt ? new Date(a.stageChangedAt).getTime() : a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.stageChangedAt ? new Date(b.stageChangedAt).getTime() : b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return da - db;
  });

  const raw: Array<{ type: AttentionType; project: ProjectWithContact }> = [
    ...lowSentimentProjects.map(p => ({ type: "low_sentiment" as const, project: p })),
    ...reminderProjects.filter(p => new Date(p.reminderAt!).getTime() <= Date.now()).map(p => ({ type: "reminder" as const, project: p })),
    ...pausedProjects.map(p => ({ type: "paused" as const, project: p })),
    ...needsSchedulingList.map(p => ({ type: "needs_scheduling" as const, project: p })),
    ...idleProjects.map(p => ({ type: "idle" as const, project: p })),
    ...reminderProjects.filter(p => new Date(p.reminderAt!).getTime() > Date.now()).map(p => ({ type: "reminder" as const, project: p })),
  ];
  const attentionItems = consolidate(raw).filter(item => !isProjectDismissed(dismissedMap, item.projectId, item.hash));
  const visibleBookings = (bookingRequests || []).filter((b: any) => b.status === "new" && !dismissedMap[`booking-${b.id}`]);
  const pendingAiActions = (aiActions || []).filter((a: any) => a.status === "pending");

  const totalCount = attentionItems.length + visibleBookings.length + pendingAiActions.length + (upcomingAppointments.length > 0 ? 1 : 0);

  return (
    <div className="container max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-md bg-amber-500/10">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold" data-testid="text-attention-title">Needs Your Attention</h1>
          <p className="text-xs text-muted-foreground" data-testid="text-attention-count">
            {totalCount === 0 ? "All caught up" : `${totalCount} item${totalCount === 1 ? "" : "s"} to review`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={() => setSettingsExpanded(v => !v)}
          data-testid="button-toggle-attention-settings"
          aria-label="Notification settings"
        >
          <Settings2 className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>

      {settingsExpanded && (
        <Card data-testid="card-attention-settings">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium">Notification settings</p>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" data-testid="label-immediate">Notify me right away</p>
                <p className="text-xs text-muted-foreground mt-0.5">Push notification the moment a project needs attention.</p>
              </div>
              <Switch
                checked={immediateEnabled}
                onCheckedChange={(v) => updatePrefs.mutate({ attentionImmediateEnabled: v })}
                disabled={updatePrefs.isPending}
                data-testid="switch-attention-immediate"
              />
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" data-testid="label-digest">Daily reminder</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Once-a-day push summarizing everything still needing attention — even items you've already been pinged about.</p>
                </div>
                <Switch
                  checked={digestEnabled}
                  onCheckedChange={(v) => updatePrefs.mutate({ attentionDigestEnabled: v })}
                  disabled={updatePrefs.isPending}
                  data-testid="switch-attention-digest"
                />
              </div>

              {digestEnabled && (
                <div className="flex items-center justify-between gap-3 pl-1">
                  <p className="text-sm text-muted-foreground">Reminder time</p>
                  <Select
                    value={String(digestHour)}
                    onValueChange={(v) => updatePrefs.mutate({ attentionDigestHour: parseInt(v, 10) })}
                    disabled={updatePrefs.isPending}
                  >
                    <SelectTrigger className="w-32 h-9" data-testid="select-attention-hour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, h) => (
                        <SelectItem key={h} value={String(h)} data-testid={`option-hour-${h}`}>
                          {formatHour(h)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {totalCount === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="inline-flex p-3 rounded-full bg-emerald-500/10 mb-3">
              <AlertTriangle className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-sm font-medium" data-testid="text-empty-state">Nothing needs your attention right now</p>
            <p className="text-xs text-muted-foreground mt-1">We'll let you know when something comes up.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-3">
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
                        <AppointmentCard key={appt.id} appointment={appt} compact onClick={() => navigate("/calendar?tab=appointments")} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {attentionItems.map((item) => {
                const p = item.project;
                const projectName = p.contact?.name ? `${maskName(p.contact.name)} #${p.projectNumber}` : `#${p.projectNumber}`;
                const linkHref = `/projects/${p.id}?attention=${encodeURIComponent(item.allTypes.join(","))}`;
                if (item.primaryType === "low_sentiment") {
                  const score = (p as any).sentimentScore;
                  const label = ((p as any).sentimentLabel || "negative").replace(/_/g, " ");
                  const isVeryLow = score < 20;
                  return (
                    <div key={`attention-${p.id}`} className={cn(
                      "flex items-center gap-3 p-2.5 rounded-md border hover-elevate",
                      isVeryLow ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20" : "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20"
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
                if (item.primaryType === "paused") {
                  return (
                    <div key={`attention-${p.id}`} className="flex items-center gap-3 p-2.5 rounded-md border hover-elevate" data-testid={`attention-item-${p.id}`}>
                      <Pause className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <Link href={linkHref} className="flex-1 min-w-0 cursor-pointer" onClick={() => handleDismissProject(item.projectId, item.hash)}>
                        <p className="text-sm font-medium truncate">{projectName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          Follow-ups paused — {p.automationPausedReason === "customer_replied" ? "customer replied" : "you messaged"}
                        </p>
                      </Link>
                      <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={(e) => handleDismissProject(item.projectId, item.hash, e)} data-testid={`dismiss-attention-${p.id}`}><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  );
                }
                if (item.primaryType === "needs_scheduling") {
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
                if (item.primaryType === "idle") {
                  const lastAction = p.stageChangedAt ? new Date(p.stageChangedAt) : p.createdAt ? new Date(p.createdAt) : null;
                  const idleDays = lastAction ? Math.floor((Date.now() - lastAction.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                  const suggestion = ["new_lead", "appointment_requested", "draft"].includes(p.stage)
                    ? `No contact in ${idleDays}d — call now`
                    : p.stage === "proposal_sent" ? `No reply in ${idleDays}d — follow up`
                    : p.stage === "invoiced" ? `Payment ${idleDays}d overdue — follow up`
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

              {visibleBookings.map((b: any) => (
                <div key={`booking-${b.id}`} className="flex items-center gap-3 p-2.5 rounded-md border hover-elevate" data-testid={`attention-booking-${b.id}`}>
                  <CalendarPlus className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <Link href="/calendar" className="flex-1 min-w-0 cursor-pointer" onClick={() => handleDismissBooking(b.id)}>
                    <p className="text-sm font-medium truncate">{maskName(`${b.firstName} ${b.lastName}`)}</p>
                    <p className="text-xs text-muted-foreground truncate">Appointment request — not yet scheduled</p>
                  </Link>
                  <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={(e) => handleDismissBooking(b.id, e)} data-testid={`dismiss-booking-${b.id}`}><X className="w-3.5 h-3.5" /></Button>
                </div>
              ))}

              {pendingAiActions.map((action: any) => {
                const isReminder = action.type === "reminder";
                const isCreateLead = action.type === "create_lead";
                const isUpdateContact = action.type === "update_contact";
                const borderClass = isCreateLead
                  ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"
                  : isUpdateContact ? "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20"
                  : isReminder ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"
                  : "border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20";
                const iconClass = isCreateLead ? "text-green-500" : isUpdateContact ? "text-blue-500" : isReminder ? "text-amber-500" : "text-violet-500";
                const ActionIcon = isCreateLead ? UserPlus : isUpdateContact ? Pencil : isReminder ? Bell : Sparkles;
                const subtitle = isCreateLead
                  ? `AI detected a new lead${action.details?.source === "sms" ? " from SMS" : action.details?.source === "phone_call" ? " from call" : ""}`
                  : isUpdateContact ? `AI found new info for ${action.details?.name || "contact"}`
                  : action.type === "reminder" ? `AI Reminder${action.details?.contactName ? ` — ${action.details.contactName}` : ""}`
                  : action.type === "proposal_suggestion" ? "AI suggests creating a proposal"
                  : action.type === "scheduling_suggestion" ? "Customer wants to schedule"
                  : "AI suggestion";
                const isScheduleRelated = action.type === "scheduling_suggestion" ||
                  (action.type === "reminder" && /schedul|appointment|site visit|walkthrough|meeting|call back|follow.?up|come (out|by|over)/i.test(action.summary || ""));
                const aiLinkHref = isCreateLead ? `/contacts?ai_action=${action.id}`
                  : isUpdateContact ? `/contacts/${action.contactId}?ai_action=${action.id}`
                  : isScheduleRelated ? "/calendar?tab=appointments"
                  : action.projectId ? `/projects/${action.projectId}?attention=ai_action`
                  : action.contactId ? `/messages?contactId=${action.contactId}` : "#";
                return (
                  <div key={`ai-action-${action.id}`} className={`flex items-center gap-3 p-2.5 rounded-md border ${borderClass}`} data-testid={`attention-ai-action-${action.id}`}>
                    <ActionIcon className={`w-4 h-4 ${iconClass} flex-shrink-0`} />
                    <Link href={aiLinkHref} className="flex-1 min-w-0 cursor-pointer" onClick={() => { if (!isCreateLead && !isUpdateContact) dismissAction.mutate(action.id); }}>
                      <p className="text-sm font-medium truncate">{action.summary}</p>
                      <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                    </Link>
                    <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={(e) => { e.stopPropagation(); dismissAction.mutate(action.id); }} data-testid={`dismiss-ai-action-${action.id}`}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
