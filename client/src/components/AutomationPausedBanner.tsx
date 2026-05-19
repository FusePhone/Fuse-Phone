import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Play, X, Clock, Bell, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format, addDays, addHours } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface AutomationPausedBannerProps {
  projectId: number;
  projectTitle?: string;
  reason: string;
  pausedAt: string;
  category: string;
  step: string;
  compact?: boolean;
  onDismissed?: () => void;
  onAddReminder?: () => void;
  openResumeRef?: React.MutableRefObject<(() => void) | null>;
}

interface RemainingStep {
  slug: string;
  label: string;
  delayLabel: string;
}

function getReasonLabel(reason: string): string {
  switch (reason) {
    case "customer_replied":
      return "Customer replied";
    case "user_messaged":
      return "You sent a message";
    case "document_signed":
      return "Document was signed";
    case "document_status_changed":
      return "Document status changed";
    default:
      return "Automations paused";
  }
}

function getCategoryLabel(category: string): string {
  switch (category) {
    case "lead_followup":
      return "lead follow-up";
    case "followup_not_viewed":
      return "document follow-up (not viewed)";
    case "followup_viewed":
      return "document follow-up (viewed)";
    default:
      return "follow-up";
  }
}

export function AutomationPausedBanner({
  projectId,
  projectTitle,
  reason,
  pausedAt,
  category,
  step,
  compact = false,
  onDismissed,
  onAddReminder,
  openResumeRef,
}: AutomationPausedBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [selectedStep, setSelectedStep] = useState<string>("");
  const [firstStepDate, setFirstStepDate] = useState<string>("");
  const [firstStepTime, setFirstStepTime] = useState<string>("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (openResumeRef) {
      openResumeRef.current = () => {
        handleResumeClick();
      };
    }
    return () => {
      if (openResumeRef) openResumeRef.current = null;
    };
  });

  const { data: remainingData, isLoading: stepsLoading, isError: stepsError } = useQuery<{
    steps: RemainingStep[];
    category: string | null;
    originalCategory?: string | null;
    switchedSequence?: boolean;
    switchReason?: string;
  }>({
    queryKey: ["/api/projects", projectId, "remaining-automations"],
    enabled: showResumeModal,
  });

  useEffect(() => {
    if (remainingData?.steps?.length && !selectedStep) {
      setSelectedStep(remainingData.steps[0].slug);
    }
  }, [remainingData?.steps]);

  const resumeMutation = useMutation({
    mutationFn: async ({ startFromStep, category, firstStepScheduledFor }: { startFromStep: string; category?: string; firstStepScheduledFor?: string }) => {
      const body: any = { startFromStep, category };
      if (firstStepScheduledFor) body.firstStepScheduledFor = firstStepScheduledFor;
      const res = await apiRequest("POST", `/api/projects/${projectId}/resume-automations`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Automations resumed",
        description: `${data.scheduled} follow-up messages have been scheduled.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      setShowResumeModal(false);
      setDismissed(true);
      onDismissed?.();
    },
    onError: () => {
      toast({
        title: "Failed to resume",
        description: "Could not resume automations. Please try again.",
        variant: "destructive",
      });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/dismiss-automation-banner`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      setDismissed(true);
      onDismissed?.();
    },
  });

  if (dismissed) return null;

  const reasonLabel = getReasonLabel(reason);
  const categoryLabel = getCategoryLabel(category);
  let timeAgo = "";
  try {
    if (pausedAt) {
      const d = new Date(pausedAt);
      timeAgo = isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true });
    }
  } catch (e) {
    console.error("[AutomationBanner] Date parse error:", pausedAt, e);
  }

  const handleResumeClick = () => {
    setSelectedStep("");
    const tomorrow = addDays(new Date(), 1);
    setFirstStepDate(format(tomorrow, "yyyy-MM-dd"));
    setFirstStepTime("09:00");
    setShowResumeModal(true);
  };

  const handleConfirmResume = () => {
    if (selectedStep) {
      let firstStepScheduledFor: string | undefined;
      if (firstStepDate && firstStepTime) {
        firstStepScheduledFor = new Date(`${firstStepDate}T${firstStepTime}`).toISOString();
      }
      resumeMutation.mutate({
        startFromStep: selectedStep,
        category: remainingData?.switchedSequence ? remainingData.category || undefined : undefined,
        firstStepScheduledFor,
      });
    }
  };

  const noStepsAvailable = !stepsLoading && !stepsError && !remainingData?.steps?.length;

  const stepsContent = stepsLoading ? (
    <div className="flex items-center justify-center gap-2 py-6">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Loading steps...</span>
    </div>
  ) : stepsError ? (
    <p className="text-sm text-destructive text-center py-4">Failed to load automation steps. Please try again.</p>
  ) : noStepsAvailable ? (
    <div className="text-center py-4 space-y-2">
      <p className="text-sm text-muted-foreground">All follow-up messages for this sequence have already been sent or completed.</p>
      <p className="text-sm text-muted-foreground">You can dismiss this banner to clear it.</p>
    </div>
  ) : (
    <RadioGroup value={selectedStep} onValueChange={setSelectedStep} className="space-y-2">
      {remainingData!.steps.map((s, idx) => {
        const selectedIdx = remainingData!.steps.findIndex(st => st.slug === selectedStep);
        const isSelected = selectedStep === s.slug;
        const willSendFirst = selectedStep && idx === selectedIdx;
        return (
          <div key={s.slug} className="space-y-0">
            <div
              className={cn(
                "flex items-center gap-3 p-3 rounded-md border cursor-pointer",
                isSelected ? "border-primary bg-primary/5" : "border-border",
                willSendFirst && "ring-1 ring-red-400 border-red-400",
                isSelected && "rounded-b-none"
              )}
              onClick={() => setSelectedStep(s.slug)}
              data-testid={`radio-step-${s.slug}`}
            >
              <RadioGroupItem value={s.slug} id={`step-${s.slug}`} />
              <Label htmlFor={`step-${s.slug}`} className="flex-1 cursor-pointer">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium">{s.label}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{isSelected ? "First to send" : s.delayLabel}</span>
                </div>
              </Label>
            </div>
            {isSelected && (
              <div
                className="px-3 pb-3 pt-2 border border-t-0 border-primary rounded-b-md bg-primary/5 space-y-2"
                data-testid="first-step-schedule"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>Schedule this message for:</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    type="date"
                    value={firstStepDate}
                    onChange={(e) => setFirstStepDate(e.target.value)}
                    min={format(new Date(), "yyyy-MM-dd")}
                    className="w-auto"
                    data-testid="input-first-step-date"
                  />
                  <Input
                    type="time"
                    value={firstStepTime}
                    onChange={(e) => setFirstStepTime(e.target.value)}
                    className="w-auto"
                    data-testid="input-first-step-time"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  The remaining steps will follow at their normal intervals after this.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </RadioGroup>
  );

  const resumeModal = (
    <Dialog open={showResumeModal} onOpenChange={setShowResumeModal}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{noStepsAvailable ? "No Steps to Resume" : "Resume Automations"}</DialogTitle>
          <DialogDescription>
            {noStepsAvailable
              ? "There are no remaining follow-up steps for this sequence."
              : "Choose which step to resume from. All steps from your selection onward will be scheduled."}
          </DialogDescription>
        </DialogHeader>
        {remainingData?.switchedSequence && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800" data-testid="sequence-switched-notice">
            <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-800 dark:text-blue-200">{remainingData.switchReason}</p>
              <p className="text-blue-700 dark:text-blue-300 mt-0.5">
                Switched from "{getCategoryLabel(remainingData.originalCategory || '')}" to "{getCategoryLabel(remainingData.category || '')}" sequence.
              </p>
            </div>
          </div>
        )}
        <div className="py-2">
          {stepsContent}
        </div>
        {onAddReminder && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setShowResumeModal(false);
              onAddReminder();
            }}
            data-testid="button-add-reminder-from-resume"
          >
            <Bell className="h-3.5 w-3.5 mr-1.5" />
            Add Reminder
          </Button>
        )}
        <DialogFooter>
          {noStepsAvailable ? (
            <Button
              onClick={() => {
                dismissMutation.mutate();
                setShowResumeModal(false);
              }}
              disabled={dismissMutation.isPending}
              data-testid="button-dismiss-from-modal"
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Dismiss Banner
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setShowResumeModal(false)} data-testid="button-cancel-resume">
                Cancel
              </Button>
              <Button
                onClick={handleConfirmResume}
                disabled={!selectedStep || resumeMutation.isPending}
                data-testid="button-confirm-resume"
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                {resumeMutation.isPending ? "Resuming..." : "Resume from here"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (compact) {
    return (
      <>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm"
          data-testid={`banner-automation-paused-${projectId}`}
        >
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
          <span className="text-red-800 dark:text-red-200 flex-1 min-w-0 truncate">
            {projectTitle && <span className="font-medium">{projectTitle}: </span>}
            {categoryLabel} paused {timeAgo} - {reasonLabel}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleResumeClick}
              data-testid={`button-resume-automation-${projectId}`}
            >
              <Play className="h-3 w-3 mr-1" />
              Resume
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => dismissMutation.mutate()}
              disabled={dismissMutation.isPending}
              data-testid={`button-dismiss-automation-${projectId}`}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {resumeModal}
      </>
    );
  }

  return (
    <>
      <div
        className="flex flex-col gap-2 p-4 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
        data-testid={`banner-automation-paused-${projectId}`}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              {reasonLabel} - {categoryLabel} paused
            </p>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-red-700 dark:text-red-300">
              <Clock className="h-3 w-3" />
              <span>Paused {timeAgo}</span>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => dismissMutation.mutate()}
            disabled={dismissMutation.isPending}
            data-testid={`button-dismiss-automation-${projectId}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 ml-8">
          <Button
            size="sm"
            variant="outline"
            onClick={handleResumeClick}
            data-testid={`button-resume-automation-${projectId}`}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Resume follow-ups
          </Button>
        </div>
      </div>
      {resumeModal}
    </>
  );
}
