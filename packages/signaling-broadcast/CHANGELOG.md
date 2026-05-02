# @forinda/video-sdk-signaling-broadcast

## 0.1.0

### Minor Changes

Initial public release.

- `defineBroadcastChannelSignaling({ channelName? })` — same-tab `BroadcastChannel`-backed `SignalingTransport`. Useful for local demos and integration tests where you want two peers in the same browser tab without a real WebSocket server.
