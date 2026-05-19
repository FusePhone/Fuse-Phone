import { useState, useEffect, useRef, useCallback } from "react";
import { PoweredByFusePhone } from "@/components/PoweredByFusePhone";
import { Loader2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { renderAnnotation, type Annotation } from "@/components/PhotoEditor";

interface SharedPhoto {
  id: number;
  fileName: string;
  storageKey: string;
  caption: string | null;
  annotations: any[] | null;
  annotatedStorageKey: string | null;
}

interface SharedData {
  photos: SharedPhoto[];
  companyName: string | null;
  companyLogo: string | null;
  documentTitle: string | null;
  documentType: string | null;
}

const getPhotoUrl = (photo: SharedPhoto) => {
  const key = photo.annotatedStorageKey || photo.storageKey;
  if (key.startsWith("http://") || key.startsWith("https://")) return key;
  return key.startsWith("/objects/") ? key : `/objects/${key}`;
};

function AnnotatedSharedImg({ photo, className }: { photo: SharedPhoto; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const annots = (photo.annotations as Annotation[] | null) || [];
  const hasAnnotations = annots.length > 0;
  const url = getPhotoUrl(photo);

  useEffect(() => { setImgLoaded(false); }, [photo.id]);

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
  }, [imgLoaded, photo.annotations]);

  return (
    <div ref={containerRef} className="relative inline-block w-full h-full">
      <img ref={imgRef} src={url} alt={photo.caption || photo.fileName} className={className} loading="lazy" onLoad={() => setImgLoaded(true)} />
      {hasAnnotations && imgLoaded && (
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      )}
    </div>
  );
}

export default function SharedPhotos({ token }: { token: string }) {
  const [data, setData] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeYOffset, setSwipeYOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const swipeDirection = useRef<"horizontal" | "vertical" | "zoom" | null>(null);
  const pinchStartDist = useRef<number>(0);
  const pinchStartZoom = useRef<number>(1);
  const lastPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapRef = useRef<number>(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/shared-photos/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Photos not found");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const goToPhoto = useCallback((direction: "prev" | "next") => {
    if (!data || isAnimating || viewIndex === null) return;
    const total = data.photos.length;
    if (total <= 1) return;
    const atStart = viewIndex === 0 && direction === "prev";
    const atEnd = viewIndex === total - 1 && direction === "next";
    if (atStart || atEnd) {
      setIsAnimating(true);
      setSwipeOffset(atEnd ? -40 : 40);
      setTimeout(() => {
        setSwipeOffset(0);
        setTimeout(() => setIsAnimating(false), 200);
      }, 150);
      return;
    }
    resetZoom();
    setIsAnimating(true);
    const nextIdx = direction === "next" ? viewIndex + 1 : viewIndex - 1;
    const targetOffset = direction === "next" ? -window.innerWidth : window.innerWidth;
    setSwipeOffset(targetOffset);
    setTimeout(() => {
      setIsAnimating(false);
      setSwipeOffset(0);
      setViewIndex(nextIdx);
    }, 250);
  }, [data, isAnimating, viewIndex, resetZoom]);

  const closeViewer = useCallback((direction: "up" | "down" = "down") => {
    resetZoom();
    setIsAnimating(true);
    setSwipeYOffset(direction === "up" ? -window.innerHeight : window.innerHeight);
    const lastIdx = viewIndex;
    setTimeout(() => {
      setViewIndex(null);
      setSwipeOffset(0);
      setSwipeYOffset(0);
      setIsAnimating(false);
      if (lastIdx !== null && data) {
        const photo = data.photos[lastIdx];
        if (photo) {
          const el = document.querySelector(`[data-testid="shared-photo-${photo.id}"]`);
          el?.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    }, 200);
  }, [resetZoom, viewIndex, data]);

  const getTouchDist = (e: React.TouchEvent) => {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimating) return;
    if (e.touches.length === 2) {
      swipeDirection.current = "zoom";
      pinchStartDist.current = getTouchDist(e);
      pinchStartZoom.current = zoom;
      lastPanRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      return;
    }
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    if (zoom > 1) {
      swipeDirection.current = "zoom";
      lastPanRef.current = { x: touch.clientX, y: touch.clientY };
      return;
    }
    swipeDirection.current = null;
  }, [isAnimating, zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isAnimating) return;

    if (e.touches.length === 2) {
      swipeDirection.current = "zoom";
      const dist = getTouchDist(e);
      const newZoom = Math.min(5, Math.max(1, pinchStartZoom.current * (dist / pinchStartDist.current)));
      setZoom(newZoom);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      setPanX(prev => prev + (cx - lastPanRef.current.x));
      setPanY(prev => prev + (cy - lastPanRef.current.y));
      lastPanRef.current = { x: cx, y: cy };
      return;
    }

    if (swipeDirection.current === "zoom" && zoom > 1) {
      const touch = e.touches[0];
      setPanX(prev => prev + (touch.clientX - lastPanRef.current.x));
      setPanY(prev => prev + (touch.clientY - lastPanRef.current.y));
      lastPanRef.current = { x: touch.clientX, y: touch.clientY };
      return;
    }

    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    if (!swipeDirection.current) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        swipeDirection.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      }
      return;
    }

    if (swipeDirection.current === "horizontal") {
      const atEdge = (dx > 0 && viewIndex === 0) || (dx < 0 && viewIndex !== null && data && viewIndex === data.photos.length - 1);
      setSwipeOffset(atEdge ? dx * 0.3 : dx);
    } else {
      setSwipeYOffset(dy);
    }
  }, [isAnimating, zoom]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (isAnimating) return;

    if (swipeDirection.current === "zoom") {
      if (zoom <= 1.05) {
        resetZoom();
      }
      swipeDirection.current = null;
      touchStartRef.current = null;
      return;
    }

    if (!touchStartRef.current || viewIndex === null || !data) return;

    const elapsed = Date.now() - touchStartRef.current.time;
    const dx = Math.abs(swipeOffset);
    const dy = Math.abs(swipeYOffset);

    if (elapsed < 250 && dx < 10 && dy < 10 && e.changedTouches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        lastTapRef.current = 0;
        if (singleTapTimer.current) { clearTimeout(singleTapTimer.current); singleTapTimer.current = null; }
        if (zoom > 1) {
          resetZoom();
        } else {
          setZoom(2.5);
        }
        touchStartRef.current = null;
        swipeDirection.current = null;
        setSwipeOffset(0);
        setSwipeYOffset(0);
        return;
      }
      lastTapRef.current = now;
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null;
        if (zoom <= 1) closeViewer();
      }, 300);
    }

    const threshold = 60;
    const velocityThreshold = 0.3;

    if (swipeDirection.current === "horizontal") {
      const velocity = Math.abs(swipeOffset) / elapsed;
      const shouldSwipe = Math.abs(swipeOffset) > threshold || velocity > velocityThreshold;
      if (shouldSwipe) {
        const direction = swipeOffset > 0 ? "prev" : "next";
        const total = data.photos.length;
        const atStart = viewIndex === 0 && direction === "prev";
        const atEnd = viewIndex === total - 1 && direction === "next";
        if (atStart || atEnd) {
          setIsAnimating(true);
          setSwipeOffset(0);
          setTimeout(() => setIsAnimating(false), 200);
        } else {
          const nextIdx = direction === "next" ? viewIndex + 1 : viewIndex - 1;
          resetZoom();
          setIsAnimating(true);
          setSwipeOffset(direction === "next" ? -window.innerWidth : window.innerWidth);
          setTimeout(() => {
            setIsAnimating(false);
            setSwipeOffset(0);
            setViewIndex(nextIdx);
          }, 250);
        }
      } else {
        setIsAnimating(true);
        setSwipeOffset(0);
        setTimeout(() => setIsAnimating(false), 200);
      }
    } else if (swipeDirection.current === "vertical") {
      const velocity = Math.abs(swipeYOffset) / elapsed;
      if (Math.abs(swipeYOffset) > threshold || velocity > velocityThreshold) {
        closeViewer(swipeYOffset < 0 ? "up" : "down");
      } else {
        setSwipeYOffset(0);
      }
    }

    touchStartRef.current = null;
    swipeDirection.current = null;
  }, [isAnimating, viewIndex, data, swipeOffset, swipeYOffset, closeViewer, zoom, resetZoom]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="shared-photos-loading">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="shared-photos-error">
        <div className="text-center">
          <p className="text-lg font-medium">Photos not found</p>
          <p className="text-sm text-muted-foreground mt-1">This link may have expired or been removed.</p>
        </div>
      </div>
    );
  }

  const getLogoUrl = (logo: string) => {
    if (logo.startsWith("http://") || logo.startsWith("https://")) return logo;
    return logo.startsWith("/objects/") ? logo : `/objects/${logo}`;
  };

  return (
    <div className="min-h-screen bg-background" data-testid="shared-photos-page">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            {data.companyLogo && (
              <img
                src={getLogoUrl(data.companyLogo)}
                alt=""
                className="w-12 h-12 rounded-lg object-cover"
                data-testid="img-company-logo"
              />
            )}
            <div>
              {data.companyName && (
                <h1 className="text-lg font-semibold" data-testid="text-company-name">{data.companyName}</h1>
              )}
            </div>
          </div>
          <p className="text-sm text-foreground" data-testid="text-share-message">
            {data.companyName || "Your contractor"} shared {data.photos.length} photo{data.photos.length !== 1 ? "s" : ""} with you.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="shared-photo-grid">
          {data.photos.map((photo, idx) => (
            <div
              key={photo.id}
              className="rounded-lg overflow-hidden cursor-pointer active:opacity-80"
              onClick={() => setViewIndex(idx)}
              data-testid={`shared-photo-${photo.id}`}
            >
              <div className="aspect-square">
                <AnnotatedSharedImg
                  photo={photo}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {viewIndex !== null && (() => {
        const photo = data.photos[viewIndex];
        if (!photo) return null;
        const opacity = swipeYOffset !== 0 ? Math.max(0.3, 1 - Math.abs(swipeYOffset) / 300) : 1;
        return (
          <div
            className="fixed inset-0 z-50 flex flex-col touch-none select-none"
            style={{ backgroundColor: `rgba(0,0,0,${opacity})` }}
            data-testid="shared-photo-viewer"
          >
            <div className="flex items-center justify-between px-4 py-3 relative z-10">
              <span className="text-white/70 text-sm">{viewIndex + 1} / {data.photos.length}</span>
              <button
                type="button"
                onClick={closeViewer}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                data-testid="button-close-viewer"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <div
              className="flex-1 flex items-center justify-center relative overflow-hidden"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {data.photos.length > 1 && (
                <>
                  <button
                    type="button"
                    className="absolute left-2 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors z-10 hidden sm:block"
                    onClick={() => goToPhoto("prev")}
                    data-testid="button-prev-photo"
                  >
                    <ChevronLeft className="w-6 h-6 text-white" />
                  </button>
                  <button
                    type="button"
                    className="absolute right-2 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors z-10 hidden sm:block"
                    onClick={() => goToPhoto("next")}
                    data-testid="button-next-photo"
                  >
                    <ChevronRight className="w-6 h-6 text-white" />
                  </button>
                </>
              )}
              <div
                className="absolute inset-0 flex"
                style={{
                  transform: `translateX(${-viewIndex * window.innerWidth + swipeOffset + (zoom > 1 ? panX : 0)}px) translateY(${swipeYOffset + (zoom > 1 ? panY : 0)}px)`,
                  transition: isAnimating ? "transform 0.25s ease-out" : "none",
                }}
              >
                {data.photos.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex-shrink-0 flex items-center justify-center"
                    style={{ width: window.innerWidth, height: '100%' }}
                  >
                    <div
                      style={{
                        transform: i === viewIndex && zoom > 1 ? `scale(${zoom})` : 'none',
                        transformOrigin: 'center center',
                      }}
                    >
                      <AnnotatedSharedImg
                        photo={p}
                        className="max-w-[90vw] max-h-[80vh] object-contain pointer-events-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {photo.caption && (
              <div className="px-4 py-3 text-center relative z-10">
                <p className="text-white/80 text-sm" data-testid="text-photo-caption">{photo.caption}</p>
              </div>
            )}
          </div>
        );
      })()}

      <PoweredByFusePhone variant="dark" className="py-8" />
    </div>
  );
}
