import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Lightbulb, Image as ImageIcon, Video, Share2, Trash2, Plus, X, Copy, ExternalLink, Save, Loader2, Eye } from "lucide-react";
import type { FeatureRequest } from "@shared/schema";

type AdminFeatureRequest = FeatureRequest & { submitterEmail?: string | null; submitterName?: string | null };

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  submitted:   { label: "Submitted",   className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  reviewing:   { label: "Reviewing",   className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  planned:     { label: "Planned",     className: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  in_progress: { label: "In Progress", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  completed:   { label: "Completed",   className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  declined:    { label: "Declined",    className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

const MAX_IMAGES = 5;
const MAX_VIDEO_SIZE = 300 * 1024 * 1024;      // 300MB raw upload cap; server transcodes down to ~5-15MB
const MAX_IMAGE_DIMENSION = 1920;               // longest edge after compression
const IMAGE_QUALITY = 0.78;                     // JPEG quality

async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const maxDim = Math.max(width, height);
        if (maxDim > MAX_IMAGE_DIMENSION) {
          const scale = MAX_IMAGE_DIMENSION / maxDim;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(url); resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) { resolve(file); return; }
            // If compression actually made it bigger (rare), fall back to original.
            resolve(blob.size < file.size ? blob : file);
          },
          "image/jpeg",
          IMAGE_QUALITY,
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function uploadBlob(blob: Blob, name: string, contentType: string): Promise<string> {
  const res = await fetch("/api/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, size: blob.size, contentType }),
  });
  if (!res.ok) throw new Error("Could not get upload URL");
  const { uploadURL, objectPath } = await res.json();
  const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
  if (!put.ok) throw new Error("Upload failed");
  await fetch("/api/uploads/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectPath }),
  });
  return objectPath;
}

export default function FeatureRequests() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = !!(user as any)?.isAdmin;
  const [formOpen, setFormOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [tab, setTab] = useState<string>(isAdmin ? "all" : "mine");
  const [detailRequest, setDetailRequest] = useState<AdminFeatureRequest | null>(null);

  const { data: requests = [], isLoading } = useQuery<FeatureRequest[]>({
    queryKey: ["/api/feature-requests"],
  });

  const { data: allRequests = [], isLoading: loadingAll } = useQuery<AdminFeatureRequest[]>({
    queryKey: ["/api/admin/feature-requests"],
    enabled: isAdmin,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/feature-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feature-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-requests"] });
      toast({ title: "Deleted" });
    },
  });

  const myList = (
    <>
      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">Loading…</div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Lightbulb className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium">No requests yet</p>
            <p className="text-sm mt-1">Tap "New" to submit your first feature request or update suggestion.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              onShare={() => setShareToken(r.shareToken)}
              onDelete={() => { if (confirm("Delete this request?")) deleteMut.mutate(r.id); }}
              onOpen={() => setDetailRequest(r as AdminFeatureRequest)}
            />
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="container max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Lightbulb className="w-6 h-6 text-amber-500" />
            Feature Requests
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suggest improvements, report issues, or request new features. Add screenshots or a short video to help us understand.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)} data-testid="button-new-request">
          <Plus className="w-4 h-4 mr-1" /> New
        </Button>
      </div>

      {isAdmin ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all-requests">All Requests ({allRequests.length})</TabsTrigger>
            <TabsTrigger value="mine" data-testid="tab-my-requests">My Requests ({requests.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-4">
            {loadingAll ? (
              <div className="text-center text-muted-foreground py-12">Loading…</div>
            ) : allRequests.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No requests submitted yet.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {allRequests.map((r) => <AdminRequestCard key={r.id} request={r} onOpen={() => setDetailRequest(r)} />)}
              </div>
            )}
          </TabsContent>
          <TabsContent value="mine" className="mt-4">{myList}</TabsContent>
        </Tabs>
      ) : (
        myList
      )}

      <NewRequestDialog open={formOpen} onClose={() => setFormOpen(false)} />
      <ShareDialog token={shareToken} onClose={() => setShareToken(null)} />
      <DetailDialog request={detailRequest} isAdmin={isAdmin} onClose={() => setDetailRequest(null)} />
    </div>
  );
}

function MediaPreviewStrip({ images, video, onClickImage }: { images: string[]; video?: string | null; onClickImage?: (idx: number) => void }) {
  if (images.length === 0 && !video) return null;
  return (
    <div className="flex gap-2 flex-wrap items-center">
      {images.map((u, i) => (
        <button
          key={i}
          type="button"
          onClick={(e) => { e.stopPropagation(); onClickImage?.(i); }}
          className="block w-20 h-20 rounded-md overflow-hidden border bg-muted hover-elevate"
          data-testid={`thumb-image-${i}`}
        >
          <img src={u} alt="" className="w-full h-full object-cover" loading="lazy" />
        </button>
      ))}
      {video && (
        <div className="w-20 h-20 rounded-md overflow-hidden border bg-black flex items-center justify-center text-white relative">
          <Video className="w-7 h-7" />
          <span className="absolute bottom-0.5 right-1 text-[10px] font-semibold opacity-80">VIDEO</span>
        </div>
      )}
    </div>
  );
}

function AdminRequestCard({ request, onOpen }: { request: AdminFeatureRequest; onOpen: () => void }) {
  const created = new Date(request.createdAt as any).toLocaleString();
  const statusInfo = STATUS_LABELS[request.status] || STATUS_LABELS.submitted;
  const imgs = request.imageUrls || [];

  return (
    <Card
      data-testid={`admin-card-request-${request.id}`}
      className="cursor-pointer hover-elevate"
      onClick={onOpen}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">{request.title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {request.submitterName || request.submitterEmail || "Unknown user"}
              {request.submitterEmail && request.submitterName ? ` · ${request.submitterEmail}` : ""}
              {" · "}{created}
              {request.location ? ` · ${request.location}` : ""}
            </p>
          </div>
          <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-sm whitespace-pre-wrap line-clamp-3">{request.description}</p>
        <MediaPreviewStrip images={imgs} video={request.videoUrl} />
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {imgs.length > 0 ? `${imgs.length} image${imgs.length > 1 ? "s" : ""}` : "No images"}
            {request.videoUrl ? " · 1 video" : ""}
          </span>
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onOpen(); }} data-testid={`button-open-${request.id}`}>
            <Eye className="w-3.5 h-3.5 mr-1" /> Open
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RequestCard({ request, onShare, onDelete, onOpen }: { request: FeatureRequest; onShare: () => void; onDelete: () => void; onOpen: () => void }) {
  const status = STATUS_LABELS[request.status] || STATUS_LABELS.submitted;
  const created = new Date(request.createdAt as any).toLocaleDateString();
  const imgs = request.imageUrls || [];
  return (
    <Card data-testid={`card-request-${request.id}`} className="cursor-pointer hover-elevate" onClick={onOpen}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base truncate" data-testid={`text-title-${request.id}`}>{request.title}</CardTitle>
            {request.location && (
              <p className="text-xs text-muted-foreground mt-0.5">In: <span className="font-medium">{request.location}</span></p>
            )}
          </div>
          <Badge className={status.className} data-testid={`badge-status-${request.id}`}>{status.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-sm whitespace-pre-wrap text-foreground/90 line-clamp-3">{request.description}</p>
        <MediaPreviewStrip images={imgs} video={request.videoUrl} />
        {request.adminNote && (
          <div className="text-xs bg-muted rounded-md p-2">
            <span className="font-semibold">Note from team:</span> {request.adminNote}
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">{created}</span>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="outline" onClick={onShare} data-testid={`button-share-${request.id}`}>
              <Share2 className="w-3.5 h-3.5 mr-1" /> Share
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} data-testid={`button-delete-${request.id}`}>
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailDialog({ request, isAdmin, onClose }: { request: AdminFeatureRequest | null; isAdmin: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(request?.status || "submitted");
  const [adminNote, setAdminNote] = useState(request?.adminNote || "");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Reset local admin state when the request changes.
  const reqId = request?.id;
  const lastIdRef = useRef<number | undefined>(undefined);
  if (request && lastIdRef.current !== reqId) {
    lastIdRef.current = reqId;
    setStatus(request.status);
    setAdminNote(request.adminNote || "");
  }

  const saveMut = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/admin/feature-requests/${request!.id}`, { status, adminNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feature-requests"] });
      toast({ title: "Updated" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message || "", variant: "destructive" }),
  });

  if (!request) return null;
  const created = new Date(request.createdAt as any).toLocaleString();
  const statusInfo = STATUS_LABELS[request.status] || STATUS_LABELS.submitted;
  const imgs = request.imageUrls || [];

  return (
    <>
      <Dialog open={!!request} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-request-detail">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg">{request.title}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {isAdmin && (request.submitterName || request.submitterEmail) && (
                    <>{request.submitterName || request.submitterEmail}{" · "}</>
                  )}
                  {created}
                  {request.location ? ` · ${request.location}` : ""}
                </p>
              </div>
              <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Description</Label>
              <p className="text-sm whitespace-pre-wrap mt-1 leading-relaxed" data-testid="text-detail-description">
                {request.description}
              </p>
            </div>

            {imgs.length > 0 && (
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Screenshots ({imgs.length})</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                  {imgs.map((u, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setLightboxIdx(i)}
                      className="aspect-square rounded-md overflow-hidden border bg-muted hover-elevate"
                      data-testid={`detail-image-${i}`}
                    >
                      <img src={u} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {request.videoUrl && (
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Video</Label>
                <video src={request.videoUrl} controls playsInline className="w-full rounded-md border mt-2 max-h-[60vh] bg-black" data-testid="video-detail" />
              </div>
            )}

            {request.adminNote && !isAdmin && (
              <div className="text-sm bg-muted rounded-md p-3">
                <span className="font-semibold">Note from team:</span> {request.adminNote}
              </div>
            )}

            {isAdmin && (
              <div className="space-y-2 pt-3 border-t">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Admin Controls</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger data-testid="select-detail-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Note to user (visible to them)…"
                  rows={3}
                  data-testid="input-detail-admin-note"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            {isAdmin && (
              <Button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || (status === request.status && adminNote === (request.adminNote || ""))}
                data-testid="button-save-detail"
              >
                <Save className="w-4 h-4 mr-1" />
                {saveMut.isPending ? "Saving…" : "Save Changes"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lightboxIdx !== null && imgs[lightboxIdx] && (
        <Dialog open={true} onOpenChange={(o) => { if (!o) setLightboxIdx(null); }}>
          <DialogContent className="max-w-5xl bg-black border-0 p-2">
            <div className="relative">
              <img src={imgs[lightboxIdx]} alt="" className="w-full max-h-[85vh] object-contain" />
              {imgs.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setLightboxIdx((lightboxIdx - 1 + imgs.length) % imgs.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 text-white rounded-full w-10 h-10 flex items-center justify-center"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightboxIdx((lightboxIdx + 1) % imgs.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 text-white rounded-full w-10 h-10 flex items-center justify-center"
                  >
                    ›
                  </button>
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 text-white text-xs bg-black/60 rounded-full px-2 py-0.5">
                    {lightboxIdx + 1} / {imgs.length}
                  </div>
                </>
              )}
              <a
                href={imgs[lightboxIdx]}
                target="_blank"
                rel="noreferrer"
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full px-2.5 py-1 text-xs flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> Open
              </a>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function NewRequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoStatus, setVideoStatus] = useState<"idle" | "uploading" | "compressing">("idle");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle(""); setLocation(""); setDescription(""); setImageUrls([]); setVideoUrl(null);
  };

  const submitMut = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/feature-requests", {
        title: title.trim(),
        location: location.trim() || undefined,
        description: description.trim(),
        imageUrls,
        videoUrl: videoUrl || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feature-requests"] });
      toast({ title: "Request submitted", description: "Thanks! We'll review it shortly." });
      reset();
      onClose();
    },
    onError: (e: any) => toast({ title: "Could not submit", description: e?.message || "", variant: "destructive" }),
  });

  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const slotsLeft = MAX_IMAGES - imageUrls.length;
    const list = Array.from(files).slice(0, slotsLeft);
    setUploadingImages(true);
    try {
      const newPaths: string[] = [];
      for (const file of list) {
        if (!file.type.startsWith("image/")) {
          toast({ title: "Skipped", description: `${file.name} is not an image.`, variant: "destructive" });
          continue;
        }
        try {
          const compressed = await compressImage(file);
          const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
          const ct = compressed.type || "image/jpeg";
          const path = await uploadBlob(compressed, name, ct);
          newPaths.push(path);
        } catch (e: any) {
          toast({ title: "Upload failed", description: file.name + ": " + (e?.message || ""), variant: "destructive" });
        }
      }
      if (newPaths.length > 0) {
        setImageUrls((prev) => [...prev, ...newPaths].slice(0, MAX_IMAGES));
      }
    } finally {
      setUploadingImages(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleVideoFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast({ title: "Not a video", description: "Please select a video file.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      toast({
        title: "Video is too large",
        description: `Max 300MB. Try recording a shorter clip or lowering the quality on your phone before re-uploading.`,
        variant: "destructive",
      });
      return;
    }
    setUploadingVideo(true);
    setVideoStatus("uploading");
    try {
      const path = await uploadBlob(file, file.name, file.type);
      // Server-side transcode to compress
      setVideoStatus("compressing");
      try {
        const tRes = await fetch("/api/uploads/transcode-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objectPath: path }),
        });
        if (tRes.ok) {
          const data = await tRes.json();
          setVideoUrl(data.objectPath || path);
          if (data.originalSize && data.compressedSize && !data.skipped) {
            const orig = (data.originalSize / 1024 / 1024).toFixed(1);
            const comp = (data.compressedSize / 1024 / 1024).toFixed(1);
            toast({ title: "Video compressed", description: `${orig}MB → ${comp}MB` });
          }
        } else {
          // Fall back to original upload if transcode fails
          setVideoUrl(path);
          toast({ title: "Compression skipped", description: "Original video kept (compression failed).", variant: "destructive" });
        }
      } catch {
        setVideoUrl(path);
      }
    } catch (e: any) {
      toast({ title: "Video upload failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setUploadingVideo(false);
      setVideoStatus("idle");
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !submitMut.isPending && !uploadingImages && !uploadingVideo;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Feature Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="fr-title">Title <span className="text-red-500">*</span></Label>
            <Input
              id="fr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Add bulk delete on contacts list"
              maxLength={120}
              data-testid="input-title"
            />
          </div>
          <div>
            <Label htmlFor="fr-loc">Where in the app?</Label>
            <Input
              id="fr-loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Contacts page, Document editor, Sidebar…"
              maxLength={120}
              data-testid="input-location"
            />
          </div>
          <div>
            <Label htmlFor="fr-desc">Describe it <span className="text-red-500">*</span></Label>
            <Textarea
              id="fr-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's the issue or idea? What should happen instead?"
              rows={5}
              maxLength={2000}
              data-testid="input-description"
            />
          </div>

          <div>
            <Label className="flex items-center gap-1"><ImageIcon className="w-4 h-4" /> Screenshots ({imageUrls.length}/{MAX_IMAGES})</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">Auto-compressed before upload to keep them fast to load.</p>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleImageFiles(e.target.files)}
              data-testid="input-images"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {imageUrls.map((u, i) => (
                <div key={i} className="relative w-20 h-20 rounded-md overflow-hidden border bg-muted">
                  <img src={u} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImageUrls(imageUrls.filter((_, idx) => idx !== i))}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center"
                    data-testid={`button-remove-image-${i}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {imageUrls.length < MAX_IMAGES && (
                <button
                  type="button"
                  disabled={uploadingImages}
                  onClick={() => imageInputRef.current?.click()}
                  className="w-20 h-20 rounded-md border border-dashed bg-muted hover:bg-muted/70 text-muted-foreground flex items-center justify-center disabled:opacity-50"
                  data-testid="button-pick-images"
                >
                  {uploadingImages ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                </button>
              )}
            </div>
          </div>

          <div>
            <Label className="flex items-center gap-1"><Video className="w-4 h-4" /> Short video (optional)</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">Auto-compressed to 720p after upload. Up to 300MB raw — usually ends up around 5–15MB.</p>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleVideoFile(e.target.files)}
              data-testid="input-video"
            />
            <div className="mt-2">
              {videoUrl ? (
                <div className="relative">
                  <video src={videoUrl} controls playsInline className="w-full rounded-md border bg-black" />
                  <button
                    type="button"
                    onClick={() => setVideoUrl(null)}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full px-2 py-1 text-xs flex items-center gap-1"
                    data-testid="button-remove-video"
                  >
                    <X className="w-3 h-3" /> Remove
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed"
                  disabled={uploadingVideo}
                  onClick={() => videoInputRef.current?.click()}
                  data-testid="button-pick-video"
                >
                  {uploadingVideo ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {videoStatus === "compressing" ? "Compressing video…" : "Uploading…"}</>
                  ) : (
                    <><Video className="w-4 h-4 mr-2" /> Upload video</>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }} disabled={submitMut.isPending}>Cancel</Button>
          <Button onClick={() => submitMut.mutate()} disabled={!canSubmit} data-testid="button-submit-request">
            {submitMut.isPending ? "Submitting…" : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({ token, onClose }: { token: string | null; onClose: () => void }) {
  const { toast } = useToast();
  const url = token ? `${window.location.origin}/feature-requests/share/${token}` : "";
  return (
    <Dialog open={!!token} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share this request</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Anyone with this link can view the request and its attachments.</p>
          <div className="flex gap-2">
            <Input value={url} readOnly data-testid="input-share-url" />
            <Button
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(url); toast({ title: "Copied" }); }}
              data-testid="button-copy-share"
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={() => window.open(url, "_blank")}>
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
