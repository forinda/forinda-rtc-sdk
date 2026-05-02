# EPIC-22 Engine Hardening: Rate Limits + Chat Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side guards to the signaling engine — per-peer token-bucket rate limits on `presence-update` and `chat`, plus an opt-in per-room chat-history ring buffer that's replayed to late joiners who explicitly request it on `join`.

**Architecture:**

- **Rate limits**: a stateless `TokenBucket` helper (refill rate, capacity) lives in `signaling-protocol/src/rate-limit.ts`. The Session keeps a `Map<peerId, { presence: TokenBucket; chat: TokenBucket }>` lazily populated on first applicable inbound. Over-budget messages throw a new `SignalingRateLimitError(code: "rate_limited")`. Disabled by default — `rateLimit: undefined` skips bucket creation entirely.
- **Chat history**: each `Room` gains a per-room ring buffer (size = `chatHistoryPerRoom`, default `0` = disabled). Successful `applyChat` pushes the message into the buffer. `JoinRoom` gets a new optional `replayHistory: boolean` field; when `true` AND the engine has `chatHistoryPerRoom > 0`, the engine sends the joiner one new `ChatHistory` message right after `presence-snapshot`. Old clients omit the flag → never see the new message type → no breaking change.
- **Wire format**: new `ChatHistory` schema in `messages.ts` joins the `SignalingMessage` discriminated union. `JoinRoom` gains `replayHistory: z.boolean().optional()`. Both additions are zero-impact for legacy clients.
- **Adapter wiring**: `defineRoomChannel` gets a new `replayHistory?: boolean` option (default `false`). When `true`, sets the flag on the join. `RoomChannel` handles the inbound `chat-history` by seeding `chatBuffer` and emitting a single `chat-history` event.

**Tech Stack:** TypeScript, Vitest, Zod, the existing `signaling-protocol` engine + `RoomChannel`, React + Vue adapters.

---

## File structure

| File | Responsibility |
| --- | --- |
| `packages/signaling-protocol/src/rate-limit.ts` | Stateless `TokenBucket` helper (capacity + refill). Used by Session for `chat` + `presence-update`. |
| `packages/signaling-protocol/src/errors.ts` | New `SignalingRateLimitError(code: "rate_limited")`. Re-exported via index. |
| `packages/signaling-protocol/src/messages.ts` | Add optional `replayHistory` to `JoinRoom`. Add `ChatHistory` schema. Extend `SignalingMessage` union. |
| `packages/signaling-protocol/src/rooms.ts` | Add `chatHistoryLimit` constructor option + `pushChat(msg)` / `chatHistory()` methods. Optional ring buffer (no-op when limit is 0). |
| `packages/signaling-protocol/src/session.ts` | Plumb `rateLimit` + `chatHistoryPerRoom` from `SessionOptions`. Bucket lookup in `applyPresenceUpdate` + `applyChat`. Push to room buffer on accepted chat. Send `chat-history` to opt-in joiners after `presence-snapshot`. |
| `packages/signaling-protocol/src/engine.ts` | Forward the two new options through `SignalingEngineOptions` → `Session`. |
| `packages/signaling-protocol/src/index.ts` | Re-export the new error class + types. |
| `packages/signaling-protocol/test/unit/rate-limit.test.ts` | Token-bucket unit tests (refill, burst, exhaustion, recovery). |
| `packages/signaling-protocol/test/unit/session-rate-limit.test.ts` | End-to-end engine tests for chat + presence rate limiting. |
| `packages/signaling-protocol/test/unit/session-chat-history.test.ts` | Late-joiner replay, ring buffer cap, replayHistory off (no message). |
| `packages/core/src/room/room-channel.ts` | New `replayHistory?: boolean` option. Handle inbound `chat-history` (seed buffer, emit event). |
| `packages/core/src/room/types.ts` | `RoomChannelEvents` gains `chat-history: ChatHistoryEntry[]`. `RoomChannelOptions` gains `replayHistory?: boolean`. |
| `packages/core/test/unit/room/room-channel-history.test.ts` | New: opt-in joiner receives history, off by default no replay. |
| `packages/signaling-protocol/README.md`, `packages/core/README.md` | Document new options + wire-format addition. |
| `.changeset/engine-hardening.md` | minor for `signaling-protocol` + `core`; patch for cascading peer-deps. |

---

## Task 1: `TokenBucket` helper

**Files:**
- Create: `packages/signaling-protocol/src/rate-limit.ts`
- Test: `packages/signaling-protocol/test/unit/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/signaling-protocol/test/unit/rate-limit.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { defineTokenBucket } from "@/rate-limit.ts";

describe("defineTokenBucket", () => {
  it("starts with `capacity` tokens — burst is allowed", () => {
    const b = defineTokenBucket({ capacity: 5, refillPerSec: 1, now: () => 0 });
    for (let i = 0; i < 5; i++) expect(b.consume()).toBe(true);
    expect(b.consume()).toBe(false);
  });

  it("refills linearly over time", () => {
    let now = 0;
    const b = defineTokenBucket({ capacity: 2, refillPerSec: 1, now: () => now });
    expect(b.consume()).toBe(true);
    expect(b.consume()).toBe(true);
    expect(b.consume()).toBe(false);
    now = 1_000; // one second later → 1 token refilled
    expect(b.consume()).toBe(true);
    expect(b.consume()).toBe(false);
  });

  it("caps refill at `capacity`", () => {
    let now = 0;
    const b = defineTokenBucket({ capacity: 3, refillPerSec: 10, now: () => now });
    for (let i = 0; i < 3; i++) b.consume();
    now = 60_000; // 60s × 10/s = 600 tokens of credit, but capped at 3
    let consumed = 0;
    while (b.consume()) consumed++;
    expect(consumed).toBe(3);
  });

  it("treats refillPerSec=0 as 'never refills' (consume burns tokens permanently)", () => {
    let now = 0;
    const b = defineTokenBucket({ capacity: 1, refillPerSec: 0, now: () => now });
    expect(b.consume()).toBe(true);
    now = 60_000;
    expect(b.consume()).toBe(false);
  });

  it("uses Date.now by default", () => {
    const spy = vi.spyOn(Date, "now").mockReturnValue(123);
    try {
      const b = defineTokenBucket({ capacity: 1, refillPerSec: 1 });
      expect(b.consume()).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test -- rate-limit
```

Expected: failures — `defineTokenBucket` doesn't exist.

- [ ] **Step 3: Implement `TokenBucket`**

Create `packages/signaling-protocol/src/rate-limit.ts`:

```ts
/**
 * `TokenBucket` — a leaky-bucket rate limiter (token-bucket flavor).
 *
 * One bucket holds up to `capacity` tokens and refills at `refillPerSec`
 * tokens/second. `consume()` returns `true` when a token was available and
 * deducted, `false` otherwise. The bucket is purely time-driven — there are
 * no timers, no scheduled refills. Each `consume()` reads `now()` and
 * computes the time-since-last-refill credit on demand.
 *
 * `refillPerSec === 0` disables refill entirely (the bucket can be drained
 * once and never recovers — useful for "block after first violation" semantics
 * if needed). The same `defineTokenBucket({})` shape stays valid either way.
 *
 * The Session uses two buckets per peer (chat + presence) to enforce
 * per-message-type quotas without one channel draining the other.
 */

export interface TokenBucketOptions {
  /** Maximum tokens the bucket can hold. Burst allowance equals capacity. */
  capacity: number;
  /** Tokens added per second. `0` disables refill. */
  refillPerSec: number;
  /** Test seam — defaults to `Date.now`. */
  now?: () => number;
}

export interface TokenBucket {
  /** Try to take one token. Returns `true` on success, `false` when empty. */
  consume(): boolean;
}

class TokenBucketImpl implements TokenBucket {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;
  private tokens: number;
  private lastRefillAt: number;

  constructor(opts: TokenBucketOptions) {
    this.capacity = opts.capacity;
    this.refillPerMs = opts.refillPerSec / 1000;
    this.now = opts.now ?? Date.now;
    this.tokens = opts.capacity;
    this.lastRefillAt = this.now();
  }

  consume(): boolean {
    this.refill();
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private refill(): void {
    if (this.refillPerMs === 0) return;
    const t = this.now();
    const elapsed = t - this.lastRefillAt;
    if (elapsed <= 0) return;
    const credit = elapsed * this.refillPerMs;
    this.tokens = Math.min(this.capacity, this.tokens + credit);
    this.lastRefillAt = t;
  }
}

export function defineTokenBucket(opts: TokenBucketOptions): TokenBucket {
  return new TokenBucketImpl(opts);
}
```

- [ ] **Step 4: Re-run the test**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test -- rate-limit
```

Expected: all 5 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/signaling-protocol/src/rate-limit.ts packages/signaling-protocol/test/unit/rate-limit.test.ts
git commit -m "feat(signaling-protocol): TokenBucket helper for rate limiting (EPIC-22 #1/9)"
```

---

## Task 2: `SignalingRateLimitError`

**Files:**
- Modify: `packages/signaling-protocol/src/errors.ts`
- Modify: `packages/signaling-protocol/src/index.ts`

- [ ] **Step 1: Add the new error class**

In `packages/signaling-protocol/src/errors.ts`, append after the existing `PeerNotFoundError` block:

```ts
/**
 * Thrown when a peer's per-type rate-limit token bucket is empty. The
 * engine surfaces this immediately on `applyChat` / `applyPresenceUpdate`;
 * the message is NOT relayed. Hosts decide whether to surface it back to
 * the client (typed error frame, close code, etc.).
 */
export class SignalingRateLimitError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "rate_limited" });
    this.name = "SignalingRateLimitError";
  }
}
```

- [ ] **Step 2: Re-export from index**

Open `packages/signaling-protocol/src/index.ts`, find the existing `errors.ts` re-export block, and add `SignalingRateLimitError` to the exported names. Look for the existing pattern that exports `PeerNotFoundError`, `SignalingAuthError`, etc., and append `SignalingRateLimitError` to the same export.

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add packages/signaling-protocol/src/errors.ts packages/signaling-protocol/src/index.ts
git commit -m "feat(signaling-protocol): SignalingRateLimitError(code: rate_limited) (EPIC-22 #2/9)"
```

---

## Task 3: Wire format — `replayHistory` on `JoinRoom`, new `ChatHistory` message

**Files:**
- Modify: `packages/signaling-protocol/src/messages.ts`

- [ ] **Step 1: Add `replayHistory` to `JoinRoom`**

In `packages/signaling-protocol/src/messages.ts`, replace the `JoinRoom` block:

```ts
/**
 * Client → server. Enter a room with the chosen identity and role.
 *
 * The engine emits `peer-joined` to existing room members AND back to the
 * joiner for each existing peer, so the joiner sees the room as it stands.
 *
 * Optional `replayHistory: true` opts the joiner into receiving a single
 * `chat-history` message right after `presence-snapshot`, containing up to
 * the engine's `chatHistoryPerRoom` most-recent chats. Omitted means the
 * joiner does not want history — preserves the v0.1 behavior so legacy
 * clients are unaffected by the new message type.
 */
export const JoinRoom = z.object({
  type: z.literal("join"),
  room: RoomId,
  peer: PeerId,
  role: Role,
  replayHistory: z.boolean().optional(),
});
```

- [ ] **Step 2: Add `ChatHistory` schema**

Right after the existing `Chat` schema definition, append:

```ts
/**
 * Server → client. One-shot replay of the room's most-recent chats. Sent
 * only when the joiner set `replayHistory: true` on their `join` AND the
 * engine has `chatHistoryPerRoom > 0`. Empty `messages` array if no history
 * has accumulated yet.
 *
 * `messages` are full `Chat` records (including `clientId` when the sender
 * provided one, ts, to, etc.) so consumers can render them indistinguishably
 * from live chats.
 */
export const ChatHistory = z.object({
  type: z.literal("chat-history"),
  room: RoomId,
  messages: z.array(Chat),
});
```

- [ ] **Step 3: Extend `SignalingMessage` union + add the inferred type**

In the same file, find the `SignalingMessage = z.discriminatedUnion(...)` array and add `ChatHistory`:

```ts
export const SignalingMessage = z.discriminatedUnion("type", [
  JoinRoom,
  LeaveRoom,
  PeerJoined,
  PeerLeft,
  Sdp,
  IceCand,
  PresenceUpdate,
  PresenceState,
  PresenceSnapshot,
  Chat,
  ChatHistory,
]);
```

And add the inferred type alongside the others (look for the `export type ChatMessage = z.infer<typeof Chat>;` line and append):

```ts
export type ChatHistoryMessage = z.infer<typeof ChatHistory>;
```

- [ ] **Step 4: Re-export from index**

In `packages/signaling-protocol/src/index.ts`, find the messages export block (look for `JoinRoom,`) and add `ChatHistory,` and `type ChatHistoryMessage,` to the corresponding export lists.

- [ ] **Step 5: Run the existing protocol suite to confirm no regressions**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: green. (The new schema is additive; existing tests don't send `replayHistory` and don't receive `chat-history`.)

- [ ] **Step 6: Commit**

```bash
git add packages/signaling-protocol/src/messages.ts packages/signaling-protocol/src/index.ts
git commit -m "feat(signaling-protocol): replayHistory on JoinRoom + ChatHistory message (EPIC-22 #3/9)"
```

---

## Task 4: `Room` gains an opt-in chat ring buffer

**Files:**
- Modify: `packages/signaling-protocol/src/rooms.ts`

- [ ] **Step 1: Update `RoomOptions` and add the buffer fields**

In `packages/signaling-protocol/src/rooms.ts`, update the `RoomOptions` interface:

```ts
/** Constructor options for a {@link Room}. */
export interface RoomOptions {
  /** Maximum simultaneous peers. New joiners past this throw {@link RoomFullError}. */
  capacity: number;
  /**
   * Cap on the per-room chat-history ring buffer. `0` (default) disables
   * the buffer entirely — `pushChat` becomes a no-op and `chatHistory`
   * always returns `[]`. The Session opts joiners into receiving the
   * history via `replayHistory: true` on their `join`.
   */
  chatHistoryLimit?: number;
}
```

- [ ] **Step 2: Update the `Room` class to hold + manage the buffer**

In the same file, add the two private fields next to the existing `presenceMap` (after line 44):

```ts
private readonly chatBuffer: import("./messages.ts").ChatMessage[] = [];
private readonly chatHistoryLimit: number;
```

Update the constructor to accept and store the limit:

```ts
constructor(id: RoomId, opts: RoomOptions) {
  this.id = id;
  this.capacity = opts.capacity;
  this.chatHistoryLimit = opts.chatHistoryLimit ?? 0;
}
```

- [ ] **Step 3: Add `pushChat` + `chatHistory` methods**

Append to the `Room` class (after the existing `presenceSnapshot()` method):

```ts
/**
 * Append a successfully-applied chat to the per-room ring buffer. No-op
 * when `chatHistoryLimit` is `0`. Old entries are dropped from the front
 * once the limit is reached.
 */
pushChat(msg: import("./messages.ts").ChatMessage): void {
  if (this.chatHistoryLimit === 0) return;
  this.chatBuffer.push(msg);
  while (this.chatBuffer.length > this.chatHistoryLimit) {
    this.chatBuffer.shift();
  }
}

/** Read-only snapshot of the chat history (oldest first). */
chatHistory(): readonly import("./messages.ts").ChatMessage[] {
  return this.chatBuffer;
}
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
```

Expected: green.

- [ ] **Step 5: Run the protocol suite**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: green. (The buffer is unwired in the Session — these methods exist but aren't called yet.)

- [ ] **Step 6: Commit**

```bash
git add packages/signaling-protocol/src/rooms.ts
git commit -m "feat(signaling-protocol): Room.pushChat + chatHistory ring buffer (EPIC-22 #4/9)"
```

---

## Task 5: Session — wire rate limits

**Files:**
- Modify: `packages/signaling-protocol/src/session.ts`
- Modify: `packages/signaling-protocol/src/engine.ts`
- Test: `packages/signaling-protocol/test/unit/session-rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/signaling-protocol/test/unit/session-rate-limit.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignalingRateLimitError } from "@/errors.ts";
import { defineSignalingEngine } from "@/engine.ts";
import type { SignalingMessageType } from "@/messages.ts";

const join = (peer: string, role: "publisher" | "viewer" | "presence" = "presence") =>
  JSON.stringify({ type: "join", room: "demo", peer, role });

const chat = (from: string, body: string) =>
  JSON.stringify({ type: "chat", from, body, ts: 1, clientId: `c-${body}` });

const presenceUpdate = (peer: string, key: string, value: unknown) =>
  JSON.stringify({ type: "presence-update", peer, attributes: { [key]: value } });

describe("Session — chat rate limit (EPIC-22)", () => {
  let now = 0;
  beforeEach(() => {
    now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });
  afterEach(() => vi.restoreAllMocks());

  it("rejects chat once the per-peer bucket is empty", async () => {
    const engine = defineSignalingEngine({ rateLimit: { chatPerSec: 2 } });
    const session = engine.openSession();
    session.onSend(() => {});

    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice", "publisher"));

    await session.handleMessage("sa", chat("alice", "1"));
    await session.handleMessage("sa", chat("alice", "2"));
    await expect(session.handleMessage("sa", chat("alice", "3"))).rejects.toBeInstanceOf(
      SignalingRateLimitError,
    );
  });

  it("recovers after the refill window", async () => {
    const engine = defineSignalingEngine({ rateLimit: { chatPerSec: 1 } });
    const session = engine.openSession();
    session.onSend(() => {});
    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice", "publisher"));

    await session.handleMessage("sa", chat("alice", "ok"));
    await expect(session.handleMessage("sa", chat("alice", "fast"))).rejects.toBeInstanceOf(
      SignalingRateLimitError,
    );

    now = 1_500; // 1.5s later, refill puts a token back
    await session.handleMessage("sa", chat("alice", "post-refill"));
  });

  it("does NOT cross-charge presence and chat budgets", async () => {
    const engine = defineSignalingEngine({
      rateLimit: { chatPerSec: 1, presenceUpdatesPerSec: 1 },
    });
    const session = engine.openSession();
    session.onSend(() => {});
    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice", "publisher"));

    await session.handleMessage("sa", chat("alice", "1"));
    // chat bucket is empty…
    await expect(session.handleMessage("sa", chat("alice", "2"))).rejects.toBeInstanceOf(
      SignalingRateLimitError,
    );
    // …but presence bucket is untouched.
    await session.handleMessage("sa", presenceUpdate("alice", "k", "v"));
  });

  it("no rate limit when option is omitted (default behavior preserved)", async () => {
    const engine = defineSignalingEngine();
    const session = engine.openSession();
    session.onSend(() => {});
    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice", "publisher"));

    for (let i = 0; i < 50; i++) {
      await session.handleMessage("sa", chat("alice", `${i}`));
    }
  });
});

describe("Session — presence rate limit (EPIC-22)", () => {
  let now = 0;
  beforeEach(() => {
    now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });
  afterEach(() => vi.restoreAllMocks());

  it("rejects presence-update once the bucket is empty", async () => {
    const engine = defineSignalingEngine({ rateLimit: { presenceUpdatesPerSec: 2 } });
    const session = engine.openSession();
    session.onSend(() => {});
    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice", "presence"));

    await session.handleMessage("sa", presenceUpdate("alice", "k", "v1"));
    await session.handleMessage("sa", presenceUpdate("alice", "k", "v2"));
    await expect(
      session.handleMessage("sa", presenceUpdate("alice", "k", "v3")),
    ).rejects.toBeInstanceOf(SignalingRateLimitError);
  });
});

// Silence unused import warnings for SignalingMessageType (kept for future tests).
void (null as SignalingMessageType | null);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test -- session-rate-limit
```

Expected: failures — rate limits aren't wired.

- [ ] **Step 3: Add `RateLimitOptions` to `SessionOptions` and engine options**

In `packages/signaling-protocol/src/session.ts`, update the imports near the top to include `defineTokenBucket` + the new error:

```ts
import { defineTokenBucket, type TokenBucket } from "./rate-limit.ts";
import {
  PeerNotFoundError,
  SignalingAuthError,
  SignalingRateLimitError,
  SignalingValidationError,
} from "./errors.ts";
```

(Update the existing errors import if it doesn't already include all three.)

Add the new options interface and update `SessionOptions`:

```ts
/** Per-peer rate-limit configuration. Each value is messages-per-second; `undefined` disables that limiter. */
export interface RateLimitOptions {
  /** Cap on `chat` messages per peer per second. */
  chatPerSec?: number;
  /** Cap on `presence-update` messages per peer per second. */
  presenceUpdatesPerSec?: number;
}

/** Session constructor options. */
export interface SessionOptions {
  /** Maximum simultaneous peers per room. Defaults to {@link DEFAULT_MAX_PEERS_PER_ROOM}. */
  maxPeersPerRoom?: number;
  /** Pluggable auth check called when a peer attempts a join. Default: allow all. */
  authenticate?: AuthenticateFn;
  /**
   * Per-peer rate limits on inbound `chat` and `presence-update` messages.
   * Over-budget messages reject with {@link SignalingRateLimitError} and are
   * NOT relayed. Disabled by default — `rateLimit` undefined or both fields
   * `undefined` means no throttling.
   */
  rateLimit?: RateLimitOptions;
  /**
   * Cap on the per-room chat-history ring buffer. `0` (default) disables.
   * Joiners that set `replayHistory: true` on their `join` receive a
   * `chat-history` message right after `presence-snapshot` containing the
   * last N chats.
   */
  chatHistoryPerRoom?: number;
}
```

- [ ] **Step 4: Track buckets per peer in the Session**

Add a private map next to the existing `peerIndex` field:

```ts
private readonly buckets = new Map<PeerId, { chat?: TokenBucket; presence?: TokenBucket }>();
```

Add the two new private fields (alongside `authenticate` / `maxPeersPerRoom`):

```ts
private readonly rateLimit?: RateLimitOptions;
private readonly chatHistoryPerRoom: number;
```

In the constructor, capture both:

```ts
this.rateLimit = opts.rateLimit;
this.chatHistoryPerRoom = opts.chatHistoryPerRoom ?? 0;
```

Add a private helper that returns (and lazily creates) the bucket pair for a peer:

```ts
private bucketsFor(peerId: PeerId): { chat?: TokenBucket; presence?: TokenBucket } {
  let entry = this.buckets.get(peerId);
  if (entry === undefined) {
    entry = {};
    if (this.rateLimit?.chatPerSec !== undefined && this.rateLimit.chatPerSec > 0) {
      entry.chat = defineTokenBucket({
        capacity: this.rateLimit.chatPerSec,
        refillPerSec: this.rateLimit.chatPerSec,
      });
    }
    if (
      this.rateLimit?.presenceUpdatesPerSec !== undefined &&
      this.rateLimit.presenceUpdatesPerSec > 0
    ) {
      entry.presence = defineTokenBucket({
        capacity: this.rateLimit.presenceUpdatesPerSec,
        refillPerSec: this.rateLimit.presenceUpdatesPerSec,
      });
    }
    this.buckets.set(peerId, entry);
  }
  return entry;
}
```

In `handleDisconnect`, after the existing `this.peerIndex.delete(socket.peerId);`, add:

```ts
this.buckets.delete(socket.peerId);
```

- [ ] **Step 5: Enforce the chat bucket in `applyChat`**

In `applyChat`, immediately after the validation block that throws `SignalingValidationError` for missing peer binding, insert:

```ts
const bucket = this.bucketsFor(socket.peerId).chat;
if (bucket !== undefined && !bucket.consume()) {
  throw new SignalingRateLimitError("chat rate limit exceeded", {
    context: { socketId: socket.socketId, peer: socket.peerId },
  });
}
```

- [ ] **Step 6: Enforce the presence bucket in `applyPresenceUpdate`**

Find the existing `applyPresenceUpdate` method. After the existing validation block (the one that throws `SignalingValidationError` when `socket.peerId` doesn't match the message), insert:

```ts
const bucket = this.bucketsFor(socket.peerId).presence;
if (bucket !== undefined && !bucket.consume()) {
  throw new SignalingRateLimitError("presence-update rate limit exceeded", {
    context: { socketId: socket.socketId, peer: socket.peerId },
  });
}
```

- [ ] **Step 7: Forward through `SignalingEngineOptions`**

In `packages/signaling-protocol/src/engine.ts`, update the imports and options:

```ts
import { Session, type AuthenticateFn, type RateLimitOptions } from "./session.ts";

export interface SignalingEngineOptions {
  /** Maximum peers per room. Defaults to 50 (see `Session.DEFAULT_MAX_PEERS_PER_ROOM`). */
  maxPeersPerRoom?: number;
  /** Optional auth check called on every join. Default: allow all. */
  authenticate?: AuthenticateFn;
  /** Per-peer rate limits forwarded to every {@link Session} this engine creates. */
  rateLimit?: RateLimitOptions;
  /** Per-room chat-history buffer cap forwarded to every {@link Session}. `0` (default) disables. */
  chatHistoryPerRoom?: number;
}
```

The `openSession()` method already passes `this.options` to `new Session(...)`, so the new fields land automatically.

- [ ] **Step 8: Re-run the new test**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test -- session-rate-limit
```

Expected: all 5 pass.

- [ ] **Step 9: Run the full protocol suite to confirm no regression**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: green.

- [ ] **Step 10: Commit**

```bash
git add packages/signaling-protocol/src/session.ts packages/signaling-protocol/src/engine.ts packages/signaling-protocol/test/unit/session-rate-limit.test.ts
git commit -m "feat(signaling-protocol): per-peer chat + presence rate limits (EPIC-22 #5/9)"
```

---

## Task 6: Session — chat history persistence + late-joiner replay

**Files:**
- Modify: `packages/signaling-protocol/src/session.ts`
- Test: `packages/signaling-protocol/test/unit/session-chat-history.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/signaling-protocol/test/unit/session-chat-history.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { defineSignalingEngine } from "@/engine.ts";
import type { SignalingMessageType } from "@/messages.ts";

const join = (peer: string, opts: { replayHistory?: boolean } = {}) =>
  JSON.stringify({
    type: "join",
    room: "demo",
    peer,
    role: "presence" as const,
    ...(opts.replayHistory ? { replayHistory: true } : {}),
  });

const chat = (from: string, body: string) =>
  JSON.stringify({ type: "chat", from, body, ts: 1, clientId: `c-${body}` });

describe("Session — chat history (EPIC-22)", () => {
  it("replays history to a joiner that requested replayHistory", async () => {
    const engine = defineSignalingEngine({ chatHistoryPerRoom: 5 });
    const session = engine.openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice"));
    await session.handleMessage("sa", chat("alice", "first"));
    await session.handleMessage("sa", chat("alice", "second"));

    sent.length = 0;
    await session.handleConnection("sb", {});
    await session.handleMessage("sb", join("bob", { replayHistory: true }));

    const history = sent.find((s) => s.peerId === "bob" && s.msg.type === "chat-history");
    expect(history).toBeDefined();
    const payload = history!.msg as Extract<SignalingMessageType, { type: "chat-history" }>;
    expect(payload.room).toBe("demo");
    expect(payload.messages.map((m) => m.body)).toEqual(["first", "second"]);
  });

  it("does NOT send chat-history when the joiner omits replayHistory", async () => {
    const engine = defineSignalingEngine({ chatHistoryPerRoom: 5 });
    const session = engine.openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice"));
    await session.handleMessage("sa", chat("alice", "x"));

    sent.length = 0;
    await session.handleConnection("sb", {});
    await session.handleMessage("sb", join("bob")); // no replayHistory

    expect(sent.find((s) => s.msg.type === "chat-history")).toBeUndefined();
  });

  it("does NOT send chat-history when chatHistoryPerRoom is 0 even if joiner asks", async () => {
    const engine = defineSignalingEngine(); // chatHistoryPerRoom defaults to 0
    const session = engine.openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice"));
    await session.handleMessage("sa", chat("alice", "x"));

    sent.length = 0;
    await session.handleConnection("sb", {});
    await session.handleMessage("sb", join("bob", { replayHistory: true }));

    expect(sent.find((s) => s.msg.type === "chat-history")).toBeUndefined();
  });

  it("ring-buffers — only the last N messages survive", async () => {
    const engine = defineSignalingEngine({ chatHistoryPerRoom: 3 });
    const session = engine.openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice"));
    for (let i = 0; i < 10; i++) {
      await session.handleMessage("sa", chat("alice", `m${i}`));
    }

    sent.length = 0;
    await session.handleConnection("sb", {});
    await session.handleMessage("sb", join("bob", { replayHistory: true }));

    const history = sent.find((s) => s.msg.type === "chat-history");
    const payload = history!.msg as Extract<SignalingMessageType, { type: "chat-history" }>;
    expect(payload.messages.map((m) => m.body)).toEqual(["m7", "m8", "m9"]);
  });

  it("sends an empty chat-history when no messages have accumulated", async () => {
    const engine = defineSignalingEngine({ chatHistoryPerRoom: 5 });
    const session = engine.openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice", { replayHistory: true }));

    const history = sent.find((s) => s.peerId === "alice" && s.msg.type === "chat-history");
    expect(history).toBeDefined();
    expect((history!.msg as { messages: unknown[] }).messages).toEqual([]);
  });
});

// Silence unused import warning during compilation transitions.
void vi.fn;
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test -- session-chat-history
```

Expected: failures — chat history isn't wired.

- [ ] **Step 3: Forward `chatHistoryPerRoom` into Room construction**

In `packages/signaling-protocol/src/session.ts`, find the existing `getOrCreateRoom` private method:

```ts
private getOrCreateRoom(roomId: RoomId): Room {
  let room = this.roomMap.get(roomId);
  if (room === undefined) {
    room = defineRoom({ id: roomId, capacity: this.maxPeersPerRoom });
    this.roomMap.set(roomId, room);
  }
  return room;
}
```

Replace with:

```ts
private getOrCreateRoom(roomId: RoomId): Room {
  let room = this.roomMap.get(roomId);
  if (room === undefined) {
    room = defineRoom({
      id: roomId,
      capacity: this.maxPeersPerRoom,
      chatHistoryLimit: this.chatHistoryPerRoom,
    });
    this.roomMap.set(roomId, room);
  }
  return room;
}
```

- [ ] **Step 4: Push successful chats into the ring buffer**

In `applyChat`, after the existing `if (room === undefined) return;` line and BEFORE the `const echoToSender = ...` line, insert:

```ts
room.pushChat(message);
```

- [ ] **Step 5: Send `chat-history` to opt-in joiners**

In `applyJoin`, find the existing `presence-snapshot` send:

```ts
this.send(message.peer, {
  type: "presence-snapshot",
  room: message.room,
  peers: room.presenceSnapshot(),
});
```

Immediately after that send, append:

```ts
if (message.replayHistory === true && this.chatHistoryPerRoom > 0) {
  this.send(message.peer, {
    type: "chat-history",
    room: message.room,
    messages: [...room.chatHistory()],
  });
}
```

- [ ] **Step 6: Re-run the new test**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test -- session-chat-history
```

Expected: all 5 pass.

- [ ] **Step 7: Run the full protocol suite**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: green.

- [ ] **Step 8: Commit**

```bash
git add packages/signaling-protocol/src/session.ts packages/signaling-protocol/test/unit/session-chat-history.test.ts
git commit -m "feat(signaling-protocol): chat history ring buffer + replay (EPIC-22 #6/9)"
```

---

## Task 7: `RoomChannel` — opt into history + apply incoming `chat-history`

**Files:**
- Modify: `packages/core/src/room/types.ts`
- Modify: `packages/core/src/room/room-channel.ts`
- Test: `packages/core/test/unit/room/room-channel-history.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/unit/room/room-channel-history.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineRoomChannel } from "@/room/room-channel.ts";
import type { ChatHistoryEntry } from "@/room/types.ts";
import { defineEngineFixture, type EngineFixture } from "@forinda/test-helpers";

describe("RoomChannel — chat history replay (EPIC-22)", () => {
  let fx: EngineFixture;
  beforeEach(() => {
    fx = defineEngineFixture({ chatHistoryPerRoom: 10 });
  });
  afterEach(async () => {
    await fx.closeAll();
  });

  it("opts into history via replayHistory; receives a chat-history event", async () => {
    const aTransport = await fx.open("sa");
    const a = defineRoomChannel({ signaling: aTransport, room: "demo", peerId: "alice" });
    await a.start();
    await a.sendChat("first");
    await a.sendChat("second");

    const bTransport = await fx.open("sb");
    const b = defineRoomChannel({
      signaling: bTransport,
      room: "demo",
      peerId: "bob",
      replayHistory: true,
    });

    const histories: ChatHistoryEntry[][] = [];
    b.on("chat-history", (h) => histories.push(h));

    await b.start();
    // Engine fans out the chat-history immediately on join — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(histories).toHaveLength(1);
    expect(histories[0]?.map((e) => e.body)).toEqual(["first", "second"]);
    // chatHistory is seeded with the replayed messages.
    expect(b.chatHistory.map((e) => e.body)).toEqual(["first", "second"]);
    // All status: confirmed (these arrived from the server).
    expect(b.chatHistory.every((e) => e.status === "confirmed")).toBe(true);
  });

  it("does NOT receive chat-history when replayHistory is omitted", async () => {
    const aTransport = await fx.open("sa");
    const a = defineRoomChannel({ signaling: aTransport, room: "demo", peerId: "alice" });
    await a.start();
    await a.sendChat("x");

    const bTransport = await fx.open("sb");
    const b = defineRoomChannel({ signaling: bTransport, room: "demo", peerId: "bob" });

    const histories: ChatHistoryEntry[][] = [];
    b.on("chat-history", (h) => histories.push(h));

    await b.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(histories).toHaveLength(0);
    expect(b.chatHistory).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Update `defineEngineFixture` to accept `chatHistoryPerRoom`**

The test fixture needs to forward the option to its inner `defineSession`. Open `packages/test-helpers/src/engine-fixture.ts` and find the `defineEngineFixture()` function. Replace its signature + body to accept options:

```ts
export interface EngineFixtureOptions {
  chatHistoryPerRoom?: number;
}

export function defineEngineFixture(opts: EngineFixtureOptions = {}): EngineFixture {
  const session = defineSession(opts);
  // …rest unchanged: keep the existing transports map, onSend handler,
  //   open/closeAll definitions exactly as they were.
}
```

(Keep every other line in the function body as-is — only the signature + the `defineSession()` call change.)

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @forinda/test-helpers build && pnpm --filter @forinda/video-sdk-core test -- room-channel-history
```

Expected: failures — `replayHistory` option + `chat-history` event don't exist.

- [ ] **Step 4: Add `replayHistory` to `RoomChannelOptions` + `chat-history` to the events map**

In `packages/core/src/room/types.ts`, update `RoomChannelOptions` to add the option (insert next to the existing `chatAckTimeoutMs` field):

```ts
/**
 * Opt the channel into receiving the engine's chat-history replay on
 * `start()`. The engine sends a one-shot `chat-history` message right
 * after `presence-snapshot`; the channel seeds `chatHistory` with the
 * replayed messages and emits a `chat-history` event. Default `false`
 * preserves v0.1 behavior.
 */
replayHistory?: boolean;
```

Add the same to `AttachedRoomChannelOptions`:

```ts
replayHistory?: boolean;
```

Update `RoomChannelEvents` to add the event:

```ts
/** Fires once on start when the engine replays chat history (opt-in via `replayHistory: true`). */
"chat-history": ChatHistoryEntry[];
```

- [ ] **Step 5: Apply the option + handle the inbound message in `RoomChannel`**

In `packages/core/src/room/room-channel.ts`:

5a. Add a private field next to the others:

```ts
private readonly replayHistory: boolean;
```

5b. In the constructor, capture the option (after the existing `this.chatAckTimeoutMs = ...` line):

```ts
this.replayHistory = opts.replayHistory ?? false;
```

5c. Find the standalone-`join` send block in `start()`:

```ts
await this.signaling.send({
  type: "join",
  room: this.room,
  peer: this.peerId,
  role: "presence",
});
```

Replace with:

```ts
await this.signaling.send({
  type: "join",
  room: this.room,
  peer: this.peerId,
  role: "presence",
  ...(this.replayHistory ? { replayHistory: true } : {}),
});
```

5d. In `routeMessage`, add a new case before the existing `chat` case:

```ts
case "chat-history":
  this.applyChatHistory(message);
  return;
```

5e. Add the handler method right next to `applyChat`:

```ts
private applyChatHistory(
  message: Extract<
    import("@forinda/video-sdk-signaling-protocol").SignalingMessageType,
    { type: "chat-history" }
  >,
): void {
  if (message.room !== this.room) return;
  const entries: ChatHistoryEntry[] = message.messages.map((m) => ({
    ...m,
    receivedAt: Date.now(),
    id: m.clientId ?? this.generateChatId(),
    status: "confirmed",
  }));
  // Prepend the replay to the existing buffer (history first, then any
  // optimistic chats sent before the replay arrived). Trim to the limit.
  this.chatBuffer.unshift(...entries);
  while (this.chatBuffer.length > this.chatHistoryLimit) {
    this.chatBuffer.shift();
  }
  this.emitter.emit("chat-history", entries);
}
```

- [ ] **Step 6: Re-run the test**

```bash
pnpm --filter @forinda/video-sdk-core test -- room-channel-history
```

Expected: both pass.

- [ ] **Step 7: Run the full core suite**

```bash
pnpm --filter @forinda/video-sdk-core test
```

Expected: green.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/room/types.ts packages/core/src/room/room-channel.ts packages/core/test/unit/room/room-channel-history.test.ts packages/test-helpers/src/engine-fixture.ts
git commit -m "feat(core): RoomChannel.replayHistory + chat-history event (EPIC-22 #7/9)"
```

---

## Task 8: README updates

**Files:**
- Modify: `packages/signaling-protocol/README.md`
- Modify: `packages/core/README.md`

- [ ] **Step 1: Update `packages/signaling-protocol/README.md`**

Find the section that documents `defineSignalingEngine` (look for `SignalingEngineOptions`). After the existing options table, append:

````markdown
### Per-peer rate limits

```ts
const engine = defineSignalingEngine({
  rateLimit: { chatPerSec: 5, presenceUpdatesPerSec: 10 },
});
```

Each option enables a per-peer token bucket of size = capacity = refill rate. Burst allowance equals the per-second cap. Over-budget messages reject with `SignalingRateLimitError(code: "rate_limited")`; the message is NOT relayed. Buckets are released when the peer disconnects.

`undefined` (or `0`) on either field disables that limiter independently — the chat budget can be capped without touching presence and vice versa.

### Chat-history replay

```ts
const engine = defineSignalingEngine({ chatHistoryPerRoom: 50 });
```

Each room keeps a ring buffer of its last N chats. Joiners that send `replayHistory: true` on their `join` receive a one-shot `chat-history` message right after `presence-snapshot` — empty `messages` array if no history has accumulated yet.

Old clients omit the flag; they never see the new message type and continue working unchanged.
````

- [ ] **Step 2: Update `packages/core/README.md`**

In the `RoomChannel` section, append a subsection right under the existing "Retry + presence resync" block:

````markdown
#### Chat-history replay

Opt into the engine's per-room chat-history replay so late joiners catch up on the conversation:

```ts
const channel = defineRoomChannel({
  signaling,
  room: "demo",
  peerId: "alice",
  replayHistory: true,
});

channel.on("chat-history", (entries) => {
  console.log(`replayed ${entries.length} historical chats`);
});

await channel.start();
// channel.chatHistory now contains the replayed messages (status: "confirmed").
```

The engine must be configured with `chatHistoryPerRoom > 0` for the replay to fire — otherwise the flag is a no-op. Replayed entries land in `chatHistory` with `status: "confirmed"`; the `chat-history` event fires once per `start()`.
````

- [ ] **Step 3: Format**

```bash
pnpm format && pnpm format:check
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add packages/signaling-protocol/README.md packages/core/README.md
git commit -m "docs: rate limits + chat history replay (EPIC-22 #8/9)"
```

---

## Task 9: Workspace verify, changeset, tag

**Files:**
- Create: `.changeset/engine-hardening.md`

- [ ] **Step 1: Workspace verify**

```bash
pnpm typecheck && pnpm test && pnpm build && pnpm lint
```

Expected: every step exits 0.

- [ ] **Step 2: Create the changeset**

Create `.changeset/engine-hardening.md`:

```markdown
---
"@forinda/video-sdk-signaling-protocol": minor
"@forinda/video-sdk-core": minor
"@forinda/video-sdk-react": patch
"@forinda/video-sdk-vue": patch
"@forinda/video-sdk-signaling-ws": patch
"@forinda/video-sdk-signaling-broadcast": patch
"@forinda/video-sdk-elements": patch
---

Engine hardening: per-peer rate limits + opt-in chat-history replay.

### Added

- **Per-peer rate limits** on `chat` and `presence-update`. New `defineSignalingEngine({ rateLimit: { chatPerSec, presenceUpdatesPerSec } })` option installs token buckets per peer per message type. Over-budget messages reject with the new `SignalingRateLimitError(code: "rate_limited")` — they are NOT relayed. Disabled by default; each cap is independent.
- **Per-room chat history** on the engine. New `defineSignalingEngine({ chatHistoryPerRoom })` option keeps a ring buffer of the last N chats per room. Joiners opt into the replay by setting `replayHistory: true` on their `join` — the engine then sends a single `chat-history` wire message right after `presence-snapshot`. Old clients omit the flag and continue to work unchanged (no breaking wire-format change for non-opting consumers).
- **`RoomChannel` adapter**: new `replayHistory?: boolean` option mirrors the wire flag. When set, the channel seeds `chatHistory` from the replay and emits a `chat-history` event once.

### Rationale

`presence-update` and `chat` are the cheapest messages to spam — without limits one rogue peer can flood the relay path. The per-peer token bucket caps each independently, fails closed at the engine boundary (no half-relayed messages), and burns peer-local state that's reclaimed on disconnect.

Chat-history replay closes the obvious gap for late joiners — moderation chat, support tickets, and recorded sessions all need newcomers to see the room as it stands. The opt-in flag keeps it a zero-cost upgrade for consumers that don't need it.
```

- [ ] **Step 3: Commit + tag**

```bash
git add .changeset/engine-hardening.md
git commit -m "chore: changeset for EPIC-22 engine hardening (EPIC-22 #9/9)"
git tag -a v0.0.0-epic-22 -m "EPIC-22: Engine rate limits + chat history"
```

---

## Self-review notes

**Spec coverage** (vs. roadmap acceptance criteria for EPIC-22):

- ✅ `defineSignalingEngine({ rateLimit: { presenceUpdatesPerSec, chatPerSec } })` throttles per peer; over-budget messages → error with code `rate_limited` — Tasks 1, 2, 5.
- ✅ `defineSignalingEngine({ chatHistoryPerRoom: 50 })` keeps last N chats — Tasks 4, 6.
- ✅ Joiners receive `chat-history` after `presence-snapshot` (opt-in, design choice (a)) — Tasks 3, 6.
- ✅ Both opt-in with sensible defaults (off / 0) — Tasks 5, 6.
- ✅ Tests cover burst limit, recovery after window, late-joiner replay — Tasks 1, 5, 6.
- ✅ Adapter wiring (RoomChannel.replayHistory) — Task 7.

**Type consistency:**
- `RateLimitOptions` defined once in `session.ts`, re-exported through `engine.ts`.
- `ChatHistory` schema + `ChatHistoryMessage` inferred type defined together in `messages.ts`.
- `RoomChannel.replayHistory` (option) ↔ `JoinRoom.replayHistory` (wire) ↔ `chat-history` event payload all line up by name.
- New `Room.pushChat` / `chatHistory()` methods consistent with the existing `Room` API style.

**Placeholders:** none. Every step has concrete code or commands.

**Gotcha worth flagging:** Task 5's bucket lookup happens AFTER the existing peer-binding validation in `applyChat` / `applyPresenceUpdate`, so a malformed message that fails the bind check throws `SignalingValidationError` (existing behavior) rather than charging a token. That's intentional — rate-limit a peer for *legitimate* sends, not for protocol violations.
