---
"@forinda/video-sdk-core": patch
"@forinda/video-sdk-react": patch
"@forinda/video-sdk-signaling-protocol": patch
"@forinda/video-sdk-signaling-ws": patch
"@forinda/video-sdk-signaling-broadcast": patch
"@forinda/video-sdk-elements": patch
---

`defineRoom` higher-level coordinator + minified browser bundles.

### Added — `defineRoom`

`@forinda/video-sdk-core` ships `defineRoom({ signaling, room, peerId? })`, a coordinator that owns one transport's lifecycle and the **single** `join` for a room. Eliminates the silent-overwrite footgun where a `Publisher` and a `RoomChannel` sharing one transport both issue `join` and the engine quietly drops the first peer binding.

Compose via the Room's sugar methods:

```ts
const room = defineRoom({ signaling, room: "demo", peerId: "alice" });
const publisher = room.publisher({ stream });
const channel = room.channel(); // presence + chat over the same socket
const recorder = room.recorder(stream);
await publisher.start();
await channel.start(); // shares the join — no second peer binding
```

Or use the proxy factories directly: `defineAttachedPublisher(room, opts)`, `defineAttachedViewer(room, opts)`, `defineAttachedRoomChannel(room, opts)`. Standalone `definePublisher` / `defineViewer` / `defineRoomChannel` are unchanged — the new APIs are purely additive.

`@forinda/video-sdk-react` adds `useRoom({ room, peerId? })` and extends `usePublisher` / `useViewer` / `useRoomChannel` with an `attach?: Room` option. When attached, the hook ignores its own `room`/`peerId`/`signaling` (taken from the Room).

### Changed — minified browser bundles

`@forinda/video-sdk-core`, `@forinda/video-sdk-react`, `@forinda/video-sdk-elements`, `@forinda/video-sdk-signaling-ws`, `@forinda/video-sdk-signaling-broadcast`, and `@forinda/video-sdk-signaling-protocol` now ship minified ESM (and IIFE for `elements`). Sourcemaps are still emitted, so DevTools stack traces stay readable.

Server packages (`signaling-server`, `signaling-adapter-*`) intentionally ship unminified — Node-side, no bandwidth concern, cleaner native stack traces.

Approximate gzipped reductions:

- `core`: 12.08 KB → 8.40 KB (-30%)
- `signaling-protocol`: 5.13 KB → 2.50 KB (-51%)
- `signaling-ws`: 1.85 KB → 1.47 KB (-21%)
- `react`: 3.41 KB → 3.20 KB (-6%)
- `signaling-broadcast`: 814 B → 706 B (-13%)
- `elements`: unchanged tiny — most code is in `core` (external)
