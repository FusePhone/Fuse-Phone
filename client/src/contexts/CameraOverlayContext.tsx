import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

type CameraPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";
type CameraSize = "small" | "medium" | "large";

interface CameraOverlayState {
  isActive: boolean;
  cameraPosition: CameraPosition;
  cameraSize: CameraSize;
  facingMode: "user" | "environment";
  streamRef: React.MutableRefObject<MediaStream | null>;
  stream: MediaStream | null;
  start: (facingMode?: "user" | "environment") => Promise<boolean>;
  stop: () => void;
  setPosition: (pos: CameraPosition) => void;
  setSize: (size: CameraSize) => void;
  flipCamera: () => Promise<void>;
}

const CameraOverlayContext = createContext<CameraOverlayState | null>(null);

const VIDEO_CONSTRAINTS = { width: { ideal: 640 }, height: { ideal: 480 } };

export function CameraOverlayProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [isActive, setIsActive] = useState(false);
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>("bottom-right");
  const [cameraSize, setCameraSize] = useState<CameraSize>("medium");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Latest values, available inside async listeners that capture stale closures.
  const isActiveRef = useRef(false);
  const facingModeRef = useRef<"user" | "environment">("user");
  const reacquireInFlight = useRef(false);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { facingModeRef.current = facingMode; }, [facingMode]);

  const stopStream = useCallback((s: MediaStream | null) => {
    if (!s) return;
    try { s.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
  }, []);

  const acquireStream = useCallback(async (mode: "user" | "environment") => {
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: mode, ...VIDEO_CONSTRAINTS },
      audio: false,
    });
  }, []);

  // Wire ended-listeners on every track so we can detect the OS yanking the
  // camera (another consumer like the native camera grabs the same lens).
  const wireTrackListeners = useCallback((s: MediaStream) => {
    s.getTracks().forEach((track) => {
      track.onended = () => {
        // Only reacquire if the bubble is still supposed to be on AND no
        // reacquire is already in flight.
        if (!isActiveRef.current || reacquireInFlight.current) return;
        // Any track of *this* stream ended — try to reclaim the camera.
        // The other consumer may still be holding it; in that case we'll
        // retry on next visibility / appStateChange event.
        void tryReacquire();
      };
    });
  }, []);

  const setActiveStream = useCallback((s: MediaStream | null) => {
    streamRef.current = s;
    setStream(s);
    if (s) wireTrackListeners(s);
  }, [wireTrackListeners]);

  const tryReacquire = useCallback(async () => {
    if (reacquireInFlight.current) return;
    if (!isActiveRef.current) return;

    // Skip if current stream still has a live video track.
    const cur = streamRef.current;
    if (cur) {
      const live = cur.getVideoTracks().some((t) => t.readyState === "live");
      if (live) return;
    }

    reacquireInFlight.current = true;
    try {
      // Release any dead tracks before requesting again.
      stopStream(streamRef.current);
      streamRef.current = null;
      const fresh = await acquireStream(facingModeRef.current);
      // Re-check after the await: the user may have called stop() while the
      // request was in flight. Without this guard the camera would stay live
      // even though the overlay is off — a privacy-sensitive leak.
      if (!isActiveRef.current) {
        stopStream(fresh);
        return;
      }
      setActiveStream(fresh);
    } catch (err) {
      // Most common failure: the other consumer (native camera) still owns
      // the lens. Stay silent; visibilitychange / appStateChange will retry
      // when the user dismisses the other camera UI.
      console.warn("[CameraOverlay] Reacquire failed (will retry on focus):", err);
    } finally {
      reacquireInFlight.current = false;
    }
  }, [acquireStream, setActiveStream, stopStream]);

  const start = useCallback(async (mode?: "user" | "environment") => {
    const fm = mode || facingModeRef.current;
    try {
      const fresh = await acquireStream(fm);
      // Replace any existing stream cleanly.
      stopStream(streamRef.current);
      setFacingMode(fm);
      facingModeRef.current = fm;
      setActiveStream(fresh);
      setIsActive(true);
      isActiveRef.current = true;
      return true;
    } catch (err) {
      console.error("[CameraOverlay] Camera error:", err);
      toast({ title: "Camera not available", description: "Could not access camera", variant: "destructive" });
      return false;
    }
  }, [acquireStream, setActiveStream, stopStream, toast]);

  const stop = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setIsActive(false);
    isActiveRef.current = false;
  }, [stopStream]);

  const flipCamera = useCallback(async () => {
    const newMode = facingMode === "user" ? "environment" : "user";
    try {
      const fresh = await acquireStream(newMode);
      stopStream(streamRef.current);
      setFacingMode(newMode);
      facingModeRef.current = newMode;
      setActiveStream(fresh);
    } catch (err) {
      console.error("[CameraOverlay] Camera flip error:", err);
    }
  }, [acquireStream, facingMode, setActiveStream, stopStream]);

  // Reacquire when returning to the page/app — covers the case where another
  // camera consumer (in-app camera, native Capture, system Camera app) was
  // foreground and stole the lens. The browser/OS commonly ends our tracks
  // silently in that scenario.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && isActiveRef.current) {
        // Defer one tick; some browsers report "visible" before the camera
        // is actually released to us.
        setTimeout(() => { void tryReacquire(); }, 250);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);

    // Capacitor native: app resumes after returning from native camera.
    // The dynamic import is async; track a `disposed` flag so that if the
    // provider unmounts before the import resolves we never leak a listener.
    let disposed = false;
    let removeAppListener: (() => void) | undefined;
    const Capacitor = (window as any).Capacitor;
    if (Capacitor?.isNativePlatform?.()) {
      import("@capacitor/app").then(({ App }) => {
        if (disposed) return; // unmounted before import resolved
        // addListener returns a Promise<PluginListenerHandle> in newer
        // versions, a handle directly in older ones. Handle both.
        const handlePromise = Promise.resolve(
          App.addListener("appStateChange", (state: { isActive: boolean }) => {
            if (state.isActive && isActiveRef.current) {
              setTimeout(() => { void tryReacquire(); }, 300);
            }
          }),
        );
        removeAppListener = () => {
          handlePromise.then((h: any) => h?.remove?.()).catch(() => {});
        };
        // If we were disposed *during* the addListener async hop, remove now.
        if (disposed) removeAppListener();
      }).catch(() => { /* plugin missing — non-fatal */ });
    }

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
      removeAppListener?.();
    };
  }, [tryReacquire]);

  return (
    <CameraOverlayContext.Provider value={{
      isActive,
      cameraPosition,
      cameraSize,
      facingMode,
      streamRef,
      stream,
      start,
      stop,
      setPosition: setCameraPosition,
      setSize: setCameraSize,
      flipCamera,
    }}>
      {children}
    </CameraOverlayContext.Provider>
  );
}

export function useCameraOverlay() {
  const ctx = useContext(CameraOverlayContext);
  if (!ctx) throw new Error("useCameraOverlay must be used within CameraOverlayProvider");
  return ctx;
}
