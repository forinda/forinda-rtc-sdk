# EPIC-2: `signaling-protocol` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@forinda/video-sdk-signaling-protocol` — a pure, transport-agnostic WebRTC signaling protocol engine with the canonical wire-format zod schemas. Both the browser core and every server adapter will depend on this package as the single source of truth for messages and routing logic.

**Architecture:** Two layers. (1) **Wire format** — zod-validated discriminated-union of 6 message types (`join`, `leave`, `peer-joined`, `peer-left`, `sdp`, `ice`), exported as both runtime schemas and inferred TS types. (2) **Engine** — `SignalingEngine` config holder that produces `Session` runtime instances. A `Session` accepts external transport events (`handleConnection`, `handleMessage`, `handleDisconnect`) and emits "send this message to this peer ID" instructions via a registered `onSend` callback. The Session owns rooms and peer state in memory; the engine owns policy (auth, limits). No I/O of any kind happens inside this package — adapters wire it up to real sockets.

**Tech Stack:** TypeScript 6, ESM, zod 3, Vitest 2 + jsdom (jsdom not used here but consistent across packages), oxlint + oxfmt, wireit, tsup. Already-scaffolded package at `packages/signaling-protocol/` (EPIC-1 baseline tag `v0.0.0-foundation`).

**Spec reference:** `docs/superpowers/specs/2026-05-02-video-sdk-design.md` — Section 7 (signaling protocol + wire format), Section 10 (errors), Section 12 (testing).

**Definition of done:**

- All 16 tasks completed with their tests passing.
- `pnpm --filter @forinda/video-sdk-signaling-protocol build` exits 0; emits banner-stamped `dist/index.js` + `dist/index.d.ts`.
- `pnpm --filter @forinda/video-sdk-signaling-protocol typecheck` exits 0.
- `pnpm --filter @forinda/video-sdk-signaling-protocol test` exits 0.
- `pnpm --filter @forinda/video-sdk-signaling-protocol lint` exits 0 (oxlint + oxfmt).
- Coverage on `src/` ≥ 90% lines (verified locally; CI gating added in EPIC-9).
- Public surface in `src/index.ts` matches spec Section 7 and is consumed cleanly from a smoke test.
- Repo is tagged `v0.0.0-epic-2`.

**Documentation convention (applies to every source file in this epic):**

Every `src/*.ts` file gets:

1. A **file-header JSDoc block** at the top explaining what the file owns, why it exists separately from siblings, and any non-obvious invariants.
2. A **JSDoc comment on every exported symbol** (class, function, type, const). Document the _why_ and the _contract_, not the _what_ — names already say what.
3. A **JSDoc comment on every public method** of exported classes — capture preconditions, return-value semantics, and error conditions.

This is a deliberate departure from the default "no comments" stance because the codebase will be read by future agents and contributors who lack the conversation history. Inline docs anchor that future reading. JSDoc-style is preferred (renders in IDE tooltips). Internal helpers used in only one file may skip the JSDoc.

**Tooling note:** `tsconfig.base.json` enables `allowImportingTsExtensions: true` (TS 6 requirement when source files import each other with explicit `.ts` extensions). All package tsconfigs already set `noEmit: true`, which satisfies the flag's compatibility constraint. tsup ignores the extension at build time and emits `.js` references in dist.

**Out of scope (deferred to later epics):**

- Authentication beyond pluggable callback (JWT verification, OAuth) → EPIC-4 server adapters wire any auth they want.
- Persistence / horizontal-scale (Redis, Durable Objects) → out of v0.1.0.
- HTTP / WebSocket transport code → EPIC-4 (`signaling-adapter-*` packages).
- Browser-side `SignalingTransport` interface and adapters → EPIC-3 (`@forinda/video-sdk-core` re-exports types from this package; transport adapters live in EPIC-4).

---

## File structure created by this epic

```
packages/signaling-protocol/
  src/
    index.ts                    # public surface — re-exports only
    messages.ts                 # zod schemas + inferred types for the 6 wire-format messages
    errors.ts                   # SignalingProtocolError hierarchy
    rooms.ts                    # Room class (per-room peer registry)
    session.ts                  # Session class (per-process runtime)
    engine.ts                   # SignalingEngine class (config + session factory)
    types.ts                    # shared type aliases (PeerId, SocketId, RoomId, etc.)
  test/
    unit/
      messages.test.ts          # wire-format validation
      errors.test.ts            # error class shapes + codes
      rooms.test.ts             # Room add/remove/full/lookup
      session-construction.test.ts
      session-connection.test.ts
      session-join-room.test.ts
      session-leave-room.test.ts
      session-sdp.test.ts
      session-ice.test.ts
      session-disconnect.test.ts
      session-authenticate.test.ts
      session-max-peers.test.ts
      session-peer-not-found.test.ts
      engine.test.ts
      smoke.test.ts             # imports public surface, end-to-end happy path
  vitest.config.ts              # test config
  package.json                  # add test scripts + vitest dev dep
  README.md                     # update from EPIC-1 stub
```

**File responsibilities:**

| File               | Owns                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `messages.ts`      | All wire-format zod schemas + inferred types. Single source of truth. Re-exported from `index.ts` and consumed by `core` later.                                              |
| `errors.ts`        | `SignalingProtocolError` (abstract root) + 4 concrete subclasses with stable `code` strings. Each carries `cause` + `context`.                                               |
| `rooms.ts`         | `Room` class — pure data structure. Add/remove peers, look up by id, check capacity. No event emission.                                                                      |
| `session.ts`       | `Session` class — owns the rooms map + socket→peer index. Implements `handleConnection`, `handleMessage`, `handleDisconnect`, `onSend`. Stateful but synchronous; no timers. |
| `engine.ts`        | `SignalingEngine` class — holds config (auth, maxPeers). One method: `openSession()`. Sessions are independent.                                                              |
| `types.ts`         | `PeerId`, `SocketId`, `RoomId`, `SocketInfo`, `SendHandler`, `RoomSnapshot`.                                                                                                 |
| `index.ts`         | Re-exports only. No logic.                                                                                                                                                   |
| `vitest.config.ts` | `test.environment: 'node'`, `test.coverage: { provider: 'v8', reporter: ['text', 'html'] }`, `test.include: ['test/**/*.test.ts']`.                                          |

---

## Pre-flight (do once before starting Task 1)

- [ ] **Verify clean baseline:**

```bash
cd /home/forinda/dev/open-source/forinda-video-sdk
git status                       # expected: clean
git log --oneline -1             # expected: HEAD at 6597a70 or descendant; tag v0.0.0-foundation present nearby
pnpm install --frozen-lockfile
pnpm --filter @forinda/video-sdk-signaling-protocol build typecheck lint
```

Expected: all green; package builds the empty stub. If anything fails, stop and fix before starting EPIC-2.

---

## Task 1: Set up Vitest in `signaling-protocol`

**Files:**

- Create: `packages/signaling-protocol/vitest.config.ts`
- Modify: `packages/signaling-protocol/package.json` (add deps + scripts + wireit `test` target)

- [ ] **Step 1: Add Vitest as a dev dep**

```bash
cd /home/forinda/dev/open-source/forinda-video-sdk
pnpm --filter @forinda/video-sdk-signaling-protocol add -D vitest@^2.1.0 @vitest/coverage-v8@^2.1.0
```

Expected: lockfile updated, `vitest` + `@vitest/coverage-v8` listed in `packages/signaling-protocol/package.json` `devDependencies`.

- [ ] **Step 2: Create `packages/signaling-protocol/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
```

- [ ] **Step 3: Update `packages/signaling-protocol/package.json` `scripts` and `wireit` to add `test`**

Modify the `scripts` block to include `test`:

```jsonc
"scripts": {
  "build": "wireit",
  "typecheck": "wireit",
  "lint": "wireit",
  "test": "wireit",
  "test:coverage": "vitest run --coverage"
}
```

Add the `test` entry inside `wireit` (after the existing `lint` block):

```jsonc
"test": {
  "command": "vitest run",
  "files": [
    "src/**/*.ts",
    "test/**/*.ts",
    "vitest.config.ts",
    "tsconfig.json",
    "../../tsconfig.base.json"
  ],
  "output": []
}
```

- [ ] **Step 4: Add a placeholder test so the runner has something to do**

Create `packages/signaling-protocol/test/unit/sanity.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("sanity", () => {
  it("runs", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 5: Run tests to verify the runner is wired**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: `1 passed`, exit 0.

- [ ] **Step 6: Run lint + format to confirm new files pass**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: both exit 0. If `format:check` complains about the new files, run `pnpm format` and re-check.

- [ ] **Step 7: Commit**

```bash
git add packages/signaling-protocol/ pnpm-lock.yaml
git commit -m "test(signaling-protocol): wire vitest with coverage thresholds"
```

---

## Task 2: Wire-format messages (zod schemas + inferred types)

**Files:**

- Create: `packages/signaling-protocol/src/messages.ts`
- Create: `packages/signaling-protocol/test/unit/messages.test.ts`
- Delete: `packages/signaling-protocol/test/unit/sanity.test.ts` (replaced)

Spec reference: design doc Section 7 — Wire format.

- [ ] **Step 1: Write the failing test**

Create `packages/signaling-protocol/test/unit/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  IceCand,
  JoinRoom,
  LeaveRoom,
  PeerJoined,
  PeerLeft,
  Sdp,
  SignalingMessage,
  type SignalingMessageType,
} from "../../src/messages.ts";

describe("wire format", () => {
  describe("JoinRoom", () => {
    it("parses a valid publisher join", () => {
      const result = JoinRoom.parse({
        type: "join",
        room: "demo-room",
        peer: "alice",
        role: "publisher",
      });
      expect(result.type).toBe("join");
      expect(result.role).toBe("publisher");
    });

    it("parses a valid viewer join", () => {
      const result = JoinRoom.parse({
        type: "join",
        room: "demo",
        peer: "bob",
        role: "viewer",
      });
      expect(result.role).toBe("viewer");
    });

    it("rejects unknown role", () => {
      expect(() =>
        JoinRoom.parse({ type: "join", room: "r", peer: "p", role: "spectator" }),
      ).toThrow();
    });

    it("rejects empty room id", () => {
      expect(() =>
        JoinRoom.parse({ type: "join", room: "", peer: "p", role: "publisher" }),
      ).toThrow();
    });

    it("rejects peer id over 128 chars", () => {
      const longPeer = "p".repeat(129);
      expect(() =>
        JoinRoom.parse({ type: "join", room: "r", peer: longPeer, role: "publisher" }),
      ).toThrow();
    });
  });

  describe("LeaveRoom", () => {
    it("parses a valid leave", () => {
      const result = LeaveRoom.parse({ type: "leave", room: "r", peer: "p" });
      expect(result.type).toBe("leave");
    });
  });

  describe("PeerJoined", () => {
    it("parses a valid peer-joined notification", () => {
      const result = PeerJoined.parse({ type: "peer-joined", peer: "p", role: "publisher" });
      expect(result.type).toBe("peer-joined");
    });
  });

  describe("PeerLeft", () => {
    it("parses a valid peer-left notification", () => {
      const result = PeerLeft.parse({ type: "peer-left", peer: "p" });
      expect(result.type).toBe("peer-left");
    });
  });

  describe("Sdp", () => {
    it("parses a valid offer", () => {
      const result = Sdp.parse({
        type: "sdp",
        from: "alice",
        to: "bob",
        sdp: { type: "offer", sdp: "v=0\r\n..." },
      });
      expect(result.sdp.type).toBe("offer");
    });

    it("parses a valid answer", () => {
      const result = Sdp.parse({
        type: "sdp",
        from: "bob",
        to: "alice",
        sdp: { type: "answer", sdp: "v=0\r\n..." },
      });
      expect(result.sdp.type).toBe("answer");
    });

    it("rejects unknown sdp type", () => {
      expect(() =>
        Sdp.parse({
          type: "sdp",
          from: "a",
          to: "b",
          sdp: { type: "rollback", sdp: "" },
        }),
      ).toThrow();
    });
  });

  describe("IceCand", () => {
    it("parses a candidate with object payload", () => {
      const result = IceCand.parse({
        type: "ice",
        from: "a",
        to: "b",
        candidate: { candidate: "candidate:...", sdpMid: "0", sdpMLineIndex: 0 },
      });
      expect(result.type).toBe("ice");
    });

    it("allows null candidate (end-of-candidates marker)", () => {
      const result = IceCand.parse({ type: "ice", from: "a", to: "b", candidate: null });
      expect(result.candidate).toBeNull();
    });
  });

  describe("SignalingMessage discriminated union", () => {
    it("routes join via discriminator", () => {
      const result = SignalingMessage.parse({
        type: "join",
        room: "r",
        peer: "p",
        role: "publisher",
      });
      expect(result.type).toBe("join");
    });

    it("rejects unknown type", () => {
      expect(() => SignalingMessage.parse({ type: "broadcast", payload: {} })).toThrow();
    });

    it("exports the union type alias", () => {
      const sample: SignalingMessageType = {
        type: "leave",
        room: "r",
        peer: "p",
      };
      expect(sample.type).toBe("leave");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: FAIL with "Cannot find module '../../src/messages.ts'".

- [ ] **Step 3: Implement `packages/signaling-protocol/src/messages.ts`**

```ts
import { z } from "zod";

export const PeerId = z.string().min(1).max(128);
export const RoomId = z.string().min(1).max(128);

export const Role = z.enum(["publisher", "viewer"]);

export const JoinRoom = z.object({
  type: z.literal("join"),
  room: RoomId,
  peer: PeerId,
  role: Role,
});

export const LeaveRoom = z.object({
  type: z.literal("leave"),
  room: RoomId,
  peer: PeerId,
});

export const PeerJoined = z.object({
  type: z.literal("peer-joined"),
  peer: PeerId,
  role: Role,
});

export const PeerLeft = z.object({
  type: z.literal("peer-left"),
  peer: PeerId,
});

export const Sdp = z.object({
  type: z.literal("sdp"),
  from: PeerId,
  to: PeerId,
  sdp: z.object({
    type: z.enum(["offer", "answer"]),
    sdp: z.string(),
  }),
});

export const IceCand = z.object({
  type: z.literal("ice"),
  from: PeerId,
  to: PeerId,
  // RTCIceCandidateInit is structurally permissive; null marks end-of-candidates.
  candidate: z.union([z.record(z.unknown()), z.null()]),
});

export const SignalingMessage = z.discriminatedUnion("type", [
  JoinRoom,
  LeaveRoom,
  PeerJoined,
  PeerLeft,
  Sdp,
  IceCand,
]);

export type PeerIdValue = z.infer<typeof PeerId>;
export type RoomIdValue = z.infer<typeof RoomId>;
export type RoleValue = z.infer<typeof Role>;
export type JoinRoomMessage = z.infer<typeof JoinRoom>;
export type LeaveRoomMessage = z.infer<typeof LeaveRoom>;
export type PeerJoinedMessage = z.infer<typeof PeerJoined>;
export type PeerLeftMessage = z.infer<typeof PeerLeft>;
export type SdpMessage = z.infer<typeof Sdp>;
export type IceCandMessage = z.infer<typeof IceCand>;
export type SignalingMessageType = z.infer<typeof SignalingMessage>;
```

- [ ] **Step 4: Delete the placeholder sanity test**

```bash
rm packages/signaling-protocol/test/unit/sanity.test.ts
```

- [ ] **Step 5: Run tests to verify pass**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: all message tests pass, exit 0.

- [ ] **Step 6: Run typecheck + lint + format**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: all exit 0. If format check fails, run `pnpm format` first, then re-check.

- [ ] **Step 7: Commit**

```bash
git add packages/signaling-protocol/
git commit -m "feat(signaling-protocol): add zod wire-format schemas for 6 message types"
```

---

## Task 3: Error hierarchy

**Files:**

- Create: `packages/signaling-protocol/src/errors.ts`
- Create: `packages/signaling-protocol/test/unit/errors.test.ts`

Spec reference: design doc Section 10. signaling-protocol owns the **protocol-layer** errors only; broader SDK errors (`PermissionDeniedError`, `IceFailedError`, etc.) live in `core` (EPIC-3).

- [ ] **Step 1: Write the failing test**

Create `packages/signaling-protocol/test/unit/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PeerNotFoundError,
  RoomFullError,
  SignalingAuthError,
  SignalingProtocolError,
  SignalingValidationError,
} from "../../src/errors.ts";

describe("SignalingProtocolError hierarchy", () => {
  it("SignalingProtocolError carries code, cause, context", () => {
    const cause = new Error("underlying");
    const err = new SignalingProtocolError("boom", {
      code: "protocol_error",
      cause,
      context: { room: "r" },
    });
    expect(err.message).toBe("boom");
    expect(err.code).toBe("protocol_error");
    expect(err.cause).toBe(cause);
    expect(err.context).toEqual({ room: "r" });
    expect(err.name).toBe("SignalingProtocolError");
    expect(err).toBeInstanceOf(Error);
  });

  it("SignalingValidationError has stable code", () => {
    const err = new SignalingValidationError("bad message", { context: { raw: "{}" } });
    expect(err.code).toBe("signaling_validation");
    expect(err).toBeInstanceOf(SignalingProtocolError);
  });

  it("SignalingAuthError has stable code", () => {
    const err = new SignalingAuthError("rejected", { context: { peer: "alice" } });
    expect(err.code).toBe("signaling_auth");
    expect(err).toBeInstanceOf(SignalingProtocolError);
  });

  it("RoomFullError has stable code and exposes capacity", () => {
    const err = new RoomFullError("room demo full", {
      context: { room: "demo", capacity: 50 },
    });
    expect(err.code).toBe("room_full");
    expect(err).toBeInstanceOf(SignalingProtocolError);
  });

  it("PeerNotFoundError has stable code and exposes peerId", () => {
    const err = new PeerNotFoundError("peer alice not in room", {
      context: { peer: "alice", room: "demo" },
    });
    expect(err.code).toBe("peer_not_found");
    expect(err).toBeInstanceOf(SignalingProtocolError);
  });

  it("all subclasses survive instanceof through transpilation", () => {
    // Sanity: verify ES2022 Error subclassing works (no babel-style prototype loss).
    const e1 = new RoomFullError("x", { context: { room: "r", capacity: 1 } });
    expect(e1 instanceof RoomFullError).toBe(true);
    expect(e1 instanceof SignalingProtocolError).toBe(true);
    expect(e1 instanceof Error).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: FAIL with "Cannot find module '../../src/errors.ts'".

- [ ] **Step 3: Implement `packages/signaling-protocol/src/errors.ts`**

```ts
export interface SignalingErrorOptions {
  code?: string;
  cause?: unknown;
  context?: Record<string, unknown>;
}

export class SignalingProtocolError extends Error {
  readonly code: string;
  override readonly cause?: unknown;
  readonly context?: Record<string, unknown>;

  constructor(message: string, opts: SignalingErrorOptions = {}) {
    super(message);
    this.name = "SignalingProtocolError";
    this.code = opts.code ?? "signaling_protocol_error";
    if (opts.cause !== undefined) this.cause = opts.cause;
    if (opts.context !== undefined) this.context = opts.context;
  }
}

export class SignalingValidationError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "signaling_validation" });
    this.name = "SignalingValidationError";
  }
}

export class SignalingAuthError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "signaling_auth" });
    this.name = "SignalingAuthError";
  }
}

export class RoomFullError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "room_full" });
    this.name = "RoomFullError";
  }
}

export class PeerNotFoundError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "peer_not_found" });
    this.name = "PeerNotFoundError";
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: all error tests pass.

- [ ] **Step 5: Run typecheck + lint + format**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: exit 0 (run `pnpm format` if needed, then re-check).

- [ ] **Step 6: Commit**

```bash
git add packages/signaling-protocol/
git commit -m "feat(signaling-protocol): add SignalingProtocolError hierarchy with stable codes"
```

---

## Task 4: `Room` class — per-room peer registry

**Files:**

- Create: `packages/signaling-protocol/src/types.ts`
- Create: `packages/signaling-protocol/src/rooms.ts`
- Create: `packages/signaling-protocol/test/unit/rooms.test.ts`

The `Room` is a pure data structure: a map of peer IDs to entries. No event emission, no broadcasting. Ownership of broadcasting lives in `Session`.

- [ ] **Step 1: Create the types file (will grow over later tasks)**

Create `packages/signaling-protocol/src/types.ts`:

```ts
import type { RoleValue, SignalingMessageType } from "./messages.ts";

export type PeerId = string;
export type RoomId = string;
export type SocketId = string;

export interface RoomPeer {
  readonly peerId: PeerId;
  readonly socketId: SocketId;
  readonly role: RoleValue;
}

export interface RoomSnapshot {
  readonly roomId: RoomId;
  readonly peers: readonly RoomPeer[];
}

export type SendHandler = (peerId: PeerId, message: SignalingMessageType) => void | Promise<void>;
```

- [ ] **Step 2: Write the failing Room tests**

Create `packages/signaling-protocol/test/unit/rooms.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RoomFullError } from "../../src/errors.ts";
import { Room } from "../../src/rooms.ts";

const peer = (
  peerId: string,
  socketId = `s-${peerId}`,
  role: "publisher" | "viewer" = "publisher",
) => ({
  peerId,
  socketId,
  role,
});

describe("Room", () => {
  it("starts empty", () => {
    const room = new Room("demo", { capacity: 10 });
    expect(room.id).toBe("demo");
    expect(room.size).toBe(0);
    expect(room.peers()).toEqual([]);
  });

  it("adds a peer", () => {
    const room = new Room("demo", { capacity: 10 });
    room.add(peer("alice"));
    expect(room.size).toBe(1);
    expect(room.has("alice")).toBe(true);
    expect(room.peers().map((p) => p.peerId)).toEqual(["alice"]);
  });

  it("removes a peer by id", () => {
    const room = new Room("demo", { capacity: 10 });
    room.add(peer("alice"));
    room.add(peer("bob"));
    const removed = room.remove("alice");
    expect(removed?.peerId).toBe("alice");
    expect(room.size).toBe(1);
    expect(room.has("alice")).toBe(false);
  });

  it("removeBySocket finds peer by socketId", () => {
    const room = new Room("demo", { capacity: 10 });
    room.add(peer("alice", "socket-1"));
    const removed = room.removeBySocket("socket-1");
    expect(removed?.peerId).toBe("alice");
    expect(room.size).toBe(0);
  });

  it("removeBySocket returns undefined when no match", () => {
    const room = new Room("demo", { capacity: 10 });
    expect(room.removeBySocket("nope")).toBeUndefined();
  });

  it("add throws RoomFullError when capacity reached", () => {
    const room = new Room("demo", { capacity: 2 });
    room.add(peer("a"));
    room.add(peer("b"));
    expect(() => room.add(peer("c"))).toThrow(RoomFullError);
  });

  it("add replaces an existing peer with the same id (rejoin)", () => {
    const room = new Room("demo", { capacity: 10 });
    room.add(peer("alice", "socket-1", "publisher"));
    room.add(peer("alice", "socket-2", "viewer"));
    expect(room.size).toBe(1);
    expect(room.get("alice")?.socketId).toBe("socket-2");
    expect(room.get("alice")?.role).toBe("viewer");
  });

  it("peers() returns a readonly snapshot, not the live map", () => {
    const room = new Room("demo", { capacity: 10 });
    room.add(peer("alice"));
    const snap = room.peers();
    room.add(peer("bob"));
    expect(snap).toHaveLength(1);
  });

  it("isFull reflects current size", () => {
    const room = new Room("demo", { capacity: 2 });
    expect(room.isFull()).toBe(false);
    room.add(peer("a"));
    expect(room.isFull()).toBe(false);
    room.add(peer("b"));
    expect(room.isFull()).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: FAIL with "Cannot find module '../../src/rooms.ts'".

- [ ] **Step 4: Implement `packages/signaling-protocol/src/rooms.ts`**

```ts
import { RoomFullError } from "./errors.ts";
import type { PeerId, RoomId, RoomPeer, SocketId } from "./types.ts";

export interface RoomOptions {
  capacity: number;
}

export class Room {
  readonly id: RoomId;
  private readonly capacity: number;
  private readonly peerMap = new Map<PeerId, RoomPeer>();

  constructor(id: RoomId, opts: RoomOptions) {
    this.id = id;
    this.capacity = opts.capacity;
  }

  get size(): number {
    return this.peerMap.size;
  }

  isFull(): boolean {
    return this.peerMap.size >= this.capacity;
  }

  has(peerId: PeerId): boolean {
    return this.peerMap.has(peerId);
  }

  get(peerId: PeerId): RoomPeer | undefined {
    return this.peerMap.get(peerId);
  }

  peers(): readonly RoomPeer[] {
    return [...this.peerMap.values()];
  }

  add(peer: RoomPeer): void {
    if (!this.peerMap.has(peer.peerId) && this.peerMap.size >= this.capacity) {
      throw new RoomFullError(`room ${this.id} is full (capacity ${this.capacity})`, {
        context: { room: this.id, capacity: this.capacity },
      });
    }
    this.peerMap.set(peer.peerId, peer);
  }

  remove(peerId: PeerId): RoomPeer | undefined {
    const existing = this.peerMap.get(peerId);
    if (existing === undefined) return undefined;
    this.peerMap.delete(peerId);
    return existing;
  }

  removeBySocket(socketId: SocketId): RoomPeer | undefined {
    for (const peer of this.peerMap.values()) {
      if (peer.socketId === socketId) {
        this.peerMap.delete(peer.peerId);
        return peer;
      }
    }
    return undefined;
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: all rooms tests + earlier tests pass.

- [ ] **Step 6: Run typecheck + lint + format**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/signaling-protocol/
git commit -m "feat(signaling-protocol): add Room class with capacity enforcement"
```

---

## Task 5: `Session` skeleton — construction + `onSend` registration + `handleConnection`

**Files:**

- Create: `packages/signaling-protocol/src/session.ts`
- Create: `packages/signaling-protocol/test/unit/session-construction.test.ts`
- Create: `packages/signaling-protocol/test/unit/session-connection.test.ts`

This task lays down the Session skeleton. Subsequent tasks add `handleMessage` cases.

- [ ] **Step 1: Write the failing construction test**

Create `packages/signaling-protocol/test/unit/session-construction.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { Session } from "../../src/session.ts";

describe("Session — construction and onSend", () => {
  it("constructs with default options", () => {
    const session = new Session();
    expect(session.socketCount()).toBe(0);
    expect(session.rooms()).toEqual([]);
  });

  it("accepts maxPeersPerRoom and authenticate options", () => {
    const session = new Session({
      maxPeersPerRoom: 4,
      authenticate: async () => true,
    });
    expect(session.socketCount()).toBe(0);
  });

  it("onSend registers and returns an unsubscribe", () => {
    const session = new Session();
    const handler = vi.fn();
    const off = session.onSend(handler);
    expect(typeof off).toBe("function");
    off();
    // re-register after unsubscribe
    const off2 = session.onSend(handler);
    expect(typeof off2).toBe("function");
  });

  it("throws when more than one onSend is registered", () => {
    const session = new Session();
    session.onSend(vi.fn());
    expect(() => session.onSend(vi.fn())).toThrow(/onSend/);
  });
});
```

- [ ] **Step 2: Write the failing connection test**

Create `packages/signaling-protocol/test/unit/session-connection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Session } from "../../src/session.ts";

describe("Session.handleConnection", () => {
  it("registers a socket", async () => {
    const session = new Session();
    await session.handleConnection("socket-1", {});
    expect(session.socketCount()).toBe(1);
  });

  it("is idempotent for the same socketId", async () => {
    const session = new Session();
    await session.handleConnection("socket-1", {});
    await session.handleConnection("socket-1", { token: "abc" });
    expect(session.socketCount()).toBe(1);
  });

  it("stores the token for later auth checks", async () => {
    const session = new Session();
    await session.handleConnection("socket-1", { token: "jwt.here" });
    // No public reader for token — verify indirectly when authenticate runs (Task 11).
    expect(session.socketCount()).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: FAIL with "Cannot find module '../../src/session.ts'".

- [ ] **Step 4: Implement `packages/signaling-protocol/src/session.ts`**

```ts
import type { PeerId, RoomSnapshot, SendHandler, SocketId } from "./types.ts";

export type AuthenticateFn = (
  token: string | undefined,
  room: string,
) => boolean | Promise<boolean>;

export interface SessionOptions {
  maxPeersPerRoom?: number;
  authenticate?: AuthenticateFn;
}

export interface SocketInfo {
  token?: string;
}

interface SocketRecord extends SocketInfo {
  socketId: SocketId;
  /** populated once the socket joins a room */
  peerId?: PeerId;
  roomId?: string;
}

export const DEFAULT_MAX_PEERS_PER_ROOM = 50;

export class Session {
  private readonly maxPeersPerRoom: number;
  private readonly authenticate?: AuthenticateFn;
  private readonly sockets = new Map<SocketId, SocketRecord>();
  private sendHandler?: SendHandler;

  constructor(opts: SessionOptions = {}) {
    this.maxPeersPerRoom = opts.maxPeersPerRoom ?? DEFAULT_MAX_PEERS_PER_ROOM;
    this.authenticate = opts.authenticate;
  }

  socketCount(): number {
    return this.sockets.size;
  }

  rooms(): readonly RoomSnapshot[] {
    // Filled in by Task 6+ once rooms exist.
    return [];
  }

  onSend(handler: SendHandler): () => void {
    if (this.sendHandler !== undefined) {
      throw new Error("onSend handler already registered; call the returned unsubscribe first");
    }
    this.sendHandler = handler;
    return () => {
      if (this.sendHandler === handler) {
        this.sendHandler = undefined;
      }
    };
  }

  async handleConnection(socketId: SocketId, info: SocketInfo): Promise<void> {
    const existing = this.sockets.get(socketId);
    if (existing !== undefined) {
      // idempotent — update token if newly provided
      if (info.token !== undefined) existing.token = info.token;
      return;
    }
    const record: SocketRecord = { socketId };
    if (info.token !== undefined) record.token = info.token;
    this.sockets.set(socketId, record);
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: all session-construction + session-connection tests pass.

- [ ] **Step 6: Run typecheck + lint + format**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/signaling-protocol/
git commit -m "feat(signaling-protocol): add Session skeleton with onSend and handleConnection"
```

---

## Task 6: `handleMessage(JoinRoom)` — joins room + broadcasts `peer-joined`

**Files:**

- Modify: `packages/signaling-protocol/src/session.ts`
- Create: `packages/signaling-protocol/test/unit/session-join-room.test.ts`

JoinRoom is the most important message. After this task, the engine can route real WebRTC signaling.

- [ ] **Step 1: Write the failing JoinRoom test**

Create `packages/signaling-protocol/test/unit/session-join-room.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { SignalingValidationError } from "../../src/errors.ts";
import { Session } from "../../src/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });

describe("Session.handleMessage — join", () => {
  it("parses a valid join and registers the peer in the room", async () => {
    const session = new Session();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-1", {});
    await session.handleMessage("socket-1", join("demo", "alice"));

    const rooms = session.rooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.roomId).toBe("demo");
    expect(rooms[0]?.peers).toHaveLength(1);
    expect(rooms[0]?.peers[0]?.peerId).toBe("alice");
    expect(rooms[0]?.peers[0]?.role).toBe("publisher");
  });

  it("broadcasts peer-joined to existing peers (not to the joiner)", async () => {
    const session = new Session();
    const send = vi.fn();
    session.onSend(send);

    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));

    send.mockClear(); // ignore alice's own join — no peers to notify yet

    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("alice", {
      type: "peer-joined",
      peer: "bob",
      role: "viewer",
    });
  });

  it("also sends peer-joined for each existing peer back to the joiner", async () => {
    const session = new Session();
    const send = vi.fn();
    session.onSend(send);

    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice", "publisher"));
    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));

    // bob should have been told about alice
    expect(send).toHaveBeenCalledWith("bob", {
      type: "peer-joined",
      peer: "alice",
      role: "publisher",
    });
  });

  it("rejects JSON that fails zod validation with SignalingValidationError", async () => {
    const session = new Session();
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", {});
    await expect(session.handleMessage("socket-1", '{"type":"join"}')).rejects.toBeInstanceOf(
      SignalingValidationError,
    );
  });

  it("rejects malformed JSON with SignalingValidationError", async () => {
    const session = new Session();
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", {});
    await expect(session.handleMessage("socket-1", "not json")).rejects.toBeInstanceOf(
      SignalingValidationError,
    );
  });

  it("rejects messages from unknown sockets", async () => {
    const session = new Session();
    session.onSend(vi.fn());
    await expect(
      session.handleMessage("ghost-socket", join("demo", "alice")),
    ).rejects.toBeInstanceOf(SignalingValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: FAIL with "Cannot read property 'roomId'..." or similar — `handleMessage` doesn't exist yet.

- [ ] **Step 3: Implement `handleMessage` + JoinRoom branch in `packages/signaling-protocol/src/session.ts`**

Replace the entire file with:

```ts
import { SignalingMessage, type SignalingMessageType } from "./messages.ts";
import { SignalingValidationError } from "./errors.ts";
import { Room } from "./rooms.ts";
import type { PeerId, RoomId, RoomSnapshot, SendHandler, SocketId } from "./types.ts";

export type AuthenticateFn = (
  token: string | undefined,
  room: string,
) => boolean | Promise<boolean>;

export interface SessionOptions {
  maxPeersPerRoom?: number;
  authenticate?: AuthenticateFn;
}

export interface SocketInfo {
  token?: string;
}

interface SocketRecord extends SocketInfo {
  socketId: SocketId;
  peerId?: PeerId;
  roomId?: RoomId;
}

export const DEFAULT_MAX_PEERS_PER_ROOM = 50;

export class Session {
  private readonly maxPeersPerRoom: number;
  private readonly authenticate?: AuthenticateFn;
  private readonly sockets = new Map<SocketId, SocketRecord>();
  private readonly roomMap = new Map<RoomId, Room>();
  private sendHandler?: SendHandler;

  constructor(opts: SessionOptions = {}) {
    this.maxPeersPerRoom = opts.maxPeersPerRoom ?? DEFAULT_MAX_PEERS_PER_ROOM;
    this.authenticate = opts.authenticate;
  }

  socketCount(): number {
    return this.sockets.size;
  }

  rooms(): readonly RoomSnapshot[] {
    return [...this.roomMap.values()].map((room) => ({
      roomId: room.id,
      peers: room.peers(),
    }));
  }

  onSend(handler: SendHandler): () => void {
    if (this.sendHandler !== undefined) {
      throw new Error("onSend handler already registered; call the returned unsubscribe first");
    }
    this.sendHandler = handler;
    return () => {
      if (this.sendHandler === handler) {
        this.sendHandler = undefined;
      }
    };
  }

  async handleConnection(socketId: SocketId, info: SocketInfo): Promise<void> {
    const existing = this.sockets.get(socketId);
    if (existing !== undefined) {
      if (info.token !== undefined) existing.token = info.token;
      return;
    }
    const record: SocketRecord = { socketId };
    if (info.token !== undefined) record.token = info.token;
    this.sockets.set(socketId, record);
  }

  async handleMessage(socketId: SocketId, raw: string): Promise<void> {
    const socket = this.sockets.get(socketId);
    if (socket === undefined) {
      throw new SignalingValidationError(`unknown socket ${socketId}`, {
        context: { socketId },
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      throw new SignalingValidationError("message is not valid JSON", {
        cause,
        context: { socketId },
      });
    }

    const result = SignalingMessage.safeParse(parsed);
    if (!result.success) {
      throw new SignalingValidationError("message failed schema validation", {
        cause: result.error,
        context: { socketId, parsed },
      });
    }
    const message = result.data;

    switch (message.type) {
      case "join":
        await this.applyJoin(socket, message);
        return;
      default:
        // Other message types added in later tasks.
        throw new SignalingValidationError(`unsupported message type ${message.type}`, {
          context: { socketId, type: message.type },
        });
    }
  }

  private async applyJoin(
    socket: SocketRecord,
    message: Extract<SignalingMessageType, { type: "join" }>,
  ): Promise<void> {
    const room = this.getOrCreateRoom(message.room);
    const existingPeers = room.peers();

    socket.peerId = message.peer;
    socket.roomId = message.room;
    room.add({ peerId: message.peer, socketId: socket.socketId, role: message.role });

    // Tell each existing peer about the new joiner.
    for (const existing of existingPeers) {
      this.send(existing.peerId, {
        type: "peer-joined",
        peer: message.peer,
        role: message.role,
      });
    }
    // Tell the new joiner about each existing peer.
    for (const existing of existingPeers) {
      this.send(message.peer, {
        type: "peer-joined",
        peer: existing.peerId,
        role: existing.role,
      });
    }
  }

  private getOrCreateRoom(roomId: RoomId): Room {
    let room = this.roomMap.get(roomId);
    if (room === undefined) {
      room = new Room(roomId, { capacity: this.maxPeersPerRoom });
      this.roomMap.set(roomId, room);
    }
    return room;
  }

  private send(peerId: PeerId, message: SignalingMessageType): void {
    this.sendHandler?.(peerId, message);
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: all join + earlier tests pass.

- [ ] **Step 5: Run typecheck + lint + format**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/signaling-protocol/
git commit -m "feat(signaling-protocol): handle JoinRoom — registers peer and broadcasts peer-joined"
```

---

## Task 7: `handleMessage(LeaveRoom)` — removes peer + broadcasts `peer-left`

**Files:**

- Modify: `packages/signaling-protocol/src/session.ts`
- Create: `packages/signaling-protocol/test/unit/session-leave-room.test.ts`

- [ ] **Step 1: Write the failing leave test**

Create `packages/signaling-protocol/test/unit/session-leave-room.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { Session } from "../../src/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });
const leave = (room: string, peer: string) => JSON.stringify({ type: "leave", room, peer });

describe("Session.handleMessage — leave", () => {
  it("removes the peer from the room", async () => {
    const session = new Session();
    session.onSend(vi.fn());
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    expect(session.rooms()[0]?.peers).toHaveLength(1);

    await session.handleMessage("socket-a", leave("demo", "alice"));
    expect(session.rooms()[0]?.peers ?? []).toHaveLength(0);
  });

  it("broadcasts peer-left to remaining peers", async () => {
    const session = new Session();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));
    send.mockClear();

    await session.handleMessage("socket-a", leave("demo", "alice"));

    expect(send).toHaveBeenCalledWith("bob", { type: "peer-left", peer: "alice" });
  });

  it("is a no-op when the peer is not in the room", async () => {
    const session = new Session();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    send.mockClear();

    // alice trying to leave a room she isn't in
    await session.handleMessage("socket-a", leave("other-room", "alice"));
    expect(send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: leave tests FAIL ("unsupported message type leave").

- [ ] **Step 3: Add `applyLeave` to `packages/signaling-protocol/src/session.ts`**

In the `switch (message.type)` block in `handleMessage`, replace the `default:` branch so it now reads:

```ts
switch (message.type) {
  case "join":
    await this.applyJoin(socket, message);
    return;
  case "leave":
    this.applyLeave(socket, message);
    return;
  default:
    throw new SignalingValidationError(`unsupported message type ${message.type}`, {
      context: { socketId, type: message.type },
    });
}
```

Add the new private method directly below `applyJoin`:

```ts
  private applyLeave(
    socket: SocketRecord,
    message: Extract<SignalingMessageType, { type: 'leave' }>,
  ): void {
    const room = this.roomMap.get(message.room);
    if (room === undefined) return;
    const removed = room.remove(message.peer);
    if (removed === undefined) return;

    // Clear socket's peer/room association if the leaving peer matches
    if (socket.peerId === message.peer && socket.roomId === message.room) {
      delete socket.peerId;
      delete socket.roomId;
    }

    for (const remaining of room.peers()) {
      this.send(remaining.peerId, { type: 'peer-left', peer: message.peer });
    }

    if (room.size === 0) {
      this.roomMap.delete(room.id);
    }
  }
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: leave tests + all earlier tests pass.

- [ ] **Step 5: Run typecheck + lint + format**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/signaling-protocol/
git commit -m "feat(signaling-protocol): handle LeaveRoom — removes peer and broadcasts peer-left"
```

---

## Task 8: `handleMessage(Sdp)` — routes SDP between peers

**Files:**

- Modify: `packages/signaling-protocol/src/session.ts`
- Create: `packages/signaling-protocol/test/unit/session-sdp.test.ts`

- [ ] **Step 1: Write the failing SDP test**

Create `packages/signaling-protocol/test/unit/session-sdp.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { Session } from "../../src/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });

const sdp = (from: string, to: string, type: "offer" | "answer", body = "v=0...") =>
  JSON.stringify({ type: "sdp", from, to, sdp: { type, sdp: body } });

describe("Session.handleMessage — sdp", () => {
  it("routes an offer from publisher to viewer", async () => {
    const session = new Session();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));
    send.mockClear();

    await session.handleMessage("socket-a", sdp("alice", "bob", "offer"));

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("bob", {
      type: "sdp",
      from: "alice",
      to: "bob",
      sdp: { type: "offer", sdp: "v=0..." },
    });
  });

  it("routes an answer back", async () => {
    const session = new Session();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));
    send.mockClear();

    await session.handleMessage("socket-b", sdp("bob", "alice", "answer"));

    expect(send).toHaveBeenCalledWith(
      "alice",
      expect.objectContaining({ type: "sdp", from: "bob", to: "alice" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: SDP tests FAIL ("unsupported message type sdp").

- [ ] **Step 3: Add `applySdp` to `packages/signaling-protocol/src/session.ts`**

In `handleMessage`, extend the switch:

```ts
      case 'sdp':
        this.applySdp(message);
        return;
```

Add the private method below `applyLeave`:

```ts
  private applySdp(
    message: Extract<SignalingMessageType, { type: 'sdp' }>,
  ): void {
    this.send(message.to, message);
  }
```

> Note: `PeerNotFoundError` for sending to a non-existent peer is added in Task 13. For now, sending to a non-existent peer is a silent no-op (no socket to deliver to).

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: SDP tests + all earlier tests pass.

- [ ] **Step 5: Run typecheck + lint + format**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/signaling-protocol/
git commit -m "feat(signaling-protocol): route SDP messages between peers"
```

---

## Task 9: `handleMessage(IceCand)` — routes ICE candidates between peers

**Files:**

- Modify: `packages/signaling-protocol/src/session.ts`
- Create: `packages/signaling-protocol/test/unit/session-ice.test.ts`

- [ ] **Step 1: Write the failing ICE test**

Create `packages/signaling-protocol/test/unit/session-ice.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { Session } from "../../src/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });

const ice = (from: string, to: string, candidate: unknown) =>
  JSON.stringify({ type: "ice", from, to, candidate });

describe("Session.handleMessage — ice", () => {
  it("routes an ICE candidate object to the target peer", async () => {
    const session = new Session();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));
    send.mockClear();

    const candidate = { candidate: "candidate:1 1 udp 2113937151 ...", sdpMid: "0" };
    await session.handleMessage("socket-a", ice("alice", "bob", candidate));

    expect(send).toHaveBeenCalledWith("bob", {
      type: "ice",
      from: "alice",
      to: "bob",
      candidate,
    });
  });

  it("routes a null end-of-candidates marker", async () => {
    const session = new Session();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));
    send.mockClear();

    await session.handleMessage("socket-a", ice("alice", "bob", null));

    expect(send).toHaveBeenCalledWith(
      "bob",
      expect.objectContaining({ type: "ice", candidate: null }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: ICE tests FAIL ("unsupported message type ice").

- [ ] **Step 3: Add `applyIce` to `packages/signaling-protocol/src/session.ts`**

In `handleMessage`, extend the switch:

```ts
      case 'ice':
        this.applyIce(message);
        return;
```

Add the private method below `applySdp`:

```ts
  private applyIce(
    message: Extract<SignalingMessageType, { type: 'ice' }>,
  ): void {
    this.send(message.to, message);
  }
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: ICE tests + all earlier tests pass.

- [ ] **Step 5: Run typecheck + lint + format**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/signaling-protocol/
git commit -m "feat(signaling-protocol): route ICE candidate messages between peers"
```

---

## Task 10: `handleDisconnect` — cleanup on socket close

**Files:**

- Modify: `packages/signaling-protocol/src/session.ts`
- Create: `packages/signaling-protocol/test/unit/session-disconnect.test.ts`

- [ ] **Step 1: Write the failing disconnect test**

Create `packages/signaling-protocol/test/unit/session-disconnect.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { Session } from "../../src/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });

describe("Session.handleDisconnect", () => {
  it("drops the socket from the registry", async () => {
    const session = new Session();
    session.onSend(vi.fn());
    await session.handleConnection("socket-a", {});
    expect(session.socketCount()).toBe(1);

    await session.handleDisconnect("socket-a");
    expect(session.socketCount()).toBe(0);
  });

  it("removes the disconnected peer from any room and broadcasts peer-left", async () => {
    const session = new Session();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));
    send.mockClear();

    await session.handleDisconnect("socket-a");

    expect(send).toHaveBeenCalledWith("bob", { type: "peer-left", peer: "alice" });
    expect(session.rooms()[0]?.peers.map((p) => p.peerId)).toEqual(["bob"]);
  });

  it("garbage-collects empty rooms", async () => {
    const session = new Session();
    session.onSend(vi.fn());
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    await session.handleDisconnect("socket-a");

    expect(session.rooms()).toEqual([]);
  });

  it("is a no-op for unknown socket", async () => {
    const session = new Session();
    session.onSend(vi.fn());
    await expect(session.handleDisconnect("ghost")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: FAIL ("session.handleDisconnect is not a function").

- [ ] **Step 3: Implement `handleDisconnect` in `packages/signaling-protocol/src/session.ts`**

Add this public method to the `Session` class (after `handleMessage`):

```ts
  async handleDisconnect(socketId: SocketId): Promise<void> {
    const socket = this.sockets.get(socketId);
    if (socket === undefined) return;

    if (socket.roomId !== undefined && socket.peerId !== undefined) {
      const room = this.roomMap.get(socket.roomId);
      if (room !== undefined) {
        room.remove(socket.peerId);
        for (const remaining of room.peers()) {
          this.send(remaining.peerId, { type: 'peer-left', peer: socket.peerId });
        }
        if (room.size === 0) {
          this.roomMap.delete(room.id);
        }
      }
    }

    this.sockets.delete(socketId);
  }
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: disconnect tests + all earlier tests pass.

- [ ] **Step 5: Run typecheck + lint + format**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/signaling-protocol/
git commit -m "feat(signaling-protocol): handleDisconnect cleans up rooms and broadcasts peer-left"
```

---

## Task 11: Authenticate callback wired into JoinRoom

**Files:**

- Modify: `packages/signaling-protocol/src/session.ts` (extend `applyJoin`)
- Create: `packages/signaling-protocol/test/unit/session-authenticate.test.ts`

- [ ] **Step 1: Write the failing authenticate test**

Create `packages/signaling-protocol/test/unit/session-authenticate.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { SignalingAuthError } from "../../src/errors.ts";
import { Session } from "../../src/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });

describe("Session — authenticate", () => {
  it("passes the token and room to the authenticate callback", async () => {
    const authenticate = vi.fn(async () => true);
    const session = new Session({ authenticate });
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", { token: "jwt.here" });
    await session.handleMessage("socket-1", join("demo", "alice"));

    expect(authenticate).toHaveBeenCalledWith("jwt.here", "demo");
  });

  it("passes undefined when no token was provided", async () => {
    const authenticate = vi.fn(async () => true);
    const session = new Session({ authenticate });
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", {});
    await session.handleMessage("socket-1", join("demo", "alice"));

    expect(authenticate).toHaveBeenCalledWith(undefined, "demo");
  });

  it("rejects join with SignalingAuthError when callback returns false", async () => {
    const session = new Session({ authenticate: async () => false });
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", { token: "bad" });
    await expect(session.handleMessage("socket-1", join("demo", "alice"))).rejects.toBeInstanceOf(
      SignalingAuthError,
    );
  });

  it("does not register the peer when auth fails", async () => {
    const session = new Session({ authenticate: async () => false });
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", {});
    await session.handleMessage("socket-1", join("demo", "alice")).catch(() => {});

    expect(session.rooms()).toEqual([]);
  });

  it("supports synchronous boolean return from authenticate", async () => {
    const session = new Session({ authenticate: () => true });
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", {});
    await session.handleMessage("socket-1", join("demo", "alice"));
    expect(session.rooms()).toHaveLength(1);
  });

  it("skips auth when no callback is configured", async () => {
    const session = new Session();
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", {});
    await session.handleMessage("socket-1", join("demo", "alice"));
    expect(session.rooms()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: 3 of the 6 auth tests FAIL (the ones that expect rejection); the others may already pass.

- [ ] **Step 3: Update `applyJoin` in `packages/signaling-protocol/src/session.ts`**

Replace the entire `applyJoin` method with:

```ts
  private async applyJoin(
    socket: SocketRecord,
    message: Extract<SignalingMessageType, { type: 'join' }>,
  ): Promise<void> {
    if (this.authenticate !== undefined) {
      const ok = await this.authenticate(socket.token, message.room);
      if (!ok) {
        throw new SignalingAuthError('authentication rejected', {
          context: { socketId: socket.socketId, room: message.room, peer: message.peer },
        });
      }
    }

    const room = this.getOrCreateRoom(message.room);
    const existingPeers = room.peers();

    socket.peerId = message.peer;
    socket.roomId = message.room;
    room.add({ peerId: message.peer, socketId: socket.socketId, role: message.role });

    for (const existing of existingPeers) {
      this.send(existing.peerId, {
        type: 'peer-joined',
        peer: message.peer,
        role: message.role,
      });
    }
    for (const existing of existingPeers) {
      this.send(message.peer, {
        type: 'peer-joined',
        peer: existing.peerId,
        role: existing.role,
      });
    }
  }
```

Add the import:

```ts
import { SignalingAuthError, SignalingValidationError } from "./errors.ts";
```

(Remove the existing `import { SignalingValidationError }` line and use the combined import.)

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: all auth tests + all earlier tests pass.

- [ ] **Step 5: Run typecheck + lint + format**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/signaling-protocol/
git commit -m "feat(signaling-protocol): wire authenticate callback into JoinRoom"
```

---

## Task 12: `maxPeersPerRoom` enforcement → `RoomFullError`

**Files:**

- Create: `packages/signaling-protocol/test/unit/session-max-peers.test.ts`

The `Room` class already throws `RoomFullError` (Task 4). This task verifies it propagates through `Session.handleMessage(JoinRoom)`.

- [ ] **Step 1: Write the failing capacity test**

Create `packages/signaling-protocol/test/unit/session-max-peers.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { RoomFullError } from "../../src/errors.ts";
import { Session } from "../../src/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });

describe("Session — maxPeersPerRoom", () => {
  it("rejects join with RoomFullError when capacity reached", async () => {
    const session = new Session({ maxPeersPerRoom: 2 });
    session.onSend(vi.fn());
    await session.handleConnection("s1", {});
    await session.handleMessage("s1", join("demo", "alice"));
    await session.handleConnection("s2", {});
    await session.handleMessage("s2", join("demo", "bob"));
    await session.handleConnection("s3", {});

    await expect(session.handleMessage("s3", join("demo", "carol"))).rejects.toBeInstanceOf(
      RoomFullError,
    );
  });

  it("allows the third peer to join a different room", async () => {
    const session = new Session({ maxPeersPerRoom: 2 });
    session.onSend(vi.fn());
    await session.handleConnection("s1", {});
    await session.handleMessage("s1", join("room-a", "alice"));
    await session.handleConnection("s2", {});
    await session.handleMessage("s2", join("room-a", "bob"));
    await session.handleConnection("s3", {});

    await session.handleMessage("s3", join("room-b", "carol"));
    expect(session.rooms()).toHaveLength(2);
  });

  it("default capacity is 50", async () => {
    const session = new Session();
    session.onSend(vi.fn());
    for (let i = 0; i < 50; i += 1) {
      await session.handleConnection(`s${i}`, {});
      await session.handleMessage(`s${i}`, join("demo", `peer-${i}`));
    }
    await session.handleConnection("s50", {});
    await expect(session.handleMessage("s50", join("demo", "peer-50"))).rejects.toBeInstanceOf(
      RoomFullError,
    );
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: tests pass — the underlying `Room` already enforces capacity, so this is a contract verification, not new logic.

- [ ] **Step 3: Run typecheck + lint + format**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/signaling-protocol/
git commit -m "test(signaling-protocol): verify maxPeersPerRoom enforced through Session"
```

---

## Task 13: `PeerNotFoundError` on SDP/ICE to missing peer

**Files:**

- Modify: `packages/signaling-protocol/src/session.ts`
- Create: `packages/signaling-protocol/test/unit/session-peer-not-found.test.ts`

Currently `applySdp` and `applyIce` silently drop messages with no target. Spec says they should error so the calling adapter can return a meaningful response.

- [ ] **Step 1: Write the failing peer-not-found test**

Create `packages/signaling-protocol/test/unit/session-peer-not-found.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { PeerNotFoundError } from "../../src/errors.ts";
import { Session } from "../../src/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });

const sdp = (from: string, to: string) =>
  JSON.stringify({ type: "sdp", from, to, sdp: { type: "offer", sdp: "v=0..." } });

const ice = (from: string, to: string) =>
  JSON.stringify({ type: "ice", from, to, candidate: null });

describe("Session — PeerNotFoundError", () => {
  it("throws PeerNotFoundError when SDP target is missing", async () => {
    const session = new Session();
    session.onSend(vi.fn());
    await session.handleConnection("s1", {});
    await session.handleMessage("s1", join("demo", "alice"));

    await expect(session.handleMessage("s1", sdp("alice", "ghost"))).rejects.toBeInstanceOf(
      PeerNotFoundError,
    );
  });

  it("throws PeerNotFoundError when ICE target is missing", async () => {
    const session = new Session();
    session.onSend(vi.fn());
    await session.handleConnection("s1", {});
    await session.handleMessage("s1", join("demo", "alice"));

    await expect(session.handleMessage("s1", ice("alice", "ghost"))).rejects.toBeInstanceOf(
      PeerNotFoundError,
    );
  });

  it("does not throw when target peer exists in another room (cross-room not supported)", async () => {
    // Spec is silent on cross-room SDP, but in v0.1.0 we treat any registered peerId as routable.
    // This test pins the behavior — change the spec before changing the test.
    const session = new Session();
    session.onSend(vi.fn());
    await session.handleConnection("s1", {});
    await session.handleMessage("s1", join("room-a", "alice"));
    await session.handleConnection("s2", {});
    await session.handleMessage("s2", join("room-b", "bob"));

    // alice tries to send to bob who is in another room — this should still route
    await session.handleMessage("s1", sdp("alice", "bob"));
    // No throw. (Cross-room policy may tighten in EPIC-3 if needed.)
  });
});
```

- [ ] **Step 2: Run tests to verify the SDP/ICE ones fail**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: PeerNotFoundError tests FAIL (sends are currently silent no-ops).

- [ ] **Step 3: Track peers globally for routing**

Add a `peerIndex` field and update `applyJoin`, `applyLeave`, `handleDisconnect` to maintain it; update `applySdp` and `applyIce` to consult it.

In `packages/signaling-protocol/src/session.ts`:

Add the field declaration in the class (next to `roomMap`):

```ts
  private readonly peerIndex = new Map<string, SocketRecord>();
```

In `applyJoin`, after `room.add(...)`, add:

```ts
this.peerIndex.set(message.peer, socket);
```

In `applyLeave`, after `if (removed === undefined) return;`, add:

```ts
this.peerIndex.delete(message.peer);
```

In `handleDisconnect`, replace the `if (socket.roomId !== undefined && socket.peerId !== undefined)` block with:

```ts
if (socket.roomId !== undefined && socket.peerId !== undefined) {
  const room = this.roomMap.get(socket.roomId);
  if (room !== undefined) {
    room.remove(socket.peerId);
    for (const remaining of room.peers()) {
      this.send(remaining.peerId, { type: "peer-left", peer: socket.peerId });
    }
    if (room.size === 0) {
      this.roomMap.delete(room.id);
    }
  }
  this.peerIndex.delete(socket.peerId);
}
```

Replace `applySdp` with:

```ts
  private applySdp(
    message: Extract<SignalingMessageType, { type: 'sdp' }>,
  ): void {
    if (!this.peerIndex.has(message.to)) {
      throw new PeerNotFoundError(`unknown peer ${message.to}`, {
        context: { peer: message.to, from: message.from },
      });
    }
    this.send(message.to, message);
  }
```

Replace `applyIce` with:

```ts
  private applyIce(
    message: Extract<SignalingMessageType, { type: 'ice' }>,
  ): void {
    if (!this.peerIndex.has(message.to)) {
      throw new PeerNotFoundError(`unknown peer ${message.to}`, {
        context: { peer: message.to, from: message.from },
      });
    }
    this.send(message.to, message);
  }
```

Add `PeerNotFoundError` to the imports at the top of the file:

```ts
import { PeerNotFoundError, SignalingAuthError, SignalingValidationError } from "./errors.ts";
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: PeerNotFoundError tests + all earlier tests pass.

- [ ] **Step 5: Run typecheck + lint + format**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/signaling-protocol/
git commit -m "feat(signaling-protocol): throw PeerNotFoundError when SDP/ICE target is missing"
```

---

## Task 14: `SignalingEngine` + `defineSignalingEngine` factory

**Files:**

- Create: `packages/signaling-protocol/src/engine.ts`
- Create: `packages/signaling-protocol/test/unit/engine.test.ts`

The Engine is the thin facade that holds policy and produces independent Sessions. Per the project convention (see `feedback_factory_apis` memory), the **primary public entry point is the `defineSignalingEngine({...})` factory**; the underlying `SignalingEngine` class is exported alongside for type imports and `instanceof` checks but is not the recommended call style.

- [ ] **Step 1: Write the failing engine test**

Create `packages/signaling-protocol/test/unit/engine.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { defineSignalingEngine, SignalingEngine } from "../../src/engine.ts";
import { Session } from "../../src/session.ts";

describe("defineSignalingEngine + SignalingEngine", () => {
  it("factory returns a SignalingEngine", () => {
    const engine = defineSignalingEngine();
    expect(engine).toBeInstanceOf(SignalingEngine);
  });

  it("constructs with no options", () => {
    const engine = defineSignalingEngine();
    const session = engine.openSession();
    expect(session).toBeInstanceOf(Session);
  });

  it("passes maxPeersPerRoom to created sessions", async () => {
    const engine = defineSignalingEngine({ maxPeersPerRoom: 1 });
    const session = engine.openSession();
    session.onSend(vi.fn());
    await session.handleConnection("s1", {});
    await session.handleMessage(
      "s1",
      JSON.stringify({ type: "join", room: "r", peer: "p1", role: "publisher" }),
    );
    await session.handleConnection("s2", {});
    // second peer should fail with capacity = 1
    await expect(
      session.handleMessage(
        "s2",
        JSON.stringify({ type: "join", room: "r", peer: "p2", role: "viewer" }),
      ),
    ).rejects.toThrow(/full/);
  });

  it("passes authenticate to created sessions", async () => {
    const auth = vi.fn(async () => true);
    const engine = defineSignalingEngine({ authenticate: auth });
    const session = engine.openSession();
    session.onSend(vi.fn());
    await session.handleConnection("s1", { token: "xyz" });
    await session.handleMessage(
      "s1",
      JSON.stringify({ type: "join", room: "r", peer: "p", role: "publisher" }),
    );
    expect(auth).toHaveBeenCalledWith("xyz", "r");
  });

  it("openSession returns independent sessions", async () => {
    const engine = defineSignalingEngine();
    const a = engine.openSession();
    const b = engine.openSession();
    a.onSend(vi.fn());
    b.onSend(vi.fn());
    await a.handleConnection("s1", {});
    expect(a.socketCount()).toBe(1);
    expect(b.socketCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: FAIL with "Cannot find module '../../src/engine.ts'".

- [ ] **Step 3: Implement `packages/signaling-protocol/src/engine.ts`**

````ts
/**
 * `SignalingEngine` — config holder + Session factory.
 *
 * The engine is the single place to configure protocol-wide policy
 * (auth, room capacity). It produces independent {@link Session} runtimes
 * via {@link SignalingEngine.openSession}; sessions do not share state with
 * each other, which makes per-test isolation trivial.
 *
 * Public API: prefer {@link defineSignalingEngine} over `new SignalingEngine(...)`
 * — declarative factory style is the project convention. The class is
 * exported for type imports and `instanceof` checks only.
 */

import { Session, type AuthenticateFn } from "./session.ts";

/** Options passed to {@link defineSignalingEngine} / `new SignalingEngine()`. */
export interface SignalingEngineOptions {
  /** Maximum peers per room. Defaults to 50 (see `Session.DEFAULT_MAX_PEERS_PER_ROOM`). */
  maxPeersPerRoom?: number;
  /** Optional auth check called on every join. Default: allow all. */
  authenticate?: AuthenticateFn;
}

/**
 * Engine class. Use {@link defineSignalingEngine} as the recommended
 * call style; this class is also exported for type imports and `instanceof`.
 */
export class SignalingEngine {
  private readonly options: SignalingEngineOptions;

  constructor(options: SignalingEngineOptions = {}) {
    this.options = options;
  }

  /**
   * Create a fresh, isolated {@link Session}. Each session has its own room
   * map and socket registry — no shared state with sibling sessions, which
   * makes per-test isolation easy and supports running multiple independent
   * SDK instances inside one process if needed.
   */
  openSession(): Session {
    return new Session(this.options);
  }
}

/**
 * Declarative factory for {@link SignalingEngine}. The recommended way to
 * construct an engine — keeps call sites declarative and matches the rest of
 * the SDK's `defineX({...})` style.
 *
 * ```ts
 * const engine = defineSignalingEngine({
 *   authenticate: async (token, room) => verifyJwt(token),
 *   maxPeersPerRoom: 50,
 * });
 * const session = engine.openSession();
 * ```
 */
export function defineSignalingEngine(opts: SignalingEngineOptions = {}): SignalingEngine {
  return new SignalingEngine(opts);
}
````

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: engine tests + all earlier tests pass.

- [ ] **Step 5: Run typecheck + lint + format**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/signaling-protocol/
git commit -m "feat(signaling-protocol): add defineSignalingEngine factory + SignalingEngine class"
```

---

## Task 15: Public surface (`src/index.ts`) + smoke test + README

**Files:**

- Modify: `packages/signaling-protocol/src/index.ts`
- Create: `packages/signaling-protocol/test/unit/smoke.test.ts`
- Modify: `packages/signaling-protocol/README.md`

This task wires the entire public surface and verifies it works end-to-end through the package's exported entrypoint (which is what every consumer will see).

- [ ] **Step 1: Replace `packages/signaling-protocol/src/index.ts`**

```ts
// Engine + session
export { SignalingEngine, type SignalingEngineOptions } from "./engine.ts";
export {
  DEFAULT_MAX_PEERS_PER_ROOM,
  Session,
  type AuthenticateFn,
  type SessionOptions,
  type SocketInfo,
} from "./session.ts";

// Wire format — schemas + inferred types
export {
  IceCand,
  JoinRoom,
  LeaveRoom,
  PeerJoined,
  PeerLeft,
  PeerId as PeerIdSchema,
  RoomId as RoomIdSchema,
  Role,
  Sdp,
  SignalingMessage,
  type IceCandMessage,
  type JoinRoomMessage,
  type LeaveRoomMessage,
  type PeerIdValue,
  type PeerJoinedMessage,
  type PeerLeftMessage,
  type RoleValue,
  type RoomIdValue,
  type SdpMessage,
  type SignalingMessageType,
} from "./messages.ts";

// Errors
export {
  PeerNotFoundError,
  RoomFullError,
  SignalingAuthError,
  SignalingProtocolError,
  SignalingValidationError,
  type SignalingErrorOptions,
} from "./errors.ts";

// Shared types
export type { PeerId, RoomId, RoomPeer, RoomSnapshot, SendHandler, SocketId } from "./types.ts";
```

- [ ] **Step 2: Write the smoke test**

Create `packages/signaling-protocol/test/unit/smoke.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  PeerNotFoundError,
  RoomFullError,
  Session,
  SignalingAuthError,
  SignalingEngine,
  SignalingMessage,
  SignalingValidationError,
} from "../../src/index.ts";

describe("public surface — happy path", () => {
  it("full publish/view exchange runs end-to-end via the public surface", async () => {
    const engine = new SignalingEngine({ maxPeersPerRoom: 4 });
    const session = engine.openSession();
    expect(session).toBeInstanceOf(Session);

    const sent: { peerId: string; message: unknown }[] = [];
    session.onSend((peerId, message) => {
      sent.push({ peerId, message });
    });

    // alice publishes
    await session.handleConnection("socket-alice", {});
    await session.handleMessage(
      "socket-alice",
      JSON.stringify({ type: "join", room: "demo", peer: "alice", role: "publisher" }),
    );

    // bob views
    await session.handleConnection("socket-bob", {});
    await session.handleMessage(
      "socket-bob",
      JSON.stringify({ type: "join", room: "demo", peer: "bob", role: "viewer" }),
    );

    // alice sends an offer to bob
    await session.handleMessage(
      "socket-alice",
      JSON.stringify({
        type: "sdp",
        from: "alice",
        to: "bob",
        sdp: { type: "offer", sdp: "v=0..." },
      }),
    );

    const offer = sent.find(
      (s) =>
        s.peerId === "bob" &&
        typeof s.message === "object" &&
        s.message !== null &&
        (s.message as { type?: string }).type === "sdp",
    );
    expect(offer).toBeDefined();

    // bob disconnects
    await session.handleDisconnect("socket-bob");
    expect(session.rooms()[0]?.peers.map((p) => p.peerId)).toEqual(["alice"]);
  });

  it("exposes all error classes and the wire-format schema", () => {
    expect(SignalingValidationError).toBeDefined();
    expect(SignalingAuthError).toBeDefined();
    expect(RoomFullError).toBeDefined();
    expect(PeerNotFoundError).toBeDefined();
    expect(SignalingMessage.parse).toBeDefined();
  });
});
```

- [ ] **Step 3: Run tests to verify pass**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: smoke + all earlier tests pass.

- [ ] **Step 4: Replace the package README**

Overwrite `packages/signaling-protocol/README.md`:

```markdown
# @forinda/video-sdk-signaling-protocol

Pure, transport-agnostic WebRTC signaling protocol engine + canonical wire-format zod schemas. Used by `@forinda/video-sdk-core` (browser) and every `@forinda/video-sdk-signaling-adapter-*` (server) as the single source of truth for messages and routing.

## Install

\`\`\`bash
pnpm add @forinda/video-sdk-signaling-protocol
\`\`\`

## Usage

\`\`\`ts
import { SignalingEngine } from '@forinda/video-sdk-signaling-protocol';

const engine = new SignalingEngine({
authenticate: async (token, room) => verifyJwt(token),
maxPeersPerRoom: 50,
});

const session = engine.openSession();
session.onSend((peerId, message) => {
// your transport (WebSocket, EventSource, etc.) delivers `message` to the socket bound to `peerId`
});

// when a socket connects:
await session.handleConnection(socketId, { token: extractedToken });

// when a raw message arrives:
await session.handleMessage(socketId, rawJsonString);

// when a socket closes:
await session.handleDisconnect(socketId);
\`\`\`

## Wire format

Six message types as a zod discriminated union: `join`, `leave`, `peer-joined`, `peer-left`, `sdp`, `ice`. Validate any inbound message with `SignalingMessage.parse(raw)`.

## Errors

All thrown errors extend `SignalingProtocolError` and carry a stable `code`:

| Class                      | `code`                 | When thrown                              |
| -------------------------- | ---------------------- | ---------------------------------------- |
| `SignalingValidationError` | `signaling_validation` | Invalid JSON or schema-failing message   |
| `SignalingAuthError`       | `signaling_auth`       | `authenticate` callback returned `false` |
| `RoomFullError`            | `room_full`            | Room already at `maxPeersPerRoom`        |
| `PeerNotFoundError`        | `peer_not_found`       | SDP/ICE target peer is not registered    |

## License

MIT — © 2026 Felix Orinda.
```

- [ ] **Step 5: Run typecheck + build to verify the public surface**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol build
```

Expected: both exit 0; `dist/index.js` and `dist/index.d.ts` emitted; banner appears at the top of `dist/index.js`:

```bash
head -1 packages/signaling-protocol/dist/index.js
# expected: /*! @forinda/video-sdk-signaling-protocol v0.0.0 | (c) 2026 Felix Orinda | built YYYY-MM-DD | MIT */
```

- [ ] **Step 6: Run lint + format**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol lint
pnpm format:check
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/signaling-protocol/
git commit -m "feat(signaling-protocol): publish public surface and add smoke test"
```

---

## Task 16: Whole-package verification + coverage check + tag

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full pipeline for the package**

```bash
cd /home/forinda/dev/open-source/forinda-video-sdk
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
pnpm --filter @forinda/video-sdk-signaling-protocol build
pnpm --filter @forinda/video-sdk-signaling-protocol test
pnpm --filter @forinda/video-sdk-signaling-protocol lint
```

Expected: every command exits 0.

- [ ] **Step 2: Run coverage**

```bash
cd /home/forinda/dev/open-source/forinda-video-sdk/packages/signaling-protocol
pnpm exec vitest run --coverage
```

Expected: every file in `src/` (except `index.ts`) reports ≥ 90% line coverage. If any file is below threshold, add tests covering the uncovered lines before continuing.

- [ ] **Step 3: Run whole-workspace verification**

```bash
cd /home/forinda/dev/open-source/forinda-video-sdk
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm lint
git status
```

Expected: all four exit 0; `git status` clean. (The harmless `forinda-signaling` bin warning during install is OK.)

- [ ] **Step 4: Update plan checkbox state**

In `docs/superpowers/plans/2026-05-02-EPIC-2-signaling-protocol.md`, mark every `- [ ]` as `- [x]` (this should already be done as work proceeded; confirm).

- [ ] **Step 5: Tag**

```bash
git tag -a v0.0.0-epic-2 -m "EPIC-2 complete: signaling-protocol implementation

Pure protocol engine with 6 wire-format message types (zod-validated),
RoomFullError/PeerNotFoundError/SignalingAuthError/SignalingValidationError,
authenticate callback, maxPeersPerRoom enforcement, full session lifecycle
(handleConnection/handleMessage/handleDisconnect/onSend).

Coverage: ≥90% on src/.
Used by @forinda/video-sdk-core (EPIC-3) and signaling-adapter-* (EPIC-4)."
```

- [ ] **Step 6: Final report (no commit needed)**

Run:

```bash
git log v0.0.0-foundation..HEAD --oneline
```

Expected: ~16 commits since the EPIC-1 baseline, all in `packages/signaling-protocol/` (plus possibly the lockfile).

---

## Self-review notes

**Spec coverage check** (against `docs/superpowers/specs/2026-05-02-video-sdk-design.md`):

| Spec section / requirement                                                                                                                     | Plan task                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Section 7 — `SignalingTransport` interface                                                                                                     | Out of scope (lives in `core`, EPIC-3)           |
| Section 7 — Wire format (6 message types, zod-validated)                                                                                       | Task 2                                           |
| Section 7 — `SignalingEngine` class + `openSession`                                                                                            | Task 14                                          |
| Section 7 — `Session.handleConnection / Message / Disconnect / onSend`                                                                         | Tasks 5, 6-9, 10, 5                              |
| Section 7 — Pluggable `authenticate(token, room)`                                                                                              | Task 11                                          |
| Section 7 — `maxPeersPerRoom` (default 50)                                                                                                     | Tasks 4, 12                                      |
| Section 7 — In-memory room/peer state                                                                                                          | Task 4 (`Room`)                                  |
| Section 10 — Error hierarchy: `SignalingProtocolError`, `SignalingValidationError`, `SignalingAuthError`, `RoomFullError`, `PeerNotFoundError` | Tasks 3, 13                                      |
| Section 12 — Vitest + jsdom                                                                                                                    | Task 1 (jsdom not used here — pure node, faster) |
| Section 12 — Coverage ≥90% on `signaling-protocol`                                                                                             | Task 16                                          |

**Type/name consistency check:**

- `Session.onSend` returns `() => void`, used as the unsubscribe in tests across Tasks 5, 6, 11.
- `RoomPeer` shape (`peerId`, `socketId`, `role`) is consistent across Tasks 4, 6.
- `SocketRecord` is internal (private to `session.ts`); never leaks via public API.
- `SignalingMessageType` (renamed from raw `SignalingMessage` to disambiguate from the zod schema constant) is the inferred type; tests use `SignalingMessage` for the schema and `SignalingMessageType` for the inferred type.

**Placeholder scan:** No "TBD" / "implement later" / vague "handle edge cases" anywhere. Every step shows exact code or exact commands.

**Out of scope (deferred):**

- `SignalingTransport` interface for the browser side → EPIC-3 (`core/src/signaling/transport.ts`).
- WebSocket/HTTP transport adapters → EPIC-4.
- `SignalingTransport` re-exports — `core` re-exports the wire-format types (Section 5 of spec) and adds its own `SignalingTransport` interface.

---

## Risks and notes for the implementer

- **TypeScript 6 + zod**: zod 3.x supports TS 5+; should work fine on TS 6. If zod 3 hits unexpected TS errors, the workaround is `"skipLibCheck": true` (already set in tsconfig.base) — but escalate to the controller before changing types.
- **`exactOptionalPropertyTypes: true`** (set in `tsconfig.base.json`) means optional fields cannot be assigned `undefined` explicitly. Use `delete obj.field` or omit the field, not `obj.field = undefined`. The plan's code already follows this — watch for it in any code you add.
- **Strict `verbatimModuleSyntax`**: imports of types must use `import type` or the inline `type` keyword. The plan's code already uses this. If you add new imports, follow the same.
- **No `node:` imports needed**: this package is environment-neutral (no Node-only or browser-only APIs). If you're tempted to reach for `node:crypto` or similar, flag it as a concern.
- **`exactOptionalPropertyTypes` + `Omit<…, 'code'>`**: the error subclasses use `Omit<SignalingErrorOptions, 'code'>`. If TS 6 has stricter behavior on this pattern, the symptom will be a confusing assignability error in `errors.ts`. The fix is usually to switch to a positional argument shape — escalate before changing.
