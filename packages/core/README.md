# @forinda/video-sdk-core

Framework-agnostic WebRTC publish/view core for the Forinda video SDK. Browser-only, ESM-only.

> ✅ EPIC-3 complete. Publisher + Viewer ready for adapter wiring (EPIC-4).

## Install

```bash
pnpm add @forinda/video-sdk-core @forinda/video-sdk-signaling-protocol
```

## Quick start

```ts
import { definePublisher, defineViewer, getUserMedia } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws"; // EPIC-4

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

**Primitives (EPIC-3a):**

- **Logger** — `setLogger(impl)`, default noop. Pluggable; never installs global handlers.
- **Emitter** — typed `defineEmitter<Events>()` with `on` / `once` / `off` / `emit` / `removeAllListeners`.
- **Errors** — `SdkError` hierarchy + re-exported `SignalingProtocolError` tree. Stable `code` strings.
- **Media** — `getUserMedia`, `getDisplayMedia` (screen share), `enumerateDevices`, `watchDevices`, `replaceVideoTrack`, `replaceAudioTrack`, `buildConstraints`.
- **Peer** — `definePeerConnection`, `defineNegotiator` (perfect-negotiation pattern), `normalizeIceServers`, SDP read helpers.
- **Stats** — `defineStatsCollector` polling wrapper + `normalizeStats` reducer + `ConnectionStats` flat shape.
- **Signaling** — `SignalingTransport` interface + re-exported wire-format types.

**Orchestration (EPIC-3b):**

- **State machine** — `ConnectionState` lifecycle (`idle` → `connecting` → `connected` → `reconnecting` → `failed` → `closed`), `defineStateMachine` enforcer.
- **Retry policy** — `defineRetryPolicy` exponential backoff + jitter, bounded by `maxAttempts` / `maxDurationMs`.
- **Publisher** — `definePublisher`: signaling join, per-viewer `RTCPeerConnection` management, SDP/ICE routing, stats aggregation, hot-swap, auto-retry.
- **Viewer** — `defineViewer`: signaling join, single upstream PC, track event, stats, auto-retry.

**Room-level interaction (EPIC-11):**

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

| Option             | Default               | Purpose                                                                                                                                                                |
| ------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signaling`        | —                     | Required. Pre-built `SignalingTransport`. Channel never opens or closes it itself.                                                                                     |
| `room`             | —                     | Required. Room id.                                                                                                                                                     |
| `peerId`           | `crypto.randomUUID()` | Self identifier.                                                                                                                                                       |
| `manageJoin`       | `true`                | Issue `join` (role `presence`) on `start()` and matching `leave` on `stop()`. Pass `false` to share a transport with a Publisher/Viewer that already manages the join. |
| `chatHistoryLimit` | `200`                 | Cap on the rolling chat-history buffer.                                                                                                                                |

| Method                        | Purpose                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `start()` / `stop()`          | Subscribe / unsubscribe; manage `join` / `leave` if owned.                                                      |
| `setAttribute(key, value)`    | Set or replace one own presence attribute.                                                                      |
| `removeAttribute(key)`        | Remove one own attribute (sends `null` over the wire).                                                          |
| `clearAttributes()`           | Remove every attribute previously set by this channel.                                                          |
| `raiseHand()` / `lowerHand()` | Sugar for `setAttribute("hand-raised", true/false)`.                                                            |
| `sendChat(body, { to? })`     | Broadcast or DM. `body` ≤ 8192 chars.                                                                           |
| `peers` (getter)              | `ReadonlyMap<peerId, attributes>` — live view.                                                                  |
| `chatHistory` (getter)        | Read-only ordered array, oldest first.                                                                          |
| `on(event, handler)`          | Subscribe to `presence`, `presence-snapshot`, `peer-joined`, `peer-left`, `chat`, `error`. Returns unsubscribe. |

The channel **does not own its transport's lifecycle** — the consumer is responsible for connecting/disconnecting it. Sharing one transport with a `Publisher` or `Viewer` is the common case; pass `manageJoin: false` so the join is issued only once.

**Recording (EPIC-13):**

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

| Option               | Default                               | Purpose                                                         |
| -------------------- | ------------------------------------- | --------------------------------------------------------------- |
| `mimeType`           | first supported in `codecPreferences` | Pin a specific codec; throws on `start` if unsupported.         |
| `codecPreferences`   | `DEFAULT_CODEC_PREFERENCES`           | Fallback list. Default tries VP9, VP8, bare WebM, MP4 in order. |
| `videoBitsPerSecond` | browser default                       | Forwarded to `MediaRecorder`.                                   |
| `audioBitsPerSecond` | browser default                       | Forwarded to `MediaRecorder`.                                   |
| `timesliceMs`        | one chunk on stop                     | Emit `dataavailable` every N ms instead of only at the end.     |

State machine: `idle → recording → (paused ↔ recording) → stopped`. Errors transition to a terminal `error` state and surface as typed `Error` events (never bare DOM events).

Plus two helpers: `isRecordingTypeSupported(mimeType)` and `pickRecordingType(preferences)` for capability detection without instantiating a recorder.

> **iOS / Safari quirk:** `MediaRecorder` is unreliable pre-iOS-17 and may flake on long sessions. Detect via `isRecordingTypeSupported` and gate the recording UI accordingly.

## License

MIT — © 2026 Felix Orinda.
