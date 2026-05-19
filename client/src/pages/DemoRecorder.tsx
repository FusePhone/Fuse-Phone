import { useState, useRef, useEffect } from "react";
import { Video, Camera, CameraOff, Circle, Square, FlipHorizontal, X, Download, Timer, Monitor, Minimize2, Maximize2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSubscription } from "@/hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";
import { useCameraOverlay } from "@/contexts/CameraOverlayContext";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

type CameraPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";
type CameraSize = "small" | "medium" | "large";

const CAMERA_SIZES_CANVAS = { small: 120, medium: 180, large: 260 };

const hasScreenCapture = typeof navigator !== "undefined"
  && typeof navigator.mediaDevices?.getDisplayMedia === "function";

export default function DemoRecorder() {
  const { isAdmin } = useSubscription();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const overlay = useCameraOverlay();

  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [duration, setDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);

  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number>(0);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAdmin) setLocation("/");
  }, [isAdmin]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isRecording) {
        stopDesktopRecording();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
      if (timerRef.current) clearInterval(timerRef.current);
      cancelAnimationFrame(animationFrameRef.current);
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    };
  }, []);

  if (!isAdmin) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const drawFrame = () => {
    const canvas = canvasRef.current;
    const screenVideo = screenVideoRef.current;
    const cameraVideo = cameraVideoRef.current;
    if (!canvas || !screenVideo) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = screenVideo.videoWidth || 1920;
    canvas.height = screenVideo.videoHeight || 1080;
    ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);

    if (cameraEnabled && cameraVideo && cameraVideo.readyState >= 2) {
      const size = CAMERA_SIZES_CANVAS[overlay.cameraSize];
      const padding = 24;
      const aspect = cameraVideo.videoWidth / cameraVideo.videoHeight || 4 / 3;
      const w = size;
      const h = size / aspect;

      let x = 0, y = 0;
      switch (overlay.cameraPosition) {
        case "bottom-right": x = canvas.width - w - padding; y = canvas.height - h - padding; break;
        case "bottom-left": x = padding; y = canvas.height - h - padding; break;
        case "top-right": x = canvas.width - w - padding; y = padding; break;
        case "top-left": x = padding; y = padding; break;
      }

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, w * 0.08);
      ctx.clip();
      ctx.drawImage(cameraVideo, x, y, w, h);
      ctx.restore();

      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, w * 0.08);
      ctx.stroke();
    }

    animationFrameRef.current = requestAnimationFrame(drawFrame);
  };

  const startDesktopRecording = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: true,
      });
      screenStreamRef.current = screenStream;

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = screenStream;
        await screenVideoRef.current.play();
      }

      screenStream.getVideoTracks()[0].addEventListener("ended", () => {
        stopDesktopRecording();
      });

      if (cameraEnabled) {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: overlay.facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
          });
          cameraStreamRef.current = camStream;
          if (cameraVideoRef.current) {
            cameraVideoRef.current.srcObject = camStream;
            await cameraVideoRef.current.play();
          }
        } catch (err) {
          console.error("[DemoRecorder] Camera error:", err);
          setCameraEnabled(false);
        }
      }

      drawFrame();

      const canvas = canvasRef.current;
      if (!canvas) return;

      const canvasStream = canvas.captureStream(30);
      const audioTracks = screenStream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks.forEach((t) => canvasStream.addTrack(t));
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";

      const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 8_000_000 });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
        const url = URL.createObjectURL(blob);
        recordedUrlRef.current = url;
        setRecordedUrl(url);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;

      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      setIsRecording(true);

      toast({ title: "Recording started", description: "Press Escape or come back here to stop" });
    } catch (err: any) {
      console.error("[DemoRecorder] Error starting:", err);
      if (err.name !== "NotAllowedError") {
        toast({ title: "Recording failed", description: err.message, variant: "destructive" });
      }
    }
  };

  const stopDesktopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    cancelAnimationFrame(animationFrameRef.current);
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    setIsRecording(false);
  };

  const handleStartMobileOverlay = async () => {
    await overlay.start(overlay.facingMode);
  };

  const downloadRecording = () => {
    if (!recordedUrl) return;
    const a = document.createElement("a");
    a.href = recordedUrl;
    const now = new Date();
    const ts = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}_${now.getHours().toString().padStart(2, "0")}-${now.getMinutes().toString().padStart(2, "0")}`;
    a.download = `FusePhone-Demo-${ts}.webm`;
    a.click();
    toast({ title: "Video saved!", description: "Check your downloads folder" });
  };

  const discardRecording = () => {
    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    recordedUrlRef.current = null;
    setRecordedUrl(null);
    setDuration(0);
  };

  return (
    <>
      <canvas ref={canvasRef} className="hidden" />
      <video ref={screenVideoRef} className="hidden" muted playsInline />
      <video ref={cameraVideoRef} className="hidden" muted playsInline />

      <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-demo-recorder-title">
            <Video className="w-6 h-6 text-primary" />
            Demo Recorder
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {hasScreenCapture
              ? "Record your screen with a camera overlay for demo videos"
              : "Show your face on screen while recording with iOS Screen Recording"}
          </p>
        </div>

        {!hasScreenCapture && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300 space-y-1.5">
            <div className="font-medium flex items-center gap-1.5">
              <Smartphone className="w-4 h-4" />
              Mobile Mode
            </div>
            <p>
              Activate the camera overlay below, then start screen recording from your iPhone's Control Center.
              Your face will appear in the recording. Navigate anywhere in the app — the camera bubble stays on screen and you can drag it around.
              Come back here to turn it off.
            </p>
          </div>
        )}

        {overlay.isActive && (
          <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                  <div>
                    <div className="font-semibold text-sm">Camera overlay active</div>
                    <div className="text-xs text-muted-foreground">Drag the bubble to reposition it</div>
                  </div>
                </div>
                <Button onClick={overlay.stop} variant="outline" className="gap-2" data-testid="button-stop-overlay">
                  <X className="w-4 h-4" />
                  Stop Overlay
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {hasScreenCapture && isRecording && (
          <Card className="border-red-500/50 bg-red-50 dark:bg-red-950/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <div>
                    <div className="font-semibold text-sm">Recording in progress</div>
                    <div className="font-mono text-lg">{formatTime(duration)}</div>
                  </div>
                </div>
                <Button onClick={stopDesktopRecording} variant="destructive" className="gap-2" data-testid="button-stop-recording">
                  <Square className="w-4 h-4 fill-current" />
                  Stop Recording
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Navigate to any page to record your demo. Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Esc</kbd> or come back here to stop.
                No controls will appear in the video.
              </p>
            </CardContent>
          </Card>
        )}

        {recordedUrl && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video className="w-5 h-5 text-primary" />
                  <span className="font-semibold text-sm">Recording Complete</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Timer className="w-3.5 h-3.5" />
                  {formatTime(duration)}
                </div>
              </div>
              <div className="rounded-lg overflow-hidden bg-black">
                <video src={recordedUrl} controls className="w-full max-h-64" />
              </div>
              <div className="flex gap-2">
                <Button onClick={downloadRecording} className="flex-1 gap-2" data-testid="button-download-recording">
                  <Download className="w-4 h-4" />
                  Save to Device
                </Button>
                <Button variant="outline" onClick={discardRecording} data-testid="button-discard-recording">
                  Discard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!isRecording && !recordedUrl && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="text-sm font-semibold">Camera Settings</div>
              <div className="space-y-3">
                {hasScreenCapture && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Camera overlay</span>
                    <Button
                      variant={cameraEnabled ? "default" : "outline"}
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => setCameraEnabled(!cameraEnabled)}
                      data-testid="button-toggle-camera"
                    >
                      {cameraEnabled ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
                      {cameraEnabled ? "On" : "Off"}
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Camera</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => {
                      const newMode = overlay.facingMode === "user" ? "environment" : "user";
                      if (overlay.isActive) {
                        overlay.flipCamera();
                      }
                    }}
                    data-testid="button-flip-camera"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    {overlay.facingMode === "user" ? "Front" : "Back"}
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Position</span>
                  <div className="grid grid-cols-4 gap-1">
                    {(["top-left", "top-right", "bottom-left", "bottom-right"] as CameraPosition[]).map((pos) => (
                      <button
                        key={pos}
                        onClick={() => overlay.setPosition(pos)}
                        className={cn(
                          "w-7 h-7 rounded border text-[9px] leading-none",
                          overlay.cameraPosition === pos ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border"
                        )}
                        data-testid={`button-camera-pos-${pos}`}
                      >
                        {pos === "top-left" ? "TL" : pos === "top-right" ? "TR" : pos === "bottom-left" ? "BL" : "BR"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Size</span>
                  <div className="flex gap-1">
                    {(["small", "medium", "large"] as CameraSize[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => overlay.setSize(s)}
                        className={cn(
                          "px-2.5 py-1 rounded border text-xs capitalize",
                          overlay.cameraSize === s ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border"
                        )}
                        data-testid={`button-camera-size-${s}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {hasScreenCapture ? (
                <>
                  <Button
                    onClick={startDesktopRecording}
                    className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white"
                    data-testid="button-start-recording"
                  >
                    <Circle className="w-4 h-4 fill-current" />
                    Start Recording
                  </Button>
                  <p className="text-[10px] text-muted-foreground text-center">
                    No controls will appear in your recording • Press Esc to stop
                  </p>
                </>
              ) : (
                <>
                  <Button
                    onClick={overlay.isActive ? overlay.stop : handleStartMobileOverlay}
                    className={cn("w-full gap-2", overlay.isActive ? "bg-gray-600 hover:bg-gray-700 text-white" : "bg-red-600 hover:bg-red-700 text-white")}
                    data-testid="button-toggle-camera-overlay"
                  >
                    {overlay.isActive ? (
                      <>
                        <X className="w-4 h-4" />
                        Stop Camera Overlay
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4" />
                        Show Camera Overlay
                      </>
                    )}
                  </Button>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Then start screen recording from iOS Control Center
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
