# dev-signaling-server

Internal runnable used by the example apps and integration tests. Wraps [`@forinda/video-sdk-signaling-server`](../../packages/signaling-server) with default port 8787, console logging, and graceful SIGINT/SIGTERM shutdown.

> Private package (`private: true`). Never published to npm. Use `@forinda/video-sdk-signaling-server` directly in your own apps.

## Run

From the repo root:

```bash
pnpm dev:server
```

Equivalent to:

```bash
pnpm --filter dev-signaling-server dev
```

You'll see:

```
[dev-signaling-server] listening on ws://127.0.0.1:8787
```

The example apps in `examples/` are pre-configured to point at this URL.

## Configuration

| Env var | Default     | Description                           |
| ------- | ----------- | ------------------------------------- |
| `PORT`  | `8787`      | Bind port. Use `0` for OS-assigned.   |
| `HOST`  | `127.0.0.1` | Display-only — `ws` binds all ifaces. |

```bash
PORT=9000 pnpm dev:server
```

## Stop

Ctrl-C. The server runs `shutdown()` which calls `server.close()` (drains connected clients) and exits cleanly.

## When to use what

| Use this                                                                     | When                                                                                         |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm dev:server` (this app)                                                 | Local development against the example apps; not for production.                              |
| `forinda-rtc-signaling` CLI                                                  | Running the reference server from outside this repo (`@forinda/video-sdk-signaling-server`). |
| `defineSignalingServer({...})`                                               | Embedding signaling inside your own Node process.                                            |
| `defineWebSocketSignalingServer` (`@forinda/video-sdk-signaling-adapter-ws`) | Sharing a `WebSocketServer` with another protocol or running in a custom event loop.         |
