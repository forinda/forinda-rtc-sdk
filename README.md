# Forinda RTC SDK

Open-source, framework-agnostic WebRTC SDK. Publish, view, and embed peer-to-peer video in any frontend or backend.

> 🚧 Pre-release. EPIC-3 (core) shipped. Adapters and framework wrappers in progress.

## Quick start

```bash
pnpm add @forinda/video-sdk-core @forinda/video-sdk-signaling-protocol
```

```ts
import { definePublisher, getUserMedia } from "@forinda/video-sdk-core";

const stream = await getUserMedia({ audio: true, video: true });
const publisher = definePublisher({ signaling, room: "demo", stream });
await publisher.start();
```

See package READMEs for details and examples.

## Try the examples

In one terminal start the local signaling server:

```bash
pnpm dev:server
```

Then in another terminal pick a flavor:

```bash
pnpm dev:vanilla     # http://127.0.0.1:5173 — plain TS + core API
pnpm dev:react       # http://127.0.0.1:5174 — React hooks + <VideoView>
pnpm dev:elements    # http://127.0.0.1:5175 — <forinda-video-publisher> et al.
```

Each example app has its own README under `examples/*/README.md`.

## Documentation

- [Design spec](./docs/superpowers/specs/2026-05-02-video-sdk-design.md)
- [Implementation plans](./docs/superpowers/plans/)
- [Contributing](./CONTRIBUTING.md)

## License

MIT — © 2026 Felix Orinda.
