/**
 * `createExpressSignaling` — Express integration for the Forinda signaling
 * protocol.
 *
 * Mounts a `WebSocketServer({ noServer: true })` on a specific path of an
 * existing Express + http server. The HTTP upgrade handshake is done
 * manually so it coexists with regular Express routes.
 *
 * Same engine + session wiring as `signaling-adapter-ws`, with the addition
 * of an Express-aware upgrade hook.
 */

import { randomUUID } from "node:crypto";
import type { Application } from "express";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Socket } from "node:net";
import {
  defineSignalingEngine,
  SignalingMessage,
  type AuthenticateFn,
  type Session,
  type SignalingEngine,
} from "@forinda/video-sdk-signaling-protocol";
import { WebSocketServer, type WebSocket } from "ws";

/** Options for {@link createExpressSignaling}. */
export interface CreateExpressSignalingOptions {
  /** Express application — currently unused at runtime but kept for symmetry/future hooks. */
  app: Application;
  /** Existing HTTP server (e.g. `app.listen(...)` return value). */
  server: HttpServer;
  /** Bring your own `WebSocketServer({ noServer: true })`. Created if omitted. */
  wss?: WebSocketServer;
  /** Path to upgrade on. Default `/signaling`. */
  path?: string;
  /** Bring your own `SignalingEngine`. Default: `defineSignalingEngine({ ... })`. */
  engine?: SignalingEngine;
  /** Forwarded to the default-constructed engine. */
  authenticate?: AuthenticateFn;
  /** Forwarded to the default-constructed engine. */
  maxPeersPerRoom?: number;
  /** Generate a per-connection socket id. Defaults to `crypto.randomUUID()`. */
  socketId?: (request: IncomingMessage) => string;
  /** Extract the per-connection token. Defaults to `?token=` query. */
  extractToken?: (request: IncomingMessage) => string | undefined;
}

/** Handle returned by {@link createExpressSignaling}. */
export interface ExpressSignalingHandle {
  readonly wss: WebSocketServer;
  readonly engine: SignalingEngine;
  readonly session: Session;
  /** Detach the upgrade listener and close the wss. */
  close(): Promise<void>;
}

const defaultExtractToken = (request: IncomingMessage): string | undefined => {
  const url = request.url ?? "";
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return undefined;
  const params = new URLSearchParams(url.slice(queryStart + 1));
  return params.get("token") ?? undefined;
};

/**
 * Wire signaling onto an existing Express + http server. Returns the
 * `wss`, `engine`, `session`, and a `close()` for graceful shutdown.
 *
 * ```ts
 * import express from "express";
 * import http from "node:http";
 * import { createExpressSignaling } from "@forinda/video-sdk-signaling-adapter-express";
 *
 * const app = express();
 * const server = http.createServer(app);
 *
 * createExpressSignaling({ app, server, path: "/signaling" });
 *
 * server.listen(3000);
 * ```
 */
export function createExpressSignaling(
  opts: CreateExpressSignalingOptions,
): ExpressSignalingHandle {
  const path = opts.path ?? "/signaling";
  const wss = opts.wss ?? new WebSocketServer({ noServer: true });

  const engine =
    opts.engine ??
    defineSignalingEngine({
      ...(opts.authenticate !== undefined ? { authenticate: opts.authenticate } : {}),
      ...(opts.maxPeersPerRoom !== undefined ? { maxPeersPerRoom: opts.maxPeersPerRoom } : {}),
    });

  const session = engine.openSession();
  const socketIdOf = opts.socketId ?? ((): string => randomUUID());
  const extractToken = opts.extractToken ?? defaultExtractToken;

  const socketToWs = new Map<string, WebSocket>();
  const peerToSocket = new Map<string, string>();

  session.onSend((peerId, message) => {
    const sid = peerToSocket.get(peerId);
    if (sid === undefined) return;
    const ws = socketToWs.get(sid);
    if (ws === undefined) return;
    ws.send(JSON.stringify(message));
  });

  const upgradeHandler = (req: IncomingMessage, socket: Socket, head: Buffer): void => {
    const url = req.url ?? "/";
    // Only handle upgrades for the configured path; other paths fall through
    // (allowing other ws servers on the same http server).
    const pathOnly = url.split("?")[0];
    if (pathOnly !== path) return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      const socketId = socketIdOf(req);
      const token = extractToken(req);
      socketToWs.set(socketId, ws);

      void session.handleConnection(socketId, {
        ...(token !== undefined ? { token } : {}),
      });

      ws.on("message", (data) => {
        const raw = data.toString();
        try {
          const parsed = JSON.parse(raw) as unknown;
          const result = SignalingMessage.safeParse(parsed);
          if (result.success && result.data.type === "join") {
            peerToSocket.set(result.data.peer, socketId);
          }
        } catch {
          // session.handleMessage produces the proper error path
        }

        void session.handleMessage(socketId, raw).catch(() => {
          // engine logs validation/auth/capacity failures; don't crash the connection
        });
      });

      ws.on("close", () => {
        for (const [peerId, sid] of peerToSocket.entries()) {
          if (sid === socketId) peerToSocket.delete(peerId);
        }
        socketToWs.delete(socketId);
        void session.handleDisconnect(socketId);
      });
    });
  };

  opts.server.on("upgrade", upgradeHandler);

  return {
    wss,
    engine,
    session,
    async close() {
      opts.server.off("upgrade", upgradeHandler);
      for (const ws of socketToWs.values()) {
        ws.close(1001, "server shutting down");
      }
      await new Promise<void>((resolve, reject) => {
        wss.close((err) => (err === undefined ? resolve() : reject(err)));
      });
    },
  };
}
