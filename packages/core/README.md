# @forinda/video-sdk-core

Framework-agnostic WebRTC publish/view core for the Forinda video SDK. Browser-only, ESM-only.

> 🚧 EPIC-3a primitives shipped. Publisher / Viewer (EPIC-3b) coming next.

## Install

```bash
pnpm add @forinda/video-sdk-core @forinda/video-sdk-signaling-protocol
```

## What ships in EPIC-3a

- **Logger** — `setLogger(impl)`, default noop. Pluggable; never installs global handlers.
- **Emitter** — typed `defineEmitter<Events>()` with `on` / `once` / `off` / `emit` / `removeAllListeners`.
- **Errors** — `SdkError` hierarchy + re-exported `SignalingProtocolError` tree. Stable `code` strings.
- **Media** — `getUserMedia`, `enumerateDevices`, `watchDevices`, `replaceVideoTrack`, `replaceAudioTrack`, `buildConstraints`.
- **Peer** — `definePeerConnection`, `defineNegotiator` (perfect-negotiation pattern), `normalizeIceServers`, SDP read helpers.
- **Stats** — `defineStatsCollector` polling wrapper + `normalizeStats` reducer + `ConnectionStats` flat shape.
- **Signaling** — `SignalingTransport` interface + re-exported wire-format types.

## Usage (preview)

Publisher and Viewer factories ship in EPIC-3b. Until then the primitives below are available for adapter / advanced usage:

```ts
import {
  definePeerConnection,
  defineNegotiator,
  defineStatsCollector,
  getUserMedia,
  normalizeIceServers,
} from "@forinda/video-sdk-core";

const stream = await getUserMedia({ audio: true, video: true });

const pc = definePeerConnection({
  iceServers: normalizeIceServers(["stun:stun.l.google.com:19302"]),
});

const negotiator = defineNegotiator({
  pc: pc.raw,
  polite: true,
  localPeerId: "alice",
  remotePeerId: "bob",
  send: (sdp) => transport.send(sdp),
});

const collector = defineStatsCollector({ pc: pc.raw, peerId: "alice", intervalMs: 1000 });
collector.on("stats", (s) => console.log("bitrate:", s.outbound.bitrateBps));
collector.start();
```

## License

MIT — © 2026 Felix Orinda.
