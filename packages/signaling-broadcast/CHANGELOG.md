# @forinda/video-sdk-signaling-broadcast

## 0.1.1

### Patch Changes

- Updated dependencies [[`0c25d10`](https://github.com/forinda/forinda-rtc-sdk/commit/0c25d108fecb8266696c633904cb4b303a9a4179)]:
  - @forinda/video-sdk-core@0.1.1

## 0.1.0

### Minor Changes

Initial public release.

- `defineBroadcastChannelSignaling({ channelName? })` — same-tab `BroadcastChannel`-backed `SignalingTransport`. Useful for local demos and integration tests where you want two peers in the same browser tab without a real WebSocket server.
