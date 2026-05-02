# @forinda/video-sdk-signaling-ws

## 0.1.0

### Minor Changes

Initial public release.

- `defineWebSocketSignaling({ url, token? })` — browser `WebSocket` `SignalingTransport` implementation. Auto-reconnect with exponential backoff + jitter, message buffering during disconnect, typed events (`state`, `message`).
- Implements the `SignalingTransport` interface from `@forinda/video-sdk-core`.
