# @forinda/video-sdk-signaling-server

## 0.1.2

### Patch Changes

- Updated dependencies [[`e26b57d`](https://github.com/forinda/forinda-rtc-sdk/commit/e26b57d51437969aee97720d63f787adbf1d76da), [`314182f`](https://github.com/forinda/forinda-rtc-sdk/commit/314182f615a69e6e1dd345308206d35ecbedb1bb), [`d311a25`](https://github.com/forinda/forinda-rtc-sdk/commit/d311a25af404cc78a2af5505a6f5351eb2fe4d86), [`195f0e3`](https://github.com/forinda/forinda-rtc-sdk/commit/195f0e3c8afdfc3192db0de71684be545512897d), [`e67a6f5`](https://github.com/forinda/forinda-rtc-sdk/commit/e67a6f509366e992d77a05c784933f10e29ee9bf), [`ce3a414`](https://github.com/forinda/forinda-rtc-sdk/commit/ce3a414c781c90e648992c6be7af09ccf1afc2cc)]:
  - @forinda/video-sdk-signaling-protocol@0.2.0
  - @forinda/video-sdk-signaling-adapter-ws@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`0c25d10`](https://github.com/forinda/forinda-rtc-sdk/commit/0c25d108fecb8266696c633904cb4b303a9a4179)]:
  - @forinda/video-sdk-signaling-adapter-ws@0.1.1

## 0.1.0

### Minor Changes

Initial public release.

- `defineSignalingServer({ port?, engine?, authenticate?, maxPeersPerRoom? })` — standalone reference signaling server wrapping `@forinda/video-sdk-signaling-adapter-ws`. Defaults to port 3000 (override via `port: 0` for OS-assigned).
- `forinda-rtc-signaling` CLI (powered by Commander + picocolors) for spinning up a server from the command line.
