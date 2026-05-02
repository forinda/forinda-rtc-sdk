/**
 * `defineSignalingServer` — thin wrapper around `signaling-adapter-ws` for
 * the standalone reference server. Same options + handle shape, plus a
 * default port.
 *
 * Use this when you don't already have an Express/Hono/Bun host and just
 * want a no-config WebSocket signaling server (locally for development, or
 * embedded in a small Node app).
 */

import {
  defineWebSocketSignalingServer,
  type WebSocketSignalingServer,
  type WebSocketSignalingServerOptions,
} from "@forinda/video-sdk-signaling-adapter-ws";

/** Default port when none is supplied. */
export const DEFAULT_PORT = 3000;

/** Options for {@link defineSignalingServer}. */
export interface SignalingServerOptions extends Omit<
  WebSocketSignalingServerOptions,
  "wss" | "port"
> {
  /** Bind port. Defaults to {@link DEFAULT_PORT}. Use `0` for OS-assigned random port. */
  port?: number;
}

/**
 * Build and start a standalone signaling server. Returns the same handle
 * shape as the underlying `defineWebSocketSignalingServer`.
 *
 * ```ts
 * const server = defineSignalingServer({ port: 3000 });
 * console.log("listening on ws://0.0.0.0:3000");
 * process.on("SIGTERM", () => server.close());
 * ```
 */
export function defineSignalingServer(opts: SignalingServerOptions = {}): WebSocketSignalingServer {
  const port = opts.port ?? DEFAULT_PORT;
  return defineWebSocketSignalingServer({
    port,
    ...(opts.engine !== undefined ? { engine: opts.engine } : {}),
    ...(opts.authenticate !== undefined ? { authenticate: opts.authenticate } : {}),
    ...(opts.maxPeersPerRoom !== undefined ? { maxPeersPerRoom: opts.maxPeersPerRoom } : {}),
    ...(opts.socketId !== undefined ? { socketId: opts.socketId } : {}),
    ...(opts.extractToken !== undefined ? { extractToken: opts.extractToken } : {}),
  });
}
