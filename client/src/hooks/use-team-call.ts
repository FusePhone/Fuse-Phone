import { useState, useEffect, useRef, useCallback } from "react";

export type CallState = "idle" | "ringing-outgoing" | "ringing-incoming" | "connecting" | "connected" | "ended";

interface CallerInfo {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  profileImageUrl: string | null;
}

interface UseTeamCallOptions {
  userId: string;
  companyOwnerId: string;
  enabled: boolean;
  onMicDenied?: () => void;
}

interface UseTeamCallReturn {
  callState: CallState;
  currentCallId: string | null;
  remotePeer: CallerInfo | null;
  callDuration: number;
  isMuted: boolean;
  isConference: boolean;
  isHost: boolean;
  participantCount: number;
  startCall: (calleeId: string, channelId?: number) => void;
  startConferenceCall: (calleeIds: string[], channelId?: number) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  endConference: () => void;
  toggleMute: () => void;
  isConnected: boolean;
}

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function useTeamCall({ userId, companyOwnerId, enabled, onMicDenied }: UseTeamCallOptions): UseTeamCallReturn {
  const [callState, setCallState] = useState<CallState>("idle");
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [remotePeer, setRemotePeer] = useState<CallerInfo | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConference, setIsConference] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const mixedDestsRef = useRef<Map<string, MediaStreamAudioDestinationNode>>(new Map());
  const remoteSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const localSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const disconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE_SERVERS);
  const onMicDeniedRef = useRef(onMicDenied);
  onMicDeniedRef.current = onMicDenied;

  const fetchIceServers = useCallback(async () => {
    try {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch("/api/team/ice-servers");
      if (res.ok) {
        const data = await res.json();
        if (data.iceServers?.length) {
          iceServersRef.current = data.iceServers;
        }
      }
    } catch {}
  }, []);

  const callStateRef = useRef(callState);
  callStateRef.current = callState;
  const currentCallIdRef = useRef(currentCallId);
  currentCallIdRef.current = currentCallId;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  const cleanup = useCallback(() => {
    for (const [, pc] of peerConnectionsRef.current) {
      pc.close();
    }
    peerConnectionsRef.current.clear();

    for (const [, audio] of audioElementsRef.current) {
      audio.pause();
      audio.srcObject = null;
    }
    audioElementsRef.current.clear();

    for (const [, dest] of mixedDestsRef.current) {
      try { dest.disconnect(); } catch {}
    }
    mixedDestsRef.current.clear();

    for (const [, src] of remoteSourcesRef.current) {
      try { src.disconnect(); } catch {}
    }
    remoteSourcesRef.current.clear();

    if (localSourceRef.current) {
      try { localSourceRef.current.disconnect(); } catch {}
      localSourceRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    for (const [, timer] of disconnectTimersRef.current) {
      clearTimeout(timer);
    }
    disconnectTimersRef.current.clear();
    setCallDuration(0);
    setIsMuted(false);
    setParticipantCount(0);
    setIsConference(false);
    setIsHost(false);
  }, []);

  const sendWs = useCallback((msg: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    return stream;
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const rebuildMixForPeer = useCallback((peerId: string) => {
    const ctx = audioContextRef.current;
    if (!ctx) return null;

    const existingDest = mixedDestsRef.current.get(peerId);
    if (existingDest) {
      try { existingDest.disconnect(); } catch {}
    }

    const dest = ctx.createMediaStreamDestination();
    mixedDestsRef.current.set(peerId, dest);

    if (localSourceRef.current) {
      try { localSourceRef.current.connect(dest); } catch {}
    }

    for (const [srcPeerId, source] of remoteSourcesRef.current) {
      if (srcPeerId !== peerId) {
        try { source.connect(dest); } catch {}
      }
    }

    return dest.stream;
  }, []);

  const handlePeerDisconnect = useCallback((peerId: string) => {
    const existingTimer = disconnectTimersRef.current.get(peerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      disconnectTimersRef.current.delete(peerId);
    }

    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) { pc.close(); peerConnectionsRef.current.delete(peerId); }

    const audioEl = audioElementsRef.current.get(peerId);
    if (audioEl) { audioEl.pause(); audioEl.srcObject = null; audioElementsRef.current.delete(peerId); }

    const src = remoteSourcesRef.current.get(peerId);
    if (src) { try { src.disconnect(); } catch {} remoteSourcesRef.current.delete(peerId); }

    const dest = mixedDestsRef.current.get(peerId);
    if (dest) { try { dest.disconnect(); } catch {} mixedDestsRef.current.delete(peerId); }

    const remaining = Array.from(peerConnectionsRef.current.values()).filter(
      p => p.connectionState === "connected"
    ).length;
    setParticipantCount(remaining + 1);

    if (remaining === 0 && callStateRef.current === "connected") {
      setCallState("ended");
      cleanup();
      setTimeout(() => { setCallState("idle"); setCurrentCallId(null); setRemotePeer(null); }, 2000);
    }
  }, [cleanup]);

  const createHostPeerConnection = useCallback((peerId: string, callId: string) => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWs({ type: "ice-candidate", callId, targetUserId: peerId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      const ctx = ensureAudioContext();
      const remoteStream = event.streams[0];
      if (remoteStream) {
        const source = ctx.createMediaStreamSource(remoteStream);
        remoteSourcesRef.current.set(peerId, source);

        for (const [existingPeerId] of peerConnectionsRef.current) {
          if (existingPeerId !== peerId) {
            const dest = mixedDestsRef.current.get(existingPeerId);
            if (dest) {
              try { source.connect(dest); } catch {}
            }
          }
        }

        const localAudio = new Audio();
        localAudio.srcObject = remoteStream;
        localAudio.play().catch(() => {});
        audioElementsRef.current.set(peerId, localAudio);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        const existingTimer = disconnectTimersRef.current.get(peerId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          disconnectTimersRef.current.delete(peerId);
        }
        const connectedCount = Array.from(peerConnectionsRef.current.values()).filter(
          p => p.connectionState === "connected"
        ).length;
        setParticipantCount(connectedCount + 1);

        if (callStateRef.current !== "connected") {
          setCallState("connected");
          if (!durationTimerRef.current) {
            setCallDuration(0);
            durationTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
          }
        }
      } else if (pc.connectionState === "failed") {
        const existingTimer = disconnectTimersRef.current.get(peerId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          disconnectTimersRef.current.delete(peerId);
        }
        handlePeerDisconnect(peerId);
      } else if (pc.connectionState === "disconnected") {
        const existing = disconnectTimersRef.current.get(peerId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          disconnectTimersRef.current.delete(peerId);
          handlePeerDisconnect(peerId);
        }, 5000);
        disconnectTimersRef.current.set(peerId, timer);
      }
    };

    const mixedStream = rebuildMixForPeer(peerId);
    if (mixedStream) {
      mixedStream.getAudioTracks().forEach(track => pc.addTrack(track, mixedStream));
    }

    peerConnectionsRef.current.set(peerId, pc);
    return pc;
  }, [sendWs, ensureAudioContext, rebuildMixForPeer, handlePeerDisconnect]);

  const createParticipantPeerConnection = useCallback((hostId: string, callId: string) => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWs({ type: "ice-candidate", callId, targetUserId: hostId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play().catch(() => {});
      audioElementsRef.current.set(hostId, audio);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        const existingTimer = disconnectTimersRef.current.get(hostId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          disconnectTimersRef.current.delete(hostId);
        }
        setParticipantCount(2);
        if (callStateRef.current !== "connected") {
          setCallState("connected");
          if (!durationTimerRef.current) {
            setCallDuration(0);
            durationTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
          }
        }
      } else if (pc.connectionState === "failed") {
        const existingTimer = disconnectTimersRef.current.get(hostId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          disconnectTimersRef.current.delete(hostId);
        }
        setCallState("ended");
        cleanup();
        setTimeout(() => { setCallState("idle"); setCurrentCallId(null); setRemotePeer(null); }, 2000);
      } else if (pc.connectionState === "disconnected") {
        const existing = disconnectTimersRef.current.get(hostId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          disconnectTimersRef.current.delete(hostId);
          setCallState("ended");
          cleanup();
          setTimeout(() => { setCallState("idle"); setCurrentCallId(null); setRemotePeer(null); }, 2000);
        }, 5000);
        disconnectTimersRef.current.set(hostId, timer);
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
    }

    peerConnectionsRef.current.set(hostId, pc);
    return pc;
  }, [sendWs, cleanup]);

  const connectWebSocket = useCallback(() => {
    if (!enabled || !userId || !companyOwnerId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/team-call`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 25000);
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "incoming-call": {
            setCurrentCallId(msg.callId);
            setRemotePeer(msg.caller);
            setIsConference(msg.isConference || false);
            setParticipantCount(msg.participantCount || 2);
            setIsHost(false);
            setCallState("ringing-incoming");
            break;
          }
          case "call-ringing": {
            setCurrentCallId(msg.callId);
            setIsConference(msg.isConference || false);
            setIsHost(true);
            setCallState("ringing-outgoing");
            break;
          }
          case "participant-joined": {
            if (msg.createOffer && currentCallIdRef.current && isHostRef.current) {
              try {
                const ctx = ensureAudioContext();
                const stream = await ensureLocalStream();
                if (!localSourceRef.current) {
                  localSourceRef.current = ctx.createMediaStreamSource(stream);
                }
                const pc = createHostPeerConnection(msg.userId, currentCallIdRef.current);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendWs({ type: "offer", callId: currentCallIdRef.current, targetUserId: msg.userId, sdp: offer });
              } catch (err) {
                console.error("[TeamCall] Host offer failed:", err);
              }
            }
            break;
          }
          case "call-accepted-ack": {
            setCallState("connecting");
            setIsHost(false);
            break;
          }
          case "participant-left": {
            if (isHostRef.current) {
              handlePeerDisconnect(msg.userId);
            }
            break;
          }
          case "offer": {
            try {
              await ensureLocalStream();
              let pc = peerConnectionsRef.current.get(msg.fromUserId);
              if (!pc) pc = createParticipantPeerConnection(msg.fromUserId, msg.callId);
              await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              sendWs({ type: "answer", callId: msg.callId, targetUserId: msg.fromUserId, sdp: answer });
            } catch (err) {
              console.error("[TeamCall] Answer failed:", err);
            }
            break;
          }
          case "answer": {
            try {
              const pc = peerConnectionsRef.current.get(msg.fromUserId);
              if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            } catch (err) {
              console.error("[TeamCall] Set answer failed:", err);
            }
            break;
          }
          case "ice-candidate": {
            try {
              const pc = peerConnectionsRef.current.get(msg.fromUserId);
              if (pc) await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch (err) {
              console.error("[TeamCall] ICE failed:", err);
            }
            break;
          }
          case "call-ended": {
            setCallState("ended");
            cleanup();
            setTimeout(() => { setCallState("idle"); setCurrentCallId(null); setRemotePeer(null); }, 2000);
            break;
          }
          case "pong":
            break;
        }
      } catch (err) {
        console.error("[TeamCall] Message parse error:", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      reconnectTimerRef.current = setTimeout(() => connectWebSocket(), 3000);
    };

    ws.onerror = () => ws.close();
  }, [enabled, userId, companyOwnerId, ensureLocalStream, ensureAudioContext, createHostPeerConnection, createParticipantPeerConnection, handlePeerDisconnect, sendWs, cleanup]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      cleanup();
    };
  }, [connectWebSocket, cleanup]);

  const startCall = useCallback(async (calleeId: string, channelId?: number) => {
    if (callStateRef.current !== "idle") return;
    setCurrentCallId(null);
    setRemotePeer(null);
    setIsConference(false);
    setIsHost(true);

    await fetchIceServers();

    try {
      const ctx = ensureAudioContext();
      const stream = await ensureLocalStream();
      localSourceRef.current = ctx.createMediaStreamSource(stream);
    } catch (err) {
      console.error("[TeamCall] Mic access failed:", err);
      if (onMicDeniedRef.current) onMicDeniedRef.current();
      return;
    }

    try {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/team/members`);
      const members = await res.json();
      const callee = members.find((m: any) => m.id === calleeId);
      if (callee) {
        setRemotePeer({ id: callee.id, firstName: callee.firstName, lastName: callee.lastName, email: callee.email, profileImageUrl: callee.profileImageUrl });
      }
    } catch {}

    sendWs({ type: "call-request", calleeId, channelId });
  }, [sendWs, ensureLocalStream, ensureAudioContext, fetchIceServers]);

  const startConferenceCall = useCallback(async (calleeIds: string[], channelId?: number) => {
    if (callStateRef.current !== "idle" || calleeIds.length === 0) return;
    setCurrentCallId(null);
    setRemotePeer(null);
    setIsConference(true);
    setIsHost(true);
    setParticipantCount(calleeIds.length + 1);

    await fetchIceServers();

    try {
      const ctx = ensureAudioContext();
      const stream = await ensureLocalStream();
      localSourceRef.current = ctx.createMediaStreamSource(stream);
    } catch (err) {
      console.error("[TeamCall] Mic access failed:", err);
      if (onMicDeniedRef.current) onMicDeniedRef.current();
      return;
    }

    sendWs({ type: "call-request", calleeIds, channelId });
  }, [sendWs, ensureLocalStream, ensureAudioContext, fetchIceServers]);

  const acceptCall = useCallback(async () => {
    if (!currentCallIdRef.current) return;
    try {
      await fetchIceServers();
      await ensureLocalStream();
      sendWs({ type: "call-accepted", callId: currentCallIdRef.current });
    } catch (err) {
      console.error("[TeamCall] Accept failed:", err);
      if (onMicDeniedRef.current) onMicDeniedRef.current();
      sendWs({ type: "call-rejected", callId: currentCallIdRef.current });
      setCallState("idle");
      cleanup();
    }
  }, [sendWs, ensureLocalStream, cleanup, fetchIceServers]);

  const rejectCall = useCallback(() => {
    if (!currentCallIdRef.current) return;
    sendWs({ type: "call-rejected", callId: currentCallIdRef.current });
    setCallState("idle");
    setCurrentCallId(null);
    setRemotePeer(null);
  }, [sendWs]);

  const endCall = useCallback(() => {
    if (!currentCallIdRef.current) return;
    sendWs({ type: "call-ended", callId: currentCallIdRef.current });
    setCallState("ended");
    cleanup();
    setTimeout(() => { setCallState("idle"); setCurrentCallId(null); setRemotePeer(null); }, 2000);
  }, [sendWs, cleanup]);

  const endConference = useCallback(() => {
    if (!currentCallIdRef.current) return;
    sendWs({ type: "end-conference", callId: currentCallIdRef.current });
    setCallState("ended");
    cleanup();
    setTimeout(() => { setCallState("idle"); setCurrentCallId(null); setRemotePeer(null); }, 2000);
  }, [sendWs, cleanup]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  return {
    callState, currentCallId, remotePeer, callDuration, isMuted,
    isConference, isHost, participantCount,
    startCall, startConferenceCall, acceptCall, rejectCall, endCall, endConference, toggleMute,
    isConnected,
  };
}
