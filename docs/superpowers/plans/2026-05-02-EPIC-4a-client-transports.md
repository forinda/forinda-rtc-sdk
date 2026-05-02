# EPIC-4a: Client Transports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement two browser-side `SignalingTransport` adapters: `@forinda/video-sdk-signaling-ws` (production WebSocket transport with auto-reconnect, outbound buffering, heartbeat) and `@forinda/video-sdk-signaling-broadcast` (BroadcastChannel transport for same-tab demos and tests). Together they unblock real-browser publisher↔viewer usage.

**Architecture:** Both packages export a `defineX({...})` factory returning an object satisfying `SignalingTransport` from `@forinda/video-sdk-core`. WebSocket transport: wraps a real `WebSocket`, validates inbound messages with the zod schema, auto-reconnects on close (exponential backoff + jitter, opt-out via `reconnect: false`), buffers outbound while not yet connected and flushes on connect, sends ping every 30s and forces reconnect on missed pong. BroadcastChannel transport: ~50 LOC, no buffering needed (sync delivery), no reconnect (channel is process-local).

**Tech Stack:** TypeScript 6, ESM, Vitest 2 + jsdom, EPIC-3a primitives (`SignalingTransport`, `SignalingMessage`, `SignalingValidationError`, `defineLogger`, `defineEmitter`). Already-scaffolded packages at `packages/signaling-ws/` and `packages/signaling-broadcast/` (EPIC-1 baseline).

**Spec reference:** `docs/superpowers/specs/2026-05-02-video-sdk-design.md` — Section 7 (signaling adapters), Section 11 (transport reconnect layer).

**Project conventions:** factory style (`defineWebSocketSignaling` / `defineBroadcastSignaling`), inline JSDoc on every src file, `@/*` path alias in tests, tsconfig split, TS 6 import extensions.

**Definition of done:**

- All 12 tasks completed with their tests passing.
- Both packages: `pnpm --filter <pkg> build typecheck test lint` exits 0.
- Coverage on `src/` >= 90% lines.
- Public surface exports `defineWebSocketSignaling` / `WebSocketSignaling` and `defineBroadcastSignaling` / `BroadcastSignaling` plus relevant option types.
- Repo tagged `v0.0.0-epic-4a`.

**Out of scope (deferred):**

- Server-side adapters (EPIC-4b).
- Auth (token via query string is supported via opts but no JWT verification).
- Real cross-machine integration tests (EPIC-8).

---

## File structure

```
packages/signaling-ws/
  tsconfig.json                     # IDE + tests + @/ alias
  tsconfig.build.json               # tsup, src only
  vitest.config.ts                  # jsdom env, @/ alias
  package.json                      # add zod dep, vitest dev deps
  tsup.config.ts                    # already EPIC-1 baseline
  src/
    index.ts                        # public surface
    transport.ts                    # WebSocketSignaling class + defineWebSocketSignaling
    backoff.ts                      # tiny exponential backoff helper (reusable from EPIC-3b RetryPolicy concepts)
  test/
    _mocks/
      fake-websocket.ts             # ~80-LOC controllable WebSocket mock
    unit/
      transport-connect.test.ts
      transport-send.test.ts
      transport-message.test.ts
      transport-reconnect.test.ts
      transport-heartbeat.test.ts
      transport-close.test.ts

packages/signaling-broadcast/
  tsconfig.json
  tsconfig.build.json
  vitest.config.ts                  # jsdom env (BroadcastChannel polyfilled by jsdom)
  package.json                      # add vitest dev deps
  src/
    index.ts
    transport.ts                    # BroadcastSignaling class + defineBroadcastSignaling
  test/
    unit/
      transport.test.ts
```

---

## Pre-flight

- [ ] **Verify clean baseline:**

```bash
cd /home/forinda/dev/open-source/forinda-video-sdk
git status                          # clean
git log --oneline -1                # HEAD descends from v0.0.0-epic-3b
pnpm install --frozen-lockfile
pnpm --filter @forinda/video-sdk-signaling-ws build typecheck lint
pnpm --filter @forinda/video-sdk-signaling-broadcast build typecheck lint
```

---

## Task list

### Task 1 — `signaling-ws` test infra: vitest + tsconfig split + path aliases

**Files:** `packages/signaling-ws/{tsconfig.json, tsconfig.build.json, vitest.config.ts, package.json}`

Add `vitest`, `@vitest/coverage-v8`, `jsdom`, `@types/jsdom` deps. Split tsconfig (json + build.json). Vitest jsdom env, `@/*` alias, coverage thresholds 90/85/90/90. Add wireit `test` target. Sanity test `test/unit/sanity.test.ts` removed in Task 2.

### Task 2 — Fake WebSocket fixture

**Files:** `packages/signaling-ws/test/_mocks/fake-websocket.ts`

Hand-rolled `WebSocket` substitute (~80 LOC). Surface: `addEventListener('open'|'message'|'close'|'error', ...)`, `removeEventListener`, `send(data)`, `close()`, `readyState` (CONNECTING/OPEN/CLOSING/CLOSED), `__open()`, `__message(data)`, `__close(code?, reason?)`, `__error(err)` for test control. Constructor signature matches global `WebSocket(url, protocols?)`. Returns the instance via factory `createFakeWebSocketFactory(): { factory, lastInstance }`.

### Task 3 — `WebSocketSignaling` connect/disconnect lifecycle

**Files:** `packages/signaling-ws/src/transport.ts` (skeleton), `packages/signaling-ws/test/unit/transport-connect.test.ts`

`WebSocketSignalingOptions = { url: string, protocols?: string | string[], wsFactory?: (url, protocols?) => WebSocket, reconnect?: boolean, heartbeatIntervalMs?: number, auth?: () => string | Promise<string> }`. Defaults: `reconnect: true`, `heartbeatIntervalMs: 30000`. `wsFactory` defaults to `(...args) => new WebSocket(...args)`.

`WebSocketSignaling` class: implements `SignalingTransport`. Constructor stores opts, state starts `idle`. `connect()` builds the URL (with token query if `auth` provided), opens WebSocket via factory, registers open/message/close/error listeners, transitions `connecting -> connected` on open. `disconnect()` calls `ws.close()`, transitions to `closed`. `state` getter, `on(event, handler)` returns unsub.

`defineWebSocketSignaling(opts)` factory.

Tests: factory returns instance, idle initial state, connect transitions state, disconnect closes ws + transitions, idempotent connect/disconnect.

### Task 4 — `send` outbound + zod-validated inbound

**Files:** `packages/signaling-ws/src/transport.ts` (extend), `packages/signaling-ws/test/unit/transport-send.test.ts`, `transport-message.test.ts`

`send(message)`: serializes via `JSON.stringify` and writes to `ws.send`. Throws if state !== `connected` (Task 5 changes this to buffer instead).

Inbound `message` event: `JSON.parse(event.data)`, validate via `SignalingMessage.safeParse(...)`. On success emit `'message'` with parsed value. On parse/validation fail throw or log+drop — emit nothing, log via `getLogger().warn` with the raw payload + cause.

Tests:

- send while connected calls ws.send with serialized message
- send while disconnected throws (initial behavior; Task 5 overrides)
- inbound valid message → handler invoked with parsed data
- inbound malformed JSON → no handler invocation, log warn
- inbound invalid schema → no handler invocation, log warn

### Task 5 — Outbound buffer + flush on connect

**Files:** `packages/signaling-ws/src/transport.ts` (modify send + connect), `packages/signaling-ws/test/unit/transport-send.test.ts` (extend)

Replace the throw with a queue. While `state !== "connected"`, enqueue messages in an internal array. On `open` event (after the state transition), drain the queue in order. On `close`, do NOT drop the queue — preserve so reconnect can flush.

Tests: send before connect → queued; connect → all queued messages dispatched in order; subsequent send while connected → immediate.

### Task 6 — Auto-reconnect with bounded backoff

**Files:** `packages/signaling-ws/src/backoff.ts`, `packages/signaling-ws/src/transport.ts` (extend), `packages/signaling-ws/test/unit/transport-reconnect.test.ts`

Implement minimal `nextBackoff(attempt, opts)` helper in `backoff.ts`: `min(initial * 2^attempt, max)` with `±jitter` (default 0.25). Returns ms. Defaults: `initial 1000`, `max 30000`. Could later replace with the EPIC-3b `RetryPolicy` but transport reconnect is its own simpler loop.

`WebSocketSignaling.connect()` already opens once. On unexpected `close` while not in user-initiated `disconnect()`:

- transition `connected -> reconnecting`
- compute next backoff
- `setTimeout` to reopen
- on success: transition back to `connected`, flush buffer, reset attempt counter
- consumer can opt out via `reconnect: false` (transitions to `closed` instead)

No bound on attempts — transport reconnects forever (publisher/viewer's `RetryPolicy` already bounds session-level retries).

Tests with `vi.useFakeTimers()`: kill ws → reconnecting state → advance time past backoff → new ws constructed → opens → connected; multiple drops → backoff doubles; `reconnect: false` → closed on first drop.

### Task 7 — Heartbeat ping + missed-pong reconnect

**Files:** `packages/signaling-ws/src/transport.ts` (extend), `packages/signaling-ws/test/unit/transport-heartbeat.test.ts`

While `connected`, send a `{"type":"ping"}` JSON frame every `heartbeatIntervalMs`. The wire format doesn't include `ping`/`pong`; this is sent as a raw string (the SDK's `send` would refuse — use a private `sendRaw`). Alternatively skip JSON-validation for transport-internal control frames.

On any inbound message, reset a "last activity" timestamp. If no inbound activity within `2 * heartbeatIntervalMs`, treat as silent connection failure: close ws (which triggers the auto-reconnect path).

Tests with `vi.useFakeTimers()`:

- after `heartbeatIntervalMs` elapsed, ws.send called with ping payload
- inbound message resets the activity clock
- no activity for 2× interval → ws.close called

### Task 8 — `auth` callback + URL token query

**Files:** `packages/signaling-ws/src/transport.ts` (extend connect), `packages/signaling-ws/test/unit/transport-connect.test.ts` (extend)

When `auth: () => string | Promise<string>` provided, await it before opening the WebSocket and append `?token=...` (or `&token=...` if URL already has query) to the URL. Re-fetched on every reconnect attempt so rotated tokens work.

Tests: auth callback awaited; token appended; rotation on reconnect.

### Task 9 — `signaling-ws` public surface + verify

**Files:** `packages/signaling-ws/src/index.ts`, `packages/signaling-ws/README.md`

`src/index.ts`:

```ts
export { defineWebSocketSignaling, WebSocketSignaling } from "./transport.ts";
export type { WebSocketSignalingOptions } from "./transport.ts";
```

README: install + usage example + reconnect/heartbeat options table + MIT line.

Run full pipeline: `pnpm --filter @forinda/video-sdk-signaling-ws build typecheck test lint`. Coverage check.

### Task 10 — `signaling-broadcast` test infra

**Files:** `packages/signaling-broadcast/{tsconfig.json, tsconfig.build.json, vitest.config.ts, package.json}`

Same shape as Task 1 — split tsconfig, jsdom env (jsdom 25 supports BroadcastChannel), `@/` alias, vitest + coverage deps, wireit `test` target.

### Task 11 — `BroadcastSignaling` impl + factory

**Files:** `packages/signaling-broadcast/src/transport.ts`, `packages/signaling-broadcast/test/unit/transport.test.ts`, `packages/signaling-broadcast/src/index.ts`, `packages/signaling-broadcast/README.md`

`BroadcastSignalingOptions = { channel: string }`.

`BroadcastSignaling` implements `SignalingTransport`:

- `connect()` opens `new BroadcastChannel(opts.channel)`, attaches `onmessage`. State: `idle -> connecting -> connected` (synchronously — BroadcastChannel has no real handshake).
- `disconnect()` calls `bc.close()`, transitions `closed`.
- `send(message)` posts via `bc.postMessage(message)` (no JSON serialization — BroadcastChannel handles structured cloning).
- Inbound: validate via `SignalingMessage.safeParse`, emit `message` on success; log+drop on failure.
- No reconnect (channel is local), no buffer (synchronous), no heartbeat.

`defineBroadcastSignaling({ channel })` factory.

Tests: connect/disconnect, send-receive across two paired channel instances (jsdom supports this within one realm), invalid messages dropped.

README: install + usage + caveat ("same-tab only — no real network transport").

### Task 12 — Whole-workspace verify + tag

**Files:** none modified.

Run from repo root:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm lint
git status                        # clean
```

Coverage spot-check on both packages. Then:

```bash
git tag -a v0.0.0-epic-4a -m "EPIC-4a complete: client transports

signaling-ws: WebSocket transport with auto-reconnect, outbound buffering,
ping/pong heartbeat, token query auth.
signaling-broadcast: BroadcastChannel transport for same-tab demos.

Both export defineX factories satisfying the SignalingTransport interface
from @forinda/video-sdk-core. Coverage >=90%."
```

---

## Self-review notes

**Spec coverage:**

| Spec section / requirement                                           | Plan task   |
| -------------------------------------------------------------------- | ----------- |
| Section 7 — `SignalingTransport` interface impl (browser side)       | Tasks 3, 11 |
| Section 7 — WebSocket adapter with auto-reconnect                    | Task 6      |
| Section 7 — Outbound message buffering during reconnect              | Task 5      |
| Section 7 — Heartbeat (ping/pong)                                    | Task 7      |
| Section 7 — Optional auth via callback returning token               | Task 8      |
| Section 7 — BroadcastChannel adapter                                 | Task 11     |
| Section 11 — Transport-layer reconnect (separate from session retry) | Task 6      |

**Conventions:** `defineWebSocketSignaling` / `defineBroadcastSignaling` factories, inline JSDoc, `@/` alias, tsconfig split.

## Risks and notes

- **jsdom WebSocket:** jsdom does NOT polyfill WebSocket. The fake-websocket fixture replaces global `WebSocket` for tests via the injectable `wsFactory` option, not by patching `globalThis`.
- **jsdom BroadcastChannel:** jsdom 25 supports it. If a test fails on `BroadcastChannel is not defined`, fall back to a tiny in-memory polyfill in the test setup.
- **Heartbeat ping format:** the SDK's wire format doesn't include `ping`/`pong` types. Use a private `sendRaw` that bypasses JSON.stringify-of-validated-message and just writes the literal `'{"type":"ping"}'`. Server-side: ignored (unrecognized message). Or document that `ping` is reserved for client→server liveness.
- **Reconnect during send:** if `send()` is called while reconnecting, message goes into the buffer. Don't throw.
- **Token rotation:** the `auth` callback is invoked on every reconnect attempt. Don't cache the resolved token across reconnects.
