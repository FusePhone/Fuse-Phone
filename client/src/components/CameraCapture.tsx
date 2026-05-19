import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

interface ExtendedCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
}

interface TorchConstraint extends MediaTrackConstraintSet {
  torch?: boolean;
}

interface ZoomConstraint extends MediaTrackConstraintSet {
  zoom?: number;
}

type FlashMode = "off" | "auto" | "on";
const FLASH_CYCLE: FlashMode[] = ["off", "auto", "on"];
const ZOOM_LEVELS = [0.5, 1, 2] as const;

function FlashIcon({ mode }: { mode: FlashMode }) {
  if (mode === "off") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        <line x1="2" y1="22" x2="22" y2="2" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const [count, setCount] = useState(0);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [flipping, setFlipping] = useState(false);
  const [flashMode, setFlashMode] = useState<FlashMode>("off");
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
  const flashModeRef = useRef<FlashMode>("off");
  flashModeRef.current = flashMode;

  const getVideoTrack = useCallback(() => {
    return streamRef.current?.getVideoTracks()[0] ?? null;
  }, []);

  const setTorch = useCallback(async (on: boolean) => {
    const track = getVideoTrack();
    if (!track) return;
    try {
      const constraint: TorchConstraint = { torch: on };
      await track.applyConstraints({ advanced: [constraint] });
    } catch {}
  }, [getVideoTrack]);

  const applyZoom = useCallback(async (level: number) => {
    const track = getVideoTrack();
    if (!track) return;
    try {
      const constraint: ZoomConstraint = { zoom: level };
      await track.applyConstraints({ advanced: [constraint] });
    } catch {}
  }, [getVideoTrack]);

  const detectCapabilities = useCallback((track: MediaStreamTrack) => {
    try {
      const caps = track.getCapabilities() as ExtendedCapabilities;
      setTorchSupported(!!caps.torch);
      if (caps.zoom) {
        setZoomSupported(true);
        setZoomRange({ min: caps.zoom.min, max: caps.zoom.max });
      } else {
        setZoomSupported(false);
        setZoomRange(null);
      }
    } catch {
      setTorchSupported(false);
      setZoomSupported(false);
      setZoomRange(null);
    }
  }, []);

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    const thisId = ++requestIdRef.current;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 4096 },
          height: { ideal: 4096 },
        },
        audio: false,
      });
      if (!mountedRef.current || thisId !== requestIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        const v = videoRef.current;
        v.srcObject = stream;
        // iOS WKWebView (Capacitor) and Mobile Safari frequently fail to
        // honor `autoPlay` for getUserMedia streams attached via
        // `srcObject`, especially when the <video> lives inside a
        // portal-rendered fixed overlay. The stream IS attached
        // (videoWidth / drawImage work, so capture succeeds and the
        // shutter flashes) but the live preview never starts rendering
        // and the user sees a black screen. Force the first frame by
        // explicitly calling .play() once metadata is ready, with one
        // retry — some WebKit builds reject the first play() call.
        const tryPlay = () => {
          v.play().catch(() => {
            setTimeout(() => { v.play().catch(() => {}); }, 100);
          });
        };
        if (v.readyState >= 1) {
          tryPlay();
        } else {
          v.onloadedmetadata = () => tryPlay();
        }
      }
      const vTrack = stream.getVideoTracks()[0];
      if (vTrack) {
        detectCapabilities(vTrack);
      }
      setFlashMode("off");
      setZoomLevel(1);
      setError(null);
    } catch {
      if (mountedRef.current && thisId === requestIdRef.current) {
        setError("Camera access denied. Please allow camera permissions.");
      }
    }
  }, [detectCapabilities]);

  useEffect(() => {
    mountedRef.current = true;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    startCamera(facingMode);
    return () => {
      mountedRef.current = false;
      requestIdRef.current++;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const flipCamera = useCallback(() => {
    if (flipping) return;
    setFlipping(true);
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next).finally(() => setFlipping(false));
  }, [facingMode, startCamera, flipping]);

  const cycleFlash = useCallback(() => {
    const idx = FLASH_CYCLE.indexOf(flashMode);
    const next = FLASH_CYCLE[(idx + 1) % FLASH_CYCLE.length];
    setFlashMode(next);
    if (next === "on") {
      setTorch(true);
    } else {
      setTorch(false);
    }
  }, [flashMode, setTorch]);

  const changeZoom = useCallback((level: number) => {
    if (!zoomRange) return;
    const clamped = Math.max(zoomRange.min, Math.min(zoomRange.max, level));
    setZoomLevel(clamped);
    applyZoom(clamped);
  }, [zoomRange, applyZoom]);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const currentFlashMode = flashModeRef.current;
    const needsTorch = currentFlashMode === "auto" || currentFlashMode === "on";

    const capture = () => {
      const c = document.createElement("canvas");
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      const ctx = c.getContext("2d")!;
      if (facingMode === "user") {
        ctx.translate(c.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0);
      c.toBlob(
        (blob) => {
          if (blob) {
            onCapture(blob);
            setCount((prev) => prev + 1);
            setShutterFlash(true);
            setTimeout(() => setShutterFlash(false), 150);
          }
          if (currentFlashMode === "auto") {
            setTorch(false);
          }
        },
        "image/jpeg",
        0.92
      );
    };

    if (needsTorch && torchSupported && currentFlashMode === "auto") {
      setTorch(true);
      setTimeout(capture, 120);
    } else {
      capture();
    }
  }, [onCapture, facingMode, torchSupported, setTorch]);

  const flashLabel = flashMode === "off" ? "" : flashMode === "auto" ? "A" : "";

  const content = error ? (
    <div className="fixed inset-0 z-[10002] bg-black flex flex-col items-center justify-center text-white gap-4 px-6">
      <span className="text-5xl">📷</span>
      <p className="text-sm text-center text-gray-300">{error}</p>
      <button onClick={onClose} className="px-5 py-2.5 rounded-lg bg-gray-700 text-sm font-semibold active:bg-gray-600" data-testid="button-camera-back">Go Back</button>
    </div>
  ) : (
    <div className="fixed inset-0 z-[10002] bg-black overflow-hidden select-none">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={facingMode === "user" ? { transform: "scaleX(-1)" } : undefined}
      />
      {shutterFlash && <div className="absolute inset-0 bg-white z-10 pointer-events-none" />}

      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4"
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)",
          paddingTop: "max(12px, env(safe-area-inset-top, 12px))",
          paddingBottom: "20px",
        }}
      >
        <button
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl text-sm font-bold bg-black/40 text-white active:bg-black/60 backdrop-blur-md min-w-[72px] shadow-lg"
          data-testid="button-camera-close"
        >
          Done{count > 0 ? ` (${count})` : ""}
        </button>

        <div className="flex items-center gap-3">
          {torchSupported && facingMode === "environment" && (
            <button
              onClick={cycleFlash}
              className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md active:scale-90 transition-transform relative shadow-lg ${flashMode === "on" ? "bg-yellow-400 text-black" : flashMode === "auto" ? "bg-black/40 text-white" : "bg-black/40 text-white"}`}
              data-testid="button-camera-flash"
            >
              <FlashIcon mode={flashMode} />
              {flashLabel && (
                <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-black leading-none bg-yellow-400 text-black rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {flashLabel}
                </span>
              )}
            </button>
          )}
          <button
            onClick={flipCamera}
            className="w-11 h-11 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-md active:scale-90 transition-transform shadow-lg"
            data-testid="button-camera-flip"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
              <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
              <polyline points="16 3 19 6 16 9" style={{ transform: "translateX(-3px)" }} />
              <polyline points="8 15 5 18 8 21" style={{ transform: "translateX(3px)" }} />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent)",
          paddingBottom: "max(16px, env(safe-area-inset-bottom, 16px))",
          paddingTop: "20px",
        }}
      >
        {zoomSupported && zoomRange && facingMode === "environment" && (
          <div className="flex items-center justify-center gap-2 mb-3">
            {ZOOM_LEVELS.filter(l => l >= zoomRange.min && l <= zoomRange.max).map((level) => {
              const active = Math.abs(zoomLevel - level) < 0.1;
              return (
                <button
                  key={level}
                  onClick={() => changeZoom(level)}
                  className={`w-10 h-10 rounded-full text-xs font-bold flex items-center justify-center transition-all shadow-lg ${active ? "bg-yellow-500/90 text-black scale-110" : "bg-black/40 text-white/80 backdrop-blur-md active:bg-black/50"}`}
                  data-testid={`button-camera-zoom-${level}`}
                >
                  {`${level}x`}
                </button>
              );
            })}
          </div>
        )}

        <div className="w-full px-4">
          <div className="grid grid-cols-3 items-center">
            <div className="flex justify-start">
              {count > 0 ? (
                <div className="w-12 h-12 rounded-xl bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg">
                  <span className="text-white text-sm font-bold">{count}</span>
                </div>
              ) : (
                <div className="w-12" />
              )}
            </div>

            <div className="flex justify-center">
              <button
                onClick={takePhoto}
                className="w-[72px] h-[72px] rounded-full border-[4px] border-white flex items-center justify-center active:scale-95 transition-transform shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                data-testid="button-camera-shutter"
              >
                <div className="w-[60px] h-[60px] rounded-full bg-white" />
              </button>
            </div>

            <div className="w-12" />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
