/**
 * Local dev signaling server — boots `defineSignalingServer` on port 8787.
 *
 * Started by `pnpm dev:server` from the repo root; consumed by the example
 * apps under `examples/`.
 */

import { defineSignalingServer } from "@forinda/video-sdk-signaling-server";

const PORT = Number(process.env.PORT ?? 8787);
const server = defineSignalingServer({ port: PORT });

console.log(`[dev-signaling-server] listening on ws://127.0.0.1:${PORT}`);

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[dev-signaling-server] received ${signal}, shutting down`);
  await server.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
