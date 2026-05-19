import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { MessageSquare, FileText, ChevronDown, Image, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileNavVisibility } from "@/components/layout/Sidebar";
import { PhotoGalleryViewer } from "./PhotoGalleryViewer";

interface SourcePhoto {
  source: string;
  url: string;
  date: string;
  contentType?: string;
}

interface PhotoGroup {
  label: string;
  icon: typeof MessageSquare;
  date: string;
  items: Array<{ url: string }>;
}

interface SourcePhotosSectionProps {
  documentId: number;
  includedSourcePhotos: string[];
  onTogglePhoto: (url: string) => void;
}

export function SourcePhotosSection({
  documentId,
  includedSourcePhotos,
  onTogglePhoto,
}: SourcePhotosSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const { setHidden: setNavHidden } = useMobileNavVisibility();

  useEffect(() => {
    setNavHidden(viewingIndex !== null);
    return () => setNavHidden(false);
  }, [viewingIndex, setNavHidden]);

  const { data: sourcePhotos = [], isLoading } = useQuery<SourcePhoto[]>({
    queryKey: ['/api/documents', documentId, 'source-photos'],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/source-photos`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const grouped = useMemo(() => {
    const groups: PhotoGroup[] = [];
    const bySourceDate = new Map<string, SourcePhoto[]>();
    for (const p of sourcePhotos) {
      const key = `${p.source}::${p.date}`;
      if (!bySourceDate.has(key)) bySourceDate.set(key, []);
      bySourceDate.get(key)!.push(p);
    }

    const entries = Array.from(bySourceDate.entries()).sort((a, b) => {
      const dateA = a[0].split('::')[1];
      const dateB = b[0].split('::')[1];
      return dateB.localeCompare(dateA);
    });

    for (const [key, photos] of entries) {
      const [source, date] = key.split('::');
      groups.push({
        label: source === 'message' ? 'Customer Message Photos' : 'Form Submission Photos',
        icon: source === 'message' ? MessageSquare : FileText,
        date,
        items: photos.map(p => ({ url: p.url })),
      });
    }
    return groups;
  }, [sourcePhotos]);

  const allFlatPhotos = useMemo(() => {
    const flat: Array<{ url: string }> = [];
    for (const group of grouped) {
      for (const item of group.items) {
        flat.push({ url: item.url });
      }
    }
    return flat;
  }, [grouped]);

  const getFlatIndex = (groupIndex: number, photoIndex: number): number => {
    let idx = 0;
    for (let g = 0; g < grouped.length; g++) {
      if (g === groupIndex) return idx + photoIndex;
      idx += grouped[g].items.length;
    }
    return 0;
  };

  const galleryPhotos = allFlatPhotos.map((p, i) => ({
    id: -(i + 1),
    fileName: `Photo ${i + 1}`,
    storageKey: p.url,
    caption: null,
    annotations: null,
    annotatedStorageKey: null,
  }));

  if (isLoading) {
    return (
      <div className="py-2">
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (sourcePhotos.length === 0) return null;

  const selectedSourceCount = includedSourcePhotos.length;

  return (
    <>
      <div className="border-t pt-3" data-testid="source-photos-section">
        <button
          type="button"
          className="flex items-center justify-between gap-2 w-full text-left"
          onClick={() => setExpanded(!expanded)}
          data-testid="button-toggle-source-photos"
        >
          <div className="flex items-center gap-2">
            <Image className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Source Photos</span>
            <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
              {selectedSourceCount} of {sourcePhotos.length} included
            </span>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </button>

        {expanded && (
          <div className="mt-3 space-y-4" data-testid="source-photos-list">
            {grouped.map((group, gi) => {
              const Icon = group.icon;
              const formattedDate = group.date ? formatDate(group.date) : '';
              return (
                <div key={`${group.label}-${group.date}-${gi}`} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">{group.label}</span>
                    {formattedDate && <span className="text-[10px] text-muted-foreground/60">{formattedDate}</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {group.items.map((item, pi) => {
                      const isVisible = includedSourcePhotos.includes(item.url);
                      return (
                        <div
                          key={pi}
                          className={cn(
                            "relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer",
                            isVisible ? "border-primary ring-1 ring-primary/30" : "border-transparent opacity-50 hover:opacity-75"
                          )}
                          data-testid={`photo-visibility-${gi}-${pi}`}
                        >
                          <img
                            src={item.url}
                            alt="Source photo"
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onClick={() => {
                              const flatIdx = getFlatIndex(gi, pi);
                              setViewingIndex(flatIdx);
                            }}
                          />
                          <button
                            type="button"
                            className={cn(
                              "absolute top-1 right-1 w-10 h-10 rounded-full flex items-center justify-center transition-all",
                              isVisible ? "bg-primary text-white" : "bg-black/40 text-white/70"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              onTogglePhoto(item.url);
                            }}
                            data-testid={`button-toggle-photo-${gi}-${pi}`}
                          >
                            {isVisible ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground/60 px-1">
              Tap a photo to view it. Tap the eye icon to include or exclude from the proposal.
            </p>
          </div>
        )}
      </div>

      {viewingIndex !== null && galleryPhotos.length > 0 && (
        <PhotoGalleryViewer
          photos={galleryPhotos}
          initialIndex={viewingIndex}
          onClose={() => setViewingIndex(null)}
        />
      )}
    </>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr === 'unknown') return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
