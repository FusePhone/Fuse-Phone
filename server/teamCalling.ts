import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import { parse as parseCookie } from "cookie";
import { db } from "./db";
import { users, companyUsers } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { sendPushToUser } from "./pushNotifications";

interface ConnectedUser {
  ws: WebSocket;
  userId: string;
  companyOwnerId: string;
}

interface ConferenceParticipant {
  userId: string;
  status: "ringing" | "connected" | "declined";
  joinedAt?: number;
}

interface ActiveCall {
  id: string;
  hostId: string;
  companyOwnerId: string;
  channelId: number;
  isConference: boolean;
  participants: Map<string, ConferenceParticipant>;
  startedAt: number;
}

const connectedUsers = new Map<string, ConnectedUser>();
const activeCalls = new Map<string, ActiveCall>();
const missedCallTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function generateCallId(): string {
  return `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getUserInfo(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    profileImageUrl: user.profileImageUrl,
  };
}

async function getUserRole(userId: string, companyOwnerId: string): Promise<string> {
  if (userId === companyOwnerId) return "owner";
  const [cu] = await db.select().from(companyUsers).where(eq(companyUsers.userId, userId));
  return cu?.role || "crew_lead";
}

const PRIVILEGED_ROLES = ["owner", "office_manager"];

function sendToUser(userId: string, message: any) {
  const conn = connectedUsers.get(userId);
  if (conn && conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

function getConnectedParticipants(call: ActiveCall): string[] {
  const result: string[] = [];
  for (const [uid, p] of call.participants) {
    if (p.status === "connected") result.push(uid);
  }
  return result;
}

function cleanupCall(callId: string) {
  const timeout = missedCallTimeouts.get(callId);
  if (timeout) {
    clearTimeout(timeout);
    missedCallTimeouts.delete(callId);
  }
  const call = activeCalls.get(callId);
  if (!call) return;
  for (const [uid] of call.participants) {
    sendToUser(uid, { type: "call-ended", callId, reason: "ended" });
  }
  activeCalls.delete(callId);
}

async function authenticateFromCookie(request: IncomingMessage): Promise<string | null> {
  try {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return null;

    const cookies = parseCookie(cookieHeader);
    const sid = cookies["connect.sid"];
    if (!sid) return null;

    let sessionId: string | null = null;
    if (sid.startsWith("s:")) {
      const raw = sid.slice(2);
      const dotIndex = raw.indexOf(".");
      if (dotIndex === -1) return null;
      const val = raw.slice(0, dotIndex);
      const sig = raw.slice(dotIndex + 1);
      const secret = process.env.SESSION_SECRET;
      if (!secret) return null;
      const crypto = await import("crypto");
      const expected = crypto.createHmac("sha256", secret).update(val).digest("base64").replace(/=+$/, "");
      if (sig !== expected) return null;
      sessionId = val;
    } else {
      sessionId = sid;
    }
    if (!sessionId) return null;

    const result = await db.execute(sql`SELECT sess FROM sessions WHERE sid = ${sessionId} AND expire > NOW()`);
    const rows = (result as any).rows;
    if (!rows || rows.length === 0) return null;
    const session = rows[0];

    const sessData = typeof session.sess === "string" ? JSON.parse(session.sess) : session.sess;
    const userId = sessData?.userId || sessData?.passport?.user;
    return userId || null;
  } catch {
    return null;
  }
}

async function authenticateFromJWT(request: IncomingMessage): Promise<string | null> {
  try {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const token = url.searchParams.get("token");
    if (!token) return null;

    const { authenticateNativeToken } = await import("./nativeAuth");
    const result = await authenticateNativeToken(token);
    return result?.userId || null;
  } catch {
    return null;
  }
}

async function resolveCompanyOwnerId(userId: string): Promise<string> {
  const [membership] = await db.select().from(companyUsers).where(eq(companyUsers.userId, userId));
  if (membership) return membership.ownerId;
  return userId;
}

export function setupTeamCallingWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    if (url.pathname !== "/ws/team-call") return;

    (async () => {
      let userId = await authenticateFromCookie(request);
      if (!userId) {
        userId = await authenticateFromJWT(request);
      }

      if (!userId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const companyOwnerId = await resolveCompanyOwnerId(userId);

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, userId!, companyOwnerId);
      });
    })().catch(() => {
      socket.destroy();
    });
  });

  wss.on("connection", (ws: WebSocket, userId: string, companyOwnerId: string) => {
    console.log(`[TeamCall] User ${userId} connected`);

    const existing = connectedUsers.get(userId);
    if (existing && existing.ws.readyState === WebSocket.OPEN) {
      existing.ws.close();
    }

    connectedUsers.set(userId, { ws, userId, companyOwnerId });
    sendToUser(userId, { type: "connected", userId });

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleMessage(userId, companyOwnerId, msg);
      } catch (err) {
        console.error("[TeamCall] Message error:", err);
      }
    });

    ws.on("close", () => {
      console.log(`[TeamCall] User ${userId} disconnected`);
      connectedUsers.delete(userId);

      for (const [callId, call] of activeCalls) {
        const participant = call.participants.get(userId);
        if (!participant) continue;

        if (userId === call.hostId) {
          console.log(`[TeamCall] Host ${userId} disconnected, ending call ${callId}`);
          cleanupCall(callId);
        } else {
          call.participants.delete(userId);
          sendToUser(call.hostId, { type: "participant-left", callId, userId, reason: "disconnected" });

          const connected = getConnectedParticipants(call);
          if (connected.length < 2 && !Array.from(call.participants.values()).some(p => p.status === "ringing")) {
            cleanupCall(callId);
          }
        }
      }
    });

    ws.on("error", (err) => {
      console.error(`[TeamCall] WS error for ${userId}:`, err);
    });
  });

  async function handleMessage(userId: string, companyOwnerId: string, msg: any) {
    switch (msg.type) {
      case "call-request": {
        const { calleeId, calleeIds, channelId } = msg;
        const targetIds: string[] = calleeIds || (calleeId ? [calleeId] : []);
        if (targetIds.length === 0) return;

        const isConference = targetIds.length > 1;
        const callId = generateCallId();

        const participants = new Map<string, ConferenceParticipant>();
        participants.set(userId, { userId, status: "connected", joinedAt: Date.now() });
        for (const tid of targetIds) {
          participants.set(tid, { userId: tid, status: "ringing" });
        }

        activeCalls.set(callId, {
          id: callId,
          hostId: userId,
          companyOwnerId,
          channelId: channelId || 0,
          isConference,
          participants,
          startedAt: Date.now(),
        });

        const callerInfo = await getUserInfo(userId);
        const callerName = callerInfo
          ? [callerInfo.firstName, callerInfo.lastName].filter(Boolean).join(" ") || callerInfo.email
          : "Team member";

        for (const tid of targetIds) {
          sendToUser(tid, {
            type: "incoming-call",
            callId,
            caller: callerInfo,
            channelId,
            isConference,
            participantCount: targetIds.length + 1,
          });

          sendPushToUser(tid, {
            title: isConference ? `Team Conference Call` : `Incoming Call`,
            body: isConference ? `${callerName} started a conference (${targetIds.length + 1} participants)` : `${callerName} is calling you`,
            url: "/messages?tab=team",
            tag: `team-call-${callId}`,
            isCall: true,
          }).catch(err => console.error("[TeamCall] Push error:", err));
        }

        sendToUser(userId, {
          type: "call-ringing",
          callId,
          calleeIds: targetIds,
          isConference,
        });

        const existingTimeout = missedCallTimeouts.get(callId);
        if (existingTimeout) clearTimeout(existingTimeout);

        const missedTimeout = setTimeout(async () => {
          missedCallTimeouts.delete(callId);
          const call = activeCalls.get(callId);
          if (!call) return;
          for (const [uid, p] of call.participants) {
            if (p.status === "ringing") {
              sendToUser(uid, { type: "call-ended", callId, reason: "missed" });
              sendPushToUser(uid, {
                title: "Missed Call",
                body: `You missed a call from ${callerName}`,
                url: "/messages?tab=team",
                tag: `missed-call-${callId}`,
              }).catch(err => console.error("[TeamCall] Missed call push error:", err));
              call.participants.delete(uid);
            }
          }
          const connected = getConnectedParticipants(call);
          if (connected.length < 2) {
            cleanupCall(callId);
          }
        }, 30000);
        missedCallTimeouts.set(callId, missedTimeout);

        break;
      }

      case "call-accepted": {
        const { callId } = msg;
        const call = activeCalls.get(callId);
        if (!call) return;
        const participant = call.participants.get(userId);
        if (!participant || participant.status !== "ringing") return;

        participant.status = "connected";
        participant.joinedAt = Date.now();

        console.log(`[TeamCall] ${userId} accepted call ${callId}, host=${call.hostId}`);

        sendToUser(call.hostId, {
          type: "participant-joined",
          callId,
          userId,
          createOffer: true,
        });

        sendToUser(userId, {
          type: "call-accepted-ack",
          callId,
          hostId: call.hostId,
          isConference: call.isConference,
          participantCount: getConnectedParticipants(call).length,
        });

        break;
      }

      case "call-rejected": {
        const { callId } = msg;
        const call = activeCalls.get(callId);
        if (!call) return;
        const participant = call.participants.get(userId);
        if (!participant) return;

        participant.status = "declined";
        call.participants.delete(userId);

        sendToUser(call.hostId, { type: "participant-left", callId, userId, reason: "rejected" });

        const connected = getConnectedParticipants(call);
        if (connected.length < 2 && !Array.from(call.participants.values()).some(p => p.status === "ringing")) {
          cleanupCall(callId);
        }

        break;
      }

      case "call-ended": {
        const { callId } = msg;
        const call = activeCalls.get(callId);
        if (!call) return;

        if (userId === call.hostId) {
          console.log(`[TeamCall] Host ${userId} ended call ${callId}`);
          cleanupCall(callId);
          return;
        }

        call.participants.delete(userId);
        sendToUser(call.hostId, { type: "participant-left", callId, userId, reason: "left" });

        const connected = getConnectedParticipants(call);
        if (connected.length < 2 && !Array.from(call.participants.values()).some(p => p.status === "ringing")) {
          cleanupCall(callId);
        }

        break;
      }

      case "end-conference": {
        const { callId } = msg;
        const call = activeCalls.get(callId);
        if (!call) return;

        const role = await getUserRole(userId, call.companyOwnerId);
        if (userId === call.hostId || PRIVILEGED_ROLES.includes(role)) {
          console.log(`[TeamCall] ${role} ${userId} ended conference ${callId}`);
          cleanupCall(callId);
        }
        break;
      }

      case "offer": {
        const { callId, targetUserId, sdp } = msg;
        const call = activeCalls.get(callId);
        if (!call) return;
        if (userId !== call.hostId) return;
        sendToUser(targetUserId, { type: "offer", callId, fromUserId: userId, sdp });
        break;
      }

      case "answer": {
        const { callId, targetUserId, sdp } = msg;
        const call = activeCalls.get(callId);
        if (!call) return;
        if (targetUserId !== call.hostId) return;
        sendToUser(call.hostId, { type: "answer", callId, fromUserId: userId, sdp });
        break;
      }

      case "ice-candidate": {
        const { callId, targetUserId, candidate } = msg;
        const call = activeCalls.get(callId);
        if (!call) return;
        sendToUser(targetUserId, { type: "ice-candidate", callId, fromUserId: userId, candidate });
        break;
      }

      case "ping": {
        sendToUser(userId, { type: "pong" });
        break;
      }
    }
  }

  console.log("[TeamCall] WebSocket signaling server initialized");
}
