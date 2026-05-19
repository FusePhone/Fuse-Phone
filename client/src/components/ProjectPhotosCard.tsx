import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { useNavigationGuard } from "@/hooks/use-navigation-guard";
import { compressImage, compressBlob } from "@/lib/compress-image";
import { savePendingUpload, removePendingUpload, getPendingUploads, notifyUploadsComplete } from "@/lib/pending-uploads";
import { copyToClipboard } from "@/lib/clipboard";
import { AnnotatedThumb } from "@/components/DocumentPhotos";
import { PhotoGalleryViewer } from "@/components/PhotoGalleryViewer";
import { CameraCapture } from "@/components/CameraCapture";
import { Editor as PhotoEditor, type Annotation } from "@/components/PhotoEditor";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Camera, ImagePlus, Loader2, Eye, EyeOff, Check, CheckSquare,
  Trash2, Share2, ChevronDown, Link2, CheckCircle, CloudUpload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpdateDocument } from "@/hooks/use-documents";
import { useCompanySettings } from "@/hooks/use-company-settings";
import { CompanyCamProjectPicker } from "./CompanyCamProjectPicker";

interface ProjectPhotosCardProps {
  projectId: number;
  documentId: number;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactName?: string | null;
  contactAddress?: string | null;
  contactCity?: string | null;
  contactState?: string | null;
  contactZipCode?: string | null;
  companyName?: string | null;
  canSendSms?: boolean;
  canSendEmail?: boolean;
}

export function ProjectPhotosCard({
  projectId,
  documentId,
  contactPhone,
  contactEmail,
  contactName,
  contactAddress,
  contactCity,
  contactState,
  contactZipCode,
  companyName,
  canSendSms,
  canSendEmail,
}: ProjectPhotosCardProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraCaptureCount = useRef(0);
  const [pendingPhotos, setPendingPhotos] = useState<Array<{ tempId: string; blobUrl: string; fileName: string; createdAt: string }>>([]);
  const pendingPhotosRef = useRef(pendingPhotos);
  pendingPhotosRef.current = pendingPhotos;
  useNavigationGuard(useCallback(() => pendingPhotosRef.current.length > 0, []), "Photos are still uploading.");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareDialog, setShareDialog] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const [viewing, setViewing] = useState<{ index: number; documentId: number } | null>(null);
  const [editing, setEditing] = useState<{ photo: any; documentId: number } | null>(null);
  const editSessionRef = useRef(0);

  const { uploadFile } = useUpload({});
  const { mutate: updateDocForPhoto } = useUpdateDocument();

  const { data: projectPhotos = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "photos"],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/projects/${projectId}/photos`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: expanded,
  });

  const { data: projectSourcePhotos = [] } = useQuery<{ source: string; url: string; date: string; contactName?: string }[]>({
    queryKey: ["/api/projects", projectId, "source-photos"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/source-photos`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: expanded,
  });

  const { data: projectDocuments } = useQuery<any[]>({
    queryKey: ["/api/documents", "project", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/documents?projectId=${projectId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: expanded,
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
    _dateStr: p.createdAt ? new Date(p.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
    _sourceLabel: "Uploading",
    createdAt: p.createdAt,
  }));

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
          };
        });
      });
    });
  });

  const { data: ccSettings } = useCompanySettings();
  const companyCamConnected = !!(ccSettings as any)?.companyCamApiToken;
  // For photo display: use any document on the project that has a CC link.
  const companyCamProjectId = (projectDocuments || []).find((d: any) => d.companyCamProjectId)?.companyCamProjectId;
  const companyCamDocId = (projectDocuments || []).find((d: any) => d.companyCamProjectId)?.id || documentId;
  const companyCamProjectName = (projectDocuments || []).find((d: any) => d.companyCamProjectId)?.companyCamProjectName;

  // For the picker on the proposal contractor view: the link belongs to THIS proposal,
  // not "the first doc on the project that has a link".
  const currentDoc = (projectDocuments || []).find((d: any) => d.id === documentId);
  const currentDocCcId: string | null = (currentDoc?.companyCamProjectId as string | null) || null;
  const currentDocCcName: string | null = (currentDoc?.companyCamProjectName as string | null) || null;

  const handleSelectCompanyCamProject = (ccId: string | null, ccName: string | null) => {
    if (!documentId) return;
    console.log('[CompanyCam] ProjectPhotosCard linking proposal', {
      docId: documentId,
      newCcId: ccId,
      newCcName: ccName,
      previousCcId: currentDocCcId,
    });
    // Optimistic patch so the chip flips instantly without waiting for the round trip.
    queryClient.setQueryData(
      ["/api/documents", "project", projectId],
      (old: any) => Array.isArray(old)
        ? old.map((d: any) => d.id === documentId
            ? { ...d, companyCamProjectId: ccId, companyCamProjectName: ccName }
            : d)
        : old,
    );
    updateDocForPhoto(
      { id: documentId, data: { companyCamProjectId: ccId, companyCamProjectName: ccName } },
      {
        onError: (err: any) => {
          console.error('[CompanyCam] ProjectPhotosCard link save failed', err);
          toast({ title: 'Could not save CompanyCam link', description: err?.message || 'Please try again.', variant: 'destructive' });
          // Roll back the optimistic patch.
          queryClient.invalidateQueries({ queryKey: ["/api/documents", "project", projectId] });
        },
      },
    );
  };

  const { data: companyCamPhotos = [] } = useQuery<any[]>({
    queryKey: ["/api/companycam/projects", companyCamProjectId, "photos"],
    queryFn: async () => {
      const res = await fetch(`/api/companycam/projects/${companyCamProjectId}/photos`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: companyCamConnected && !!companyCamProjectId && expanded,
    staleTime: 5 * 60 * 1000,
  });

  const ccText = (v: any): string | null => {
    if (v == null) return null;
    if (typeof v === "string") return v || null;
    if (typeof v === "object") return v.plain_text_content || v.text || v.content || null;
    return null;
  };
  const companyCamAsFlat = companyCamPhotos.map((p: any) => {
    const uri = p.uris?.find((u: any) => u.type === "medium")?.uri || p.uris?.find((u: any) => u.type === "original")?.uri || p.uris?.[0]?.uri;
    const dateStr = p.captured_at ? new Date(p.captured_at * 1000).toISOString().split("T")[0] : p.created_at ? new Date(p.created_at).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
    const ccCaption = ccText(p.description) || ccText(p.caption) || null;
    return {
      id: `cc-${p.id}`,
      fileName: ccCaption || "CompanyCam photo",
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

  const includedCompanyCamUrls = new Set<string>(
    (projectDocuments || []).flatMap((d: any) =>
      (d.content as any)?.includedCompanyCamPhotos || []
    )
  );

  const toggleCompanyCamPhotoVisibility = (photoUrl: string) => {
    const targetDocId = companyCamDocId || documentId;
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
      ["/api/documents", "project", projectId],
      (old: any) => old?.map((d: any) => d.id === targetDocId ? { ...d, content } : d)
    );
    updateDocForPhoto({ id: targetDocId, data: { content } });
  };

  const normalizeUrl = (u: string) => (u || '').replace(/^\/objects\//, '');
  const docPhotoUrls = new Set(docFlatPhotos.map((p: any) => normalizeUrl(p.storageKey)));
  const dedupedSourceFlat = sourceAsFlat.filter((sp: any) => !docPhotoUrls.has(normalizeUrl(sp.storageKey)));
  const dedupedAreaFlat = areaPhotosFlat.filter((ap: any) => !docPhotoUrls.has(normalizeUrl(ap.storageKey)));
  const allExistingUrls = new Set([...docPhotoUrls, ...dedupedSourceFlat.map((p: any) => normalizeUrl(p.storageKey)), ...dedupedAreaFlat.map((p: any) => normalizeUrl(p.storageKey))]);
  const dedupedCompanyCam = companyCamAsFlat.filter((cp: any) => !allExistingUrls.has(normalizeUrl(cp.storageKey)));
  const allFlatPhotos = [...pendingAsFlat, ...dedupedSourceFlat, ...docFlatPhotos, ...dedupedAreaFlat, ...dedupedCompanyCam]
    .sort((a: any, b: any) => (b._dateStr || "").localeCompare(a._dateStr || ""));

  const proposalDocIds = new Set(
    projectPhotos
      .map((g: any) => g.document.id)
  );

  const proposalHiddenPhotoIds = new Set<number>();
  for (const doc of (projectDocuments || [])) {
    const hidden: number[] = (doc.content as any)?.hiddenDocumentPhotoIds || [];
    for (const hid of hidden) proposalHiddenPhotoIds.add(hid);
  }

  const dateGroups: { dateStr: string; label: string; sourceLabel: string; items: any[] }[] = [];
  for (const item of allFlatPhotos) {
    const last = dateGroups[dateGroups.length - 1];
    if (last && last.dateStr === item._dateStr) {
      last.items.push(item);
    } else {
      const label = (!item._dateStr || item._dateStr === "unknown") ? "Unknown date" : (() => {
        try { return new Date(item._dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return item._dateStr; }
      })();
      dateGroups.push({ dateStr: item._dateStr, label, sourceLabel: "", items: [item] });
    }
  }

  const addPhotoMutation = useMutation({
    mutationFn: async (data: { fileName: string; storageKey: string; sortOrder: number; documentId?: number }) => {
      if (data.documentId) {
        const res = await apiRequest("POST", `/api/documents/${data.documentId}/photos`, { fileName: data.fileName, storageKey: data.storageKey, sortOrder: data.sortOrder });
        return res.json();
      } else {
        const res = await apiRequest("POST", `/api/projects/${projectId}/photos`, { fileName: data.fileName, storageKey: data.storageKey, sortOrder: data.sortOrder });
        return res.json();
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "photos"] });
      if (variables.documentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/documents", variables.documentId, "photos"] });
      }
    },
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
    for (const entry of tempEntries) {
      try {
        const result = await uploadFile(entry.file);
        if (result) {
          await addPhotoMutation.mutateAsync({ fileName: entry.fileName, storageKey: result.objectPath, sortOrder: 0 });
        }
      } catch (err: any) {
        toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
      } finally {
        setPendingPhotos(prev => prev.filter(p => p.tempId !== entry.tempId));
        URL.revokeObjectURL(entry.blobUrl);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleCameraCapture = useCallback(async (blob: Blob) => {
    cameraCaptureCount.current += 1;
    const n = cameraCaptureCount.current;
    const ts = new Date();
    const fileName = `Photo ${ts.toLocaleDateString("en-US", { month: "short", day: "numeric" })} #${n}.jpg`;
    const file = await compressBlob(blob, fileName);
    const tempId = `pending-cam-${crypto.randomUUID()}`;
    const blobUrl = URL.createObjectURL(blob);
    setPendingPhotos(prev => [{ tempId, blobUrl, fileName, createdAt: new Date().toISOString() }, ...prev]);
    try {
      const result = await uploadFile(file);
      if (result) {
        await addPhotoMutation.mutateAsync({ fileName, storageKey: result.objectPath, sortOrder: 0 });
      }
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setPendingPhotos(prev => prev.filter(p => p.tempId !== tempId));
      URL.revokeObjectURL(blobUrl);
    }
  }, [uploadFile, addPhotoMutation, toast]);

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (key: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const togglePhotoProposalVisibility = (photoId: number, docId: number) => {
    const targetDocId = docId > 0 ? docId : documentId;
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
      ["/api/documents", "project", projectId],
      (old: any) => old?.map((d: any) => d.id === targetDocId ? { ...d, content } : d)
    );
    updateDocForPhoto({ id: targetDocId, data: { content } });
    queryClient.invalidateQueries({ queryKey: ["/api/documents", targetDocId, "photos"] });
  };

  const toggleAreaPhotoProposalVisibility = (photoUrl: string, docId: number) => {
    const doc = (projectDocuments || []).find((d: any) => d.id === docId);
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
      ["/api/documents", "project", projectId],
      (old: any) => old?.map((d: any) => d.id === docId ? { ...d, content } : d)
    );
    updateDocForPhoto({ id: docId, data: { content } });
  };

  const totalCount = allFlatPhotos.length;

  return (
    <>
      <Card data-testid="card-project-photos">
        <CardContent className="p-4">
          <button
            type="button"
            className="flex items-center justify-between gap-2 w-full text-left"
            onClick={() => setExpanded(!expanded)}
            data-testid="button-toggle-project-photos"
          >
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Photos</span>
              {totalCount > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {totalCount}
                </Badge>
              )}
            </div>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
          </button>

          {expanded && (
            <div className="mt-3">
              {documentId > 0 && companyCamConnected && (
                <CompanyCamProjectPicker
                  selectedProjectId={currentDocCcId}
                  selectedProjectName={currentDocCcName}
                  onSelect={handleSelectCompanyCamProject}
                  companyCamConnected={companyCamConnected}
                  contactHint={{
                    name: contactName || undefined,
                    address: contactAddress || undefined,
                    city: contactCity || undefined,
                    state: contactState || undefined,
                    zipCode: contactZipCode || undefined,
                  }}
                />
              )}
              {cameraOpen && (
                <CameraCapture
                  onCapture={handleCameraCapture}
                  onClose={() => setCameraOpen(false)}
                />
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".jpg,.jpeg,.png,.heic,.heif,.webp,.gif,.bmp,.tiff,.tif"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                data-testid="proposal-photo-file-input"
              />

              {allFlatPhotos.length === 0 ? (
                <div className="text-center py-6">
                  <Camera className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground text-sm">No photos yet</p>
                  <p className="text-muted-foreground text-xs mt-1">Photos from documents and messages will appear here</p>
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      onClick={() => setCameraOpen(true)}
                      data-testid="button-proposal-camera-empty"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Take Photo
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      data-testid="button-proposal-upload-empty"
                    >
                      {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                      Upload
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">All Photos</span>
                      <span className="text-[10px] text-muted-foreground/60">({totalCount})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {!selectMode && (
                        <>
                          <button
                            type="button"
                            className="p-1.5 rounded-md hover:bg-green-50 dark:hover:bg-green-900/30 active:bg-green-100 transition-colors"
                            onClick={() => setCameraOpen(true)}
                            data-testid="button-proposal-camera"
                          >
                            <Camera className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </button>
                          <button
                            type="button"
                            className="p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 active:bg-blue-100 transition-colors"
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            data-testid="button-proposal-upload"
                          >
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> : <ImagePlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                          </button>
                        </>
                      )}
                      {totalCount > 0 && !selectMode && (
                        <button
                          type="button"
                          className="p-1.5 rounded-md hover:bg-orange-50 dark:hover:bg-orange-900/30 active:bg-orange-100 transition-colors"
                          onClick={() => setSelectMode(true)}
                          data-testid="button-proposal-photo-select-mode"
                        >
                          <CheckSquare className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        </button>
                      )}
                      {selectMode && (
                        <>
                          {selectedIds.size > 0 && (() => {
                            // allSelected is still needed by the Delete button below.
                            const allSelected = Array.from(selectedIds).map(key => {
                              const colonIdx = key.indexOf(':');
                              const docIdStr = key.substring(0, colonIdx);
                              const photoIdStr = key.substring(colonIdx + 1);
                              return { documentId: parseInt(docIdStr), photoId: photoIdStr.startsWith('cc-') ? photoIdStr : parseInt(photoIdStr) };
                            });
                            // Build universal share entries from any selected photo type
                            // (uploaded doc photos, project-level, source/text/form, area, CompanyCam).
                            // Mixed selections across multiple documents are supported.
                            const buildEntries = () => {
                              const entries: Array<any> = [];
                              for (const key of Array.from(selectedIds)) {
                                const photo = allFlatPhotos.find((p: any) => `${p.documentId}:${p.id}` === key);
                                if (!photo) continue;
                                if (photo._isPending) continue; // skip uploads in flight
                                if (photo._isCompanyCam || photo._isSource || photo._isAreaPhoto) {
                                  const url = photo._areaPhotoUrl || photo._sourceUrl || photo.storageKey;
                                  if (!url) continue;
                                  entries.push({
                                    kind: 'url',
                                    url,
                                    caption: photo.caption || null,
                                    fileName: photo.fileName || null,
                                    annotations: Array.isArray(photo.annotations) ? photo.annotations : null,
                                  });
                                } else if (typeof photo.id === 'number' && photo.id > 0) {
                                  entries.push({ kind: 'doc', photoId: photo.id });
                                }
                              }
                              return entries;
                            };
                            return (
                              <>
                                <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                                <button
                                  type="button"
                                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
                                  disabled={sharing}
                                  onClick={async () => {
                                    const entries = buildEntries();
                                    if (entries.length === 0) {
                                      toast({ title: "Nothing to share", description: "Selected photos are still uploading or unavailable.", variant: "destructive" });
                                      return;
                                    }
                                    setSharing(true);
                                    try {
                                      const res = await apiRequest("POST", `/api/photo-share`, { entries, projectId });
                                      let data;
                                      try { data = await res.json(); } catch { throw new Error("Invalid server response"); }
                                      if (!data.url) throw new Error(data.message || "No share link returned");
                                      setShareUrl(data.url);
                                      setLinkCopied(false);
                                      setShareDialog(true);
                                    } catch (err: any) {
                                      const raw = err?.message || "Something went wrong";
                                      const friendly = (raw.includes("Failed to fetch") || raw.includes("NetworkError") || raw.includes("502") || raw.includes("503") || raw.includes("<!") || raw.length > 200)
                                        ? "Could not reach the server. Please try again." : raw.replace(/^\d+:\s*/, "");
                                      toast({ title: "Share failed", description: friendly, variant: "destructive" });
                                    } finally {
                                      setSharing(false);
                                    }
                                  }}
                                  data-testid="button-proposal-photo-share"
                                >
                                  {sharing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
                                  Share
                                </button>
                                <button
                                  type="button"
                                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors"
                                  onClick={async () => {
                                    const ccSelected = allSelected.filter(s => typeof s.photoId === 'string');
                                    const nonCcSelected = allSelected.filter(s => typeof s.photoId === 'number');
                                    if (nonCcSelected.length === 0) {
                                      toast({ title: "Can't delete CompanyCam photos", description: "CompanyCam photos are managed in CompanyCam. Deselect them and try again.", variant: "destructive" });
                                      return;
                                    }
                                    const totalCount = nonCcSelected.length;
                                    if (!confirm(`Delete ${totalCount} photo${totalCount > 1 ? "s" : ""}?${ccSelected.length > 0 ? ` (${ccSelected.length} CompanyCam photo${ccSelected.length > 1 ? "s" : ""} will be skipped)` : ""}`)) return;
                                    try {
                                      const projPhotos = nonCcSelected.filter(s => s.documentId === 0);
                                      const docPhotos = nonCcSelected.filter(s => s.documentId !== 0);
                                      if (projPhotos.length > 0) {
                                        await apiRequest("POST", `/api/projects/${projectId}/photos/bulk-delete`, { photoIds: projPhotos.map(s => s.photoId) });
                                      }
                                      if (docPhotos.length > 0) {
                                        const byDoc = new Map<number, number[]>();
                                        for (const s of docPhotos) {
                                          if (!byDoc.has(s.documentId)) byDoc.set(s.documentId, []);
                                          byDoc.get(s.documentId)!.push(s.photoId);
                                        }
                                        for (const [dId, photoIds] of byDoc) {
                                          await apiRequest("POST", `/api/documents/${dId}/photos/bulk-delete`, { photoIds });
                                          queryClient.invalidateQueries({ queryKey: ["/api/documents", dId, "photos"] });
                                        }
                                      }
                                      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "photos"] });
                                      exitSelectMode();
                                      toast({ title: `${totalCount} photo${totalCount > 1 ? "s" : ""} deleted` });
                                    } catch (err: any) {
                                      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
                                    }
                                  }}
                                  data-testid="button-proposal-photo-bulk-delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete
                                </button>
                              </>
                            );
                          })()}
                          <button
                            type="button"
                            className="px-2 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
                            onClick={exitSelectMode}
                            data-testid="button-proposal-photo-cancel-select"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2" data-testid="proposal-photo-grid">
                    {dateGroups.map((group, groupIdx) => {
                      const globalStartIdx = allFlatPhotos.indexOf(group.items[0]);
                      return (
                        <div key={`${group.dateStr}-${groupIdx}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] font-medium text-muted-foreground">{group.label}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {group.items.map((photo: any, gi: number) => {
                              const idx = globalStartIdx + gi;
                              const isSource = photo._isSource;
                              const isPending = !!photo._isPending;
                              const selectKey = `${photo.documentId}:${photo.id}`;
                              const isCC = !!photo._isCompanyCam;
                              const isOnProposal = isCC
                                ? includedCompanyCamUrls.has(photo.storageKey)
                                : (!isSource && !isPending && proposalDocIds.has(photo.documentId) && !proposalHiddenPhotoIds.has(photo.id));
                              return (
                                <div
                                  key={`${photo.documentId}-${photo.id}-${idx}`}
                                  className="relative rounded-lg overflow-hidden cursor-pointer active:opacity-80"
                                  data-testid={isPending ? `pending-photo-${photo.id}` : isCC ? `cc-photo-${photo.id}` : isSource ? `source-photo-${idx}` : `proposal-card-photo-${photo.id}`}
                                  onClick={() => {
                                    if (selectMode && !isPending) {
                                      toggleSelected(selectKey);
                                    } else if (!selectMode) {
                                      setViewing({ index: allFlatPhotos.indexOf(photo), documentId: photo.documentId });
                                    }
                                  }}
                                >
                                  <div className="aspect-square">
                                    {isPending ? (
                                      <img src={photo.storageKey} alt="Uploading photo" className="w-full h-full object-cover" />
                                    ) : isCC ? (
                                      <img src={photo.storageKey} alt={photo.fileName || "CompanyCam photo"} className="w-full h-full object-cover" loading="lazy" />
                                    ) : (isSource && !(photo.annotations as any[])?.length) ? (
                                      <img src={photo.storageKey} alt="Source photo" className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                      <AnnotatedThumb photo={photo} className="w-full h-full object-cover" />
                                    )}
                                  </div>
                                  {selectMode && (
                                    <div className={`absolute inset-0 flex items-start justify-end p-1.5 ${selectedIds.has(selectKey) ? "bg-blue-500/20" : ""}`}>
                                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedIds.has(selectKey) ? "bg-blue-500 border-blue-500 text-white" : "border-white/80 bg-black/30"}`}>
                                        {selectedIds.has(selectKey) && <Check className="w-3 h-3" />}
                                      </div>
                                    </div>
                                  )}
                                  {isPending && (
                                    <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                                      <CloudUpload className="w-3.5 h-3.5 text-white/80 animate-pulse" />
                                    </div>
                                  )}
                                  {isCC && (
                                    <div className="absolute top-1 left-1 px-1 py-0.5 rounded text-[9px] font-bold bg-orange-500 text-white leading-none">
                                      CC
                                    </div>
                                  )}
                                  {isCC && photo.caption && (
                                    <div
                                      className="absolute bottom-0 left-0 right-0 px-1.5 pt-3 pb-1 pr-8 bg-gradient-to-t from-black/70 to-transparent pointer-events-none"
                                      data-testid={`cc-caption-${photo.id}`}
                                    >
                                      <p className="text-[10px] text-white leading-tight line-clamp-2">
                                        {photo.caption}
                                      </p>
                                    </div>
                                  )}
                                  {!selectMode && !isPending && isCC && (
                                    <button
                                      className={`absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center ${isOnProposal ? "bg-green-600/90 text-white" : "bg-gray-500/70 text-white/70"}`}
                                      data-testid={`toggle-cc-visibility-${photo.id}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleCompanyCamPhotoVisibility(photo.storageKey);
                                      }}
                                    >
                                      {isOnProposal ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                    </button>
                                  )}
                                  {!selectMode && !isPending && !isSource && !isCC && proposalDocIds.has(photo.documentId) && (
                                    <button
                                      className={`absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center ${isOnProposal ? "bg-green-600/90 text-white" : "bg-gray-500/70 text-white/70"}`}
                                      data-testid={`toggle-proposal-visibility-${photo.id}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        togglePhotoProposalVisibility(photo.id, photo.documentId);
                                      }}
                                    >
                                      {isOnProposal ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                    </button>
                                  )}
                                  {!selectMode && !isPending && photo._isAreaPhoto && (
                                    <button
                                      className={`absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center ${photo._areaShowOnProposal ? "bg-green-600/90 text-white" : "bg-gray-500/70 text-white/70"}`}
                                      data-testid={`toggle-area-visibility-${idx}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleAreaPhotoProposalVisibility(photo._areaPhotoUrl, photo.documentId);
                                      }}
                                    >
                                      {photo._areaShowOnProposal ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
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
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={shareDialog} onOpenChange={(open) => { if (!open) { setShareDialog(false); setShareUrl(null); exitSelectMode(); } }}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto" data-testid="dialog-proposal-share-photos">
          <DialogHeader>
            <DialogTitle>Share Photos</DialogTitle>
          </DialogHeader>
          {shareUrl && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {selectedIds.size} photo{selectedIds.size !== 1 ? "s" : ""} selected
                {contactName ? ` — share with ${contactName}` : ""}
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
                    }
                  }}
                  data-testid="button-copy-proposal-photo-share-url"
                >
                  {linkCopied ? <CheckCircle className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                  {linkCopied ? "Link Copied!" : "Copy Link"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {viewing && (() => {
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
          return p?.documentId || viewing.documentId;
        };
        return (
          <PhotoGalleryViewer
            photos={viewerPhotos}
            initialIndex={viewing.index}
            onClose={() => setViewing(null)}
            canEditPhoto={(idx) => {
              const photo = allFlatPhotos[idx];
              if (!photo) return false;
              if (photo._isPending) return false;
              if (photo._isCompanyCam) return false;
              return true;
            }}
            onEdit={(idx) => {
              const photo = allFlatPhotos[idx];
              if (!photo || photo._isPending) return;
              editSessionRef.current++;
              setEditing({ photo, documentId: photo.documentId || viewing.documentId });
            }}
            onDelete={(photoId) => {
              if (typeof photoId === 'string' || photoId < 0) return;
              if (confirm("Remove this photo?")) {
                const docId = getDocId(photoId);
                apiRequest("DELETE", `/api/documents/${docId}/photos/${photoId}`).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "photos"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/documents", docId, "photos"] });
                });
                setViewing(null);
              }
            }}
            onRename={(photoId, newName) => {
              if (typeof photoId === 'string' || photoId < 0) return;
              const docId = getDocId(photoId);
              apiRequest("PUT", `/api/documents/${docId}/photos/${photoId}`, { caption: newName }).then(() => {
                queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "photos"] });
                queryClient.invalidateQueries({ queryKey: ["/api/documents", docId, "photos"] });
              });
            }}
          />
        );
      })()}

      {editing && (() => {
        const { photo, documentId: docId } = editing;
        const url = photo.storageKey.startsWith("http") ? photo.storageKey : photo.storageKey.startsWith("/objects/") ? photo.storageKey : `/objects/${photo.storageKey}`;
        return (
          <PhotoEditor
            key={`proposal-editor-${photo.id}-${editSessionRef.current}`}
            initialSrc={url}
            initialName={photo.caption || photo.fileName}
            initialAnnotations={photo.annotations as Annotation[] | undefined}
            onSave={async (annots, rotatedImageDataUrl) => {
              setEditing(null);
              const isAreaPhoto = !!photo._isAreaPhoto;
              const existingAnnots = (photo.annotations as any[] | null) || [];
              const annotsChanged = JSON.stringify(annots) !== JSON.stringify(existingAnnots);

              if (isAreaPhoto) {
                queryClient.setQueryData(
                  ["/api/documents", "project", projectId],
                  (old: any) => old?.map((d: any) => {
                    if (d.id !== docId) return d;
                    const content = JSON.parse(JSON.stringify(d.content || {}));
                    for (const block of (content.productionRateBlocks || [])) {
                      for (const room of (block.roomBuilderData?.rooms || [])) {
                        for (const p of (room.photos || [])) {
                          if (p.url === photo._areaPhotoUrl) {
                            p.annotations = annots;
                          }
                        }
                      }
                    }
                    return { ...d, content };
                  })
                );
                const doc = (projectDocuments || []).find((d: any) => d.id === docId);
                if (doc) {
                  const content = JSON.parse(JSON.stringify(doc.content || {}));
                  for (const block of (content.productionRateBlocks || [])) {
                    for (const room of (block.roomBuilderData?.rooms || [])) {
                      for (const p of (room.photos || [])) {
                        if (p.url === photo._areaPhotoUrl) {
                          p.annotations = annots;
                        }
                      }
                    }
                  }
                  updateDocForPhoto({ id: docId, data: { content } });
                }
                return;
              }

              if (photo._isSource) {
                if (!annotsChanged) return;
                try {
                  const matRes = await apiRequest("POST", `/api/projects/${projectId}/materialize-source-photo`, {
                    url: photo._sourceUrl || photo.storageKey,
                    source: photo._sourceType === 'form_submission' ? 'booking_form' : (photo._sourceType || 'customer_message'),
                    caption: photo.caption || photo.fileName || 'Photo',
                  });
                  const materializedPhoto = await matRes.json();
                  if (materializedPhoto?.id) {
                    await apiRequest("PUT", `/api/documents/0/photos/${materializedPhoto.id}`, { annotations: annots });
                  }
                  queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "photos"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "source-photos"] });
                } catch {}
                return;
              }

              if (annotsChanged) {
                try {
                  const actualDocId = docId || 0;
                  await apiRequest("PUT", `/api/documents/${actualDocId}/photos/${photo.id}`, { annotations: annots });
                  if (actualDocId > 0) {
                    queryClient.invalidateQueries({ queryKey: ["/api/documents", actualDocId, "photos"] });
                  }
                  queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "photos"] });
                } catch {}
              }
            }}
            onClose={() => setEditing(null)}
          />
        );
      })()}
    </>
  );
}