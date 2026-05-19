import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { renderAnnotation, type Annotation } from "./PhotoEditor";

interface PhotoItem {
  id: number | string;
  fileName: string;
  storageKey: string;
  caption: string | null;
  annotations: any[] | null;
  annotatedStorageKey: string | null;
}

interface PhotoGalleryViewerProps {
  photos: PhotoItem[];
  initialIndex: number;
  onClose: () => void;
  onEdit?: (index: number) => void;
  onDelete?: (id: number | string) => void;
  onRename?: (id: number | string, newName: string) => void;
  canEditPhoto?: (index: number) => boolean;
}

function getPhotoUrl(photo: PhotoItem) {
  const key = photo.storageKey;
  if (key.startsWith("blob:") || key.startsWith("http://") || key.startsWith("https://")) return key;
  return key.startsWith("/objects/") ? key : `/objects/${key}`;
}

const EMPTY_ANNOTS: Annotation[] = [];

function AnnotatedPhoto({ photo, width }: { photo: PhotoItem; width: number }) {
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
      {!imgReady && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
        </div>
      )}
      <img
        ref={imgRef}
        src={getPhotoUrl(photo)}
        className="max-w-full max-h-full object-contain"
        style={{ opacity: imgReady ? 1 : 0, transition: "opacity 0.15s ease-in" }}
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

export function PhotoGalleryViewer({
  photos,
  initialIndex,
  onClose,
  onEdit,
  onDelete,
  onRename,
  canEditPhoto,
}: PhotoGalleryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [verticalOffset, setVerticalOffset] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeRef = useRef<{ startX: number; startY: number; locked: "h" | "v" | null; startTime: number; lastDx: number; lastDy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animatingRef = useRef(false);

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

  const photo = photos[currentIndex];

  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, [currentIndex]);

  useEffect(() => {
    for (let offset = -1; offset <= 1; offset++) {
      const idx = currentIndex + offset;
      if (idx >= 0 && idx < photos.length) {
        const img = new Image();
        img.src = getPhotoUrl(photos[idx]);
      }
    }
  }, [currentIndex, photos]);

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
      if (renaming) return;
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goPrev, goNext, onClose, renaming]);

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
        const idx = currentIndexRef.current;
        const atEdge = (dx > 0 && idx === 0) || (dx < 0 && idx === photos.length - 1);
        const dampened = atEdge ? dx * 0.3 : dx;
        swipeRef.current.lastDx = dx;
        setSwipeOffset(dampened);
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
          setTimeout(() => onClose(), 200);
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
  }, [photos.length, animateTo, onClose]);

  const handleDoubleTap = useCallback(() => {
    if (zoom > 1) {
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
    } else {
      setZoom(2.5);
    }
  }, [zoom]);

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
    <div ref={containerRef} className="fixed inset-0 z-[9999] flex flex-col overflow-hidden select-none" style={{ backgroundColor: `rgba(0,0,0,${bgOpacity})`, opacity: entered ? 1 : 0, transition: entered ? (dismissing ? "background-color 0.2s ease-out, opacity 0.15s" : "opacity 0.12s ease-out") : "none" }} data-testid="photo-gallery-overlay">
      <div data-no-swipe="true" className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 px-3 py-2" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)", paddingTop: "max(0.5rem, env(safe-area-inset-top, 0.5rem))", opacity: verticalOffset !== 0 ? 0 : 1, transition: "opacity 0.15s" }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
          className="flex-shrink-0 px-3 py-2 rounded-lg text-sm font-semibold bg-black/40 text-white active:bg-black/60 backdrop-blur-sm"
          data-testid="button-back"
          aria-label="Close"
        >
          Back
        </button>
        {(() => {
          // Friendly title: prefer caption, else fileName — but if fileName
          // looks URL-derived (full URL, blob/object URL, long random hash,
          // or just empty), fall back to "Photo N" so it never blows the
          // header layout or shows nonsense like a Twilio media URL.
          const raw = (photo.caption || photo.fileName || "").trim();
          const looksLikeUrl = /^https?:\/\//i.test(raw) || raw.startsWith("blob:") || raw.startsWith("data:") || raw.includes("/");
          const looksLikeHash = !raw.includes(".") && raw.length > 24 && /^[A-Za-z0-9_-]+$/.test(raw);
          const tooLong = raw.length > 60;
          const displayName = !raw || looksLikeUrl || looksLikeHash || tooLong
            ? `Photo ${currentIndex + 1}`
            : raw;
          return (
            <div
              className="flex-1 min-w-0 text-center px-1 cursor-pointer"
              onPointerDown={() => {
                if (!onRename) return;
                longPressRef.current = setTimeout(() => {
                  longPressRef.current = null;
                  setRenameValue(displayName);
                  setRenaming(true);
                  setTimeout(() => renameInputRef.current?.focus(), 100);
                }, 600);
              }}
              onPointerUp={() => { if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; } }}
              onPointerCancel={() => { if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; } }}
              onPointerLeave={() => { if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; } }}
            >
              <div className="flex items-center justify-center gap-1 min-w-0">
                <p className="text-white text-xs font-medium truncate drop-shadow min-w-0" data-testid="gallery-photo-name">{displayName}</p>
                {onRename && <span className="text-white/50 text-[10px] flex-shrink-0">✎</span>}
              </div>
              <p className="text-white/70 text-[10px] drop-shadow">{currentIndex + 1} / {photos.length}</p>
            </div>
          );
        })()}
        {onEdit && (!canEditPhoto || canEditPhoto(currentIndex)) && (
          <button
            onClick={() => onEdit(currentIndex)}
            className="flex-shrink-0 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600/90 text-white active:bg-blue-500 backdrop-blur-sm"
            data-testid="button-edit"
          >
            Edit
          </button>
        )}
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
          {photos.map((p, i) => {
            const nearby = Math.abs(i - currentIndex) <= 2;
            if (!nearby) return null;
            return (
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
                <AnnotatedPhoto photo={p} width={screenW} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.4), transparent)", paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))", opacity: verticalOffset !== 0 ? 0 : 1, transition: "opacity 0.15s" }}>
        {onDelete ? (
          <button
            onClick={() => onDelete(photo.id)}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-600/80 text-white active:bg-red-500 backdrop-blur-sm"
            data-testid="button-delete-viewer"
          >
            Delete
          </button>
        ) : <div />}
        <p className="text-white/80 text-xs drop-shadow">{currentIndex + 1} / {photos.length}</p>
        <div className="flex gap-2">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="w-9 h-9 rounded-full bg-black/40 text-white text-lg flex items-center justify-center backdrop-blur-sm disabled:opacity-25"
            data-testid="gallery-prev"
          >
            ‹
          </button>
          <button
            onClick={goNext}
            disabled={currentIndex === photos.length - 1}
            className="w-9 h-9 rounded-full bg-black/40 text-white text-lg flex items-center justify-center backdrop-blur-sm disabled:opacity-25"
            data-testid="gallery-next"
          >
            ›
          </button>
        </div>
      </div>

      {renaming && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setRenaming(false)}>
          <div className="bg-gray-900 rounded-2xl mx-6 max-w-sm w-full overflow-hidden border border-gray-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-3">
              <h3 className="text-base font-bold text-white mb-3">Rename Photo</h3>
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameValue.trim()) {
                    onRename?.(photo.id, renameValue.trim());
                    setRenaming(false);
                  }
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2.5 border border-gray-600 outline-none focus:border-blue-500"
                data-testid="input-rename"
              />
            </div>
            <div className="flex border-t border-gray-700">
              <button onClick={() => setRenaming(false)} className="flex-1 py-3 text-sm font-semibold text-gray-300 active:bg-gray-800 border-r border-gray-700">Cancel</button>
              <button
                onClick={() => { if (renameValue.trim()) { onRename?.(photo.id, renameValue.trim()); setRenaming(false); } }}
                className="flex-1 py-3 text-sm font-semibold text-blue-400 active:bg-blue-900/30"
                data-testid="button-confirm-rename"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
