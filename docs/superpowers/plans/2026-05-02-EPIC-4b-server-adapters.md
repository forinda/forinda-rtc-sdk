# EPIC-4b: Server Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `SignalingEngine` (from EPIC-2) to four host frameworks plus ship a standalone CLI server, so users can embed signaling in their existing backend or run a no-config local server. Five packages: `signaling-adapter-ws` (Node `ws`), `signaling-adapter-express`, `signaling-adapter-hono`, `signaling-adapter-bun`, and `signaling-server` (standalone CLI + lib that wraps adapter-ws).

**Architecture:** Each adapter takes a `SignalingEngine` (or builds one with sensible defaults), opens a `Session` once, registers `session.onSend((peerId, msg) => writeToSocket(peerId, msg))` against an internal `peerId → ws` map, and translates host-framework lifecycle events (open / message / close / error) into `session.handleConnection / handleMessage / handleDisconnect` calls. The wire-format zod schemas come from `@forinda/video-sdk-signaling-protocol`; adapters never invent their own validation.

The standalone `signaling-server` package wraps `signaling-adapter-ws` so the same engine + session code powers both library use and the `npx forinda-signaling` CLI.

**Tech Stack:** TypeScript 6, ESM (express adapter is dual ESM+CJS per spec), Vitest 2 + node env, EPIC-2 `signaling-protocol`, `ws` (Node), `express`, `hono`, `Bun.serve` (Bun native).

**Spec reference:** `docs/superpowers/specs/2026-05-02-video-sdk-design.md` — Section 7 (server adapters), Section 12 (testing).

**Project conventions:** factory style (`defineXSignalingAdapter` / `defineSignalingServer`), inline JSDoc on every src file, `@/*` path alias in tests, tsconfig split, TS 6 import extensions, **thorough package READMEs** (no docs site).

**Definition of done:**

- All 6 tasks completed with their tests passing.
- All 5 packages: `pnpm --filter <pkg> build typecheck test lint` exits 0.
- Coverage on `src/` >= 90% lines (Bun adapter excluded — needs Bun runtime; tests are pre-staged but `.skip`'d under Vitest).
- Public surface exports `defineX` factories + class types for all 5 packages.
- Repo tagged `v0.0.0-epic-4b`.

**Out of scope (deferred):**

- Authentication beyond pluggable callback (no JWT verification baked in).
- Horizontal scaling (no Redis adapter; one process = one session).
- Cloudflare Workers adapter (deferred past v0.1.0).
- TLS termination (host-framework concern; adapters work over plain `http.Server`).
- Bun runtime CI gating (EPIC-9 wires the `bun-tests` GitHub Actions job).

---

## File structure (new, per package)

Each adapter package gets:

```
packages/signaling-adapter-<name>/
  tsconfig.json                     # IDE + tests + @/ alias
  tsconfig.build.json               # tsup, src only
  vitest.config.ts                  # node env, @/ alias
  package.json                      # add deps + test script + wireit test
  tsup.config.ts                    # already EPIC-1 baseline
  src/
    index.ts                        # public surface
    adapter.ts                      # adapter class + factory
  test/
    unit/
      adapter.test.ts               # spins up real server, drives via real WS client
  README.md                         # thorough docs per convention
```

`signaling-server` adds `src/cli.ts` (CLI entry) on top.

---

## Pre-flight

- [ ] **Verify clean baseline:**

```bash
cd /home/forinda/dev/open-source/forinda-video-sdk
git status                          # clean
git log --oneline -1                # HEAD descends from v0.0.0-epic-4a
pnpm install --frozen-lockfile
for pkg in signaling-adapter-ws signaling-adapter-express signaling-adapter-hono signaling-adapter-bun signaling-server; do
  pnpm --filter @forinda/video-sdk-$pkg build typecheck lint
done
```

Expected: every adapter package builds the empty stub.

---

## Task list

Each task = TDD-driven implementation of one package: vitest setup + adapter impl + tests + README + commit.

### Task 1 — `signaling-adapter-ws` (Node `ws` library)

**Files:**

- `packages/signaling-adapter-ws/{tsconfig.json, tsconfig.build.json, vitest.config.ts, package.json, src/index.ts, src/adapter.ts, test/unit/adapter.test.ts, README.md}`

**Deps to add:** `ws` (runtime), `@types/ws`, `vitest`, `@vitest/coverage-v8` (dev). `@forinda/video-sdk-signaling-protocol` already in deps.

**API:**

```ts
defineWebSocketSignalingServer({
  wss?: WebSocketServer,            // bring your own; created if omitted (port required)
  port?: number,                    // when wss is omitted
  engine?: SignalingEngine,         // bring your own; default-constructed if omitted
  authenticate?: (token, room) => boolean | Promise<boolean>,  // forwarded to engine
  maxPeersPerRoom?: number,         // forwarded
  socketId?: (request) => string,   // generate id; defaults to uuid
  extractToken?: (request) => string | undefined,
}): { wss, engine, session, close }
```

**Behavior:**

- If `wss` not provided, build `new WebSocketServer({ port })`.
- If `engine` not provided, build via `defineSignalingEngine({ authenticate, maxPeersPerRoom })`.
- Open one session: `session = engine.openSession()`.
- Track `Map<socketId, ws>`. Wire `session.onSend((peerId, msg) => find ws by peer→socket and ws.send(JSON.stringify(msg)))` — adapter must also maintain a `peerId → socketId` index from observing JoinRoom messages.
  - Simpler approach: `session` already knows the peer→socket index internally. Add a thin "send" lookup: adapter maintains its own `Map<socketId, ws>` and the engine's onSend hands us a peerId; adapter resolves peerId → socketId by inspecting the engine's session state. Even simpler: track our own `Map<peerId, ws>` updated when JoinRoom messages flow through — but that requires inspecting messages. Cleanest: keep a `Map<socketId, ws>` and ALSO track `Map<peerId, socketId>` by snooping inbound `join` messages before passing them to the session.
  - Pragmatic: adapter maintains `peerToSocket: Map<peerId, ws>` populated by sniffing `join` messages (parse-once, dispatch). When `onSend(peerId, msg)` fires, look up the ws and write.
- For each new connection: generate `socketId`, register in `Map<socketId, ws>`, call `session.handleConnection(socketId, { token })`.
- For each `message` event: call `session.handleMessage(socketId, raw)`. Catch `SignalingValidationError` and log+drop.
- For each `close` event: call `session.handleDisconnect(socketId)`, clean up maps.
- Returned `close()` shuts down the wss + engine.

**Tests:** spin up a real `WebSocketServer` on a random port; connect two real `WebSocket` clients (Node `ws` package); send `join` from one, expect `peer-joined` broadcast to the other; send `sdp` and verify routing; disconnect one and assert `peer-left` reaches the other.

### Task 2 — `signaling-adapter-express` (dual ESM + CJS)

**Files:** same shape as Task 1. Already configured for dual format in EPIC-1.

**Deps to add:** `express` (peer + dev), `@types/express`, `ws` + `@types/ws`, `vitest`, `@vitest/coverage-v8`. `@forinda/video-sdk-signaling-protocol` already.

**API:**

```ts
createExpressSignaling({
  app: express.Application,
  server: http.Server,              // existing express http server
  wss?: WebSocketServer,            // new on `noServer: true` if omitted
  path?: string,                    // upgrade path; default "/signaling"
  engine?: SignalingEngine,
  authenticate?: ...,
  maxPeersPerRoom?: ...,
  extractToken?: (request) => string | undefined,
}): { wss, session, close }
```

**Behavior:** wires the http upgrade event for `path` to a `WebSocketServer({ noServer: true })`. Each upgrade extracts a token (from `?token=` query by default), calls `wss.handleUpgrade`, and the resulting `ws` flows through the same session/connection handling as adapter-ws.

**Tests:** spin up a real Express + http server, connect a real WS client, exchange messages, assert routing.

### Task 3 — `signaling-adapter-hono` (edge-portable)

**Files:** same shape.

**Deps to add:** `hono` (peer + dev), `@hono/node-server` (dev for tests), `vitest`, `@vitest/coverage-v8`. Hono's WebSocket support varies by deploy target — for Node-server tests use `@hono/node-ws` or fall back to wrapping `ws` ourselves.

**API:**

```ts
defineHonoSignalingHandler({
  engine?: SignalingEngine,
  authenticate?: ...,
  maxPeersPerRoom?: ...,
  extractToken?: (request) => string | undefined,
}): {
  upgradeWebSocket: MiddlewareHandler,  // mount on the route the client connects to
  session,
  close,
}
```

**Behavior:** returns Hono middleware suitable for `app.get("/signaling", upgradeWebSocket)`. Internally constructs a wss + wires the session/connection plumbing. Mostly the same shape as Express but driven by Hono's middleware API.

**Pragmatic note:** Hono's WS abstraction varies across runtimes; use `@hono/node-ws` for the Node deploy and document that Cloudflare Workers / Deno / Bun deploys need their runtime-specific helper.

**Tests:** mount on `Hono` + `@hono/node-server`, spin up, connect real WS client, exchange messages.

### Task 4 — `signaling-adapter-bun` (Bun native WS)

**Files:** same shape PLUS `vitest.config.ts` skips the integration tests under Node (`it.skipIf(!globalThis.Bun)`).

**Deps to add:** `@types/bun` (dev). No runtime deps — uses `Bun.serve`.

**API:**

```ts
defineBunSignalingServer({
  port?: number,
  engine?: SignalingEngine,
  authenticate?: ...,
  maxPeersPerRoom?: ...,
  extractToken?: (request) => string | undefined,
}): { server: Bun.Server, session, close }
```

**Behavior:** uses Bun's native `Bun.serve({ websocket: { open, message, close } })` to drive the same session plumbing.

**Tests:** all skipped under Vitest (Node) because `Bun.serve` doesn't exist there. EPIC-9 wires `bun test packages/signaling-adapter-bun` as a separate CI job. Until then, the implementation is type-checked + lint-checked + smoke-tested manually if Bun is installed locally.

Add a unit test that exercises pure logic (e.g. the `peerId → socketId` map helper) so the package isn't entirely test-less.

### Task 5 — `signaling-server` (standalone CLI + library)

**Files:** `packages/signaling-server/{tsconfig.json, tsconfig.build.json, vitest.config.ts, package.json, src/index.ts, src/server.ts, src/cli.ts, test/unit/server.test.ts, README.md}`

**Deps to add:** `@forinda/video-sdk-signaling-adapter-ws` (workspace). Already configured for `bin: "forinda-signaling": "./dist/cli.js"` in EPIC-1.

**API (library):**

```ts
defineSignalingServer({
  port?: number,                    // default 3000
  authenticate?: ...,
  maxPeersPerRoom?: ...,
}): { server, close }
```

Just a thin wrapper around `defineWebSocketSignalingServer({ port })` with sane defaults + a banner log line.

**CLI (`src/cli.ts`):** parses `--port`, `--max-peers`, `--help` from `process.argv` (no deps — hand-roll), constructs the server, prints "Listening on ws://0.0.0.0:<port>", handles SIGINT/SIGTERM cleanly. Shebang already present in tsup banner from EPIC-1.

**Tests:** spin up library mode on a random port, connect a real WS client, smoke-test send/receive. CLI testing is a one-shot subprocess invocation: `node dist/cli.js --port=0 --help` exits 0; deeper CLI testing (port binding, signal handling) deferred.

### Task 6 — Whole-workspace verify + tag

**Files:** none modified.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
pnpm lint
git status                          # clean
```

Run coverage spot-check on each package (skip bun adapter). Then:

```bash
git tag -a v0.0.0-epic-4b -m "EPIC-4b complete: server adapters + standalone CLI

5 packages wiring SignalingEngine to 4 host frameworks (Node ws, Express,
Hono, Bun) plus a standalone reference server with CLI.

Coverage >=90% on src/ for every package except bun adapter (Bun-runtime
gated; EPIC-9 adds the CI job)."
```

---

## Self-review notes

**Spec coverage:**

| Spec section / requirement                                          | Plan task                             |
| ------------------------------------------------------------------- | ------------------------------------- |
| Section 7 — server adapters wrap `SignalingEngine`                  | Tasks 1-4                             |
| Section 7 — adapter set: ws, express, hono, bun                     | Tasks 1-4                             |
| Section 7 — Express ships dual ESM + CJS (per EPIC-1 spec addendum) | Task 2                                |
| Section 7 — Standalone reference server (library + CLI)             | Task 5                                |
| Section 7 — Pluggable `authenticate(token, room) → boolean`         | Tasks 1-5                             |
| Section 7 — `maxPeersPerRoom` default 50                            | Tasks 1-5 (forwarded to engine)       |
| Section 12 — Per-adapter integration tests against real servers     | Tasks 1-3, 5 (Bun deferred to EPIC-9) |

**Conventions applied:** `defineX` factories, inline JSDoc, `@/` alias, tsconfig split, thorough READMEs.

## Risks and notes

- **Port binding in tests:** use `port: 0` (OS-assigned random port) to avoid clashes when tests run in parallel.
- **`peerId → socketId` mapping:** the engine doesn't expose this directly. Adapters must sniff inbound `join` messages to learn the mapping. Cleanest pattern: parse once with `SignalingMessage.safeParse(raw)`; if it's a `join`, update the local `Map<peerId, ws>` BEFORE forwarding to `session.handleMessage`.
- **Express dual format:** `tsup.config.ts` from EPIC-1 already emits both `index.js` (ESM) + `index.cjs` (CJS). Don't change that.
- **Hono WebSocket support is runtime-specific.** Use `@hono/node-ws` for the test fixture; document that other deploys need their own helper.
- **Bun adapter tests:** `it.skipIf(typeof Bun === "undefined")(...)` so Vitest under Node skips cleanly. Add at least one pure-logic unit test so coverage isn't 0%.
- **Engine onSend lookup:** the engine's `session.onSend((peerId, msg) => ...)` callback fires by peer id. Adapter resolves peer id → socket via its own `Map<peerId, ws>`. If lookup fails (peer left mid-send), drop silently with a warn log — race condition, not a real error.
- **Token extraction:** default `extractToken` reads `?token=` from the request URL. Custom auth schemes (cookies, headers) override via the option.
- **Cleanup ordering:** `close()` must close the wss FIRST (drains client connections, fires `close` events that flow through `session.handleDisconnect`), then close the engine. Reverse order leaks dangling sessions.
