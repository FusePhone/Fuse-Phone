import { Phone, PhoneOff, Mic, MicOff, X, Users, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { CallState } from "@/hooks/use-team-call";
import { cn } from "@/lib/utils";

interface CallerInfo {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  profileImageUrl: string | null;
}

interface TeamCallUIProps {
  callState: CallState;
  remotePeer: CallerInfo | null;
  callDuration: number;
  isMuted: boolean;
  isConference: boolean;
  isHost: boolean;
  participantCount: number;
  canEndConference: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onEndConference: () => void;
  onToggleMute: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getPeerName(peer: CallerInfo | null): string {
  if (!peer) return "Team Member";
  if (peer.firstName || peer.lastName) return [peer.firstName, peer.lastName].filter(Boolean).join(" ");
  return peer.email || "Team Member";
}

function getPeerInitials(peer: CallerInfo | null): string {
  if (!peer) return "?";
  const f = peer.firstName?.[0] || "";
  const l = peer.lastName?.[0] || "";
  if (f || l) return (f + l).toUpperCase();
  return peer.email?.[0]?.toUpperCase() || "?";
}

export function TeamCallUI({ callState, remotePeer, callDuration, isMuted, isConference, isHost, participantCount, canEndConference, onAccept, onReject, onEnd, onEndConference, onToggleMute }: TeamCallUIProps) {
  if (callState === "idle") return null;

  const isIncoming = callState === "ringing-incoming";
  const isOutgoing = callState === "ringing-outgoing";
  const isActive = callState === "connected";
  const isConnecting = callState === "connecting";
  const isEnded = callState === "ended";

  return (
    <div className="fixed inset-0 z-[90] bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-center text-white" data-testid="team-call-overlay">
      <div className="flex flex-col items-center gap-6">
        {isConference ? (
          <div className="w-24 h-24 rounded-full bg-blue-600/30 border-2 border-blue-400/40 flex items-center justify-center">
            <Users className="w-12 h-12 text-blue-300" />
          </div>
        ) : (
          <Avatar className="w-24 h-24 border-2 border-white/20">
            <AvatarImage src={remotePeer?.profileImageUrl || undefined} />
            <AvatarFallback className="text-2xl bg-primary/20 text-white">{getPeerInitials(remotePeer)}</AvatarFallback>
          </Avatar>
        )}

        <div className="text-center">
          <h2 className="text-2xl font-semibold" data-testid="text-call-peer-name">
            {isConference ? "Team Conference" : getPeerName(remotePeer)}
          </h2>
          <p className={cn("text-sm mt-1", isActive ? "text-green-400" : "text-white/60")} data-testid="text-call-status">
            {isIncoming && (isConference ? "Incoming conference call..." : "Incoming call...")}
            {isOutgoing && (isConference ? `Calling ${participantCount - 1} members...` : "Calling...")}
            {isConnecting && "Connecting..."}
            {isActive && formatDuration(callDuration)}
            {isEnded && "Call ended"}
          </p>
          {isActive && participantCount > 0 && (
            <p className="text-xs text-white/50 mt-1" data-testid="text-participant-count">
              {participantCount} participant{participantCount !== 1 ? "s" : ""}
            </p>
          )}
          {isActive && isHost && (
            <Badge variant="outline" className="mt-2 border-yellow-500/50 text-yellow-400 text-[10px]" data-testid="badge-hosting">
              <Crown className="w-3 h-3 mr-1" />
              Hosting
            </Badge>
          )}
        </div>

        {(isOutgoing || isConnecting) && (
          <div className="flex items-center gap-2 mt-2">
            <div className="w-2 h-2 rounded-full bg-white/60 animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-white/60 animate-pulse" style={{ animationDelay: "0.2s" }} />
            <div className="w-2 h-2 rounded-full bg-white/60 animate-pulse" style={{ animationDelay: "0.4s" }} />
          </div>
        )}
      </div>

      <div className="mt-16 flex flex-col items-center gap-6">
        <div className="flex items-center gap-8">
          {isIncoming && (
            <>
              <Button
                variant="outline"
                size="lg"
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 border-0 text-white"
                onClick={onReject}
                data-testid="button-reject-call"
              >
                <PhoneOff className="w-7 h-7" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-700 border-0 text-white animate-pulse"
                onClick={onAccept}
                data-testid="button-accept-call"
              >
                <Phone className="w-7 h-7" />
              </Button>
            </>
          )}

          {(isOutgoing || isConnecting) && (
            <Button
              variant="outline"
              size="lg"
              className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 border-0 text-white"
              onClick={onEnd}
              data-testid="button-cancel-call"
            >
              <PhoneOff className="w-7 h-7" />
            </Button>
          )}

          {isActive && (
            <>
              <Button
                variant="outline"
                size="lg"
                className={cn(
                  "w-14 h-14 rounded-full border-0 text-white",
                  isMuted ? "bg-yellow-600 hover:bg-yellow-700" : "bg-white/10 hover:bg-white/20"
                )}
                onClick={onToggleMute}
                data-testid="button-toggle-mute"
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 border-0 text-white"
                onClick={onEnd}
                data-testid="button-end-call"
              >
                <PhoneOff className="w-7 h-7" />
              </Button>
            </>
          )}

          {isEnded && (
            <Button
              variant="outline"
              size="lg"
              className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 border-0 text-white"
              onClick={onEnd}
              data-testid="button-dismiss-call"
            >
              <X className="w-6 h-6" />
            </Button>
          )}
        </div>

        {isActive && isConference && canEndConference && (
          <Button
            variant="outline"
            size="sm"
            className="border-red-500/50 text-red-400 hover:bg-red-600/20 hover:text-red-300 text-xs"
            onClick={onEndConference}
            data-testid="button-end-conference"
          >
            End Conference for All
          </Button>
        )}

        {isActive && isConference && !canEndConference && !isHost && (
          <p className="text-[11px] text-white/40 mt-1">Tap the red button to leave the call</p>
        )}
      </div>
    </div>
  );
}
