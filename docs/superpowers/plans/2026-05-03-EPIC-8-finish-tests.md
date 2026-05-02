# EPIC-8 Finish: Browser + Integration + Load Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four deferred testing subsystems from EPIC-8 — a private cross-package integration suite, a load-test harness against the dev signaling server, a Vitest browser project for media-touching code, and a Playwright e2e project that exercises a real two-tab Publisher↔Viewer flow against the dev server. Wire all four into CI.

**Architecture:**

- **Integration tests** live in a new private package `packages/integration-tests/` that depends on the workspace siblings via `workspace:*`. Tests use `defineDevServer` (already in `@forinda/test-helpers`) for real WebSocket transport + `defineFakePeerConnection` for predictable WebRTC. Each `*.test.ts` exercises one cross-package scenario (Room with publisher + channel + recorder; reconnection survival; chat history replay end-to-end).
- **Load harness** is a Node-side script under `tools/load-signaling.mjs` that connects N WebSocket clients per room and emits chat at a configurable rate. Reports throughput + p50/p95 latency. Wired as `pnpm load:signaling` at the root.
- **Vitest browser project** uses `@vitest/browser` with the Playwright provider, headless Chromium with `--use-fake-ui-for-media-stream` and `--use-fake-device-for-media-stream` so `getUserMedia` returns synthetic tracks. Adds a `vitest.browser.config.ts` per affected package (core, react, elements). New per-package `pnpm test:browser` script + a workspace-level `pnpm test:browser` aggregator.
- **Playwright e2e** lives in a new top-level `e2e/` directory with its own `package.json` (private) so the e2e deps don't bleed into adapter consumers. The Playwright config boots `dev-signaling-server` via `webServer`, points two browser contexts at the React example app, drives the Publish + View flow, asserts on the rendered video element + chat-history.
- **CI**: `.github/workflows/ci.yml` gains four new jobs running in parallel — `integration`, `load`, `browser`, `e2e`. The first two reuse the existing Node 22 setup; the latter two install Playwright browsers via `npx playwright install --with-deps`.

**Tech Stack:** TypeScript, Vitest, `@vitest/browser`, Playwright, `@forinda/test-helpers`, the existing dev-signaling-server.

---

## File structure

| File                                                                   | Responsibility                                                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/integration-tests/package.json`                              | Private workspace package; `wireit` test script; depends on every other workspace package via `workspace:*`.                  |
| `packages/integration-tests/tsconfig.json`                             | Extends `tsconfig.base.json`; `@/*` aliases not needed (tests are flat).                                                      |
| `packages/integration-tests/vitest.config.ts`                          | Node environment; `include: ["test/**/*.test.ts"]`; no coverage thresholds (this package has zero src).                       |
| `packages/integration-tests/test/room-end-to-end.test.ts`              | Spins a real `defineDevServer`; constructs a `Room` with publisher + channel + recorder; asserts the wire flows + final blob. |
| `packages/integration-tests/test/reconnect.test.ts`                    | RoomChannel survives a transport drop, re-issues join + presence resync.                                                      |
| `packages/integration-tests/test/chat-history-replay.test.ts`          | Late joiner with `replayHistory: true` receives engine-recorded chats.                                                        |
| `packages/integration-tests/README.md`                                 | One paragraph: what this package is, when to add a test here vs in a per-package suite.                                       |
| `tools/load-signaling.mjs`                                             | Node script: opens N WebSocket clients per room, fans chat, reports throughput + latency.                                     |
| `tools/load-signaling.README.md`                                       | How to run + interpret output.                                                                                                |
| `package.json` (root)                                                  | New scripts: `test:integration`, `test:browser`, `load:signaling`, `e2e`.                                                     |
| `packages/core/vitest.browser.config.ts`                               | Browser project for media-touching tests.                                                                                     |
| `packages/react/vitest.browser.config.ts`                              | Same.                                                                                                                         |
| `packages/web-components/vitest.browser.config.ts`                     | Same.                                                                                                                         |
| `packages/core/test/browser/user-media.browser.test.ts`                | Real `getUserMedia` via `--use-fake-device-for-media-stream`.                                                                 |
| `packages/core/test/browser/recorder.browser.test.ts`                  | Real `MediaRecorder`.                                                                                                         |
| `packages/react/test/browser/use-user-media.browser.test.tsx`          | Real React + jsdom-equivalent in browser.                                                                                     |
| `packages/web-components/test/browser/video-publisher.browser.test.ts` | Element + real `getUserMedia`.                                                                                                |
| `e2e/package.json`                                                     | Private; `playwright/test` + `@playwright/test`; depends on dev-signaling-server + react example.                             |
| `e2e/playwright.config.ts`                                             | Boots `dev-signaling-server` + react example via `webServer`. Two browser contexts. Headless Chromium + fake media.           |
| `e2e/tests/publisher-viewer.spec.ts`                                   | Tab A publishes; Tab B subscribes; assert video element renders + dimensions are non-zero.                                    |
| `e2e/tests/chat.spec.ts`                                               | Tab A sends chat → Tab B receives.                                                                                            |
| `.github/workflows/ci.yml`                                             | Four new jobs: `integration`, `load`, `browser`, `e2e`.                                                                       |
| `README.md` (root)                                                     | Add a "Testing" section linking to each test surface + how to run locally.                                                    |
| `.changeset/finish-tests.md`                                           | Patch on every package — pure infra, no user-facing changes.                                                                  |

---

## Task 1: Scaffold `packages/integration-tests/`

**Files:**

- Create: `packages/integration-tests/package.json`
- Create: `packages/integration-tests/tsconfig.json`
- Create: `packages/integration-tests/vitest.config.ts`
- Create: `packages/integration-tests/README.md`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@forinda/integration-tests",
  "version": "0.0.0",
  "private": true,
  "description": "Cross-package integration tests for the Forinda RTC SDK. Not published.",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "test": "wireit",
    "typecheck": "wireit",
    "lint": "wireit"
  },
  "devDependencies": {
    "@forinda/test-helpers": "workspace:*",
    "@forinda/video-sdk-core": "workspace:*",
    "@forinda/video-sdk-signaling-broadcast": "workspace:*",
    "@forinda/video-sdk-signaling-protocol": "workspace:*",
    "@forinda/video-sdk-signaling-server": "workspace:*",
    "@forinda/video-sdk-signaling-ws": "workspace:*",
    "oxlint": "^0.11.0",
    "typescript": "^6.0.0",
    "vitest": "^2.1.0",
    "wireit": "^0.14.9"
  },
  "wireit": {
    "test": {
      "command": "vitest run",
      "files": ["test/**/*.ts", "vitest.config.ts", "tsconfig.json", "../../tsconfig.base.json"],
      "output": [],
      "dependencies": [
        "../core:build",
        "../signaling-protocol:build",
        "../signaling-ws:build",
        "../signaling-broadcast:build",
        "../signaling-server:build",
        "../test-helpers:build"
      ]
    },
    "typecheck": {
      "command": "tsc --noEmit",
      "files": ["test/**/*.ts", "tsconfig.json", "../../tsconfig.base.json"],
      "output": [],
      "dependencies": ["../core:build", "../test-helpers:build"]
    },
    "lint": {
      "command": "oxlint test",
      "files": ["test/**/*.ts", "../../oxlint.json"],
      "output": []
    }
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["test/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Cross-package suites do real network + WebRTC; bump the per-test
    // timeout above the default 5s so flaky CI doesn't false-positive.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
```

- [ ] **Step 4: Create `README.md`**

````markdown
# @forinda/integration-tests

Cross-package integration tests for the Forinda RTC SDK. Private — not published.

## When to add a test here

- The scenario crosses package boundaries (e.g. `core` Publisher + `signaling-server` engine + `signaling-ws` transport in one flow).
- The test needs a real WebSocket round-trip, not the in-memory `defineEngineFixture`.
- The bug only reproduces in the wired-together stack.

If a test exercises one package's surface only, write it in that package's `test/` directory instead.

## Run

```bash
pnpm --filter @forinda/integration-tests test
# or from the root:
pnpm test:integration
```
````

````

- [ ] **Step 5: Install + verify the empty package**

```bash
pnpm install
pnpm --filter @forinda/integration-tests typecheck
````

Expected: install adds the new package to the workspace; typecheck passes (no test files yet but tsconfig parses).

- [ ] **Step 6: Add `pnpm test:integration` root script**

In root `package.json`, add to the `scripts` block (alphabetically next to `test`):

```json
"test:integration": "pnpm --filter @forinda/integration-tests test",
```

- [ ] **Step 7: Commit**

```bash
git add packages/integration-tests/ package.json pnpm-lock.yaml
git commit -m "feat(integration-tests): scaffold cross-package suite (EPIC-8 #1/11)"
```

---

## Task 2: First integration test — Room end-to-end

**Files:**

- Create: `packages/integration-tests/test/room-end-to-end.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineRoom, getUserMedia as _getUserMedia } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";
import {
  defineDevServer,
  defineFakePeerConnection,
  installFakeMediaRecorder,
  type DevServerHandle,
  type InstalledFakeRecorder,
} from "@forinda/test-helpers";

const pcFactory = () => defineFakePeerConnection();
const fakeStream = (): MediaStream =>
  ({
    id: "fake",
    getTracks: () => [],
    getVideoTracks: () => [],
    getAudioTracks: () => [],
  }) as unknown as MediaStream;

describe("Room end-to-end against dev-signaling-server", () => {
  let server: DevServerHandle;
  let recorderFx: InstalledFakeRecorder;

  beforeEach(async () => {
    server = await defineDevServer();
    recorderFx = installFakeMediaRecorder();
  });
  afterEach(async () => {
    recorderFx.cleanup();
    await server.close();
  });

  it("publisher + channel + recorder share one transport, one join", async () => {
    const aliceTransport = defineWebSocketSignaling({ url: server.url });
    const aliceRoom = defineRoom({
      signaling: aliceTransport,
      room: "demo",
      peerId: "alice",
    });

    const publisher = aliceRoom.publisher({ stream: fakeStream(), pcFactory });
    const channel = aliceRoom.channel();
    const recorder = aliceRoom.recorder(fakeStream());

    await publisher.start();
    await channel.start();

    // Bob joins as a viewer + channel observer.
    const bobTransport = defineWebSocketSignaling({ url: server.url });
    const bobRoom = defineRoom({ signaling: bobTransport, room: "demo", peerId: "bob" });
    const bobChannel = bobRoom.channel();
    await bobChannel.start();

    // Allow signaling fan-out.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Alice's channel should see bob's presence after the join.
    expect([...channel.peers.keys()]).toContain("bob");

    // Recorder is live — fire a chunk and stop.
    recorder.start();
    recorderFx.current?.__fire("dataavailable", { data: new Blob(["x"]) });
    const blob = await new Promise<Blob>((resolve) => {
      recorder.on("stop", ({ blob }) => resolve(blob));
      void recorder.stop();
      recorderFx.current?.__fire("stop");
    });
    expect(blob.size).toBeGreaterThan(0);

    await aliceRoom.close();
    await bobRoom.close();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @forinda/integration-tests test
```

Expected: the test passes. If `defineDevServer` fails to bind, double-check it allocates an ephemeral port (it does by default per `defineDevServer.ts`).

- [ ] **Step 3: Commit**

```bash
git add packages/integration-tests/test/room-end-to-end.test.ts
git commit -m "test(integration): Room end-to-end against dev-signaling-server (EPIC-8 #2/11)"
```

---

## Task 3: Integration — RoomChannel reconnect survives a server restart

**Files:**

- Create: `packages/integration-tests/test/reconnect.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineRoomChannel, type RoomChannelState } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";
import { defineDevServer, type DevServerHandle } from "@forinda/test-helpers";

describe("RoomChannel reconnect end-to-end", () => {
  let server: DevServerHandle;
  beforeEach(async () => {
    server = await defineDevServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("re-issues join + presence after the server bounces", async () => {
    const transport = defineWebSocketSignaling({
      url: server.url,
      retry: { initialBackoffMs: 50, maxAttempts: 5 },
    });
    const channel = defineRoomChannel({
      signaling: transport,
      room: "demo",
      peerId: "alice",
      retry: { initialBackoffMs: 50, maxAttempts: 5 },
    });

    const seen: RoomChannelState[] = [];
    channel.on("state", (s) => seen.push(s));

    await channel.start();
    await channel.setAttribute("hand-raised", true);

    const port = server.port;
    await server.close();

    // Restart on the same port so the transport's reconnect target is valid.
    server = await defineDevServer({ port });

    // Wait for the reconnect loop to converge.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(seen).toContain("reconnecting");
    expect(channel.state).toBe("connected");
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @forinda/integration-tests test -- reconnect
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/integration-tests/test/reconnect.test.ts
git commit -m "test(integration): RoomChannel reconnect across server bounce (EPIC-8 #3/11)"
```

---

## Task 4: Integration — chat history replay across the wire

**Files:**

- Create: `packages/integration-tests/test/chat-history-replay.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineRoomChannel } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";
import { defineDevServer, type DevServerHandle } from "@forinda/test-helpers";

describe("Chat history replay end-to-end", () => {
  let server: DevServerHandle;
  beforeEach(async () => {
    server = await defineDevServer({ chatHistoryPerRoom: 5 });
  });
  afterEach(async () => {
    await server.close();
  });

  it("late joiner with replayHistory: true sees prior chats", async () => {
    const aliceT = defineWebSocketSignaling({ url: server.url });
    const alice = defineRoomChannel({ signaling: aliceT, room: "demo", peerId: "alice" });
    await alice.start();
    await alice.sendChat("first");
    await alice.sendChat("second");

    const bobT = defineWebSocketSignaling({ url: server.url });
    const bob = defineRoomChannel({
      signaling: bobT,
      room: "demo",
      peerId: "bob",
      replayHistory: true,
    });
    await bob.start();

    // Allow the engine to fan out chat-history.
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(bob.chatHistory.map((m) => m.body)).toEqual(["first", "second"]);

    await alice.stop();
    await bob.stop();
  });
});
```

- [ ] **Step 2: Verify `defineDevServer` accepts `chatHistoryPerRoom`**

`defineDevServer` already passes options to `defineSignalingServer`, which passes them to the engine. Confirm by searching:

```bash
grep -n "chatHistoryPerRoom\|DevServerOptions" packages/test-helpers/src/dev-server.ts
```

If `chatHistoryPerRoom` isn't in `DevServerOptions`, add it as a passthrough field. Open `packages/test-helpers/src/dev-server.ts` and update the `DevServerOptions` interface to include `chatHistoryPerRoom?: number;`, and pass it through to `defineSignalingServer({ ..., chatHistoryPerRoom })`.

If the underlying `defineSignalingServer` doesn't yet accept the engine option either, thread it through `packages/signaling-server/src/server.ts` similarly (the engine option already exists from EPIC-22).

- [ ] **Step 3: Run the test**

```bash
pnpm --filter @forinda/integration-tests test -- chat-history-replay
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add packages/integration-tests/test/chat-history-replay.test.ts packages/test-helpers/src/dev-server.ts packages/signaling-server/src/
git commit -m "test(integration): chat-history replay end-to-end (EPIC-8 #4/11)"
```

---

## Task 5: Load harness — `tools/load-signaling.mjs`

**Files:**

- Create: `tools/load-signaling.mjs`
- Create: `tools/load-signaling.README.md`
- Modify: root `package.json`

- [ ] **Step 1: Write the script**

Create `tools/load-signaling.mjs`:

```js
#!/usr/bin/env node
/**
 * Load harness for the Forinda signaling server.
 *
 * Spins up N WebSocket clients per room across R rooms, fans chat at the
 * configured rate, and reports throughput + p50/p95 latency at the end.
 *
 * Usage:
 *   node tools/load-signaling.mjs --url ws://localhost:8787 --rooms 100 --peers 10 --chatPerSec 1 --duration 30
 */

import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import WebSocket from "ws";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "ws://127.0.0.1:8787" },
    rooms: { type: "string", default: "10" },
    peers: { type: "string", default: "5" },
    chatPerSec: { type: "string", default: "1" },
    duration: { type: "string", default: "10" },
  },
});

const url = values.url;
const numRooms = Number.parseInt(values.rooms, 10);
const peersPerRoom = Number.parseInt(values.peers, 10);
const chatPerSec = Number.parseFloat(values.chatPerSec);
const durationSec = Number.parseInt(values.duration, 10);

const peers = [];
const latenciesMs = [];
let chatsSent = 0;
let chatsReceived = 0;

console.log(
  `[load] connecting ${numRooms * peersPerRoom} peers (${numRooms} rooms × ${peersPerRoom}/room) → ${url}`,
);

await Promise.all(
  Array.from({ length: numRooms }, async (_, roomIdx) => {
    const roomId = `load-${roomIdx}`;
    return Promise.all(
      Array.from({ length: peersPerRoom }, async (_, peerIdx) => {
        const peerId = `${roomId}-p${peerIdx}`;
        const ws = new WebSocket(url);
        await new Promise((resolve, reject) => {
          ws.once("open", resolve);
          ws.once("error", reject);
        });
        ws.send(JSON.stringify({ type: "join", room: roomId, peer: peerId, role: "presence" }));
        ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "chat" && msg.clientId) {
            const sentAt = Number.parseInt(msg.clientId.split(":")[1] ?? "0", 10);
            if (sentAt > 0) {
              latenciesMs.push(performance.now() - sentAt);
              chatsReceived += 1;
            }
          }
        });
        peers.push({ ws, peerId, roomId });
      }),
    );
  }),
);

console.log(`[load] all peers joined. running for ${durationSec}s at ${chatPerSec} chat/s/peer`);

const start = performance.now();
const interval = setInterval(() => {
  for (const { ws, peerId, roomId } of peers) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    ws.send(
      JSON.stringify({
        type: "chat",
        from: peerId,
        body: `hello ${chatsSent}`,
        ts: Date.now(),
        clientId: `${peerId}:${performance.now()}:${chatsSent}`,
      }),
    );
    chatsSent += 1;
    void roomId;
  }
}, 1000 / chatPerSec);

await new Promise((resolve) => setTimeout(resolve, durationSec * 1000));
clearInterval(interval);

// Allow trailing fan-out to drain.
await new Promise((resolve) => setTimeout(resolve, 1000));

for (const { ws } of peers) ws.close();

latenciesMs.sort((a, b) => a - b);
const p = (frac) => latenciesMs[Math.floor(latenciesMs.length * frac)] ?? 0;

const elapsedSec = (performance.now() - start) / 1000;
console.log(`[load] sent=${chatsSent} received=${chatsReceived} elapsed=${elapsedSec.toFixed(1)}s`);
console.log(
  `[load] throughput: sent=${(chatsSent / elapsedSec).toFixed(0)}/s received=${(chatsReceived / elapsedSec).toFixed(0)}/s`,
);
console.log(
  `[load] latency ms: p50=${p(0.5).toFixed(1)} p95=${p(0.95).toFixed(1)} p99=${p(0.99).toFixed(1)} max=${p(1).toFixed(1)}`,
);
```

- [ ] **Step 2: Make sure `ws` is available**

The script imports `ws`. The dev signaling server already pulls it in transitively via `@forinda/video-sdk-signaling-server`, but the root workspace doesn't depend on it directly. Add it as a root devDependency:

```bash
pnpm add -D -w ws
```

- [ ] **Step 3: Add the script + companion README**

Root `package.json` — add to `scripts`:

```json
"load:signaling": "node tools/load-signaling.mjs",
```

Create `tools/load-signaling.README.md`:

````markdown
# load:signaling

Generates synthetic chat traffic against a running signaling server and reports throughput + latency percentiles.

## Run

```bash
# Terminal 1
pnpm dev:server

# Terminal 2
pnpm load:signaling --url ws://127.0.0.1:8787 --rooms 100 --peers 10 --chatPerSec 1 --duration 30
```
````

## Output

```
[load] sent=30000 received=29985 elapsed=30.1s
[load] throughput: sent=997/s received=995/s
[load] latency ms: p50=2.1 p95=8.3 p99=15.7 max=42.0
```

## Knobs

| Flag           | Default               | Meaning                     |
| -------------- | --------------------- | --------------------------- |
| `--url`        | `ws://127.0.0.1:8787` | Signaling server URL        |
| `--rooms`      | `10`                  | Number of distinct rooms    |
| `--peers`      | `5`                   | Peers per room              |
| `--chatPerSec` | `1`                   | Chats per peer per second   |
| `--duration`   | `10`                  | How long to run, in seconds |

Total simulated peers = `rooms × peers`. Total send rate = `rooms × peers × chatPerSec`.

````

- [ ] **Step 4: Smoke-test the harness**

```bash
# Terminal 1: start the dev server
pnpm dev:server &
SERVER_PID=$!
sleep 1

# Terminal 2 (or same shell): run a small load
pnpm load:signaling --rooms 2 --peers 2 --chatPerSec 1 --duration 3

# Stop the server
kill $SERVER_PID
````

Expected: sees `sent=12 received≈12` with single-digit latency.

- [ ] **Step 5: Commit**

```bash
git add tools/load-signaling.mjs tools/load-signaling.README.md package.json pnpm-lock.yaml
git commit -m "feat(tools): load:signaling harness (EPIC-8 #5/11)"
```

---

## Task 6: Vitest browser project — core

**Files:**

- Modify: `packages/core/package.json`
- Create: `packages/core/vitest.browser.config.ts`
- Create: `packages/core/test/browser/user-media.browser.test.ts`
- Create: `packages/core/test/browser/recorder.browser.test.ts`

- [ ] **Step 1: Add the browser dependencies**

```bash
pnpm --filter @forinda/video-sdk-core add -D @vitest/browser playwright
```

- [ ] **Step 2: Create `vitest.browser.config.ts`**

Create `packages/core/vitest.browser.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["test/browser/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [
        {
          browser: "chromium",
          launch: {
            // Synthetic camera/mic so getUserMedia resolves with deterministic
            // frames + tones in CI. Without these, headless Chromium asks for
            // permission and the test hangs.
            args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
          },
        },
      ],
    },
  },
});
```

- [ ] **Step 3: Add a `test:browser` wireit script**

In `packages/core/package.json`, add a new script and wireit task. Append to `scripts`:

```json
"test:browser": "vitest run --config vitest.browser.config.ts",
```

(The browser project is an additive sibling — the existing `test` keeps running jsdom-based unit tests.)

- [ ] **Step 4: Write the user-media browser test**

Create `packages/core/test/browser/user-media.browser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getUserMedia } from "@/media/user-media.ts";

describe("getUserMedia in real Chromium (EPIC-8)", () => {
  it("resolves with a stream containing a real video track", async () => {
    const stream = await getUserMedia({ video: true, audio: false });
    const tracks = stream.getVideoTracks();
    expect(tracks.length).toBe(1);
    expect(tracks[0]?.kind).toBe("video");
    for (const t of stream.getTracks()) t.stop();
  });
});
```

- [ ] **Step 5: Write the recorder browser test**

Create `packages/core/test/browser/recorder.browser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defineRecorder } from "@/recording/recorder.ts";
import { getUserMedia } from "@/media/user-media.ts";

describe("Recorder against real MediaRecorder (EPIC-8)", () => {
  it("records ≥100ms of synthetic media to a non-empty Blob", async () => {
    const stream = await getUserMedia({ video: true, audio: false });
    const recorder = defineRecorder(stream, { timesliceMs: 100 });
    const blobPromise = new Promise<Blob>((resolve) => {
      recorder.on("stop", ({ blob }) => resolve(blob));
    });
    recorder.start();
    await new Promise((r) => setTimeout(r, 200));
    await recorder.stop();
    const blob = await blobPromise;
    expect(blob.size).toBeGreaterThan(0);
    for (const t of stream.getTracks()) t.stop();
  });
});
```

- [ ] **Step 6: Install Playwright browsers (one-time)**

```bash
npx playwright install chromium --with-deps
```

(`--with-deps` may require sudo; on CI we run a separate `playwright install` step.)

- [ ] **Step 7: Run the browser tests**

```bash
pnpm --filter @forinda/video-sdk-core test:browser
```

Expected: both pass under headless Chromium.

- [ ] **Step 8: Commit**

```bash
git add packages/core/vitest.browser.config.ts packages/core/test/browser/ packages/core/package.json pnpm-lock.yaml
git commit -m "test(core): vitest browser project for media + recorder (EPIC-8 #6/11)"
```

---

## Task 7: Vitest browser project — react + elements

**Files:**

- Modify: `packages/react/package.json`
- Create: `packages/react/vitest.browser.config.ts`
- Create: `packages/react/test/browser/use-user-media.browser.test.tsx`
- Modify: `packages/web-components/package.json`
- Create: `packages/web-components/vitest.browser.config.ts`
- Create: `packages/web-components/test/browser/video-publisher.browser.test.ts`

- [ ] **Step 1: React — add browser deps + config**

```bash
pnpm --filter @forinda/video-sdk-react add -D @vitest/browser playwright
```

Create `packages/react/vitest.browser.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["test/browser/**/*.browser.test.tsx"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [
        {
          browser: "chromium",
          launch: {
            args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
          },
        },
      ],
    },
  },
});
```

Add to `packages/react/package.json` scripts:

```json
"test:browser": "vitest run --config vitest.browser.config.ts",
```

- [ ] **Step 2: Write the React hook browser test**

Create `packages/react/test/browser/use-user-media.browser.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useUserMedia } from "@/use-user-media.ts";

describe("useUserMedia in real Chromium (EPIC-8)", () => {
  it("transitions to granted with a real video track", async () => {
    const { result } = renderHook(() => useUserMedia({ video: true }));
    await waitFor(() => expect(result.current.state).toBe("granted"));
    expect(result.current.stream?.getVideoTracks().length).toBe(1);
    result.current.stop();
  });
});
```

- [ ] **Step 3: Elements — add browser deps + config**

```bash
pnpm --filter @forinda/video-sdk-elements add -D @vitest/browser playwright
```

Create `packages/web-components/vitest.browser.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["test/browser/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [
        {
          browser: "chromium",
          launch: {
            args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
          },
        },
      ],
    },
  },
});
```

Add to `packages/web-components/package.json` scripts:

```json
"test:browser": "vitest run --config vitest.browser.config.ts",
```

- [ ] **Step 4: Write the elements browser test**

Create `packages/web-components/test/browser/video-publisher.browser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ForindaVideoPublisher } from "@/elements/video-publisher.ts";
import { registerAll } from "@/elements/register.ts";

describe("<forinda-video-publisher> in real Chromium (EPIC-8)", () => {
  it("acquires a real getUserMedia stream when source=camera", async () => {
    registerAll();
    const el = document.createElement("forinda-video-publisher") as ForindaVideoPublisher;
    el.setAttribute("source", "camera");
    el.setAttribute("audio", "");
    el.setAttribute("video", "");
    el.setAttribute("manual-play", "");
    el.setAttribute("room", "demo");
    el.setAttribute("signaling-url", "ws://127.0.0.1:9");
    document.body.appendChild(el);

    // Wait for the element to acquire media. We hook into the `ready` event
    // which fires after getUserMedia resolves and the publisher is constructed.
    const stream = await new Promise<MediaStream>((resolve) => {
      el.addEventListener("ready", (e) =>
        resolve((e as CustomEvent<{ stream: MediaStream }>).detail.stream),
      );
    });
    expect(stream.getTracks().length).toBeGreaterThan(0);
    el.remove();
  });
});
```

- [ ] **Step 5: Run both browser suites**

```bash
pnpm --filter @forinda/video-sdk-react test:browser
pnpm --filter @forinda/video-sdk-elements test:browser
```

Expected: both pass.

- [ ] **Step 6: Add the workspace `test:browser` aggregator**

In root `package.json` `scripts`:

```json
"test:browser": "pnpm -r --parallel --filter @forinda/video-sdk-core --filter @forinda/video-sdk-react --filter @forinda/video-sdk-elements test:browser",
```

- [ ] **Step 7: Commit**

```bash
git add packages/react/ packages/web-components/ package.json pnpm-lock.yaml
git commit -m "test(react,elements): vitest browser projects (EPIC-8 #7/11)"
```

---

## Task 8: Playwright e2e — scaffold + dev-server boot

**Files:**

- Create: `e2e/package.json`
- Create: `e2e/playwright.config.ts`
- Create: `e2e/tsconfig.json`
- Modify: root `pnpm-workspace.yaml`

- [ ] **Step 1: Add `e2e/` to the workspace**

In `pnpm-workspace.yaml`, append `"e2e"` (it's outside any glob today):

```yaml
packages:
  - "packages/*"
  - "apps/*"
  - "examples/*"
  - "e2e"
```

- [ ] **Step 2: Create `e2e/package.json`**

```json
{
  "name": "@forinda/e2e",
  "version": "0.0.0",
  "private": true,
  "description": "Playwright end-to-end tests for the Forinda RTC SDK. Not published.",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "typescript": "^6.0.0"
  }
}
```

- [ ] **Step 3: Create `e2e/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["tests/**/*.ts", "playwright.config.ts"]
}
```

- [ ] **Step 4: Create `e2e/playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

const SIGNALING_PORT = 8787;
const VITE_PORT = 5174;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${VITE_PORT}`,
    headless: true,
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  webServer: [
    {
      command: "pnpm --filter dev-signaling-server start",
      port: SIGNALING_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "pnpm --filter example-react-publisher-viewer dev",
      port: VITE_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
```

- [ ] **Step 5: Install Playwright + workspace deps**

```bash
pnpm install
pnpm --filter @forinda/e2e exec playwright install chromium --with-deps
```

- [ ] **Step 6: Verify the empty config compiles**

```bash
pnpm --filter @forinda/e2e exec playwright test --list
```

Expected: lists zero tests (we haven't written any yet) without erroring.

- [ ] **Step 7: Add a root `pnpm e2e` script**

Root `package.json` `scripts`:

```json
"e2e": "pnpm --filter @forinda/e2e test",
```

- [ ] **Step 8: Commit**

```bash
git add e2e/ pnpm-workspace.yaml package.json pnpm-lock.yaml
git commit -m "feat(e2e): scaffold Playwright project + dev-server webServer (EPIC-8 #8/11)"
```

---

## Task 9: Playwright e2e — Publisher↔Viewer two-tab spec

**Files:**

- Create: `e2e/tests/publisher-viewer.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from "@playwright/test";

test("two browser contexts: alice publishes, bob subscribes, video plays", async ({ browser }) => {
  // Two isolated contexts so Playwright's fake media is independent per tab.
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto("/");
  await bob.goto("/");

  // Alice clicks Publish; the example's UI should expose a peerId after
  // useUserMedia resolves.
  await alice.getByRole("button", { name: /publish/i }).click();
  const peerIdLocator = alice.locator("code");
  await expect(peerIdLocator).toBeVisible({ timeout: 10_000 });
  const peerId = (await peerIdLocator.first().innerText()).trim();
  expect(peerId.length).toBeGreaterThan(0);

  // Bob types the publisher peerId and clicks View.
  await bob.getByPlaceholder(/peerId/i).fill(peerId);
  await bob.getByRole("button", { name: /view/i }).click();

  // Bob's <video> should receive media and have non-zero dimensions.
  const bobVideo = bob.locator("video").first();
  await expect(bobVideo).toBeVisible();
  await expect
    .poll(
      async () =>
        bob.evaluate(() => {
          const v = document.querySelector("video") as HTMLVideoElement | null;
          return v?.videoWidth ?? 0;
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  await aliceCtx.close();
  await bobCtx.close();
});
```

- [ ] **Step 2: Run the spec**

```bash
pnpm e2e
```

Expected: pass. If the React example doesn't render `<code>{publisher?.peerId ?? "—"}</code>` (it should — see `App.tsx`), update the locator to match the actual rendered shape. Watch the headed run with `pnpm --filter @forinda/e2e test:ui` to debug.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/publisher-viewer.spec.ts
git commit -m "test(e2e): two-tab Publisher↔Viewer spec (EPIC-8 #9/11)"
```

---

## Task 10: Playwright e2e — chat round-trip spec (deferred)

**Files:**

- Create: `e2e/tests/chat.spec.ts`

> The current React example doesn't expose chat UI. Either (a) add a minimal chat input to the example, or (b) skip this task and ship publisher-viewer coverage only. The plan keeps the scope tight by **deferring** chat e2e to a follow-up, since adding chat UI is mostly example-app polish, not test infrastructure.

- [ ] **Step 1: Create a placeholder skip + commit**

Create `e2e/tests/chat.spec.ts`:

```ts
import { test } from "@playwright/test";

// Chat e2e is deferred: the React example doesn't yet expose a chat input.
// Tracked in the EPIC-8 follow-up. Once the example gets a minimal
// `<input> + <button>Send</button>` wired through useChat, replace this
// skip with a real two-tab send/receive assertion.
test.skip("alice sends chat → bob receives it", async () => {});
```

- [ ] **Step 2: Verify the skip is collected**

```bash
pnpm e2e -- --list
```

Expected: lists `chat.spec.ts > alice sends chat → bob receives it` as `(skipped)`.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/chat.spec.ts
git commit -m "test(e2e): placeholder skip for chat round-trip (EPIC-8 #10/11)"
```

---

## Task 11: CI wiring + READMEs + changeset + tag

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Create: `.changeset/finish-tests.md`

- [ ] **Step 1: Add four new CI jobs**

Append to `.github/workflows/ci.yml` after the existing `build` job:

```yaml
integration:
  name: Integration tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: "${{ env.PNPM_VERSION }}" }
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - run: pnpm build
    - run: pnpm test:integration

load:
  name: Load smoke
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: "${{ env.PNPM_VERSION }}" }
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - run: pnpm build
    - name: Start dev signaling server
      run: pnpm dev:server &
    - run: sleep 2
    - run: pnpm load:signaling --rooms 5 --peers 4 --chatPerSec 2 --duration 5

browser:
  name: Vitest browser (Chromium)
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: "${{ env.PNPM_VERSION }}" }
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - run: pnpm build
    - run: pnpm exec playwright install chromium --with-deps
    - run: pnpm test:browser

e2e:
  name: Playwright e2e
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: "${{ env.PNPM_VERSION }}" }
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - run: pnpm build
    - run: pnpm --filter dev-signaling-server build
    - run: pnpm --filter @forinda/e2e exec playwright install chromium --with-deps
    - run: pnpm e2e
    - if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: e2e/playwright-report/
```

- [ ] **Step 2: Update root README**

Find the existing test-running section (search for `pnpm test`) and add a "Testing tiers" subsection right under the existing one:

```markdown
## Testing tiers

| Tier        | Command                                                                   | What it runs                                                                                                           |
| ----------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Unit        | `pnpm test`                                                               | Per-package vitest in jsdom (or node for server packages). The default for day-to-day dev.                             |
| Integration | `pnpm test:integration`                                                   | Cross-package suite in `packages/integration-tests/`. Real WebSocket round-trips, real engine.                         |
| Browser     | `pnpm test:browser`                                                       | Vitest in headless Chromium (Playwright provider) with synthetic getUserMedia. Covers core/react/elements media paths. |
| E2E         | `pnpm e2e`                                                                | Playwright two-tab Publisher↔Viewer flow against the dev signaling server + React example app.                         |
| Load        | `pnpm load:signaling --rooms 100 --peers 10 --chatPerSec 1 --duration 30` | Generates synthetic chat traffic; reports throughput + p50/p95 latency.                                                |

CI runs all five on every PR.
```

- [ ] **Step 3: Create the changeset**

`.changeset/finish-tests.md`:

```markdown
---
"@forinda/video-sdk-core": patch
"@forinda/video-sdk-signaling-protocol": patch
"@forinda/video-sdk-signaling-ws": patch
"@forinda/video-sdk-signaling-broadcast": patch
"@forinda/video-sdk-react": patch
"@forinda/video-sdk-vue": patch
"@forinda/video-sdk-elements": patch
---

Test infrastructure (EPIC-8 finish): integration suite, load harness, vitest-browser projects, Playwright e2e. Pure infra — no user-facing code change. Bumping every published package by `patch` so npm sees a coordinated drop.
```

- [ ] **Step 4: Workspace verify**

```bash
pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && pnpm lint
```

(Skipping `test:browser` and `e2e` here because Playwright's headless Chromium isn't installed by default on every dev box. CI runs them.)

Expected: every step exits 0.

- [ ] **Step 5: Commit + tag**

```bash
git add .github/workflows/ci.yml README.md .changeset/finish-tests.md
git commit -m "ci+docs: wire integration/load/browser/e2e jobs (EPIC-8 #11/11)"
git tag -a v0.0.0-epic-8b -m "EPIC-8 finish: browser + integration + load + e2e tests"
```

---

## Self-review notes

**Spec coverage** (vs. roadmap acceptance criteria for EPIC-8 finish):

- ✅ `vitest --project browser` runs against Playwright Chromium for media-touching tests in core / react / elements — Tasks 6, 7. (Used per-package `vitest.browser.config.ts` instead of a single project — same effect, cleaner per-package failure isolation.)
- ✅ Root `e2e/` Playwright project boots `dev-signaling-server` + spins up two pages — Tasks 8, 9.
- ✅ New `packages/integration-tests/` exercising Publisher + Viewer + RoomChannel + Recorder — Tasks 1-4.
- ✅ `pnpm load:signaling` 100×10 chat harness with p95 — Task 5.
- ✅ All run in CI — Task 11.
- ⚠️ Chat e2e deferred — placeholder skip (Task 10) with a note. Tracked for follow-up.

**Type consistency:**

- Test fixtures use the same `defineDevServer`/`defineFakePeerConnection`/`installFakeMediaRecorder` helpers as existing per-package tests. No new helper APIs.
- `vitest.browser.config.ts` shape is identical across the three packages (only the `include` glob differs).

**Placeholders:** Task 10's `test.skip` is the only intentional placeholder, justified by its scope (example-app feature work, not test infra) and explicitly called out.

**Gotcha worth flagging:** the load harness uses `parseArgs` from Node 20+. The script declares `#!/usr/bin/env node` for direct execution but expects Node 20+. CI uses Node 22 (see `env.NODE_VERSION` in `ci.yml`), so this is fine.
