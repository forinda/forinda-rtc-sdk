# @forinda/video-sdk-signaling-adapter-hono

Hono integration for the Forinda RTC SDK signaling protocol.

> ⚠️ **Stub package — implementation deferred.** The package is reserved on the registry and exports an empty surface. Use one of the workarounds below for production today.

## Status

The full Hono adapter (mounting WebSocket signaling onto a Hono app, sharing auth middleware via Hono context) is a planned epic. Until it lands, this package is a placeholder so the name is reserved on npm and adopters can pin it without their lockfile churning when v0.x→0.y arrives.

## Workaround

Hono apps can use signaling **today** in one of two ways:

### Option A — separate signaling server, same process

Run [`@forinda/video-sdk-signaling-adapter-ws`](https://www.npmjs.com/package/@forinda/video-sdk-signaling-adapter-ws) on its own port from the same Node/Bun process as your Hono app:

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server"; // or Bun's native serve
import { defineWebSocketSignalingServer } from "@forinda/video-sdk-signaling-adapter-ws";

const app = new Hono();
app.get("/", (c) => c.text("Hono app"));

serve({ fetch: app.fetch, port: 3000 });
const signaling = defineWebSocketSignalingServer({ port: 3001 });
```

Clients hit `http://your-host:3000` for HTTP and `ws://your-host:3001` for signaling. Two ports. Acceptable for most deployments behind a reverse proxy that routes `/signaling/*` to port 3001.

### Option B — Bun + same port

If you're on Bun, [`@forinda/video-sdk-signaling-adapter-bun`](https://www.npmjs.com/package/@forinda/video-sdk-signaling-adapter-bun) (also a stub today) will eventually integrate with Bun's native HTTP/WebSocket server. Until then, Option A is the answer.

## When this lands

If you want a native Hono adapter sooner, open an issue describing your use case.

## License

MIT.
