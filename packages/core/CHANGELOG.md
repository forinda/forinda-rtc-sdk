# @forinda/video-sdk-core

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
