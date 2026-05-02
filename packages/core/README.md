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

## License

MIT — © 2026 Felix Orinda.
