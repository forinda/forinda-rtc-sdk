# EPIC-20 RoomChannel Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `RoomChannel` survive transport drops the same way Publisher/Viewer do (rejoin + presence resync), and add optimistic chat with server-acknowledged reconciliation.

**Architecture:**

- **Wire format**: extend the `Chat` schema with an optional `clientId` field. The engine round-trips it untouched and — only when present — also echoes the message back to the sender (existing clients without `clientId` get the existing fan-out, no duplicate echo, no breakage).
- **Optimistic chat**: `RoomChannel.sendChat()` synchronously appends a `pending` entry to `chatHistory`, emits `chat` + `chat-status` events, then awaits `signaling.send`. The server's echo (matched by `clientId`) flips the entry to `confirmed`. A configurable timeout (`chatAckTimeoutMs`, default 10s) flips to `failed`.
- **RoomChannel retry + presence resync**: subscribe to `transport.state`. On `closed` after `start()`, drive a `defineRetryPolicy`-backed reconnect loop that re-issues `connect`, re-issues `join` (when `manageJoin`), re-broadcasts every previously-set presence attribute, and marks all in-flight pending chats as `failed`. Add a channel-level `state` event so consumers don't have to derive it from raw transport state.

**Tech Stack:** TypeScript, Vitest, `@forinda/test-helpers` (`defineEngineFixture`), `@forinda/video-sdk-core`'s existing `defineRetryPolicy`, Vue 3 + React 18 adapters.

---

## File structure

| File | Responsibility |
| --- | --- |
| `packages/signaling-protocol/src/messages.ts` | Add `clientId` to `Chat` zod schema (optional, max 64 chars). |
| `packages/signaling-protocol/src/session.ts` | In `applyChat`, when `message.clientId !== undefined`, also send the message back to the sender. |
| `packages/signaling-protocol/test/unit/session-presence-chat.test.ts` | New test: `clientId` round-trips and triggers a self-echo. |
| `packages/core/src/room/types.ts` | Add `id` + `status` to `ChatHistoryEntry`. New `RoomChannelState` type. New `RoomChannelEvents` keys: `state`, `chat-status`. New options: `retry`, `chatAckTimeoutMs`. |
| `packages/core/src/room/room-channel.ts` | Optimistic `sendChat`, ack reconciliation, ack timeout, `state` machine, retry/reconnect, presence resync. |
| `packages/core/test/unit/room/room-channel-chat-status.test.ts` | New: optimistic append, server-echo confirmation, timeout → failed. |
| `packages/core/test/unit/room/room-channel-state.test.ts` | New: state event firing through start/connect/disconnect. |
| `packages/core/test/unit/room/room-channel-retry.test.ts` | New: reconnect loop + presence resync + pending-failed marking. |
| `packages/react/src/use-chat.ts` | Plumb new `id` / `status` (already in `ChatHistoryEntry`). Expose `sendChat` returning `Promise<string>`. New `useChatStatus` for ack subscriptions. |
| `packages/vue/src/use-chat.ts` | Same surface as React, Vue ergonomics. |
| `packages/react/test/unit/use-chat.test.tsx` | Cover new return value + status surfacing. |
| `packages/vue/test/unit/use-chat.test.ts` | Same. |
| `packages/core/README.md`, `packages/react/README.md`, `packages/vue/README.md` | Document optimistic chat + retry options. |
| `.changeset/roomchannel-resilience.md` | minor for `core` + `signaling-protocol`; patch for `react`, `vue`, signaling-ws/broadcast (peer-dep cascade). |

---

## Task 1: Wire format — `clientId` on `Chat` + opt-in self-echo

**Files:**
- Modify: `packages/signaling-protocol/src/messages.ts:180-186`
- Modify: `packages/signaling-protocol/src/session.ts:410-433`
- Test: `packages/signaling-protocol/test/unit/session-presence-chat.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/signaling-protocol/test/unit/session-presence-chat.test.ts`:

```ts
describe("Session — chat clientId echo (EPIC-20)", () => {
  it("echoes a clientId-tagged chat back to the sender", async () => {
    const session = defineSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => sent.push({ peerId, msg }));

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleMessage(
      "sa",
      JSON.stringify({ type: "join", room: "demo", peer: "alice", role: "publisher" }),
    );
    await session.handleMessage(
      "sb",
      JSON.stringify({ type: "join", room: "demo", peer: "bob", role: "presence" }),
    );
    sent.length = 0;

    await session.handleMessage(
      "sa",
      JSON.stringify({
        type: "chat",
        from: "alice",
        body: "hello",
        ts: 123,
        clientId: "abc-123",
      }),
    );

    const chats = sent.filter((s) => s.msg.type === "chat");
    expect(chats.map((s) => s.peerId).sort()).toEqual(["alice", "bob"]);
    for (const c of chats) {
      expect(c.msg).toMatchObject({
        type: "chat",
        from: "alice",
        body: "hello",
        clientId: "abc-123",
      });
    }
  });

  it("does NOT echo to the sender when clientId is omitted (legacy clients)", async () => {
    const session = defineSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => sent.push({ peerId, msg }));

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleMessage(
      "sa",
      JSON.stringify({ type: "join", room: "demo", peer: "alice", role: "publisher" }),
    );
    await session.handleMessage(
      "sb",
      JSON.stringify({ type: "join", room: "demo", peer: "bob", role: "presence" }),
    );
    sent.length = 0;

    await session.handleMessage(
      "sa",
      JSON.stringify({ type: "chat", from: "alice", body: "hello", ts: 123 }),
    );

    const chats = sent.filter((s) => s.msg.type === "chat");
    expect(chats.map((s) => s.peerId)).toEqual(["bob"]);
  });
});
```

If the file has no `import type { SignalingMessageType }` line, add `import type { SignalingMessageType } from "@/messages.ts";` to the existing imports at the top.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test -- session-presence-chat
```

Expected: **2 failures** in the new `clientId echo` describe block — first one fails to validate `clientId` (zod rejects unknown key), second passes.

- [ ] **Step 3: Add `clientId` to the `Chat` schema**

In `packages/signaling-protocol/src/messages.ts`, replace the `Chat` definition (currently at lines 180-186):

```ts
export const Chat = z.object({
  type: z.literal("chat"),
  from: PeerId,
  to: PeerId.optional(),
  body: z.string().min(1).max(8192),
  ts: z.number().int().nonnegative(),
  /**
   * Optional client-generated identifier (max 64 chars). When present, the
   * server round-trips it untouched AND echoes the message back to the
   * sender so optimistic UIs can reconcile the local pending entry. Legacy
   * clients (no `clientId`) get the original "fan-out to others only"
   * behavior so they don't see a duplicate of their own message.
   */
  clientId: z.string().min(1).max(64).optional(),
});
```

- [ ] **Step 4: Echo to sender when `clientId` is present**

In `packages/signaling-protocol/src/session.ts`, replace the `applyChat` body (currently at lines 410-433) with:

```ts
private applyChat(
  socket: SocketRecord,
  message: Extract<SignalingMessageType, { type: "chat" }>,
): void {
  if (socket.peerId !== message.from || socket.roomId === undefined) {
    throw new SignalingValidationError("chat requires a joined socket bound to the same peer", {
      context: { socketId: socket.socketId, claimed: message.from, bound: socket.peerId },
    });
  }
  const room = this.roomMap.get(socket.roomId);
  if (room === undefined) return;

  const echoToSender = message.clientId !== undefined;

  if (message.to !== undefined) {
    if (room.has(message.to)) {
      this.send(message.to, message);
    }
    if (echoToSender && message.to !== message.from) {
      this.send(message.from, message);
    }
    return;
  }
  for (const member of room.peers()) {
    if (member.peerId !== message.from || echoToSender) {
      this.send(member.peerId, message);
    }
  }
}
```

- [ ] **Step 5: Re-run the test**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test -- session-presence-chat
```

Expected: all chat tests **pass** (existing 4 + new 2 = 6).

- [ ] **Step 6: Run the broader protocol test suite to confirm no regression**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: every test passes.

- [ ] **Step 7: Commit**

```bash
git add packages/signaling-protocol/src/messages.ts packages/signaling-protocol/src/session.ts packages/signaling-protocol/test/unit/session-presence-chat.test.ts
git commit -m "feat(signaling-protocol): opt-in clientId on Chat + sender-echo (EPIC-20 #1/9)"
```

---

## Task 2: Extend `ChatHistoryEntry` with `id` and `status`

**Files:**
- Modify: `packages/core/src/room/types.ts:50-52`
- Modify: `packages/core/src/room/room-channel.ts:247-254` (only the entry construction; rest in later tasks)
- Test: `packages/core/test/unit/room/room-channel.test.ts` (existing — verify backward compat)

- [ ] **Step 1: Update `ChatHistoryEntry` and add `RoomChannelState` + new event keys**

Replace the `ChatHistoryEntry` interface in `packages/core/src/room/types.ts` (currently lines 50-52) and append the new types and event-map keys. Final state of the file (replace from line 50 down):

```ts
/**
 * One chat message in the rolling history.
 *
 * - `id`: the `clientId` that round-trips through the server. For chats
 *   this peer originated, the id is generated locally and reused for the
 *   server echo. For incoming chats from other peers, the id is taken
 *   from `msg.clientId` when present, otherwise generated locally so
 *   every entry has a stable identifier.
 * - `status`: lifecycle. Always `"confirmed"` for incoming chats. For
 *   outgoing chats: starts `"pending"` (synchronous append on `sendChat`),
 *   flips to `"confirmed"` on server echo, or `"failed"` on
 *   `chatAckTimeoutMs` / `signaling.send` rejection.
 */
export interface ChatHistoryEntry extends ChatMessage {
  receivedAt: number;
  id: string;
  status: "pending" | "confirmed" | "failed";
}

/** Snapshot of a peer's presence delivered alongside the `presence` event. */
export interface PresenceEntry {
  peer: string;
  attributes: Record<string, JsonValue>;
}

/** Snapshot of a peer joining the room (mirrors signaling-protocol shape). */
export interface RoomPeerEntry {
  peer: string;
  role: RoleValue;
}

/** Lifecycle states for a `RoomChannel`. */
export type RoomChannelState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed";

/** Status update for a single chat entry. */
export interface ChatStatusEntry {
  id: string;
  status: ChatHistoryEntry["status"];
}

/** Typed event map emitted by `RoomChannel`. */
export type RoomChannelEvents = {
  /** Fires for each `presence-state` arriving on the wire (own + remote). */
  presence: PresenceEntry;
  /** Fires once after `start()` with the engine's initial presence snapshot. */
  "presence-snapshot": Record<string, Record<string, JsonValue>>;
  /** Fires for every `peer-joined` from the engine. */
  "peer-joined": RoomPeerEntry;
  /** Fires for every `peer-left` from the engine. */
  "peer-left": { peer: string };
  /** Fires for every `chat` delivered to this peer (broadcast or DM). */
  chat: ChatHistoryEntry;
  /** Fires when an outgoing chat's status changes. */
  "chat-status": ChatStatusEntry;
  /** Channel-level lifecycle state. */
  state: RoomChannelState;
  /** Internal channel error (validation, unexpected message). */
  error: Error;
};
```

Then update `RoomChannelOptions` (still in the same file) to add the two new options. Replace the existing interface block:

```ts
export interface RoomChannelOptions {
  /** Pre-built signaling transport. The channel never opens or closes it. */
  signaling: SignalingTransport;
  /** Room id this channel observes. */
  room: string;
  /** Peer id this channel speaks as. Defaults to `crypto.randomUUID()`. */
  peerId?: string;
  /**
   * When `true` the channel issues its own `join` (role: `"presence"`) and
   * matching `leave` on `start()` / `stop()`. Set `false` when sharing the
   * transport with a Publisher or Viewer that already manages the join —
   * the channel still subscribes to inbound messages but never speaks. */
  manageJoin?: boolean;
  /** Cap on the in-memory chat history buffer. Default `200`. */
  chatHistoryLimit?: number;
  /**
   * Auto-retry policy for transport drops. The channel reconnects, re-issues
   * `join` (when `manageJoin`), re-broadcasts the local presence map, and
   * marks all in-flight pending chats as `failed`. Default: enabled with
   * `defineRetryPolicy`'s defaults. Set `enabled: false` to disable.
   */
  retry?: RetryConfig;
  /**
   * Timeout (ms) before an un-acknowledged outgoing chat flips to `failed`.
   * Default `10_000`. The ack is a server-echo of the chat with the same
   * `clientId`, so the timeout covers both network drop and engine refusal.
   */
  chatAckTimeoutMs?: number;
  /**
   * **Internal.** Set by `defineAttachedRoomChannel`. Use the proxy
   * factory or `room.channel()` instead of touching this directly.
   */
  __leader?: RoomLeader;
}

/**
 * Constructor options for `defineAttachedRoomChannel`. `signaling` /
 * `room` / `peerId` / `manageJoin` come from the leader; consumers supply
 * only channel-local tunables.
 */
export interface AttachedRoomChannelOptions {
  chatHistoryLimit?: number;
  retry?: RetryConfig;
  chatAckTimeoutMs?: number;
}
```

Add the `RetryConfig` import at the top of `types.ts` (alongside the existing imports):

```ts
import type { RetryConfig } from "@/retry/policy.ts";
```

- [ ] **Step 2: Update `applyChat` in `room-channel.ts` so incoming entries get an `id` + `status`**

In `packages/core/src/room/room-channel.ts`, replace the `applyChat` method (currently at lines 247-254):

```ts
private applyChat(message: ChatMessage): void {
  const id = message.clientId ?? this.generateChatId();
  const entry: ChatHistoryEntry = {
    ...message,
    receivedAt: Date.now(),
    id,
    status: "confirmed",
  };
  this.chatBuffer.push(entry);
  while (this.chatBuffer.length > this.chatHistoryLimit) {
    this.chatBuffer.shift();
  }
  this.emitter.emit("chat", entry);
}

private generateChatId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
```

- [ ] **Step 3: Run room-channel tests to confirm backward compat**

```bash
pnpm --filter @forinda/video-sdk-core test -- room/room-channel
```

Expected: all existing tests **pass**. (The chat tests don't assert on `id` / `status` yet; the entry shape is wider but additive.)

- [ ] **Step 4: Run the full core + protocol suites**

```bash
pnpm --filter @forinda/video-sdk-core test && pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/room/types.ts packages/core/src/room/room-channel.ts
git commit -m "feat(core): add id/status to ChatHistoryEntry + new event keys (EPIC-20 #2/9)"
```

---

## Task 3: Optimistic `sendChat` + `chat-status` event

**Files:**
- Modify: `packages/core/src/room/room-channel.ts:194-203` (the `sendChat` method)
- Test: `packages/core/test/unit/room/room-channel-chat-status.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/unit/room/room-channel-chat-status.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineRoomChannel, type RoomChannel } from "@/room/room-channel.ts";
import type { ChatStatusEntry } from "@/room/types.ts";
import { defineEngineFixture, type EngineFixture } from "@forinda/test-helpers";

async function startChannel(
  socketId: string,
  peerId: string,
  fixture: EngineFixture,
): Promise<RoomChannel> {
  const transport = await fixture.open(socketId);
  const channel = defineRoomChannel({ signaling: transport, room: "demo", peerId });
  await channel.start();
  return channel;
}

describe("RoomChannel — optimistic chat (EPIC-20)", () => {
  let fx: EngineFixture;
  beforeEach(() => {
    fx = defineEngineFixture();
  });
  afterEach(async () => {
    await fx.closeAll();
  });

  it("appends a pending entry synchronously and returns its id", async () => {
    const a = await startChannel("sa", "alice", fx);

    const id = await a.sendChat("hello");

    expect(typeof id).toBe("string");
    expect(a.chatHistory).toHaveLength(1);
    const entry = a.chatHistory[0];
    expect(entry?.id).toBe(id);
    expect(entry?.body).toBe("hello");
    expect(entry?.from).toBe("alice");
    // After awaiting, the engine echo has reconciled to confirmed.
    expect(entry?.status).toBe("confirmed");
  });

  it("emits chat-status pending → confirmed for an outgoing message", async () => {
    const a = await startChannel("sa", "alice", fx);

    const statuses: ChatStatusEntry[] = [];
    a.on("chat-status", (s) => statuses.push(s));

    const id = await a.sendChat("hi");

    expect(statuses[0]).toEqual({ id, status: "pending" });
    expect(statuses[statuses.length - 1]).toEqual({ id, status: "confirmed" });
  });

  it("does NOT push a duplicate entry when the server echo arrives", async () => {
    const a = await startChannel("sa", "alice", fx);

    await a.sendChat("only-once");

    expect(a.chatHistory.filter((e) => e.body === "only-once")).toHaveLength(1);
  });

  it("incoming chat from a remote peer arrives as confirmed", async () => {
    const a = await startChannel("sa", "alice", fx);
    const b = await startChannel("sb", "bob", fx);

    await b.sendChat("from bob");
    // Allow the engine fan-out to flush.
    await Promise.resolve();

    const received = a.chatHistory.find((e) => e.from === "bob");
    expect(received?.status).toBe("confirmed");
    expect(typeof received?.id).toBe("string");
  });

  it("flips to failed when signaling.send rejects", async () => {
    const transport = await fx.open("sa");
    const channel = defineRoomChannel({ signaling: transport, room: "demo", peerId: "alice" });
    await channel.start();

    transport.send = async () => {
      throw new Error("simulated wire error");
    };

    const statuses: ChatStatusEntry[] = [];
    channel.on("chat-status", (s) => statuses.push(s));

    let id = "";
    try {
      id = await channel.sendChat("doomed");
    } catch {
      // sendChat re-throws after marking failed.
    }

    expect(channel.chatHistory[0]?.status).toBe("failed");
    expect(statuses.map((s) => s.status)).toEqual(["pending", "failed"]);
    expect(statuses[1]?.id).toBe(id || channel.chatHistory[0]!.id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-core test -- room-channel-chat-status
```

Expected: **5 failures** — `sendChat` currently returns `Promise<void>` and doesn't append optimistically.

- [ ] **Step 3: Rewrite `sendChat` for optimistic append + reconciliation**

In `packages/core/src/room/room-channel.ts`:

3a. Add to the class field declarations (next to `chatBuffer` near line 46):

```ts
/** Outgoing chats awaiting server echo. Keyed by clientId. */
private readonly pendingChats = new Map<string, ChatHistoryEntry>();
```

3b. Replace the `sendChat` method (currently at lines 194-203):

```ts
/**
 * Send a chat message. Synchronously appends a `pending` entry to the
 * local history and emits `chat` + `chat-status: pending`. Resolves with
 * the entry's `id`. The server echoes the message back; on receipt the
 * matching pending entry flips to `confirmed` and a second `chat-status`
 * fires. If `signaling.send` rejects, the entry flips to `failed` before
 * the rejection propagates.
 */
async sendChat(body: string, opts: { to?: string } = {}): Promise<string> {
  const id = this.generateChatId();
  const ts = Date.now();
  const msg: ChatMessage = {
    type: "chat",
    from: this.peerId,
    body,
    ts,
    clientId: id,
    ...(opts.to !== undefined ? { to: opts.to } : {}),
  };
  const entry: ChatHistoryEntry = {
    ...msg,
    receivedAt: ts,
    id,
    status: "pending",
  };
  this.chatBuffer.push(entry);
  while (this.chatBuffer.length > this.chatHistoryLimit) {
    this.chatBuffer.shift();
  }
  this.pendingChats.set(id, entry);
  this.emitter.emit("chat", entry);
  this.emitter.emit("chat-status", { id, status: "pending" });

  try {
    await this.signaling.send(msg);
  } catch (cause) {
    this.markChatFailed(id);
    throw cause;
  }
  return id;
}

/** Internal: mark a pending chat as failed (timeout, send error, drop). */
private markChatFailed(id: string): void {
  const entry = this.pendingChats.get(id);
  if (!entry || entry.status !== "pending") return;
  entry.status = "failed";
  this.pendingChats.delete(id);
  this.emitter.emit("chat-status", { id, status: "failed" });
}
```

3c. Update `applyChat` to reconcile a self-echo against `pendingChats`. Replace the body written in Task 2 Step 2 with:

```ts
private applyChat(message: ChatMessage): void {
  // Self-echo of an optimistic send → reconcile the existing pending entry.
  if (
    message.from === this.peerId &&
    message.clientId !== undefined &&
    this.pendingChats.has(message.clientId)
  ) {
    const id = message.clientId;
    const entry = this.pendingChats.get(id);
    if (entry && entry.status === "pending") {
      entry.status = "confirmed";
      this.pendingChats.delete(id);
      this.emitter.emit("chat-status", { id, status: "confirmed" });
    }
    return;
  }
  const id = message.clientId ?? this.generateChatId();
  const entry: ChatHistoryEntry = {
    ...message,
    receivedAt: Date.now(),
    id,
    status: "confirmed",
  };
  this.chatBuffer.push(entry);
  while (this.chatBuffer.length > this.chatHistoryLimit) {
    this.chatBuffer.shift();
  }
  this.emitter.emit("chat", entry);
}
```

- [ ] **Step 4: Re-run the chat-status test**

```bash
pnpm --filter @forinda/video-sdk-core test -- room-channel-chat-status
```

Expected: all 5 tests **pass**.

- [ ] **Step 5: Run the existing room-channel suite**

```bash
pnpm --filter @forinda/video-sdk-core test -- room/room-channel
```

Expected: all existing tests still pass (the only behavioral change visible to existing tests is that `chatHistory[i]` now has `id` and `status: "confirmed"` fields; existing assertions don't touch those).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/room/room-channel.ts packages/core/test/unit/room/room-channel-chat-status.test.ts
git commit -m "feat(core): optimistic sendChat with server-echo reconciliation (EPIC-20 #3/9)"
```

---

## Task 4: Chat ack timeout → `failed`

**Files:**
- Modify: `packages/core/src/room/room-channel.ts` (constructor, `sendChat`, new helpers)
- Test: `packages/core/test/unit/room/room-channel-chat-status.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/unit/room/room-channel-chat-status.test.ts`:

```ts
describe("RoomChannel — chat ack timeout", () => {
  let fx: EngineFixture;
  beforeEach(() => {
    fx = defineEngineFixture();
  });
  afterEach(async () => {
    await fx.closeAll();
  });

  it("flips to failed if no echo arrives within chatAckTimeoutMs", async () => {
    vi.useFakeTimers();
    try {
      const transport = await fx.open("sa");
      const channel = defineRoomChannel({
        signaling: transport,
        room: "demo",
        peerId: "alice",
        chatAckTimeoutMs: 100,
      });
      await channel.start();

      // Drop the echo by hijacking send to be a no-op (still resolves).
      transport.send = async () => {};

      const statuses: ChatStatusEntry[] = [];
      channel.on("chat-status", (s) => statuses.push(s));

      const id = await channel.sendChat("ghost");

      // Pending → still pending immediately.
      expect(channel.chatHistory[0]?.status).toBe("pending");

      vi.advanceTimersByTime(150);

      expect(channel.chatHistory[0]?.status).toBe("failed");
      expect(statuses).toEqual([
        { id, status: "pending" },
        { id, status: "failed" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the timer when the echo arrives in time", async () => {
    vi.useFakeTimers();
    try {
      const a = await startChannel("sa", "alice", fx);

      const statuses: ChatStatusEntry[] = [];
      a.on("chat-status", (s) => statuses.push(s));

      await a.sendChat("hi");

      vi.advanceTimersByTime(60_000);

      // Already confirmed before the timer fires; no failed event.
      expect(statuses.map((s) => s.status)).toEqual(["pending", "confirmed"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

Add `vi` to the imports at the top of the test file: `import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";`.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-core test -- room-channel-chat-status
```

Expected: 2 new failures — there's no timeout yet.

- [ ] **Step 3: Wire the timeout into the channel**

In `packages/core/src/room/room-channel.ts`:

3a. Add `DEFAULT_CHAT_ACK_TIMEOUT_MS` next to `DEFAULT_CHAT_HISTORY_LIMIT`:

```ts
const DEFAULT_CHAT_HISTORY_LIMIT = 200;
const DEFAULT_CHAT_ACK_TIMEOUT_MS = 10_000;
```

3b. Add a field next to `pendingChats`:

```ts
private readonly chatAckTimeoutMs: number;
private readonly chatAckTimers = new Map<string, ReturnType<typeof setTimeout>>();
```

3c. Set `chatAckTimeoutMs` in the constructor (after the existing `chatHistoryLimit` line):

```ts
this.chatAckTimeoutMs = opts.chatAckTimeoutMs ?? DEFAULT_CHAT_ACK_TIMEOUT_MS;
```

3d. In `sendChat`, AFTER `this.emitter.emit("chat-status", { id, status: "pending" });` and BEFORE `try { await this.signaling.send(msg); }`, schedule the timer:

```ts
const timer = setTimeout(() => {
  this.markChatFailed(id);
}, this.chatAckTimeoutMs);
this.chatAckTimers.set(id, timer);
```

3e. In `markChatFailed`, clear the timer at the top (before the existing logic):

```ts
private markChatFailed(id: string): void {
  const timer = this.chatAckTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    this.chatAckTimers.delete(id);
  }
  const entry = this.pendingChats.get(id);
  if (!entry || entry.status !== "pending") return;
  entry.status = "failed";
  this.pendingChats.delete(id);
  this.emitter.emit("chat-status", { id, status: "failed" });
}
```

3f. In `applyChat`, when reconciling a self-echo, clear the timer. Update the self-echo branch:

```ts
if (
  message.from === this.peerId &&
  message.clientId !== undefined &&
  this.pendingChats.has(message.clientId)
) {
  const id = message.clientId;
  const entry = this.pendingChats.get(id);
  if (entry && entry.status === "pending") {
    const timer = this.chatAckTimers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.chatAckTimers.delete(id);
    }
    entry.status = "confirmed";
    this.pendingChats.delete(id);
    this.emitter.emit("chat-status", { id, status: "confirmed" });
  }
  return;
}
```

3g. In `stop()`, clear all outstanding timers AFTER the existing `for (const dispose of this.disposers)` loop and BEFORE the `manageJoin` block:

```ts
for (const timer of this.chatAckTimers.values()) clearTimeout(timer);
this.chatAckTimers.clear();
```

- [ ] **Step 4: Re-run the chat-status test**

```bash
pnpm --filter @forinda/video-sdk-core test -- room-channel-chat-status
```

Expected: all 7 tests **pass**.

- [ ] **Step 5: Run the full core suite**

```bash
pnpm --filter @forinda/video-sdk-core test
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/room/room-channel.ts packages/core/test/unit/room/room-channel-chat-status.test.ts
git commit -m "feat(core): chat ack timeout flips pending → failed (EPIC-20 #4/9)"
```

---

## Task 5: Channel-level `state` event

**Files:**
- Modify: `packages/core/src/room/room-channel.ts` (state field + emit on transitions)
- Test: `packages/core/test/unit/room/room-channel-state.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/unit/room/room-channel-state.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineRoomChannel } from "@/room/room-channel.ts";
import type { RoomChannelState } from "@/room/types.ts";
import { defineEngineFixture, type EngineFixture } from "@forinda/test-helpers";

describe("RoomChannel — state lifecycle (EPIC-20)", () => {
  let fx: EngineFixture;
  beforeEach(() => {
    fx = defineEngineFixture();
  });
  afterEach(async () => {
    await fx.closeAll();
  });

  it("starts at idle, transitions to connecting → connected on start()", async () => {
    const transport = await fx.open("sa");
    const channel = defineRoomChannel({
      signaling: transport,
      room: "demo",
      peerId: "alice",
    });
    expect(channel.state).toBe("idle");

    const seen: RoomChannelState[] = [];
    channel.on("state", (s) => seen.push(s));

    await channel.start();

    expect(channel.state).toBe("connected");
    expect(seen).toEqual(["connecting", "connected"]);
  });

  it("transitions to closed on stop()", async () => {
    const transport = await fx.open("sa");
    const channel = defineRoomChannel({
      signaling: transport,
      room: "demo",
      peerId: "alice",
    });
    await channel.start();

    const seen: RoomChannelState[] = [];
    channel.on("state", (s) => seen.push(s));

    await channel.stop();

    expect(channel.state).toBe("closed");
    expect(seen).toEqual(["closed"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-core test -- room-channel-state
```

Expected: failure — `channel.state` does not exist.

- [ ] **Step 3: Add a state field + emit on transitions**

In `packages/core/src/room/room-channel.ts`:

3a. Replace the existing `started` / `stopped` private fields with a single `_state`:

```ts
private _state: RoomChannelState = "idle";
```

(Remove the lines `private started = false;` and `private stopped = false;`.)

3b. Add a public getter under `peerId`:

```ts
get state(): RoomChannelState {
  return this._state;
}
```

3c. Add a private helper next to the other private methods:

```ts
private setState(next: RoomChannelState): void {
  if (this._state === next) return;
  this._state = next;
  this.emitter.emit("state", next);
}
```

3d. Add the `RoomChannelState` import alongside the others (top of file), updating the existing import block:

```ts
import type {
  AttachedRoomChannelOptions,
  ChatHistoryEntry,
  ChatStatusEntry,
  RoomChannelEvents,
  RoomChannelOptions,
  RoomChannelState,
  RoomLeader,
} from "./types.ts";
```

(Drop unused names if your existing import doesn't include them; the goal is a single sorted block with these.)

3e. Update `start()`. Replace the early-return + flag lines:

```ts
async start(): Promise<void> {
  if (this._state !== "idle") return;
  this.setState("connecting");
  // ...rest unchanged through the existing body, but DELETE
  // `this.started = true;` since state replaces it.
```

At the end of `start()` (after the join is sent / leader.ensureJoined resolves), add:

```ts
this.setState("connected");
```

3f. Update `stop()`. Replace the early-return + flag lines:

```ts
async stop(): Promise<void> {
  if (this._state === "closed" || this._state === "idle") return;
  // ...rest unchanged through the existing body, but DELETE
  // `this.stopped = true;`
```

At the end of `stop()`, add:

```ts
this.setState("closed");
```

3g. Update the `if (this.stopped)` guard in `start()` (line 90 before edits):

```ts
if (this._state === "closed") {
  throw new Error("RoomChannel has been stopped; create a new instance to reuse");
}
```

- [ ] **Step 4: Re-run the state test**

```bash
pnpm --filter @forinda/video-sdk-core test -- room-channel-state
```

Expected: both tests **pass**.

- [ ] **Step 5: Run the full core suite**

```bash
pnpm --filter @forinda/video-sdk-core test
```

Expected: green. (Existing tests use `started` / `stopped` indirectly via `start()` / `stop()` idempotency — those still hold via the new state machine.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/room/room-channel.ts packages/core/test/unit/room/room-channel-state.test.ts
git commit -m "feat(core): RoomChannel state lifecycle event (EPIC-20 #5/9)"
```

---

## Task 6: Retry policy + reconnect loop with presence resync

**Files:**
- Modify: `packages/core/src/room/room-channel.ts` (subscribe to transport state, reconnect loop, presence resync)
- Test: `packages/core/test/unit/room/room-channel-retry.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/unit/room/room-channel-retry.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineRoomChannel } from "@/room/room-channel.ts";
import type { ChatStatusEntry, RoomChannelState } from "@/room/types.ts";
import { defineEngineFixture, type EngineFixture } from "@forinda/test-helpers";

describe("RoomChannel — retry + presence resync (EPIC-20)", () => {
  let fx: EngineFixture;
  beforeEach(() => {
    fx = defineEngineFixture();
  });
  afterEach(async () => {
    await fx.closeAll();
  });

  it("transitions to reconnecting when the transport closes after start", async () => {
    vi.useFakeTimers();
    try {
      const transport = await fx.open("sa");
      const channel = defineRoomChannel({
        signaling: transport,
        room: "demo",
        peerId: "alice",
        retry: { initialBackoffMs: 10, maxAttempts: 3, jitter: 0 },
      });
      await channel.start();

      const seen: RoomChannelState[] = [];
      channel.on("state", (s) => seen.push(s));

      await transport.disconnect();

      expect(seen).toContain("reconnecting");
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-broadcasts previously-set presence attributes after reconnect", async () => {
    vi.useFakeTimers();
    try {
      const transport = await fx.open("sa");
      const channel = defineRoomChannel({
        signaling: transport,
        room: "demo",
        peerId: "alice",
        retry: { initialBackoffMs: 10, maxAttempts: 3, jitter: 0 },
      });
      await channel.start();

      await channel.setAttribute("hand-raised", true);
      await channel.setAttribute("status", "🎬");

      const sentAfterReconnect: Array<Record<string, unknown>> = [];

      // Simulate transport close → reconnect.
      await transport.disconnect();

      // After disconnect, replace send to capture re-broadcasts.
      transport.send = async (m) => {
        sentAfterReconnect.push(m as Record<string, unknown>);
      };

      await vi.advanceTimersByTimeAsync(50);

      const presenceUpdates = sentAfterReconnect.filter((m) => m.type === "presence-update");
      const flat: Record<string, unknown> = {};
      for (const u of presenceUpdates) {
        const attrs = (u as { attributes: Record<string, unknown> }).attributes;
        Object.assign(flat, attrs);
      }
      expect(flat).toEqual({ "hand-raised": true, status: "🎬" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks all in-flight pending chats as failed on reconnect", async () => {
    vi.useFakeTimers();
    try {
      const transport = await fx.open("sa");
      const channel = defineRoomChannel({
        signaling: transport,
        room: "demo",
        peerId: "alice",
        retry: { initialBackoffMs: 10, maxAttempts: 3, jitter: 0 },
        chatAckTimeoutMs: 60_000,
      });
      await channel.start();

      // Hijack send so the chat never reaches the engine — it stays pending.
      transport.send = async () => {};

      const id = await channel.sendChat("in flight");
      expect(channel.chatHistory[0]?.status).toBe("pending");

      const statuses: ChatStatusEntry[] = [];
      channel.on("chat-status", (s) => statuses.push(s));

      await transport.disconnect();
      await vi.advanceTimersByTimeAsync(50);

      expect(channel.chatHistory[0]?.status).toBe("failed");
      expect(statuses.find((s) => s.id === id && s.status === "failed")).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits state=closed when retry budget is exhausted", async () => {
    vi.useFakeTimers();
    try {
      const transport = await fx.open("sa");
      const channel = defineRoomChannel({
        signaling: transport,
        room: "demo",
        peerId: "alice",
        retry: { initialBackoffMs: 10, maxAttempts: 1, jitter: 0 },
      });
      await channel.start();

      // Make every reconnect attempt fail.
      transport.connect = async () => {
        throw new Error("denied");
      };

      const errors: Error[] = [];
      channel.on("error", (e) => errors.push(e));

      await transport.disconnect();
      await vi.advanceTimersByTimeAsync(100);

      expect(channel.state).toBe("closed");
      expect(errors.some((e) => /retry budget exhausted/i.test(e.message))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-core test -- room-channel-retry
```

Expected: 4 failures — there's no retry plumbing yet.

- [ ] **Step 3: Wire the retry policy + reconnect loop into RoomChannel**

In `packages/core/src/room/room-channel.ts`:

3a. Update the imports at the top of the file:

```ts
import { defineRetryPolicy, RetryPolicy, type RetryConfig } from "@/retry/policy.ts";
import { SdkError } from "@/errors/errors.ts";
import type { TransportState } from "@/signaling/transport.ts";
```

(Add to the existing imports — keep the existing ones unchanged.)

3b. Add private fields next to the others:

```ts
private readonly retryPolicy: RetryPolicy;
private retryTimer: ReturnType<typeof setTimeout> | undefined;
```

3c. In the constructor (after `this.chatAckTimeoutMs = ...`):

```ts
this.retryPolicy = defineRetryPolicy(opts.retry ?? {});
```

3d. In `start()`, AFTER `this.disposers.push(this.signaling.on("message", ...))` and BEFORE the `if (this.leader)` block, subscribe to transport state:

```ts
this.disposers.push(
  this.signaling.on("state", (s: TransportState) => {
    if (this._state === "closed") return;
    if (s === "connected" && this._state === "reconnecting") {
      // The transport itself is up again; the reconnect handler below
      // owns the rejoin + presence resync, so do nothing here.
    } else if (s === "closed" && this._state !== "closed" && this._state !== "idle") {
      this.handleSessionFailure(
        new SdkError("signaling closed unexpectedly", { code: "signaling_closed" }),
      );
    }
  }),
);
```

3e. Add the failure / reconnect helpers as new private methods:

```ts
private handleSessionFailure(cause: SdkError): void {
  if (this._state === "closed") return;

  // Mark every in-flight pending chat as failed — we don't know whether
  // the engine actually received them before the drop.
  for (const id of [...this.pendingChats.keys()]) {
    this.markChatFailed(id);
  }

  this.setState("reconnecting");

  const delay = this.retryPolicy.nextDelayMs();
  if (delay === null) {
    this.emitter.emit(
      "error",
      new SdkError("retry budget exhausted", { code: "retry_exhausted", cause }),
    );
    this.setState("closed");
    return;
  }

  this.retryTimer = setTimeout(() => {
    void this.attemptReconnect();
  }, delay);
}

private async attemptReconnect(): Promise<void> {
  if (this._state === "closed") return;
  this.retryTimer = undefined;
  try {
    await this.signaling.connect();
    if (this.manageJoin) {
      await this.signaling.send({
        type: "join",
        room: this.room,
        peer: this.peerId,
        role: "presence",
      });
    }
    await this.resyncPresence();
    this.setState("connected");
    this.retryPolicy.markSuccess();
  } catch (cause) {
    this.handleSessionFailure(
      new SdkError("reconnect attempt failed", {
        code: "reconnect_failed",
        cause,
      }),
    );
  }
}

private async resyncPresence(): Promise<void> {
  if (this.ownAttributeKeys.size === 0) return;
  const attributes: Record<string, JsonValue> = {};
  for (const k of this.ownAttributeKeys) {
    const current = this.presenceMap.get(this.peerId)?.[k];
    if (current !== undefined) attributes[k] = current;
  }
  if (Object.keys(attributes).length === 0) return;
  await this.signaling.send({
    type: "presence-update",
    peer: this.peerId,
    attributes,
  });
}
```

3f. In `stop()`, add the retry-timer cleanup AFTER the chatAckTimers cleanup added in Task 4 and BEFORE the `manageJoin` block:

```ts
if (this.retryTimer !== undefined) {
  clearTimeout(this.retryTimer);
  this.retryTimer = undefined;
}
```

- [ ] **Step 4: Re-run the retry test**

```bash
pnpm --filter @forinda/video-sdk-core test -- room-channel-retry
```

Expected: all 4 tests **pass**.

- [ ] **Step 5: Run the full core suite**

```bash
pnpm --filter @forinda/video-sdk-core test
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/room/room-channel.ts packages/core/test/unit/room/room-channel-retry.test.ts
git commit -m "feat(core): RoomChannel retry + reconnect with presence resync (EPIC-20 #6/9)"
```

---

## Task 7: React `useChat` — return id + surface chat-status

**Files:**
- Modify: `packages/react/src/use-chat.ts`
- Test: `packages/react/test/unit/use-chat.test.tsx`

- [ ] **Step 1: Write the failing test**

In `packages/react/test/unit/use-chat.test.tsx`, append:

```tsx
describe("useChat — EPIC-20 surface", () => {
  it("send() returns the entry id", async () => {
    const ch = defineFakeRoomChannel("alice");
    // Patch the fake to mimic the new signature.
    ch.sendChat = vi.fn(async (body: string) => {
      const id = `id-${body}`;
      (ch.chatHistory as unknown as Array<unknown>).push({
        type: "chat",
        from: "alice",
        body,
        ts: 1,
        receivedAt: 1,
        id,
        status: "confirmed" as const,
      });
      return id;
    }) as unknown as typeof ch.sendChat;

    const { result } = renderHook(() => useChat(ch));

    let returned = "";
    await act(async () => {
      returned = await result.current.send("hello");
    });

    expect(returned).toBe("id-hello");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-react test -- use-chat
```

Expected: failure — `send` currently returns `Promise<void>`.

- [ ] **Step 3: Update `useChat` to return the id**

Replace the `send` declaration in `packages/react/src/use-chat.ts`:

```ts
const send = useCallback(
  async (body: string, opts: { to?: string } = {}): Promise<string> => {
    if (!channel) return "";
    return channel.sendChat(body, opts);
  },
  [channel],
);
```

And update the `UseChatResult` interface:

```ts
export interface UseChatResult {
  messages: readonly ChatHistoryEntry[];
  /** Send a chat message. Resolves with the entry's `id` (empty string if no channel). */
  send: (body: string, opts?: { to?: string }) => Promise<string>;
}
```

- [ ] **Step 4: Re-run the test**

```bash
pnpm --filter @forinda/video-sdk-react test -- use-chat
```

Expected: pass.

- [ ] **Step 5: Run the React suite**

```bash
pnpm --filter @forinda/video-sdk-react test
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/use-chat.ts packages/react/test/unit/use-chat.test.tsx
git commit -m "feat(react): useChat.send returns entry id (EPIC-20 #7/9)"
```

---

## Task 8: Vue `useChat` — same surface

**Files:**
- Modify: `packages/vue/src/use-chat.ts`
- Test: `packages/vue/test/unit/use-chat.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/vue/test/unit/use-chat.test.ts`:

```ts
describe("useChat — EPIC-20 surface", () => {
  it("send() returns the entry id", async () => {
    const ch = defineFakeRoomChannel("alice");
    (ch.sendChat as unknown) = async (body: string) => {
      const id = `id-${body}`;
      (ch.chatHistory as unknown as ChatHistoryEntry[]).push({
        type: "chat",
        from: "alice",
        body,
        ts: 1,
        receivedAt: 1,
        id,
        status: "confirmed",
      });
      return id;
    };

    const { result, dispose } = withScope(() => useChat(ch));

    const returned = await result.send("hello");
    expect(returned).toBe("id-hello");

    dispose();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-vue test -- use-chat
```

Expected: failure.

- [ ] **Step 3: Update `useChat` to return the id**

In `packages/vue/src/use-chat.ts`, update the interface and the `send` function:

```ts
export interface UseChatResult {
  messages: Ref<readonly ChatHistoryEntry[]>;
  /** Send a chat message. Resolves with the entry's `id` (empty string if no channel). */
  send: (body: string, opts?: { to?: string }) => Promise<string>;
}
```

And:

```ts
return {
  messages,
  send: async (body, opts = {}) => {
    const ch = toValue(channel);
    if (!ch) return "";
    return ch.sendChat(body, opts);
  },
};
```

- [ ] **Step 4: Re-run the test**

```bash
pnpm --filter @forinda/video-sdk-vue test -- use-chat
```

Expected: pass.

- [ ] **Step 5: Run the Vue suite**

```bash
pnpm --filter @forinda/video-sdk-vue test
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/vue/src/use-chat.ts packages/vue/test/unit/use-chat.test.ts
git commit -m "feat(vue): useChat.send returns entry id (EPIC-20 #8/9)"
```

---

## Task 9: README updates + changeset

**Files:**
- Modify: `packages/core/README.md` (chat + retry sections)
- Modify: `packages/react/README.md`
- Modify: `packages/vue/README.md`
- Create: `.changeset/roomchannel-resilience.md`

- [ ] **Step 1: Update `packages/core/README.md`**

Find the existing `RoomChannel` section. Insert immediately after the existing `sendChat` example a new subsection:

```markdown
### Optimistic chat + ack reconciliation

`sendChat()` is optimistic — it appends a `pending` entry to `chatHistory` synchronously and emits `chat` immediately so your UI can render the message before the round-trip. The server echoes the message back with the same `clientId`; the channel matches the echo and flips the entry to `confirmed`. If no echo arrives within `chatAckTimeoutMs` (default `10_000`), the entry flips to `failed`.

```ts
const channel = defineRoomChannel({ signaling, room: "demo", peerId: "alice" });
await channel.start();

channel.on("chat-status", ({ id, status }) => {
  console.log(id, status); // "<uuid>", "pending" → "confirmed" (or "failed")
});

const id = await channel.sendChat("hello"); // returns the pending entry's id
```
```

Then find the `defineRoomChannel` options table and add:

```markdown
| `retry` | `defineRetryPolicy()` defaults | Reconnect after transport drops; re-issues join, re-broadcasts presence, marks pending chats failed. |
| `chatAckTimeoutMs` | `10_000` | Time to wait for a server-echo before flipping a pending chat to `failed`. |
```

Add a sibling `### Retry + presence resync` section under the chat section:

```markdown
### Retry + presence resync

When the underlying transport closes unexpectedly, `RoomChannel` enters `reconnecting`, retries with exponential backoff (per `defineRetryPolicy`), re-issues `join` (when `manageJoin: true`), and re-broadcasts every previously-set own presence attribute so other peers see the right state. Subscribe to the channel-level `state` event for UI feedback:

```ts
channel.on("state", (s) => console.log(s));
// "connecting" → "connected" → ("reconnecting" → "connected") → "closed"
```

Pending chats in flight at the moment of the drop are flipped to `failed` — `signaling.send` resolving doesn't actually prove the engine received the message.
```

- [ ] **Step 2: Update `packages/react/README.md`**

Find the `useChat` section and replace the example/snippet with:

```markdown
### `useChat(channel)`

Live chat history plus a `send` callback. Omit `to` for a room-wide broadcast; pass a peerId for a DM. `send()` resolves with the entry's `id` so you can correlate with `chat-status` events on the underlying channel.

```ts
const { messages, send } = useChat(channel);
const id = await send("hello room");
await send("psst", { to: "bob" });

// Subscribe to status changes via the underlying channel:
useEffect(() => {
  if (!channel) return;
  return channel.on("chat-status", ({ id, status }) => {
    // status: "pending" | "confirmed" | "failed"
  });
}, [channel]);
```

`messages[i].status` is `"pending"` until the server echoes the message back, then `"confirmed"`. A `chatAckTimeoutMs` lapse (default 10s) flips it to `"failed"`.
```

- [ ] **Step 3: Update `packages/vue/README.md`**

Find the `useChat` section and replace with the Vue equivalent:

```markdown
### `useChat(channel)`

Live chat history plus a `send` callback. Omit `to` for a broadcast; pass a peerId for a DM. `send()` resolves with the entry's `id`.

```ts
const { messages, send } = useChat(channel);
const id = await send("hello room");
await send("psst", { to: "bob" });

// Status updates: subscribe via the underlying channel.
watch(channel, (ch, _prev, onCleanup) => {
  if (!ch) return;
  const off = ch.on("chat-status", ({ id, status }) => {
    // status: "pending" | "confirmed" | "failed"
  });
  onCleanup(off);
});
```

`messages.value[i].status` is `"pending"` until the server echoes the message; the `chatAckTimeoutMs` (default 10s) flips to `"failed"`.
```

- [ ] **Step 4: Create the changeset**

Create `.changeset/roomchannel-resilience.md`:

```markdown
---
"@forinda/video-sdk-core": minor
"@forinda/video-sdk-signaling-protocol": minor
"@forinda/video-sdk-react": patch
"@forinda/video-sdk-vue": patch
"@forinda/video-sdk-signaling-ws": patch
"@forinda/video-sdk-signaling-broadcast": patch
"@forinda/video-sdk-elements": patch
---

`RoomChannel` resilience: optimistic chat + reconnect with presence resync.

### Added

- **Optimistic chat.** `sendChat()` synchronously appends a `pending` entry to `chatHistory` and emits `chat` so your UI can render the message before the round-trip. The server echoes the message back (matched by a new optional `clientId` on the wire) and the entry flips to `confirmed`. A new `chat-status` event surfaces the transitions; `sendChat()` now returns the entry's `id`.
- **Chat ack timeout.** New `chatAckTimeoutMs` option (default `10_000`). Un-acknowledged chats flip to `"failed"` after the timeout fires.
- **RoomChannel retry + presence resync.** New `retry?: RetryConfig` option (default enabled, same shape as Publisher/Viewer). On transport drop the channel reconnects with exponential backoff, re-issues `join` (when `manageJoin`), re-broadcasts every own presence attribute, and flips in-flight pending chats to `failed`.
- **Channel state event.** New `state` event with values `"idle" | "connecting" | "connected" | "reconnecting" | "closed"`, exposed as `channel.state` for snapshots.
- **Wire format**: `Chat` schema gains an optional `clientId` (max 64 chars). The engine round-trips it untouched and only echoes the message back to the sender when present — legacy clients without `clientId` get the original "fan-out to others only" behavior, no duplicate echo, no breakage.

### Adapter changes

- `useChat().send` (React + Vue) now returns `Promise<string>` (the entry id). Existing call sites that ignore the return value still compile.
- `ChatHistoryEntry` gains required `id: string` and `status: "pending" | "confirmed" | "failed"` fields. Consumers that only read `body` / `from` / `ts` are unaffected.

### Rationale

Production chat needs a way to tell the user "we sent your message" vs. "we tried — the server never confirmed it." The previous `sendChat` resolved as soon as the message hit the OS socket buffer, which says nothing about whether the engine accepted it. Pairing optimistic UI with a server-echo ack gives both responsiveness and honesty.
```

- [ ] **Step 5: Format check**

```bash
pnpm format && pnpm format:check
```

Expected: green.

- [ ] **Step 6: Workspace lint + typecheck + test + build**

```bash
pnpm typecheck && pnpm test && pnpm build && pnpm lint
```

Expected: every step exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/core/README.md packages/react/README.md packages/vue/README.md .changeset/roomchannel-resilience.md
git commit -m "docs(EPIC-20): READMEs + changeset for RoomChannel resilience (EPIC-20 #9/9)"
```

- [ ] **Step 8: Tag**

```bash
git tag -a v0.0.0-epic-20 -m "EPIC-20: RoomChannel retry + optimistic chat"
```

---

## Self-review notes

- **Spec coverage** (vs. roadmap acceptance criteria for EPIC-20):
  - ✅ `defineRoomChannel({ retry: RetryConfig })` reconnects after transport state flips to `closed` — Task 6.
  - ✅ Re-issues last presence map after reconnect — Task 6.
  - ✅ `RoomChannel.sendChat()` immediately appends an optimistic entry with `pending: true`; flips to `confirmed` on engine echo or `failed` on timeout — Tasks 3 + 4.
  - ✅ New `chat-status` event — Task 3.
  - ✅ Tests cover socket drop mid-recording presence (Task 6, second test), optimistic echo + reconcile (Task 3), fail timeout (Task 4).
  - 🚫 Sequence numbers (gap #7) — explicitly deferred per the roadmap "open question" note.
- **Type consistency**: `ChatHistoryEntry`, `ChatStatusEntry`, `RoomChannelState`, `RoomChannelEvents` are all defined once in `types.ts` and used everywhere. `RetryConfig` is reused from `@/retry/policy.ts`.
- **No placeholders**: every step has concrete code or commands.
