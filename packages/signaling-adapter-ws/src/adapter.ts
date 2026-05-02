/**
 * `WebSocketSignalingServer` — Node `ws`-backed adapter that wires a
 * `SignalingEngine` (from `@forinda/video-sdk-signaling-protocol`) to a real
 * `WebSocketServer`.
 *
 * Lifecycle per connection:
 * 1. `wss` `connection` → assign a `socketId` (uuid by default), extract
 *    optional token from the request URL, store the `ws` in
 *    `Map<socketId, ws>`, call `session.handleConnection(socketId, info)`.
 * 2. ws `message` → buffer-to-string, peek at the JSON to learn the peerId
 *    when this socket joins a room (so we can route outbound by peerId
 *    later), then call `session.handleMessage(socketId, raw)`.
 * 3. ws `close` → `session.handleDisconnect(socketId)`, drop both maps.
 *
 * Outbound: the engine's `session.onSend((peerId, msg) => ...)` callback
 * fires by peer id. We resolve peer id → socket via `peerToSocket` and
 * write the JSON-serialized message. Drops silently with a warn log if the
 * peer is no longer present (race condition during disconnect).
 */

import { randomUUID } from "node:crypto";
import {
  defineSignalingEngine,
  SignalingMessage,
  type AuthenticateFn,
  type Session,
  type SignalingEngine,
} from "@forinda/video-sdk-signaling-protocol";
import { WebSocketServer, type WebSocket } from "ws";
import type { IncomingMessage } from "node:http";

/** Options for {@link defineWebSocketSignalingServer}. */
export interface WebSocketSignalingServerOptions {
  /** Bring your own `WebSocketServer`. If omitted, one is created on `port`. */
  wss?: WebSocketServer;
  /** Port to bind a freshly-created `WebSocketServer` on. Required if `wss` omitted. */
  port?: number;
  /** Bring your own `SignalingEngine`. Default: `defineSignalingEngine({ authenticate, maxPeersPerRoom, ... })`. */
  engine?: SignalingEngine;
  /** Forwarded to a default-constructed engine. Ignored when `engine` is supplied. */
  authenticate?: AuthenticateFn;
  /** Forwarded to a default-constructed engine. Ignored when `engine` is supplied. */
  maxPeersPerRoom?: number;
  /** Forwarded to a default-constructed engine. Ignored when `engine` is supplied. */
  rateLimit?: import("@forinda/video-sdk-signaling-protocol").SignalingEngineOptions["rateLimit"];
  /** Forwarded to a default-constructed engine. Ignored when `engine` is supplied. */
  chatHistoryPerRoom?: number;
  /** Forwarded to a default-constructed engine. Ignored when `engine` is supplied. */
  enforceModerationCommands?: boolean;
  /** Generate a socket id from the upgrade request. Defaults to `crypto.randomUUID()`. */
  socketId?: (request: IncomingMessage) => string;
  /** Extract a per-connection token (passed to `authenticate`). Defaults to `?token=` query. */
  extractToken?: (request: IncomingMessage) => string | undefined;
}

/** Handle returned by {@link defineWebSocketSignalingServer}. */
export interface WebSocketSignalingServer {
  /** The underlying `WebSocketServer` (provided or created). */
  readonly wss: WebSocketServer;
  /** The underlying `SignalingEngine` (provided or created). */
  readonly engine: SignalingEngine;
  /** The single shared `Session` driving all sockets. */
  readonly session: Session;
  /** Drain client connections and shut down. */
  close(): Promise<void>;
}

const defaultSocketId = (): string => randomUUID();

const defaultExtractToken = (request: IncomingMessage): string | undefined => {
  const url = request.url ?? "";
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return undefined;
  const params = new URLSearchParams(url.slice(queryStart + 1));
  return params.get("token") ?? undefined;
};

/**
 * Wire a `SignalingEngine` to a Node `WebSocketServer`. Returns a handle
 * containing the wss + engine + session + a `close()`.
 *
 * ```ts
 * const server = defineWebSocketSignalingServer({ port: 3000 });
 * // ...
 * await server.close();
 * ```
 */
export function defineWebSocketSignalingServer(
  opts: WebSocketSignalingServerOptions = {},
): WebSocketSignalingServer {
  const wss =
    opts.wss ??
    (() => {
      if (opts.port === undefined) {
        throw new Error("defineWebSocketSignalingServer: provide either `wss` or `port`");
      }
      return new WebSocketServer({ port: opts.port });
    })();

  const engine =
    opts.engine ??
    defineSignalingEngine({
      ...(opts.authenticate !== undefined ? { authenticate: opts.authenticate } : {}),
      ...(opts.maxPeersPerRoom !== undefined ? { maxPeersPerRoom: opts.maxPeersPerRoom } : {}),
      ...(opts.rateLimit !== undefined ? { rateLimit: opts.rateLimit } : {}),
      ...(opts.chatHistoryPerRoom !== undefined
        ? { chatHistoryPerRoom: opts.chatHistoryPerRoom }
        : {}),
      ...(opts.enforceModerationCommands !== undefined
        ? { enforceModerationCommands: opts.enforceModerationCommands }
        : {}),
    });

  const session = engine.openSession();
  const socketIdOf = opts.socketId ?? defaultSocketId;
  const extractToken = opts.extractToken ?? defaultExtractToken;

  /** socketId → ws (the host's view) */
  const socketToWs = new Map<string, WebSocket>();
  /** peerId → socketId (populated when join messages flow through) */
  const peerToSocket = new Map<string, string>();

  session.onSend((peerId, message) => {
    const socketId = peerToSocket.get(peerId);
    if (socketId === undefined) {
      // Peer left mid-send. Race condition, not a real error.
      return;
    }
    const ws = socketToWs.get(socketId);
    if (ws === undefined) return;
    ws.send(JSON.stringify(message));
  });

  wss.on("connection", (ws, request) => {
    const socketId = socketIdOf(request);
    const token = extractToken(request);
    socketToWs.set(socketId, ws);

    void session.handleConnection(socketId, {
      ...(token !== undefined ? { token } : {}),
    });

    ws.on("message", (data) => {
      const raw = data.toString();

      // Peek at the message to learn peer↔socket mapping for inbound joins
      // BEFORE handing off to the session. This is purely a routing
      // optimization; the session itself handles validation + state.
      try {
        const parsed = JSON.parse(raw) as unknown;
        const result = SignalingMessage.safeParse(parsed);
        if (result.success && result.data.type === "join") {
          peerToSocket.set(result.data.peer, socketId);
        }
      } catch {
        // Malformed payload — let session.handleMessage produce the proper error path.
      }

      void session.handleMessage(socketId, raw).catch(() => {
        // Validation / auth / capacity failures from the engine are logged
        // by the engine itself; we don't crash the connection here.
      });
    });

    ws.on("close", () => {
      // Find which peer (if any) this socket was bound to and clean up.
      for (const [peerId, sid] of peerToSocket.entries()) {
        if (sid === socketId) peerToSocket.delete(peerId);
      }
      socketToWs.delete(socketId);
      void session.handleDisconnect(socketId);
    });
  });

  return {
    wss,
    engine,
    session,
    async close() {
      // Close all client sockets first so their `close` events fire and
      // flow through `session.handleDisconnect` cleanly.
      for (const ws of socketToWs.values()) {
        ws.close(1001, "server shutting down");
      }
      await new Promise<void>((resolve, reject) => {
        wss.close((err) => (err === undefined ? resolve() : reject(err)));
      });
    },
  };
}
