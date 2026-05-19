import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, X, ZoomIn, Play, Volume2, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

type MediaItem = {
  url: string;
  type: 'image' | 'video' | 'audio';
};

function proxyUrl(url: string): string {
  if (url.includes('api.twilio.com')) {
    return `/api/twilio-media-proxy?url=${encodeURIComponent(url)}`;
  }
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.pathname.startsWith('/uploads/') || parsed.pathname.startsWith('/objects/')) {
      return parsed.pathname;
    }
  } catch {}
  return url;
}


function MediaImage({ src, alt, className, onClick, isOutbound, ...props }: {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
  isOutbound?: boolean;
  'data-testid'?: string;
  draggable?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg",
          isOutbound ? "bg-primary-foreground/20" : "bg-muted",
          className
        )}
        style={{ minWidth: 80, minHeight: 60 }}
        onClick={onClick}
        data-testid={props['data-testid']}
      >
        <div className="flex flex-col items-center gap-1 p-2">
          <ImageOff className={cn("w-6 h-6", isOutbound ? "text-primary-foreground/50" : "text-muted-foreground/50")} />
          <span className={cn("text-[10px]", isOutbound ? "text-primary-foreground/50" : "text-muted-foreground/50")}>
            Image unavailable
          </span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onClick={onClick}
      onError={() => setFailed(true)}
      data-testid={props['data-testid']}
      draggable={props.draggable}
    />
  );
}

interface MessageMediaCarouselProps {
  items: MediaItem[];
  isOutbound: boolean;
}

function getMediaType(url: string, contentType?: string): 'image' | 'video' | 'audio' {
  if (contentType) {
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'audio';
    if (contentType.startsWith('image/')) return 'image';
  }
  const lower = url.toLowerCase();
  if (/\.(mp4|mov|avi|webm|mkv|3gp)/.test(lower)) return 'video';
  if (/\.(mp3|wav|ogg|m4a|aac|flac)/.test(lower)) return 'audio';
  return 'image';
}

export function buildMediaItems(
  urls: string[],
  contentTypes?: string[] | null,
  fallbackType?: string | null
): MediaItem[] {
  if (!Array.isArray(urls)) return [];
  return urls.map((url, i) => ({
    url,
    type: contentTypes?.[i]
      ? getMediaType(url, contentTypes[i])
      : fallbackType === 'video' ? 'video'
      : fallbackType === 'audio' ? 'audio'
      : 'image',
  }));
}

export function MessageMediaCarousel({ items, isOutbound }: MessageMediaCarouselProps) {
  const imageItems = items.filter(i => i.type === 'image');
  const videoItems = items.filter(i => i.type === 'video');
  const audioItems = items.filter(i => i.type === 'audio');

  const [expandedImageIndex, setExpandedImageIndex] = useState<number | null>(null);
  const [activeVideoIndex, setActiveVideoIndex] = useState<number | null>(
    videoItems.length === 1 ? 0 : null
  );

  return (
    <>
      {imageItems.length > 0 && (
        <ImageSection
          items={imageItems}
          isOutbound={isOutbound}
          expandedIndex={expandedImageIndex}
          onExpand={setExpandedImageIndex}
          onClose={() => setExpandedImageIndex(null)}
        />
      )}

      {videoItems.length > 0 && (
        <VideoSection
          items={videoItems}
          isOutbound={isOutbound}
          activeIndex={activeVideoIndex}
          onActivate={setActiveVideoIndex}
        />
      )}

      {audioItems.map((item, i) => (
        <div key={`audio-${i}`} className="mt-2 flex items-center gap-2" data-testid={`audio-container-${i}`}>
          <Volume2 className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
          <audio
            controls
            className="max-w-full h-9"
            preload="metadata"
            data-testid={`audio-player-${i}`}
          >
            <source src={proxyUrl(item.url)} />
          </audio>
        </div>
      ))}
    </>
  );
}

function ImageSection({
  items,
  isOutbound,
  expandedIndex,
  onExpand,
  onClose,
}: {
  items: MediaItem[];
  isOutbound: boolean;
  expandedIndex: number | null;
  onExpand: (i: number) => void;
  onClose: () => void;
}) {
  const single = items.length === 1;
  const previewRef = useRef<HTMLDivElement>(null);

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchDeltaX, setTouchDeltaX] = useState(0);
  const [touchDeltaY, setTouchDeltaY] = useState(0);
  const [swipeAxis, setSwipeAxis] = useState<'x' | 'y' | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= items.length || isTransitioning) return;
    setIsTransitioning(true);
    onExpand(index);
    setTouchDeltaX(0);
    setTouchDeltaY(0);
    setSwipeAxis(null);
    setTimeout(() => setIsTransitioning(false), 300);
  }, [items.length, isTransitioning, onExpand]);

  const goNext = useCallback(() => {
    if (expandedIndex !== null && expandedIndex < items.length - 1) goTo(expandedIndex + 1);
  }, [expandedIndex, items.length, goTo]);

  const goPrev = useCallback(() => {
    if (expandedIndex !== null && expandedIndex > 0) goTo(expandedIndex - 1);
  }, [expandedIndex, goTo]);

  useEffect(() => {
    if (expandedIndex === null) return;

    const origOverflow = document.body.style.overflow;
    const origTouchAction = document.body.style.touchAction;
    const origPosition = document.body.style.position;
    const origTop = document.body.style.top;
    const origWidth = document.body.style.width;
    const scrollY = window.scrollY;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };

    window.addEventListener('keydown', handleKey);

    return () => {
      document.body.style.overflow = origOverflow;
      document.body.style.touchAction = origTouchAction;
      document.body.style.position = origPosition;
      document.body.style.top = origTop;
      document.body.style.width = origWidth;
      window.scrollTo(0, scrollY);
      window.removeEventListener('keydown', handleKey);
    };
  }, [expandedIndex, onClose, goNext, goPrev]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
    setTouchDeltaX(0);
    setTouchDeltaY(0);
    setSwipeAxis(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;

    let axis = swipeAxis;
    if (!axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      setSwipeAxis(axis);
    }

    if (axis === 'x') {
      const atEdge = (dx > 0 && expandedIndex === 0) || (dx < 0 && expandedIndex !== null && expandedIndex === items.length - 1);
      setTouchDeltaX(atEdge ? dx * 0.3 : dx);
      setTouchDeltaY(0);
    } else if (axis === 'y') {
      setTouchDeltaX(0);
      setTouchDeltaY(dy);
    }
  };

  const handleTouchEnd = () => {
    if (touchStartX === null || touchStartY === null) return;
    const threshold = 60;

    if (swipeAxis === 'x') {
      if (touchDeltaX < -threshold) goNext();
      else if (touchDeltaX > threshold) goPrev();
    } else if (swipeAxis === 'y') {
      if (Math.abs(touchDeltaY) > threshold) onClose();
    }

    setTouchStartX(null);
    setTouchStartY(null);
    setTouchDeltaX(0);
    setTouchDeltaY(0);
    setSwipeAxis(null);
  };

  return (
    <>
      {single ? (
        <div className="mt-2 relative group">
          <MediaImage
            src={proxyUrl(items[0].url)}
            alt="Attached image"
            className="max-w-[240px] max-h-[180px] rounded-lg cursor-pointer object-cover"
            onClick={() => onExpand(0)}
            data-testid="carousel-image-0"
            isOutbound={isOutbound}
          />
          <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
            <ZoomIn className="w-6 h-6 text-white drop-shadow-lg" />
          </div>
        </div>
      ) : (
        <div className="mt-2 -mx-1">
          <div
            ref={previewRef}
            className="flex gap-2 overflow-x-auto pb-2 px-1 snap-x snap-mandatory scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            data-testid="carousel-preview-strip"
          >
            {items.map((item, i) => (
              <div
                key={i}
                className="relative flex-shrink-0 snap-start group cursor-pointer"
                onClick={() => onExpand(i)}
                data-testid={`carousel-image-${i}`}
              >
                <MediaImage
                  src={proxyUrl(item.url)}
                  alt={`Image ${i + 1}`}
                  className="w-[120px] h-[90px] rounded-lg object-cover"
                  isOutbound={isOutbound}
                />
                <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                  <ZoomIn className="w-5 h-5 text-white drop-shadow-lg" />
                </div>
                {i === 0 && (
                  <div className="absolute bottom-1 right-1">
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      isOutbound
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-foreground/10 text-foreground"
                    )}>
                      1/{items.length}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {expandedIndex !== null && (
        <ImageExpandedViewer
          items={items}
          currentIndex={expandedIndex}
          onClose={onClose}
          onNext={goNext}
          onPrev={goPrev}
          onGoTo={goTo}
          touchDeltaX={touchDeltaX}
          touchDeltaY={touchDeltaY}
          swipeAxis={swipeAxis}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          modalRef={modalRef}
        />
      )}
    </>
  );
}

function ImageExpandedViewer({
  items,
  currentIndex,
  onClose,
  onNext,
  onPrev,
  onGoTo,
  touchDeltaX,
  touchDeltaY,
  swipeAxis,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  modalRef,
}: {
  items: MediaItem[];
  currentIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onGoTo: (index: number) => void;
  touchDeltaX: number;
  touchDeltaY: number;
  swipeAxis: 'x' | 'y' | null;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  modalRef: React.RefObject<HTMLDivElement | null>;
}) {
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;
  const currentItem = items[currentIndex];

  const dismissProgress = swipeAxis === 'y' ? Math.min(Math.abs(touchDeltaY) / 200, 1) : 0;
  const overlayOpacity = 0.9 * (1 - dismissProgress * 0.6);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center animate-in fade-in duration-200"
      style={{ backgroundColor: `rgba(0,0,0,${overlayOpacity})`, pointerEvents: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="carousel-expanded-overlay"
    >
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-3 safe-area-top">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          data-testid="button-close-carousel"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        {items.length > 1 && (
          <div className="text-white/80 text-sm font-medium bg-black/40 px-3 py-1 rounded-full" data-testid="text-carousel-counter">
            {currentIndex + 1} / {items.length}
          </div>
        )}

        <div className="w-10" />
      </div>

      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          data-testid="button-carousel-prev"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          data-testid="button-carousel-next"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      <div
        ref={modalRef}
        className="w-full h-full flex items-center justify-center overflow-hidden select-none touch-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex items-center justify-center"
          style={{
            transform: swipeAxis === 'x'
              ? `translateX(${touchDeltaX}px)`
              : swipeAxis === 'y'
              ? `translateY(${touchDeltaY}px) scale(${1 - dismissProgress * 0.15})`
              : 'none',
            transition: (touchDeltaX === 0 && touchDeltaY === 0) ? 'transform 0.3s ease-out' : 'none',
            opacity: swipeAxis === 'y' ? 1 - dismissProgress * 0.3 : 1,
          }}
        >
          <MediaImage
            src={proxyUrl(currentItem.url)}
            alt={`Image ${currentIndex + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg select-none"
            draggable={false}
            data-testid={`carousel-expanded-image-${currentIndex}`}
          />
        </div>
      </div>

      {items.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10" data-testid="carousel-dots">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onGoTo(i); }}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-200",
                i === currentIndex ? "bg-white w-4" : "bg-white/40 hover:bg-white/60"
              )}
              data-testid={`carousel-dot-${i}`}
            />
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}

function VideoSection({
  items,
  isOutbound,
  activeIndex,
  onActivate,
}: {
  items: MediaItem[];
  isOutbound: boolean;
  activeIndex: number | null;
  onActivate: (i: number | null) => void;
}) {
  if (items.length === 1) {
    return (
      <div className="mt-2 w-full" data-testid="video-container-0">
        <video
          src={proxyUrl(items[0].url)}
          className="w-full rounded-lg bg-black"
          controls
          playsInline
          preload="metadata"
          data-testid="video-player-0"
        />
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2" data-testid="video-strip">
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {items.map((item, i) => (
          <div key={i} className="flex-shrink-0" data-testid={`video-container-${i}`}>
            {activeIndex === i ? (
              <div>
                <video
                  src={proxyUrl(item.url)}
                  className="w-full max-w-[300px] rounded-lg bg-black"
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  data-testid={`video-player-${i}`}
                />
              </div>
            ) : (
              <div
                className="relative w-[140px] h-[100px] cursor-pointer rounded-lg overflow-hidden group"
                onClick={() => onActivate(i)}
                data-testid={`video-thumbnail-${i}`}
              >
                <video
                  src={proxyUrl(item.url)}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                    <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                  </div>
                </div>
                {i === 0 && items.length > 1 && (
                  <div className="absolute bottom-1 right-1">
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      isOutbound
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-foreground/10 text-foreground"
                    )}>
                      1/{items.length}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
