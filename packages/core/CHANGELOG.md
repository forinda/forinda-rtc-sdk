# @forinda/video-sdk-core

## 0.1.1

### Patch Changes

- [`0c25d10`](https://github.com/forinda/forinda-rtc-sdk/commit/0c25d108fecb8266696c633904cb4b303a9a4179) Thanks [@forinda](https://github.com/forinda)! - Documentation pass — no code changes.

  - Replaced placeholder READMEs on the four signaling-adapter packages with full surface docs (options table, handle shape, auth example, what-it-doesn't-do). `signaling-adapter-hono` and `signaling-adapter-bun` are explicitly flagged as stub packages with workarounds documented.
  - `core`: install snippet now lists `@forinda/video-sdk-signaling-ws` (the example uses it). Recording options table now documents `maxBufferedBytes`. Added a `definePresenceDiff` example next to the Room channel section.
  - `react`: install snippet fix to match `core`. `useRoomChannel` result now shows the `state` field. `useRecorder` example shows `downloadUrl` and `maxBufferedBytes`.
  - All cross-package links in published READMEs are now absolute npm URLs so they resolve when rendered on npmjs.com.
  - Stripped every `EPIC-N` and `docs/superpowers/` reference from adopter-facing READMEs.

## 0.1.0

### Minor Changes

Initial public release.

- `definePublisher({ signaling, room, stream })` — one-publisher → many-viewers WebRTC orchestrator. Per-viewer `RTCPeerConnection` management, perfect-negotiation, SDP/ICE routing, stats aggregation, hot track-swap, auto-retry.
- `defineViewer({ signaling, room, publisherId })` — symmetric receiver.
- `defineRoomChannel({ signaling, room, peerId? })` — presence + chat layer with `setAttribute` / `removeAttribute` / `raiseHand` / `lowerHand` / `sendChat` and rolling chat history.
- `defineRecorder(stream, opts?)` — `MediaRecorder` wrapper with codec auto-pick, bitrate hints, chunked output via `timesliceMs`, `maxBufferedBytes` overflow guard, typed lifecycle state machine.
- `getUserMedia` / `getDisplayMedia` (screen share) / `enumerateDevices` / `watchDevices` / `replaceVideoTrack` / `replaceAudioTrack` / `buildConstraints`.
- `defineNegotiator` (perfect-negotiation), `definePeerConnection`, `normalizeIceServers`, SDP read helpers.
- `defineStatsCollector` polling wrapper + `normalizeStats` reducer + `ConnectionStats` flat shape.
- `defineStateMachine`, `defineRetryPolicy` (exponential backoff + jitter, bounded by `maxAttempts` / `maxDurationMs`).
- `defineEmitter`, `setLogger`, full `SdkError` hierarchy with stable `code` strings.
- `definePresenceDiff(prev, next)` for delta UIs.

Browser-only, ESM-only. Depends on `@forinda/video-sdk-signaling-protocol` (zod wire validation) and `zod`.
