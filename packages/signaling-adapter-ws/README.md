# @forinda/video-sdk-signaling-adapter-ws

Node `ws`-backed WebSocket signaling server adapter for the Forinda RTC SDK. Wires a [`SignalingEngine`](https://www.npmjs.com/package/@forinda/video-sdk-signaling-protocol) to a real `WebSocketServer` so any WebRTC client built with `@forinda/video-sdk-core` (or `@forinda/video-sdk-react`, or `@forinda/video-sdk-elements`) can negotiate against it.

For a no-config "just give me a server" experience, use [`@forinda/video-sdk-signaling-server`](https://www.npmjs.com/package/@forinda/video-sdk-signaling-server) — it wraps this adapter with a CLI and sensible defaults. Use this package directly when you want to run the adapter inside an existing Node process or share a `WebSocketServer` with another protocol.

## Install

```bash
pnpm add @forinda/video-sdk-signaling-adapter-ws @forinda/video-sdk-signaling-protocol ws
```

> Peer dep: `ws@^8`. Node ≥ 20.

## Quick start

Stand up a server on its own port:

```ts
import { defineWebSocketSignalingServer } from "@forinda/video-sdk-signaling-adapter-ws";

const server = defineWebSocketSignalingServer({ port: 8787 });

console.log(`signaling on ws://127.0.0.1:${(server.wss.address() as { port: number }).port}`);

process.on("SIGTERM", async () => {
  await server.close();
  process.exit(0);
});
```

Or share an existing `WebSocketServer` (e.g. one already mounted on your HTTP server):

```ts
import { WebSocketServer } from "ws";
import { defineWebSocketSignalingServer } from "@forinda/video-sdk-signaling-adapter-ws";

const wss = new WebSocketServer({ port: 8080 });
const server = defineWebSocketSignalingServer({ wss });
// server.wss === wss
```

## API

### `defineWebSocketSignalingServer(options)` → `WebSocketSignalingServer`

| Option            | Type                                            | Default                          | Description                                                                                                  |
| ----------------- | ----------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `wss`             | `WebSocketServer`                               | created on `port`                | Bring your own `ws` server. Required when `port` is omitted.                                                 |
| `port`            | `number`                                        | —                                | Bind a freshly-created `WebSocketServer` to this port. Use `0` for an OS-assigned port.                      |
| `engine`          | `SignalingEngine`                               | `defineSignalingEngine({...})`   | Pre-built engine. When omitted, the adapter constructs one passing `authenticate` + `maxPeersPerRoom` below. |
| `authenticate`    | `AuthenticateFn`                                | allow-all                        | Per-join auth callback. Forwarded to the default engine; ignored when `engine` is supplied.                  |
| `maxPeersPerRoom` | `number`                                        | `50`                             | Capacity. Forwarded to the default engine; ignored when `engine` is supplied.                                |
| `socketId`        | `(req: IncomingMessage) => string`              | `crypto.randomUUID()`            | Per-connection identifier (used internally by the engine for routing).                                       |
| `extractToken`    | `(req: IncomingMessage) => string \| undefined` | reads `?token=` from request URL | Pulls the auth token off the upgrade request before passing to `authenticate`.                               |

The handle returned has:

| Field     | Type                  | Purpose                                         |
| --------- | --------------------- | ----------------------------------------------- |
| `wss`     | `WebSocketServer`     | The underlying `ws` server (yours or new).      |
| `engine`  | `SignalingEngine`     | The engine driving validation and routing.      |
| `session` | `Session`             | The single shared session for all sockets.      |
| `close()` | `() => Promise<void>` | Drain clients, detach listeners, close the wss. |

## Authentication

```ts
const server = defineWebSocketSignalingServer({
  port: 8787,
  authenticate: async (token, room) => {
    if (token === undefined) return false;
    const claims = await verifyJwt(token);
    return claims.allowedRooms.includes(room);
  },
});
```

Tokens are extracted from `?token=…` on the WebSocket upgrade URL by default. Override `extractToken` to pull from a header or cookie:

```ts
defineWebSocketSignalingServer({
  port: 8787,
  extractToken: (req) => req.headers["x-room-token"]?.toString(),
  authenticate: (token, room) => verifyJwt(token, room),
});
```

## What it doesn't do

- **No HTTP layer.** Use [`@forinda/video-sdk-signaling-adapter-express`](https://www.npmjs.com/package/@forinda/video-sdk-signaling-adapter-express) when you need an Express HTTP app sharing the same port, or wrap your own `http.Server` and pass its `WebSocketServer` via `wss`.
- **No persistence.** Rooms and presence live in-process. For horizontal-scale deployments you'll need a Redis pub/sub layer (on the roadmap).
- **No rate limiting.** Per-peer rate limits are on the roadmap. Until then, gate at the WebSocket layer (`ws`'s `maxPayload`, OS-level connection limits, or a reverse-proxy quota).

## License

MIT.
