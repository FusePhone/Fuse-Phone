import { useRef, useState, useCallback, useEffect } from "react";
import { useCameraOverlay } from "@/contexts/CameraOverlayContext";

const CAMERA_SIZES_PX = { small: 80, medium: 120, large: 160 };
const LONG_PRESS_MS = 400;

export function CameraOverlay() {
  const { isActive, cameraSize, facingMode, stream } = useCameraOverlay();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [position, setPosition] = useState({ x: -1, y: -1 });
  const [dragging, setDragging] = useState(false);
  const [dragUnlocked, setDragUnlocked] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef({ x: 0, y: 0 });

  const sizePx = CAMERA_SIZES_PX[cameraSize];

  useEffect(() => {
    if (position.x === -1 && position.y === -1) {
      setPosition({
        x: window.innerWidth - sizePx - 16,
        y: window.innerHeight - sizePx - 100,
      });
    }
  }, [isActive]);

  useEffect(() => {
    setPosition((prev) => ({
      x: Math.min(prev.x, window.innerWidth - sizePx - 8),
      y: Math.min(prev.y, window.innerHeight - sizePx - 8),
    }));
  }, [cameraSize]);

  const attachStream = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    }
  }, [stream]);

  // Re-attach whenever the underlying stream object changes (e.g. after a
  // reacquire because another camera consumer stole the lens). Depending on
  // `stream` (state) instead of a ref means this actually re-runs.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    } else if (!stream && el.srcObject) {
      el.srcObject = null;
    }
  }, [stream, facingMode]);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    dragStart.current = { x: touch.clientX, y: touch.clientY, posX: position.x, posY: position.y };

    longPressTimer.current = setTimeout(() => {
      setDragUnlocked(true);
      setDragging(true);
      if (navigator.vibrate) navigator.vibrate(30);
    }, LONG_PRESS_MS);
  }, [position]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);

    if (!dragUnlocked && (dx > 8 || dy > 8)) {
      clearLongPress();
      return;
    }

    if (!dragUnlocked || !dragging) return;

    e.preventDefault();
    e.stopPropagation();
    const moveX = touch.clientX - dragStart.current.x;
    const moveY = touch.clientY - dragStart.current.y;
    const newX = Math.max(0, Math.min(window.innerWidth - sizePx, dragStart.current.posX + moveX));
    const newY = Math.max(0, Math.min(window.innerHeight - sizePx, dragStart.current.posY + moveY));
    setPosition({ x: newX, y: newY });
  }, [dragging, dragUnlocked, sizePx]);

  const handleTouchEnd = useCallback(() => {
    clearLongPress();
    setDragging(false);
    setDragUnlocked(false);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragStart.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
    setDragging(true);
    setDragUnlocked(true);
  }, [position]);

  useEffect(() => {
    if (!dragging || !dragUnlocked) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      const newX = Math.max(0, Math.min(window.innerWidth - sizePx, dragStart.current.posX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - sizePx, dragStart.current.posY + dy));
      setPosition({ x: newX, y: newY });
    };
    const handleMouseUp = () => {
      setDragging(false);
      setDragUnlocked(false);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, dragUnlocked, sizePx]);

  useEffect(() => {
    return () => clearLongPress();
  }, []);

  if (!isActive) return null;

  return (
    <div
      ref={containerRef}
      className="fixed select-none"
      style={{
        left: position.x,
        top: position.y,
        width: sizePx,
        height: sizePx,
        zIndex: 2147483647,
        cursor: dragging ? "grabbing" : "default",
        touchAction: dragUnlocked ? "none" : "auto",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      } as React.CSSProperties}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="camera-overlay-bubble"
    >
      <div
        className="w-full h-full rounded-2xl overflow-hidden shadow-2xl bg-black transition-all duration-150"
        style={{
          border: dragUnlocked ? "3px solid rgba(228, 24, 29, 0.8)" : "2px solid rgba(255,255,255,0.4)",
          transform: dragUnlocked ? "scale(1.08)" : "scale(1)",
        }}
      >
        <video
          ref={attachStream}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover pointer-events-none"
          style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
        />
      </div>
    </div>
  );
}
