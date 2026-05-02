# EPIC-3b: `@forinda/video-sdk-core` Publisher + Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the orchestration layer on top of EPIC-3a primitives — `Publisher` and `Viewer` classes with `definePublisher` / `defineViewer` factories, the consumer-visible `ConnectionState` lifecycle machine, and the auto-retry policy. Completes `@forinda/video-sdk-core` for v0.1.0.

**Architecture:** Two orchestration classes wrap the EPIC-3a primitives (`PeerConnection`, `Negotiator`, `StatsCollector`) plus a fresh `SignalingTransport`. State machine + retry policy are stand-alone helpers reused by both. Publisher manages many viewer-side `RTCPeerConnection`s (one per viewer); Viewer manages one upstream `RTCPeerConnection`. Tests use an in-memory `SignalingTransport` fake (paired publisher↔viewer transports) plus the existing fake `RTCPeerConnection` from EPIC-3a.

**Tech Stack:** TypeScript 6, ESM, Vitest 2 + jsdom, EPIC-3a primitives. Already-scaffolded package at `packages/core/` (EPIC-3a baseline tag `v0.0.0-epic-3a`).

**Spec reference:** `docs/superpowers/specs/2026-05-02-video-sdk-design.md` — Section 6 (Publisher/Viewer public API), Section 11 (state machine + retry).

**Project conventions** (apply to every task — from saved memories): factory style (`defineX({...})`), inline JSDoc on every src file, `@/*` path alias in tests, tsconfig split, TS 6 import extensions.

**Definition of done:**

- All 15 tasks completed with their tests passing.
- `pnpm --filter @forinda/video-sdk-core build typecheck test lint` exits 0.
- Coverage on `src/` >= 90% lines locally.
- Public surface in `src/index.ts` exports `definePublisher`, `Publisher`, `defineViewer`, `Viewer`, `ConnectionState`, `RetryConfig` and dependent types.
- Smoke test exercises a full publisher↔viewer loopback through the in-memory transport.
- Repo tagged `v0.0.0-epic-3b` (EPIC-3 complete).

**Out of scope (deferred to later epics):**

- Real WebRTC integration tests (EPIC-8, `@vitest/browser` + Chromium).
- Browser-side `signaling-ws` / `signaling-broadcast` adapters (EPIC-4).
- React / Web Components wrappers (EPIC-5/6).

---

## File structure created by this epic

```
packages/core/src/
  state/
    connection-state.ts             # ConnectionState type + StateMachine helper + defineStateMachine
  retry/
    policy.ts                       # RetryPolicy backoff helper + defineRetryPolicy + RetryConfig type
  publisher/
    types.ts                        # PublisherOptions, PublisherEvents, ViewerInfo
    publisher.ts                    # Publisher class + definePublisher factory
  viewer/
    types.ts                        # ViewerOptions, ViewerEvents
    viewer.ts                       # Viewer class + defineViewer factory
  index.ts                          # extended public surface

packages/core/test/
  _mocks/
    in-memory-signaling.ts          # paired SignalingTransport fakes (publisher<->viewer)
  unit/
    state/connection-state.test.ts
    retry/policy.test.ts
    publisher/publisher.test.ts
    publisher/publisher-state.test.ts
    publisher/publisher-retry.test.ts
    viewer/viewer.test.ts
    viewer/viewer-state.test.ts
    viewer/viewer-retry.test.ts
    smoke/loopback.test.ts          # publisher + viewer end-to-end
```

**File responsibilities:**

| File                            | Owns                                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state/connection-state.ts`     | `ConnectionState` string union; `StateMachine` helper with allowed transitions; emits change events.                                                                                                           |
| `retry/policy.ts`               | `RetryConfig` shape; `RetryPolicy` class — computes next delay (exponential backoff + jitter), tracks attempts, enforces budget.                                                                               |
| `publisher/publisher.ts`        | `Publisher` class: signaling join, per-viewer PC management via `definePeerConnection` + `defineNegotiator` + `defineStatsCollector`, state machine integration, retry integration. `definePublisher` factory. |
| `viewer/viewer.ts`              | `Viewer` class: signaling join, single upstream PC management, track-event → `track` event, state + retry integration. `defineViewer` factory.                                                                 |
| `_mocks/in-memory-signaling.ts` | `createInMemoryTransportPair()` returns `{ publisher: SignalingTransport, viewer: SignalingTransport }` whose `send` delivers to the other's `message` listeners. No serialization.                            |

---

## Pre-flight (do once before starting Task 1)

- [ ] **Verify clean baseline:**

```bash
cd /home/forinda/dev/open-source/forinda-video-sdk
git status                          # expected: clean
git log --oneline -1                # expected: HEAD descends from v0.0.0-epic-3a
pnpm install --frozen-lockfile
pnpm --filter @forinda/video-sdk-core build typecheck test lint
```

Expected: all green; EPIC-3a primitives intact.

---

## Task list

Each task = TDD: write failing tests, implement to pass, run typecheck + lint + format, commit. Code blocks authored inline during execution.

### Task 1 — In-memory signaling transport pair (test fixture)

**Files:** `test/_mocks/in-memory-signaling.ts`

`createInMemoryTransportPair() -> { publisher, viewer }` returns two `SignalingTransport` impls. Each transport's `send(msg)` enqueues the message into the other's `message` listeners (next microtask). Both transports start `idle`; `connect()` flips both to `connected` and emits `state` events. `disconnect()` flips both to `closed`. No JSON serialization (faster + simpler — wire-format validation already covered in EPIC-2 tests). No external test — used as fixture by Tasks 5+.

### Task 2 — `ConnectionState` + `StateMachine` helper

**Files:** `src/state/connection-state.ts`, `test/unit/state/connection-state.test.ts`

```ts
type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "failed" | "closed";
```

`StateMachine` class enforces allowed transitions (no jumping `idle -> connected`; `closed` is terminal except via fresh constructor). `transition(to: ConnectionState): boolean` returns whether the transition was allowed. `current(): ConnectionState`. `on(handler) -> unsub` for change events. `defineStateMachine({ initial?: ConnectionState })` factory. Allowed transitions:

- `idle` → `connecting` | `closed`
- `connecting` → `connected` | `failed` | `closed`
- `connected` → `reconnecting` | `failed` | `closed`
- `reconnecting` → `connected` | `failed` | `closed`
- `failed` → `reconnecting` | `closed`
- `closed` → (none)

Tests cover allowed/forbidden transitions, change event emission, idempotent same-state writes (no event), getter.

### Task 3 — `RetryPolicy` + `RetryConfig`

**Files:** `src/retry/policy.ts`, `test/unit/retry/policy.test.ts`

```ts
interface RetryConfig {
  enabled?: boolean; // default true
  maxAttempts?: number; // default 5
  maxDurationMs?: number; // default 5 * 60_000
  initialBackoffMs?: number; // default 1000
  maxBackoffMs?: number; // default 30_000
  jitter?: number; // default 0.25 (±25%)
  successResetMs?: number; // default 30_000
}
```

`RetryPolicy` class:

- `nextDelayMs(): number | null` — null when budget exhausted; else exponential `min(initial * 2^(attempt-1), maxBackoff)` with `±jitter` random factor. Increments attempt counter.
- `markSuccess()` — call after sustained `connected`; clears attempt counter.
- `markFailure()` — explicit fail (advances toward exhaustion via duration check).
- `isExhausted(): boolean`
- `attempt: number` getter, `elapsedMs: number` getter.

`defineRetryPolicy({...})` factory. Tests use `vi.useFakeTimers()` to assert backoff math + budget exhaustion under both `maxAttempts` and `maxDurationMs`. Verify jitter is bounded (±25% of computed). Verify `markSuccess` resets after the success-hold window.

### Task 4 — Publisher: types + skeleton (signaling join only)

**Files:** `src/publisher/types.ts`, `src/publisher/publisher.ts`, `test/unit/publisher/publisher.test.ts`

`PublisherOptions = { signaling: SignalingTransport, room: string, peerId?: string, stream: MediaStream, iceServers?: RTCIceServer[], stats?: { interval: number }, retry?: RetryConfig, pcFactory?: PcFactory }`. `peerId` defaults to `crypto.randomUUID()`.

`PublisherEvents = { state: ConnectionState; viewer: ViewerInfo; "viewer-left": ViewerInfo; stats: ConnectionStats[]; retry: { attempt: number; nextDelayMs: number; lastError: SdkError }; error: SdkError }`.

`ViewerInfo = { peerId: string }`.

`Publisher` class methods (skeleton scope):

- `start()`: connect signaling, send `{ type: "join", room, peer: peerId, role: "publisher" }`. Transitions `idle -> connecting -> connected` once signaling state hits `connected`.
- `stop()`: send `{ type: "leave" }`, disconnect signaling, transition to `closed`. Tear down per-viewer state in later tasks.
- `peers(): readonly string[]` (returns empty for now)
- `state` / `peerId` / `room` getters
- `on(event, handler) -> unsub` (typed)

Tests: construction, `start()` connects + emits `connecting` + `connected`, `stop()` cleanly reaches `closed`. Use the in-memory transport pair from Task 1 (only the publisher side).

### Task 5 — Publisher: handle peer-joined → spin up per-viewer PC + Negotiator

**Files:** `src/publisher/publisher.ts` (extend), `test/unit/publisher/publisher.test.ts` (extend)

When publisher receives `{ type: "peer-joined", peer, role: "viewer" }`:

1. Build `RTCPeerConnection` via `definePeerConnection` (use `pcFactory` if provided so tests can inject `createFakePeerConnection`).
2. Add stream tracks via `pc.raw.addTrack(track, stream)` for each track.
3. Build `Negotiator` (publisher = impolite by convention) with `send` wired to the signaling transport.
4. Wire `pc.on("icecandidate", c => signaling.send({ type: "ice", from: peerId, to: viewerId, candidate: c?.toJSON() ?? null }))`.
5. Call `negotiator.makeOffer()`.
6. Track per-viewer state in `Map<peerId, { pc, negotiator, stats? }>`.
7. Emit `viewer` event with `{ peerId }`.

When `peer-left` arrives or `handleDisconnect`-equivalent fires: tear down that viewer's PC + negotiator, emit `viewer-left`.

Tests: stub two viewers joining via in-memory signaling; assert one PC per viewer is constructed with correct config; offers fired via signaling; `viewers()` reflects the set; `viewer-left` removes from set.

### Task 6 — Publisher: handle inbound SDP/ICE per viewer

**Files:** `src/publisher/publisher.ts` (extend), `test/unit/publisher/publisher.test.ts` (extend)

When publisher receives `{ type: "sdp", from: viewerId, sdp }` or `{ type: "ice", from: viewerId, candidate }`, look up the viewer in the per-viewer map and route to its `Negotiator.handleSdp` / `handleIce`. Inbound messages with unknown viewer IDs are dropped + logged at warn level.

Tests: simulate viewer answering an offer; assert `pc.setRemoteDescription` was called with the answer payload. Simulate viewer ICE candidate; assert `pc.addIceCandidate` was called.

### Task 7 — Publisher: stats per viewer + getStats() aggregate

**Files:** `src/publisher/publisher.ts` (extend), `test/unit/publisher/publisher.test.ts` (extend)

When `stats: { interval }` provided, attach a `StatsCollector` per viewer on viewer-joined. Subscribe to its `stats` event and aggregate into a `stats` event payload `ConnectionStats[]` (one entry per viewer). On `viewer-left`, stop and detach the collector.

`getStats(): Promise<ConnectionStats[]>` — one-shot manual collection: call `collector.collect()` for each tracked viewer, return array.

Tests: use `vi.useFakeTimers()`; advance time, assert `stats` event fires with one entry per viewer. Assert `getStats()` returns the same shape.

### Task 8 — Publisher: replaceVideoTrack / replaceAudioTrack

**Files:** `src/publisher/publisher.ts` (extend), `test/unit/publisher/publisher.test.ts` (extend)

Hot-swap helpers delegate to `replaceVideoTrack(pc.raw, track)` / `replaceAudioTrack` for every viewer's PC. Throws `ConfigurationError` if no viewers connected (stricter than EPIC-3a's per-PC helper because it's the consumer-visible surface).

Tests: connect 2 viewers, call `replaceVideoTrack(newTrack)`, assert each viewer's `RTCRtpSender.replaceTrack` got the new track. Assert error when zero viewers.

### Task 9 — Publisher: state machine + retry integration

**Files:** `src/publisher/publisher.ts` (extend), `test/unit/publisher/publisher-state.test.ts`, `test/unit/publisher/publisher-retry.test.ts`

Wire `StateMachine` and `RetryPolicy`:

- Signaling state changes drive Publisher state: `connecting` → `connected` → `reconnecting` (signaling lost) → `failed` (transport gave up).
- On `failed`, schedule retry via `retryPolicy.nextDelayMs()`. Emit `retry` event. After delay, attempt full restart (close all per-viewer PCs, reconnect signaling, re-join). If `retryPolicy.isExhausted()`, transition to terminal `closed` with `error` event `code: "retry_exhausted"`.
- `connected` for >= `successResetMs` calls `retryPolicy.markSuccess()`.

Tests:

- State machine: simulate signaling state transitions, assert publisher state events in correct order.
- Retry: kill signaling mid-session, assert `retry` event fires, advance fake timers past backoff, assert reconnect attempt. Exhaust budget, assert `closed` + `error`.

### Task 10 — `definePublisher` factory + `Publisher` class export

**Files:** `src/publisher/publisher.ts` (final factory)

`definePublisher(opts: PublisherOptions): Publisher` factory function (project convention). Class export already in place from Task 4. Add file-header JSDoc summarizing the orchestration. Test that the factory returns an instance of `Publisher`.

### Task 11 — Viewer: types + skeleton

**Files:** `src/viewer/types.ts`, `src/viewer/viewer.ts`, `test/unit/viewer/viewer.test.ts`

`ViewerOptions = { signaling: SignalingTransport, room: string, peerId?: string, publisherId: string, iceServers?: RTCIceServer[], stats?: { interval: number }, retry?: RetryConfig, pcFactory?: PcFactory }`.

`ViewerEvents = { state: ConnectionState; track: { stream: MediaStream }; stats: ConnectionStats; retry: { attempt, nextDelayMs, lastError }; error: SdkError }`.

`Viewer` class methods (skeleton):

- `start()`: connect signaling, send `{ type: "join", room, peer: peerId, role: "viewer" }`. Move `idle -> connecting`.
- `stop()`: send leave, disconnect signaling, tear down PC, transition to `closed`.
- `state`, `peerId`, `room`, `publisherId` getters.
- `stream: MediaStream | null` getter (set when first track event fires).
- `on(event, handler) -> unsub`.

Tests: construction, start emits `connecting`, stop reaches `closed`.

### Task 12 — Viewer: handle peer-joined publisher → build PC; handle SDP offer → answer

**Files:** `src/viewer/viewer.ts` (extend), `test/unit/viewer/viewer.test.ts` (extend)

When viewer receives `{ type: "peer-joined", peer, role: "publisher" }` matching `publisherId`:

1. Build `RTCPeerConnection` via `definePeerConnection`.
2. Build `Negotiator` (viewer = polite).
3. Wire ICE → signaling.send.
4. Wire `pc.on("track", e => { stream = e.streams[0]; emit("track", { stream }) })`.

When SDP offer arrives from `publisherId`: pass to `negotiator.handleSdp` (which sends back the answer via signaling).

When ICE arrives from `publisherId`: pass to `negotiator.handleIce`.

Tests: simulate publisher peer-joined, assert PC built with correct ICE config. Simulate SDP offer arriving, assert `setRemoteDescription` + `createAnswer` + outbound answer via signaling. Simulate inbound ICE, assert `addIceCandidate`.

### Task 13 — Viewer: track event + state machine + retry + getStats

**Files:** `src/viewer/viewer.ts` (extend), `test/unit/viewer/viewer-state.test.ts`, `test/unit/viewer/viewer-retry.test.ts`

State machine: `connecting -> connected` once signaling AND PC connection state both reach `connected` AND first `track` event observed. Track via `pc.on("connectionstate", ...)` + the `track` listener already wired in Task 12.

Retry: same shape as Publisher (Task 9). On signaling/PC failure, schedule retry with backoff; on exhaustion → `closed` + `error: retry_exhausted`.

`getStats(): Promise<ConnectionStats>` — single object (not array, since one upstream PC). When `stats: { interval }` provided, attach `StatsCollector` and emit `stats` event on each tick.

Tests: state transitions with signaling+PC+track combinations; retry on signaling drop; stats polling.

### Task 14 — `defineViewer` factory + Viewer class export

**Files:** `src/viewer/viewer.ts` (final factory)

`defineViewer(opts: ViewerOptions): Viewer` factory function. Class already exported from Task 11. File-header JSDoc summarizing the flow. Factory returns instance test.

### Task 15 — Public surface extension + smoke test + verify + tag

**Files:** `src/index.ts`, `README.md`, `test/unit/smoke/loopback.test.ts`

Extend `src/index.ts` with:

- `definePublisher`, `Publisher`, `type PublisherOptions`, `type PublisherEvents`, `type ViewerInfo`
- `defineViewer`, `Viewer`, `type ViewerOptions`, `type ViewerEvents`
- `defineStateMachine`, `StateMachine`, `type ConnectionState`
- `defineRetryPolicy`, `RetryPolicy`, `type RetryConfig`

Update README with publisher + viewer usage examples (factory style).

Smoke test (`test/unit/smoke/loopback.test.ts`): use the in-memory transport pair + a fake stream. Construct `definePublisher` + `defineViewer`, both `.start()`, await viewer's `track` event. Verify:

- Publisher saw `viewer` event with viewer's peerId.
- Viewer saw `track` event with a MediaStream.
- Both reach `connected` state.
- `.stop()` on both cleanly reaches `closed`.

Then run full pipeline + coverage + tag `v0.0.0-epic-3b`.

---

## Self-review notes

**Spec coverage** (against design doc Sections 6 + 11):

| Spec requirement                                                                          | Plan task                                                                                                                         |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Section 6 — `Publisher` constructor signature                                             | Task 4                                                                                                                            |
| Section 6 — `start`/`stop`/`peers`/`getStats`/`replaceVideoTrack`/`replaceAudioTrack`     | Tasks 4, 7, 8                                                                                                                     |
| Section 6 — Publisher events: `state`, `viewer`, `viewer-left`, `stats`, `retry`, `error` | Tasks 4, 5, 7, 9                                                                                                                  |
| Section 6 — `Viewer` constructor signature                                                | Task 11                                                                                                                           |
| Section 6 — `start`/`stop`/`getStats`/`stream` getter                                     | Tasks 11, 13                                                                                                                      |
| Section 6 — Viewer events: `state`, `track`, `stats`, `retry`, `error`                    | Tasks 12, 13                                                                                                                      |
| Section 6 — `definePublisher` / `defineViewer` factories                                  | Tasks 10, 14                                                                                                                      |
| Section 11 — `ConnectionState` lifecycle states                                           | Task 2                                                                                                                            |
| Section 11 — Layered recovery (signaling, ICE, renegotiation, session)                    | Task 9 (partial: session-level retry; signaling reconnect lives in EPIC-4 transport adapter; ICE restart deferred to a follow-up) |
| Section 11 — `RetryConfig` shape with documented defaults                                 | Task 3                                                                                                                            |
| Section 11 — `retry` event shape                                                          | Tasks 9, 13                                                                                                                       |
| Section 11 — `failed` is transient + auto-retry                                           | Tasks 9, 13                                                                                                                       |
| Section 11 — Bounded by maxAttempts OR maxDurationMs                                      | Task 3                                                                                                                            |
| Section 11 — successResetMs hold-down                                                     | Tasks 3, 9, 13                                                                                                                    |

**Conventions applied:** `defineX` factories on every public class (`definePublisher`, `defineViewer`, `defineStateMachine`, `defineRetryPolicy`); inline JSDoc on every src file; `@/*` path alias; tsconfig split (already wired in EPIC-3a).

**ICE restart note:** spec Section 11 calls for `restartIce()` on prolonged ICE disconnect. This is intentionally **deferred** to a follow-up patch — the auto-retry layer at session-level catches the failure and reconnects fully. Adding a separate ICE-restart layer would complicate state management for marginal benefit on browser-only v0.1.0 (network changes more often kill signaling than just ICE). EPIC-3b's retry covers the user-visible behavior (auto-recovery); a follow-up can add the in-place ICE restart optimization.

## Risks and notes for the implementer

- **`crypto.randomUUID()`** — available in jsdom + browsers but not bare Node <19. Node 20+ has it, so jsdom under Node 20 is fine. If a test fails on `randomUUID is not a function`, polyfill in `vitest.config.ts` setup.
- **Per-viewer PC tear-down ordering:** when stopping the publisher, close PCs _before_ disconnecting signaling so the `peer-left` broadcast still reaches viewers. Test for this explicitly.
- **In-memory signaling timing:** deliver messages on `queueMicrotask` to mirror real async; tests should `await Promise.resolve()` between send and assertion.
- **TS 6 `exactOptionalPropertyTypes`:** apply same pattern as EPIC-2/3a (`private foo: T | undefined;` not `private foo?: T;` when assigning `undefined` later).
- **Publisher = impolite, Viewer = polite:** documented in `Negotiator` (EPIC-3a). Don't flip — collision recovery depends on this asymmetry.
- **State sub-events do NOT regress:** the state machine forbids `reconnecting -> connecting`; if you find yourself wanting to write that, the state machine design is wrong, not the test.
