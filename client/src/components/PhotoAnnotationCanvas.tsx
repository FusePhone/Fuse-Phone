import { useState, useRef, useEffect } from "react";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface PhotoItem {
  id: number;
  fileName: string;
  storageKey: string;
  caption: string | null;
  annotations: any[] | null;
  annotatedStorageKey: string | null;
}

interface PhotoAnnotationCanvasProps {
  photos: PhotoItem[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  onSave: (photoId: number, annotations: any[], dataUrl: string) => void | Promise<void>;
  onCancel: () => void;
}

function getPhotoUrl(photo: PhotoItem) {
  const key = photo.annotatedStorageKey || photo.storageKey;
  return key.startsWith("/objects/") ? key : `/objects/${key}`;
}

export function PhotoAnnotationCanvas({
  photos,
  currentIndex,
  onNavigate,
  onCancel,
}: PhotoAnnotationCanvasProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [imageLoading, setImageLoading] = useState(true);

  const [swipeY, setSwipeY] = useState(0);
  const [swipeOpacity, setSwipeOpacity] = useState(1);
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const swipeDirection = useRef<"vertical" | "horizontal" | null>(null);

  const photo = photos[currentIndex];

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const el = overlayRef.current;
    if (el) {
      const block = (e: TouchEvent) => { e.preventDefault(); };
      el.addEventListener("touchmove", block, { passive: false });
      return () => {
        document.body.style.overflow = "";
        el.removeEventListener("touchmove", block);
      };
    }
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    setImageLoading(true);
  }, [currentIndex]);

  const handleNavigate = (dir: -1 | 1) => {
    const next = currentIndex + dir;
    if (next < 0 || next >= photos.length) return;
    onNavigate(next);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
      swipeDirection.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || touchStartY.current === null || touchStartX.current === null) return;

    const dy = e.touches[0].clientY - touchStartY.current;
    const dx = e.touches[0].clientX - touchStartX.current;

    if (swipeDirection.current === null) {
      if (Math.abs(dy) > 10 || Math.abs(dx) > 10) {
        swipeDirection.current = Math.abs(dy) > Math.abs(dx) ? "vertical" : "horizontal";
      } else {
        return;
      }
    }

    if (swipeDirection.current === "vertical") {
      setSwipeY(dy);
      const opacity = Math.max(0.2, 1 - Math.abs(dy) / 400);
      setSwipeOpacity(opacity);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (swipeDirection.current === "vertical") {
      if (Math.abs(swipeY) > 120) {
        onCancel();
      } else {
        setSwipeY(0);
        setSwipeOpacity(1);
      }
    } else if (swipeDirection.current === "horizontal" && touchStartX.current !== null) {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(dx) > 60) {
        handleNavigate(dx > 0 ? -1 : 1);
      }
    }

    touchStartY.current = null;
    touchStartX.current = null;
    swipeDirection.current = null;
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handleNavigate(-1);
      if (e.key === "ArrowRight") handleNavigate(1);
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  if (!photo) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[10000] bg-black flex flex-col touch-none"
      style={{ opacity: swipeOpacity, transition: swipeY === 0 ? "opacity 0.2s" : "none" }}
      data-testid="photo-gallery-overlay"
    >
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 bg-black/90 shrink-0"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top, 0.5rem))" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate text-white" data-testid="gallery-photo-name">
            {photo.caption || photo.fileName}
          </span>
          <span className="text-xs text-white/60 whitespace-nowrap">
            {currentIndex + 1} / {photos.length}
          </span>
        </div>
      </div>

      <div
        className="relative flex-1 flex items-center justify-center min-h-0 bg-black"
        style={{
          transform: `translateY(${swipeY}px)`,
          transition: swipeY === 0 ? "transform 0.2s ease-out" : "none",
          touchAction: "none",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {currentIndex > 0 && (
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/20 backdrop-blur-sm text-white active:bg-white/30"
            onClick={() => handleNavigate(-1)}
            data-testid="gallery-prev"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {currentIndex < photos.length - 1 && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/20 backdrop-blur-sm text-white active:bg-white/30"
            onClick={() => handleNavigate(1)}
            data-testid="gallery-next"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {imageLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-0">
            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
          </div>
        )}

        <img
          key={photo.id}
          src={getPhotoUrl(photo)}
          alt={photo.caption || photo.fileName}
          className="max-w-full max-h-full object-contain select-none"
          draggable={false}
          onLoad={() => setImageLoading(false)}
          onError={() => setImageLoading(false)}
          data-testid="gallery-fullscreen-image"
        />
      </div>
    </div>
  );
}
