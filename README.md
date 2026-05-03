# Forinda RTC SDK

Open-source, framework-agnostic WebRTC SDK. Publish video, view it, chat, raise hands, share screens, and record — from plain TypeScript, React, Vue 3, or Web Components — against any signaling backend you can write.

## Packages

| Package                                        | Purpose                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `@forinda/video-sdk-core`                      | Framework-agnostic WebRTC publish/view core. Browser-only, ESM-only.                                                            |
| `@forinda/video-sdk-signaling-protocol`        | Pure signaling engine + zod-validated wire format. Pluggable into any host.                                                     |
| `@forinda/video-sdk-signaling-ws`              | Browser WebSocket signaling transport with auto-reconnect.                                                                      |
| `@forinda/video-sdk-signaling-broadcast`       | Same-tab `BroadcastChannel` transport for demos and tests.                                                                      |
| `@forinda/video-sdk-signaling-adapter-ws`      | Node `ws`-backed WebSocket signaling server.                                                                                    |
| `@forinda/video-sdk-signaling-adapter-express` | Express integration (dual ESM + CJS) — share signaling with your HTTP server.                                                   |
| `@forinda/video-sdk-signaling-server`          | Standalone reference server + `forinda-rtc-signaling` CLI.                                                                      |
| `@forinda/video-sdk-react`                     | `VideoSdkProvider` + 11 hooks + `<VideoView>` component.                                                                        |
| `@forinda/video-sdk-vue`                       | `VideoSdkPlugin` + 12 composables + `<VideoView>` component for Vue 3.4+.                                                       |
| `@forinda/video-sdk-elements`                  | 4 Web Components: `<forinda-video-publisher>`, `<forinda-video-viewer>`, `<forinda-video-device-picker>`, `<forinda-recorder>`. |
| `@forinda/video-sdk-sfu-livekit`               | LiveKit SFU adapter — same Publisher/Viewer surface, routed through LiveKit Cloud or self-host.                                 |

`@forinda/video-sdk-signaling-adapter-hono` and `@forinda/video-sdk-signaling-adapter-bun` are reserved package names with stub exports today; use the `ws` adapter as a workaround.

## What you get

- **One-publisher → many-viewers WebRTC** with perfect-negotiation, retry policy, auto-reconnect, and stats.
- **`defineRoom`** — one factory bundles publisher + viewer + chat + recorder over a single signaling socket. Eliminates the duplicate-join footgun.
- **Screen share** via `getDisplayMedia` — same `Publisher` plumbing as camera, just a different source.
- **Presence + chat** as a thin layer over the same signaling transport. `raiseHand()` / `lowerHand()` sugar; broadcast or DM messaging; rolling history.
- **Recording** via `MediaRecorder` with codec auto-pick, bitrate hints, chunked output for streaming uploads, and an in-memory buffer cap so long recordings can't OOM the tab.
- **Four consumer surfaces** with the same underlying API: vanilla TypeScript, React 18+ hooks, Vue 3 composables, and standards-based Web Components.
- **Browser packages ship minified** with sourcemaps. `@forinda/video-sdk-core` is ~8 KB gzipped; the full publish + presence + chat + recording stack lands under ~16 KB gzipped.

## Quick start

### Just publish a video stream

```bash
pnpm add @forinda/video-sdk-core @forinda/video-sdk-signaling-ws
```

```ts
import { definePublisher, getUserMedia } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

const stream = await getUserMedia({ audio: true, video: true });
const publisher = definePublisher({
  signaling: defineWebSocketSignaling({ url: "wss://signal.example.com" }),
  room: "demo",
  stream,
});
publisher.on("viewer", ({ peerId }) => console.log("viewer joined:", peerId));
await publisher.start();
```

### Publish + chat + record over one socket (recommended for production)

Use `defineRoom` when you need media plus presence/chat in the same browser tab — it owns the shared transport and the single `join`, so the children don't fight over it.

```ts
import { defineRoom, defineWebSocketSignaling, getUserMedia } from "@forinda/video-sdk-core";

const stream = await getUserMedia({ audio: true, video: true });
const signaling = defineWebSocketSignaling({ url: "wss://signal.example.com" });
const room = defineRoom({ signaling, room: "demo", peerId: "alice" });

const publisher = room.publisher({ stream });
const channel = room.channel(); // presence + chat over the same socket
const recorder = room.recorder(stream); // local recording

await publisher.start();
await channel.start();

await channel.raiseHand();
await channel.sendChat("hi room");
recorder.start();
```

See each package's README for the full API reference.

## Try the examples

In one terminal:

```bash
pnpm dev:server
```

In another, pick a flavor:

```bash
pnpm dev:vanilla     # http://127.0.0.1:5173 — plain TS + core API
pnpm dev:react       # http://127.0.0.1:5174 — React hooks + <VideoView>
pnpm dev:elements    # http://127.0.0.1:5175 — <forinda-video-publisher> et al.
pnpm dev:vue         # http://127.0.0.1:5176 — Vue 3 composables + <VideoView>
```

Each example has its own README under `examples/*/README.md`.

## Documentation

- **[`docs/architecture.md`](docs/architecture.md)** — package graph + data flow for one RTC session.
- **[`docs/patterns.md`](docs/patterns.md)** — three end-to-end recipes (webinar, mesh meeting, custom signaling backend).
- **[`docs/troubleshooting.md`](docs/troubleshooting.md)** — every typed error code → user-visible cause → fix.
- **[`docs/sfu-integration.md`](docs/sfu-integration.md)** — when to use the LiveKit SFU adapter, two-transport model, mesh→SFU migration.
- **Per-package READMEs** are the canonical reference for each surface — start at the `Packages` table above.

## Testing tiers

| Tier        | Command                                                                   | What it runs                                                                                                           |
| ----------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Unit        | `pnpm test`                                                               | Per-package vitest in jsdom (or node for server packages). The default for day-to-day dev.                             |
| Integration | `pnpm test:integration`                                                   | Cross-package suite in `packages/integration-tests/`. Real WebSocket round-trips, real engine.                         |
| Browser     | `pnpm test:browser`                                                       | Vitest in headless Chromium (Playwright provider) with synthetic getUserMedia. Covers core/react/elements media paths. |
| E2E         | `pnpm e2e`                                                                | Playwright two-tab Publisher↔Viewer flow against the dev signaling server + React example app.                         |
| Load        | `pnpm load:signaling --rooms 100 --peers 10 --chatPerSec 1 --duration 30` | Generates synthetic chat traffic; reports throughput + p50/p95 latency.                                                |

CI runs all five on every PR.

## Compatibility

- **Node ≥ 20** for the server packages.
- **Browsers** — anything supporting modern WebRTC (Chromium 110+, Firefox 113+, Safari 16.4+).
- **React ≥ 18** for the React adapter (uses `useSyncExternalStore`).
- **Vue ≥ 3.4** for the Vue adapter (Composition API only).

## Status & scope

Pre-1.0. P2P mesh (`@forinda/video-sdk-core`) covers webinars and small meetings comfortably; production ceiling is roughly 8 viewers per publisher before uplink saturates. SFU integration ships via the optional `@forinda/video-sdk-sfu-livekit` adapter; mesh remains the default for ≤8-viewer rooms.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Releases

See [`RELEASE.md`](./RELEASE.md) for the full publish process.

## License

MIT — © 2026 Felix Orinda.
