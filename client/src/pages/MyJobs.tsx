import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { CrewNotesSection } from "@/components/CrewNotes";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Briefcase,
  MapPin,
  Calendar,
  Clock,
  User,
  Navigation,
  ChevronRight,
  ArrowLeft,
  Camera,
  FileText,
  Users,
  Send,
  Image,
  Loader2,
  Activity,
  Timer,
  Receipt,
  CheckCircle,
  XCircle,
  AlertCircle,
  Building2,
  Wallet,
  X,
  ImagePlus,
} from "lucide-react";

export interface AssignedJob {
  id: number;
  title: string;
  stage: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  scheduledEndTime: string | null;
  scheduledEndDate: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  contactName: string | null;
  contactPhone: string | null;
  crew: Array<{ id: number; name: string; role: string }>;
  notes: string | null;
}

interface JobDetailData {
  project: {
    id: number;
    title: string;
    stage: string;
    scheduledDate: string | null;
    scheduledTime: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    notes: string | null;
  };
  contactName: string | null;
  contactPhone: string | null;
  crew: Array<{ id: number; name: string; role: string }>;
  photos: Array<{
    id: number;
    storageKey: string;
    fileName: string;
    caption: string | null;
    createdAt: string;
  }>;
}

interface WorkOrderData {
  lineItems: Array<{
    description: string;
    quantity?: number;
    unit?: string;
    price?: number;
    total?: number;
  }>;
  project: { notes: string | null };
}

interface UserCapabilities {
  isOwner: boolean;
  role: string | null;
  capabilities: Record<string, boolean>;
  linkedTeamMemberId: number | null;
}

function getStageBadgeVariant(stage: string): "default" | "secondary" | "outline" {
  switch (stage) {
    case "in_progress":
    case "scheduled":
      return "default";
    case "completed":
      return "secondary";
    default:
      return "outline";
  }
}

function formatStageLabel(stage: string): string {
  return stage
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function formatTime(timeStr: string | null): string {
  if (!timeStr) return "";
  try {
    const [h, m] = timeStr.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m} ${ampm}`;
  } catch {
    return timeStr;
  }
}

function getDirectionsUrl(address: string | null, city: string | null, state: string | null): string {
  const parts = [address, city, state].filter(Boolean).join(", ");
  if (!parts) return "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(parts)}`;
}

function isJobToday(job: AssignedJob): boolean {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (job.stage === 'in_progress') return true;
  if (!job.scheduledDate) return false;
  const endDate = job.scheduledEndDate || job.scheduledDate;
  return todayStr >= job.scheduledDate && todayStr <= endDate;
}

function JobCard({ job, onSelect, disabled }: { job: AssignedJob; onSelect: (job: AssignedJob) => void; disabled?: boolean }) {
  const { toast } = useToast();
  const fullAddress = [job.address, job.city, job.state].filter(Boolean).join(", ");
  const directionsUrl = getDirectionsUrl(job.address, job.city, job.state);

  return (
    <Card
      className={disabled ? "opacity-60" : "hover-elevate cursor-pointer"}
      data-testid={`card-job-${job.id}`}
      onClick={() => {
        if (disabled) {
          toast({ title: "Not scheduled for today", description: "Contact the office if you need to clock in to this project." });
          return;
        }
        onSelect(job);
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm truncate" data-testid={`text-job-title-${job.id}`}>
                {job.title}
              </h3>
              <Badge variant={getStageBadgeVariant(job.stage)} data-testid={`badge-stage-${job.id}`}>
                {formatStageLabel(job.stage)}
              </Badge>
            </div>

            {job.contactName && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="w-3.5 h-3.5 shrink-0" />
                <span data-testid={`text-contact-${job.id}`}>{job.contactName}</span>
              </div>
            )}

            {fullAddress && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate" data-testid={`text-address-${job.id}`}>{fullAddress}</span>
              </div>
            )}

            {(job.scheduledDate || job.scheduledTime) && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {job.scheduledDate && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span data-testid={`text-date-${job.id}`}>{formatDate(job.scheduledDate)}</span>
                  </div>
                )}
                {job.scheduledTime && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span data-testid={`text-time-${job.id}`}>{formatTime(job.scheduledTime)}</span>
                  </div>
                )}
              </div>
            )}

            {job.crew.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {job.crew.map(member => (
                  <Badge key={member.id} variant="outline" className="text-[10px]" data-testid={`badge-crew-${member.id}`}>
                    {member.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {directionsUrl && (
              <Button
                size="icon"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(directionsUrl, "_blank");
                }}
                data-testid={`button-directions-${job.id}`}
              >
                <Navigation className="w-4 h-4" />
              </Button>
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ActivityItem {
  id: number;
  type: string;
  content: string;
  createdAt: string;
}

interface TimeEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  totalMinutes: number | null;
  notes: string | null;
  teamMember: { id: number; name: string } | null;
}

interface ReceiptSubmission {
  id: number;
  projectId: number;
  fileName: string;
  storageKey: string;
  status: string;
  title: string | null;
  amount: number | null;
  vendor: string | null;
  category: string | null;
  paidByWorker: boolean | null;
  workerReimbursementAmount: number | null;
  createdAt: string;
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getActivityIcon(type: string) {
  switch (type) {
    case "daily_log":
    case "note":
      return <FileText className="w-3.5 h-3.5" />;
    case "photo":
      return <Camera className="w-3.5 h-3.5" />;
    case "status_change":
    case "stage_change":
      return <Activity className="w-3.5 h-3.5" />;
    case "clock_in":
    case "clock_out":
      return <Clock className="w-3.5 h-3.5" />;
    case "expense":
    case "receipt":
      return <Receipt className="w-3.5 h-3.5" />;
    default:
      return <Activity className="w-3.5 h-3.5" />;
  }
}

function formatDuration(totalMinutes: number | null): string {
  if (!totalMinutes) return "--";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function ActivityTab({ projectId }: { projectId: number }) {
  const { data: activities = [], isLoading } = useQuery<ActivityItem[]>({
    queryKey: ["/api/my-jobs", projectId, "activity"],
    staleTime: 15000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-3">
            <Skeleton className="w-7 h-7 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="py-8 text-center">
        <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground" data-testid="text-no-activity">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 py-1" data-testid="list-activity">
      {activities.map(a => (
        <div key={a.id} className="flex gap-3 py-2" data-testid={`row-activity-${a.id}`}>
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
            {getActivityIcon(a.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-snug" data-testid={`text-activity-content-${a.id}`}>{a.content}</p>
            <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-activity-time-${a.id}`}>
              {formatRelativeTime(a.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TimeLogTab({ projectId }: { projectId: number }) {
  const { data: entries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: ["/api/my-jobs", projectId, "time-entries"],
    staleTime: 15000,
  });

  const totalMinutes = entries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        <Skeleton className="h-16 w-full rounded-lg" />
        {[1, 2].map(i => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="py-1">
      <div className="bg-muted/50 rounded-lg p-3 mb-3" data-testid="card-total-hours">
        <div className="flex items-center gap-2 mb-1">
          <Timer className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Total Hours</span>
        </div>
        <p className="text-xl font-bold" data-testid="text-total-hours">{formatDuration(totalMinutes)}</p>
        <p className="text-xs text-muted-foreground">{entries.length} entr{entries.length !== 1 ? "ies" : "y"}</p>
      </div>

      {entries.length === 0 ? (
        <div className="py-6 text-center">
          <Timer className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground" data-testid="text-no-time-entries">No time entries yet</p>
        </div>
      ) : (
        <div className="space-y-1" data-testid="list-time-entries">
          {entries.map(entry => {
            const clockInDate = new Date(entry.clockIn);
            return (
              <div key={entry.id} className="flex items-center justify-between py-2 border-b last:border-0" data-testid={`row-time-entry-${entry.id}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium" data-testid={`text-time-date-${entry.id}`}>
                    {clockInDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {clockInDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    {entry.clockOut && (
                      <> - {new Date(entry.clockOut).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</>
                    )}
                    {!entry.clockOut && <span className="text-primary ml-1">(active)</span>}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums" data-testid={`text-time-duration-${entry.id}`}>
                  {formatDuration(entry.totalMinutes)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PhotosTab({ projectId, photos, canUpload }: {
  projectId: number;
  photos: JobDetailData["photos"];
  canUpload: boolean;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const combined = [...selectedFiles, ...files].slice(0, 10);
    setSelectedFiles(combined);
    const newPreviews = combined.map(f => URL.createObjectURL(f));
    previews.forEach(p => URL.revokeObjectURL(p));
    setPreviews(newPreviews);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelectedFile = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    setPreviews(newPreviews);
  };

  const uploadAllPhotos = async () => {
    if (selectedFiles.length === 0 || isUploading) return;
    setIsUploading(true);
    setUploadProgress({ current: 0, total: selectedFiles.length });
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
      setUploadProgress({ current: i + 1, total: selectedFiles.length });
      try {
        const formData = new FormData();
        formData.append("file", selectedFiles[i]);
        const res = await fetch(`/api/my-jobs/${projectId}/photos`, {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Upload failed");
        }
        successCount++;
      } catch {
        failCount++;
      }
    }

    previews.forEach(p => URL.revokeObjectURL(p));
    setSelectedFiles([]);
    setPreviews([]);
    setIsUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    queryClient.invalidateQueries({ queryKey: ["/api/my-jobs", projectId, "detail"] });

    if (successCount > 0) {
      toast({ title: `${successCount} photo${successCount > 1 ? "s" : ""} uploaded`, description: failCount > 0 ? `${failCount} failed to upload` : undefined });
    } else {
      toast({ title: "Upload failed", description: "Could not upload photos", variant: "destructive" });
    }
  };

  return (
    <div className="py-1">
      {canUpload && (
        <div className="mb-3 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            data-testid="input-photo-upload"
          />

          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground" data-testid="text-selected-count">
                  {selectedFiles.length}/10 selected
                </p>
                {selectedFiles.length < 10 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    data-testid="button-add-more-photos"
                  >
                    <ImagePlus className="w-3.5 h-3.5 mr-1" />
                    Add more
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {previews.map((preview, idx) => (
                  <div key={idx} className="relative aspect-square rounded-md overflow-hidden bg-muted" data-testid={`preview-photo-${idx}`}>
                    <img src={preview} alt={`Selected ${idx + 1}`} className="w-full h-full object-cover" />
                    {!isUploading && (
                      <button
                        onClick={() => removeSelectedFile(idx)}
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
                        data-testid={`button-remove-preview-${idx}`}
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    )}
                  </div>
                ))}
                {selectedFiles.length < 10 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50"
                    disabled={isUploading}
                    data-testid="button-add-photo-tile"
                  >
                    <ImagePlus className="w-5 h-5 text-muted-foreground/40" />
                  </button>
                )}
              </div>

              {isUploading && (
                <div className="space-y-1">
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center" data-testid="text-upload-progress">
                    Uploading {uploadProgress.current} of {uploadProgress.total}...
                  </p>
                </div>
              )}

              <Button
                className="w-full"
                onClick={uploadAllPhotos}
                disabled={isUploading}
                data-testid="button-upload-photos"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 mr-2" />
                )}
                {isUploading ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...` : `Upload ${selectedFiles.length} Photo${selectedFiles.length > 1 ? "s" : ""}`}
              </Button>
            </div>
          )}

          {selectedFiles.length === 0 && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              data-testid="button-upload-photo"
            >
              <Camera className="w-4 h-4 mr-2" />
              Take or Choose Photos
            </Button>
          )}
        </div>
      )}

      {photos.length === 0 && selectedFiles.length === 0 ? (
        <div className="py-6 text-center">
          <Image className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground" data-testid="text-no-photos">No photos yet</p>
        </div>
      ) : photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2" data-testid="grid-photos">
          {photos.map(photo => (
            <div key={photo.id} className="aspect-square rounded-md overflow-hidden bg-muted" data-testid={`photo-${photo.id}`}>
              <img
                src={photo.storageKey.startsWith("/objects/") ? photo.storageKey : `/objects/${photo.storageKey}`}
                alt={photo.caption || photo.fileName}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReceiptsTab({ projectId, companyName }: { projectId: number; companyName?: string }) {
  const { toast } = useToast();
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showWhoPaid, setShowWhoPaid] = useState(false);

  const { data: receipts = [], isLoading } = useQuery<ReceiptSubmission[]>({
    queryKey: ["/api/my-jobs", projectId, "receipts"],
    staleTime: 15000,
  });

  const uploadReceiptMutation = useMutation({
    mutationFn: async ({ file, paidByWorker }: { file: File; paidByWorker: boolean }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("paidByWorker", String(paidByWorker));
      const res = await fetch(`/api/my-jobs/${projectId}/receipts`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      const desc = variables.paidByWorker
        ? "Submitted for approval. Reimbursement will be tracked."
        : "Your receipt has been sent for approval.";
      toast({ title: "Receipt submitted", description: desc });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs", projectId, "receipts"] });
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message || "Could not upload receipt", variant: "destructive" });
    },
  });

  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setShowWhoPaid(true);
    }
    if (receiptInputRef.current) receiptInputRef.current.value = "";
  };

  const handleWhoPaidChoice = (paidByWorker: boolean) => {
    if (pendingFile) {
      uploadReceiptMutation.mutate({ file: pendingFile, paidByWorker });
    }
    setPendingFile(null);
    setShowWhoPaid(false);
  };

  function getStatusBadge(status: string) {
    switch (status) {
      case "approved":
        return <Badge variant="default" className="text-[10px]"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="text-[10px]"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px]"><AlertCircle className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        <Skeleton className="h-10 w-full" />
        {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <div className="py-1">
      {showWhoPaid && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" data-testid="dialog-who-paid">
          <div className="bg-background w-full max-w-sm mx-4 rounded-t-xl sm:rounded-xl p-5 pb-8 sm:pb-5 space-y-4 animate-in slide-in-from-bottom-4">
            <div className="text-center">
              <Receipt className="w-8 h-8 text-primary mx-auto mb-2" />
              <h3 className="font-semibold text-base">Who paid for this?</h3>
              <p className="text-sm text-muted-foreground mt-1">This helps track reimbursements</p>
            </div>
            <div className="space-y-2">
              <Button
                className="w-full h-12 text-sm"
                variant="outline"
                onClick={() => handleWhoPaidChoice(false)}
                disabled={uploadReceiptMutation.isPending}
                data-testid="button-company-paid"
              >
                <Building2 className="w-4 h-4 mr-2" />
                {companyName || "Company"} paid
              </Button>
              <Button
                className="w-full h-12 text-sm"
                onClick={() => handleWhoPaidChoice(true)}
                disabled={uploadReceiptMutation.isPending}
                data-testid="button-i-paid"
              >
                <Wallet className="w-4 h-4 mr-2" />
                I paid (need reimbursement)
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => { setPendingFile(null); setShowWhoPaid(false); }}
              data-testid="button-cancel-receipt"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mb-3">
        <input
          ref={receiptInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleReceiptSelect}
          data-testid="input-receipt-upload"
        />
        <Button
          variant="outline"
          className="w-full"
          onClick={() => receiptInputRef.current?.click()}
          disabled={uploadReceiptMutation.isPending}
          data-testid="button-upload-receipt"
        >
          {uploadReceiptMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Receipt className="w-4 h-4 mr-2" />
          )}
          {uploadReceiptMutation.isPending ? "Uploading..." : "Submit Receipt Photo"}
        </Button>
      </div>

      {receipts.length === 0 ? (
        <div className="py-6 text-center">
          <Receipt className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground" data-testid="text-no-receipts">No receipts submitted</p>
          <p className="text-xs text-muted-foreground mt-1">Take a photo of a receipt to submit it for approval</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="list-receipts">
          {receipts.map(r => (
            <div key={r.id} className="flex items-center gap-3 p-2 rounded-lg border" data-testid={`row-receipt-${r.id}`}>
              <div className="w-12 h-12 rounded-md overflow-hidden bg-muted shrink-0">
                <img
                  src={r.storageKey.startsWith("/objects/") ? r.storageKey : `/objects/${r.storageKey}`}
                  alt={r.fileName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate" data-testid={`text-receipt-name-${r.id}`}>
                    {r.title || r.fileName}
                  </span>
                  {getStatusBadge(r.status)}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  {r.amount != null && (
                    <span data-testid={`text-receipt-amount-${r.id}`}>${(r.amount / 100).toFixed(2)}</span>
                  )}
                  {r.vendor && <span data-testid={`text-receipt-vendor-${r.id}`}>{r.vendor}</span>}
                  {r.paidByWorker && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">Reimbursement</Badge>
                  )}
                  <span>{formatRelativeTime(r.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkOrderTab({ lineItems, notes }: { lineItems: WorkOrderData["lineItems"]; notes: string | null }) {
  return (
    <div className="py-1">
      {notes && (
        <div className="mb-4">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <FileText className="w-4 h-4 shrink-0" />
            <span>Scope of Work</span>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-wo-notes">
            {notes}
          </p>
        </div>
      )}

      {lineItems.length > 0 ? (
        <div>
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <FileText className="w-4 h-4 shrink-0" />
            <span>Line Items</span>
          </div>
          <div className="space-y-0" data-testid="list-line-items">
            {lineItems.map((item, idx) => (
              <div key={idx} className="flex items-start justify-between gap-2 py-2 border-b last:border-0" data-testid={`row-line-item-${idx}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm" data-testid={`text-line-item-desc-${idx}`}>{item.description}</p>
                  {(item.quantity || item.unit) && (
                    <p className="text-xs text-muted-foreground">
                      {item.quantity && `Qty: ${item.quantity}`}
                      {item.quantity && item.unit && " "}
                      {item.unit && `(${item.unit})`}
                    </p>
                  )}
                </div>
                {item.price !== undefined && (
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium" data-testid={`text-line-item-price-${idx}`}>
                      ${(item.total || item.price || 0).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="py-6 text-center">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground" data-testid="text-no-line-items">No work order details available</p>
        </div>
      )}
    </div>
  );
}

export function WorkOrderDetail({ id }: { id: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [dailyNote, setDailyNote] = useState("");

  const { data: userCaps } = useQuery<UserCapabilities>({
    queryKey: ["/api/user/capabilities"],
    staleTime: 60000,
  });

  const { data: detail, isLoading, error } = useQuery<JobDetailData>({
    queryKey: ["/api/my-jobs", id, "detail"],
    enabled: !!user,
  });

  const canUploadPhotos = userCaps?.capabilities.uploadPhotos || userCaps?.isOwner;
  const canAddDailyLogs = userCaps?.capabilities.addDailyLogs || userCaps?.isOwner;
  const canClockInOut = userCaps?.capabilities.clockInOut || userCaps?.isOwner;
  const canViewWorkOrders = userCaps?.capabilities.viewWorkOrders || userCaps?.isOwner;

  const { data: workOrder } = useQuery<WorkOrderData>({
    queryKey: ["/api/my-jobs", id, "work-order"],
    enabled: !!user && !!canViewWorkOrders && !!detail,
    retry: false,
  });

  const dailyLogMutation = useMutation({
    mutationFn: async (note: string) => {
      await apiRequest("POST", `/api/my-jobs/${id}/daily-log`, { note });
    },
    onSuccess: () => {
      toast({ title: "Daily log added", description: "Your note has been saved to the project timeline." });
      setDailyNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs", id, "activity"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Could not add daily log", variant: "destructive" });
    },
  });

  const handleSubmitDailyLog = () => {
    if (!dailyNote.trim()) return;
    dailyLogMutation.mutate(dailyNote.trim());
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Button size="icon" variant="ghost" onClick={() => setLocation("/my-jobs")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Skeleton className="h-7 w-48" />
        </div>
        <Card><CardContent className="p-4"><div className="space-y-3"><Skeleton className="h-5 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div></CardContent></Card>
        <Skeleton className="h-10 w-full" />
        <Card><CardContent className="p-4"><div className="space-y-3"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></div></CardContent></Card>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <div className="flex items-center gap-2 mb-4">
          <Button size="icon" variant="ghost" onClick={() => setLocation("/my-jobs")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Job Details</h1>
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground" data-testid="text-wo-error">
              Unable to load job details. You may not have permission to view this job.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => setLocation("/my-jobs")} data-testid="button-back-to-jobs">
              Back to My Jobs
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { project, contactName, crew, photos } = detail;
  const fullAddress = [project.address, project.city, project.state].filter(Boolean).join(", ");
  const directionsUrl = getDirectionsUrl(project.address, project.city, project.state);

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => setLocation("/my-jobs")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate" data-testid="text-wo-title">{project.title}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={getStageBadgeVariant(project.stage)} data-testid="badge-wo-stage">
              {formatStageLabel(project.stage)}
            </Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 space-y-2.5">
          {contactName && (
            <div className="flex items-center gap-1.5 text-sm min-w-0">
              <User className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              <span className="font-medium truncate" data-testid="text-wo-contact">{contactName}</span>
            </div>
          )}

          {fullAddress && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate" data-testid="text-wo-address">{fullAddress}</span>
              </div>
              {directionsUrl && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => window.open(directionsUrl, "_blank")}
                  data-testid="button-wo-directions"
                  className="shrink-0"
                >
                  <Navigation className="w-4 h-4 mr-1.5" />
                  Directions
                </Button>
              )}
            </div>
          )}

          {(project.scheduledDate || project.scheduledTime) && (
            <div className="flex items-center gap-3 text-sm">
              {project.scheduledDate && (
                <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1.5">
                  <Calendar className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-medium" data-testid="text-wo-date">{formatDate(project.scheduledDate)}</span>
                </div>
              )}
              {project.scheduledTime && (
                <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1.5">
                  <Clock className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-medium" data-testid="text-wo-time">{formatTime(project.scheduledTime)}</span>
                </div>
              )}
            </div>
          )}

          {crew.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {crew.map(member => (
                <div key={member.id} className="flex items-center gap-1" data-testid={`badge-crew-${member.id}`}>
                  <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground text-[9px] font-medium">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-muted-foreground">{member.name.split(" ")[0]}</span>
                </div>
              ))}
            </div>
          )}

          {canClockInOut && (
            <Button
              variant="outline"
              className="w-full mt-1"
              onClick={() => setLocation("/crew-clock")}
              data-testid="button-crew-clock"
              size="sm"
            >
              <Clock className="w-4 h-4 mr-2" />
              Clock In / Out
            </Button>
          )}
        </CardContent>
      </Card>

      <CrewNotesSection isOwner={false} compact projectId={id} />

      <Tabs defaultValue="timelog" className="w-full">
        <TabsList className="w-full grid" style={{ gridTemplateColumns: `repeat(${canViewWorkOrders ? 4 : 3}, 1fr)` }} data-testid="tabs-job-detail">
          <TabsTrigger value="timelog" className="text-xs px-1" data-testid="tab-timelog">
            <Timer className="w-3.5 h-3.5 mr-1" />
            Time
          </TabsTrigger>
          <TabsTrigger value="photos" className="text-xs px-1" data-testid="tab-photos">
            <Image className="w-3.5 h-3.5 mr-1" />
            Photos
          </TabsTrigger>
          <TabsTrigger value="receipts" className="text-xs px-1" data-testid="tab-receipts">
            <Receipt className="w-3.5 h-3.5 mr-1" />
            Receipts
          </TabsTrigger>
          {canViewWorkOrders && (
            <TabsTrigger value="workorder" className="text-xs px-1" data-testid="tab-workorder">
              <FileText className="w-3.5 h-3.5 mr-1" />
              Work Order
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="timelog" className="mt-3">
          <Card>
            <CardContent className="p-3">
              <TimeLogTab projectId={id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="photos" className="mt-3">
          <Card>
            <CardContent className="p-3">
              <PhotosTab projectId={id} photos={photos} canUpload={!!canUploadPhotos} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receipts" className="mt-3">
          <Card>
            <CardContent className="p-3">
              <ReceiptsTab projectId={id} />
            </CardContent>
          </Card>
        </TabsContent>

        {canViewWorkOrders && (
          <TabsContent value="workorder" className="mt-3">
            <Card>
              <CardContent className="p-3">
                {workOrder ? (
                  <WorkOrderTab lineItems={workOrder.lineItems} notes={workOrder.project?.notes || null} />
                ) : (
                  <div className="space-y-3 py-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

interface UserCapabilitiesBase {
  linkedTeamMemberId?: number;
}

export function ClockInBanner({ job, urgency, minutesLate, onClockIn, onDismiss }: {
  job: AssignedJob;
  urgency: string;
  minutesLate: number;
  onClockIn: () => void;
  onDismiss: () => void;
}) {
  const fullAddress = [job.address, job.city, job.state].filter(Boolean).join(', ');
  return (
    <div
      className={`fixed inset-x-0 top-0 z-50 flex flex-col items-center justify-center p-6 ${
        urgency === 'critical'
          ? 'bg-red-600 dark:bg-red-800'
          : urgency === 'urgent'
            ? 'bg-orange-500 dark:bg-orange-700'
            : 'bg-amber-500 dark:bg-amber-700'
      }`}
      style={{ height: '75vh' }}
      data-testid="overlay-clock-in"
    >
      <div className="flex flex-col items-center text-center text-white max-w-sm space-y-5">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
          urgency === 'critical' ? 'bg-white/20 animate-pulse' : 'bg-white/15'
        }`}>
          <Clock className="w-10 h-10 text-white" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold" data-testid="text-overlay-title">
            {urgency === 'critical'
              ? "You're Late!"
              : urgency === 'urgent'
                ? "Clock In Now!"
                : "Time to Clock In"}
          </h1>
          <p className="text-lg text-white/90 font-medium" data-testid="text-overlay-job">
            {job.title}
          </p>
          {job.scheduledTime && (
            <p className="text-white/80">
              Scheduled: {formatTime(job.scheduledTime)}
              {minutesLate > 0 ? ` · ${minutesLate} min late` : ''}
            </p>
          )}
          {fullAddress && (
            <p className="text-sm text-white/70 flex items-center justify-center gap-1.5">
              <MapPin className="w-4 h-4 shrink-0" />
              {fullAddress}
            </p>
          )}
        </div>

        <Button
          size="lg"
          className="w-full max-w-xs h-14 text-lg font-bold bg-white text-gray-900 hover:bg-gray-100 shadow-xl"
          onClick={onClockIn}
          data-testid="button-overlay-clock-in"
        >
          <Clock className="w-5 h-5 mr-2" />
          Clock In
        </Button>

        <button
          onClick={onDismiss}
          className="text-white/60 hover:text-white/90 text-sm underline underline-offset-4 transition-colors"
          data-testid="button-overlay-dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function useClockInOverlay(jobs: AssignedJob[], isLoading: boolean) {
  const { user } = useAuth();
  const [now, setNow] = useState(new Date());
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const { data: userCaps, isLoading: capsLoading } = useQuery<UserCapabilitiesBase>({
    queryKey: ['/api/user/capabilities'],
    staleTime: 60000,
  });

  const linkedMemberId = userCaps?.linkedTeamMemberId;
  const { data: timeEntries = [], isLoading: entriesLoading } = useQuery<any[]>({
    queryKey: ['/api/time-entries', { teamMemberId: linkedMemberId }],
    queryFn: async () => {
      if (!linkedMemberId) return [];
      const res = await fetch(`/api/time-entries?teamMemberId=${linkedMemberId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!linkedMemberId,
    refetchInterval: 60000,
  });

  const activeEntry = timeEntries.find((e: any) => !e.clockOut);
  const isClockedIn = !!activeEntry;
  const clockDataLoading = capsLoading || (!!linkedMemberId && entriesLoading);

  if (isLoading || clockDataLoading || isClockedIn) return { show: false, job: null, dismiss: () => {}, urgency: 'normal' as const, isClockedIn };

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayJobs = jobs.filter(j => isJobToday(j));
  const nowMins = now.getHours() * 60 + now.getMinutes();

  let bestJob: AssignedJob | null = null;
  let urgency: 'upcoming' | 'normal' | 'urgent' | 'critical' = 'normal';
  let minutesLate = 0;

  for (const job of todayJobs) {
    if (!job.scheduledTime) continue;
    const [h, m] = job.scheduledTime.split(':').map(Number);
    if (isNaN(h)) continue;
    const startMins = h * 60 + (m || 0);
    const diff = nowMins - startMins;

    if (diff >= -5 && diff < 0) {
      if (!bestJob || diff > (bestJob.scheduledTime ? nowMins - (parseInt(bestJob.scheduledTime.split(':')[0]) * 60 + parseInt(bestJob.scheduledTime.split(':')[1] || '0')) : 999)) {
        bestJob = job;
        urgency = 'upcoming';
        minutesLate = 0;
      }
    } else if (diff >= 0 && diff <= 30) {
      bestJob = job;
      minutesLate = diff;
      if (diff >= 5) urgency = 'critical';
      else if (diff >= 3) urgency = 'urgent';
      else urgency = 'normal';
      break;
    }
  }

  if (!bestJob && todayJobs.length > 0) {
    const nextJob = todayJobs.find(j => {
      if (!j.scheduledTime) return false;
      const [h, m] = j.scheduledTime.split(':').map(Number);
      return !isNaN(h) && (h * 60 + (m || 0)) > nowMins;
    });
    if (!nextJob) {
      bestJob = todayJobs[0];
      urgency = 'normal';
    }
  }

  const dismissKey = bestJob ? `${todayStr}-${bestJob.id}` : null;
  const isDismissed = dismissed === dismissKey;

  return {
    show: !!bestJob && !isDismissed && (urgency !== 'upcoming' || todayJobs.some(j => {
      if (!j.scheduledTime) return false;
      const [h, m] = j.scheduledTime.split(':').map(Number);
      return !isNaN(h) && nowMins >= (h * 60 + (m || 0)) - 5;
    })),
    job: bestJob,
    minutesLate,
    urgency,
    isClockedIn,
    dismiss: () => setDismissed(dismissKey),
  };
}

export default function MyJobs() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: jobs = [], isLoading, error } = useQuery<AssignedJob[]>({
    queryKey: ["/api/my-jobs"],
    enabled: !!user,
  });

  const clockOverlay = useClockInOverlay(jobs, isLoading);

  const handleSelectJob = (job: AssignedJob) => {
    setLocation(`/my-jobs/${job.id}`);
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <Briefcase className="w-6 h-6" />
          <h1 className="text-2xl font-bold" data-testid="text-my-jobs-title">My Jobs</h1>
        </div>
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-64" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <div className="flex items-center gap-3 mb-6">
          <Briefcase className="w-6 h-6" />
          <h1 className="text-2xl font-bold" data-testid="text-my-jobs-title">My Jobs</h1>
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground" data-testid="text-error-message">
              Unable to load your assigned jobs. Please try again later.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      {clockOverlay.show && clockOverlay.job && (
        <ClockInBanner
          job={clockOverlay.job}
          urgency={clockOverlay.urgency}
          minutesLate={clockOverlay.minutesLate || 0}
          onClockIn={() => setLocation(`/crew-clock?projectId=${clockOverlay.job!.id}`)}
          onDismiss={clockOverlay.dismiss}
        />
      )}

      <div className="flex items-center gap-3 mb-2">
        <Briefcase className="w-6 h-6" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-my-jobs-title">My Jobs</h1>
          <p className="text-sm text-muted-foreground">
            {jobs.length} assigned job{jobs.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <CrewNotesSection isOwner={false} compact />

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1" data-testid="text-no-jobs">No Assigned Jobs</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              You don't have any jobs assigned to you yet. Jobs will appear here when your team lead assigns you to a project.
            </p>
          </CardContent>
        </Card>
      ) : (() => {
        const todayJobs = jobs.filter(j => isJobToday(j));
        const upcomingJobs = jobs.filter(j => !isJobToday(j));
        return (
          <div className="space-y-4" data-testid="list-jobs">
            {todayJobs.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <h2 className="text-sm font-semibold" data-testid="text-today-heading">Today's Jobs</h2>
                  <Badge variant="secondary" className="text-[10px]" data-testid="badge-today-count">{todayJobs.length}</Badge>
                </div>
                <div className="space-y-3">
                  {todayJobs.map(job => (
                    <JobCard key={job.id} job={job} onSelect={handleSelectJob} />
                  ))}
                </div>
              </div>
            )}

            {todayJobs.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="py-6 text-center">
                  <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium" data-testid="text-no-today-jobs">No jobs scheduled for today</p>
                  <p className="text-xs text-muted-foreground mt-1">Contact the office if you need to be assigned to a project</p>
                </CardContent>
              </Card>
            )}

            {upcomingJobs.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-muted-foreground" data-testid="text-upcoming-heading">Upcoming</h2>
                </div>
                <p className="text-xs text-muted-foreground -mt-1 ml-5" data-testid="text-upcoming-hint">
                  These jobs are scheduled for other days. Contact the office to make changes.
                </p>
                <div className="space-y-3">
                  {upcomingJobs.map(job => (
                    <JobCard key={job.id} job={job} onSelect={handleSelectJob} disabled />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
