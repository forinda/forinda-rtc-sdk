# EPIC-12 Director / Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `director` role to the signaling protocol with first-claim wins semantics, six new moderation wire-format messages (`mute`, `unmute`, `kick`, `promote`, `demote`, `set-bitrate`) that are honor-based by default and opt-in enforced at the engine, plus a React `useRoom()` extension that exposes `role` + `sendCommand`.

**Architecture:**

- **Director role**: `Role` enum gains `"director"`. The `Room` data structure tracks a `Set<peerId>` of directors. The first peer to join with `role: "director"` claims it; later claims throw a new `SignalingDirectorConflictError`. Co-directors are added at runtime via the `promote` command.
- **Moderation wire format**: six new top-level message types — flat shapes with a `target: PeerId` and command-specific fields. The outer `SignalingMessage` discriminator stays clean (one new branch per command, all keyed by `type`).
- **Honor-based by default**: the engine relays moderation messages to the `target` peer (and broadcasts state changes via existing `presence-state`). The target's client decides whether to obey (e.g. mute its mic). Compromised clients can ignore the command — that's expected for honor-based mode.
- **Opt-in enforcement**: `defineSignalingEngine({ enforceModerationCommands: true })` rejects commands from non-directors with the new `SignalingPermissionError(code: "not_authorized")`. `kick` is always engine-enforced when enforcement is on (it forcibly disconnects the target socket).
- **State broadcast piggybacks on presence**: when an engine accepts a `mute`/`unmute`, it sets a presence attribute on the target (`director-muted-audio: true` etc.) and the existing `presence-state` mechanism fans it out. No new state-snapshot message needed — late joiners see mute state through the existing `presence-snapshot`.
- **React adapter**: `useRoom()` extends with `role: RoleValue | null` (the room's joined role) + `directors: readonly string[]` (live set) + `sendCommand({ type: "mute", target, kind })` etc. Maps each command 1:1 to a `room.signaling.send(...)` call.

**Out of scope (deferred to EPIC-12b):**

- Vue adapter parity for `sendCommand`.
- `<forinda-room-controls>` Web Component element.
- Server-enforced `set-bitrate` (engine relays it; honoring it requires SFU integration which is EPIC-14).

**Tech Stack:** TypeScript, Vitest, Zod, the existing `signaling-protocol` engine + `Room`, React 18.

---

## File structure

| File                                                                                           | Responsibility                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/signaling-protocol/src/messages.ts`                                                  | Add `"director"` to `Role`. Add six new message schemas (`Mute`, `Unmute`, `Kick`, `Promote`, `Demote`, `SetBitrate`). Extend `SignalingMessage` union + add inferred type exports.                          |
| `packages/signaling-protocol/src/errors.ts`                                                    | New `SignalingDirectorConflictError(code: "director_conflict")` + `SignalingPermissionError(code: "not_authorized")`.                                                                                        |
| `packages/signaling-protocol/src/rooms.ts`                                                     | Add `directors: Set<PeerId>` + `addDirector` / `removeDirector` / `isDirector` / `directorList` methods.                                                                                                     |
| `packages/signaling-protocol/src/session.ts`                                                   | First-claim director enforcement on `applyJoin`. Six new `apply*` methods. New `enforceModerationCommands` option that gates director-only commands. Handle director departure (drop from set; clear no-op). |
| `packages/signaling-protocol/src/engine.ts`                                                    | Forward `enforceModerationCommands` through `SignalingEngineOptions`.                                                                                                                                        |
| `packages/signaling-protocol/src/index.ts`                                                     | Re-export new errors + types.                                                                                                                                                                                |
| `packages/signaling-protocol/test/unit/session-director.test.ts`                               | First-claim wins; departure clears slot; promote adds; demote removes; honor-mode + enforce-mode.                                                                                                            |
| `packages/signaling-protocol/test/unit/session-moderation.test.ts`                             | Each command relays to target; engine enforcement rejects non-director commands.                                                                                                                             |
| `packages/core/src/room/types.ts`                                                              | `RoomLeader.role` already `RoleValue \| null` — no change. New `Room` getter helper for `directors`.                                                                                                         |
| `packages/core/src/room/room.ts`                                                               | Track director set from `peer-joined` / `peer-left` / promote / demote messages so `defineRoom` consumers can read it via `room.directors`.                                                                  |
| `packages/react/src/use-room.ts`                                                               | Extend `UseRoomResult` with `role`, `directors`, `sendCommand`. Subscribe to wire events to keep `directors` reactive.                                                                                       |
| `packages/react/test/unit/use-room.test.tsx`                                                   | sendCommand fires the wire message; directors stays in sync with peer-joined/promote/demote.                                                                                                                 |
| `packages/signaling-protocol/README.md`, `packages/core/README.md`, `packages/react/README.md` | Document the director role + commands + enforcement opt-in.                                                                                                                                                  |
| `.changeset/director-moderation.md`                                                            | minor for `signaling-protocol` + `core` + `react`; patch for cascading peer-deps.                                                                                                                            |

---

## Task 1: Wire format — `Role: "director"` + six command schemas

**Files:**

- Modify: `packages/signaling-protocol/src/messages.ts`

- [ ] **Step 1: Add `"director"` to the `Role` enum**

In `packages/signaling-protocol/src/messages.ts`, replace the `Role` definition:

```ts
/**
 * The role a peer joins a room with. v0.1 ships publisher / viewer / presence.
 * EPIC-12 adds `"director"` for moderation; the engine enforces first-claim
 * wins per room (subsequent director claims throw `SignalingDirectorConflictError`).
 *
 * `"presence"` is the chat-only / observer role — joiners participate in
 * presence + chat but never negotiate media.
 */
export const Role = z.enum(["publisher", "viewer", "presence", "director"]);
```

- [ ] **Step 2: Add the six command schemas**

In the same file, append these schemas right after the existing `Chat` block (before the `ChatHistory` block):

```ts
/** Mute kind — what the director is muting on the target. */
export const MuteKind = z.enum(["audio", "video"]);

/**
 * Director → server → target (and `presence-state` to all room members).
 * Honor-based by default: the engine sets a presence attribute on the
 * target (`director-muted-audio: true` / `director-muted-video: true`) so
 * every peer sees the state change. The target's client is expected to
 * stop the corresponding track. With `enforceModerationCommands: true`,
 * non-director senders are rejected with `SignalingPermissionError`.
 */
export const Mute = z.object({
  type: z.literal("mute"),
  target: PeerId,
  kind: MuteKind,
});

/** Inverse of `Mute`. Clears the corresponding presence attribute. */
export const Unmute = z.object({
  type: z.literal("unmute"),
  target: PeerId,
  kind: MuteKind,
});

/**
 * Director → server. Forces `target` out of the room. The engine emits a
 * `peer-left` to remaining members and (when `enforceModerationCommands`)
 * disconnects the target's socket binding. Reason is forwarded to the
 * target via a `kicked` notification before disconnect.
 */
export const Kick = z.object({
  type: z.literal("kick"),
  target: PeerId,
  reason: z.string().max(256).optional(),
});

/**
 * Server → kicked peer. Sent right before the engine drops the target's
 * room binding. Lets the client surface a friendly UI before the socket
 * closes.
 */
export const Kicked = z.object({
  type: z.literal("kicked"),
  room: RoomId,
  reason: z.string().max(256).optional(),
});

/** Director → server. Adds `target` to the room's director set. */
export const Promote = z.object({
  type: z.literal("promote"),
  target: PeerId,
});

/** Director → server. Removes `target` from the director set. */
export const Demote = z.object({
  type: z.literal("demote"),
  target: PeerId,
});

/**
 * Director → server → target. Bandwidth ceiling hint. The engine relays
 * unchanged; honoring it requires SFU integration (EPIC-14). With
 * enforcement on, non-directors are still rejected even though no SFU
 * is available — keeps the wire surface symmetric.
 */
export const SetBitrate = z.object({
  type: z.literal("set-bitrate"),
  target: PeerId,
  bitsPerSec: z.number().int().positive(),
});
```

- [ ] **Step 3: Extend the `SignalingMessage` discriminated union**

Find the existing `SignalingMessage = z.discriminatedUnion("type", [...])` array and add the seven new entries:

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
  Mute,
  Unmute,
  Kick,
  Kicked,
  Promote,
  Demote,
  SetBitrate,
]);
```

- [ ] **Step 4: Add inferred type exports**

Find the existing `export type ChatMessage = z.infer<typeof Chat>;` line and append:

```ts
export type MuteMessage = z.infer<typeof Mute>;
export type UnmuteMessage = z.infer<typeof Unmute>;
export type KickMessage = z.infer<typeof Kick>;
export type KickedMessage = z.infer<typeof Kicked>;
export type PromoteMessage = z.infer<typeof Promote>;
export type DemoteMessage = z.infer<typeof Demote>;
export type SetBitrateMessage = z.infer<typeof SetBitrate>;
export type MuteKindValue = z.infer<typeof MuteKind>;
```

- [ ] **Step 5: Re-export from `index.ts`**

In `packages/signaling-protocol/src/index.ts`, find the existing messages re-export block (the one that exports `Chat`, `ChatHistory`, `IceCand`, etc.). Add the seven new schemas alphabetically and the eight new types in the type-exports section:

```ts
// Add to the schema exports (the non-`type` lines in the same block):
Demote,
Kick,
Kicked,
Mute,
MuteKind,
Promote,
SetBitrate,
Unmute,

// Add to the type-only section:
type DemoteMessage,
type KickMessage,
type KickedMessage,
type MuteKindValue,
type MuteMessage,
type PromoteMessage,
type SetBitrateMessage,
type UnmuteMessage,
```

- [ ] **Step 6: Run typecheck**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
```

Expected: green.

- [ ] **Step 7: Run the full protocol suite to confirm no regression**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: green. (The new schemas are additive — existing tests don't exercise them.)

- [ ] **Step 8: Commit**

```bash
git add packages/signaling-protocol/src/messages.ts packages/signaling-protocol/src/index.ts
git commit -m "feat(signaling-protocol): director role + 7 moderation wire types (EPIC-12 #1/8)"
```

---

## Task 2: Two new error classes

**Files:**

- Modify: `packages/signaling-protocol/src/errors.ts`
- Modify: `packages/signaling-protocol/src/index.ts`

- [ ] **Step 1: Add the new error classes**

Append to `packages/signaling-protocol/src/errors.ts` (after `SignalingRateLimitError`):

```ts
/**
 * Thrown when a peer attempts to claim `role: "director"` for a room that
 * already has a director. The engine enforces first-claim wins; co-directors
 * are added at runtime via the `promote` command.
 */
export class SignalingDirectorConflictError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "director_conflict" });
    this.name = "SignalingDirectorConflictError";
  }
}

/**
 * Thrown when a non-director peer issues a director-only command
 * (`mute`, `unmute`, `kick`, `promote`, `demote`, `set-bitrate`) AND the
 * engine has `enforceModerationCommands: true`. With enforcement off the
 * engine relays such commands honor-based (the target decides whether to
 * obey).
 */
export class SignalingPermissionError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "not_authorized" });
    this.name = "SignalingPermissionError";
  }
}
```

- [ ] **Step 2: Re-export from `index.ts`**

In `packages/signaling-protocol/src/index.ts`, add `SignalingDirectorConflictError` and `SignalingPermissionError` to the existing errors-export block (alphabetical):

```ts
export {
  PeerNotFoundError,
  RoomFullError,
  SignalingAuthError,
  SignalingDirectorConflictError,
  SignalingPermissionError,
  SignalingProtocolError,
  SignalingRateLimitError,
  SignalingValidationError,
  type SignalingErrorOptions,
} from "./errors.ts";
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol typecheck
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add packages/signaling-protocol/src/errors.ts packages/signaling-protocol/src/index.ts
git commit -m "feat(signaling-protocol): SignalingDirectorConflictError + SignalingPermissionError (EPIC-12 #2/8)"
```

---

## Task 3: `Room` tracks the director set

**Files:**

- Modify: `packages/signaling-protocol/src/rooms.ts`

- [ ] **Step 1: Add the director set + accessor methods**

In `packages/signaling-protocol/src/rooms.ts`, add a private field next to `presenceMap` (around line 51):

```ts
private readonly directorSet = new Set<PeerId>();
```

After the existing `clearPresence` method (right before the chat-history methods), append:

```ts
/** Mark a peer as a director. Idempotent. */
addDirector(peerId: PeerId): void {
  this.directorSet.add(peerId);
}

/** Remove a peer from the director set. No-op if not a director. */
removeDirector(peerId: PeerId): void {
  this.directorSet.delete(peerId);
}

/** True when `peerId` is currently a director of this room. */
isDirector(peerId: PeerId): boolean {
  return this.directorSet.has(peerId);
}

/** True when this room currently has at least one director. */
hasAnyDirector(): boolean {
  return this.directorSet.size > 0;
}

/** Snapshot of the director set (fresh array, safe to iterate). */
directorList(): readonly PeerId[] {
  return [...this.directorSet];
}
```

- [ ] **Step 2: Verify typecheck + existing protocol tests**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add packages/signaling-protocol/src/rooms.ts
git commit -m "feat(signaling-protocol): Room director set + accessors (EPIC-12 #3/8)"
```

---

## Task 4: Session — first-claim director rule + promote / demote

**Files:**

- Modify: `packages/signaling-protocol/src/session.ts`
- Test: `packages/signaling-protocol/test/unit/session-director.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/signaling-protocol/test/unit/session-director.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defineSignalingEngine } from "@/engine.ts";
import { SignalingDirectorConflictError, SignalingPermissionError } from "@/errors.ts";
import type { SignalingMessageType } from "@/messages.ts";

const join = (peer: string, role: "publisher" | "viewer" | "presence" | "director" = "presence") =>
  JSON.stringify({ type: "join", room: "demo", peer, role });

const promote = (target: string) => JSON.stringify({ type: "promote", target });
const demote = (target: string) => JSON.stringify({ type: "demote", target });

describe("Session — director role (EPIC-12)", () => {
  it("first peer to join with role=director becomes director", async () => {
    const session = defineSignalingEngine().openSession();
    session.onSend(() => {});

    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice", "director"));

    const room = session.rooms()[0];
    expect(room?.peers.find((p) => p.peerId === "alice")?.role).toBe("director");
  });

  it("rejects a second director claim", async () => {
    const session = defineSignalingEngine().openSession();
    session.onSend(() => {});

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleMessage("sa", join("alice", "director"));

    await expect(session.handleMessage("sb", join("bob", "director"))).rejects.toBeInstanceOf(
      SignalingDirectorConflictError,
    );
  });

  it("releases the director slot when the director leaves", async () => {
    const session = defineSignalingEngine().openSession();
    session.onSend(() => {});

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleMessage("sa", join("alice", "director"));
    await session.handleDisconnect("sa");

    // Bob can now claim it.
    await session.handleMessage("sb", join("bob", "director"));
  });

  it("promote adds another peer to the director set (honor mode = always relayed)", async () => {
    const session = defineSignalingEngine().openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleMessage("sa", join("alice", "director"));
    await session.handleMessage("sb", join("bob", "presence"));

    sent.length = 0;
    await session.handleMessage("sa", promote("bob"));

    // Engine relays the promote to the target so bob's client knows.
    const relayed = sent.find((s) => s.peerId === "bob" && s.msg.type === "promote");
    expect(relayed).toBeDefined();
  });

  it("demote removes a peer from the director set", async () => {
    const session = defineSignalingEngine().openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleMessage("sa", join("alice", "director"));
    await session.handleMessage("sb", join("bob", "presence"));

    await session.handleMessage("sa", promote("bob"));
    sent.length = 0;
    await session.handleMessage("sa", demote("bob"));

    const relayed = sent.find((s) => s.peerId === "bob" && s.msg.type === "demote");
    expect(relayed).toBeDefined();
  });

  it("with enforcement on, a non-director's promote is rejected", async () => {
    const session = defineSignalingEngine({ enforceModerationCommands: true }).openSession();
    session.onSend(() => {});

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleConnection("sc", {});
    await session.handleMessage("sa", join("alice", "director"));
    await session.handleMessage("sb", join("bob", "presence"));
    await session.handleMessage("sc", join("carol", "presence"));

    await expect(session.handleMessage("sb", promote("carol"))).rejects.toBeInstanceOf(
      SignalingPermissionError,
    );
  });

  it("with enforcement off, a non-director's promote is relayed (honor mode)", async () => {
    const session = defineSignalingEngine().openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleConnection("sc", {});
    await session.handleMessage("sa", join("alice", "director"));
    await session.handleMessage("sb", join("bob", "presence"));
    await session.handleMessage("sc", join("carol", "presence"));

    sent.length = 0;
    await session.handleMessage("sb", promote("carol"));
    expect(sent.find((s) => s.peerId === "carol" && s.msg.type === "promote")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test -- session-director
```

Expected: failures — director enforcement + promote/demote not implemented.

- [ ] **Step 3: Add `enforceModerationCommands` to `SessionOptions` + `SignalingEngineOptions`**

In `packages/signaling-protocol/src/session.ts`, update the imports to include the two new errors:

```ts
import {
  PeerNotFoundError,
  SignalingAuthError,
  SignalingDirectorConflictError,
  SignalingPermissionError,
  SignalingRateLimitError,
  SignalingValidationError,
} from "./errors.ts";
```

Add to `SessionOptions`:

```ts
/**
 * When `true`, the engine rejects director-only commands (`mute`,
 * `unmute`, `kick`, `promote`, `demote`, `set-bitrate`) from non-director
 * senders with {@link SignalingPermissionError}. Default `false`: the
 * engine relays the message and the target client decides whether to
 * obey (honor-based mode). `kick` is always engine-enforced when
 * enforcement is on (forced disconnect).
 */
enforceModerationCommands?: boolean;
```

Add a private field + initializer:

```ts
private readonly enforceModerationCommands: boolean;

// in the constructor, after this.chatHistoryPerRoom = ...:
this.enforceModerationCommands = opts.enforceModerationCommands ?? false;
```

In `packages/signaling-protocol/src/engine.ts`, add the same option to `SignalingEngineOptions`:

```ts
/** Forwarded to every {@link Session}. See `SessionOptions.enforceModerationCommands`. */
enforceModerationCommands?: boolean;
```

- [ ] **Step 4: Enforce first-claim director in `applyJoin`**

In `applyJoin`, immediately after the `authenticate` block and BEFORE `const room = this.getOrCreateRoom(message.room);`, insert:

```ts
// EPIC-12: first-claim director rule. Reject any join with role=director
// when this room already has at least one director.
if (message.role === "director") {
  const existing = this.roomMap.get(message.room);
  if (existing !== undefined && existing.hasAnyDirector()) {
    throw new SignalingDirectorConflictError(`room ${message.room} already has a director`, {
      context: { room: message.room, peer: message.peer },
    });
  }
}
```

After the existing `room.add(...)` call, register the director:

```ts
if (message.role === "director") {
  room.addDirector(message.peer);
}
```

- [ ] **Step 5: Drop director on disconnect / leave**

In `handleDisconnect`, BEFORE the existing `if (hadPresence) { ... }` loop (or wherever `room.remove(socket.peerId)` is called), add a director-cleanup line. Find the section that currently looks like:

```ts
if (room !== undefined) {
  room.remove(socket.peerId);
  const hadPresence = room.clearPresence(socket.peerId);
```

Insert immediately after `room.remove(socket.peerId);`:

```ts
room.removeDirector(socket.peerId);
```

In `applyLeave`, find the equivalent room manipulation and add the same line right after `room.remove(message.peer)`:

```ts
room.removeDirector(message.peer);
```

- [ ] **Step 6: Add `applyPromote` + `applyDemote` + dispatch**

Add these private methods at the bottom of the class (next to `applyChat`):

```ts
private applyPromote(
  socket: SocketRecord,
  message: Extract<SignalingMessageType, { type: "promote" }>,
): void {
  this.requireDirectorOrRelay(socket, "promote");
  const room = socket.roomId !== undefined ? this.roomMap.get(socket.roomId) : undefined;
  if (room === undefined) return;
  if (!room.has(message.target)) {
    throw new PeerNotFoundError(`promote target ${message.target} is not in the room`, {
      context: { peer: message.target, room: socket.roomId },
    });
  }
  room.addDirector(message.target);
  // Notify the target so its client can update local UI / role state.
  this.send(message.target, message);
}

private applyDemote(
  socket: SocketRecord,
  message: Extract<SignalingMessageType, { type: "demote" }>,
): void {
  this.requireDirectorOrRelay(socket, "demote");
  const room = socket.roomId !== undefined ? this.roomMap.get(socket.roomId) : undefined;
  if (room === undefined) return;
  room.removeDirector(message.target);
  this.send(message.target, message);
}

/**
 * Internal: enforce the director-only check when `enforceModerationCommands`
 * is on. With enforcement off, all roles can issue commands and the engine
 * just relays them (honor mode).
 */
private requireDirectorOrRelay(socket: SocketRecord, action: string): void {
  if (!this.enforceModerationCommands) return;
  if (socket.roomId === undefined || socket.peerId === undefined) {
    throw new SignalingValidationError(`${action} requires a joined socket`, {
      context: { socketId: socket.socketId, action },
    });
  }
  const room = this.roomMap.get(socket.roomId);
  if (room === undefined || !room.isDirector(socket.peerId)) {
    throw new SignalingPermissionError(
      `${action} is director-only when enforceModerationCommands is on`,
      { context: { socketId: socket.socketId, peer: socket.peerId, action } },
    );
  }
}
```

In the `handleMessage` switch, add cases for the new types right after the `chat` case:

```ts
case "promote":
  this.applyPromote(socket, message);
  return;
case "demote":
  this.applyDemote(socket, message);
  return;
```

- [ ] **Step 7: Re-run the new test**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test -- session-director
```

Expected: all 7 pass.

- [ ] **Step 8: Run the full protocol suite**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: green.

- [ ] **Step 9: Commit**

```bash
git add packages/signaling-protocol/src/session.ts packages/signaling-protocol/src/engine.ts packages/signaling-protocol/test/unit/session-director.test.ts
git commit -m "feat(signaling-protocol): first-claim director rule + promote/demote (EPIC-12 #4/8)"
```

---

## Task 5: Session — `mute` / `unmute` / `kick` / `set-bitrate`

**Files:**

- Modify: `packages/signaling-protocol/src/session.ts`
- Test: `packages/signaling-protocol/test/unit/session-moderation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/signaling-protocol/test/unit/session-moderation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defineSignalingEngine } from "@/engine.ts";
import { SignalingPermissionError } from "@/errors.ts";
import type { SignalingMessageType } from "@/messages.ts";

const join = (peer: string, role: "publisher" | "viewer" | "presence" | "director" = "presence") =>
  JSON.stringify({ type: "join", room: "demo", peer, role });

const mute = (target: string, kind: "audio" | "video" = "audio") =>
  JSON.stringify({ type: "mute", target, kind });

const unmute = (target: string, kind: "audio" | "video" = "audio") =>
  JSON.stringify({ type: "unmute", target, kind });

const kick = (target: string, reason?: string) =>
  JSON.stringify({ type: "kick", target, ...(reason ? { reason } : {}) });

const setBitrate = (target: string, bitsPerSec: number) =>
  JSON.stringify({ type: "set-bitrate", target, bitsPerSec });

async function withDirectorAndPeer(opts?: { enforce?: boolean }) {
  const session = defineSignalingEngine({
    enforceModerationCommands: opts?.enforce ?? false,
  }).openSession();
  const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
  session.onSend((peerId, msg) => {
    sent.push({ peerId, msg });
  });
  await session.handleConnection("sa", {});
  await session.handleConnection("sb", {});
  await session.handleMessage("sa", join("alice", "director"));
  await session.handleMessage("sb", join("bob", "publisher"));
  return { session, sent };
}

describe("Session — mute / unmute (EPIC-12)", () => {
  it("relays mute to the target and broadcasts presence-state to all members", async () => {
    const { session, sent } = await withDirectorAndPeer();
    sent.length = 0;
    await session.handleMessage("sa", mute("bob", "audio"));

    // Direct relay to the target.
    expect(
      sent.find((s) => s.peerId === "bob" && s.msg.type === "mute" && s.msg.kind === "audio"),
    ).toBeDefined();
    // Presence-state fan-out so every peer sees the mute flag.
    const presenceUpdates = sent.filter((s) => s.msg.type === "presence-state");
    expect(presenceUpdates.length).toBeGreaterThan(0);
    const peerIds = new Set(presenceUpdates.map((s) => s.peerId));
    expect(peerIds.has("alice")).toBe(true);
    expect(peerIds.has("bob")).toBe(true);
    const sample = presenceUpdates[0]?.msg as Extract<
      SignalingMessageType,
      { type: "presence-state" }
    >;
    expect(sample.peer).toBe("bob");
    expect(sample.attributes).toMatchObject({ "director-muted-audio": true });
  });

  it("unmute clears the presence flag", async () => {
    const { session, sent } = await withDirectorAndPeer();
    await session.handleMessage("sa", mute("bob", "audio"));
    sent.length = 0;
    await session.handleMessage("sa", unmute("bob", "audio"));

    const presenceUpdate = sent.find((s) => s.msg.type === "presence-state");
    const payload = presenceUpdate!.msg as Extract<
      SignalingMessageType,
      { type: "presence-state" }
    >;
    // Cleared attribute → key is absent from the broadcast payload.
    expect(payload.attributes["director-muted-audio"]).toBeUndefined();
  });

  it("with enforcement on, a non-director's mute is rejected", async () => {
    const { session } = await withDirectorAndPeer({ enforce: true });
    await session.handleConnection("sc", {});
    await session.handleMessage("sc", join("carol", "presence"));

    await expect(session.handleMessage("sc", mute("bob", "audio"))).rejects.toBeInstanceOf(
      SignalingPermissionError,
    );
  });
});

describe("Session — kick (EPIC-12)", () => {
  it("relays a `kicked` notification to the target then drops the peer", async () => {
    const { session, sent } = await withDirectorAndPeer({ enforce: true });
    sent.length = 0;

    await session.handleMessage("sa", kick("bob", "spam"));

    // Target gets a `kicked` notification first.
    const notify = sent.find(
      (s) => s.peerId === "bob" && s.msg.type === "kicked" && s.msg.reason === "spam",
    );
    expect(notify).toBeDefined();

    // Remaining members see peer-left for bob.
    const left = sent.find(
      (s) =>
        s.peerId === "alice" &&
        s.msg.type === "peer-left" &&
        (s.msg as Extract<SignalingMessageType, { type: "peer-left" }>).peer === "bob",
    );
    expect(left).toBeDefined();

    // Engine state reflects the removal.
    const room = session.rooms()[0];
    expect(room?.peers.find((p) => p.peerId === "bob")).toBeUndefined();
  });

  it("with enforcement off, kick is relayed but the engine does NOT drop the peer", async () => {
    const { session, sent } = await withDirectorAndPeer({ enforce: false });
    sent.length = 0;

    await session.handleMessage("sa", kick("bob"));

    expect(sent.find((s) => s.peerId === "bob" && s.msg.type === "kicked")).toBeDefined();
    const room = session.rooms()[0];
    expect(room?.peers.find((p) => p.peerId === "bob")).toBeDefined();
  });
});

describe("Session — set-bitrate (EPIC-12)", () => {
  it("relays the bitrate hint to the target", async () => {
    const { session, sent } = await withDirectorAndPeer();
    sent.length = 0;
    await session.handleMessage("sa", setBitrate("bob", 1_500_000));

    const relayed = sent.find((s) => s.peerId === "bob" && s.msg.type === "set-bitrate");
    expect(relayed).toBeDefined();
  });

  it("with enforcement on, a non-director's set-bitrate is rejected", async () => {
    const { session } = await withDirectorAndPeer({ enforce: true });
    await session.handleConnection("sc", {});
    await session.handleMessage("sc", join("carol", "presence"));

    await expect(session.handleMessage("sc", setBitrate("bob", 500_000))).rejects.toBeInstanceOf(
      SignalingPermissionError,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test -- session-moderation
```

Expected: failures — no command handlers yet.

- [ ] **Step 3: Implement `applyMute` + `applyUnmute`**

In `packages/signaling-protocol/src/session.ts`, add these private methods near the other `apply*` helpers:

```ts
private applyMute(
  socket: SocketRecord,
  message: Extract<SignalingMessageType, { type: "mute" }>,
): void {
  this.requireDirectorOrRelay(socket, "mute");
  const room = socket.roomId !== undefined ? this.roomMap.get(socket.roomId) : undefined;
  if (room === undefined) return;
  if (!room.has(message.target)) return;

  // Direct relay to the target so its client can act (e.g. stop the track).
  this.send(message.target, message);

  // Encode the mute state as a presence attribute on the target so every
  // peer (including late joiners via presence-snapshot) sees it.
  const attrKey = message.kind === "audio" ? "director-muted-audio" : "director-muted-video";
  room.setPresence(message.target, { [attrKey]: true });
  const next = room.getPresence(message.target) ?? {};
  for (const member of room.peers()) {
    this.send(member.peerId, {
      type: "presence-state",
      peer: message.target,
      attributes: next,
    });
  }
}

private applyUnmute(
  socket: SocketRecord,
  message: Extract<SignalingMessageType, { type: "unmute" }>,
): void {
  this.requireDirectorOrRelay(socket, "unmute");
  const room = socket.roomId !== undefined ? this.roomMap.get(socket.roomId) : undefined;
  if (room === undefined) return;
  if (!room.has(message.target)) return;

  this.send(message.target, message);

  const attrKey = message.kind === "audio" ? "director-muted-audio" : "director-muted-video";
  // `null` is the engine's "delete this attribute" sentinel.
  room.setPresence(message.target, { [attrKey]: null });
  const next = room.getPresence(message.target) ?? {};
  for (const member of room.peers()) {
    this.send(member.peerId, {
      type: "presence-state",
      peer: message.target,
      attributes: next,
    });
  }
}
```

- [ ] **Step 4: Implement `applyKick`**

```ts
private applyKick(
  socket: SocketRecord,
  message: Extract<SignalingMessageType, { type: "kick" }>,
): void {
  this.requireDirectorOrRelay(socket, "kick");
  const roomId = socket.roomId;
  if (roomId === undefined) return;
  const room = this.roomMap.get(roomId);
  if (room === undefined || !room.has(message.target)) return;

  // Notify the kicked peer first so it can surface a friendly UI before
  // the engine drops their binding.
  const notification: Extract<SignalingMessageType, { type: "kicked" }> = {
    type: "kicked",
    room: roomId,
    ...(message.reason !== undefined ? { reason: message.reason } : {}),
  };
  this.send(message.target, notification);

  // With enforcement OFF the engine relays the kick (above) but does NOT
  // forcibly remove the peer — the consumer's client decides whether to
  // honor it.
  if (!this.enforceModerationCommands) return;

  // Drop the target's room binding — mirrors the disconnect path.
  room.remove(message.target);
  room.removeDirector(message.target);
  const hadPresence = room.clearPresence(message.target);
  this.peerIndex.delete(message.target);
  this.buckets.delete(message.target);
  for (const member of room.peers()) {
    this.send(member.peerId, { type: "peer-left", peer: message.target });
    if (hadPresence) {
      this.send(member.peerId, {
        type: "presence-state",
        peer: message.target,
        attributes: {},
      });
    }
  }
  if (room.size === 0) this.roomMap.delete(room.id);

  // Clear the target socket's room/peer binding so subsequent messages
  // from it route as "unbound".
  for (const s of this.sockets.values()) {
    if (s.peerId === message.target && s.roomId === roomId) {
      delete s.peerId;
      delete s.roomId;
    }
  }
}
```

- [ ] **Step 5: Implement `applySetBitrate`**

```ts
private applySetBitrate(
  socket: SocketRecord,
  message: Extract<SignalingMessageType, { type: "set-bitrate" }>,
): void {
  this.requireDirectorOrRelay(socket, "set-bitrate");
  const room = socket.roomId !== undefined ? this.roomMap.get(socket.roomId) : undefined;
  if (room === undefined || !room.has(message.target)) return;
  this.send(message.target, message);
}
```

- [ ] **Step 6: Add cases to the `handleMessage` switch**

Add the four new cases right after the `demote` case from Task 4:

```ts
case "mute":
  this.applyMute(socket, message);
  return;
case "unmute":
  this.applyUnmute(socket, message);
  return;
case "kick":
  this.applyKick(socket, message);
  return;
case "set-bitrate":
  this.applySetBitrate(socket, message);
  return;
case "kicked":
  // Server-only message — clients should never send this. Treat as
  // protocol violation but don't throw (forward-compatible no-op).
  return;
```

- [ ] **Step 7: Re-run the new test**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test -- session-moderation
```

Expected: all 7 pass.

- [ ] **Step 8: Run the full protocol suite**

```bash
pnpm --filter @forinda/video-sdk-signaling-protocol test
```

Expected: green.

- [ ] **Step 9: Commit**

```bash
git add packages/signaling-protocol/src/session.ts packages/signaling-protocol/test/unit/session-moderation.test.ts
git commit -m "feat(signaling-protocol): mute/unmute/kick/set-bitrate commands (EPIC-12 #5/8)"
```

---

## Task 6: `Room` adapter — track director set + expose `directors`

**Files:**

- Modify: `packages/core/src/room/types.ts`
- Modify: `packages/core/src/room/room.ts`
- Test: `packages/core/test/unit/room/room.test.ts` (extend)

- [ ] **Step 1: Add a `directors` getter to the `RoomLeader` contract + the public `Room` class**

In `packages/core/src/room/types.ts`, update the `RoomLeader` interface to add the new getter:

```ts
export interface RoomLeader {
  readonly room: string;
  readonly peerId: string;
  readonly signaling: SignalingTransport;
  /** The role the Room has joined as, or `null` until the first child starts. */
  readonly role: RoleValue | null;
  /** Live list of director peer ids (includes self iff this peer is a director). */
  readonly directors: readonly string[];
  /** Open the transport if not already open. Idempotent. */
  ensureConnected(): Promise<void>;
  ensureJoined(role: RoleValue): Promise<void>;
}
```

- [ ] **Step 2: Implement director tracking in the `Room` class**

In `packages/core/src/room/room.ts`, add a private set + the public getter alongside the existing fields:

```ts
private readonly directorSet = new Set<string>();

get directors(): readonly string[] {
  return [...this.directorSet];
}
```

(Place `directors` next to the existing `get role()` getter for visual locality.)

- [ ] **Step 3: Subscribe to wire events to keep the set live**

Find the existing `.on("message", ...)` subscription inside `Room.start()` (or wherever the Room currently routes inbound messages — check the file). The Room currently listens for state events; extend the message subscription to track director changes. If the Room doesn't yet subscribe to `"message"`, add the subscription right after `ensureConnected()` resolves:

```ts
this.disposers.push(
  this.signaling.on("message", (msg) => {
    if (msg.type === "peer-joined" && msg.role === "director") {
      this.directorSet.add(msg.peer);
    } else if (msg.type === "peer-left") {
      this.directorSet.delete(msg.peer);
    } else if (msg.type === "promote") {
      this.directorSet.add(msg.target);
    } else if (msg.type === "demote") {
      this.directorSet.delete(msg.target);
    }
  }),
);
```

(If `this.disposers` doesn't exist on Room, fall back to capturing the unsubscribe in a local `directorMessageOff` field that `close()` calls. Look at how the existing `state` listener is cleaned up and mirror that pattern.)

In `ensureJoined`, when the role is `"director"`, also add self to the set immediately (the engine confirms via the join response, but local state needs to reflect intent):

```ts
if (role === "director") {
  this.directorSet.add(this.peerId);
}
```

(Add this line right after the existing `this.joinedRole = role;` assignment.)

In `close()`, clear the set:

```ts
this.directorSet.clear();
```

- [ ] **Step 4: Add a test**

In `packages/core/test/unit/room/room.test.ts`, append a new describe block:

```ts
describe("Room — directors set (EPIC-12)", () => {
  it("starts empty; the joining director appears in directors", async () => {
    const fx = defineEngineFixture();
    const transport = await fx.open("sa");
    const room = defineRoom({ signaling: transport, room: "demo", peerId: "alice" });

    expect(room.directors).toEqual([]);
    await room.ensureConnected();
    await room.ensureJoined("director");
    expect(room.directors).toEqual(["alice"]);

    await room.close();
    await fx.closeAll();
  });

  it("adds remote directors via peer-joined events", async () => {
    const fx = defineEngineFixture();
    const aliceT = await fx.open("sa");
    const aliceRoom = defineRoom({ signaling: aliceT, room: "demo", peerId: "alice" });
    await aliceRoom.ensureConnected();
    await aliceRoom.ensureJoined("director");

    const bobT = await fx.open("sb");
    const bobRoom = defineRoom({ signaling: bobT, room: "demo", peerId: "bob" });
    await bobRoom.ensureConnected();
    await bobRoom.ensureJoined("presence");

    // Allow alice to receive bob's peer-joined.
    await Promise.resolve();

    expect([...aliceRoom.directors].sort()).toEqual(["alice"]);
    expect([...bobRoom.directors].sort()).toEqual(["alice"]);

    await aliceRoom.close();
    await bobRoom.close();
    await fx.closeAll();
  });
});
```

- [ ] **Step 5: Re-run core tests**

```bash
pnpm --filter @forinda/video-sdk-core test -- room/room
```

Expected: the new tests pass alongside the existing room tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/room/types.ts packages/core/src/room/room.ts packages/core/test/unit/room/room.test.ts
git commit -m "feat(core): Room.directors live set (EPIC-12 #6/8)"
```

---

## Task 7: React `useRoom()` extension — `role`, `directors`, `sendCommand`

**Files:**

- Modify: `packages/react/src/use-room.ts`
- Test: `packages/react/test/unit/use-room.test.tsx`

- [ ] **Step 1: Write the failing test**

In `packages/react/test/unit/use-room.test.tsx`, append:

```tsx
describe("useRoom — moderation surface (EPIC-12)", () => {
  it("exposes the role and director list", async () => {
    const fx = defineEngineFixture();
    const transport = await fx.open("sa");
    const { result } = renderHook(() =>
      useRoom({ room: "demo", peerId: "alice", signaling: transport }),
    );
    await act(async () => {
      await result.current.room?.ensureConnected();
      await result.current.room?.ensureJoined("director");
    });

    expect(result.current.role).toBe("director");
    expect(result.current.directors).toEqual(["alice"]);

    await fx.closeAll();
  });

  it("sendCommand({ type: 'mute' }) sends a mute message", async () => {
    const fx = defineEngineFixture();
    const transport = await fx.open("sa");
    const { result } = renderHook(() =>
      useRoom({ room: "demo", peerId: "alice", signaling: transport }),
    );
    await act(async () => {
      await result.current.room?.ensureConnected();
      await result.current.room?.ensureJoined("director");
    });

    const sendSpy = vi.spyOn(transport, "send");
    await act(async () => {
      await result.current.sendCommand({ type: "mute", target: "bob", kind: "audio" });
    });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "mute", target: "bob", kind: "audio" }),
    );

    await fx.closeAll();
  });
});
```

(The existing `useRoom.test.tsx` should already import `defineEngineFixture`; if not, add `import { defineEngineFixture } from "@forinda/test-helpers";` and `import { vi } from "vitest";` at the top.)

- [ ] **Step 2: Update the hook surface**

In `packages/react/src/use-room.ts`, update the `UseRoomResult` interface:

```ts
import type {
  defineRoom,
  type Room,
  type RoleValue,
  type SignalingTransport,
  type TransportState,
} from "@forinda/video-sdk-core";

// Director-only command shapes — flat union, mirrors the wire format.
export type ModerationCommand =
  | { type: "mute"; target: string; kind: "audio" | "video" }
  | { type: "unmute"; target: string; kind: "audio" | "video" }
  | { type: "kick"; target: string; reason?: string }
  | { type: "promote"; target: string }
  | { type: "demote"; target: string }
  | { type: "set-bitrate"; target: string; bitsPerSec: number };

export interface UseRoomResult {
  room: Room | null;
  state: TransportState;
  error: Error | null;
  /** The role the Room has joined as, or `null` until the first child starts. */
  role: RoleValue | null;
  /** Live list of director peer ids (re-renders on peer-joined/promote/demote). */
  directors: readonly string[];
  /** Send a moderation command — director-only when the engine has `enforceModerationCommands: true`. */
  sendCommand: (cmd: ModerationCommand) => Promise<void>;
}
```

- [ ] **Step 3: Track role + directors + add sendCommand**

In the same file, extend the hook body. Add new state hooks after the existing `state`/`error`:

```ts
const [role, setRole] = useState<RoleValue | null>(null);
const [directors, setDirectors] = useState<readonly string[]>([]);
```

In the existing effect that constructs the `Room`, after the room is created and listeners are attached, add a polling sync (Room exposes `role` + `directors` as plain getters; we need to surface changes). The simplest path is to subscribe to the underlying transport's `message` event and rebuild from the room snapshot:

```ts
const offMessage = signaling.on("message", (msg) => {
  if (
    msg.type === "peer-joined" ||
    msg.type === "peer-left" ||
    msg.type === "promote" ||
    msg.type === "demote"
  ) {
    setDirectors([...r.directors]);
  }
});
// Push offMessage to the existing cleanup list (next to offError, offTransportState):
disposers.push(offMessage);
```

(Place this inside the existing `if (signaling !== undefined)` block. If there is no `disposers` array, mirror the pattern used by `offError`/`offTransportState` cleanup — return a function that calls `offMessage()` alongside the others.)

Update the cleanup function returned by the effect to also call `offMessage()` and reset `setRole(null) / setDirectors([])` alongside the existing resets.

In the same effect, after `r.role` becomes available (subscribe via the room's existing role machinery), keep `role` in sync. The simplest hook is to update on every transport message:

```ts
setRole(r.role); // initial; re-pull on every relevant message
```

(Add this right after `setDirectors(...)`.)

Add the `sendCommand` callback:

```ts
const sendCommand = useCallback(
  async (cmd: ModerationCommand): Promise<void> => {
    if (!room) return;
    await room.signaling.send(cmd);
  },
  [room],
);
```

Return the new fields from the hook:

```ts
return { room, state, error, role, directors, sendCommand };
```

- [ ] **Step 4: Re-run the React tests**

```bash
pnpm --filter @forinda/video-sdk-react test -- use-room
```

Expected: both new tests pass.

- [ ] **Step 5: Run the full React suite**

```bash
pnpm --filter @forinda/video-sdk-react test
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/use-room.ts packages/react/test/unit/use-room.test.tsx
git commit -m "feat(react): useRoom exposes role/directors/sendCommand (EPIC-12 #7/8)"
```

---

## Task 8: Workspace verify, READMEs, changeset, tag

**Files:**

- Modify: `packages/signaling-protocol/README.md`
- Modify: `packages/core/README.md`
- Modify: `packages/react/README.md`
- Create: `.changeset/director-moderation.md`

- [ ] **Step 1: Update `packages/signaling-protocol/README.md`**

Find the wire-format table (the one starting with `| join | client → server |...`) and update it to include the seven new types. Append rows in order:

```markdown
| `mute` | director → server | mute the target's audio or video (relayed + presence-state broadcast) |
| `unmute` | director → server | clear a previous `mute` |
| `kick` | director → server | force-remove the target (engine-enforced when enforcement is on) |
| `kicked` | server → target | one-shot notification right before the engine drops the binding |
| `promote` | director → server | add `target` to the room's director set |
| `demote` | director → server | remove `target` from the room's director set |
| `set-bitrate` | director → server | bandwidth ceiling hint relayed to the target |
```

After the existing "Errors" subsection, append the new error rows to the table:

```markdown
| `SignalingDirectorConflictError` | `director_conflict` | A second peer tried to join with `role: "director"` while a director already exists |
| `SignalingPermissionError` | `not_authorized` | A non-director sent a moderation command and `enforceModerationCommands` is on |
```

Right after the chat-history section, append:

````markdown
### Director / moderation

```ts
const engine = defineSignalingEngine({ enforceModerationCommands: true });
```
````

The `Role` enum gains `"director"`. The first peer to join a room with `role: "director"` claims it; subsequent claims throw `SignalingDirectorConflictError`. Co-directors are added at runtime via the `promote` command.

Six director-only commands ride the wire: `mute`, `unmute`, `kick`, `promote`, `demote`, `set-bitrate`.

- **Honor mode (default)**: the engine relays each command to the target and (for `mute`/`unmute`) updates the target's presence attributes so every peer sees the state change. The target's client decides whether to obey. Non-director senders are accepted.
- **Enforced mode** (`enforceModerationCommands: true`): non-director senders are rejected with `SignalingPermissionError(code: "not_authorized")`. `kick` additionally removes the target from the room (forced disconnect on the host side).

`mute` / `unmute` encode state as presence attributes (`director-muted-audio: true`, `director-muted-video: true`) so late joiners see the current state via the existing `presence-snapshot`. No new state-snapshot wire type was added.

````

- [ ] **Step 2: Update `packages/core/README.md`**

In the `defineRoom` section, find the existing methods table (the one listing `publisher()`, `viewer()`, `channel()`). Add a row for the new getter:

```markdown
| `directors` (getter) | `readonly string[]` — live list of director peer ids in this room. Updated on every `peer-joined` / `peer-left` / `promote` / `demote` event. |
````

Add a new subsection right after the `defineRoom` example:

````markdown
#### Director role + moderation

When a `Room` joins with `role: "director"`, it appears in `room.directors` immediately. Send director commands through the underlying transport (or use the `useRoom` adapter's `sendCommand` for React):

```ts
const room = defineRoom({ signaling, room: "demo", peerId: "alice" });
await room.ensureConnected();
await room.ensureJoined("director");

await room.signaling.send({ type: "mute", target: "bob", kind: "audio" });
await room.signaling.send({ type: "kick", target: "spammer", reason: "off-topic" });
```
````

Mute state is encoded as presence attributes (`director-muted-audio: true` / `director-muted-video: true`) on the target's `room.peers` entry — your UI can render the indicator from the same presence map you already read for chat / hand-raise.

````

- [ ] **Step 3: Update `packages/react/README.md`**

Find the `useRoom(opts)` section. Replace the existing return-shape description with one that includes the new fields, and append a moderation example:

```markdown
### `useRoom(opts)`

Construct a `Room` for the calling component's lifetime. Returns `{ room, state, error, role, directors, sendCommand }`.

- `role`: the role the Room joined as (`"publisher" | "viewer" | "presence" | "director" | null`).
- `directors`: live list of director peer ids in this room (re-renders on `peer-joined` / `promote` / `demote`).
- `sendCommand`: send a moderation command (director-only when the engine has `enforceModerationCommands: true`).

```tsx
const { room, role, directors, sendCommand } = useRoom({
  room: "demo",
  peerId: "alice",
});

const isDirector = role === "director" || directors.includes("alice");

return (
  <>
    {isDirector && (
      <button
        onClick={() => sendCommand({ type: "mute", target: "bob", kind: "audio" })}
      >
        Mute Bob
      </button>
    )}
  </>
);
````

The available command shapes are: `mute` / `unmute` (`{ target, kind }`), `kick` (`{ target, reason? }`), `promote` / `demote` (`{ target }`), `set-bitrate` (`{ target, bitsPerSec }`).

````

- [ ] **Step 4: Workspace verify**

```bash
pnpm typecheck && pnpm test && pnpm build && pnpm lint
````

Expected: every step exits 0.

- [ ] **Step 5: Create the changeset**

Create `.changeset/director-moderation.md`:

```markdown
---
"@forinda/video-sdk-signaling-protocol": minor
"@forinda/video-sdk-core": minor
"@forinda/video-sdk-react": minor
"@forinda/video-sdk-vue": patch
"@forinda/video-sdk-signaling-ws": patch
"@forinda/video-sdk-signaling-broadcast": patch
"@forinda/video-sdk-elements": patch
---

Director role + moderation commands (EPIC-12).

### Added

- **`Role: "director"`** — fourth role in the schema. The engine enforces first-claim wins per room: a second peer attempting to join with `role: "director"` rejects with the new `SignalingDirectorConflictError(code: "director_conflict")`.
- **Six director-only commands** as flat top-level wire-format messages: `mute`, `unmute`, `kick`, `promote`, `demote`, `set-bitrate`. Plus a server → target `kicked` notification.
- **Honor-based by default** — the engine relays each command to the target. With `defineSignalingEngine({ enforceModerationCommands: true })` the engine rejects non-director senders with the new `SignalingPermissionError(code: "not_authorized")`. Enforced `kick` additionally drops the target's room binding.
- **State piggybacks on presence** — `mute` / `unmute` encode their effect as `director-muted-audio` / `director-muted-video` attributes on the target's presence entry, so late joiners see current mute state via the existing `presence-snapshot` mechanism. No new state-snapshot wire type added.
- **`Room.directors`** (core) — live `readonly string[]` of director peer ids, kept in sync with `peer-joined` / `peer-left` / `promote` / `demote` events.
- **`useRoom().role` / `directors` / `sendCommand(cmd)`** (react) — adapter surface for moderation UIs.

### Deferred to follow-up (EPIC-12b)

- Vue adapter parity for `sendCommand`.
- `<forinda-room-controls>` Web Component.
- Server-enforced `set-bitrate` (requires SFU integration — EPIC-14).
```

- [ ] **Step 6: Commit + tag**

```bash
git add packages/signaling-protocol/README.md packages/core/README.md packages/react/README.md .changeset/director-moderation.md
git commit -m "docs: director role + moderation (EPIC-12 #8/8) + changeset"
git tag -a v0.0.0-epic-12 -m "EPIC-12: Director role + moderation"
```

---

## Self-review notes

**Spec coverage** (vs. roadmap acceptance criteria for EPIC-12):

- ✅ New `Role` value `"director"`; engine validates first-joiner gets it — Tasks 1, 4.
- ✅ New wire types for moderation — Task 1 (six commands + `kicked` notification).
- ⚠️ Roadmap mentioned `room-state` broadcast — replaced with the cleaner "encode state in presence attributes" approach (no new state-snapshot type needed). Documented in the changeset under "State piggybacks on presence."
- ✅ React: `useRoom()` exposing `{ role, peers, sendCommand }` — Task 7. (`peers` is already on `Room` via `room.peers` from the channel; the hook exposes the room itself so consumers reach it through there.)
- 🚫 `<forinda-room-controls>` element — explicitly deferred to EPIC-12b.
- ✅ Honor-based by default; `defineSignalingEngine({ enforceModerationCommands: true })` rejects non-director commands — Tasks 4, 5.

**Type consistency:**

- `Role`, `MuteKind`, plus the seven message schemas all defined once in `messages.ts`, re-exported through `index.ts`.
- `SignalingDirectorConflictError` / `SignalingPermissionError` defined together in `errors.ts`.
- React hook's `ModerationCommand` union mirrors the wire format 1:1 (same field names, same literals).

**Placeholders:** none. Every step has concrete code or commands.

**Gotcha worth flagging:** Task 5's `applyKick` mutates the target socket's `peerId`/`roomId` bindings via the `for (const s of this.sockets.values())` loop. This is intentional — without it, a kicked socket could send subsequent `chat` / `presence-update` messages that would still be routed by the engine via the stale binding. The loop is small (number of open sockets), so the linear scan is fine.
