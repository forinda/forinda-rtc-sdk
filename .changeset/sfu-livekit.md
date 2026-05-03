---
"@forinda/video-sdk-sfu-livekit": minor
"@forinda/video-sdk-react": minor
"@forinda/video-sdk-vue": minor
---

EPIC-14: ship the LiveKit SFU adapter as a side-by-side opt-in package.

- New package `@forinda/video-sdk-sfu-livekit` exposes `defineSfuPublisher` / `defineSfuViewer` mirroring the mesh `Publisher` / `Viewer` shape, routed through LiveKit Cloud or a self-hosted LiveKit server. `livekit-client@^2.18` is a peer dependency so mesh-only consumers keep a slim bundle.
- `@forinda/video-sdk-react` adds `useSfuPublisher` / `useSfuViewer` hooks; `@forinda/video-sdk-sfu-livekit` is declared as an optional peer dependency so existing mesh consumers are unaffected.
- `@forinda/video-sdk-vue` adds `useSfuPublisher` / `useSfuViewer` composables with the same opt-in peer dependency model.
- New `docs/sfu-integration.md` covers the two-transport model (LiveKit for media, our WebSocket for chat/presence/recording), token minting, and the mesh→SFU one-line migration.
- New example `examples/livekit-sfu-publisher-viewer/` (run via `pnpm dev:sfu`) demonstrates the React hooks against LiveKit Cloud or a local `livekit-server --dev` instance.
