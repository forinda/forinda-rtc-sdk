# @forinda/video-sdk-signaling-ws

Browser-side WebSocket signaling transport for the Forinda RTC SDK. Implements the `SignalingTransport` interface from `@forinda/video-sdk-core` over a real `WebSocket`, with production behaviors built in: auto-reconnect with exponential backoff, outbound message buffering across connect/reconnect, ping/pong heartbeat with liveness detection, and pluggable token-based auth.

You will use this package alongside `@forinda/video-sdk-core` (publisher/viewer factories) — the transport is the network seam between the SDK and your signaling server.

## Install

```bash
pnpm add @forinda/video-sdk-signaling-ws @forinda/video-sdk-core
```

> Peer dependencies: `@forinda/video-sdk-core` and `@forinda/video-sdk-signaling-protocol` (the latter is transitive via `core` — you don't normally import it directly).

## Quick start

```ts
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";
import { definePublisher, getUserMedia } from "@forinda/video-sdk-core";

const signaling = defineWebSocketSignaling({
  url: "wss://signal.example.com",
});

const stream = await getUserMedia({ audio: true, video: true });

const publisher = definePublisher({
  signaling,
  room: "demo",
  stream,
});

publisher.on("viewer", ({ peerId }) => console.log("viewer joined:", peerId));
await publisher.start();
```

The viewer side is symmetric — pass the same `defineWebSocketSignaling({ url })` to `defineViewer({ signaling, room, publisherId })`.

## API

### `defineWebSocketSignaling(opts): WebSocketSignaling`

Factory function returning a `WebSocketSignaling` instance that satisfies the `SignalingTransport` contract. Recommended call style.

### `class WebSocketSignaling`

Exported for type imports + `instanceof` checks. Prefer the factory at call sites.

Implements `SignalingTransport`:

```ts
interface SignalingTransport {
  state: TransportState; // "idle" | "connecting" | "connected" | "reconnecting" | "closed"
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: SignalingMessageType): Promise<void>;
  on(event: "message", h: (msg: SignalingMessageType) => void): () => void;
  on(event: "state", h: (s: TransportState) => void): () => void;
}
```

### `nextBackoff(attempt, opts?): number`

Exponential backoff helper used internally by the reconnect loop. Exported for advanced consumers who want to reuse the math (e.g., a custom transport).

## Options

| Option                | Type                              | Default                       | Notes                                                                                                           |
| --------------------- | --------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `url`                 | `string`                          | required                      | `wss://...` or `ws://...` endpoint of your signaling server.                                                    |
| `protocols`           | `string \| string[]`              | none                          | Forwarded to the `WebSocket` constructor.                                                                       |
| `wsFactory`           | `(url, protocols?) => WebSocket`  | `(...) => new WebSocket(...)` | Override the constructor. Used by tests; also lets non-browser hosts inject a polyfilled `WebSocket`.           |
| `reconnect`           | `boolean`                         | `true`                        | Auto-reconnect on unexpected close. Set `false` to transition straight to `closed` on drop.                     |
| `backoff.initialMs`   | `number`                          | `1000`                        | Delay before the first reconnect attempt.                                                                       |
| `backoff.maxMs`       | `number`                          | `30000`                       | Cap for exponential growth.                                                                                     |
| `backoff.jitter`      | `number` (0..1)                   | `0.25`                        | Random jitter range as a fraction of the computed delay (`±25%` by default). Avoids thundering-herd reconnects. |
| `heartbeatIntervalMs` | `number`                          | `30000`                       | Ping every N ms. Set `0` to disable both pinging and the liveness watchdog.                                     |
| `auth`                | `() => string \| Promise<string>` | none                          | Resolves a token; appended as `?token=...` (or `&token=...`) on every connect attempt.                          |

## Behavior

### Lifecycle

```
idle -> connecting -> connected -> reconnecting -> connected ...
                              \-> closed (user disconnect or reconnect: false)
```

`connect()` is idempotent — calling it while in `connecting` or `connected` is a no-op. Same for `disconnect()` once `closed`.

### Outbound buffering

Messages sent while not yet `connected` (during `idle`, `connecting`, or `reconnecting`) are queued and flushed in registration order on the next `open` event. **The buffer survives reconnect attempts** — if the socket drops mid-call, queued messages will still go out on the new socket.

### Heartbeat + liveness

- The transport sends a literal `'{"type":"ping"}'` JSON frame every `heartbeatIntervalMs`. This payload is **not** a wire-format message; servers should ignore it (or reply with a similarly informal `{"type":"pong"}`).
- Inbound activity (any `message` event, including the `pong` reply) resets a "last activity" timestamp.
- If no inbound activity is observed for `2 × heartbeatIntervalMs`, the transport calls `ws.close(4000, "heartbeat timeout")`, which triggers the auto-reconnect loop.

### Auth

When the `auth` callback is supplied, the resolved token is appended to the URL as `?token=<encoded>` (or `&token=<encoded>` if the URL already contains a query string). The callback is invoked **on every connect attempt** including reconnects, so rotated tokens just work.

The token is sent in the URL only — the WebSocket protocol does not support custom headers in browsers. If your server needs richer auth, consider a one-time token exchange via HTTP first, then pass the short-lived ws token here.

### Validation

Every inbound message is validated against the wire-format schema from `@forinda/video-sdk-signaling-protocol`. Malformed JSON or schema-failing payloads are dropped with a `getLogger().warn(...)` log entry — they never reach `message` handlers. The transport-internal `pong` frame and any unrecognized control frames are silently ignored.

### Reconnect loop

The reconnect loop is **unbounded**. It will keep trying forever with exponential backoff. Session-level give-up is the consumer's responsibility — the `Publisher` and `Viewer` from `@forinda/video-sdk-core` carry their own `RetryPolicy` that bounds retries by attempt count or wall-clock duration.

If you want hard transport-level give-up, set `reconnect: false` and handle the `state: "closed"` event yourself.

## Common patterns

### Custom backoff for low-latency apps

```ts
defineWebSocketSignaling({
  url: "wss://signal.example.com",
  backoff: { initialMs: 250, maxMs: 5_000, jitter: 0.5 },
});
```

### Disable heartbeat in tests

```ts
defineWebSocketSignaling({ url: "...", heartbeatIntervalMs: 0 });
```

### One-shot auth token (not rotated)

```ts
const token = await fetchToken();
defineWebSocketSignaling({ url: "wss://signal.example.com", auth: () => token });
```

### Rotated tokens (refresh on every reconnect)

```ts
defineWebSocketSignaling({
  url: "wss://signal.example.com",
  auth: async () => {
    const fresh = await fetchToken();
    return fresh;
  },
});
```

## Pitfalls

- **Heartbeat ping is not a wire-format message.** If your server validates every frame strictly, allow `{"type":"ping"}` through (or set `heartbeatIntervalMs: 0`).
- **The reconnect loop is unbounded.** Don't rely on it timing out — wrap with `RetryPolicy` upstream.
- **Tokens go in the URL.** Don't embed long-lived secrets; use short-lived tokens.
- **`send()` never throws even when disconnected.** Messages queue silently. Watch the `state` event if you need backpressure.

## License

MIT — © 2026 Felix Orinda.
