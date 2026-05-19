import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderAnnotation, type Annotation } from "./PhotoEditor";

function AnnotatedThumb({ src, annotations, alt, className }: { src: string; annotations?: any[] | null; alt: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const annots = (annotations as Annotation[] | null) || [];
  const hasAnnotations = annots.length > 0;

  useEffect(() => { setImgLoaded(false); }, [src]);

  useEffect(() => {
    if (!imgLoaded || !hasAnnotations) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const displayW = img.clientWidth;
    const displayH = img.clientHeight;
    if (displayW === 0 || displayH === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    canvas.style.width = displayW + "px";
    canvas.style.height = displayH + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sx = displayW / img.naturalWidth;
    const sy = displayH / img.naturalHeight;
    const scale = Math.min(sx, sy);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const offsetX = (displayW - drawW) / 2;
    const offsetY = (displayH - drawH) / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    for (const ann of annots) {
      try { renderAnnotation(ctx, ann); } catch (_e) {}
    }
  }, [imgLoaded, annotations]);

  return (
    <div className="relative w-full h-full">
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={className}
        loading="lazy"
        onLoad={() => setImgLoaded(true)}
      />
      {hasAnnotations && imgLoaded && (
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      )}
    </div>
  );
}

interface ProjectPhotoPickerProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (photos: Array<{ url: string; timestamp: string; annotations?: any[] | null }>) => void;
  existingUrls?: string[];
}

export function ProjectPhotoPicker({
  projectId,
  open,
  onOpenChange,
  onSelect,
  existingUrls = [],
}: ProjectPhotoPickerProps) {
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());

  const { data: projectPhotos = [], isLoading: loadingPhotos } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "photos"],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/projects/${projectId}/photos`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!projectId,
  });

  const { data: sourcePhotos = [], isLoading: loadingSources } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "source-photos"],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/projects/${projectId}/source-photos`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!projectId,
  });

  const allPhotos = useMemo(() => {
    const docFlat = projectPhotos.flatMap((group: any) =>
      group.photos.map((photo: any) => ({
        url: photo.storageKey,
        displayUrl: photo.annotatedStorageKey || photo.storageKey,
        label: group.document.title || "Uploaded",
        date: photo.createdAt || "",
        annotations: photo.annotations || null,
      }))
    );

    const srcFlat = (sourcePhotos || []).map((sp: any) => ({
      url: sp.url,
      displayUrl: sp.url,
      label: sp.source === "message" ? "From Text" : "Form Submission",
      date: sp.date || "",
    }));

    const docUrls = new Set(docFlat.map((p: any) => p.url));
    const dedupedSrc = srcFlat.filter((sp: any) => !docUrls.has(sp.url));

    const seen = new Set<string>();
    return [...docFlat, ...dedupedSrc]
      .filter((p) => {
        if (!p.url || seen.has(p.url)) return false;
        seen.add(p.url);
        return true;
      })
      .sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da;
      });
  }, [projectPhotos, sourcePhotos]);

  const canonUrl = (u: string) => (u || "").replace(/^\/objects\//, "");
  const existingSet = useMemo(
    () => new Set(existingUrls.map(canonUrl)),
    [existingUrls]
  );

  const togglePhoto = (url: string) => {
    if (existingSet.has(canonUrl(url))) return;
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleConfirm = () => {
    const selected = Array.from(selectedUrls).map((url) => {
      const found = allPhotos.find((p) => p.url === url);
      return {
        url,
        timestamp: new Date().toISOString(),
        annotations: found?.annotations || null,
      };
    });
    onSelect(selected);
    setSelectedUrls(new Set());
    onOpenChange(false);
  };

  const handleClose = () => {
    setSelectedUrls(new Set());
    onOpenChange(false);
  };

  const isLoading = loadingPhotos || loadingSources;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-lg max-h-[80vh] flex flex-col p-0 gap-0"
        style={{ zIndex: 2147483645 }}
      >
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="w-4 h-4" />
            Project Photos
          </DialogTitle>
          {selectedUrls.size > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {selectedUrls.size} selected
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : allPhotos.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No project photos found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload photos to the project first
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {allPhotos.map((photo, idx) => {
                const isExisting = existingSet.has(canonUrl(photo.url));
                const isSelected = selectedUrls.has(photo.url);
                return (
                  <button
                    key={`${photo.url}-${idx}`}
                    type="button"
                    onClick={() => togglePhoto(photo.url)}
                    disabled={isExisting}
                    className={cn(
                      "relative aspect-square rounded-lg overflow-hidden border-2 transition-all",
                      isExisting
                        ? "opacity-40 cursor-not-allowed border-muted"
                        : isSelected
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-transparent hover:border-primary/40"
                    )}
                    data-testid={`button-pick-photo-${idx}`}
                  >
                    <AnnotatedThumb
                      src={photo.displayUrl}
                      annotations={photo.annotations}
                      alt={photo.label}
                      className="w-full h-full object-cover"
                    />
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-3 h-3 text-primary-foreground" />
                      </div>
                    )}
                    {isExisting && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <span className="text-[9px] font-medium text-white bg-black/60 px-1.5 py-0.5 rounded">
                          Added
                        </span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1">
                      <span className="text-[9px] text-white/90 font-medium truncate block">
                        {photo.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t px-4 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleClose} data-testid="button-cancel-photo-picker">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={selectedUrls.size === 0}
            data-testid="button-confirm-photo-picker"
          >
            Add {selectedUrls.size > 0 ? `${selectedUrls.size} Photo${selectedUrls.size !== 1 ? "s" : ""}` : "Photos"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
