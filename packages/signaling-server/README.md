# @forinda/video-sdk-signaling-server

Standalone reference signaling server for the Forinda RTC SDK. Ships as both:

- A **library** (`defineSignalingServer({ port })`) — drop into any Node app.
- A **CLI** (`forinda-rtc-signaling --port 3000`) — zero-config local server.

Both modes wrap the underlying `@forinda/video-sdk-signaling-adapter-ws` (Node `ws`-backed adapter), so they share the same engine + session plumbing.

## Install

```bash
pnpm add @forinda/video-sdk-signaling-server
# or, for the CLI globally:
pnpm add -g @forinda/video-sdk-signaling-server
```

> The CLI also runs via `npx @forinda/video-sdk-signaling-server` without a global install.

## CLI

```bash
forinda-rtc-signaling --help
```

```
Usage: forinda-rtc-signaling [options]

Standalone reference signaling server for the Forinda RTC SDK.
Speaks the wire-format protocol from @forinda/video-sdk-signaling-protocol.

Options:
  -V, --version      output the version number
  -p, --port <port>  Bind port (use 0 for OS-assigned) (default: "3000")
  --max-peers <n>    Max peers per room (default: "50")
  -h, --help         display help for command
```

Examples:

```bash
# Default port 3000
forinda-rtc-signaling

# Custom port + room cap
forinda-rtc-signaling --port 8080 --max-peers 20

# OS-assigned port (useful in dev)
forinda-rtc-signaling -p 0
```

The server logs the bound address and shuts down cleanly on SIGINT/SIGTERM.

## Library

```ts
import { defineSignalingServer } from "@forinda/video-sdk-signaling-server";

const server = defineSignalingServer({
  port: 3000,
  authenticate: async (token, room) => verifyJwt(token),
  maxPeersPerRoom: 50,
});

console.log("listening on ws://0.0.0.0:3000");

process.on("SIGTERM", async () => {
  await server.close();
});
```

The returned handle has the same shape as `WebSocketSignalingServer` from `@forinda/video-sdk-signaling-adapter-ws`:

```ts
interface WebSocketSignalingServer {
  readonly wss: WebSocketServer;
  readonly engine: SignalingEngine;
  readonly session: Session;
  close(): Promise<void>;
}
```

## Options

| Option            | Type                                            | Default        | Notes                                          |
| ----------------- | ----------------------------------------------- | -------------- | ---------------------------------------------- |
| `port`            | `number`                                        | `3000`         | Bind port. Use `0` for OS-assigned random.     |
| `engine`          | `SignalingEngine`                               | auto           | Bring your own to share state across adapters. |
| `authenticate`    | `(token?, room) => boolean \| Promise<boolean>` | none           | Per-join auth check.                           |
| `maxPeersPerRoom` | `number`                                        | `50`           | Forwarded to the default-constructed engine.   |
| `socketId`        | `(request) => string`                           | `randomUUID()` | Stable per-connection id.                      |
| `extractToken`    | `(request) => string \| undefined`              | `?token=...`   | Where the token comes from.                    |

## What this is for

- **Local development**: spin up signaling without standing up Express/Hono/Bun.
- **Demos and tests**: reproducible, no-config server.
- **Small deployments**: <50 concurrent peers, single process.

## What this is NOT for

- **Production at scale**: no horizontal scaling (no Redis, no shared state). For multi-process deploys, embed `@forinda/video-sdk-signaling-adapter-*` in your existing infra.
- **HTTPS termination**: serve plain `ws://` and put a TLS-terminating reverse proxy (nginx, Caddy, Cloudflare) in front of it.
- **Auth beyond a callback**: bring your own JWT verifier in `authenticate`.

## Internals

- **Argv parsing:** [Commander](https://github.com/tj/commander.js).
- **Color output:** [picocolors](https://github.com/alexeyraspopov/picocolors).
- **Bin shim:** `bin/run.mjs` is a tiny ESM entrypoint that imports the compiled `dist/cli.js` and invokes its `main` export. Keeping the shim minimal lets the build output evolve without invalidating installed symlinks.

## License

MIT — © 2026 Felix Orinda.
