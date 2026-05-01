# Forinda Video SDK

> Open-source, framework-agnostic WebRTC video SDK. Publish, view, and embed peer-to-peer video in any frontend or backend.

> 🚧 **Status:** Pre-release. Foundation epic complete. Implementation in progress.

## Packages

| Package                                                                       | Description                                                                            |
|-------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| [`@forinda/video-sdk-core`](./packages/core)                                  | Framework-agnostic WebRTC publish/view core                                            |
| [`@forinda/video-sdk-signaling-protocol`](./packages/signaling-protocol)      | Pure protocol engine + wire-format zod schemas                                         |
| [`@forinda/video-sdk-signaling-ws`](./packages/signaling-ws)                  | Browser WebSocket client transport                                                     |
| [`@forinda/video-sdk-signaling-broadcast`](./packages/signaling-broadcast)    | Same-tab BroadcastChannel client transport (demos, tests)                              |
| [`@forinda/video-sdk-signaling-adapter-ws`](./packages/signaling-adapter-ws)  | Node `ws` server adapter                                                               |
| [`@forinda/video-sdk-signaling-adapter-express`](./packages/signaling-adapter-express) | Express server adapter (dual ESM + CJS)                                       |
| [`@forinda/video-sdk-signaling-adapter-hono`](./packages/signaling-adapter-hono)       | Hono server adapter                                                            |
| [`@forinda/video-sdk-signaling-adapter-bun`](./packages/signaling-adapter-bun)         | Bun native WS server adapter                                                   |
| [`@forinda/video-sdk-signaling-server`](./packages/signaling-server)          | Standalone reference server (library + CLI)                                            |
| [`@forinda/video-sdk-react`](./packages/react)                                | React hooks and components                                                             |
| [`@forinda/video-sdk-elements`](./packages/web-components)                    | Web Components (`<video-publisher>`, `<video-viewer>`, `<video-device-picker>`)        |

## Apps

| App                                                          | Description                                          |
|--------------------------------------------------------------|------------------------------------------------------|
| [`dev-signaling-server`](./apps/dev-signaling-server)        | Local development signaling server                   |

## Build tooling

| Tool                                | Purpose                                                                  |
|-------------------------------------|--------------------------------------------------------------------------|
| [`tools/build-banner.ts`](./tools)  | Generates the build banner stamped on every emitted `dist/*.js` file     |

## Development

Requires Node 20+ and pnpm 9+.

```bash
corepack enable
pnpm install
pnpm build       # build every package
pnpm typecheck   # type-check every package
pnpm lint        # lint every package
```

## License

MIT — see [LICENSE](./LICENSE).

Copyright (c) 2026 Felix Orinda.

## Spec

See [`docs/superpowers/specs/2026-05-02-video-sdk-design.md`](./docs/superpowers/specs/2026-05-02-video-sdk-design.md) for the v0.1.0 design.
