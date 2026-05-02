# @forinda/video-sdk-signaling-server

## 0.1.1

### Patch Changes

- Updated dependencies [[`0c25d10`](https://github.com/forinda/forinda-rtc-sdk/commit/0c25d108fecb8266696c633904cb4b303a9a4179)]:
  - @forinda/video-sdk-signaling-adapter-ws@0.1.1

## 0.1.0

### Minor Changes

Initial public release.

- `defineSignalingServer({ port?, engine?, authenticate?, maxPeersPerRoom? })` — standalone reference signaling server wrapping `@forinda/video-sdk-signaling-adapter-ws`. Defaults to port 3000 (override via `port: 0` for OS-assigned).
- `forinda-rtc-signaling` CLI (powered by Commander + picocolors) for spinning up a server from the command line.
