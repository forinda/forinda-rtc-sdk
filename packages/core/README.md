# @forinda/video-sdk-core

Framework-agnostic WebRTC publish/view core for the Forinda video SDK. Browser-only, ESM-only.

## Install

```bash
pnpm add @forinda/video-sdk-core @forinda/video-sdk-signaling-protocol @forinda/video-sdk-signaling-ws
```

> `@forinda/video-sdk-signaling-protocol` is the wire-format dep; `@forinda/video-sdk-signaling-ws` provides the WebSocket transport used in the quick-start. Drop it (or swap for `@forinda/video-sdk-signaling-broadcast`) if you bring your own transport.

## Quick start

```ts
import { definePublisher, defineViewer, getUserMedia } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

const stream = await getUserMedia({ audio: true, video: true });

// Publisher side
const publisher = definePublisher({
  signaling: defineWebSocketSignaling({ url: "wss://signal.example.com" }),
  room: "demo",
  stream,
  retry: { maxAttempts: 5 },
});
publisher.on("viewer", ({ peerId }) => console.log("viewer joined:", peerId));
publisher.on("state", (s) => console.log("publisher state:", s));
await publisher.start();

// Viewer side
const viewer = defineViewer({
  signaling: defineWebSocketSignaling({ url: "wss://signal.example.com" }),
  room: "demo",
  publisherId: "alice",
});
viewer.on("track", ({ stream }) => {
  videoEl.srcObject = stream;
});
await viewer.start();
```

## What ships

**Primitives:**

- **Logger** — `setLogger(impl)`, default noop. Pluggable; never installs global handlers.
- **Emitter** — typed `defineEmitter<Events>()` with `on` / `once` / `off` / `emit` / `removeAllListeners`.
- **Errors** — `SdkError` hierarchy + re-exported `SignalingProtocolError` tree. Stable `code` strings.
- **Media** — `getUserMedia`, `getDisplayMedia` (screen share), `enumerateDevices`, `watchDevices`, `replaceVideoTrack`, `replaceAudioTrack`, `buildConstraints`.
- **Peer** — `definePeerConnection`, `defineNegotiator` (perfect-negotiation pattern), `normalizeIceServers`, SDP read helpers.
- **Stats** — `defineStatsCollector` polling wrapper + `normalizeStats` reducer + `ConnectionStats` flat shape.
- **Signaling** — `SignalingTransport` interface + re-exported wire-format types.

**Orchestration:**

- **State machine** — `ConnectionState` lifecycle (`idle` → `connecting` → `connected` → `reconnecting` → `failed` → `closed`), `defineStateMachine` enforcer.
- **Retry policy** — `defineRetryPolicy` exponential backoff + jitter, bounded by `maxAttempts` / `maxDurationMs`.
- **Publisher** — `definePublisher`: signaling join, per-viewer `RTCPeerConnection` management, SDP/ICE routing, stats aggregation, hot-swap, auto-retry.
- **Viewer** — `defineViewer`: signaling join, single upstream PC, track event, stats, auto-retry.

**Higher-level Room (recommended for media + chat in the same tab):**

- **Room** — `defineRoom({ signaling, room, peerId? })`: owns the transport's connect/disconnect and the **single** `join` for the room. Eliminates the footgun where a `Publisher` and a `RoomChannel` (or any other child) sharing one transport silently overwrite each other's join binding.

```ts
import { defineRoom, defineWebSocketSignaling, getUserMedia } from "@forinda/video-sdk-core";

const stream = await getUserMedia({ audio: true, video: true });
const signaling = defineWebSocketSignaling({ url: "wss://signal.example.com" });
const room = defineRoom({ signaling, room: "demo", peerId: "alice" });

// Sugar — equivalent to defineAttachedPublisher(room, ...) etc.
const publisher = room.publisher({ stream });
const channel = room.channel(); // presence + chat over the same socket
const recorder = room.recorder(stream); // pure local recording

await publisher.start(); // issues the single join for the Room (role: publisher)
await channel.start(); // shares the join — no second join, no engine overwrite
recorder.start();
// ...
await room.close(); // sends one leave + closes the transport
```

The Room **does not** auto-stop its children. Stop publisher / viewer / channel explicitly before `room.close()` if you want their cleanup to fire (each `stop()` is idempotent).

Without the sugar: `defineAttachedPublisher(room, opts)`, `defineAttachedViewer(room, opts)`, `defineAttachedRoomChannel(room, opts)`. Standalone `definePublisher` / `defineViewer` / `defineRoomChannel` continue to work unchanged — use those when each component owns its own transport.

**Room channel (standalone presence + chat):**

- **Room channel** — `defineRoomChannel({ signaling, room, peerId? })`: presence + chat layer that piggybacks on the same signaling transport. No media.

```ts
import { defineRoomChannel, defineWebSocketSignaling } from "@forinda/video-sdk-core";

const signaling = defineWebSocketSignaling({ url: "wss://signal.example.com" });
const channel = defineRoomChannel({ signaling, room: "demo", peerId: "alice" });
await channel.start();

await channel.raiseHand(); // sugar over setAttribute("hand-raised", true)
await channel.setAttribute("status", "🎬"); // arbitrary JSON-serializable values
await channel.sendChat("hi room");
await channel.sendChat("psst", { to: "bob" }); // DM

channel.on("presence", ({ peer, attributes }) => console.log(peer, attributes));
channel.on("chat", (m) => console.log(`${m.from}: ${m.body}`));
console.log(channel.peers); // ReadonlyMap<peerId, attrs>
console.log(channel.chatHistory); // capped at chatHistoryLimit (default 200)
```

#### Optimistic chat + ack reconciliation

`sendChat()` is optimistic — it appends a `pending` entry to `chatHistory` synchronously and emits `chat` immediately so your UI can render the message before the round-trip. The server echoes the message back with the same `clientId`; the channel matches the echo and flips the entry to `confirmed`. If no echo arrives within `chatAckTimeoutMs` (default `10_000`), the entry flips to `failed`.

```ts
channel.on("chat-status", ({ id, status }) => {
  console.log(id, status); // "<uuid>", "pending" → "confirmed" (or "failed")
});

const id = await channel.sendChat("hello"); // returns the entry id
```

`ChatHistoryEntry.status` is `"pending" | "confirmed" | "failed"`; `ChatHistoryEntry.id` matches the `chat-status` event payload.

#### Retry + presence resync

When the underlying transport closes unexpectedly, `RoomChannel` enters `reconnecting`, retries with exponential backoff (per `defineRetryPolicy`), re-issues `join` (when `manageJoin: true`), and re-broadcasts every previously-set own presence attribute so other peers see the right state. Subscribe to the channel-level `state` event for UI feedback:

```ts
channel.on("state", (s) => console.log(s));
// "connecting" → "connected" → ("reconnecting" → "connected") → "closed"
```

In-flight pending chats at the moment of the drop are flipped to `failed` — `signaling.send` resolving doesn't actually prove the engine received the message.

| Option             | Default               | Purpose                                                                                                                                                                |
| ------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signaling`        | —                     | Required. Pre-built `SignalingTransport`. Channel never opens or closes it itself.                                                                                     |
| `room`             | —                     | Required. Room id.                                                                                                                                                     |
| `peerId`           | `crypto.randomUUID()` | Self identifier.                                                                                                                                                       |
| `manageJoin`       | `true`                | Issue `join` (role `presence`) on `start()` and matching `leave` on `stop()`. Pass `false` to share a transport with a Publisher/Viewer that already manages the join. |
| `chatHistoryLimit` | `200`                 | Cap on the rolling chat-history buffer.                                                                                                                                |
| `chatAckTimeoutMs` | `10_000`              | Wait this long for a server-echo before flipping a pending chat to `failed`.                                                                                           |
| `retry`            | enabled               | `RetryConfig` for transport-drop recovery. Reconnects, re-issues join, re-broadcasts presence, marks pending chats failed. `{ enabled: false }` to disable.            |

| Method                        | Purpose                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `start()` / `stop()`          | Subscribe / unsubscribe; manage `join` / `leave` if owned.                                                                 |
| `setAttribute(key, value)`    | Set or replace one own presence attribute.                                                                                 |
| `removeAttribute(key)`        | Remove one own attribute (sends `null` over the wire).                                                                     |
| `clearAttributes()`           | Remove every attribute previously set by this channel.                                                                     |
| `raiseHand()` / `lowerHand()` | Sugar for `setAttribute("hand-raised", true/false)`.                                                                       |
| `sendChat(body, { to? })`     | Optimistic broadcast or DM (`body` ≤ 8192 chars). Resolves with the entry's `id`.                                          |
| `peers` (getter)              | `ReadonlyMap<peerId, attributes>` — live view.                                                                             |
| `chatHistory` (getter)        | Read-only ordered array, oldest first. Each entry has `id` + `status`.                                                     |
| `state` (getter)              | `"idle" \| "connecting" \| "connected" \| "reconnecting" \| "closed"`.                                                     |
| `on(event, handler)`          | `presence`, `presence-snapshot`, `peer-joined`, `peer-left`, `chat`, `chat-status`, `state`, `error`. Returns unsubscribe. |

The channel **does not own its transport's lifecycle** — the consumer is responsible for connecting/disconnecting it. Sharing one transport with a `Publisher` or `Viewer` is the common case; pass `manageJoin: false` so the join is issued only once.

For delta UIs ("Bob just raised his hand"), pair with `definePresenceDiff(prev, next)`:

```ts
import { definePresenceDiff } from "@forinda/video-sdk-core";

let prev = channel.peers;
channel.on("presence", () => {
  const next = channel.peers;
  const diff = definePresenceDiff(prev, next);
  diff.added.forEach(({ peer }) => log(`${peer} joined`));
  diff.changed.forEach(({ peer, changed }) => log(`${peer} updated`, changed));
  diff.removed.forEach(({ peer }) => log(`${peer} left`));
  prev = next;
});
```

**Recording:**

- **Recorder** — `defineRecorder(stream, opts?)`: typed wrapper over `MediaRecorder`. Picks a supported mime type from `codecPreferences` (or honors an explicit `mimeType`), exposes a tiny state machine, and assembles the final `Blob` on `stop()`.

```ts
import { defineRecorder } from "@forinda/video-sdk-core";

const recorder = defineRecorder(stream, {
  mimeType: "video/webm;codecs=vp9,opus", // optional — auto-picked when omitted
  videoBitsPerSecond: 2_500_000,
  timesliceMs: 1_000, // emit a chunk every 1s for streaming uploads
});
recorder.on("start", ({ mimeType }) => console.log("recording as", mimeType));
recorder.on("dataavailable", ({ data }) => uploadChunk(data));
recorder.on("stop", ({ blob, durationMs }) => downloadAs("clip.webm", blob));
recorder.start();
// later
const blob = await recorder.stop();
```

| Option               | Default                               | Purpose                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mimeType`           | first supported in `codecPreferences` | Pin a specific codec; throws on `start` if unsupported.                                                                                                                                                                  |
| `codecPreferences`   | `DEFAULT_CODEC_PREFERENCES`           | Fallback list. Default tries VP9, VP8, bare WebM, MP4 in order.                                                                                                                                                          |
| `videoBitsPerSecond` | browser default                       | Forwarded to `MediaRecorder`.                                                                                                                                                                                            |
| `audioBitsPerSecond` | browser default                       | Forwarded to `MediaRecorder`.                                                                                                                                                                                            |
| `timesliceMs`        | one chunk on stop                     | Emit `dataavailable` every N ms instead of only at the end.                                                                                                                                                              |
| `maxBufferedBytes`   | unbounded                             | Hard cap on retained chunk bytes. On overflow the recorder fires `buffer-overflow`, transitions to `error`, and stops the underlying `MediaRecorder`. Prevents OOM on multi-hour recordings without a draining uploader. |

State machine: `idle → recording → (paused ↔ recording) → stopped`. Errors transition to a terminal `error` state and surface as typed `Error` events (never bare DOM events). The recorder exposes `bufferedByteCount` (live size of retained chunks) for monitoring.

Plus two helpers: `isRecordingTypeSupported(mimeType)` and `pickRecordingType(preferences)` for capability detection without instantiating a recorder.

> **iOS / Safari quirk:** `MediaRecorder` is unreliable pre-iOS-17 and may flake on long sessions. Detect via `isRecordingTypeSupported` and gate the recording UI accordingly.

### Uploading recordings

Pair `defineRecorder` with `defineUploader` to stream chunks to a backend instead of buffering everything in memory. Set `timesliceMs` so the recorder fires `dataavailable` periodically; pipe each chunk into the uploader.

```ts
import { defineRecorder, defineUploader } from "@forinda/video-sdk-core";

const uploader = defineUploader({
  url: "/api/uploads",
  headers: { Authorization: `Bearer ${token}` },
  // Defaults: keepalive for chunks ≤ 60 KB, fall back to regular fetch above.
});

const recorder = defineRecorder(stream, { timesliceMs: 1_000 });
const dispose = recorder.pipeTo(uploader);

uploader.on("state", (s) => console.log("upload state:", s));
uploader.on("error", (e) => console.warn("upload error:", e));

recorder.start();
// ...later
await recorder.stop();
dispose();
```

When a `POST` returns 4xx/5xx, the uploader transitions to `"failed"` and the recorder pauses automatically. Recover with `await uploader.retry()` — recording resumes once the queue drains. The queue is capped by `maxQueuedBytes` (default 100 MiB); over-cap `send` calls reject so consumers see backpressure instead of silent OOM.

| Uploader option           | Default             | Purpose                                                                                                                   |
| ------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `url`                     | —                   | Required. Destination — `POST` per chunk.                                                                                 |
| `headers`                 | `{}`                | Extra request headers. `Content-Type` is set automatically from the chunk's mime type.                                    |
| `maxQueuedBytes`          | `100 * 1024 * 1024` | Hard cap on bytes queued (waiting + in-flight). Over-cap `send` rejects with `uploader_queue_overflow`.                   |
| `keepaliveThresholdBytes` | `60_000`            | Chunks at or below this size use `fetch` with `keepalive: true` (survive page unload); larger chunks use regular `fetch`. |
| `fetchImpl`               | `globalThis.fetch`  | Test seam.                                                                                                                |

## License

MIT — © 2026 Felix Orinda.
