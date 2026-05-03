# Packages

| Package                                                                       | Purpose                                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`@forinda/video-sdk-core`](./core)                                           | Framework-agnostic WebRTC publish/view core. Browser-only, ESM-only.                                                            |
| [`@forinda/video-sdk-signaling-protocol`](./signaling-protocol)               | Pure signaling engine + zod-validated wire format. Pluggable into any host.                                                     |
| [`@forinda/video-sdk-signaling-ws`](./signaling-ws)                           | Browser WebSocket signaling transport with auto-reconnect.                                                                      |
| [`@forinda/video-sdk-signaling-broadcast`](./signaling-broadcast)             | Same-tab `BroadcastChannel` transport for demos and tests.                                                                      |
| [`@forinda/video-sdk-signaling-adapter-ws`](./signaling-adapter-ws)           | Node `ws`-backed WebSocket signaling server.                                                                                    |
| [`@forinda/video-sdk-signaling-adapter-express`](./signaling-adapter-express) | Express integration (dual ESM + CJS) — share signaling with your HTTP server.                                                   |
| [`@forinda/video-sdk-signaling-server`](./signaling-server)                   | Standalone reference server + `forinda-rtc-signaling` CLI.                                                                      |
| [`@forinda/video-sdk-react`](./react)                                         | `VideoSdkProvider` + 13 hooks + `<VideoView>` component.                                                                        |
| [`@forinda/video-sdk-vue`](./vue)                                             | `VideoSdkPlugin` + 14 composables + `<VideoView>` component for Vue 3.4+.                                                       |
| [`@forinda/video-sdk-elements`](./elements)                                   | 4 Web Components: `<forinda-video-publisher>`, `<forinda-video-viewer>`, `<forinda-video-device-picker>`, `<forinda-recorder>`. |
| [`@forinda/video-sdk-sfu-livekit`](./sfu-livekit)                             | LiveKit SFU adapter — same Publisher/Viewer surface, routed through LiveKit Cloud or self-host.                                 |

> Each package page below renders the upstream `packages/<dir>/README.md` verbatim.
> For per-symbol API reference (auto-generated from JSDoc), see `/symbols/<package>/`.
