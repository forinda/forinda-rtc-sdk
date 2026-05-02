# @forinda/video-sdk-signaling-ws

## 0.1.1

### Patch Changes

- Updated dependencies [[`0c25d10`](https://github.com/forinda/forinda-rtc-sdk/commit/0c25d108fecb8266696c633904cb4b303a9a4179)]:
  - @forinda/video-sdk-core@0.1.1

## 0.1.0

### Minor Changes

Initial public release.

- `defineWebSocketSignaling({ url, token? })` — browser `WebSocket` `SignalingTransport` implementation. Auto-reconnect with exponential backoff + jitter, message buffering during disconnect, typed events (`state`, `message`).
- Implements the `SignalingTransport` interface from `@forinda/video-sdk-core`.
