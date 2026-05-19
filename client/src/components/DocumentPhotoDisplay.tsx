import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { renderAnnotation, type Annotation } from "./PhotoEditor";

const EMPTY_ANNOTS: Annotation[] = [];

interface DocumentPhoto {
  id: number;
  fileName: string;
  storageKey: string;
  caption: string | null;
  annotations: any[] | null;
  annotatedStorageKey: string | null;
  sortOrder: number;
}

interface ExtraPhoto {
  url: string;
  label?: string;
  annotations?: any[] | null;
}

interface DocumentPhotoDisplayProps {
  photos: DocumentPhoto[];
  extraPhotos?: ExtraPhoto[];
}

function getPhotoUrl(photo: DocumentPhoto) {
  const key = photo.storageKey;
  if (key.startsWith("http://") || key.startsWith("https://")) return key;
  return key.startsWith("/objects/") ? key : `/objects/${key}`;
}

function AnnotatedImg({ photo, className, style, ...rest }: { photo: DocumentPhoto; className?: string; style?: React.CSSProperties; "data-testid"?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  const annots = (photo.annotations as Annotation[] | null) || EMPTY_ANNOTS;
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
      try {
        renderAnnotation(ctx, ann);
      } catch (_e) {}
    }
  }, [imgLoaded, photo.annotations]);

  return (
    <div ref={containerRef} className="relative inline-block w-full h-full" style={style}>
      <img
        ref={imgRef}
        src={url}
        alt={photo.caption || photo.fileName}
        className={className}
        loading="lazy"
        onLoad={() => setImgLoaded(true)}
        data-testid={rest["data-testid"]}
      />
      {hasAnnotations && imgLoaded && (
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      )}
    </div>
  );
}

function FullscreenAnnotatedPhoto({ photo, width }: { photo: DocumentPhoto; width: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgReady, setImgReady] = useState(false);
  const imgSizeRef = useRef<{ w: number; h: number } | null>(null);
  const annotsRef = useRef(photo.annotations);
  annotsRef.current = photo.annotations;

  const annots = (photo.annotations as Annotation[] | null) || EMPTY_ANNOTS;
  const hasAnnotations = annots.length > 0;

  const drawAnnotations = useCallback(() => {
    const currentAnnots = (annotsRef.current as Annotation[] | null) || [];
    if (currentAnnots.length === 0) return;
    const canvas = canvasRef.current;
    const size = imgSizeRef.current;
    if (!canvas || !size) return;
    const container = canvas.parentElement;
    if (!container) return;
    const displayW = container.clientWidth;
    const displayH = container.clientHeight;
    if (displayW === 0 || displayH === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    canvas.style.width = displayW + "px";
    canvas.style.height = displayH + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sx = displayW / size.w;
    const sy = displayH / size.h;
    const scale = Math.min(sx, sy);
    const drawW = size.w * scale;
    const drawH = size.h * scale;
    const offsetX = (displayW - drawW) / 2;
    const offsetY = (displayH - drawH) / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    for (const ann of currentAnnots) {
      try {
        renderAnnotation(ctx, ann);
      } catch (_e) {}
    }
  }, []);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      imgSizeRef.current = { w: img.naturalWidth, h: img.naturalHeight };
      setImgReady(true);
      requestAnimationFrame(drawAnnotations);
    } else {
      setImgReady(false);
      imgSizeRef.current = null;
    }
  }, [photo.id, drawAnnotations]);

  useEffect(() => {
    if (imgReady) drawAnnotations();
  }, [imgReady, photo.annotations, drawAnnotations, width]);

  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    imgSizeRef.current = { w: img.naturalWidth, h: img.naturalHeight };
    setImgReady(true);
    requestAnimationFrame(drawAnnotations);
  }, [drawAnnotations]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <img
        ref={imgRef}
        src={getPhotoUrl(photo)}
        className="max-w-full max-h-full object-contain"
        alt={photo.caption || photo.fileName}
        draggable={false}
        onLoad={handleImgLoad}
      />
      {hasAnnotations && imgReady && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ width: "100%", height: "100%" }}
        />
      )}
    </div>
  );
}

function PhotoLightbox({ photos, initialIndex, onClose }: { photos: DocumentPhoto[]; initialIndex: number; onClose: (lastIndex: number) => void }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [verticalOffset, setVerticalOffset] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [entered, setEntered] = useState(false);
  const swipeRef = useRef<{ startX: number; startY: number; locked: "h" | "v" | null; startTime: number; lastDx: number; lastDy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animatingRef = useRef(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const pinchRef = useRef<{ dist: number; zoom: number; midX: number; midY: number; panX: number; panY: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const zoomRef = useRef(zoom);
  const panOffsetRef = useRef(panOffset);
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const photo = photos[currentIndex];

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, [currentIndex]);

  const animateTo = useCallback((targetIndex: number) => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    setAnimating(true);
    setCurrentIndex(targetIndex);
    setSwipeOffset(0);
    setTimeout(() => {
      setAnimating(false);
      animatingRef.current = false;
    }, 260);
  }, []);

  const goNext = useCallback(() => {
    if (currentIndexRef.current < photos.length - 1) animateTo(currentIndexRef.current + 1);
  }, [photos.length, animateTo]);

  const goPrev = useCallback(() => {
    if (currentIndexRef.current > 0) animateTo(currentIndexRef.current - 1);
  }, [animateTo]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "Escape") onClose(currentIndexRef.current);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goPrev, goNext, onClose]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const getTouchDist = (t: TouchList) => {
      const dx = t[1].clientX - t[0].clientX;
      const dy = t[1].clientY - t[0].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const resetGesture = () => {
      pinchRef.current = null;
      panStartRef.current = null;
      swipeRef.current = null;
      setSwipeOffset(0);
      setVerticalOffset(0);
    };

    const isInteractiveTarget = (target: EventTarget | null): boolean => {
      let node = target as HTMLElement | null;
      while (node && node !== el) {
        if (node.closest && node.closest('[data-no-swipe="true"]')) return true;
        const tag = node.tagName;
        if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        node = node.parentElement;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      if (animatingRef.current) return;
      if (isInteractiveTarget(e.target)) {
        swipeRef.current = null;
        pinchRef.current = null;
        panStartRef.current = null;
        return;
      }
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        pinchRef.current = { dist, zoom: zoomRef.current, midX, midY, panX: panOffsetRef.current.x, panY: panOffsetRef.current.y };
        swipeRef.current = null;
        return;
      }
      if (e.touches.length !== 1) return;
      if (zoomRef.current > 1) {
        panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX: panOffsetRef.current.x, panY: panOffsetRef.current.y };
        swipeRef.current = null;
      } else {
        swipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, locked: null, startTime: Date.now(), lastDx: 0, lastDy: 0 };
      }
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        const newZoom = Math.max(1, Math.min(5, pinchRef.current.zoom * (dist / pinchRef.current.dist)));
        setZoom(newZoom);
        if (newZoom > 1) {
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          setPanOffset({
            x: pinchRef.current.panX + (midX - pinchRef.current.midX),
            y: pinchRef.current.panY + (midY - pinchRef.current.midY),
          });
        } else {
          setPanOffset({ x: 0, y: 0 });
        }
        return;
      }
      if (panStartRef.current && e.touches.length === 1 && zoomRef.current > 1) {
        e.preventDefault();
        const dx = e.touches[0].clientX - panStartRef.current.x;
        const dy = e.touches[0].clientY - panStartRef.current.y;
        setPanOffset({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
        return;
      }
      if (!swipeRef.current || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - swipeRef.current.startX;
      const dy = e.touches[0].clientY - swipeRef.current.startY;
      if (!swipeRef.current.locked) {
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          swipeRef.current.locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        }
      }
      if (swipeRef.current.locked === "h") {
        e.preventDefault();
        swipeRef.current.lastDx = dx;
        setSwipeOffset(dx);
      }
      if (swipeRef.current.locked === "v") {
        swipeRef.current.lastDy = dy;
        setVerticalOffset(dy);
      }
    };

    const onEnd = () => {
      if (pinchRef.current) {
        pinchRef.current = null;
        return;
      }
      if (panStartRef.current) {
        panStartRef.current = null;
        return;
      }
      if (!swipeRef.current) return;
      const dx = swipeRef.current.lastDx;
      const dy = swipeRef.current.lastDy;
      const elapsed = Date.now() - swipeRef.current.startTime;

      if (swipeRef.current.locked === "v") {
        const vVelocity = Math.abs(dy) / Math.max(elapsed, 1);
        const vThreshold = vVelocity > 0.4 ? 40 : window.innerHeight * 0.2;
        if (Math.abs(dy) > vThreshold) {
          setDismissing(true);
          setVerticalOffset(dy > 0 ? window.innerHeight : -window.innerHeight);
          setTimeout(() => onCloseRef.current(currentIndexRef.current), 200);
        } else {
          setVerticalOffset(0);
        }
        swipeRef.current = null;
        return;
      }

      const velocity = Math.abs(dx) / Math.max(elapsed, 1);
      const threshold = velocity > 0.5 ? 30 : window.innerWidth * 0.25;
      const idx = currentIndexRef.current;
      if (dx < -threshold && idx < photos.length - 1) animateTo(idx + 1);
      else if (dx > threshold && idx > 0) animateTo(idx - 1);
      swipeRef.current = null;
      setSwipeOffset(0);
      setTimeout(() => setAnimating(false), 250);
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", resetGesture, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", resetGesture);
    };
  }, [photos.length, animateTo]);

  const handleDoubleTap = useCallback(() => {
    if (zoomRef.current > 1) {
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
    } else {
      setZoom(2.5);
    }
  }, []);

  const lastTapRef = useRef(0);
  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      handleDoubleTap();
    }
    lastTapRef.current = now;
  }, [handleDoubleTap]);

  if (!photo) return null;

  const screenW = typeof window !== "undefined" ? window.innerWidth : 400;
  const trackOffset = -currentIndex * screenW + swipeOffset;

  const bgOpacity = verticalOffset !== 0 ? Math.max(0.3, 1 - Math.abs(verticalOffset) / (window.innerHeight * 0.5)) : 1;

  return createPortal(
    <div ref={containerRef} className="fixed inset-0 z-[9999] flex flex-col overflow-hidden select-none" style={{ backgroundColor: `rgba(0,0,0,${bgOpacity})`, opacity: entered ? 1 : 0, transition: entered ? (dismissing ? "background-color 0.2s ease-out, opacity 0.15s" : "opacity 0.12s ease-out") : "none" }} data-testid="portal-photo-lightbox">
      <div data-no-swipe="true" className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 py-2" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)", paddingTop: "max(0.5rem, env(safe-area-inset-top, 0.5rem))", opacity: verticalOffset !== 0 ? 0 : 1, transition: "opacity 0.15s" }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(currentIndex); }}
          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onClose(currentIndex); }}
          className="w-11 h-11 flex items-center justify-center rounded-full bg-white text-gray-900 shadow-[0_4px_16px_rgba(0,0,0,0.35)] ring-1 ring-black/10 active:scale-95 transition-transform"
          data-testid="portal-lightbox-close"
          aria-label="Close photo"
        >
          <X className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <p className="text-white/90 text-xs font-medium drop-shadow">{currentIndex + 1} / {photos.length}</p>
        <div className="w-11" />
      </div>

      <div className="flex-1 relative overflow-hidden" onClick={handleTap}>
        <div
          className="absolute inset-0"
          style={{
            transform: `translateX(${trackOffset}px) translateY(${verticalOffset}px)`,
            transition: animating || dismissing ? "transform 0.25s ease-out" : verticalOffset === 0 && !dismissing ? "transform 0.15s ease-out" : "none",
            willChange: "transform",
          }}
        >
          {photos.map((p, i) => (
            <div
              key={p.id}
              className="absolute inset-0 flex items-center justify-center"
              style={{
                transform: i === currentIndex
                  ? `translateX(${i * screenW}px) scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`
                  : `translateX(${i * screenW}px)`,
                transition: i === currentIndex && zoom === 1 && panOffset.x === 0 && panOffset.y === 0 ? "transform 0.2s ease-out" : "none",
              }}
            >
              <FullscreenAnnotatedPhoto photo={p} width={screenW} />
            </div>
          ))}
        </div>
      </div>

      {photo.caption && verticalOffset === 0 && (
        <div className="absolute bottom-0 left-0 right-0 z-20 text-center px-4 py-3" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.4), transparent)", paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))" }}>
          <p className="text-white/90 text-sm drop-shadow">{photo.caption}</p>
        </div>
      )}
    </div>,
    document.body
  );
}

export function DocumentPhotoDisplay({ photos, extraPhotos = [] }: DocumentPhotoDisplayProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lastViewedIndex, setLastViewedIndex] = useState<number | null>(null);

  const extraAsDocPhotos: DocumentPhoto[] = extraPhotos.map((ep, i) => ({
    id: -(i + 1),
    fileName: ep.label || `Photo ${i + 1}`,
    storageKey: ep.url,
    caption: ep.label || null,
    annotations: ep.annotations || null,
    annotatedStorageKey: null,
    sortOrder: photos.length + i,
  }));

  const allPhotos = [...photos, ...extraAsDocPhotos];

  if (!allPhotos || allPhotos.length === 0) return null;

  return (
    <>
      <div className="mt-8 pt-6 border-t">
        <h3 className="text-lg font-semibold mb-4" data-testid="photos-section-title">Photos</h3>
        <div className="grid grid-cols-4 gap-1.5" data-testid="portal-photo-grid">
          {allPhotos.map((photo, idx) => (
            <button
              key={`${photo.id}-${idx}`}
              type="button"
              className={`relative aspect-square rounded-lg overflow-hidden border-2 active:opacity-80 transition-all ${
                lastViewedIndex === idx
                  ? "border-primary ring-1 ring-primary/30"
                  : "border-gray-200 dark:border-gray-700"
              }`}
              onClick={() => setLightboxIndex(idx)}
              data-testid={`portal-photo-thumb-${photo.id}`}
            >
              <AnnotatedImg
                photo={photo}
                className="w-full h-full object-cover"
                data-testid={`portal-photo-thumb-img-${photo.id}`}
              />
            </button>
          ))}
        </div>
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={allPhotos}
          initialIndex={lightboxIndex}
          onClose={(lastIdx) => {
            setLightboxIndex(null);
            setLastViewedIndex(lastIdx);
          }}
        />
      )}
    </>
  );
}
