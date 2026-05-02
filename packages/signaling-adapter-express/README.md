# @forinda/video-sdk-signaling-adapter-express

Mount Forinda RTC SDK signaling onto an existing **Express** HTTP server. Reuses your app's `http.Server` for the WebSocket upgrade so signaling and your REST endpoints share one port.

Ships **dual ESM + CJS** because most Express codebases are still CJS-first.

For a no-Express, port-of-its-own server, use [`@forinda/video-sdk-signaling-server`](https://www.npmjs.com/package/@forinda/video-sdk-signaling-server) (CLI + library) or [`@forinda/video-sdk-signaling-adapter-ws`](https://www.npmjs.com/package/@forinda/video-sdk-signaling-adapter-ws) (lower-level).

## Install

```bash
pnpm add @forinda/video-sdk-signaling-adapter-express @forinda/video-sdk-signaling-protocol express ws
```

> Peer deps: `express@^4 || ^5`, `ws@^8`. Node ≥ 20.

## Quick start

```ts
import express from "express";
import { createExpressSignaling } from "@forinda/video-sdk-signaling-adapter-express";

const app = express();

app.get("/", (_req, res) => {
  res.send("Hello + WebRTC signaling on /signaling");
});

const server = app.listen(3000, () => {
  console.log("HTTP + signaling on http://127.0.0.1:3000");
});

const signaling = createExpressSignaling({
  app,
  server,
  // Optional. Defaults to /signaling.
  path: "/signaling",
  authenticate: async (token, room) => verifyJwt(token, room),
});

process.on("SIGTERM", async () => {
  await signaling.close();
  server.close();
});
```

Clients connect to `ws://your-host:3000/signaling?token=…` (the default token extractor reads `?token=` from the upgrade URL).

## API

### `createExpressSignaling(options)` → `ExpressSignalingHandle`

| Option            | Type                                            | Default                                   | Description                                                                                            |
| ----------------- | ----------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `app`             | `express.Application`                           | —                                         | Required. Currently held for symmetry / future hooks; not used at runtime.                             |
| `server`          | `http.Server`                                   | —                                         | Required. The HTTP server (typically the return value of `app.listen(...)`).                           |
| `wss`             | `WebSocketServer`                               | `new WebSocketServer({ noServer: true })` | Bring your own server for advanced control (custom max-payload, perMessageDeflate, etc.).              |
| `path`            | `string`                                        | `/signaling`                              | URL path the WebSocket upgrade fires on.                                                               |
| `engine`          | `SignalingEngine`                               | `defineSignalingEngine({...})`            | Pre-built engine. When omitted, the adapter constructs one passing `authenticate` + `maxPeersPerRoom`. |
| `authenticate`    | `AuthenticateFn`                                | allow-all                                 | Per-join auth. Forwarded to the default engine; ignored when `engine` is supplied.                     |
| `maxPeersPerRoom` | `number`                                        | `50`                                      | Capacity. Forwarded to the default engine.                                                             |
| `socketId`        | `(req: IncomingMessage) => string`              | `crypto.randomUUID()`                     | Per-connection identifier.                                                                             |
| `extractToken`    | `(req: IncomingMessage) => string \| undefined` | reads `?token=` from upgrade URL          | Pulls the auth token off the upgrade request.                                                          |

The handle returned has:

| Field     | Type                  | Purpose                                                                                                 |
| --------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `wss`     | `WebSocketServer`     | The underlying `ws` server.                                                                             |
| `engine`  | `SignalingEngine`     | The engine driving validation and routing.                                                              |
| `session` | `Session`             | The single shared session for all sockets.                                                              |
| `close()` | `() => Promise<void>` | Detach the upgrade listener and close the wss. Doesn't stop Express — call `server.close()` separately. |

## Sharing auth with Express middleware

The `extractToken` callback receives the raw Node `IncomingMessage`, so you can pull from cookies, headers, or any path-scoped auth pattern:

```ts
import cookie from "cookie";

createExpressSignaling({
  app,
  server,
  extractToken: (req) => {
    const cookies = cookie.parse(req.headers.cookie ?? "");
    return cookies["session"];
  },
  authenticate: async (sessionId, room) => {
    const user = await sessionStore.lookup(sessionId);
    return user !== null && user.roomsAllowed.includes(room);
  },
});
```

## ESM + CJS interop

Both formats are exported from the same package:

```js
// CJS
const { createExpressSignaling } = require("@forinda/video-sdk-signaling-adapter-express");

// ESM
import { createExpressSignaling } from "@forinda/video-sdk-signaling-adapter-express";
```

## License

MIT.
