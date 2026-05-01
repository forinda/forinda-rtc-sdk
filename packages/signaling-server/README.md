# @forinda/video-sdk-signaling-server

Standalone reference signaling server for the Forinda video SDK (library + CLI).

> 🚧 Foundation skeleton — implementation in EPIC-4. See `docs/superpowers/specs/2026-05-02-video-sdk-design.md`.

## CLI

```bash
npx @forinda/video-sdk-signaling-server --port 3000
```

## Library

```ts
import { createServer } from '@forinda/video-sdk-signaling-server';

const server = createServer({ port: 3000 });
```
