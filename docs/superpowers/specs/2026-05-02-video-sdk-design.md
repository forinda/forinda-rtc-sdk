# Forinda Video SDK — v0.1.0 Design

**Status:** Draft for review
**Date:** 2026-05-02
**Scope:** First slice (v0.1.0). Subsequent slices (rooms/mesh, recording, screenshare, WHIP/WHEP, OBS bridge, etc.) get their own specs.
**Reference:** Functionality inspired by [vdo.ninja](https://github.com/steveseguin/vdoninja) (AGPL-3.0). This SDK is a **clean-room re-implementation from the WebRTC spec and observable behavior**, not a code port. No vdo.ninja source is copied or derived. License independence preserved.

---

## 1. Goals and non-goals

### Goals

- Ship a framework-agnostic, browser-only WebRTC SDK that lets a developer publish one media stream and have many viewers subscribe to it.
- Provide three consumer surfaces at launch: vanilla TS, React, and standards-based Web Components (HTML custom elements).
- Provide a backend-framework-agnostic signaling layer: one pure protocol engine plus thin adapters for the four most common Node/edge frameworks, so users can embed signaling inside their existing backend or run a standalone reference server.
- Keep core dep-free except for `zod` (boundary validation).
- Public API surface must be small enough that one developer can hold it in their head.

### Non-goals (deferred to later slices)

- Multi-peer mesh / SFU integration.
- Screenshare publisher (`getDisplayMedia`).
- Data channel chat / generic messaging.
- Simulcast and SVC.
- Recording (multitrack, WAV encoding, cloud upload).
- WHIP / WHEP client.
- OBS bridge, MIDI, Streamdeck.
- Mobile native (React Native).
- Server-side WebRTC (Node `node-datachannel`, `wrtc`).
- Docs site (Astro Starlight planned for slice 2).
- Horizontal-scale signaling (Redis pub/sub, Cloudflare Durable Objects).

---

## 2. Repository layout

```
forinda-video-sdk/
  package.json                            # pnpm workspace root, shared scripts
  pnpm-workspace.yaml
  .npmrc                                  # public-hoist-pattern, strict-peer-dependencies=true
  tsconfig.base.json                      # strict TS, ES2022, moduleResolution: bundler
  oxlint.json                             # lint config
  oxfmt.json                              # format config (fallback to .prettierrc if oxfmt unstable on CI day)
  .changeset/                             # changesets
  .github/workflows/
    ci.yml
    release.yml
  packages/
    core/                                 # @forinda/video-sdk-core
    signaling-protocol/                   # @forinda/video-sdk-signaling-protocol
    signaling-adapter-ws/                 # @forinda/video-sdk-signaling-adapter-ws
    signaling-adapter-express/            # @forinda/video-sdk-signaling-adapter-express
    signaling-adapter-hono/               # @forinda/video-sdk-signaling-adapter-hono
    signaling-adapter-bun/                # @forinda/video-sdk-signaling-adapter-bun
    signaling-server/                     # @forinda/video-sdk-signaling-server (CLI + lib, uses adapter-ws)
    signaling-ws/                         # @forinda/video-sdk-signaling-ws (client transport)
    signaling-broadcast/                  # @forinda/video-sdk-signaling-broadcast (same-tab demo)
    react/                                # @forinda/video-sdk-react
    web-components/                       # @forinda/video-sdk-elements
    test-helpers/                         # internal, private:true
  examples/
    vanilla-publisher-viewer/
    react-publisher-viewer/
    web-components-publisher-viewer/
  apps/
    dev-signaling-server/                 # runnable wrapper used by examples + tests
  e2e/                                    # root-level Playwright project
  docs/
    superpowers/specs/                    # this file lives here
    architecture/
    guides/
```

---

## 3. Tooling

| Concern              | Choice                                          | Notes |
|----------------------|-------------------------------------------------|-------|
| Package manager      | pnpm 9+                                         | pinned via `packageManager` in root `package.json` |
| Task runner          | wireit                                          | per-package scripts with file-hash caching |
| Language             | TypeScript 6.0+, `strict: true`                 | |
| Module format        | ESM-only output                                 | `"type": "module"`, `"sideEffects": false` |
| Library build        | tsup                                            | esbuild-fast, dual `.d.ts` via `--dts` |
| Server build         | tsup `--target node20 --format esm`             | |
| Web Components build | tsup with `esm` + `iife` outputs                | IIFE for `<script>` drop-in |
| Test                 | Vitest + jsdom (unit), `@vitest/browser` w/ Playwright Chromium (integration), Playwright Test (e2e) | |
| Lint                 | oxlint                                          | |
| Format               | oxfmt (fallback to Prettier if oxfmt not production-ready when CI is wired) | decision deferred to wiring day |
| Versioning           | Changesets, independent semver per package      | |
| Node minimum         | 20.x LTS, set in `engines`                      | |
| CI                   | GitHub Actions                                  | |
| Docs site            | deferred to slice 2                             | |

### Wireit per-package script convention

```jsonc
{
  "scripts": { "build": "wireit", "typecheck": "wireit", "test": "wireit", "test:integration": "wireit", "lint": "wireit" },
  "wireit": {
    "build":            { "command": "tsup", "files": ["src/**", "tsup.config.ts"], "output": ["dist/**"], "dependencies": ["^build"] },
    "typecheck":        { "command": "tsc --noEmit", "files": ["src/**", "tsconfig.json"], "output": [] },
    "test":             { "command": "vitest run --project unit", "dependencies": ["build"] },
    "test:integration": { "command": "vitest run --project integration", "dependencies": ["build"] },
    "lint":             { "command": "oxlint src && oxfmt --check src", "files": ["src/**"], "output": [] }
  }
}
```

`pnpm test` at the root runs unit only (fast local loop). `pnpm test:integration` runs browser tests. CI runs both.

### Conventions

- Public surface lives in each package's `src/index.ts`. No deep imports from consumers.
- Internal subpaths use Node subpath imports (`#internal/*`), not `../../` chains.
- README per package; root README is a directory.
- ESM `exports` field on every package with `types` condition.
- License: **MIT** for every package.
- npm scope: `@forinda/video-sdk-*`.

---

## 4. License and provenance

- All packages MIT-licensed.
- Clean-room from spec — no code copied from vdo.ninja or any other AGPL/copyleft source.
- npm publishes with `--provenance` attestations via Changesets release workflow.
- `LICENSE` at root + symlinked into each package directory.

---

## 5. `@forinda/video-sdk-core` — internal structure

```
src/
  index.ts                   # public surface — re-exports only
  publisher/
    publisher.ts             # Publisher class
    publisher.types.ts
  viewer/
    viewer.ts                # Viewer class
    viewer.types.ts
  signaling/
    transport.ts             # SignalingTransport interface
    rooms.ts                 # in-core room/peer addressing helpers
                             # (wire-format messages live in @forinda/video-sdk-signaling-protocol;
                             #  core re-exports types for convenience)
  peer/
    peer-connection.ts       # thin RTCPeerConnection wrapper
    ice.ts                   # STUN/TURN config normalization
    sdp.ts                   # SDP helpers (codec preferences, header extension toggles)
    negotiation.ts           # perfect-negotiation pattern impl
  media/
    devices.ts               # enumerateDevices, watch, dedupe
    constraints.ts           # MediaTrackConstraints builders
    user-media.ts            # getUserMedia wrapper with typed errors
    track-replacer.ts        # device hot-swap (replaceTrack on RTCRtpSender)
  stats/
    collector.ts             # getStats() polling
    normalize.ts             # raw RTCStatsReport → ConnectionStats
    types.ts
  events/
    emitter.ts               # ~40-line typed emitter, no deps
  errors/
    errors.ts                # SdkError hierarchy
  logger/
    logger.ts                # pluggable Logger; default noop
  internal/
    assert.ts
    deferred.ts
test/
  unit/...
  integration/...
```

### Module responsibilities

- **`signaling/transport.ts`** — defines `SignalingTransport` interface, the only seam between core and the network.
- **`peer/`** — owns `RTCPeerConnection` lifecycle. Implements perfect negotiation. WebRTC-quirks bunker.
- **`publisher/`** — orchestrates publish flow (~200 lines target).
- **`viewer/`** — orchestrates view flow (~200 lines target).
- **`stats/`** — polls `getStats()`, normalizes to flat `ConnectionStats`.
- **`errors/`** — typed `SdkError` hierarchy. No bare `Error` thrown from public API.
- **`events/emitter.ts`** — handwritten typed emitter to keep deps minimal.

### Runtime dependencies

- `@forinda/video-sdk-signaling-protocol` (workspace) — re-exports the zod-validated wire format so browser and server share one source of truth.
- `zod` — transitive via signaling-protocol; also used directly for any other boundary validation.
- Nothing else.

### Peer dependencies

- None (browser globals only).

### Public surface (`src/index.ts`)

```ts
export { Publisher } from './publisher/publisher.js';
export { Viewer } from './viewer/viewer.js';
export { getUserMedia, enumerateDevices, watchDevices } from './media/index.js';
export type { SignalingTransport, SignalingMessage, TransportState } from './signaling/transport.js';
export type { ConnectionStats } from './stats/types.js';
export type { ConnectionState, IceServerConfig, RetryConfig } from './peer/types.js';
export {
  SdkError, SignalingError, SignalingConnectError, SignalingClosedError,
  SignalingProtocolError, SignalingAuthError,
  PermissionDeniedError, DeviceNotFoundError, DeviceInUseError, OverconstrainedError,
  PeerConnectionError, IceFailedError, DtlsFailedError, NegotiationError,
  RoomFullError, PeerNotFoundError, PeerLeftError, ConfigurationError,
} from './errors/errors.js';
export { setLogger, type Logger } from './logger/logger.js';
```

---

## 6. Public API

### Publisher

```ts
const publisher = new Publisher({
  signaling,                              // SignalingTransport
  room: 'demo-room',
  peerId: 'alice',                        // optional, auto-generated UUID if omitted
  stream,                                 // MediaStream
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  stats: { interval: 1000 },              // optional; omit to disable auto-poll
  retry: { /* see Section 9 */ },
});

await publisher.start();
publisher.on('state',       (s)     => {});
publisher.on('viewer',      (v)     => {});
publisher.on('viewer-left', (v)     => {});
publisher.on('stats',       (stats) => {});  // ConnectionStats[]
publisher.on('retry',       (info)  => {});
publisher.on('error',       (err)   => {});

await publisher.replaceVideoTrack(track);
await publisher.replaceAudioTrack(track);
await publisher.getStats();               // ConnectionStats[] — one per viewer
publisher.peers();                        // readonly PeerId[]
await publisher.stop();
```

Properties: `state: ConnectionState`, `peerId: string`, `room: string`.

### Viewer

```ts
const viewer = new Viewer({
  signaling,
  room: 'demo-room',
  peerId: 'bob',                          // optional
  publisherId: 'alice',
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  stats: { interval: 1000 },
  retry: { /* see Section 9 */ },
});

await viewer.start();
viewer.on('track', ({ stream }) => { videoEl.srcObject = stream; });
viewer.on('state', (s)     => {});
viewer.on('stats', (stats) => {});         // single ConnectionStats object
viewer.on('retry', (info)  => {});
viewer.on('error', (err)   => {});
await viewer.getStats();                  // ConnectionStats (single)
await viewer.stop();
```

Properties: `state`, `peerId`, `room`, `publisherId`, `stream` (current `MediaStream | null`).

### Media helpers

```ts
const stream = await getUserMedia({ video: true, audio: true });
// throws: PermissionDeniedError | DeviceNotFoundError | OverconstrainedError | SdkError

const { cameras, microphones, speakers } = await enumerateDevices();

const unwatch = watchDevices((devices) => { /* re-render device picker */ });
unwatch();
```

### `ConnectionStats`

```ts
interface ConnectionStats {
  peerId: string;
  timestamp: number;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  inbound: {
    bitrateBps: number;
    packetsLost: number;
    packetLossRatio: number;            // 0..1
    jitterMs: number;
    framesPerSecond: number | null;
    frameWidth: number | null;
    frameHeight: number | null;
  };
  outbound: {
    bitrateBps: number;
    framesPerSecond: number | null;
    frameWidth: number | null;
    frameHeight: number | null;
    qualityLimitationReason: 'none' | 'cpu' | 'bandwidth' | 'other';
  };
  rttMs: number | null;
}
```

Asymmetric: Publisher returns `ConnectionStats[]` (one per viewer); Viewer returns single `ConnectionStats`.

### `ConnectionState`

```ts
type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';
```

---

## 7. Signaling

### `SignalingTransport` interface

```ts
export interface SignalingTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: SignalingMessage): Promise<void>;
  on(event: 'message', handler: (msg: SignalingMessage) => void): () => void;
  on(event: 'state',   handler: (state: TransportState) => void): () => void;
  readonly state: TransportState;
}
export type TransportState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';
```

### Wire format (zod-validated)

Defined in **`@forinda/video-sdk-signaling-protocol`** (environment-neutral). Both `core` (browser) and the server adapters import from it — single source of truth. Six message types, no extensibility cruft yet:

```ts
const PeerId = z.string().min(1).max(128);
const RoomId = z.string().min(1).max(128);

const JoinRoom   = z.object({ type: z.literal('join'),    room: RoomId, peer: PeerId, role: z.enum(['publisher', 'viewer']) });
const LeaveRoom  = z.object({ type: z.literal('leave'),   room: RoomId, peer: PeerId });
const PeerJoined = z.object({ type: z.literal('peer-joined'), peer: PeerId, role: z.enum(['publisher', 'viewer']) });
const PeerLeft   = z.object({ type: z.literal('peer-left'),   peer: PeerId });
const Sdp        = z.object({ type: z.literal('sdp'),     from: PeerId, to: PeerId, sdp: z.object({ type: z.enum(['offer','answer']), sdp: z.string() }) });
const IceCand    = z.object({ type: z.literal('ice'),     from: PeerId, to: PeerId, candidate: z.unknown() });

export const SignalingMessage = z.discriminatedUnion('type', [JoinRoom, LeaveRoom, PeerJoined, PeerLeft, Sdp, IceCand]);
```

Every inbound message is `SignalingMessage.parse(raw)`. Failures throw `SignalingProtocolError`.

### Client-side adapters

| Package                                       | Transport | Use case |
|-----------------------------------------------|-----------|----------|
| `@forinda/video-sdk-signaling-ws`             | Browser WebSocket | production |
| `@forinda/video-sdk-signaling-broadcast`      | `BroadcastChannel` | same-tab demos, tests |

WS adapter behaviors:

- Auto-reconnect (exponential 1s → 30s, ±25% jitter). Opt-out via `{ reconnect: false }`.
- Outbound message buffer flushes on reconnect.
- Heartbeat every 30s; missed pong forces reconnect.
- Optional `auth` callback returning a token, appended as query param.

### Server-side: protocol engine + adapters

The signaling logic is split into a pure protocol engine and per-framework adapters so users can embed signaling in their own backend or run a standalone reference server.

#### `@forinda/video-sdk-signaling-protocol` — pure engine

```ts
const engine = new SignalingEngine({
  authenticate: async (token, room) => true,
  maxPeersPerRoom: 50,
});

const session = engine.openSession();
session.onSend((peerId, message) => { /* user delivers via their socket */ });
session.handleConnection(socketId, peerInfo);
session.handleMessage(socketId, rawMessageString);
session.handleDisconnect(socketId);
```

The engine knows nothing about WebSockets. Pure I/O state machine: in = events, out = "send this message to this peer". The package also owns the wire-format zod schemas (re-exported by `@forinda/video-sdk-core` for browser convenience). This package is environment-neutral — no Node-only or browser-only APIs.

#### Adapters at launch

| Package                                            | Backend       | Notes |
|----------------------------------------------------|---------------|-------|
| `@forinda/video-sdk-signaling-adapter-ws`          | Node `ws`     | also powers the standalone CLI |
| `@forinda/video-sdk-signaling-adapter-express`     | Express       | most common Node framework |
| `@forinda/video-sdk-signaling-adapter-hono`        | Hono          | edge-runtime portable (Node + Bun + Cloudflare-friendly) |
| `@forinda/video-sdk-signaling-adapter-bun`         | Bun native WS | first-class Bun support |

Each adapter ~80 LOC once the engine exists. Community-contributable later: Fastify, NestJS, Koa, Deno, Cloudflare Workers (Durable Objects).

Example (Express):

```ts
import express from 'express';
import { WebSocketServer } from 'ws';
import { createExpressSignaling } from '@forinda/video-sdk-signaling-adapter-express';

const app = express();
const server = app.listen(3000);
const wss = new WebSocketServer({ noServer: true });

createExpressSignaling({
  app, server, wss,
  path: '/signaling',
  authenticate: async (token, room) => verifyJwt(token),
});
```

#### `@forinda/video-sdk-signaling-server` — standalone CLI + library

Wraps `signaling-adapter-ws` for `npx @forinda/video-sdk-signaling-server --port 3000`. In-memory only. For development and small (<50-peer) deployments. Production guidance in README directs users to embed adapters in their own backend.

---

## 8. React adapter (`@forinda/video-sdk-react`)

### Peer dependencies

```json
{
  "peerDependencies": {
    "@forinda/video-sdk-core": "workspace:*",
    "react": ">=18.0.0"
  }
}
```

React 18+ only — `useSyncExternalStore` is the foundation.

### Public surface

```ts
export { VideoSdkProvider, useVideoSdkConfig } from './provider.js';
export { useUserMedia } from './use-user-media.js';
export { useDevices } from './use-devices.js';
export { usePublisher } from './use-publisher.js';
export { useViewer } from './use-viewer.js';
export { useConnectionStats } from './use-connection-stats.js';
export { VideoView } from './video-view.js';
```

### `VideoSdkProvider` (optional)

Supplies default `signaling` factory and `iceServers`. Hooks accept overrides.

```tsx
<VideoSdkProvider
  signaling={() => new WebSocketSignaling({ url: 'wss://signal.example.com' })}
  iceServers={[{ urls: 'stun:stun.l.google.com:19302' }]}
>
  <App />
</VideoSdkProvider>
```

`signaling` is a **factory**, not an instance, so each hook gets its own transport.

### Hooks

```tsx
const { stream, error, state, refresh, stop } = useUserMedia({ video: true, audio: true });

const { cameras, microphones, speakers, refresh } = useDevices();

const { publisher, state, viewers, stats, error,
        start, stop, replaceVideoTrack, replaceAudioTrack } =
  usePublisher({ room: 'demo-room', stream, autoStart: true, stats: { interval: 1000 } });

const { viewer, state, stream, stats, error, start, stop } =
  useViewer({ room: 'demo-room', publisherId: 'alice', autoStart: true });

const stats = useConnectionStats(publisherOrViewer, { interval: 500 });
```

### `<VideoView>`

```tsx
<VideoView stream={stream} muted autoPlay playsInline mirror />
```

Wraps `<video>` with `srcObject` handling and autoplay quirks.

### React 18 quirks

- All effects use `AbortController` cleanup → idempotent under StrictMode.
- Internal `useStableCallback` avoids stale closures without forcing consumers to memoize options.
- All hook subscriptions go through `useSyncExternalStore`.
- SSR-safe: hooks early-return idle state on server; `<VideoView>` renders an empty `<video>`. No `window`/`navigator` access at module load.

---

## 9. Web Components adapter (`@forinda/video-sdk-elements`)

### Peer dependencies

```json
{
  "peerDependencies": { "@forinda/video-sdk-core": "workspace:*" }
}
```

No Lit, no Stencil. Vanilla `HTMLElement`. ~250 LOC target.

### Elements

| Tag                       | Wraps                                  | Required attrs                      | Optional attrs                                                                                                  | `CustomEvent`s                                  |
|---------------------------|----------------------------------------|-------------------------------------|-----------------------------------------------------------------------------------------------------------------|--------------------------------------------------|
| `<video-publisher>`       | `Publisher` + `getUserMedia` + `<video>` preview | `signaling-url`, `room`     | `peer-id`, `ice-servers` (JSON), `audio` (bool), `video` (bool), `autostart`, `stats-interval`, `mirror`         | `state`, `viewer`, `viewer-left`, `stats`, `error`, `ready` |
| `<video-viewer>`          | `Viewer` + `<video>`                   | `signaling-url`, `room`, `publisher-id` | `peer-id`, `ice-servers`, `autostart`, `stats-interval`, `muted`, `controls`                            | `state`, `track`, `stats`, `error`               |
| `<video-device-picker>`   | `enumerateDevices` + `watchDevices`    | none                                | `kind` (`camera`\|`microphone`\|`speaker`), `value`                                                              | `change`                                         |

### Build outputs

| File                  | Format | Use case                                  |
|-----------------------|--------|-------------------------------------------|
| `dist/index.js`       | ESM    | bundlers, module scripts                  |
| `dist/index.global.js`| IIFE   | `<script src="...">` legacy CDN drop-in   |
| `dist/index.d.ts`     | TS     | editor autocomplete                       |

Both bundles auto-register elements on load. Manual control:

```ts
import { defineElements } from '@forinda/video-sdk-elements/manual';
defineElements({ prefix: 'forinda-' });   // <forinda-video-publisher>
```

### Custom Elements Manifest

Emit `custom-elements.json` via `cem analyze` for VS Code / Storybook autocomplete.

### Lifecycle and DOM

- `connectedCallback` → instantiate underlying class.
- `autostart` attr → call `.start()` immediately.
- `disconnectedCallback` → `.stop()`, release tracks.
- `<video-publisher>` and `<video-viewer>` use **shadow DOM** with CSS parts (`::part(video)`).
- `<video-device-picker>` uses **light DOM** — it's a `<select>`, must be styleable.

---

## 10. Error handling

### Hierarchy

```
SdkError
├── PermissionDeniedError
├── DeviceNotFoundError
├── DeviceInUseError
├── OverconstrainedError
├── SignalingError
│   ├── SignalingConnectError
│   ├── SignalingClosedError
│   ├── SignalingProtocolError
│   └── SignalingAuthError
├── PeerConnectionError
│   ├── IceFailedError
│   ├── DtlsFailedError
│   └── NegotiationError
├── RoomFullError
├── PeerNotFoundError
├── PeerLeftError
└── ConfigurationError
```

Each:

```ts
class SdkError extends Error {
  readonly code: string;             // stable: 'permission_denied'
  readonly cause?: unknown;
  readonly retryable: boolean;
  readonly context?: Record<string, unknown>;
}
```

`code` is the contract — class names can be renamed; codes can't.

### Surface rules

| Site                                          | Mechanism                          |
|-----------------------------------------------|------------------------------------|
| `getUserMedia`, `enumerateDevices`            | thrown                             |
| `publisher.start()`, `viewer.start()`         | thrown if initial connect fails; `'error'` event after start resolves |
| `replaceVideoTrack`, `replaceAudioTrack`      | thrown                             |
| Background failures (post-`connected`)        | `'error'` event, never thrown      |

Promise-returning methods reject for synchronous failures during the call; everything later is an event.

### Logging

```ts
interface Logger {
  trace(msg: string, ctx?: Record<string, unknown>): void;
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: unknown): void;
}
setLogger(myLogger);
```

Default = noop. Every error log line carries `peerId`, `room`, `attempt`, `iceState` — debuggable without enabling `trace`.

### Anti-patterns explicitly rejected

- No silent fallback from `failed` to "try with degraded settings".
- No magic STUN-server rotation.
- No swallowed Promise rejections.
- No global `window.onerror` / `unhandledrejection` handlers.

---

## 11. State machine and reconnection

### Layered recovery

| Layer                | Failure                       | Recovery                                                                                       |
|----------------------|-------------------------------|------------------------------------------------------------------------------------------------|
| Signaling transport  | socket drops                  | exponential backoff 1s → 30s, ±25% jitter; outbound buffered; opt-out: `{ reconnect: false }` |
| ICE                  | network change, NAT rebind    | `restartIce()` after `iceconnectionstate === 'disconnected'` for >5s; hard fail after 3 restarts in 60s → `IceFailedError`, state → `failed` |
| Renegotiation        | track replaced, codec change  | perfect-negotiation handles offer/answer collisions; failures bubble as `NegotiationError`     |
| Session-level retry  | any of the above terminating  | see auto-retry below                                                                          |

### Consumer-visible state machine

```
   idle ─► connecting ─► connected ─► reconnecting ─► failed ──┐
                              │              │                  │
                              │              └──────────────────┘
                              │           (success returns to connected)
                              │
                              │           (failed → backoff → reconnecting again)
                              │
                              └─► closed ◄──── .stop() at any point

   closed also reached when retry budget exhausted
```

- `connected` only fires once both signaling and PC are connected and at least one media track has produced RTP packets (verified via stats).
- `reconnecting` does not regress to `connecting` — only forward transitions.
- `failed` is **transient**: emitted so consumers can show "we lost connection, retrying"; SDK immediately schedules a session retry per the policy below.
- `.stop()` always wins, cancels pending retries, reaches `closed`.

### Auto-retry policy (session level)

`failed` is no longer terminal. Retry restarts the entire session: tear down PC, reconnect signaling, re-join room, re-negotiate.

```ts
{
  retry: {
    enabled: true,                           // default true
    maxAttempts: 5,                          // default 5
    maxDurationMs: 5 * 60_000,               // default 5 minutes
    initialBackoffMs: 1000,                  // default 1s
    maxBackoffMs: 30_000,                    // default 30s
    jitter: 0.25,                            // default ±25%
    successResetMs: 30_000,                  // hold-down before resetting counter
  }
}
```

Behaviour:

- Bounded by **either** `maxAttempts` or `maxDurationMs`, whichever hits first → `closed` with final `error` event `code: 'retry_exhausted'`, `cause = lastError`.
- Counter resets after returning to `connected` for ≥`successResetMs`. Brief flaps don't drain the budget.
- Jitter prevents thundering-herd reconnects.
- `retry: { enabled: false }` restores terminal-`failed` behaviour (same code path, `maxAttempts: 0`).

### `'retry'` event

```ts
publisher.on('retry', ({ attempt, nextDelayMs, lastError }) => {
  console.log(`retry ${attempt}/5 in ${nextDelayMs}ms; lastError: ${lastError.code}`);
});
```

---

## 12. Testing strategy

### Three layers

| Layer        | Tool                              | Where                                  | What                                                                 |
|--------------|-----------------------------------|----------------------------------------|----------------------------------------------------------------------|
| Unit         | Vitest + jsdom                    | every package                          | pure logic: SDP helpers, stats normalization, message validation, state machine, error mapping, backoff math |
| Integration  | Vitest + `@vitest/browser` (Playwright Chromium) | `core`, `react`, `web-components` | real `RTCPeerConnection`, real `getUserMedia` (`--use-fake-device-for-media-stream`), real DOM |
| End-to-end   | Playwright Test                   | `e2e/`, in CI only                     | full flow: dev server up, two browsers, publisher in tab A, viewer in tab B, assert remote video frames render |

### Mocks vs. real

- **Unit**: small in-house `RTCPeerConnection` fake (~60 LOC, emits the 4–5 events that matter). Mocks `WebSocket`. Pure functions where possible.
- **Integration**: never mock WebRTC. Loopback in same Chromium against `BroadcastChannel` signaling.
- **E2E**: actual signaling server boots in a fixture, two Playwright contexts join.

### Per-package test files

(See repository layout in Section 2 — `test/unit/` and `test/integration/` per package, plus root `e2e/`.)

### Coverage targets

| Area                                 | Target line coverage |
|--------------------------------------|----------------------|
| `core/`                              | ≥85% (100% on `errors/`, state machine, retry)                       |
| `signaling-protocol/`                | ≥90% (wire-format schemas + engine — both contracts)                 |
| Adapters                             | ≥75%                 |
| `react/`, `web-components/`          | ≥75%                 |
| `examples/`, `apps/`                 | not gated            |

V8 provider via Vitest. Reports as CI artifacts; not enforced via gating service in v0.

### `@forinda/test-helpers` (internal, `private: true`)

- `createFakePeerConnection()` for unit tests
- `createInMemorySignaling()` for integration
- `expectStateSequence(emitter, ['connecting', 'connected'])` matcher
- `withDevServer({ port })` for spinning the reference server in tests
- `recordRtpFlow(viewer, { timeoutMs: 5000 })` waits for first inbound RTP packet via stats

### CI pipeline

`ci.yml` on every PR:

```
job: lint            -> oxlint --check + oxfmt --check (or prettier --check if oxfmt deferred)
job: typecheck       -> pnpm -r typecheck
job: unit            -> pnpm -r test (jsdom only)
job: build           -> pnpm -r build
job: integration     -> matrix [ubuntu-latest, macos-latest] x browser=[chromium, firefox]
job: e2e             -> ubuntu only; boots dev-signaling-server; Playwright runs e2e/
job: bun-tests      -> bun test for signaling-adapter-bun
```

Parallel where possible. `build` blocks `integration` + `e2e`.

`release.yml` on `main`:

- Changesets `version` PR auto-opens.
- Merging the version PR triggers `changesets publish` to npm with provenance.

### Flake budget

WebRTC tests are timing-sensitive.

- Integration: `retry: 2` on CI, `retry: 0` locally.
- Tests flaking >10% over a week → owner fixes or quarantines (`.skip` with TODO + GitHub issue).
- Flake rate tracked in weekly maintenance report (slice 2 concern).

### Local vs CI default

`pnpm test` runs **unit only** (fast feedback, no Chromium download required for unit). `pnpm test:integration` runs the browser layer. CI runs both. Documented in root README.

---

## 13. Examples

| Example                                     | Demonstrates                                           |
|---------------------------------------------|--------------------------------------------------------|
| `examples/vanilla-publisher-viewer/`        | Plain TS + Vite, two tabs, demonstrates raw API        |
| `examples/react-publisher-viewer/`          | React + Vite, hooks + `<VideoView>`                    |
| `examples/web-components-publisher-viewer/` | Plain HTML, `<video-publisher>` + `<video-viewer>`     |

Each example boots `apps/dev-signaling-server` via a workspace dev script.

---

## 14. Out of scope (will get their own specs in later slices)

- Multi-peer mesh / SFU integration
- Screenshare publisher (`getDisplayMedia`)
- Data channel chat / generic peer messaging
- Simulcast and SVC
- Recording (multitrack, WAV encoding, cloud upload — port of vdo.ninja `core/recording` and `core/uploads`)
- WHIP / WHEP client
- OBS bridge, MIDI, Streamdeck
- React Native adapter
- Server-side WebRTC (Node bindings)
- Audio metering worklet (port of vdo.ninja `core/audio`)
- Docs site
- Horizontal-scale signaling (Redis adapter, Cloudflare Durable Objects)
- Vue / Svelte / Angular / Solid native adapters (Web Components cover them in v0.1.0)
- Authentication beyond pluggable callback (JWT-baked-in, OAuth, etc.)
- TURN server bundling

---

## 15. Planning methodology — Epics & Stories

Implementation work tracked as **Jira-style epics → stories** so progress is visible and dependencies explicit. Epics group related work; stories are individually shippable units (each with acceptance criteria and a tracked branch / PR).

The detailed story breakdown (with acceptance criteria, blockers, story points, branch names) lives in the implementation plan (next step). The epic-level decomposition below freezes scope and order for v0.1.0.

### Epic dependency graph

```
EPIC-1 Foundation ──► EPIC-2 Protocol ──► EPIC-3 Core ──► EPIC-4 Server Adapters ──┬─► EPIC-5 React ──┐
                          │                                                        │                  ├─► EPIC-7 Examples ──► EPIC-9 Release
                          │                                                        └─► EPIC-6 WebComp ┘
                          │
                          └─► EPIC-8 Test Infra (parallel from start of EPIC-3)
```

### Epic catalog

| ID     | Epic                                 | Outcome                                                                                                          | Depends on        |
|--------|--------------------------------------|------------------------------------------------------------------------------------------------------------------|-------------------|
| EPIC-1 | Monorepo Foundation                  | pnpm workspace, wireit pipelines, tsconfig.base, oxlint + oxfmt (with Prettier fallback), Changesets, MIT LICENSE, root README, package scaffolding for all packages, CI skeleton | none              |
| EPIC-2 | `signaling-protocol` (engine + wire format) | Wire-format zod schemas (single source of truth), pure `SignalingEngine` class, room/peer state model, unit-tested in isolation | EPIC-1            |
| EPIC-3 | `@forinda/video-sdk-core`            | All modules under Section 5 implemented + unit-tested. Public surface frozen. State machine + retry policy implemented. Imports wire-format types from EPIC-2. | EPIC-2            |
| EPIC-4 | Signaling adapters (client + server) | `signaling-ws` (client), `signaling-broadcast` (client), `signaling-adapter-ws/express/hono/bun` (server), `signaling-server` CLI | EPIC-2, EPIC-3    |
| EPIC-5 | React adapter                        | All 7 exports from Section 8, SSR-safe, StrictMode-safe, hooks tested in jsdom + integration tests with real PC | EPIC-3, EPIC-4    |
| EPIC-6 | Web Components adapter               | All 3 elements from Section 9, ESM + IIFE builds, custom-elements.json emit, manual `defineElements` entry      | EPIC-3, EPIC-4    |
| EPIC-7 | Examples + dev server                | 3 working example apps (vanilla / React / web-components), `apps/dev-signaling-server`, all dev scripts wired   | EPIC-4, EPIC-5, EPIC-6 |
| EPIC-8 | Test infrastructure                  | `test-helpers` package, fake PC, in-memory signaling, RTP-flow recorder, Vitest browser config, Playwright e2e config | EPIC-1            |
| EPIC-9 | CI/CD + first release                | `ci.yml` (lint, typecheck, unit, build, integration matrix, e2e, bun-tests), `release.yml` (changesets + npm provenance), v0.1.0 published | EPIC-2..EPIC-8    |

### Story sizing convention

- **XS** — single file, < 100 LOC, < 2h work
- **S** — single module, ~1 day
- **M** — small feature crossing 2-3 files, ~2-3 days
- **L** — larger feature, ~1 week (consider splitting)
- **XL** — too big — must be split before starting

### Story acceptance criteria template

Every story in the implementation plan will use this shape:

```markdown
### STORY-<id>: <imperative title>
**Epic:** EPIC-<n>
**Size:** XS|S|M|L
**Depends on:** [STORY-<id>, ...]
**Branch:** feat/<short-name>

**Acceptance criteria:**
- [ ] <observable outcome 1>
- [ ] <observable outcome 2>
- [ ] Tests added (unit + integration where relevant)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green
- [ ] Changeset added if user-visible

**Out of scope for this story:** <what's deliberately deferred>
```

### Tracking

- One markdown file per epic under `docs/planning/epics/EPIC-<n>-<slug>.md` containing the full story list.
- Story state tracked via GitHub Issues + a Project board (Jira-style columns: Backlog / Ready / In progress / Review / Done).
- Each story's PR description links the story ID; merging closes the issue.
- Epic completion = all child stories Done + manual smoke test against the corresponding example app.

### v0.1.0 release definition-of-done

- All 9 epics complete.
- 3 example apps work end-to-end against `apps/dev-signaling-server` (manual smoke).
- README quickstart copy-pasteable on a clean machine (validated by an external reviewer).
- All packages published to npm with provenance attestations.
- Tagged `v0.1.0` in Git; release notes auto-generated by Changesets.

---

## 16. Open questions parked for implementation

1. **Browser baseline** — agree on minimum Chromium/Firefox/Safari versions. Proposal: Chromium 110+, Firefox 110+, Safari 16.4+. Confirm during implementation kickoff.
2. **Default STUN server** — Google's `stun:stun.l.google.com:19302` is the de-facto default but is not guaranteed forever. Document that consumers should configure their own for production.
3. **`oxfmt` readiness** — verify oxfmt stability when wiring CI. Fallback to Prettier documented above.
4. **Bun adapter test runner** — decide whether to gate `bun-tests` job behind a label, or always run (requires Bun installed in CI runner).

These do not block design approval; they're tracked for the implementation plan.
