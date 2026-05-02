# @forinda/video-sdk-signaling-server

## 0.1.0

### Minor Changes

Initial public release.

- `defineSignalingServer({ port?, engine?, authenticate?, maxPeersPerRoom? })` — standalone reference signaling server wrapping `@forinda/video-sdk-signaling-adapter-ws`. Defaults to port 3000 (override via `port: 0` for OS-assigned).
- `forinda-rtc-signaling` CLI (powered by Commander + picocolors) for spinning up a server from the command line.
