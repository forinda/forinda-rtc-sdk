# EPIC-14 LiveKit SFU Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a side-by-side `@forinda/video-sdk-sfu-livekit` adapter package that wraps `livekit-client` to expose the same Publisher/Viewer-shaped API as our existing mesh code, plus React + Vue hook parity, plus an example app and integration docs. Mesh stays the default; SFU is opt-in for >~8-viewer rooms.

**Architecture:**

- **Two-transport model**: SFU handles **media** (publish + subscribe via LiveKit's signaling). Our existing WebSocket signaling continues to handle **chat / presence / recording metadata** via `defineRoomChannel`. Adopters wire both — documented as a first-class pattern.
- **Mirrored API surface**: `defineSfuPublisher({ url, token, room, stream })` returns a handle with the same lifecycle vocabulary (`state` / `start` / `stop` / `replaceVideoTrack`), the same event shapes (`viewer-joined`, `viewer-left`, `state`, `error`, `stats`), so consumers swapping mesh→SFU change one factory call.
- **Token at the boundary**: we accept a JWT from the consumer; we do NOT mint it (token minting is server-side and depends on auth). Document a Node example for minting.
- **`Recorder` reuse**: `defineRecorder(stream)` works unchanged because LiveKit gives consumers the underlying `MediaStream` for their local participant.
- **Bundle isolation**: `livekit-client` is a peer dependency (~150 KB minified) so consumers who don't need SFU don't pay the cost.
- **Tests**: hand-rolled `livekit-client` fixture (a small fake `Room` + `LocalParticipant` + `Track`) lives in the package's `test/_helpers/`. No real LiveKit server in unit tests; we cover the wire-up not LiveKit itself. End-to-end against real LiveKit is deferred to a manual smoke checklist in the README.

**Tech Stack:** TypeScript, Vitest (jsdom), `livekit-client@^2.18`, React 18, Vue 3.4+.

---

## Out of scope (deferred)

- LiveKit's server-side recording (egress) — adopters use LiveKit's own egress API directly.
- Simulcast / SVC tuning — passthrough to `livekit-client` defaults; document escape-hatch via the raw `Room`.
- LiveKit-flavored chat (data channel) — our existing chat layer (over our own WebSocket) is the recommendation.
- Server-side bridge between our signaling and LiveKit's — explicitly NOT building. Consumers run two transports.
- Mesh `defineRoom` integration with SFU — different lifecycle model; intentionally separate.

---

## File structure

| File                                                                             | Responsibility                                                                                                                         |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/sfu-livekit/package.json`                                              | New package; peer deps `livekit-client@^2.18`. Wireit build/typecheck/test/lint.                                                       |
| `packages/sfu-livekit/tsconfig.json`, `tsconfig.build.json`                      | Standard split — IDE-wide includes test/ + types; build excludes them.                                                                 |
| `packages/sfu-livekit/tsup.config.ts`                                            | ESM-only, minified, `livekit-client` external.                                                                                         |
| `packages/sfu-livekit/vitest.config.ts`                                          | jsdom env.                                                                                                                             |
| `packages/sfu-livekit/src/types.ts`                                              | `SfuPublisher`, `SfuPublisherOptions`, `SfuViewer`, `SfuViewerOptions`, `SfuConnectionState`, `SfuPublisherEvents`, `SfuViewerEvents`. |
| `packages/sfu-livekit/src/errors.ts`                                             | `SfuError extends SdkError` with codes `sfu_connect_failed`, `sfu_publish_failed`, `sfu_token_invalid`, `sfu_disconnected`.            |
| `packages/sfu-livekit/src/publisher.ts`                                          | `defineSfuPublisher(opts)`. Connects to LiveKit Room, publishes the stream's tracks, exposes typed events.                             |
| `packages/sfu-livekit/src/viewer.ts`                                             | `defineSfuViewer({ ..., publisherId })`. Connects, subscribes only to the named participant, emits `track`.                            |
| `packages/sfu-livekit/src/internal/lifecycle.ts`                                 | Shared LiveKit `Room` connect + reconnect bridging into our state machine.                                                             |
| `packages/sfu-livekit/src/index.ts`                                              | Re-exports.                                                                                                                            |
| `packages/sfu-livekit/test/_helpers/fake-livekit.ts`                             | Hand-rolled fake `Room` / `LocalParticipant` / `Track`.                                                                                |
| `packages/sfu-livekit/test/unit/publisher.test.ts`                               | publish flow + event surface.                                                                                                          |
| `packages/sfu-livekit/test/unit/viewer.test.ts`                                  | subscribe filter + track event.                                                                                                        |
| `packages/sfu-livekit/test/unit/lifecycle.test.ts`                               | connect / disconnect / token error mapping.                                                                                            |
| `packages/sfu-livekit/README.md`                                                 | Install + getting LiveKit + minting tokens (Node snippet) + basic usage + bundle note.                                                 |
| `packages/react/src/use-sfu-publisher.ts`                                        | React hook mirroring `usePublisher` shape but routed through SFU.                                                                      |
| `packages/react/src/use-sfu-viewer.ts`                                           | Mirror of `useViewer`.                                                                                                                 |
| `packages/react/test/unit/use-sfu-publisher.test.tsx`, `use-sfu-viewer.test.tsx` | Mocked SFU package.                                                                                                                    |
| `packages/vue/src/use-sfu-publisher.ts`, `use-sfu-viewer.ts`                     | Vue parity.                                                                                                                            |
| `packages/vue/test/unit/use-sfu-publisher.test.ts`, `use-sfu-viewer.test.ts`     | Same.                                                                                                                                  |
| `examples/livekit-sfu-publisher-viewer/`                                         | Vite + React + LiveKit Cloud snippet.                                                                                                  |
| `docs/sfu-integration.md`                                                        | When to use SFU, two-transport model, mesh→SFU migration, token minting.                                                               |
| Root `package.json`                                                              | Add `dev:sfu` script for the new example.                                                                                              |
| `.changeset/sfu-livekit.md`                                                      | minor for `react` + `vue`; `0.1.0` initial release for `sfu-livekit`.                                                                  |

---

## Task 1: Scaffold the `sfu-livekit` package

**Files:**

- Create: `packages/sfu-livekit/package.json`
- Create: `packages/sfu-livekit/tsconfig.json`
- Create: `packages/sfu-livekit/tsconfig.build.json`
- Create: `packages/sfu-livekit/tsup.config.ts`
- Create: `packages/sfu-livekit/vitest.config.ts`
- Create: `packages/sfu-livekit/src/index.ts` (placeholder)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@forinda/video-sdk-sfu-livekit",
  "version": "0.0.0",
  "description": "LiveKit SFU adapter for the Forinda RTC SDK — same Publisher/Viewer surface, routed through LiveKit Cloud or self-hosted",
  "keywords": ["livekit", "rtc", "sdk", "sfu", "video", "webrtc"],
  "homepage": "https://github.com/forinda/forinda-rtc-sdk#readme",
  "bugs": { "url": "https://github.com/forinda/forinda-rtc-sdk/issues" },
  "license": "MIT",
  "author": { "name": "Felix Orinda", "email": "forinda82@gmail.com" },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/forinda/forinda-rtc-sdk.git",
    "directory": "packages/sfu-livekit"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./package.json": "./package.json"
  },
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "wireit",
    "typecheck": "wireit",
    "lint": "wireit",
    "test": "wireit"
  },
  "dependencies": {
    "@forinda/video-sdk-core": "workspace:*"
  },
  "peerDependencies": {
    "@forinda/video-sdk-core": "workspace:*",
    "livekit-client": "^2.18.0"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^2.1.0",
    "jsdom": "^25.0.0",
    "livekit-client": "^2.18.0",
    "oxlint": "^0.11.0",
    "tsup": "^8.3.0",
    "typescript": "^6.0.0",
    "vitest": "^2.1.0",
    "wireit": "^0.14.9"
  },
  "engines": { "node": ">=20.0.0" },
  "wireit": {
    "build": {
      "command": "tsup",
      "files": [
        "src/**/*.ts",
        "tsup.config.ts",
        "tsconfig.json",
        "tsconfig.build.json",
        "../../tsconfig.base.json"
      ],
      "output": ["dist/**"],
      "clean": "if-file-deleted",
      "dependencies": ["../core:build"]
    },
    "typecheck": {
      "command": "tsc --noEmit",
      "files": ["src/**/*.ts", "test/**/*.ts", "tsconfig.json", "../../tsconfig.base.json"],
      "output": [],
      "dependencies": ["../core:build"]
    },
    "lint": {
      "command": "oxlint src",
      "files": ["src/**/*.ts", "../../oxlint.json"],
      "output": []
    },
    "test": {
      "command": "vitest run",
      "files": [
        "src/**/*.ts",
        "test/**/*.ts",
        "vitest.config.ts",
        "tsconfig.json",
        "../../tsconfig.base.json"
      ],
      "output": [],
      "dependencies": ["../core:build"]
    }
  }
}
```

- [ ] **Step 2: Create `tsconfig.json` + `tsconfig.build.json` + `tsup.config.ts` + `vitest.config.ts`**

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

`tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "noEmit": false,
    "emitDeclarationOnly": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["test/**", "vitest.config.ts", "dist/**"]
}
```

`tsup.config.ts`:

```ts
import { defineConfig } from "tsup";
import { createBanner } from "../../tools/build-banner.ts";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  treeshake: true,
  minify: true,
  tsconfig: "./tsconfig.build.json",
  external: ["livekit-client", "@forinda/video-sdk-core"],
  banner: { js: createBanner() },
});
```

`vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
```

- [ ] **Step 3: Create empty `src/index.ts`**

```ts
/**
 * Public surface for `@forinda/video-sdk-sfu-livekit`.
 *
 * Re-exports only — implementation lives in sibling files.
 */
export {};
```

- [ ] **Step 4: Install + verify**

```bash
pnpm install
pnpm --filter @forinda/video-sdk-sfu-livekit typecheck
```

Expected: install adds the package, typecheck passes.

- [ ] **Step 5: Commit**

```bash
git add packages/sfu-livekit/ pnpm-lock.yaml
git commit -m "feat(sfu-livekit): scaffold package (EPIC-14 #1/11)"
```

---

## Task 2: Types + errors

**Files:**

- Create: `packages/sfu-livekit/src/types.ts`
- Create: `packages/sfu-livekit/src/errors.ts`

- [ ] **Step 1: Create `errors.ts`**

```ts
/**
 * SFU-specific error codes. Extends the core `SdkError` so consumers can
 * `instanceof SdkError` and switch on `code`.
 */

import { SdkError, type SdkErrorOptions } from "@forinda/video-sdk-core";

export class SfuError extends SdkError {
  constructor(message: string, opts: Omit<SdkErrorOptions, "code"> & { code: SfuErrorCode }) {
    super(message, opts);
    this.name = "SfuError";
  }
}

export type SfuErrorCode =
  /** WebSocket / signaling failed; LiveKit `connect()` rejected. */
  | "sfu_connect_failed"
  /** Token validation failed at LiveKit. Usually a malformed or expired JWT. */
  | "sfu_token_invalid"
  /** `LocalParticipant.publishTrack` rejected. Usually codec / device / permissions. */
  | "sfu_publish_failed"
  /** `Room.disconnect()` fired unexpectedly during an active session. */
  | "sfu_disconnected";
```

- [ ] **Step 2: Create `types.ts`**

```ts
/**
 * Public type surface for the LiveKit SFU adapter. Mirrors the core
 * `Publisher` / `Viewer` shape so swapping mesh→SFU is one factory call.
 */

import type { ConnectionStats, RetryConfig, SdkError } from "@forinda/video-sdk-core";

/** Lifecycle vocabulary. Identical to core's `ConnectionState` minus `failed`/`reconnecting` (LiveKit handles its own reconnect internally). */
export type SfuConnectionState = "idle" | "connecting" | "connected" | "closed";

export interface SfuPublisherOptions {
  /** LiveKit signaling URL — typically `wss://<your-project>.livekit.cloud` or `ws://localhost:7880` for self-host. */
  url: string;
  /** Server-minted JWT scoped to (room, participant identity, can-publish). */
  token: string;
  /** Room name (LiveKit `roomName`). */
  room: string;
  /** This participant's stable identifier; surfaces as `participant.identity` to viewers. */
  peerId: string;
  /** Local `MediaStream` whose tracks will be published. */
  stream: MediaStream;
  /** Reconnect tuning forwarded to LiveKit's own reconnect machinery. */
  retry?: RetryConfig;
  /** Stats poll interval in ms. Default 1000. */
  stats?: { interval: number };
}

export interface SfuPublisher {
  readonly state: SfuConnectionState;
  readonly peerId: string;
  /** Subscribe to a typed event. Returns an unsubscribe. */
  on<E extends keyof SfuPublisherEvents>(
    event: E,
    handler: (payload: SfuPublisherEvents[E]) => void,
  ): () => void;
  /** Open the LiveKit room + publish all tracks from `stream`. */
  start(): Promise<void>;
  /** Disconnect from the room. Idempotent. */
  stop(): Promise<void>;
  /** Hot-swap the published video track — mirrors core Publisher's API. */
  replaceVideoTrack(track: MediaStreamTrack): Promise<void>;
  /** Same for audio. */
  replaceAudioTrack(track: MediaStreamTrack): Promise<void>;
  /** Snapshot of currently subscribed peers (LiveKit `RemoteParticipant.identity`s). */
  peers(): readonly string[];
}

export type SfuPublisherEvents = {
  state: SfuConnectionState;
  /** Fires when a remote participant subscribes to one of our tracks. */
  "viewer-joined": { peerId: string };
  /** Fires when a remote participant unsubscribes / disconnects. */
  "viewer-left": { peerId: string };
  /** Per-poll stats snapshot. */
  stats: ConnectionStats[];
  error: SdkError;
};

export interface SfuViewerOptions {
  url: string;
  token: string;
  room: string;
  /** Our identity in the room. Distinct from `publisherId` below. */
  peerId: string;
  /** The participant identity we want to subscribe to. */
  publisherId: string;
  retry?: RetryConfig;
  stats?: { interval: number };
}

export interface SfuViewer {
  readonly state: SfuConnectionState;
  readonly peerId: string;
  on<E extends keyof SfuViewerEvents>(
    event: E,
    handler: (payload: SfuViewerEvents[E]) => void,
  ): () => void;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Live `MediaStream` of the publisher's tracks. `null` until the first `track` event fires. */
  readonly stream: MediaStream | null;
}

export type SfuViewerEvents = {
  state: SfuConnectionState;
  /** Fires whenever a new track from the target publisher is subscribed. The stream cumulatively contains every track received so far. */
  track: { stream: MediaStream; track: MediaStreamTrack };
  stats: ConnectionStats | null;
  error: SdkError;
};
```

- [ ] **Step 3: Re-export from `index.ts`**

Replace `packages/sfu-livekit/src/index.ts`:

```ts
export type {
  SfuConnectionState,
  SfuPublisher,
  SfuPublisherEvents,
  SfuPublisherOptions,
  SfuViewer,
  SfuViewerEvents,
  SfuViewerOptions,
} from "./types.ts";
export { SfuError, type SfuErrorCode } from "./errors.ts";
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @forinda/video-sdk-sfu-livekit typecheck
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/sfu-livekit/src/types.ts packages/sfu-livekit/src/errors.ts packages/sfu-livekit/src/index.ts
git commit -m "feat(sfu-livekit): public types + SfuError (EPIC-14 #2/11)"
```

---

## Task 3: Fake LiveKit fixture for tests

**Files:**

- Create: `packages/sfu-livekit/test/_helpers/fake-livekit.ts`

LiveKit's full type surface is large. The package only uses a small slice — `Room`, `RoomEvent`, `LocalParticipant`, `RemoteParticipant`, `Track`. Build a fake covering exactly that slice so unit tests don't pull in the real client (which makes WebSocket calls).

- [ ] **Step 1: Create the fake**

```ts
/**
 * Hand-rolled `livekit-client` substitute for unit tests. Covers exactly
 * the surface our adapter touches: Room (connect / disconnect / events),
 * LocalParticipant (publishTrack / unpublishTrack), RemoteParticipant
 * (track subscriptions). Keep this minimal — when the adapter starts
 * exercising more LiveKit APIs, expand here, not in test files.
 */

import { vi } from "vitest";

export type RoomEventName =
  | "Connected"
  | "Disconnected"
  | "Reconnecting"
  | "Reconnected"
  | "ParticipantConnected"
  | "ParticipantDisconnected"
  | "TrackSubscribed"
  | "TrackUnsubscribed"
  | "TrackPublished";

interface Listener {
  event: RoomEventName;
  fn: (...args: unknown[]) => void;
}

export interface FakeTrack {
  kind: "video" | "audio";
  mediaStreamTrack: MediaStreamTrack;
}

export interface FakeRemoteParticipant {
  identity: string;
  trackPublications: Map<string, { track: FakeTrack | null }>;
}

export interface FakeLocalParticipant {
  identity: string;
  publishTrack: ReturnType<typeof vi.fn>;
  unpublishTrack: ReturnType<typeof vi.fn>;
}

export interface FakeRoom {
  state: "disconnected" | "connecting" | "connected" | "reconnecting";
  localParticipant: FakeLocalParticipant;
  remoteParticipants: Map<string, FakeRemoteParticipant>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  on: (event: RoomEventName, fn: (...args: unknown[]) => void) => FakeRoom;
  off: (event: RoomEventName, fn: (...args: unknown[]) => void) => FakeRoom;
  /** Test helper — fire an event into the registered listeners. */
  __fire: (event: RoomEventName, ...args: unknown[]) => void;
}

export function defineFakeRoom(localIdentity = "alice"): FakeRoom {
  const listeners: Listener[] = [];
  const room: FakeRoom = {
    state: "disconnected",
    localParticipant: {
      identity: localIdentity,
      publishTrack: vi.fn(async (_track: MediaStreamTrack) => ({
        trackSid: "sid-" + Math.random(),
      })),
      unpublishTrack: vi.fn(async () => {}),
    },
    remoteParticipants: new Map(),
    connect: vi.fn(async () => {
      room.state = "connected";
      for (const l of listeners) if (l.event === "Connected") l.fn();
    }),
    disconnect: vi.fn(async () => {
      room.state = "disconnected";
      for (const l of listeners) if (l.event === "Disconnected") l.fn();
    }),
    on(event, fn) {
      listeners.push({ event, fn });
      return room;
    },
    off(event, fn) {
      const idx = listeners.findIndex((l) => l.event === event && l.fn === fn);
      if (idx >= 0) listeners.splice(idx, 1);
      return room;
    },
    __fire(event, ...args) {
      for (const l of listeners) if (l.event === event) l.fn(...args);
    },
  };
  return room;
}

export function defineFakeRemoteParticipant(identity: string): FakeRemoteParticipant {
  return { identity, trackPublications: new Map() };
}

export function defineFakeTrack(kind: "video" | "audio"): FakeTrack {
  return {
    kind,
    mediaStreamTrack: {
      kind,
      stop: vi.fn(),
    } as unknown as MediaStreamTrack,
  };
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
pnpm --filter @forinda/video-sdk-sfu-livekit typecheck
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add packages/sfu-livekit/test/_helpers/fake-livekit.ts
git commit -m "test(sfu-livekit): fake LiveKit fixture (EPIC-14 #3/11)"
```

---

## Task 4: `defineSfuPublisher`

**Files:**

- Create: `packages/sfu-livekit/src/internal/lifecycle.ts`
- Create: `packages/sfu-livekit/src/publisher.ts`
- Modify: `packages/sfu-livekit/src/index.ts`
- Test: `packages/sfu-livekit/test/unit/publisher.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/sfu-livekit/test/unit/publisher.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineSfuPublisher } from "@/publisher.ts";
import { defineFakeRoom, type FakeRoom } from "../_helpers/fake-livekit.ts";

let fakeRoom: FakeRoom;

const fakeStream = (): MediaStream =>
  ({
    id: "fake-stream",
    getTracks: () => [
      { kind: "video", stop: vi.fn() } as unknown as MediaStreamTrack,
      { kind: "audio", stop: vi.fn() } as unknown as MediaStreamTrack,
    ],
    getVideoTracks: () => [{ kind: "video", stop: vi.fn() } as unknown as MediaStreamTrack],
    getAudioTracks: () => [{ kind: "audio", stop: vi.fn() } as unknown as MediaStreamTrack],
  }) as unknown as MediaStream;

beforeEach(() => {
  fakeRoom = defineFakeRoom("alice");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("defineSfuPublisher", () => {
  it("starts at idle, transitions through connecting → connected on start()", async () => {
    const pub = defineSfuPublisher({
      url: "ws://test/lk",
      token: "fake.jwt",
      room: "demo",
      peerId: "alice",
      stream: fakeStream(),
      __roomFactory: () => fakeRoom as unknown as never,
    });

    expect(pub.state).toBe("idle");
    const seen: string[] = [];
    pub.on("state", (s) => seen.push(s));

    await pub.start();

    expect(pub.state).toBe("connected");
    expect(seen).toEqual(["connecting", "connected"]);
  });

  it("publishes every track in the supplied stream", async () => {
    const pub = defineSfuPublisher({
      url: "ws://test/lk",
      token: "fake.jwt",
      room: "demo",
      peerId: "alice",
      stream: fakeStream(),
      __roomFactory: () => fakeRoom as unknown as never,
    });
    await pub.start();
    expect(fakeRoom.localParticipant.publishTrack).toHaveBeenCalledTimes(2);
  });

  it("emits viewer-joined when a remote participant connects", async () => {
    const pub = defineSfuPublisher({
      url: "ws://test/lk",
      token: "fake.jwt",
      room: "demo",
      peerId: "alice",
      stream: fakeStream(),
      __roomFactory: () => fakeRoom as unknown as never,
    });
    await pub.start();

    const seen: string[] = [];
    pub.on("viewer-joined", ({ peerId }) => seen.push(peerId));

    fakeRoom.__fire("ParticipantConnected", { identity: "bob" });
    expect(seen).toEqual(["bob"]);
  });

  it("transitions to closed on stop()", async () => {
    const pub = defineSfuPublisher({
      url: "ws://test/lk",
      token: "fake.jwt",
      room: "demo",
      peerId: "alice",
      stream: fakeStream(),
      __roomFactory: () => fakeRoom as unknown as never,
    });
    await pub.start();
    await pub.stop();
    expect(pub.state).toBe("closed");
    expect(fakeRoom.disconnect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-sfu-livekit test
```

Expected: failures — `defineSfuPublisher` doesn't exist.

- [ ] **Step 3: Create `internal/lifecycle.ts`**

Connection-state mapping is shared between publisher + viewer; pull it into one place.

```ts
/**
 * Bridges LiveKit's `Room.state` strings into our `SfuConnectionState`
 * lifecycle vocabulary so publisher + viewer can use one mapping.
 */

import type { SfuConnectionState } from "../types.ts";

export function mapLiveKitState(state: string): SfuConnectionState {
  switch (state) {
    case "disconnected":
      return "closed";
    case "connecting":
    case "reconnecting":
      return "connecting";
    case "connected":
      return "connected";
    default:
      return "idle";
  }
}
```

- [ ] **Step 4: Create `publisher.ts`**

````ts
/**
 * `defineSfuPublisher` — wrap LiveKit's `Room` + `LocalParticipant` to
 * publish a `MediaStream`'s tracks under a stable peer identity, with a
 * lifecycle and event surface that mirrors core's mesh `Publisher`.
 */

import { defineEmitter, type Emitter, SdkError } from "@forinda/video-sdk-core";
import { SfuError } from "./errors.ts";
import { mapLiveKitState } from "./internal/lifecycle.ts";
import type {
  SfuConnectionState,
  SfuPublisher,
  SfuPublisherEvents,
  SfuPublisherOptions,
} from "./types.ts";

/** Internal escape hatch for tests: inject a fake `Room` factory. */
type RoomFactory = (opts: { token: string; url: string }) => unknown;

export interface InternalSfuPublisherOptions extends SfuPublisherOptions {
  /** **Internal.** Test seam — replaces `new Room()` from `livekit-client`. */
  __roomFactory?: RoomFactory;
}

class SfuPublisherImpl implements SfuPublisher {
  readonly peerId: string;
  private readonly opts: InternalSfuPublisherOptions;
  private readonly emitter: Emitter<SfuPublisherEvents> = defineEmitter();
  private currentState: SfuConnectionState = "idle";
  private room: ReturnType<typeof openRoom> | null = null;
  private currentVideoTrack: { trackSid: string } | null = null;
  private currentAudioTrack: { trackSid: string } | null = null;

  constructor(opts: InternalSfuPublisherOptions) {
    this.opts = opts;
    this.peerId = opts.peerId;
  }

  get state(): SfuConnectionState {
    return this.currentState;
  }

  on<E extends keyof SfuPublisherEvents>(
    event: E,
    handler: (payload: SfuPublisherEvents[E]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  peers(): readonly string[] {
    if (!this.room) return [];
    return [...(this.room.remoteParticipants?.keys?.() ?? [])];
  }

  async start(): Promise<void> {
    if (this.currentState !== "idle") return;
    this.setState("connecting");

    try {
      this.room = openRoom(this.opts);
      this.attachListeners(this.room);
      await this.room.connect(this.opts.url, this.opts.token);

      // Publish every track in the supplied stream.
      for (const track of this.opts.stream.getTracks()) {
        const pub = (await this.room.localParticipant.publishTrack(track)) as {
          trackSid: string;
        };
        if (track.kind === "video") this.currentVideoTrack = pub;
        else if (track.kind === "audio") this.currentAudioTrack = pub;
      }

      this.setState("connected");
    } catch (cause) {
      const code =
        cause instanceof Error && /token/i.test(cause.message)
          ? "sfu_token_invalid"
          : "sfu_connect_failed";
      const err = new SfuError("LiveKit publisher start failed", { code, cause });
      this.emitter.emit("error", err);
      this.setState("closed");
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.currentState === "closed") return;
    if (this.room) await this.room.disconnect();
    this.setState("closed");
  }

  async replaceVideoTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.room) throw new SfuError("publisher not started", { code: "sfu_publish_failed" });
    if (this.currentVideoTrack) {
      await this.room.localParticipant.unpublishTrack(this.currentVideoTrack);
    }
    this.currentVideoTrack = (await this.room.localParticipant.publishTrack(track)) as {
      trackSid: string;
    };
  }

  async replaceAudioTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.room) throw new SfuError("publisher not started", { code: "sfu_publish_failed" });
    if (this.currentAudioTrack) {
      await this.room.localParticipant.unpublishTrack(this.currentAudioTrack);
    }
    this.currentAudioTrack = (await this.room.localParticipant.publishTrack(track)) as {
      trackSid: string;
    };
  }

  private attachListeners(room: ReturnType<typeof openRoom>): void {
    room.on("ParticipantConnected", (p: { identity: string }) => {
      this.emitter.emit("viewer-joined", { peerId: p.identity });
    });
    room.on("ParticipantDisconnected", (p: { identity: string }) => {
      this.emitter.emit("viewer-left", { peerId: p.identity });
    });
    room.on("Disconnected", () => {
      if (this.currentState !== "closed") {
        this.emitter.emit(
          "error",
          new SfuError("LiveKit room disconnected", { code: "sfu_disconnected" }) as SdkError,
        );
        this.setState("closed");
      }
    });
  }

  private setState(next: SfuConnectionState): void {
    if (this.currentState === next) return;
    this.currentState = next;
    this.emitter.emit("state", next);
  }
}

/**
 * Internal: open a LiveKit `Room`. Real path uses `new Room()` from
 * `livekit-client`; tests inject a fake via `__roomFactory`.
 */
function openRoom(opts: InternalSfuPublisherOptions): {
  state: string;
  localParticipant: {
    identity: string;
    publishTrack: (track: MediaStreamTrack) => Promise<unknown>;
    unpublishTrack: (pub: unknown) => Promise<unknown>;
  };
  remoteParticipants: Map<string, { identity: string }>;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  on: (event: string, fn: (...args: unknown[]) => void) => unknown;
} {
  if (opts.__roomFactory) {
    return opts.__roomFactory(opts) as ReturnType<typeof openRoom>;
  }
  // Lazy require — only loads `livekit-client` at runtime if the consumer
  // actually calls a publisher / viewer factory.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Room } = require("livekit-client");
  return new Room() as ReturnType<typeof openRoom>;
}

/**
 * Build a LiveKit-backed publisher. Wires LiveKit's `Room` lifecycle into
 * the same event surface as core's mesh `Publisher`.
 *
 * ```ts
 * const publisher = defineSfuPublisher({
 *   url: "wss://my-lk.livekit.cloud",
 *   token: jwt,
 *   room: "webinar-2026",
 *   peerId: "host",
 *   stream,
 * });
 * publisher.on("viewer-joined", ({ peerId }) => console.log(peerId));
 * await publisher.start();
 * ```
 */
export function defineSfuPublisher(opts: SfuPublisherOptions): SfuPublisher {
  return new SfuPublisherImpl(opts);
}
````

- [ ] **Step 5: Re-export from `index.ts`**

Update `packages/sfu-livekit/src/index.ts`:

```ts
export type {
  SfuConnectionState,
  SfuPublisher,
  SfuPublisherEvents,
  SfuPublisherOptions,
  SfuViewer,
  SfuViewerEvents,
  SfuViewerOptions,
} from "./types.ts";
export { SfuError, type SfuErrorCode } from "./errors.ts";
export { defineSfuPublisher } from "./publisher.ts";
```

- [ ] **Step 6: Re-run the test**

```bash
pnpm --filter @forinda/video-sdk-sfu-livekit test
```

Expected: all 4 publisher tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/sfu-livekit/src/publisher.ts packages/sfu-livekit/src/internal/lifecycle.ts packages/sfu-livekit/src/index.ts packages/sfu-livekit/test/unit/publisher.test.ts
git commit -m "feat(sfu-livekit): defineSfuPublisher (EPIC-14 #4/11)"
```

---

## Task 5: `defineSfuViewer`

**Files:**

- Create: `packages/sfu-livekit/src/viewer.ts`
- Modify: `packages/sfu-livekit/src/index.ts`
- Test: `packages/sfu-livekit/test/unit/viewer.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/sfu-livekit/test/unit/viewer.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineSfuViewer } from "@/viewer.ts";
import {
  defineFakeRemoteParticipant,
  defineFakeRoom,
  defineFakeTrack,
  type FakeRoom,
} from "../_helpers/fake-livekit.ts";

let fakeRoom: FakeRoom;

beforeEach(() => {
  fakeRoom = defineFakeRoom("bob");
});
afterEach(() => vi.restoreAllMocks());

describe("defineSfuViewer", () => {
  it("starts at idle, connects on start()", async () => {
    const viewer = defineSfuViewer({
      url: "ws://test/lk",
      token: "fake.jwt",
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      __roomFactory: () => fakeRoom as unknown as never,
    });

    expect(viewer.state).toBe("idle");
    await viewer.start();
    expect(viewer.state).toBe("connected");
  });

  it("emits track only for the named publisher", async () => {
    const viewer = defineSfuViewer({
      url: "ws://test/lk",
      token: "fake.jwt",
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      __roomFactory: () => fakeRoom as unknown as never,
    });

    const events: string[] = [];
    viewer.on("track", () => events.push("track"));

    await viewer.start();

    const aliceVideo = defineFakeTrack("video");
    const carolVideo = defineFakeTrack("video");
    fakeRoom.__fire(
      "TrackSubscribed",
      aliceVideo,
      { trackSid: "sid-alice" },
      defineFakeRemoteParticipant("alice"),
    );
    fakeRoom.__fire(
      "TrackSubscribed",
      carolVideo,
      { trackSid: "sid-carol" },
      defineFakeRemoteParticipant("carol"),
    );

    expect(events).toEqual(["track"]);
    expect(viewer.stream).not.toBeNull();
    expect(viewer.stream?.getVideoTracks().length).toBe(1);
  });

  it("transitions to closed on stop()", async () => {
    const viewer = defineSfuViewer({
      url: "ws://test/lk",
      token: "fake.jwt",
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      __roomFactory: () => fakeRoom as unknown as never,
    });
    await viewer.start();
    await viewer.stop();
    expect(viewer.state).toBe("closed");
    expect(fakeRoom.disconnect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-sfu-livekit test
```

Expected: viewer test failures (publisher passes from Task 4).

- [ ] **Step 3: Create `viewer.ts`**

````ts
/**
 * `defineSfuViewer` — subscribe to one specific publisher in a LiveKit
 * room and expose its tracks as a single `MediaStream`.
 *
 * The adapter filters incoming `TrackSubscribed` events by participant
 * identity so consumers only see the tracks they asked for. LiveKit
 * auto-subscribes to all published tracks by default; we mask that and
 * present a per-publisher view.
 */

import { defineEmitter, type Emitter, SdkError } from "@forinda/video-sdk-core";
import { SfuError } from "./errors.ts";
import type { SfuConnectionState, SfuViewer, SfuViewerEvents, SfuViewerOptions } from "./types.ts";

type RoomFactory = (opts: { token: string; url: string }) => unknown;

export interface InternalSfuViewerOptions extends SfuViewerOptions {
  /** **Internal.** Test seam — replaces `new Room()` from `livekit-client`. */
  __roomFactory?: RoomFactory;
}

class SfuViewerImpl implements SfuViewer {
  readonly peerId: string;
  private readonly opts: InternalSfuViewerOptions;
  private readonly emitter: Emitter<SfuViewerEvents> = defineEmitter();
  private currentState: SfuConnectionState = "idle";
  private currentStream: MediaStream | null = null;
  private room: ReturnType<typeof openRoom> | null = null;

  constructor(opts: InternalSfuViewerOptions) {
    this.opts = opts;
    this.peerId = opts.peerId;
  }

  get state(): SfuConnectionState {
    return this.currentState;
  }

  get stream(): MediaStream | null {
    return this.currentStream;
  }

  on<E extends keyof SfuViewerEvents>(
    event: E,
    handler: (payload: SfuViewerEvents[E]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  async start(): Promise<void> {
    if (this.currentState !== "idle") return;
    this.setState("connecting");

    try {
      this.room = openRoom(this.opts);
      this.attachListeners(this.room);
      await this.room.connect(this.opts.url, this.opts.token);
      this.setState("connected");
    } catch (cause) {
      const code =
        cause instanceof Error && /token/i.test(cause.message)
          ? "sfu_token_invalid"
          : "sfu_connect_failed";
      const err = new SfuError("LiveKit viewer start failed", { code, cause });
      this.emitter.emit("error", err);
      this.setState("closed");
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.currentState === "closed") return;
    if (this.room) await this.room.disconnect();
    if (this.currentStream) {
      for (const t of this.currentStream.getTracks()) t.stop();
      this.currentStream = null;
    }
    this.setState("closed");
  }

  private attachListeners(room: ReturnType<typeof openRoom>): void {
    room.on(
      "TrackSubscribed",
      (
        track: { mediaStreamTrack: MediaStreamTrack },
        _publication: unknown,
        participant: { identity: string },
      ) => {
        if (participant.identity !== this.opts.publisherId) return;
        if (this.currentStream === null) this.currentStream = new MediaStream();
        this.currentStream.addTrack(track.mediaStreamTrack);
        this.emitter.emit("track", { stream: this.currentStream, track: track.mediaStreamTrack });
      },
    );
    room.on(
      "TrackUnsubscribed",
      (
        track: { mediaStreamTrack: MediaStreamTrack },
        _publication: unknown,
        participant: { identity: string },
      ) => {
        if (participant.identity !== this.opts.publisherId) return;
        if (this.currentStream) this.currentStream.removeTrack(track.mediaStreamTrack);
      },
    );
    room.on("Disconnected", () => {
      if (this.currentState !== "closed") {
        this.emitter.emit(
          "error",
          new SfuError("LiveKit room disconnected", { code: "sfu_disconnected" }) as SdkError,
        );
        this.setState("closed");
      }
    });
  }

  private setState(next: SfuConnectionState): void {
    if (this.currentState === next) return;
    this.currentState = next;
    this.emitter.emit("state", next);
  }
}

function openRoom(opts: InternalSfuViewerOptions): ReturnType<typeof realOpenRoom> {
  if (opts.__roomFactory) {
    return opts.__roomFactory(opts) as ReturnType<typeof realOpenRoom>;
  }
  return realOpenRoom();
}

function realOpenRoom(): {
  state: string;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  on: (event: string, fn: (...args: unknown[]) => void) => unknown;
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Room } = require("livekit-client");
  return new Room() as ReturnType<typeof realOpenRoom>;
}

/**
 * Build a LiveKit-backed viewer that subscribes only to the named
 * publisher's tracks and exposes them as a single accumulating
 * `MediaStream`.
 *
 * ```ts
 * const viewer = defineSfuViewer({
 *   url: "wss://my-lk.livekit.cloud",
 *   token: jwt,
 *   room: "webinar-2026",
 *   peerId: "viewer-1",
 *   publisherId: "host",
 * });
 * viewer.on("track", ({ stream }) => {
 *   videoEl.srcObject = stream;
 * });
 * await viewer.start();
 * ```
 */
export function defineSfuViewer(opts: SfuViewerOptions): SfuViewer {
  return new SfuViewerImpl(opts);
}
````

- [ ] **Step 4: Re-export from `index.ts`**

```ts
export type {
  SfuConnectionState,
  SfuPublisher,
  SfuPublisherEvents,
  SfuPublisherOptions,
  SfuViewer,
  SfuViewerEvents,
  SfuViewerOptions,
} from "./types.ts";
export { SfuError, type SfuErrorCode } from "./errors.ts";
export { defineSfuPublisher } from "./publisher.ts";
export { defineSfuViewer } from "./viewer.ts";
```

- [ ] **Step 5: Re-run the test**

```bash
pnpm --filter @forinda/video-sdk-sfu-livekit test
```

Expected: viewer + publisher tests all pass (~7 tests total).

- [ ] **Step 6: Commit**

```bash
git add packages/sfu-livekit/src/viewer.ts packages/sfu-livekit/src/index.ts packages/sfu-livekit/test/unit/viewer.test.ts
git commit -m "feat(sfu-livekit): defineSfuViewer (EPIC-14 #5/11)"
```

---

## Task 6: Lifecycle / connect-error tests

**Files:**

- Test: `packages/sfu-livekit/test/unit/lifecycle.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it, vi } from "vitest";
import { defineSfuPublisher } from "@/publisher.ts";
import { defineSfuViewer } from "@/viewer.ts";
import { SfuError } from "@/errors.ts";
import { defineFakeRoom } from "../_helpers/fake-livekit.ts";

const fakeStream = (): MediaStream =>
  ({
    getTracks: () => [],
    getVideoTracks: () => [],
    getAudioTracks: () => [],
  }) as unknown as MediaStream;

describe("SFU lifecycle — error mapping", () => {
  it("maps LiveKit token errors to sfu_token_invalid", async () => {
    const fakeRoom = defineFakeRoom("alice");
    fakeRoom.connect = vi.fn(async () => {
      throw new Error("invalid token");
    });

    const pub = defineSfuPublisher({
      url: "ws://test/lk",
      token: "bad.jwt",
      room: "demo",
      peerId: "alice",
      stream: fakeStream(),
      __roomFactory: () => fakeRoom as unknown as never,
    });

    await expect(pub.start()).rejects.toMatchObject({
      code: "sfu_token_invalid",
    });
    expect(pub.state).toBe("closed");
  });

  it("maps generic connect failures to sfu_connect_failed", async () => {
    const fakeRoom = defineFakeRoom("bob");
    fakeRoom.connect = vi.fn(async () => {
      throw new Error("network unreachable");
    });

    const viewer = defineSfuViewer({
      url: "ws://test/lk",
      token: "ok.jwt",
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      __roomFactory: () => fakeRoom as unknown as never,
    });

    await expect(viewer.start()).rejects.toMatchObject({
      code: "sfu_connect_failed",
    });
  });

  it("emits sfu_disconnected when the room drops mid-session", async () => {
    const fakeRoom = defineFakeRoom("alice");
    const pub = defineSfuPublisher({
      url: "ws://test/lk",
      token: "ok.jwt",
      room: "demo",
      peerId: "alice",
      stream: fakeStream(),
      __roomFactory: () => fakeRoom as unknown as never,
    });

    await pub.start();

    const errors: SfuError[] = [];
    pub.on("error", (e) => errors.push(e as SfuError));

    fakeRoom.__fire("Disconnected");

    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe("sfu_disconnected");
    expect(pub.state).toBe("closed");
  });
});
```

- [ ] **Step 2: Run + verify all SFU tests pass**

```bash
pnpm --filter @forinda/video-sdk-sfu-livekit test
```

Expected: ~10 tests, all green.

- [ ] **Step 3: Commit**

```bash
git add packages/sfu-livekit/test/unit/lifecycle.test.ts
git commit -m "test(sfu-livekit): lifecycle + error mapping coverage (EPIC-14 #6/11)"
```

---

## Task 7: React `useSfuPublisher` + `useSfuViewer`

**Files:**

- Create: `packages/react/src/use-sfu-publisher.ts`
- Create: `packages/react/src/use-sfu-viewer.ts`
- Modify: `packages/react/src/index.ts`
- Modify: `packages/react/package.json` (add devDep on `@forinda/video-sdk-sfu-livekit` for tests)
- Test: `packages/react/test/unit/use-sfu-publisher.test.tsx`
- Test: `packages/react/test/unit/use-sfu-viewer.test.tsx`

- [ ] **Step 1: Add the workspace dep**

```bash
pnpm --filter @forinda/video-sdk-react add -D @forinda/video-sdk-sfu-livekit@workspace:*
```

- [ ] **Step 2: Write `use-sfu-publisher.ts`**

```ts
/**
 * `useSfuPublisher` — same shape as `usePublisher` but routes media
 * through a LiveKit SFU instead of mesh WebRTC.
 *
 * Token must be supplied by the caller (server-minted). The hook does
 * not bind to `VideoSdkProvider` — SFU lives in its own dimension from
 * our signaling.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  defineSfuPublisher,
  type SfuConnectionState,
  type SfuPublisher,
  type SfuPublisherOptions,
} from "@forinda/video-sdk-sfu-livekit";
import type { SdkError } from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseSfuPublisherOptions extends Omit<SfuPublisherOptions, "stream"> {
  stream: MediaStream | null;
  autoStart?: boolean;
}

export interface UseSfuPublisherResult {
  publisher: SfuPublisher | null;
  state: SfuConnectionState;
  viewers: readonly string[];
  error: SdkError | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  replaceVideoTrack: (track: MediaStreamTrack) => Promise<void>;
  replaceAudioTrack: (track: MediaStreamTrack) => Promise<void>;
}

export function useSfuPublisher(opts: UseSfuPublisherOptions): UseSfuPublisherResult {
  const [publisher, setPublisher] = useState<SfuPublisher | null>(null);
  const [state, setState] = useState<SfuConnectionState>("idle");
  const [viewers, setViewers] = useState<readonly string[]>([]);
  const [error, setError] = useState<SdkError | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const autoStart = opts.autoStart ?? true;
  const hasStream = opts.stream !== null;

  useEffect(() => {
    if (isServer || !hasStream) return;
    const o = optsRef.current;
    const ctrl = new AbortController();

    const p = defineSfuPublisher({
      url: o.url,
      token: o.token,
      room: o.room,
      peerId: o.peerId,
      stream: o.stream as MediaStream,
      ...(o.retry !== undefined ? { retry: o.retry } : {}),
      ...(o.stats !== undefined ? { stats: o.stats } : {}),
    });
    setPublisher(p);

    const offState = p.on("state", (s) => {
      if (!ctrl.signal.aborted) setState(s);
    });
    const offJoin = p.on("viewer-joined", () => {
      if (!ctrl.signal.aborted) setViewers([...p.peers()]);
    });
    const offLeave = p.on("viewer-left", () => {
      if (!ctrl.signal.aborted) setViewers([...p.peers()]);
    });
    const offError = p.on("error", (e) => {
      if (!ctrl.signal.aborted) setError(e);
    });

    if (autoStart) void p.start();

    return () => {
      ctrl.abort();
      offState();
      offJoin();
      offLeave();
      offError();
      void p.stop();
      setPublisher(null);
      setState("idle");
      setViewers([]);
      setError(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStream, autoStart, opts.url, opts.room, opts.peerId, opts.token]);

  const start = useCallback(async (): Promise<void> => {
    if (publisher) await publisher.start();
  }, [publisher]);
  const stop = useCallback(async (): Promise<void> => {
    if (publisher) await publisher.stop();
  }, [publisher]);
  const replaceVideoTrack = useCallback(
    async (track: MediaStreamTrack) => {
      if (publisher) await publisher.replaceVideoTrack(track);
    },
    [publisher],
  );
  const replaceAudioTrack = useCallback(
    async (track: MediaStreamTrack) => {
      if (publisher) await publisher.replaceAudioTrack(track);
    },
    [publisher],
  );

  return { publisher, state, viewers, error, start, stop, replaceVideoTrack, replaceAudioTrack };
}
```

- [ ] **Step 3: Write `use-sfu-viewer.ts`**

```ts
/**
 * `useSfuViewer` — symmetric to `useSfuPublisher`, returns the inbound
 * `MediaStream` once tracks land.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  defineSfuViewer,
  type SfuConnectionState,
  type SfuViewer,
  type SfuViewerOptions,
} from "@forinda/video-sdk-sfu-livekit";
import type { SdkError } from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseSfuViewerOptions extends SfuViewerOptions {
  autoStart?: boolean;
}

export interface UseSfuViewerResult {
  viewer: SfuViewer | null;
  state: SfuConnectionState;
  stream: MediaStream | null;
  error: SdkError | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useSfuViewer(opts: UseSfuViewerOptions): UseSfuViewerResult {
  const [viewer, setViewer] = useState<SfuViewer | null>(null);
  const [state, setState] = useState<SfuConnectionState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<SdkError | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const autoStart = opts.autoStart ?? true;

  useEffect(() => {
    if (isServer) return;
    const o = optsRef.current;
    const ctrl = new AbortController();

    const v = defineSfuViewer({
      url: o.url,
      token: o.token,
      room: o.room,
      peerId: o.peerId,
      publisherId: o.publisherId,
      ...(o.retry !== undefined ? { retry: o.retry } : {}),
      ...(o.stats !== undefined ? { stats: o.stats } : {}),
    });
    setViewer(v);

    const offState = v.on("state", (s) => {
      if (!ctrl.signal.aborted) setState(s);
    });
    const offTrack = v.on("track", ({ stream: s }) => {
      if (!ctrl.signal.aborted) setStream(s);
    });
    const offError = v.on("error", (e) => {
      if (!ctrl.signal.aborted) setError(e);
    });

    if (autoStart) void v.start();

    return () => {
      ctrl.abort();
      offState();
      offTrack();
      offError();
      void v.stop();
      setViewer(null);
      setState("idle");
      setStream(null);
      setError(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, opts.url, opts.room, opts.peerId, opts.publisherId, opts.token]);

  const start = useCallback(async (): Promise<void> => {
    if (viewer) await viewer.start();
  }, [viewer]);
  const stop = useCallback(async (): Promise<void> => {
    if (viewer) await viewer.stop();
  }, [viewer]);

  return { viewer, state, stream, error, start, stop };
}
```

- [ ] **Step 4: Re-export from `packages/react/src/index.ts`**

Add at the bottom (next to the existing useViewer line):

```ts
export {
  useSfuPublisher,
  type UseSfuPublisherOptions,
  type UseSfuPublisherResult,
} from "./use-sfu-publisher.ts";
export {
  useSfuViewer,
  type UseSfuViewerOptions,
  type UseSfuViewerResult,
} from "./use-sfu-viewer.ts";
```

- [ ] **Step 5: Smoke test (typecheck only — full integration tests are manual)**

```bash
pnpm --filter @forinda/video-sdk-sfu-livekit build
pnpm --filter @forinda/video-sdk-react typecheck
```

Expected: green.

- [ ] **Step 6: Add a minimal hook test that mocks the SFU package**

`packages/react/test/unit/use-sfu-publisher.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@forinda/video-sdk-sfu-livekit", () => ({
  defineSfuPublisher: vi.fn(),
}));

import { defineSfuPublisher } from "@forinda/video-sdk-sfu-livekit";
import { useSfuPublisher } from "@/use-sfu-publisher.ts";

const fakeStream = (): MediaStream =>
  ({
    id: "fake",
    getTracks: () => [],
    getVideoTracks: () => [],
    getAudioTracks: () => [],
  }) as unknown as MediaStream;

beforeEach(() => {
  vi.mocked(defineSfuPublisher).mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("useSfuPublisher", () => {
  it("constructs a publisher and auto-starts when stream is provided", async () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const fake = {
      state: "idle" as const,
      peerId: "alice",
      peers: () => [],
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        handlers.set(event, fn);
        return () => handlers.delete(event);
      }),
      start: vi.fn(async () => {
        handlers.get("state")?.("connected");
      }),
      stop: vi.fn(async () => {}),
      replaceVideoTrack: vi.fn(async () => {}),
      replaceAudioTrack: vi.fn(async () => {}),
    };
    vi.mocked(defineSfuPublisher).mockReturnValue(fake as never);

    const { result } = renderHook(() =>
      useSfuPublisher({
        url: "ws://x",
        token: "t",
        room: "demo",
        peerId: "alice",
        stream: fakeStream(),
      }),
    );

    await waitFor(() => expect(result.current.publisher).not.toBeNull());
    await waitFor(() => expect(fake.start).toHaveBeenCalled());
  });
});
```

`packages/react/test/unit/use-sfu-viewer.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@forinda/video-sdk-sfu-livekit", () => ({
  defineSfuViewer: vi.fn(),
}));

import { defineSfuViewer } from "@forinda/video-sdk-sfu-livekit";
import { useSfuViewer } from "@/use-sfu-viewer.ts";

beforeEach(() => {
  vi.mocked(defineSfuViewer).mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("useSfuViewer", () => {
  it("constructs a viewer and auto-starts", async () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const fake = {
      state: "idle" as const,
      peerId: "bob",
      stream: null,
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        handlers.set(event, fn);
        return () => handlers.delete(event);
      }),
      start: vi.fn(async () => handlers.get("state")?.("connected")),
      stop: vi.fn(async () => {}),
    };
    vi.mocked(defineSfuViewer).mockReturnValue(fake as never);

    const { result } = renderHook(() =>
      useSfuViewer({
        url: "ws://x",
        token: "t",
        room: "demo",
        peerId: "bob",
        publisherId: "alice",
      }),
    );

    await waitFor(() => expect(result.current.viewer).not.toBeNull());
    await waitFor(() => expect(fake.start).toHaveBeenCalled());
  });
});
```

- [ ] **Step 7: Run the React suite**

```bash
pnpm --filter @forinda/video-sdk-react test
```

Expected: green.

- [ ] **Step 8: Commit**

```bash
git add packages/react/src/use-sfu-publisher.ts packages/react/src/use-sfu-viewer.ts packages/react/src/index.ts packages/react/package.json packages/react/test/unit/use-sfu-publisher.test.tsx packages/react/test/unit/use-sfu-viewer.test.tsx pnpm-lock.yaml
git commit -m "feat(react): useSfuPublisher + useSfuViewer (EPIC-14 #7/11)"
```

---

## Task 8: Vue `useSfuPublisher` + `useSfuViewer`

**Files:**

- Create: `packages/vue/src/use-sfu-publisher.ts`
- Create: `packages/vue/src/use-sfu-viewer.ts`
- Modify: `packages/vue/src/index.ts`
- Modify: `packages/vue/package.json`
- Test: `packages/vue/test/unit/use-sfu-publisher.test.ts`
- Test: `packages/vue/test/unit/use-sfu-viewer.test.ts`

- [ ] **Step 1: Add the workspace dep**

```bash
pnpm --filter @forinda/video-sdk-vue add -D @forinda/video-sdk-sfu-livekit@workspace:*
```

- [ ] **Step 2: Write `use-sfu-publisher.ts`**

```ts
/**
 * `useSfuPublisher` — Vue composable mirroring the React hook. SFU
 * media; SSR-safe; cleans up on `onScopeDispose`.
 */

import { onScopeDispose, ref, shallowRef, type Ref } from "vue";
import {
  defineSfuPublisher,
  type SfuConnectionState,
  type SfuPublisher,
  type SfuPublisherOptions,
} from "@forinda/video-sdk-sfu-livekit";
import type { SdkError } from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseSfuPublisherOptions extends Omit<SfuPublisherOptions, "stream"> {
  stream: MediaStream | null;
  autoStart?: boolean;
}

export interface UseSfuPublisherResult {
  publisher: Ref<SfuPublisher | null>;
  state: Ref<SfuConnectionState>;
  viewers: Ref<readonly string[]>;
  error: Ref<SdkError | null>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  replaceVideoTrack: (track: MediaStreamTrack) => Promise<void>;
  replaceAudioTrack: (track: MediaStreamTrack) => Promise<void>;
}

export function useSfuPublisher(opts: UseSfuPublisherOptions): UseSfuPublisherResult {
  const publisher = shallowRef<SfuPublisher | null>(null);
  const state = ref<SfuConnectionState>("idle");
  const viewers = shallowRef<readonly string[]>([]);
  const error = shallowRef<SdkError | null>(null);

  const autoStart = opts.autoStart ?? true;

  if (!isServer && opts.stream !== null) {
    const p = defineSfuPublisher({
      url: opts.url,
      token: opts.token,
      room: opts.room,
      peerId: opts.peerId,
      stream: opts.stream,
      ...(opts.retry !== undefined ? { retry: opts.retry } : {}),
      ...(opts.stats !== undefined ? { stats: opts.stats } : {}),
    });
    publisher.value = p;

    const offState = p.on("state", (s) => {
      state.value = s;
    });
    const offJoin = p.on("viewer-joined", () => {
      viewers.value = [...p.peers()];
    });
    const offLeave = p.on("viewer-left", () => {
      viewers.value = [...p.peers()];
    });
    const offError = p.on("error", (e) => {
      error.value = e;
    });

    if (autoStart) void p.start();

    onScopeDispose(() => {
      offState();
      offJoin();
      offLeave();
      offError();
      void p.stop();
      publisher.value = null;
    });
  }

  return {
    publisher,
    state,
    viewers,
    error,
    start: async () => {
      if (publisher.value) await publisher.value.start();
    },
    stop: async () => {
      if (publisher.value) await publisher.value.stop();
    },
    replaceVideoTrack: async (track) => {
      if (publisher.value) await publisher.value.replaceVideoTrack(track);
    },
    replaceAudioTrack: async (track) => {
      if (publisher.value) await publisher.value.replaceAudioTrack(track);
    },
  };
}
```

- [ ] **Step 3: Write `use-sfu-viewer.ts`**

```ts
/**
 * `useSfuViewer` — Vue composable; symmetric to `useSfuPublisher`.
 */

import { onScopeDispose, ref, shallowRef, type Ref } from "vue";
import {
  defineSfuViewer,
  type SfuConnectionState,
  type SfuViewer,
  type SfuViewerOptions,
} from "@forinda/video-sdk-sfu-livekit";
import type { SdkError } from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseSfuViewerOptions extends SfuViewerOptions {
  autoStart?: boolean;
}

export interface UseSfuViewerResult {
  viewer: Ref<SfuViewer | null>;
  state: Ref<SfuConnectionState>;
  stream: Ref<MediaStream | null>;
  error: Ref<SdkError | null>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useSfuViewer(opts: UseSfuViewerOptions): UseSfuViewerResult {
  const viewer = shallowRef<SfuViewer | null>(null);
  const state = ref<SfuConnectionState>("idle");
  const stream = shallowRef<MediaStream | null>(null);
  const error = shallowRef<SdkError | null>(null);

  const autoStart = opts.autoStart ?? true;

  if (!isServer) {
    const v = defineSfuViewer({
      url: opts.url,
      token: opts.token,
      room: opts.room,
      peerId: opts.peerId,
      publisherId: opts.publisherId,
      ...(opts.retry !== undefined ? { retry: opts.retry } : {}),
      ...(opts.stats !== undefined ? { stats: opts.stats } : {}),
    });
    viewer.value = v;

    const offState = v.on("state", (s) => {
      state.value = s;
    });
    const offTrack = v.on("track", ({ stream: s }) => {
      stream.value = s;
    });
    const offError = v.on("error", (e) => {
      error.value = e;
    });

    if (autoStart) void v.start();

    onScopeDispose(() => {
      offState();
      offTrack();
      offError();
      void v.stop();
      viewer.value = null;
    });
  }

  return {
    viewer,
    state,
    stream,
    error,
    start: async () => {
      if (viewer.value) await viewer.value.start();
    },
    stop: async () => {
      if (viewer.value) await viewer.value.stop();
    },
  };
}
```

- [ ] **Step 4: Re-export from `packages/vue/src/index.ts`**

Append to the existing exports:

```ts
export {
  useSfuPublisher,
  type UseSfuPublisherOptions,
  type UseSfuPublisherResult,
} from "./use-sfu-publisher.ts";
export {
  useSfuViewer,
  type UseSfuViewerOptions,
  type UseSfuViewerResult,
} from "./use-sfu-viewer.ts";
```

- [ ] **Step 5: Mock-based tests for both composables**

`packages/vue/test/unit/use-sfu-publisher.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { withScope } from "../_helpers/with-scope.ts";

vi.mock("@forinda/video-sdk-sfu-livekit", () => ({
  defineSfuPublisher: vi.fn(),
}));

import { defineSfuPublisher } from "@forinda/video-sdk-sfu-livekit";
import { useSfuPublisher } from "@/use-sfu-publisher.ts";

const fakeStream = (): MediaStream =>
  ({
    getTracks: () => [],
    getVideoTracks: () => [],
    getAudioTracks: () => [],
  }) as unknown as MediaStream;

describe("useSfuPublisher (Vue)", () => {
  it("constructs a publisher and auto-starts", async () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const fake = {
      state: "idle",
      peerId: "alice",
      peers: () => [],
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        handlers.set(event, fn);
        return () => handlers.delete(event);
      }),
      start: vi.fn(async () => handlers.get("state")?.("connected")),
      stop: vi.fn(async () => {}),
      replaceVideoTrack: vi.fn(async () => {}),
      replaceAudioTrack: vi.fn(async () => {}),
    };
    vi.mocked(defineSfuPublisher).mockReturnValue(fake as never);

    const { result, dispose } = withScope(() =>
      useSfuPublisher({
        url: "ws://x",
        token: "t",
        room: "demo",
        peerId: "alice",
        stream: fakeStream(),
      }),
    );

    expect(result.publisher.value).not.toBeNull();
    await Promise.resolve();
    expect(fake.start).toHaveBeenCalled();
    dispose();
  });
});
```

`packages/vue/test/unit/use-sfu-viewer.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { withScope } from "../_helpers/with-scope.ts";

vi.mock("@forinda/video-sdk-sfu-livekit", () => ({
  defineSfuViewer: vi.fn(),
}));

import { defineSfuViewer } from "@forinda/video-sdk-sfu-livekit";
import { useSfuViewer } from "@/use-sfu-viewer.ts";

describe("useSfuViewer (Vue)", () => {
  it("constructs a viewer and auto-starts", async () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const fake = {
      state: "idle",
      peerId: "bob",
      stream: null,
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        handlers.set(event, fn);
        return () => handlers.delete(event);
      }),
      start: vi.fn(async () => handlers.get("state")?.("connected")),
      stop: vi.fn(async () => {}),
    };
    vi.mocked(defineSfuViewer).mockReturnValue(fake as never);

    const { result, dispose } = withScope(() =>
      useSfuViewer({
        url: "ws://x",
        token: "t",
        room: "demo",
        peerId: "bob",
        publisherId: "alice",
      }),
    );

    expect(result.viewer.value).not.toBeNull();
    await Promise.resolve();
    expect(fake.start).toHaveBeenCalled();
    dispose();
  });
});
```

- [ ] **Step 6: Run the Vue suite**

```bash
pnpm --filter @forinda/video-sdk-vue test
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add packages/vue/src/use-sfu-publisher.ts packages/vue/src/use-sfu-viewer.ts packages/vue/src/index.ts packages/vue/package.json packages/vue/test/unit/use-sfu-publisher.test.ts packages/vue/test/unit/use-sfu-viewer.test.ts pnpm-lock.yaml
git commit -m "feat(vue): useSfuPublisher + useSfuViewer (EPIC-14 #8/11)"
```

---

## Task 9: SFU integration docs

**Files:**

- Create: `docs/sfu-integration.md`
- Modify: `README.md` (add link)

- [ ] **Step 1: Write `docs/sfu-integration.md`**

```markdown
# SFU integration

When mesh hits its ceiling (~6-8 viewers per publisher on residential uplinks), an SFU offloads the fan-out to a dedicated media server. The Forinda SDK ships a side-by-side LiveKit adapter so you can swap one factory call instead of rewriting your app.

## When to use SFU

| Scale / shape                               | Use                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| 1-on-1 / small group (≤ 6 peers, full mesh) | `definePublisher` / `defineViewer` over our WebSocket signaling.         |
| 1-publisher webinar (1 → N viewers)         | SFU. Mesh would force the publisher to upload N copies.                  |
| Town-hall (2-3 publishers, many viewers)    | SFU. Same reason.                                                        |
| Recording at scale, server-side             | SFU + LiveKit's egress (out of scope here — use LiveKit's API directly). |

## Two-transport model

The SFU adapter only handles **media** (publish + subscribe). Chat, presence, raise-hand, recording metadata, moderation — all of those continue to ride **our own WebSocket signaling** via `defineRoomChannel`. So a typical SFU app has two transports:
```

┌──────────────────────────┐
│ App │
│ │
│ defineSfuPublisher ───►│ ws://lk.example.com ←── LiveKit Cloud / self-host
│ │
│ defineRoomChannel ───►│ wss://signal.app/ws ←── Our signaling-server
│ defineRecorder │
└──────────────────────────┘

````

## Setting up LiveKit

1. **LiveKit Cloud** (zero ops): sign up at livekit.io, grab the websocket URL + API key/secret from the project dashboard.
2. **Self-host**: `docker run --rm -p 7880:7880 livekit/livekit-server --dev` for local; production deploy guide is in LiveKit's docs.

## Minting a token (server-side)

LiveKit uses JWTs scoped to (room, identity, permissions). Mint server-side:

```ts
// Node, in your auth handler
import { AccessToken } from "livekit-server-sdk";

const token = new AccessToken(process.env.LK_API_KEY, process.env.LK_API_SECRET, {
  identity: userId,
  ttl: 60 * 60, // 1 hour
});
token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
return token.toJwt();
````

The browser passes this JWT to `defineSfuPublisher({ token })` — never store the API secret in browser code.

## Publisher

```ts
import { defineSfuPublisher } from "@forinda/video-sdk-sfu-livekit";

const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
const publisher = defineSfuPublisher({
  url: "wss://my-project.livekit.cloud",
  token, // server-minted
  room: "webinar-2026",
  peerId: "host-alice",
  stream,
});
publisher.on("viewer-joined", ({ peerId }) => console.log("viewer:", peerId));
await publisher.start();
```

## Viewer

```ts
import { defineSfuViewer } from "@forinda/video-sdk-sfu-livekit";

const viewer = defineSfuViewer({
  url: "wss://my-project.livekit.cloud",
  token, // separate token, scoped to canSubscribe
  room: "webinar-2026",
  peerId: "viewer-bob",
  publisherId: "host-alice",
});
viewer.on("track", ({ stream }) => {
  document.querySelector("video").srcObject = stream;
});
await viewer.start();
```

## Adapter hooks

Same shapes as the mesh hooks, with `Sfu` in the name and the LiveKit-specific options (`url`, `token`):

```tsx
// React
import { useSfuPublisher, useSfuViewer } from "@forinda/video-sdk-react";

const { state, viewers } = useSfuPublisher({ url, token, room, peerId, stream });
const { stream } = useSfuViewer({ url, token, room, peerId, publisherId });
```

```ts
// Vue
import { useSfuPublisher, useSfuViewer } from "@forinda/video-sdk-vue";
```

## Wiring chat alongside SFU

The chat layer rides our own signaling — completely independent of LiveKit:

```ts
import { defineWebSocketSignaling, defineRoomChannel } from "@forinda/video-sdk-core";

const chatTransport = defineWebSocketSignaling({ url: "wss://signal.app/ws" });
const channel = defineRoomChannel({
  signaling: chatTransport,
  room: "webinar-2026", // same room id; different transport
  peerId: "host-alice",
});
await channel.start();
await channel.sendChat("hello room");
```

`peerId` and `room` should match between SFU and chat so your UI can map presence ↔ tracks consistently. The two services don't talk to each other; the app code is the bridge.

## Recording with SFU

`defineRecorder` is media-transport-agnostic — it records a `MediaStream`. With SFU, the publisher's `stream` is still the local one passed at construction:

```ts
const recorder = defineRecorder(stream, { timesliceMs: 1000 });
recorder.pipeTo(uploader);
recorder.start();
```

For server-side recording (composited output of all participants), use LiveKit's egress API directly — that's outside the SDK's scope.

## Mesh → SFU migration

A typical migration is one-line per call site:

```diff
-const publisher = definePublisher({ signaling, room, peerId, stream });
+const publisher = defineSfuPublisher({ url: LK_URL, token, room, peerId, stream });
```

The event surface (`state`, `viewer-joined`, `error`) is identical — your UI usually doesn't change. The biggest difference is that you now need a token-minting endpoint on your server.

## Bundle impact

`livekit-client` is ~150 KB minified. To keep it out of mesh-only consumers' bundles, it's a **peer dependency** — you opt in by installing it alongside `@forinda/video-sdk-sfu-livekit`:

```bash
pnpm add @forinda/video-sdk-sfu-livekit livekit-client
```

If you only use mesh, never install either and your bundle stays slim.

## Troubleshooting

| Code                 | Meaning                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `sfu_token_invalid`  | Token expired, malformed, or doesn't grant the requested room. Check the `AccessToken` minting code. |
| `sfu_connect_failed` | Couldn't reach the LiveKit websocket. Network / firewall / wrong URL.                                |
| `sfu_publish_failed` | `LocalParticipant.publishTrack` rejected. Usually codec or device permissions.                       |
| `sfu_disconnected`   | Room dropped mid-session. LiveKit handles its own reconnect; surface the error to the user.          |

````

- [ ] **Step 2: Link from root README**

In the "Documentation" section, add a fourth bullet:

```markdown
- **[`docs/sfu-integration.md`](docs/sfu-integration.md)** — when to use the LiveKit SFU adapter, two-transport model, mesh→SFU migration.
````

- [ ] **Step 3: Format**

```bash
pnpm format && pnpm format:check
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add docs/sfu-integration.md README.md
git commit -m "docs(EPIC-14): SFU integration guide (EPIC-14 #9/11)"
```

---

## Task 10: LiveKit SFU example app

**Files:**

- Create: `examples/livekit-sfu-publisher-viewer/package.json`
- Create: `examples/livekit-sfu-publisher-viewer/index.html`
- Create: `examples/livekit-sfu-publisher-viewer/vite.config.ts`
- Create: `examples/livekit-sfu-publisher-viewer/tsconfig.json`
- Create: `examples/livekit-sfu-publisher-viewer/src/main.tsx`
- Create: `examples/livekit-sfu-publisher-viewer/src/App.tsx`
- Create: `examples/livekit-sfu-publisher-viewer/README.md`
- Modify: root `package.json` — add `dev:sfu`

- [ ] **Step 1: Scaffold the example**

`examples/livekit-sfu-publisher-viewer/package.json`:

```json
{
  "name": "example-livekit-sfu-publisher-viewer",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": {
    "@forinda/video-sdk-core": "workspace:*",
    "@forinda/video-sdk-react": "workspace:*",
    "@forinda/video-sdk-sfu-livekit": "workspace:*",
    "livekit-client": "^2.18.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^6.0.0",
    "typescript": "^6.0.0",
    "vite": "^8.0.0"
  }
}
```

`examples/livekit-sfu-publisher-viewer/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>LiveKit SFU publisher / viewer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`examples/livekit-sfu-publisher-viewer/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5177, strictPort: true },
});
```

`examples/livekit-sfu-publisher-viewer/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"]
}
```

- [ ] **Step 2: Write the App**

`src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(<App />);
```

`src/App.tsx`:

```tsx
import { useState } from "react";
import { useSfuPublisher, useSfuViewer, useUserMedia, VideoView } from "@forinda/video-sdk-react";

const LK_URL = (import.meta.env.VITE_LK_URL as string) ?? "wss://your-project.livekit.cloud";
const ROOM = "sfu-demo";

export function App(): JSX.Element {
  const [role, setRole] = useState<"publisher" | "viewer" | null>(null);
  const [token, setToken] = useState("");
  const [pubId, setPubId] = useState("");

  return (
    <main style={style.main}>
      <h1>LiveKit SFU publisher / viewer</h1>
      <p style={style.note}>
        This example needs a LiveKit token (mint server-side; see{" "}
        <code>docs/sfu-integration.md</code>). Paste it below.
      </p>
      <textarea
        rows={3}
        cols={80}
        placeholder="Paste your LiveKit JWT here"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        style={style.token}
      />
      <div style={style.row}>
        <button onClick={() => setRole("publisher")} disabled={!token}>
          Publish
        </button>
        <input
          placeholder="publisher peerId"
          value={pubId}
          onChange={(e) => setPubId(e.target.value)}
        />
        <button onClick={() => setRole("viewer")} disabled={!token || !pubId}>
          View
        </button>
      </div>
      {role === "publisher" && <Publisher token={token} />}
      {role === "viewer" && <Viewer token={token} publisherId={pubId} />}
    </main>
  );
}

function Publisher({ token }: { token: string }): JSX.Element {
  const { stream } = useUserMedia({ audio: true, video: true });
  const { state, viewers, publisher } = useSfuPublisher({
    url: LK_URL,
    token,
    room: ROOM,
    peerId: "host-" + Date.now(),
    stream,
  });
  return (
    <section>
      <h2>Publisher</h2>
      <VideoView stream={stream} muted autoPlay playsInline mirror style={style.video} />
      <p>state: {state}</p>
      <p>viewers: {viewers.length}</p>
      <p>
        peerId: <code>{publisher?.peerId ?? "—"}</code>
      </p>
    </section>
  );
}

function Viewer({ token, publisherId }: { token: string; publisherId: string }): JSX.Element {
  const { state, stream } = useSfuViewer({
    url: LK_URL,
    token,
    room: ROOM,
    peerId: "viewer-" + Date.now(),
    publisherId,
  });
  return (
    <section>
      <h2>Viewer</h2>
      <VideoView stream={stream} autoPlay playsInline style={style.video} />
      <p>state: {state}</p>
    </section>
  );
}

const style = {
  main: { fontFamily: "system-ui", margin: "2rem" } as const,
  row: { display: "flex", gap: "0.5rem", margin: "1rem 0" } as const,
  video: { width: 480, maxWidth: "100%", background: "#111", borderRadius: 8 } as const,
  token: { fontFamily: "monospace", fontSize: 12, marginBottom: "1rem" } as const,
  note: { color: "#666", fontSize: 14 } as const,
};
```

- [ ] **Step 3: README**

`examples/livekit-sfu-publisher-viewer/README.md`:

```markdown
# example: LiveKit SFU publisher / viewer

React 18 + Vite + LiveKit demo using `useSfuPublisher` / `useSfuViewer` from `@forinda/video-sdk-react`.

## Run

1. Get a LiveKit URL + API key:
   - **Cloud (free tier):** sign up at livekit.io.
   - **Local:** `docker run --rm -p 7880:7880 livekit/livekit-server --dev`. URL becomes `ws://localhost:7880`.
2. Mint a token (Node, scoped to room + canPublish + canSubscribe — see `docs/sfu-integration.md`).
3. Set `VITE_LK_URL=wss://your-url` (or skip and edit `App.tsx`).
4. `pnpm dev:sfu`.
5. Open <http://127.0.0.1:5177> in two tabs. Paste tokens, choose roles, watch the video flow through LiveKit.

## What this demonstrates

- `useSfuPublisher({ url, token, room, peerId, stream })` — same hook shape as `usePublisher` for mesh.
- `useSfuViewer({ url, token, room, peerId, publisherId })` — auto-subscribes only to the named publisher.
- Two-transport model: chat / presence would ride our WebSocket signaling separately (not exercised in this minimal example).
```

- [ ] **Step 4: Add `dev:sfu` to root**

```json
"dev:sfu": "pnpm --filter example-livekit-sfu-publisher-viewer dev",
```

- [ ] **Step 5: Install + smoke-build**

```bash
pnpm install
pnpm --filter example-livekit-sfu-publisher-viewer build
```

Expected: clean build (no LiveKit credentials needed for the build step).

- [ ] **Step 6: Commit**

```bash
git add examples/livekit-sfu-publisher-viewer/ package.json pnpm-lock.yaml
git commit -m "feat(examples): LiveKit SFU publisher/viewer example (EPIC-14 #10/11)"
```

---

## Task 11: Workspace verify, README, changeset, tag

**Files:**

- Modify: `README.md` (Packages table + roadmap pointer)
- Create: `.changeset/sfu-livekit.md`

- [ ] **Step 1: Add the new package to the root README packages table**

Find the `Packages` table and append the SFU row in the right place (alphabetical-ish):

```markdown
| `@forinda/video-sdk-sfu-livekit` | LiveKit SFU adapter — same Publisher/Viewer surface, routed through LiveKit Cloud or self-host. |
```

Update the "Status & scope" paragraph if it still says "SFU integration is on the roadmap" — replace with "SFU integration ships via the optional `@forinda/video-sdk-sfu-livekit` adapter; mesh remains the default for ≤8-viewer rooms."

- [ ] **Step 2: Workspace verify**

```bash
pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && pnpm lint
```

(Browser + e2e excluded — they don't test SFU yet.) Expected: every step exits 0.

- [ ] **Step 3: Create the changeset**

`.changeset/sfu-livekit.md`:

```markdown
---
"@forinda/video-sdk-sfu-livekit": minor
"@forinda/video-sdk-react": minor
"@forinda/video-sdk-vue": minor
---

LiveKit SFU adapter (EPIC-14).

### Added

- **New package `@forinda/video-sdk-sfu-livekit`** — `defineSfuPublisher` / `defineSfuViewer` wrap `livekit-client` to expose the same Publisher / Viewer-shaped API as our mesh code, routed through a LiveKit SFU (Cloud or self-host) for >8-viewer rooms. `livekit-client` is a peer dependency so mesh-only consumers don't pay the bundle cost.
- **React adapter**: `useSfuPublisher` / `useSfuViewer` mirror `usePublisher` / `useViewer` shapes.
- **Vue adapter**: same composables for Vue 3.
- **Docs**: new `docs/sfu-integration.md` covering when to use SFU, the two-transport model (LiveKit for media + our WebSocket signaling for chat / presence / recording metadata), token minting, and mesh → SFU migration.
- **Example**: `examples/livekit-sfu-publisher-viewer/` — Vite + React + LiveKit demo.

### Rationale

Mesh tops out around 8 viewers per publisher on residential uplinks. Adopters running webinars / town-halls need SFU. Wrapping LiveKit (Apache-2 licensed, mature TS client, hosted + self-host options) gives them that with a one-line factory swap and no ecosystem lock-in — chat / presence / recording stay in our own layers.
```

- [ ] **Step 4: Commit + tag**

```bash
git add README.md .changeset/sfu-livekit.md
git commit -m "ci+docs+changeset for EPIC-14 SFU adapter (EPIC-14 #11/11)"
git tag -a v0.0.0-epic-14 -m "EPIC-14: LiveKit SFU adapter"
```

---

## Self-review notes

**Spec coverage** (vs. roadmap acceptance criteria for EPIC-14):

- ✅ SFU adapter lands as a new package — Tasks 1-6.
- ✅ Required for >~8 viewers per publisher — documented in `docs/sfu-integration.md`.
- ✅ Wrap one media server (LiveKit, picked for license + Cloud option) — Task 4 + 5.
- ✅ React + Vue adapter parity — Tasks 7 + 8.
- ✅ Documentation + example — Tasks 9 + 10.
- ✅ Workspace + CI all green — Task 11.

**Out of scope (explicit, documented in `docs/sfu-integration.md`):**

- Server-side recording (LiveKit egress) — adopters call LiveKit's API directly.
- Simulcast / SVC tuning — passthrough to client defaults.
- LiveKit-flavored chat / data channels — our chat layer remains the recommendation.
- Bridging our signaling to LiveKit's signaling — explicitly NOT building.

**Type consistency:**

- `SfuConnectionState` defined once; reused by publisher + viewer + adapter hooks.
- `SfuError` extends `SdkError` so `instanceof SdkError + e.code` works for both mesh and SFU consumers.
- React hook + Vue composable APIs match field-for-field.

**Placeholders:** none. Every step has concrete code or commands.

**Gotcha worth flagging:** the `__roomFactory` test seam in publisher / viewer is intentional — `livekit-client` makes WebSocket calls on import that would break unit tests. Don't remove it; if LiveKit ships a "test mode" later, swap to that.
