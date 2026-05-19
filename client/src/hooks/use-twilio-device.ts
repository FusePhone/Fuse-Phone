import { useState, useEffect, useRef, useCallback } from "react";
import { Device, Call } from "@twilio/voice-sdk";
import { apiRequest } from "@/lib/queryClient";

export type DeviceStatus = "offline" | "connecting" | "ready" | "error" | "incoming" | "on-call";

interface IncomingCallInfo {
  from: string;
  call: Call;
}

interface UseTwilioDeviceReturn {
  status: DeviceStatus;
  error: string | null;
  incomingCall: IncomingCallInfo | null;
  connect: () => void;
  disconnect: () => void;
  acceptCall: () => void;
  rejectCall: () => void;
  hangup: () => void;
  makeCall: (to: string) => Promise<void>;
  isConnected: boolean;
  deviceId: string;
}

function getDeviceId(): string {
  const key = "fuse_browser_device_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS Safari";
  if (/Android/.test(ua)) return "Android Chrome";
  if (/Mac/.test(ua)) return "Mac Desktop";
  if (/Windows/.test(ua)) return "Windows Desktop";
  if (/Linux/.test(ua)) return "Linux Desktop";
  return "Browser";
}

export function useTwilioDevice(enabled: boolean): UseTwilioDeviceReturn {
  const [status, setStatus] = useState<DeviceStatus>("offline");
  const [error, setError] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const tokenRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const enabledRef = useRef(enabled);
  const deviceId = useRef(getDeviceId()).current;
  const deviceName = useRef(getDeviceName()).current;

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const cleanup = useCallback((shouldReleaseDevice = false) => {
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (deviceRef.current) {
      deviceRef.current.destroy();
      deviceRef.current = null;
    }
    activeCallRef.current = null;
    setIncomingCall(null);
    setStatus("offline");
    setError(null);

    if (shouldReleaseDevice) {
      apiRequest("POST", "/api/twilio/browser-calling/release-device", { deviceId }).catch(() => {});
    }
  }, [deviceId]);

  const claimDevice = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiRequest("POST", "/api/twilio/browser-calling/claim-device", { deviceId, deviceName });
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 409) {
          setError(`Active on ${data.activeDeviceName || "another device"}. Disconnect there first.`);
          setStatus("error");
          return false;
        }
        setError(data.message || "Failed to claim device");
        setStatus("error");
        return false;
      }
      return true;
    } catch (err: any) {
      setError("Failed to register this device");
      setStatus("error");
      return false;
    }
  }, [deviceId, deviceName]);

  const fetchToken = useCallback(async (): Promise<string | null> => {
    try {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch("/api/twilio/voice-token");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to get voice token");
      }
      return data.token;
    } catch (err: any) {
      console.error("[TwilioDevice] Token fetch error:", err);
      setError(err?.message || "Failed to connect to call service");
      setStatus("error");
      return null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (deviceRef.current) {
      cleanup();
    }

    setStatus("connecting");
    setError(null);

    const claimed = await claimDevice();
    if (!claimed) return;

    const token = await fetchToken();
    if (!token) {
      retryTimerRef.current = setTimeout(() => {
        if (enabledRef.current) {
          connect();
        }
      }, 10000);
      return;
    }

    try {
      const device = new Device(token, {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        closeProtection: true,
        enableImplicitAccessTokenRefresh: true,
      });

      device.on("registered", () => {
        console.log("[TwilioDevice] Registered - ready for calls");
        setStatus("ready");
        setError(null);
      });

      device.on("unregistered", () => {
        console.log("[TwilioDevice] Unregistered");
        setStatus("offline");
      });

      device.on("error", (err: any) => {
        console.error("[TwilioDevice] Error:", err);
        setError(err.message || "Device error");
        setStatus("error");
        retryTimerRef.current = setTimeout(() => {
          if (enabledRef.current && !deviceRef.current) {
            connect();
          }
        }, 15000);
      });

      device.on("incoming", (call: Call) => {
        console.log("[TwilioDevice] Incoming call from:", call.parameters?.From);
        setIncomingCall({
          from: call.parameters?.From || "Unknown",
          call,
        });
        setStatus("incoming");

        call.on("cancel", () => {
          console.log("[TwilioDevice] Incoming call canceled");
          setIncomingCall(null);
          activeCallRef.current = null;
          setStatus("ready");
        });

        call.on("disconnect", () => {
          console.log("[TwilioDevice] Call disconnected");
          setIncomingCall(null);
          activeCallRef.current = null;
          setStatus("ready");
        });

        call.on("reject", () => {
          console.log("[TwilioDevice] Call rejected");
          setIncomingCall(null);
          activeCallRef.current = null;
          setStatus("ready");
        });
      });

      device.on("tokenWillExpire", async () => {
        console.log("[TwilioDevice] Token expiring, refreshing...");
        const newToken = await fetchToken();
        if (newToken && deviceRef.current) {
          deviceRef.current.updateToken(newToken);
        }
      });

      await device.register();
      deviceRef.current = device;

      tokenRefreshTimerRef.current = setTimeout(async () => {
        const newToken = await fetchToken();
        if (newToken && deviceRef.current) {
          deviceRef.current.updateToken(newToken);
        }
      }, 50 * 60 * 1000);

      heartbeatTimerRef.current = setInterval(async () => {
        try {
          const res = await apiRequest("POST", "/api/twilio/browser-calling/heartbeat", { deviceId });
          const data = await res.json();
          if (!data.active) {
            console.log("[TwilioDevice] Lost device claim, disconnecting");
            cleanup(false);
          }
        } catch {}
      }, 60 * 1000);

    } catch (err: any) {
      console.error("[TwilioDevice] Setup error:", err);
      setError(err.message || "Failed to set up call device");
      setStatus("error");
      retryTimerRef.current = setTimeout(() => {
        if (enabledRef.current) {
          connect();
        }
      }, 15000);
    }
  }, [fetchToken, cleanup, claimDevice, deviceId]);

  const disconnect = useCallback(async () => {
    cleanup(true);
  }, [cleanup]);

  const acceptCall = useCallback(() => {
    if (incomingCall?.call) {
      incomingCall.call.accept();
      activeCallRef.current = incomingCall.call;
      setStatus("on-call");
      setIncomingCall(null);
    }
  }, [incomingCall]);

  const rejectCall = useCallback(() => {
    if (incomingCall?.call) {
      incomingCall.call.reject();
      activeCallRef.current = null;
      setIncomingCall(null);
      setStatus("ready");
    }
  }, [incomingCall]);

  const hangup = useCallback(() => {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
      activeCallRef.current = null;
      setStatus("ready");
    }
    if (incomingCall?.call) {
      incomingCall.call.reject();
      setIncomingCall(null);
      setStatus("ready");
    }
  }, [incomingCall]);

  const makeCall = useCallback(async (to: string) => {
    if (!deviceRef.current) {
      setError("Browser calling not connected");
      return;
    }
    try {
      setStatus("on-call");
      const call = await deviceRef.current.connect({
        params: { To: to },
      });
      activeCallRef.current = call;

      call.on("disconnect", () => {
        activeCallRef.current = null;
        setStatus("ready");
      });

      call.on("cancel", () => {
        activeCallRef.current = null;
        setStatus("ready");
      });

      call.on("error", (err: any) => {
        console.error("[TwilioDevice] Outbound call error:", err);
        activeCallRef.current = null;
        setStatus("ready");
      });
    } catch (err: any) {
      console.error("[TwilioDevice] Make call error:", err);
      setError(err.message || "Failed to place call");
      setStatus("ready");
    }
  }, []);

  useEffect(() => {
    if (!enabled && deviceRef.current) {
      cleanup(true);
    }
  }, [enabled, cleanup]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (deviceRef.current) {
        const blob = new Blob([JSON.stringify({ deviceId })], { type: "application/json" });
        navigator.sendBeacon("/api/twilio/browser-calling/release-device", blob);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      cleanup();
    };
  }, [cleanup, deviceId]);

  return {
    status,
    error,
    incomingCall,
    connect,
    disconnect,
    acceptCall,
    rejectCall,
    hangup,
    makeCall,
    isConnected: status === "ready" || status === "incoming" || status === "on-call",
    deviceId,
  };
}
