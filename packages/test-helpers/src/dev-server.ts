/**
 * `defineDevServer` — start a real `defineSignalingServer` for the duration
 * of a test, then tear it down cleanly. Useful for integration tests that
 * need an actual WebSocket signaling endpoint instead of the in-memory
 * pair.
 *
 * Pass `port: 0` (the default) to let the OS assign a free port — this
 * avoids cross-test collisions when several suites run in parallel. The
 * returned handle exposes the actual `port` and a ready-to-use `url`.
 *
 * @example
 * ```ts
 * import { defineDevServer } from "@forinda/test-helpers";
 *
 * const server = await defineDevServer();
 * try {
 *   const transport = defineWebSocketSignaling({ url: server.url });
 *   // ...
 * } finally {
 *   await server.close();
 * }
 * ```
 */

import {
  defineSignalingServer,
  type SignalingServerOptions,
} from "@forinda/video-sdk-signaling-server";

export interface DevServerOptions extends SignalingServerOptions {
  /** Bind port. Default `0` (OS-assigned). */
  port?: number;
}

export interface DevServerHandle {
  /** Resolved bind port (the actual port, even when `port: 0` was requested). */
  readonly port: number;
  /** Convenience `ws://127.0.0.1:<port>` URL for client transports. */
  readonly url: string;
  /** Stop the server and release the port. */
  close(): Promise<void>;
}

export async function defineDevServer(options: DevServerOptions = {}): Promise<DevServerHandle> {
  const { port = 0, ...rest } = options;
  const server = defineSignalingServer({ port, ...rest });

  // ws.WebSocketServer's address() is null until the underlying server is
  // bound. Poll briefly to avoid races on slow CI runners.
  const actualPort = await waitForPort(server.wss);
  const url = `ws://127.0.0.1:${actualPort}`;

  return {
    port: actualPort,
    url,
    async close(): Promise<void> {
      await server.close();
    },
  };
}

async function waitForPort(wss: { address(): null | string | { port: number } }): Promise<number> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    const addr = wss.address();
    if (addr !== null && typeof addr === "object" && typeof addr.port === "number") {
      return addr.port;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("defineDevServer: WebSocket server did not bind within 1000ms");
}
