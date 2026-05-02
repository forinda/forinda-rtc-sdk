/**
 * Public surface for `@forinda/video-sdk-signaling-server` (library entry).
 *
 * The CLI lives at `./cli.ts` and is not re-exported here; consumers access
 * it via the package's `bin` entry (`forinda-signaling`).
 */

export { defineSignalingServer, DEFAULT_PORT, type SignalingServerOptions } from "./server.ts";

// Re-export the underlying handle type for consumers who want strict typing.
export type {
  WebSocketSignalingServer,
  WebSocketSignalingServerOptions,
} from "@forinda/video-sdk-signaling-adapter-ws";
