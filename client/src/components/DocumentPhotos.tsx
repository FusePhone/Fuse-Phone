import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import { useUploadProgress } from "@/contexts/UploadProgressContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Camera,
  ImagePlus,
  Loader2,
  Eye,
  EyeOff,
  Check,
  CheckSquare,
  Trash2,
  Share2,
  X,
  Link2,
  MessageSquare,
  Mail,
  Copy,
  CheckCircle,
  CloudUpload,
} from "lucide-react";

import { useMobileNavVisibility } from "@/components/layout/Sidebar";
import { Editor as PhotoEditor, renderAnnotation, type Annotation } from "./PhotoEditor";
import { PhotoGalleryViewer } from "./PhotoGalleryViewer";
import { CameraCapture } from "./CameraCapture";
import { useToast } from "@/hooks/use-toast";
import { useNavigationGuard } from "@/hooks/use-navigation-guard";
import { savePendingUpload, removePendingUpload, getPendingUploads, notifyUploadsComplete, checkStaleUploads } from "@/lib/pending-uploads";
import { compressImage, compressBlob } from "@/lib/compress-image";
import { useSendSms, useSendEmail } from "@/hooks/use-company-settings";
import { normalizePhone } from "@/lib/phone";
import { copyToClipboard } from "@/lib/clipboard";

interface DocumentPhoto {
  id: number;
  documentId: number;
  userId: number;
  fileName: string;
  storageKey: string;
  caption: string | null;
  annotations: any[] | null;
  annotatedStorageKey: string | null;
  sortOrder: number;
  createdAt: string;
}

interface CompanyCamPhoto {
  id: string | number;
  uris?: { type: string; uri: string }[];
  caption?: string;
}

interface SourcePhoto {
  source: string;
  url: string;
  date: string;
  contactName?: string;
}

interface DocumentPhotosProps {
  documentId: number;
  projectId?: number;
  readOnly?: boolean;
  companyCamPhotos?: CompanyCamPhoto[];
  companyCamLoading?: boolean;
  companyCamError?: boolean;
  companyCamConnected?: boolean;
  companyCamProjectName?: string;
  hiddenDocumentPhotoIds?: number[];
  onToggleDocPhoto?: (photoId: number) => void;
  includedSourcePhotos?: string[];
  onToggleSourcePhoto?: (url: string) => void;
  areaPhotos?: Array<{ url: string; areaName: string; timestamp: string; showOnProposal: boolean; annotations?: any[] }>;
  onToggleAreaPhoto?: (url: string) => void;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactName?: string | null;
  canSendSms?: boolean;
  canSendEmail?: boolean;
  companyName?: string | null;
}

export function AnnotatedThumb({ photo, className }: { photo: DocumentPhoto; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  const annots = (photo.annotations as Annotation[] | null) || [];
  const annotsJson = JSON.stringify(annots);
  const url = photo.storageKey.startsWith("blob:") || photo.storageKey.startsWith("http://") || photo.storageKey.startsWith("https://") ? photo.storageKey : photo.storageKey.startsWith("/objects/") ? photo.storageKey : `/objects/${photo.storageKey}`;

  useEffect(() => { setLoaded(false); }, [url]);

  const drawAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.naturalWidth) return;

    const dW = img.clientWidth;
    const dH = img.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dW * dpr;
    canvas.height = dH * dpr;
    canvas.style.width = dW + "px";
    canvas.style.height = dH + "px";

    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (annots.length === 0) return;

    const sx = dW / img.naturalWidth;
    const sy = dH / img.naturalHeight;
    const scale = Math.max(sx, sy);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const offsetX = (dW - drawW) / 2;
    const offsetY = (dH - drawH) / 2;

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    for (const ann of annots) {
      renderAnnotation(ctx, ann);
    }
  }, [annotsJson]);

  useEffect(() => {
    if (loaded) drawAnnotations();
  }, [loaded, drawAnnotations]);

  return (
    <div className="relative w-full h-full">
      <img
        ref={imgRef}
        src={url}
        alt={photo.caption || photo.fileName}
        className={className}
        loading="lazy"
        onLoad={() => {
          setLoaded(true);
          requestAnimationFrame(drawAnnotations);
        }}
      />
      {loaded && (
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      )}
    </div>
  );
}

export function DocumentPhotos({ documentId, projectId, readOnly = false, companyCamPhotos, companyCamLoading, companyCamError, companyCamConnected, companyCamProjectName, hiddenDocumentPhotoIds = [], onToggleDocPhoto, includedSourcePhotos = [], onToggleSourcePhoto, areaPhotos = [], onToggleAreaPhoto, contactPhone, contactEmail, contactName, canSendSms = false, canSendEmail = false, companyName }: DocumentPhotosProps) {
  const { toast } = useToast();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const editSessionRef = useRef(0);
  const editSnapshotRef = useRef<{ id: number; storageKey: string; caption: string; fileName: string; annotations: any[] | undefined } | null>(null);
  const [companyCamLightboxPhoto, setCompanyCamLightboxPhoto] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const { setHidden: setNavHidden } = useMobileNavVisibility();

  useEffect(() => {
    setNavHidden(editingIndex !== null || cameraOpen || viewingIndex !== null);
    return () => setNavHidden(false);
  }, [editingIndex, cameraOpen, viewingIndex, setNavHidden]);
  const [uploading, setUploading] = useState(false);
  const uploadProgress = useUploadProgress();
  const activeBatchRef = useRef<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<Array<{ tempId: string; blobUrl: string; fileName: string; createdAt: string; uploaded?: boolean }>>([]);
  const pendingPhotosRef = useRef(pendingPhotos);
  pendingPhotosRef.current = pendingPhotos;
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
      (async () => {
        const queued = await getPendingUploads();
        const mine = queued.filter(q => q.documentId === documentId);
        if (mine.length === 0) return;
        for (const item of mine) {
          const file = new File([item.blob], item.fileName, { type: item.mimeType });
          const blobUrl = URL.createObjectURL(file);
          setPendingPhotos(prev => {
            if (prev.some(p => p.tempId === item.id)) return prev;
            return [{ tempId: item.id, blobUrl, fileName: item.fileName, createdAt: item.createdAt }, ...prev];
          });
          try {
            const result = await uploadFile(file);
            if (result) {
              await addPhotoMutation.mutateAsync({ fileName: item.fileName, storageKey: result.objectPath, sortOrder: 0 });
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
  }, [documentId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await checkStaleUploads();
      const queued = await getPendingUploads();
      const mine = queued.filter(q => q.documentId === documentId);
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
          const result = await uploadFile(file);
          if (result) {
            await addPhotoMutation.mutateAsync({ fileName: item.fileName, storageKey: result.objectPath, sortOrder: 0 });
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
        if (remaining.filter(r => r.documentId === documentId).length === 0) {
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
  }, [documentId]);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [sendingViaSms, setSendingViaSms] = useState(false);
  const [sendingViaEmail, setSendingViaEmail] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const { mutate: sendSms } = useSendSms();
  const { mutate: sendEmail } = useSendEmail();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraCaptureCountRef = useRef(0);

  const toggleSelected = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedKeys(new Set());
  };

  const { uploadFile } = useUpload({
    onError: (error) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
      setUploading(false);
    },
  });

  const { data: photos = [], isLoading } = useQuery<DocumentPhoto[]>({
    queryKey: ["/api/documents", documentId, "photos"],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/photos`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load photos");
      return res.json();
    },
  });

  const invalidatePhotos = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/documents", documentId, "photos"] });
    if (projectId) {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "photos"] });
    }
  };

  const addPhotoMutation = useMutation({
    mutationFn: async (data: { fileName: string; storageKey: string; sortOrder: number }) => {
      const res = await apiRequest("POST", `/api/documents/${documentId}/photos`, data);
      return res.json();
    },
    onSuccess: invalidatePhotos,
  });

  const updatePhotoMutation = useMutation({
    mutationFn: async ({ photoId, data }: { photoId: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/documents/${documentId}/photos/${photoId}`, data);
      return await res.json();
    },
    onMutate: async ({ photoId, data }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/documents", documentId, "photos"] });
      const prev = queryClient.getQueryData<DocumentPhoto[]>(["/api/documents", documentId, "photos"]);
      queryClient.setQueryData<DocumentPhoto[]>(
        ["/api/documents", documentId, "photos"],
        (old) => old?.map((p) => (p.id === photoId ? { ...p, ...data } : p))
      );
      return { prev };
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<DocumentPhoto[]>(
        ["/api/documents", documentId, "photos"],
        (old) => old?.map((p) => (p.id === saved.id ? { ...p, ...saved } : p))
      );
      if (projectId) {
        queryClient.setQueryData(
          ["/api/projects", projectId, "photos"],
          (old: any) => old?.map((group: any) => ({
            ...group,
            photos: group.photos.map((p: any) =>
              p.id === saved.id ? { ...p, ...saved } : p
            ),
          }))
        );
      }
    },
    onError: (err, _vars, context) => {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
      if (context?.prev) {
        queryClient.setQueryData(["/api/documents", documentId, "photos"], context.prev);
      }
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: number) => {
      await apiRequest("DELETE", `/api/documents/${documentId}/photos/${photoId}`);
    },
    onSuccess: invalidatePhotos,
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);

    const tempEntries: Array<{ tempId: string; blobUrl: string; fileName: string; file: File }> = [];
    for (let i = 0; i < files.length; i++) {
      const compressed = await compressImage(files[i]);
      const tempId = `pending-${crypto.randomUUID()}`;
      const blobUrl = URL.createObjectURL(compressed);
      tempEntries.push({ tempId, blobUrl, fileName: compressed.name, file: compressed });
    }
    setPendingPhotos(prev => [...tempEntries.map(e => ({ tempId: e.tempId, blobUrl: e.blobUrl, fileName: e.fileName, createdAt: new Date().toISOString() })), ...prev]);
    const docLabel = contactName ? `${contactName}'s photos` : `Document #${documentId}`;
    const batchId = uploadProgress.startBatch(documentId, docLabel, tempEntries.length);
    activeBatchRef.current = batchId;

    for (const entry of tempEntries) {
      try {
        await savePendingUpload({ id: entry.tempId, documentId, fileName: entry.fileName, file: entry.file, createdAt: new Date().toISOString() });
        const result = await uploadFile(entry.file);
        if (result) {
          await addPhotoMutation.mutateAsync({
            fileName: entry.fileName,
            storageKey: result.objectPath,
            sortOrder: 0,
          });
          await removePendingUpload(entry.tempId);
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

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setTimeout(() => {
      setPendingPhotos(prev => {
        const done = prev.filter(p => p.uploaded);
        done.forEach(p => URL.revokeObjectURL(p.blobUrl));
        return prev.filter(p => !p.uploaded);
      });
    }, 2000);
    const remaining = await getPendingUploads();
    if (remaining.filter(r => r.documentId === documentId).length === 0) {
      notifyUploadsComplete(tempEntries.length);
    }
  };

  const handleCameraCapture = useCallback(async (blob: Blob) => {
    cameraCaptureCountRef.current += 1;
    const n = cameraCaptureCountRef.current;
    const ts = new Date();
    const fileName = `Photo ${ts.toLocaleDateString("en-US", { month: "short", day: "numeric" })} #${n}.jpg`;
    const file = await compressBlob(blob, fileName);
    const tempId = `pending-cam-${crypto.randomUUID()}`;
    const blobUrl = URL.createObjectURL(blob);
    setPendingPhotos(prev => [{ tempId, blobUrl, fileName, createdAt: new Date().toISOString() }, ...prev]);
    let camBatchId = activeBatchRef.current;
    if (!camBatchId) {
      const docLabel = contactName ? `${contactName}'s photos` : `Document #${documentId}`;
      camBatchId = uploadProgress.startBatch(documentId, docLabel, 1);
      activeBatchRef.current = camBatchId;
    } else {
      uploadProgress.incrementTotal(camBatchId);
    }
    const currentBatchId = camBatchId;
    try {
      await savePendingUpload({ id: tempId, documentId, fileName, file, createdAt: new Date().toISOString() });
      const result = await uploadFile(file);
      if (result) {
        await addPhotoMutation.mutateAsync({
          fileName,
          storageKey: result.objectPath,
          sortOrder: 0,
        });
        await removePendingUpload(tempId);
        const remaining = await getPendingUploads();
        if (remaining.filter(r => r.documentId === documentId).length === 0) {
          notifyUploadsComplete(1);
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
  }, [uploadFile, addPhotoMutation, toast, documentId, contactName, uploadProgress]);

  const { data: sourcePhotos = [] } = useQuery<SourcePhoto[]>({
    queryKey: ["/api/documents", documentId, "source-photos"],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/source-photos`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleAnnotationSave = (photoId: number, annots: any[], rotatedImageDataUrl?: string) => {
    setEditingIndex(null);
    
    const existingPhoto = photos.find(p => p.id === photoId);
    const existingAnnots = (existingPhoto?.annotations as any[] | null) || [];
    const annotsChanged = JSON.stringify(annots) !== JSON.stringify(existingAnnots);

    if (rotatedImageDataUrl) {
      (async () => {
        try {
          const blob = await (await fetch(rotatedImageDataUrl)).blob();
          URL.revokeObjectURL(rotatedImageDataUrl);
          const fileName = `rotated_${photoId}_${Date.now()}.jpg`;
          const file = await compressBlob(blob, fileName);

          const urlRes = await fetch("/api/uploads/request-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
          });
          if (urlRes.ok) {
            const { uploadURL, objectPath } = await urlRes.json();
            await fetch(uploadURL, {
              method: "PUT",
              body: file,
              headers: { "Content-Type": file.type },
            });
            updatePhotoMutation.mutate({ photoId, data: { annotations: annots, storageKey: objectPath } });
          } else if (annotsChanged) {
            updatePhotoMutation.mutate({ photoId, data: { annotations: annots } });
          }
        } catch (err) {
          console.error("Failed to upload rotated image:", err);
          if (annotsChanged) {
            updatePhotoMutation.mutate({ photoId, data: { annotations: annots } });
          }
        }
      })();
    } else if (annotsChanged) {
      updatePhotoMutation.mutate({
        photoId,
        data: { annotations: annots },
      });
    }
  };

  if (readOnly) return null;

  type UnifiedPhoto = { type: "doc"; photo: DocumentPhoto; key: string; dateStr: string; sourceLabel: string } | { type: "source"; url: string; date: string; source: string; key: string; dateStr: string; sourceLabel: string } | { type: "pending"; tempId: string; blobUrl: string; fileName: string; uploaded: boolean; key: string; dateStr: string; sourceLabel: string } | { type: "area"; url: string; areaName: string; showOnProposal: boolean; annotations?: any[]; key: string; dateStr: string; sourceLabel: string };

  const formatDateLabel = (d: string) => {
    if (!d || d === "unknown") return "Unknown date";
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return d; }
  };

  const allUnified: UnifiedPhoto[] = [
    ...pendingPhotos.map((p) => {
      const d = new Date(p.createdAt).toISOString().split("T")[0];
      return { type: "pending" as const, tempId: p.tempId, blobUrl: p.blobUrl, fileName: p.fileName, uploaded: !!p.uploaded, key: `pending:${p.tempId}`, dateStr: d, sourceLabel: p.uploaded ? "Uploaded" : "Uploading" };
    }),
    ...sourcePhotos.map((sp, i) => {
      const label = sp.source === "message" ? "From Text Message" : "From Form Submission";
      return { type: "source" as const, url: sp.url, date: sp.date, source: sp.source, key: `src:${i}:${sp.url}`, dateStr: sp.date || "unknown", sourceLabel: label };
    }),
    ...photos.map((p) => {
      const d = p.createdAt ? new Date(p.createdAt).toISOString().split("T")[0] : "unknown";
      return { type: "doc" as const, photo: p, key: `doc:${p.id}`, dateStr: d, sourceLabel: "Uploaded" };
    }),
    ...areaPhotos.map((ap, i) => {
      const d = ap.timestamp ? new Date(ap.timestamp).toISOString().split("T")[0] : "unknown";
      return { type: "area" as const, url: ap.url, areaName: ap.areaName, showOnProposal: ap.showOnProposal, annotations: (ap as any).annotations, key: `area:${i}:${ap.url}`, dateStr: d, sourceLabel: ap.areaName };
    }),
  ].sort((a, b) => (b.dateStr || "").localeCompare(a.dateStr || ""));

  type DateGroup = { dateStr: string; label: string; items: UnifiedPhoto[] };
  const dateGroups: DateGroup[] = [];
  for (const item of allUnified) {
    const last = dateGroups[dateGroups.length - 1];
    if (last && last.dateStr === item.dateStr) {
      last.items.push(item);
    } else {
      dateGroups.push({ dateStr: item.dateStr, label: formatDateLabel(item.dateStr), items: [item] });
    }
  }

  const unifiedPhotos = allUnified;

  const galleryPhotos = unifiedPhotos.map((u, i) => {
    if (u.type === "doc") {
      return { id: u.photo.id, fileName: u.photo.fileName, storageKey: u.photo.storageKey, caption: u.photo.caption, annotations: u.photo.annotations, annotatedStorageKey: u.photo.annotatedStorageKey };
    }
    if (u.type === "pending") {
      return { id: u.tempId, fileName: u.fileName || `Photo ${i + 1}`, storageKey: u.blobUrl, caption: null, annotations: null, annotatedStorageKey: null };
    }
    if (u.type === "area") {
      return { id: -(i + 10000), fileName: `${u.areaName} photo`, storageKey: u.url, caption: null, annotations: (u as any).annotations || null, annotatedStorageKey: null, _isAreaPhoto: true, _areaPhotoUrl: u.url };
    }
    return { id: -(i + 1), fileName: `Photo ${i + 1}`, storageKey: u.url, caption: null, annotations: null, annotatedStorageKey: null, _sourceType: u.type === 'source' ? (u as any).source : undefined };
  });

  const totalCount = unifiedPhotos.length;

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Photos</span>
            {totalCount > 0 && (
              <span className="text-xs text-muted-foreground">({totalCount})</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {totalCount > 0 && !selectMode && (
              <button
                type="button"
                className="p-2 rounded-md hover:bg-orange-50 dark:hover:bg-orange-900/30 active:bg-orange-100 transition-colors"
                onClick={() => setSelectMode(true)}
                data-testid="button-select-mode"
              >
                <CheckSquare className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </button>
            )}
            {selectMode && (
              <>
                {selectedKeys.size > 0 && (() => {
                  const selectedDocIds = Array.from(selectedKeys).filter(k => k.startsWith("doc:")).map(k => parseInt(k.split(":")[1]));
                  const selectedSourceUrls = Array.from(selectedKeys).filter(k => k.startsWith("src:")).map(k => { const parts = k.split(":"); return parts.slice(2).join(":"); });
                  const selectedAreaUrls = Array.from(selectedKeys).filter(k => k.startsWith("area:")).map(k => { const parts = k.split(":"); return parts.slice(2).join(":"); });
                  const hasDocPhotos = selectedDocIds.length > 0;
                  const hasSourcePhotos = selectedSourceUrls.length > 0;
                  const hasAreaPhotos = selectedAreaUrls.length > 0;
                  const totalSelected = selectedKeys.size;
                  const hasAnyToggleable = (hasDocPhotos && onToggleDocPhoto) || (hasSourcePhotos && onToggleSourcePhoto) || (hasAreaPhotos && onToggleAreaPhoto);
                  // Build universal share entries for any selection (doc, source, area).
                  const buildShareEntries = () => {
                    const entries: Array<any> = [];
                    for (const key of Array.from(selectedKeys)) {
                      if (key.startsWith('pending:')) continue; // skip in-flight uploads
                      const item = unifiedPhotos.find((u: any) => u.key === key);
                      if (!item) continue;
                      if (item.type === 'doc') {
                        entries.push({ kind: 'doc', photoId: item.photo.id });
                      } else if (item.type === 'source') {
                        entries.push({ kind: 'url', url: item.url, caption: null, fileName: null, annotations: null });
                      } else if (item.type === 'area') {
                        entries.push({
                          kind: 'url',
                          url: item.url,
                          caption: null,
                          fileName: item.areaName ? `${item.areaName} photo` : null,
                          annotations: Array.isArray((item as any).annotations) ? (item as any).annotations : null,
                        });
                      }
                    }
                    return entries;
                  };
                  return (
                    <>
                      <span className="text-xs text-muted-foreground">{totalSelected} selected</span>
                      <button
                        type="button"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
                        disabled={sharing}
                        onClick={async () => {
                          const entries = buildShareEntries();
                          if (entries.length === 0) {
                            toast({ title: "Nothing to share", description: "Selected photos are still uploading or unavailable.", variant: "destructive" });
                            return;
                          }
                          setSharing(true);
                          try {
                            const res = await apiRequest("POST", `/api/photo-share`, { entries, documentId, projectId });
                            let data;
                            try { data = await res.json(); } catch { throw new Error("Invalid server response"); }
                            if (!data.url) throw new Error(data.message || "No share link returned");
                            setShareUrl(data.url);
                            setLinkCopied(false);
                            setShowShareDialog(true);
                          } catch (err: any) {
                            const raw = err?.message || "Something went wrong";
                            const friendly = (raw.includes("Failed to fetch") || raw.includes("NetworkError") || raw.includes("502") || raw.includes("503") || raw.includes("<!") || raw.length > 200)
                              ? "Could not reach the server. Please try again."
                              : raw.replace(/^\d+:\s*/, "");
                            toast({ title: "Share failed", description: friendly, variant: "destructive" });
                          } finally {
                            setSharing(false);
                          }
                        }}
                        data-testid="button-share-photos"
                      >
                        {sharing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
                        Share
                      </button>
                      {hasAnyToggleable && (
                        <>
                          <button
                            type="button"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors"
                            onClick={() => {
                              let count = 0;
                              if (onToggleDocPhoto) {
                                for (const id of selectedDocIds) {
                                  if (hiddenDocumentPhotoIds.includes(id)) { onToggleDocPhoto(id); count++; }
                                }
                              }
                              if (onToggleAreaPhoto) {
                                for (const url of selectedAreaUrls) {
                                  const ap = areaPhotos.find(a => a.url === url);
                                  if (ap && !ap.showOnProposal) { onToggleAreaPhoto(url); count++; }
                                }
                              }
                              if (onToggleSourcePhoto) {
                                for (const url of selectedSourceUrls) {
                                  if (!includedSourcePhotos.includes(url)) { onToggleSourcePhoto(url); count++; }
                                }
                              }
                              exitSelectMode();
                              toast({ title: `${count || totalSelected} photo${(count || totalSelected) > 1 ? "s" : ""} shown on proposal` });
                            }}
                            data-testid="button-bulk-show"
                          >
                            <Eye className="w-3 h-3" />
                            Show
                          </button>
                          <button
                            type="button"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 transition-colors"
                            onClick={() => {
                              let count = 0;
                              if (onToggleDocPhoto) {
                                for (const id of selectedDocIds) {
                                  if (!hiddenDocumentPhotoIds.includes(id)) { onToggleDocPhoto(id); count++; }
                                }
                              }
                              if (onToggleAreaPhoto) {
                                for (const url of selectedAreaUrls) {
                                  const ap = areaPhotos.find(a => a.url === url);
                                  if (ap && ap.showOnProposal) { onToggleAreaPhoto(url); count++; }
                                }
                              }
                              if (onToggleSourcePhoto) {
                                for (const url of selectedSourceUrls) {
                                  if (includedSourcePhotos.includes(url)) { onToggleSourcePhoto(url); count++; }
                                }
                              }
                              exitSelectMode();
                              toast({ title: `${count || totalSelected} photo${(count || totalSelected) > 1 ? "s" : ""} hidden from proposal` });
                            }}
                            data-testid="button-bulk-hide"
                          >
                            <EyeOff className="w-3 h-3" />
                            Hide
                          </button>
                        </>
                      )}
                      {hasDocPhotos && (
                        <button
                          type="button"
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors"
                          onClick={async () => {
                            if (!confirm(`Delete ${selectedDocIds.length} photo${selectedDocIds.length > 1 ? "s" : ""}?`)) return;
                            try {
                              await apiRequest("POST", `/api/documents/${documentId}/photos/bulk-delete`, { photoIds: selectedDocIds });
                              invalidatePhotos();
                              exitSelectMode();
                              toast({ title: `${selectedDocIds.length} photo${selectedDocIds.length > 1 ? "s" : ""} deleted` });
                            } catch (err: any) {
                              toast({ title: "Delete failed", description: err.message, variant: "destructive" });
                            }
                          }}
                          data-testid="button-bulk-delete"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      )}
                    </>
                  );
                })()}
                <button
                  type="button"
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
                  onClick={exitSelectMode}
                  data-testid="button-cancel-select"
                >
                  Cancel
                </button>
              </>
            )}
            {!selectMode && (
              <>
                <button
                  type="button"
                  className="p-2 rounded-md hover:bg-green-50 dark:hover:bg-green-900/30 active:bg-green-100 transition-colors"
                  onClick={() => setCameraOpen(true)}
                  data-testid="camera-btn"
                >
                  <Camera className="h-4 w-4 text-green-600 dark:text-green-400" />
                </button>
                <button
                  type="button"
                  className="p-2 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 active:bg-blue-100 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  data-testid="upload-photos-btn"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.heic,.heif,.webp,.gif,.bmp,.tiff,.tif"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  data-testid="photo-file-input"
                />
              </>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {totalCount === 0 && !isLoading && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No photos yet. Tap camera or upload to add.
          </div>
        )}

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

        {totalCount > 0 && (
          <div className="space-y-3" data-testid="photo-grid">
            {dateGroups.map((group) => {
              const globalStartIdx = unifiedPhotos.indexOf(group.items[0]);
              const sourceLabels = [...new Set(group.items.map(it => it.sourceLabel))];
              return (
                <div key={group.dateStr}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">{group.label}</span>
                    <span className="text-[10px] text-muted-foreground/60">{sourceLabels.join(" · ")}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {group.items.map((item, gi) => {
                      const idx = globalStartIdx + gi;
                      if (item.type === "pending") {
                        const pendingGalleryIdx = unifiedPhotos.indexOf(item);
                        return (
                          <div
                            key={item.key}
                            className="relative rounded-lg overflow-hidden cursor-pointer active:opacity-80"
                            data-testid={`pending-photo-${item.tempId}`}
                            onClick={() => {
                              if (!selectMode) {
                                setViewingIndex(pendingGalleryIdx);
                              }
                            }}
                          >
                            <div className="aspect-square">
                              <img src={item.blobUrl} alt="Uploading photo" className="w-full h-full object-cover" />
                            </div>
                            <div className={`absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center ${item.uploaded ? "bg-green-600/80" : "bg-black/50"}`} data-testid={`upload-indicator-${item.tempId}`}>
                              {item.uploaded ? <Check className="w-3.5 h-3.5 text-white" /> : <CloudUpload className="w-3.5 h-3.5 text-white/80 animate-pulse" />}
                            </div>
                          </div>
                        );
                      }
                      if (item.type === "doc") {
                        const photo = item.photo;
                        const isHidden = hiddenDocumentPhotoIds.includes(photo.id);
                        const galleryIdx = unifiedPhotos.indexOf(item);
                        return (
                          <div
                            key={item.key}
                            className="relative rounded-lg overflow-hidden cursor-pointer active:opacity-80"
                            data-testid={`photo-thumb-${photo.id}`}
                            onClick={() => {
                              if (selectMode) {
                                toggleSelected(item.key);
                              } else {
                                setViewingIndex(galleryIdx);
                              }
                            }}
                          >
                            <div className="aspect-square">
                              <AnnotatedThumb
                                photo={photo}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            {selectMode && (
                              <div className={`absolute inset-0 flex items-start justify-end p-1.5 ${selectedKeys.has(item.key) ? "bg-blue-500/20" : ""}`}>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedKeys.has(item.key) ? "bg-blue-500 border-blue-500 text-white" : "border-white/80 bg-black/30"}`}>
                                  {selectedKeys.has(item.key) && <Check className="w-3 h-3" />}
                                </div>
                              </div>
                            )}
                            {!selectMode && onToggleDocPhoto && (
                              <button
                                type="button"
                                className={`absolute bottom-1 right-1 w-10 h-10 rounded-full flex items-center justify-center transition-all ${isHidden ? "bg-black/40 text-white/50" : "bg-green-600/90 text-white"}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleDocPhoto(photo.id);
                                }}
                                data-testid={`button-toggle-visibility-${photo.id}`}
                              >
                                {isHidden ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                              </button>
                            )}
                          </div>
                        );
                      }
                      if (item.type === "area") {
                        const areaGalleryIdx = unifiedPhotos.indexOf(item);
                        return (
                          <div
                            key={item.key}
                            className="relative rounded-lg overflow-hidden cursor-pointer active:opacity-80"
                            data-testid={`area-photo-thumb-${idx}`}
                            onClick={() => {
                              if (selectMode) {
                                toggleSelected(item.key);
                              } else {
                                setViewingIndex(areaGalleryIdx);
                              }
                            }}
                          >
                            <div className="aspect-square">
                              {(item as any).annotations?.length ? (
                                <AnnotatedThumb
                                  photo={{ id: -(idx + 10000), fileName: `${item.areaName} photo`, storageKey: item.url, caption: null, annotations: (item as any).annotations, annotatedStorageKey: null } as any}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <img src={item.url} alt={`${item.areaName} photo`} className="w-full h-full object-cover" loading="lazy" />
                              )}
                            </div>
                            {selectMode && (
                              <div className={`absolute inset-0 flex items-start justify-end p-1.5 ${selectedKeys.has(item.key) ? "bg-blue-500/20" : ""}`}>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedKeys.has(item.key) ? "bg-blue-500 border-blue-500 text-white" : "border-white/80 bg-black/30"}`}>
                                  {selectedKeys.has(item.key) && <Check className="w-3 h-3" />}
                                </div>
                              </div>
                            )}
                            {!selectMode && onToggleAreaPhoto && (
                              <button
                                type="button"
                                className={`absolute bottom-1 right-1 w-10 h-10 rounded-full flex items-center justify-center transition-all ${item.showOnProposal ? "bg-green-600/90 text-white" : "bg-black/40 text-white/50"}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleAreaPhoto(item.url);
                                }}
                                data-testid={`button-toggle-area-photo-${idx}`}
                              >
                                {item.showOnProposal ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                              </button>
                            )}
                          </div>
                        );
                      }
                      const isIncluded = includedSourcePhotos.includes(item.url);
                      const srcGalleryIdx = unifiedPhotos.indexOf(item);
                      return (
                        <div
                          key={item.key}
                          className="relative rounded-lg overflow-hidden cursor-pointer active:opacity-80"
                          data-testid={`source-photo-thumb-${idx}`}
                          onClick={() => {
                            if (selectMode) {
                              toggleSelected(item.key);
                            } else {
                              setViewingIndex(srcGalleryIdx);
                            }
                          }}
                        >
                          <div className="aspect-square">
                            <img src={item.url} alt="Source photo" className="w-full h-full object-cover" loading="lazy" />
                          </div>
                          {selectMode && (
                            <div className={`absolute inset-0 flex items-start justify-end p-1.5 ${selectedKeys.has(item.key) ? "bg-blue-500/20" : ""}`}>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedKeys.has(item.key) ? "bg-blue-500 border-blue-500 text-white" : "border-white/80 bg-black/30"}`}>
                                {selectedKeys.has(item.key) && <Check className="w-3 h-3" />}
                              </div>
                            </div>
                          )}
                          {!selectMode && onToggleSourcePhoto && (
                            <button
                              type="button"
                              className={`absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center transition-all ${isIncluded ? "bg-green-600/90 text-white" : "bg-black/40 text-white/50"}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleSourcePhoto(item.url);
                              }}
                              data-testid={`button-toggle-source-${idx}`}
                            >
                              {isIncluded ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
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
        )}
      </div>

      <Dialog open={showShareDialog} onOpenChange={(open) => { if (!open) { setShowShareDialog(false); setShareUrl(null); exitSelectMode(); } }}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto" data-testid="dialog-share-photos">
          <DialogHeader>
            <DialogTitle>Share Photos</DialogTitle>
          </DialogHeader>
          {shareUrl && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {selectedKeys.size} photo{selectedKeys.size !== 1 ? "s" : ""} selected{contactName ? ` — share with ${contactName}` : ""}
              </p>

              <div className="p-3 border rounded-lg">
                <button
                  type="button"
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${linkCopied ? "bg-green-500/10 text-green-600" : "bg-muted hover:bg-muted/80 text-foreground"}`}
                  onClick={async () => {
                    const ok = await copyToClipboard(shareUrl);
                    if (ok) {
                      setLinkCopied(true);
                      toast({ title: "Link copied!" });
                      setTimeout(() => setLinkCopied(false), 3000);
                    } else {
                      toast({ title: "Couldn't copy — try long-pressing the link", variant: "destructive" });
                    }
                  }}
                  data-testid="button-copy-share-url"
                >
                  {linkCopied ? <CheckCircle className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                  {linkCopied ? "Link Copied!" : "Copy Link"}
                </button>
              </div>

              {canSendSms && contactPhone && (
                <div className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Text Message</span>
                    <span className="text-xs text-muted-foreground ml-auto">{contactPhone}</span>
                  </div>
                  <button
                    type="button"
                    disabled={sendingViaSms}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                    onClick={() => {
                      setSendingViaSms(true);
                      const message = `${companyName ? companyName + ": " : ""}Here are the project photos: ${shareUrl}`;
                      sendSms({ to: normalizePhone(contactPhone), body: message }, {
                        onSuccess: () => {
                          setSendingViaSms(false);
                          toast({ title: "Photos sent via text!" });
                        },
                        onError: (err: any) => {
                          setSendingViaSms(false);
                          toast({ title: "Failed to send text", description: err.message, variant: "destructive" });
                        },
                      });
                    }}
                    data-testid="button-share-via-sms"
                  >
                    {sendingViaSms ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                    Send via Text
                  </button>
                </div>
              )}

              {canSendEmail && contactEmail && (
                <div className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Email</span>
                    <span className="text-xs text-muted-foreground ml-auto truncate max-w-[140px]">{contactEmail}</span>
                  </div>
                  <button
                    type="button"
                    disabled={sendingViaEmail}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                    onClick={() => {
                      setSendingViaEmail(true);
                      sendEmail({
                        to: contactEmail,
                        subject: `${companyName || "Your contractor"} shared project photos with you`,
                        body: `Hi ${contactName || "there"},\n\nHere are photos from your project. You can view them anytime using the link below:\n\n${shareUrl}\n\nThank you,\n${companyName || "Your contractor"}`,
                        fromName: companyName || undefined,
                        ctaText: "View Photos",
                        ctaUrl: shareUrl,
                      }, {
                        onSuccess: () => {
                          setSendingViaEmail(false);
                          toast({ title: "Photos sent via email!" });
                        },
                        onError: (err: any) => {
                          setSendingViaEmail(false);
                          toast({ title: "Failed to send email", description: err.message, variant: "destructive" });
                        },
                      });
                    }}
                    data-testid="button-share-via-email"
                  >
                    {sendingViaEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                    Send via Email
                  </button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!companyCamLightboxPhoto} onOpenChange={() => setCompanyCamLightboxPhoto(null)}>
        <DialogContent className="max-w-4xl p-2" data-testid="dialog-companycam-lightbox">
          <DialogHeader>
            <DialogTitle className="sr-only">CompanyCam Photo</DialogTitle>
          </DialogHeader>
          {companyCamLightboxPhoto && (
            <img
              src={companyCamLightboxPhoto}
              alt="CompanyCam photo full size"
              className="w-full h-auto rounded-md"
              data-testid="img-companycam-lightbox"
            />
          )}
        </DialogContent>
      </Dialog>

      {viewingIndex !== null && galleryPhotos.length > 0 && (
        <PhotoGalleryViewer
          photos={galleryPhotos}
          initialIndex={viewingIndex}
          onClose={() => setViewingIndex(null)}
          canEditPhoto={(idx) => {
            const p = galleryPhotos[idx] as any;
            if (!p) return false;
            if (typeof p.id === 'string') return false;
            return true;
          }}
          onEdit={(idx) => {
            const p = galleryPhotos[idx] as any;
            if (!p || typeof p.id === 'string') return;
            editSessionRef.current++;
            editSnapshotRef.current = { id: p.id, storageKey: p.storageKey, caption: p.caption || '', fileName: p.fileName, annotations: p.annotations as any[] | undefined, _isAreaPhoto: p._isAreaPhoto, _areaPhotoUrl: p._areaPhotoUrl, _isSourcePhoto: !p._isAreaPhoto && typeof p.id === 'number' && p.id < 0, _sourceType: p._sourceType } as any;
            setEditingIndex(idx);
          }}
          onDelete={(id) => {
            if (typeof id === 'number' && id > 0 && confirm("Remove this photo?")) {
              deletePhotoMutation.mutate(id);
              setViewingIndex(null);
            }
          }}
          onRename={(id, newName) => {
            if (typeof id === 'number' && id > 0) updatePhotoMutation.mutate({ photoId: id, data: { caption: newName } });
          }}
        />
      )}

      {editingIndex !== null && editSnapshotRef.current && (() => {
        const snap = editSnapshotRef.current!;
        const sk = snap.storageKey;
        const photoUrl = sk.startsWith("blob:") || sk.startsWith("http://") || sk.startsWith("https://") ? sk : sk.startsWith("/objects/") ? sk : `/objects/${sk}`;
        return (
          <PhotoEditor
            key={`editor-${snap.id}-${editSessionRef.current}`}
            initialSrc={photoUrl}
            initialName={snap.caption || snap.fileName}
            initialAnnotations={snap.annotations as Annotation[] | undefined}
            onSave={(annots, rotatedImageDataUrl) => {
              const snapAny = snap as any;
              if (snapAny._isAreaPhoto) {
                const areaUrl = snapAny._areaPhotoUrl;
                queryClient.setQueryData(
                  ['/api/documents/:id', documentId],
                  (old: any) => {
                    if (!old) return old;
                    const content = JSON.parse(JSON.stringify(old.content || {}));
                    const blocks = content.productionRateBlocks || [];
                    for (const block of blocks) {
                      for (const room of (block.roomBuilderData?.rooms || [])) {
                        for (const p of (room.photos || [])) {
                          if (p.url === areaUrl) {
                            p.annotations = annots;
                            return { ...old, content };
                          }
                        }
                      }
                    }
                    return old;
                  }
                );
                if (projectId) {
                  queryClient.setQueryData(
                    ["/api/documents", "project", projectId],
                    (old: any) => old?.map((d: any) => {
                      if (d.id !== documentId) return d;
                      const content = JSON.parse(JSON.stringify(d.content || {}));
                      for (const block of (content.productionRateBlocks || [])) {
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
                }
                setEditingIndex(null);
                (async () => {
                  const existingAnnots = (snapAny.annotations as any[] | null) || [];
                  const annotsChanged = JSON.stringify(annots) !== JSON.stringify(existingAnnots);
                  let newUrl: string | undefined;
                  if (rotatedImageDataUrl) {
                    try {
                      const blob = await (await fetch(rotatedImageDataUrl)).blob();
                      URL.revokeObjectURL(rotatedImageDataUrl);
                      const fileName = `rotated_area_${Date.now()}.jpg`;
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
                        newUrl = objectPath.startsWith("/objects/") ? objectPath : `/objects/${objectPath}`;
                      }
                    } catch (err) {
                      console.error("Failed to upload rotated image:", err);
                    }
                  }
                  if (!annotsChanged && !newUrl) return;
                  try {
                    const docRes = await fetch(`/api/documents/${documentId}`, { credentials: "include" });
                    if (!docRes.ok) throw new Error("Failed to fetch document");
                    const docData = await docRes.json();
                    const content = JSON.parse(JSON.stringify(docData.content || {}));
                    const blocks = content.productionRateBlocks || [];
                    let found = false;
                    for (const block of blocks) {
                      for (const room of (block.roomBuilderData?.rooms || [])) {
                        for (const p of (room.photos || [])) {
                          if (p.url === areaUrl || (newUrl && p.url === snapAny._areaPhotoUrl)) {
                            if (newUrl) p.url = newUrl;
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
                      await apiRequest("PUT", `/api/documents/${documentId}`, { content });
                    }
                  } catch (err: any) {
                    toast({ title: "Save failed", description: err.message, variant: "destructive" });
                  }
                })();
              } else if (snapAny._isSourcePhoto) {
                setEditingIndex(null);
                (async () => {
                  let newKey: string | undefined;
                  if (rotatedImageDataUrl) {
                    try {
                      const blob = await (await fetch(rotatedImageDataUrl)).blob();
                      URL.revokeObjectURL(rotatedImageDataUrl);
                      const fileName = `rotated_source_${Date.now()}.jpg`;
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
                        newKey = objectPath;
                      }
                    } catch (err) {
                      console.error("Failed to upload rotated image:", err);
                    }
                  }
                  try {
                    if (projectId) {
                      const matRes = await apiRequest("POST", `/api/projects/${projectId}/materialize-source-photo`, {
                        url: snap.storageKey,
                        source: (snapAny._sourceType === 'form_submission') ? 'booking_form' : 'customer_message',
                        caption: snap.caption || snap.fileName || 'Photo',
                      });
                      const materializedPhoto = await matRes.json();
                      if (materializedPhoto?.id) {
                        const updateData: any = { annotations: annots };
                        if (newKey) updateData.storageKey = newKey;
                        await apiRequest("PUT", `/api/documents/0/photos/${materializedPhoto.id}`, updateData);
                      }
                      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "photos"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "source-photos"] });
                    }
                    queryClient.invalidateQueries({ queryKey: ["/api/documents", documentId, "photos"] });
                  } catch (err: any) {
                    toast({ title: "Save failed", description: err.message, variant: "destructive" });
                  }
                })();
              } else {
                return handleAnnotationSave(snap.id, annots, rotatedImageDataUrl);
              }
            }}
            onCancel={() => {
              setEditingIndex(null);
            }}
          />
        );
      })()}

      {cameraOpen && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => { setCameraOpen(false); cameraCaptureCountRef.current = 0; }}
        />
      )}
    </>
  );
}
