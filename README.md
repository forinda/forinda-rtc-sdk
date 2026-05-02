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

## Documentation

- [Design spec](./docs/superpowers/specs/2026-05-02-video-sdk-design.md)
- [Implementation plans](./docs/superpowers/plans/)
- [Contributing](./CONTRIBUTING.md)

## License

MIT — © 2026 Felix Orinda.
