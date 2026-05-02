# EPIC-3a: `@forinda/video-sdk-core` Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the foundational primitives of `@forinda/video-sdk-core` — logger, event emitter, SDK error hierarchy, internal helpers, signaling transport interface, full media subsystem (`getUserMedia` / device enumeration / track replacer), peer subsystem (PC wrapper, ICE/SDP helpers, perfect negotiation), and stats subsystem (collector + normalizer). EPIC-3b builds Publisher and Viewer on top of this foundation.

**Architecture:** Pure TypeScript classes + factories targeting browser. Each subsystem (logger, events, errors, internal, signaling, media, peer, stats) lives in its own `src/<subsystem>/` directory with one clear responsibility. Tests live under `test/unit/<subsystem>/` and use a hand-rolled fake `RTCPeerConnection` (~80 LOC, in `test/_mocks/`) plus a stubbed `navigator.mediaDevices` fixture. No real WebRTC is exercised here — that comes in EPIC-8 integration tests with `@vitest/browser`.

**Tech Stack:** TypeScript 6, ESM, zod 3 (transitive via `@forinda/video-sdk-signaling-protocol`), Vitest 2 + jsdom, oxlint + oxfmt, wireit, tsup. Already-scaffolded package at `packages/core/` (EPIC-1 baseline, currently `export {};`).

**Spec reference:** `docs/superpowers/specs/2026-05-02-video-sdk-design.md` — Section 5 (core internals), Section 7 (`SignalingTransport` interface), Section 10 (errors), Section 12 (testing).

**Project conventions** (from saved memories — apply to every task):

- **Factory style:** every public class also exports a `defineX({...})` factory; factory is the recommended call style, class stays exported for type imports & `instanceof`. Apply to internal classes too.
- **Inline JSDoc:** every `src/*.ts` file gets a file-header docblock + JSDoc on every exported symbol.
- **Path aliases:** `@/*` -> `src/*` in tests via tsconfig + vitest `resolve.alias`.
- **Split tsconfig:** `tsconfig.json` (IDE + typecheck, includes tests + vitest config) and `tsconfig.build.json` (tsup, src only).
- **TS 6 import extensions:** `import { X } from "./mod.ts"` (already enabled in base tsconfig).

**Definition of done:**

- All 17 tasks completed with their tests passing.
- `pnpm --filter @forinda/video-sdk-core build` exits 0; emits banner-stamped `dist/index.js` + `dist/index.d.ts`.
- `pnpm --filter @forinda/video-sdk-core typecheck` exits 0.
- `pnpm --filter @forinda/video-sdk-core test` exits 0.
- `pnpm --filter @forinda/video-sdk-core lint` exits 0.
- Coverage on `src/` >= 90% lines (verified locally).
- Public surface exports the primitives that EPIC-3b (Publisher / Viewer) consumes.
- Repo is tagged `v0.0.0-epic-3a`.

**Out of scope (deferred to EPIC-3b):**

- `Publisher` / `Viewer` orchestration classes.
- `ConnectionState` lifecycle state machine for end-to-end sessions.
- Auto-retry policy.
- Public `definePublisher` / `defineViewer` factories.
- Integration tests against real Chromium (EPIC-8).

---

## File structure created by this epic

```
packages/core/
  tsconfig.json                       # IDE + typecheck (includes src + tests + vitest config)
  tsconfig.build.json                 # tsup (src only)
  vitest.config.ts                    # jsdom env, @ alias, coverage thresholds
  tsup.config.ts                      # extend EPIC-1 stub: tsconfig + dts pointed at build variant
  src/
    index.ts                          # public surface — re-exports only (extended in EPIC-3b)
    logger/
      logger.ts                       # Logger interface + setLogger + defaultLogger
    events/
      emitter.ts                      # Typed Emitter class + defineEmitter factory
    errors/
      errors.ts                       # SdkError root + subclasses; re-exports protocol errors
    internal/
      assert.ts                       # invariant helper
      deferred.ts                     # Promise + resolve/reject pair
    signaling/
      transport.ts                    # SignalingTransport interface + TransportState
    media/
      constraints.ts                  # MediaTrackConstraints builders
      user-media.ts                   # getUserMedia wrapper with typed errors
      devices.ts                      # enumerateDevices + watchDevices
      track-replacer.ts               # replaceVideoTrack / replaceAudioTrack helpers
    peer/
      ice.ts                          # IceServerConfig normalizer
      sdp.ts                          # SDP helpers
      peer-connection.ts              # PeerConnection wrapper + definePeerConnection factory
      negotiation.ts                  # Perfect-negotiation orchestrator + defineNegotiator factory
    stats/
      types.ts                        # ConnectionStats shape
      normalize.ts                    # raw RTCStatsReport -> ConnectionStats
      collector.ts                    # StatsCollector polling class + defineStatsCollector factory
  test/
    _mocks/
      fake-pc.ts                      # ~80 LOC RTCPeerConnection fake
      fake-media-devices.ts           # navigator.mediaDevices stub
    unit/
      logger.test.ts
      events/emitter.test.ts
      errors/errors.test.ts
      internal/assert.test.ts
      internal/deferred.test.ts
      signaling/transport.test.ts
      media/constraints.test.ts
      media/user-media.test.ts
      media/devices.test.ts
      media/track-replacer.test.ts
      peer/ice.test.ts
      peer/sdp.test.ts
      peer/peer-connection.test.ts
      peer/negotiation.test.ts
      stats/normalize.test.ts
      stats/collector.test.ts
```

**File responsibilities:**

| File                      | Owns                                                                                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logger/logger.ts`        | `Logger` interface, `setLogger(impl)`, default noop logger; pluggable, never installs global handlers.                                                                                                                                                    |
| `events/emitter.ts`       | Tiny typed event emitter (~50 LOC, no deps). Single source for cross-class events.                                                                                                                                                                        |
| `errors/errors.ts`        | `SdkError` (root) + `PermissionDeniedError`, `DeviceNotFoundError`, `DeviceInUseError`, `OverconstrainedError`, `PeerConnectionError`, `IceFailedError`, `DtlsFailedError`, `NegotiationError`, `ConfigurationError`. Re-exports the protocol error tree. |
| `internal/assert.ts`      | `invariant(cond, msg)` for non-recoverable internal checks.                                                                                                                                                                                               |
| `internal/deferred.ts`    | `defineDeferred<T>()` returns `{ promise, resolve, reject }`.                                                                                                                                                                                             |
| `signaling/transport.ts`  | Browser-side `SignalingTransport` interface. Re-exports wire-format types from the protocol package.                                                                                                                                                      |
| `media/constraints.ts`    | Helpers to build `MediaStreamConstraints` from ergonomic options.                                                                                                                                                                                         |
| `media/user-media.ts`     | `getUserMedia(opts)` wrapper that maps DOMException -> typed `SdkError`.                                                                                                                                                                                  |
| `media/devices.ts`        | `enumerateDevices()` returns `{ cameras, microphones, speakers }` deduped + labeled; `watchDevices(cb)` for hotplug.                                                                                                                                      |
| `media/track-replacer.ts` | `replaceVideoTrack(pc, track)` / `replaceAudioTrack(pc, track)`.                                                                                                                                                                                          |
| `peer/ice.ts`             | `normalizeIceServers(input)` — accept shorthand or full `RTCIceServer[]`, validates URLs.                                                                                                                                                                 |
| `peer/sdp.ts`             | `hasMediaSection`, `listCodecPayloadTypes` SDP read helpers.                                                                                                                                                                                              |
| `peer/peer-connection.ts` | `PeerConnection` wraps `RTCPeerConnection`, exposes typed events.                                                                                                                                                                                         |
| `peer/negotiation.ts`     | Implements perfect-negotiation per W3C example.                                                                                                                                                                                                           |
| `stats/types.ts`          | `ConnectionStats` flat shape (inbound, outbound, rttMs).                                                                                                                                                                                                  |
| `stats/normalize.ts`      | `normalizeStats(raw, peerId)` reduces an `RTCStatsReport` to one `ConnectionStats`.                                                                                                                                                                       |
| `stats/collector.ts`      | `StatsCollector` polls `getStats()` on an interval, emits normalized stats events.                                                                                                                                                                        |

---

## Pre-flight (do once before starting Task 1)

- [ ] **Verify clean baseline:**

```bash
cd /home/forinda/dev/open-source/forinda-video-sdk
git status                       # expected: clean
git log --oneline -1             # expected: HEAD descends from v0.0.0-epic-2
pnpm install --frozen-lockfile
pnpm --filter @forinda/video-sdk-core build typecheck lint
```

Expected: all green; package builds the empty stub.

---

## Task list

Each task = TDD: write failing tests against `@/...` paths, implement to pass, run typecheck + lint + format, commit. Detailed code blocks for each task are inlined during execution (executor authors tests + impl in this session). Project conventions from saved memories apply throughout.

### Task 1 — Vitest + jsdom + tsconfig split + path aliases

**Files:** `packages/core/{vitest.config.ts, tsconfig.json, tsconfig.build.json, tsup.config.ts, package.json, test/_mocks/.gitkeep}`

Add `vitest`, `@vitest/coverage-v8`, `jsdom`, `@types/jsdom` dev deps. Split `tsconfig.json` (IDE + tests) vs `tsconfig.build.json` (tsup, src only). Add `@/*` path alias. Wire `test` script + wireit target. Vitest env `jsdom`, coverage thresholds 90/85/90/90. Placeholder `test/unit/sanity.test.ts` removed in Task 2.

### Task 2 — Logger

**Files:** `src/logger/logger.ts`, `test/unit/logger.test.ts`

`Logger` interface (`trace`/`debug`/`info`/`warn`/`error` taking optional `Record<string, unknown>` ctx). `defaultLogger` = noop. `setLogger(impl)` swaps active. `getLogger()` reads active. Tests verify default is silent, swap, restore.

### Task 3 — Typed Emitter

**Files:** `src/events/emitter.ts`, `test/unit/events/emitter.test.ts`

`Emitter<E extends EventMap>` class + `defineEmitter<E>()` factory. Methods: `on(event, listener) -> unsub`, `once`, `off`, `emit`, `removeAllListeners(event?)`. Listener exceptions caught + forwarded to `getLogger().error` so one bad listener can't poison siblings. ~50 LOC. Tests: registration, multi-listener order, off, once auto-unsub, exception isolation, removeAll variants.

### Task 4 — SdkError hierarchy

**Files:** `src/errors/errors.ts`, `test/unit/errors/errors.test.ts`

`SdkError` root with `code`, `cause`, `context`, `retryable`. Subclasses: `PermissionDeniedError` (code `permission_denied`), `DeviceNotFoundError` (`device_not_found`), `DeviceInUseError` (`device_in_use`, retryable=true), `OverconstrainedError` (`overconstrained`), `PeerConnectionError` (root for peer-layer, retryable=true), `IceFailedError` (`ice_failed`), `DtlsFailedError` (`dtls_failed`), `NegotiationError` (`negotiation_error`), `ConfigurationError` (`configuration_error`). Re-exports `SignalingProtocolError` tree from `@forinda/video-sdk-signaling-protocol`. Subclass options use `Omit<SdkErrorOptions, "code">` so callers can't weaken the code.

### Task 5 — Internal helpers

**Files:** `src/internal/{assert.ts, deferred.ts}`, tests under `test/unit/internal/`

`invariant(cond, msg): asserts cond` throws `Invariant: ${msg}` on falsy. `defineDeferred<T>()` returns `{ promise, resolve, reject }`.

### Task 6 — SignalingTransport interface

**Files:** `src/signaling/transport.ts`, `test/unit/signaling/transport.test.ts`

`SignalingTransport` interface with `connect`/`disconnect`/`send`/`on('message'|'state', handler)` + readonly `state`. `TransportState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed'`. Re-exports wire-format zod schemas + inferred types from protocol package so consumers import everything from core. Test: in-memory adapter satisfies the contract structurally; re-exports are usable.

### Task 7 — buildConstraints helper

**Files:** `src/media/constraints.ts`, `test/unit/media/constraints.test.ts`

`CaptureOptions` accepts `audio?: boolean | MediaTrackConstraints`, `video?: boolean | MediaTrackConstraints`. `buildConstraints(opts)` returns `MediaStreamConstraints`. Defaults missing kinds to `true`; `false` opts out. No coercion of explicit `false` to `true`.

### Task 8 — getUserMedia wrapper

**Files:** `test/_mocks/fake-media-devices.ts` (jsdom doesn't ship MediaDevices), `src/media/user-media.ts`, `test/unit/media/user-media.test.ts`

`installFakeMediaDevices()` returns `{ getUserMedia, enumerateDevices, fireDeviceChange, cleanup }` — replaces `navigator.mediaDevices` for the test. `getUserMedia(opts)` calls `buildConstraints` then `navigator.mediaDevices.getUserMedia`; maps DOMException name -> typed error: `NotAllowedError`/`SecurityError` -> `PermissionDeniedError`, `NotFoundError` -> `DeviceNotFoundError`, `NotReadableError` -> `DeviceInUseError`, `OverconstrainedError` -> `OverconstrainedError`, `TypeError` -> `ConfigurationError`, else generic `SdkError`. Original DOMException attached as `cause`.

### Task 9 — enumerateDevices + watchDevices

**Files:** `src/media/devices.ts`, `test/unit/media/devices.test.ts`

`DeviceList = { cameras, microphones, speakers }`. `enumerateDevices()` deduplicates by `${kind}:${deviceId}`. `watchDevices(cb)` invokes once with current list, then on every `devicechange` event. Returns unsubscribe that detaches the `devicechange` listener and prevents post-cancel callbacks.

### Task 10 — Track replacer

**Files:** `src/media/track-replacer.ts`, `test/unit/media/track-replacer.test.ts`

`replaceVideoTrack(pc, track)` and `replaceAudioTrack(pc, track)` find the matching-kind sender via `pc.getSenders()` and call `replaceTrack`. Throw `ConfigurationError` when no matching sender exists or the new track kind doesn't match the helper.

### Task 11 — ICE config normalizer

**Files:** `src/peer/ice.ts`, `test/unit/peer/ice.test.ts`

`IceServerConfig = string | string[] | RTCIceServer`. `normalizeIceServers(input)` -> `RTCIceServer[]`. Validates URL scheme is one of `stun:`, `stuns:`, `turn:`, `turns:`. TURN(S) entries must carry `username` + `credential`. Throws `ConfigurationError` on validation failure.

### Task 12 — SDP read helpers

**Files:** `src/peer/sdp.ts`, `test/unit/peer/sdp.test.ts`

`hasMediaSection(sdp, 'audio'|'video')` -> bool. `listCodecPayloadTypes(sdp, kind)` -> `{ pt, codec }[]` parsed from `a=rtpmap:` lines. v0.1.0 inspects only — no codec rewriting.

### Task 13 — PeerConnection wrapper + fake PC

**Files:** `test/_mocks/fake-pc.ts` (~80 LOC fake), `src/peer/peer-connection.ts`, `test/unit/peer/peer-connection.test.ts`

Fake PC: implements `addEventListener`/`removeEventListener`/`close`/`addTrack`/`getSenders`/`getReceivers`/`getStats`/`createOffer`/`createAnswer`/`setLocalDescription`/`setRemoteDescription`/`addIceCandidate`/`restartIce`. Extra `__fire(event, payload?)` and `__setState({connectionState, iceConnectionState, signalingState})` for test control.

`PeerConnection` constructor: `{ iceServers, pcFactory?, rtcConfig? }`. Default `pcFactory = (cfg) => new RTCPeerConnection(cfg)`. Bind `connectionstatechange` -> `connectionstate` event, `iceconnectionstatechange` -> `iceconnectionstate`, `icecandidate` -> `icecandidate` (RTCIceCandidate | null), `track` -> `track` (RTCTrackEvent). `close()` removes all listeners + closes raw. `.raw` exposes underlying PC. `definePeerConnection(opts)` factory.

### Task 14 — Perfect-negotiation orchestrator

**Files:** `src/peer/negotiation.ts`, `test/unit/peer/negotiation.test.ts`

`Negotiator` constructor: `{ pc, polite, localPeerId, remotePeerId, send: (SdpMessage) => void | Promise<void> }`. Methods: `makeOffer()`, `handleSdp({type, sdp})`, `handleIce(candidate | null)`. Implements W3C perfect-negotiation pattern: `polite` peer rolls back local offer on collision (`signalingState !== 'stable'` and incoming offer); `impolite` peer ignores incoming offer when colliding. `handleIce(null)` skips `addIceCandidate` (end-of-candidates marker). `defineNegotiator(opts)` factory.

### Task 15 — ConnectionStats type + normalizer

**Files:** `src/stats/types.ts`, `src/stats/normalize.ts`, `test/unit/stats/normalize.test.ts`

`ConnectionStats = { peerId, timestamp, connectionState, iceConnectionState, inbound, outbound, rttMs }`. Inbound: `bitrateBps`, `packetsLost`, `packetLossRatio (0..1)`, `jitterMs`, `framesPerSecond | null`, `frameWidth | null`, `frameHeight | null`. Outbound: `bitrateBps`, `framesPerSecond | null`, `frameWidth | null`, `frameHeight | null`, `qualityLimitationReason: 'none' | 'cpu' | 'bandwidth' | 'other'`. `normalizeStats(report, peerId, ctx)` walks report entries: `inbound-rtp` -> bytes*8, packetsLost, jitter*1000; `outbound-rtp` -> bytesSent*8, fps/dims/qualityLimit; `candidate-pair` (nominated or succeeded) -> `currentRoundTripTime * 1000`.

### Task 16 — StatsCollector polling wrapper

**Files:** `src/stats/collector.ts`, `test/unit/stats/collector.test.ts`

`StatsCollector` constructor: `{ pc, peerId, intervalMs }`. Methods: `start()`/`stop()` (idempotent), `collect()` one-shot, `on('stats', cb)`. `start()` arms `setInterval` that calls `pollOnce()` -> `pc.getStats()` -> `normalizeStats()` -> emit `stats` event. Tests use `vi.useFakeTimers()` to assert polling cadence. `defineStatsCollector(opts)` factory.

### Task 17 — Public surface + README + verify + tag

**Files:** `src/index.ts`, `README.md`

Re-export: logger (`Logger`/`defaultLogger`/`getLogger`/`setLogger`), events (`Emitter`/`defineEmitter`/`EventMap`/`Listener`), errors (full SdkError tree + protocol re-exports), internal (`invariant`, `Deferred`/`defineDeferred`), signaling (`SignalingTransport`/`TransportState` + wire-format types/schemas), media (`buildConstraints`/`CaptureOptions`/`getUserMedia`/`enumerateDevices`/`watchDevices`/`DeviceList`/`replaceVideoTrack`/`replaceAudioTrack`), peer (`normalizeIceServers`/`IceServerConfig`/`hasMediaSection`/`listCodecPayloadTypes`/`PeerConnection`/`definePeerConnection`/`PeerConnectionEvents`/`PeerConnectionOptions`/`PcFactory`/`Negotiator`/`defineNegotiator`/`NegotiatorOptions`/`SendFn`), stats (`ConnectionStats`/`InboundStats`/`OutboundStats`/`normalizeStats`/`StatsCollector`/`defineStatsCollector`/`StatsCollectorEvents`/`StatsCollectorOptions`).

README: list shipped primitives, install steps, MIT line. Then run full pipeline (`pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm lint`), confirm coverage >=90%, whole-workspace `pnpm install --frozen-lockfile && pnpm typecheck && pnpm build && pnpm lint`, then `git tag -a v0.0.0-epic-3a -m "..."`.

---

## Self-review notes

**Spec coverage** (against design doc Section 5/6/7/10/12):

- All Section 5 modules mapped to Tasks 2-16.
- Section 6 primitives (`getUserMedia`, `enumerateDevices`, `watchDevices`, `ConnectionStats`, `IceServerConfig` types) shipped via Task 17 public surface. Publisher / Viewer deferred to EPIC-3b.
- Section 7 `SignalingTransport` interface in Task 6.
- Section 10 SdkError hierarchy in Task 4 (plus `SignalingProtocolError` re-exports).
- Section 12 unit tests with jsdom in Task 1.

**Conventions applied:** `defineX` factories on every class (`defineEmitter`, `defineDeferred`, `definePeerConnection`, `defineNegotiator`, `defineStatsCollector`); inline JSDoc on every src file; `@/*` path alias; tsconfig split; TS 6 import extensions.

**Out of scope (EPIC-3b):** `Publisher`, `Viewer`, `ConnectionState` lifecycle machine, auto-retry policy, `definePublisher`/`defineViewer` factories, integration tests against real Chromium.

## Risks and notes for the implementer

- **TypeScript 6 `exactOptionalPropertyTypes`:** declare optional class fields with `T | undefined` not `T?` if you assign `undefined` later. Same lesson as EPIC-2.
- **jsdom missing APIs:** no `RTCPeerConnection`, no `MediaDevices`, no `MediaStream`. Use the `_mocks/fake-pc.ts` and `_mocks/fake-media-devices.ts` fixtures. Don't install global polyfills.
- **`StatsCollector` timer tests:** require `vi.useFakeTimers()` / `vi.useRealTimers()`. Real timers will hang.
- **`Negotiator` collision tests:** rely on the fake PC's `__setState({signalingState: ...})`. Real `signalingState` is read-only.
- **ICE scheme allowlist:** if a future browser adds a new scheme, expand `ALLOWED_SCHEMES` explicitly; don't loosen the regex.
