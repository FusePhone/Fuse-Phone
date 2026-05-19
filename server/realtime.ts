import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import { parse as parseCookie } from "cookie";
import { db } from "./db";
import { sql } from "drizzle-orm";

interface RealtimeClient {
  ws: WebSocket;
  userId: string;
  tenantId: string;
  isAlive: boolean;
}

interface PortalClient {
  ws: WebSocket;
  documentId: number;
  token: string;
  isAlive: boolean;
}

interface ColorReviewClient {
  ws: WebSocket;
  submissionId: number;
  token: string;
  isAlive: boolean;
}

const clients = new Map<string, Set<RealtimeClient>>();
const portalClients = new Map<number, Set<PortalClient>>();
const colorReviewClients = new Map<number, Set<ColorReviewClient>>();

function getKey(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

function addClient(client: RealtimeClient): void {
  const key = getKey(client.tenantId, client.userId);
  if (!clients.has(key)) {
    clients.set(key, new Set());
  }
  clients.get(key)!.add(client);
}

function removeClient(client: RealtimeClient): void {
  const key = getKey(client.tenantId, client.userId);
  const set = clients.get(key);
  if (set) {
    set.delete(client);
    if (set.size === 0) {
      clients.delete(key);
    }
  }
}

export interface RealtimeEvent {
  type: string;
  tenantId: string;
  [key: string]: unknown;
}

function addPortalClient(client: PortalClient): void {
  if (!portalClients.has(client.documentId)) {
    portalClients.set(client.documentId, new Set());
  }
  portalClients.get(client.documentId)!.add(client);
}

function removePortalClient(client: PortalClient): void {
  const set = portalClients.get(client.documentId);
  if (set) {
    set.delete(client);
    if (set.size === 0) {
      portalClients.delete(client.documentId);
    }
  }
}

function addColorReviewClient(client: ColorReviewClient): void {
  if (!colorReviewClients.has(client.submissionId)) {
    colorReviewClients.set(client.submissionId, new Set());
  }
  colorReviewClients.get(client.submissionId)!.add(client);
}

function removeColorReviewClient(client: ColorReviewClient): void {
  const set = colorReviewClients.get(client.submissionId);
  if (set) {
    set.delete(client);
    if (set.size === 0) {
      colorReviewClients.delete(client.submissionId);
    }
  }
}

export function emitToColorReview(submissionId: number, event: Record<string, unknown>): void {
  const set = colorReviewClients.get(submissionId);
  if (!set) return;
  const payload = JSON.stringify(event);
  for (const client of set) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

export function emitToDocument(documentId: number, event: Record<string, unknown>): void {
  const set = portalClients.get(documentId);
  if (!set) return;
  const payload = JSON.stringify(event);
  for (const client of set) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

export function emitToUser(tenantId: string, userId: string, event: RealtimeEvent): void {
  const key = getKey(tenantId, userId);
  const set = clients.get(key);
  // Diagnostic trace for subscription-critical events so we can verify the
  // server actually pushed (and to how many open WebSocket clients) when
  // tier changes happen via /api/iap/sync or /api/iap/webhook.
  const isSubEvent = event.type === "subscription.changed";
  if (!set) {
    if (isSubEvent) {
      console.log(`[Realtime emit] type=${event.type} user=${userId} openClients=0 (NO_LISTENERS — client may be backgrounded/disconnected)`);
    }
    return;
  }
  let openCount = 0;
  for (const client of set) {
    if (client.ws.readyState === WebSocket.OPEN) openCount++;
  }
  if (isSubEvent) {
    console.log(`[Realtime emit] type=${event.type} user=${userId} openClients=${openCount} payload=${JSON.stringify(event).slice(0, 300)}`);
  }
  const payload = JSON.stringify(event);
  for (const client of set) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

// Fan-out helper: emit a realtime event to the company owner AND every active
// sub-user under that owner. Used for shared inbound events (incoming SMS,
// missed calls, voicemails) that any team member should see live without
// having to refresh the page.
export async function emitToOwnerAndTeam(ownerId: string, event: RealtimeEvent): Promise<void> {
  emitToUser(ownerId, ownerId, event);
  try {
    const result = await db.execute(
      sql`SELECT user_id FROM company_users WHERE owner_id = ${ownerId} AND status = 'active'`
    );
    const rows = (result as any).rows || [];
    for (const r of rows) {
      const subUserId = r.user_id;
      if (subUserId && subUserId !== ownerId) {
        emitToUser(ownerId, subUserId, event);
      }
    }
  } catch (err) {
    console.error("[Realtime] emitToOwnerAndTeam failed:", err);
  }
}

async function resolveOwnerForWs(userId: string): Promise<string> {
  try {
    const result = await db.execute(
      sql`SELECT owner_id FROM company_users WHERE user_id = ${userId} AND status = 'active' LIMIT 1`
    );
    const rows = (result as any).rows;
    if (rows && rows.length > 0 && rows[0].owner_id) {
      return rows[0].owner_id;
    }
  } catch {}
  return userId;
}

async function authenticateFromCookie(request: IncomingMessage): Promise<{ userId: string; tenantId: string } | null> {
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
    if (!userId) return null;

    const tenantId = await resolveOwnerForWs(userId);
    return { userId, tenantId };
  } catch {
    return null;
  }
}

async function authenticateFromJWT(request: IncomingMessage): Promise<{ userId: string; tenantId: string } | null> {
  try {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const token = url.searchParams.get("token");
    if (!token) return null;

    const { authenticateNativeToken } = await import("./nativeAuth");
    const result = await authenticateNativeToken(token);
    if (!result) return null;

    const tenantId = await resolveOwnerForWs(result.userId);
    return { userId: result.userId, tenantId };
  } catch {
    return null;
  }
}

export function setupRealtimeWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  const portalWss = new WebSocketServer({ noServer: true });
  const colorReviewWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);

    if (url.pathname === "/ws/color-review") {
      const token = url.searchParams.get("token");
      if (!token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      (async () => {
        const { eq } = await import("drizzle-orm");
        const { colorSubmissions } = await import("@shared/schema");
        const [submission] = await db.select({ id: colorSubmissions.id })
          .from(colorSubmissions)
          .where(eq(colorSubmissions.customerToken, token))
          .limit(1);
        if (!submission) {
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          socket.destroy();
          return;
        }

        colorReviewWss.handleUpgrade(request, socket, head, (ws) => {
          const client: ColorReviewClient = {
            ws,
            submissionId: submission.id,
            token,
            isAlive: true,
          };

          addColorReviewClient(client);
          console.log(`[Realtime] Color review client connected for submission ${submission.id}`);

          ws.on("message", (data) => {
            if (data.toString() === "ping") {
              client.isAlive = true;
              try { ws.send("pong"); } catch {}
            }
          });

          ws.on("pong", () => {
            client.isAlive = true;
          });

          ws.on("close", () => {
            removeColorReviewClient(client);
            console.log(`[Realtime] Color review client disconnected for submission ${submission.id}`);
          });

          ws.on("error", () => {
            removeColorReviewClient(client);
          });
        });
      })().catch(() => {
        socket.destroy();
      });
      return;
    }

    if (url.pathname === "/ws/portal") {
      const token = url.searchParams.get("token");
      if (!token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      (async () => {
        const { storage } = await import("./storage");
        const doc = await storage.getDocumentByToken(token);
        if (!doc) {
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          socket.destroy();
          return;
        }

        portalWss.handleUpgrade(request, socket, head, (ws) => {
          const client: PortalClient = {
            ws,
            documentId: doc.id,
            token,
            isAlive: true,
          };

          addPortalClient(client);
          console.log(`[Realtime] Portal client connected for doc ${doc.id}`);

          ws.on("pong", () => {
            client.isAlive = true;
          });

          ws.on("close", () => {
            removePortalClient(client);
            console.log(`[Realtime] Portal client disconnected for doc ${doc.id}`);
          });

          ws.on("error", () => {
            removePortalClient(client);
          });
        });
      })().catch(() => {
        socket.destroy();
      });
      return;
    }

    if (url.pathname !== "/ws/realtime") return;

    (async () => {
      let auth = await authenticateFromCookie(request);
      if (!auth) {
        auth = await authenticateFromJWT(request);
      }

      if (!auth) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      // Block deleted accounts from establishing realtime connections.
      try {
        const { users } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const [u] = await db
          .select({ status: users.accountStatus })
          .from(users)
          .where(eq(users.id, auth.userId))
          .limit(1);
        if (u && u.status && u.status !== "active") {
          socket.write("HTTP/1.1 423 Locked\r\n\r\n");
          socket.destroy();
          return;
        }
      } catch {
        // If lookup fails, fall through — gate is best-effort.
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        const client: RealtimeClient = {
          ws,
          userId: auth!.userId,
          tenantId: auth!.tenantId,
          isAlive: true,
        };

        addClient(client);
        console.log(`[Realtime] Client connected: ${auth!.userId}`);

        ws.on("message", (data) => {
          const msg = data.toString();
          if (msg === "ping") {
            client.isAlive = true;
            try { ws.send("pong"); } catch {}
          }
        });

        ws.on("pong", () => {
          client.isAlive = true;
        });

        ws.on("close", () => {
          removeClient(client);
          console.log(`[Realtime] Client disconnected: ${auth!.userId}`);
        });

        ws.on("error", () => {
          removeClient(client);
        });
      });
    })().catch(() => {
      socket.destroy();
    });
  });

  const pingInterval = setInterval(() => {
    for (const [, set] of clients) {
      for (const client of set) {
        if (!client.isAlive) {
          console.log(`[Realtime] Terminating stale connection: ${client.userId}`);
          client.ws.terminate();
          removeClient(client);
          continue;
        }
        client.isAlive = false;
        client.ws.ping();
      }
    }
    for (const [, set] of portalClients) {
      for (const client of set) {
        if (!client.isAlive) {
          client.ws.terminate();
          removePortalClient(client);
          continue;
        }
        client.isAlive = false;
        client.ws.ping();
      }
    }
    for (const [, set] of colorReviewClients) {
      for (const client of set) {
        if (!client.isAlive) {
          client.ws.terminate();
          removeColorReviewClient(client);
          continue;
        }
        client.isAlive = false;
        client.ws.ping();
      }
    }
  }, 30000);

  wss.on("close", () => {
    clearInterval(pingInterval);
  });

  console.log("[Realtime] WebSocket server initialized");
}

export function getConnectedClientCount(): number {
  let count = 0;
  for (const [, set] of clients) {
    count += set.size;
  }
  return count;
}
