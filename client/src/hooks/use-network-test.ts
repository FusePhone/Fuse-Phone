import { useState, useRef, useCallback, useEffect } from "react";
import { Device, PreflightTest } from "@twilio/voice-sdk";
import { apiRequest } from "@/lib/queryClient";

export type NetworkQuality = "excellent" | "good" | "fair" | "poor" | "bad";
export type TestStatus = "idle" | "running" | "completed" | "failed";

export interface NetworkTestResult {
  quality: NetworkQuality;
  mos: number;
  jitter: number;
  rtt: number;
  packetsLost: number;
  packetsSent: number;
  packetLossPercent: number;
}

interface UseNetworkTestReturn {
  status: TestStatus;
  result: NetworkTestResult | null;
  error: string | null;
  runTest: () => void;
  cancelTest: () => void;
  progress: number;
}

function getQualityFromMos(mos: number): NetworkQuality {
  if (mos >= 4.0) return "excellent";
  if (mos >= 3.5) return "good";
  if (mos >= 3.0) return "fair";
  if (mos >= 2.5) return "poor";
  return "bad";
}

export function useNetworkTest(): UseNetworkTestReturn {
  const [status, setStatus] = useState<TestStatus>("idle");
  const [result, setResult] = useState<NetworkTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const testRef = useRef<PreflightTest | null>(null);
  const sampleCountRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (testRef.current) {
        testRef.current.stop();
        testRef.current = null;
      }
    };
  }, []);

  const cancelTest = useCallback(() => {
    if (testRef.current) {
      testRef.current.stop();
      testRef.current = null;
    }
    sampleCountRef.current = 0;
    if (mountedRef.current) {
      setStatus("idle");
      setProgress(0);
    }
  }, []);

  const runTest = useCallback(async () => {
    if (testRef.current) {
      testRef.current.stop();
      testRef.current = null;
    }

    setStatus("running");
    setResult(null);
    setError(null);
    setProgress(5);
    sampleCountRef.current = 0;

    let token: string | null = null;
    try {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch("/api/twilio/preflight-token");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to get preflight token");
      }
      token = data.token;
    } catch (err: any) {
      console.error("[NetworkTest] Token fetch error:", err);
      if (mountedRef.current) {
        const msg = err?.message || "Could not get connection token";
        setError(msg);
        setStatus("failed");
      }
      return;
    }

    if (!token) {
      if (mountedRef.current) {
        setError("Could not get connection token. Make sure Twilio is set up in your integrations.");
        setStatus("failed");
      }
      return;
    }

    if (!mountedRef.current) return;

    try {
      const test = Device.runPreflight(token, {
        fakeMicInput: true,
      });

      testRef.current = test;

      test.on("sample", () => {
        if (!mountedRef.current) return;
        sampleCountRef.current += 1;
        const estimatedTotal = 15;
        setProgress(Math.min(90, Math.round((sampleCountRef.current / estimatedTotal) * 100)));
      });

      test.on("completed", (report: any) => {
        testRef.current = null;
        if (!mountedRef.current) return;
        setProgress(100);

        const mos = report.stats?.mos?.average ?? 0;
        const jitter = report.stats?.jitter?.average ?? 0;
        const rtt = report.stats?.rtt?.average ?? 0;
        const packetsLost = report.totals?.packetsLost ?? 0;
        const packetsSent = report.totals?.packetsSent ?? 0;
        const packetLossPercent = packetsSent > 0 ? (packetsLost / packetsSent) * 100 : 0;

        setResult({
          quality: getQualityFromMos(mos),
          mos: Math.round(mos * 10) / 10,
          jitter: Math.round(jitter),
          rtt: Math.round(rtt),
          packetsLost,
          packetsSent,
          packetLossPercent: Math.round(packetLossPercent * 10) / 10,
        });
        setStatus("completed");
      });

      test.on("failed", (err: any) => {
        testRef.current = null;
        if (!mountedRef.current) return;
        console.error("[NetworkTest] Failed:", err);
        setError(err?.message || "Network test failed. Check your connection.");
        setStatus("failed");
        setProgress(0);
      });

    } catch (err: any) {
      if (mountedRef.current) {
        console.error("[NetworkTest] Setup error:", err);
        setError("Failed to start network test. Make sure Browser Calling is enabled.");
        setStatus("failed");
      }
    }
  }, []);

  return {
    status,
    result,
    error,
    runTest,
    cancelTest,
    progress,
  };
}
