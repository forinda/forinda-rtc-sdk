# @forinda/video-sdk-signaling-broadcast

Same-tab `SignalingTransport` for the Forinda RTC SDK, built on the browser's `BroadcastChannel` API. Useful for demos, tests, and any case where publisher and viewer run inside the same browsing context — no signaling server needed.

If you want a real network transport (cross-machine, cross-origin), use `@forinda/video-sdk-signaling-ws` instead.

## Install

```bash
pnpm add @forinda/video-sdk-signaling-broadcast @forinda/video-sdk-core
```

> Peer dependencies: `@forinda/video-sdk-core` and `@forinda/video-sdk-signaling-protocol` (transitive via core).

## Quick start

Two transports on the same channel name talk to each other:

```ts
import { defineBroadcastSignaling } from "@forinda/video-sdk-signaling-broadcast";
import { definePublisher, defineViewer, getUserMedia } from "@forinda/video-sdk-core";

// Publisher (in tab A or component A)
const pubSignaling = defineBroadcastSignaling({ channel: "demo-room" });
const publisher = definePublisher({
  signaling: pubSignaling,
  room: "demo",
  stream: await getUserMedia({ audio: true, video: true }),
});
await publisher.start();

// Viewer (in tab B or component B, same origin)
const viewerSignaling = defineBroadcastSignaling({ channel: "demo-room" });
const viewer = defineViewer({
  signaling: viewerSignaling,
  room: "demo",
  publisherId: publisher.peerId, // get this however you'd like
});
viewer.on("track", ({ stream }) => {
  videoEl.srcObject = stream;
});
await viewer.start();
```

> Note: `BroadcastChannel` cannot bridge two different origins or two different machines. For real signaling, use `@forinda/video-sdk-signaling-ws`.

## API

### `defineBroadcastSignaling(opts): BroadcastSignaling`

Factory function returning a `BroadcastSignaling` instance that satisfies the `SignalingTransport` contract from `@forinda/video-sdk-core`. Recommended call style.

### `class BroadcastSignaling`

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

## Options

| Option    | Type     | Default  | Notes                                                                                            |
| --------- | -------- | -------- | ------------------------------------------------------------------------------------------------ |
| `channel` | `string` | required | The `BroadcastChannel` name. Two transports must share the **exact same** string to communicate. |

That's it — no reconnect config, no heartbeat, no auth. The whole point of this transport is simplicity for local-only scenarios.

## Behavior

### Lifecycle

```
idle -> connecting -> connected -> closed
```

`connect()` synchronously transitions to `connected` (BroadcastChannel has no real handshake). `disconnect()` always reaches `closed`. The `reconnecting` state is never visited — channels don't drop while the tab is alive.

### Send / receive

- `send(message)` calls `BroadcastChannel.postMessage(message)` directly. The browser handles structured cloning; **no JSON serialization happens at this layer**. This means the message arrives as the same JS object structure the sender passed.
- Inbound messages are validated against the wire-format schema from `@forinda/video-sdk-signaling-protocol`. Schema-failing payloads are dropped with a `getLogger().warn(...)` log — they never reach `message` handlers.
- The transport delivers to **every other** transport on the same channel including transports owned by other components in the same tab. Multiple viewers, multiple publishers — all see every message.

### Throwing on send while disconnected

Unlike `signaling-ws` (which buffers), `BroadcastSignaling.send()` **throws** when called before `connect()` or after `disconnect()`. There's no reason to buffer for a synchronous transport — if you're trying to send, you should already be connected.

## Common patterns

### Demo: publisher + viewer in the same React component

```tsx
import { defineBroadcastSignaling } from "@forinda/video-sdk-signaling-broadcast";

function DemoLoopback() {
  const channel = useId();
  const pubSignaling = useMemo(() => defineBroadcastSignaling({ channel }), [channel]);
  const viewerSignaling = useMemo(() => defineBroadcastSignaling({ channel }), [channel]);
  // ... build publisher + viewer with these transports ...
}
```

### Test fixture

```ts
import { defineBroadcastSignaling } from "@forinda/video-sdk-signaling-broadcast";

it("publisher↔viewer happy path", async () => {
  const channel = `test-${crypto.randomUUID()}`;
  const a = defineBroadcastSignaling({ channel });
  const b = defineBroadcastSignaling({ channel });
  // ... drive the test ...
  await a.disconnect();
  await b.disconnect();
});
```

## Pitfalls

- **`send()` throws when not connected.** Always `await connect()` first.
- **Channel names are exact strings.** A typo silently produces a "no one is listening" channel.
- **Cross-origin / cross-machine doesn't work.** This is by design — `BroadcastChannel` is local. Use `@forinda/video-sdk-signaling-ws` for real signaling.
- **Every transport on the channel sees every message.** If you have N viewers sharing one channel, every viewer receives every other peer's traffic. This is fine for v0.1.0 (the wire format is point-to-point with explicit `from`/`to`), but not a transport for multi-room scaling.

## License

MIT — © 2026 Felix Orinda.
