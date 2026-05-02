# EPIC-11 Presence + Raise Hand + Chat Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a room-level interaction layer: per-peer presence (sticky attributes like "hand-raised"), broadcast/DM chat, and React hooks for both.

**Architecture:** Two new wire types in `signaling-protocol` — `presence-update` (client→server) and `chat` (client→server). Server fans out as `presence-state` to existing peers and `presence-snapshot` to new joiners. Engine maintains a per-room presence map. New core primitive `defineRoomChannel({ signaling, room, peerId })` wraps a `SignalingTransport` with presence + chat state. React surface: `useRoomChannel`, `usePresence`, `useChat`, `useRaiseHand` (sugar over presence).

**Out of scope (for follow-up epic):** web-component elements `<forinda-presence-list>` / `<forinda-chat>` / `<forinda-raise-hand>`. Vanilla TS consumers can use `defineRoomChannel` directly today; the elements layer is a UX concern best designed once we know what consumers actually do with the React hooks.

**Why this scope:** Protocol + core + React give consumers everything they need to build chat/raise-hand UIs in any framework. Web-components UI primitives are larger design questions (rendering style, slots, theming) that benefit from one round of real-world feedback first.

---

## File Structure

- `packages/signaling-protocol/src/messages.ts` — add `JsonValue`, `PresenceUpdate`, `PresenceState`, `PresenceSnapshot`, `Chat` schemas; extend `SignalingMessage` discriminated union; extend `Role` enum with `"presence"`.
- `packages/signaling-protocol/src/session.ts` — track per-room presence map; on join send snapshot; on `presence-update` merge + broadcast; on `chat` route (DM if `to`, broadcast otherwise); on leave clear entry + broadcast.
- `packages/signaling-protocol/src/index.ts` — re-export new types.
- `packages/signaling-protocol/test/unit/session.test.ts` (or new file `presence-chat.test.ts`) — engine behavior tests.
- `packages/core/src/room/types.ts` — option + event shapes for RoomChannel.
- `packages/core/src/room/room-channel.ts` — `defineRoomChannel` factory + `RoomChannel` class.
- `packages/core/src/index.ts` — re-export.
- `packages/core/test/unit/room/room-channel.test.ts` — uses test-helpers' in-memory transport pair + a fake engine to verify presence/chat flows.
- `packages/react/src/use-room-channel.ts` — hook returning a stable `RoomChannel` handle.
- `packages/react/src/use-presence.ts` — hook over `RoomChannel`.
- `packages/react/src/use-chat.ts` — hook over `RoomChannel`.
- `packages/react/src/use-raise-hand.ts` — sugar over `usePresence`.
- `packages/react/src/index.ts` — re-export.
- `packages/react/test/unit/` — one test file per hook.
- READMEs: `signaling-protocol`, `core`, `react` updated with new APIs.

---

## Task 1: Protocol — `JsonValue` + presence + chat wire types

**Files:**

- Modify: `packages/signaling-protocol/src/messages.ts`
- Modify: `packages/signaling-protocol/src/index.ts`

- [ ] **Step 1: Add `JsonValue`, `Role` extension, and four new wire schemas**

In `messages.ts`, after the existing `Role`/`PeerId`/`RoomId` constants:

```ts
/** Recursive JSON-compatible value. Used for free-form presence attribute values. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);
```

Extend `Role`:

```ts
export const Role = z.enum(["publisher", "viewer", "presence"]);
```

After `IceCand`, add the four new schemas:

```ts
/** Client → server. Set/replace one or more of this peer's presence attributes. */
export const PresenceUpdate = z.object({
  type: z.literal("presence-update"),
  peer: PeerId,
  attributes: z.record(z.string().min(1).max(64), JsonValueSchema),
});

/** Server → client. A peer's presence changed. Fires after every `presence-update`. */
export const PresenceState = z.object({
  type: z.literal("presence-state"),
  peer: PeerId,
  attributes: z.record(z.string().min(1).max(64), JsonValueSchema),
});

/** Server → joining client. Initial snapshot of every peer's presence. Sent once after join. */
export const PresenceSnapshot = z.object({
  type: z.literal("presence-snapshot"),
  room: RoomId,
  peers: z.record(PeerId, z.record(z.string().min(1).max(64), JsonValueSchema)),
});

/**
 * Client → server (broadcast) or client → server → specific peer (DM).
 * Server stamps `from` from the socket binding; client-supplied `from` is
 * accepted but engine validates it matches the peer's binding.
 */
export const Chat = z.object({
  type: z.literal("chat"),
  from: PeerId,
  to: PeerId.optional(),
  body: z.string().min(1).max(8192),
  ts: z.number().int().nonnegative(),
});
```

Extend the discriminated union:

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
]);
```

Export the inferred types alongside existing ones.

- [ ] **Step 2: Re-export from `index.ts`**

```ts
export {
  ...,
  PresenceUpdate,
  PresenceState,
  PresenceSnapshot,
  Chat,
  type PresenceUpdateMessage,
  type PresenceStateMessage,
  type PresenceSnapshotMessage,
  type ChatMessage,
  type JsonValue,
} from "./messages.ts";
```

- [ ] **Step 3: Run signaling-protocol tests + typecheck**

Run: `pnpm --filter @forinda/video-sdk-signaling-protocol typecheck`
Expected: green.

Run: `pnpm --filter @forinda/video-sdk-signaling-protocol test`
Expected: green; existing tests still pass (we haven't changed their semantics, just added schemas).

- [ ] **Step 4: Commit**

```bash
git add packages/signaling-protocol
git commit -m "feat(signaling-protocol): add presence + chat wire types (EPIC-11)"
```

---

## Task 2: Engine — presence map + chat routing

**Files:**

- Modify: `packages/signaling-protocol/src/session.ts`
- Create: `packages/signaling-protocol/test/unit/presence-chat.test.ts` (or extend existing `session.test.ts`)

- [ ] **Step 1: Add presence map to room state**

The `Session` keeps rooms in a `Map<RoomId, Room>`. Decide: extend `Room` with a presence map, or keep presence at the Session level? **Decision:** add to `Room` — keeps room-local state together (matches existing `peers()`, `add()`, `remove()` shape).

In `rooms.ts`:

```ts
/** Per-peer presence attributes. Keys are arbitrary; values are JSON-serializable. */
private presenceMap = new Map<PeerId, Record<string, JsonValue>>();

setPresence(peerId: PeerId, attributes: Record<string, JsonValue>): void {
  const existing = this.presenceMap.get(peerId) ?? {};
  // Merge: undefined-valued keys delete; defined values overwrite.
  const next = { ...existing };
  for (const [k, v] of Object.entries(attributes)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  if (Object.keys(next).length === 0) this.presenceMap.delete(peerId);
  else this.presenceMap.set(peerId, next);
}

getPresence(peerId: PeerId): Record<string, JsonValue> | undefined {
  return this.presenceMap.get(peerId);
}

presenceSnapshot(): Record<PeerId, Record<string, JsonValue>> {
  return Object.fromEntries(this.presenceMap);
}

clearPresence(peerId: PeerId): boolean {
  return this.presenceMap.delete(peerId);
}
```

- [ ] **Step 2: Wire `presence-update` handling in Session**

In `session.ts`, extend the `handleMessage` switch (or equivalent dispatch):

```ts
case "presence-update": {
  if (socket.peerId !== message.peer || socket.roomId === undefined) {
    throw new SignalingValidationError("presence-update from peer without join binding");
  }
  const room = this.rooms.get(socket.roomId);
  if (!room) return;
  room.setPresence(message.peer, message.attributes);
  // Broadcast to everyone in the room (including sender — confirms the update applied).
  for (const p of room.peers()) {
    this.send(p.peerId, {
      type: "presence-state",
      peer: message.peer,
      attributes: room.getPresence(message.peer) ?? {},
    });
  }
  return;
}
```

- [ ] **Step 3: Wire `chat` handling in Session**

```ts
case "chat": {
  if (socket.peerId !== message.from || socket.roomId === undefined) {
    throw new SignalingValidationError("chat from peer without join binding");
  }
  const room = this.rooms.get(socket.roomId);
  if (!room) return;
  if (message.to !== undefined) {
    // DM — route only to the target peer if they're in the same room.
    if (room.has(message.to)) this.send(message.to, message);
    return;
  }
  // Broadcast to everyone except sender.
  for (const p of room.peers()) {
    if (p.peerId !== message.from) this.send(p.peerId, message);
  }
  return;
}
```

- [ ] **Step 4: Send presence snapshot on join**

In `applyJoin`, after the existing peer-joined fanout, send the joining peer the current presence snapshot:

```ts
this.send(message.peer, {
  type: "presence-snapshot",
  room: message.room,
  peers: room.presenceSnapshot(),
});
```

- [ ] **Step 5: Clear presence + broadcast on leave**

In `applyLeave` and `handleDisconnect` (wherever a peer is removed from a room), after removing the peer from `peerMap`:

```ts
const had = room.clearPresence(removed.peerId);
if (had) {
  // Broadcast empty presence — clients use this as a signal to drop the entry.
  for (const p of room.peers()) {
    this.send(p.peerId, {
      type: "presence-state",
      peer: removed.peerId,
      attributes: {},
    });
  }
}
```

(The existing `peer-left` broadcast still fires; clients should treat empty `presence-state` and `peer-left` as equivalent "remove from local state.")

- [ ] **Step 6: Tests — engine behavior**

In a new `presence-chat.test.ts`:

1. **`presence-update` from joined peer broadcasts `presence-state` to all room members (incl. sender).**
2. **`presence-update` with empty attribute value (`{ "hand-raised": undefined }`) deletes that key.**
3. **Joining a room receives the current `presence-snapshot`.**
4. **Joining when no peers have presence receives an empty snapshot (`peers: {}`).**
5. **Leaving the room broadcasts `presence-state` with `attributes: {}` to remaining peers.**
6. **`chat` with `to` set delivers only to that peer (and not the sender).**
7. **`chat` without `to` broadcasts to all room peers except the sender.**
8. **`chat` from a peer not in any room is rejected with `SignalingValidationError`.**
9. **`presence-update` from a peer whose `peer` field doesn't match their socket binding is rejected.**

- [ ] **Step 7: Verify**

Run: `pnpm --filter @forinda/video-sdk-signaling-protocol test`
Expected: all new tests + existing tests green.

- [ ] **Step 8: Commit**

```bash
git add packages/signaling-protocol
git commit -m "feat(signaling-protocol): per-room presence map + chat routing (EPIC-11)"
```

---

## Task 3: Core — `defineRoomChannel`

**Files:**

- Create: `packages/core/src/room/types.ts`
- Create: `packages/core/src/room/room-channel.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/unit/room/room-channel.test.ts`

- [ ] **Step 1: Type shapes**

`types.ts`:

```ts
import type { JsonValue, ChatMessage } from "@forinda/video-sdk-signaling-protocol";
import type { SignalingTransport } from "@/signaling/transport.ts";

export interface RoomChannelOptions {
  signaling: SignalingTransport;
  room: string;
  peerId?: string;
  /** When true (default), the channel issues its own `join` with role: "presence" on `start()`. Pass false when sharing a transport with a Publisher/Viewer that already manages the join. */
  manageJoin?: boolean;
  /** Capacity of the in-memory chat history buffer. Default 200. */
  chatHistoryLimit?: number;
}

export interface ChatHistoryEntry extends ChatMessage {
  /** Locally-assigned receive timestamp; useful for sorting when clocks skew. */
  receivedAt: number;
}

export interface RoomChannelEvents {
  /** Fires whenever any peer's presence changes (own + others). */
  presence: { peer: string; attributes: Record<string, JsonValue> };
  /** Initial snapshot or full re-sync. */
  "presence-snapshot": Record<string, Record<string, JsonValue>>;
  "peer-joined": { peer: string; role: string };
  "peer-left": { peer: string };
  chat: ChatHistoryEntry;
  error: Error;
}
```

- [ ] **Step 2: `RoomChannel` class + `defineRoomChannel` factory**

`room-channel.ts`: keep the implementation tight (~150 LOC):

- Subscribes to `signaling.on("message")` and dispatches by `type`.
- Maintains `presence: Map<peerId, Record<string, JsonValue>>` (public read-only via `snapshot()` getter).
- Maintains `chatHistory: ChatHistoryEntry[]` (capped at `chatHistoryLimit`).
- `start({ ownJoin? })`: if `ownJoin` (default `true` when `manageJoin: true`), sends `join` with role `"presence"`. Always issues a no-op presence-update to publish self peer id (or just defers until first `setAttribute`).
- `setAttribute(key, value)`: send `presence-update` with `{ [key]: value }`.
- `removeAttribute(key)`: send `presence-update` with `{ [key]: null }` AND treat `null` semantically as "clear" — the engine deletes when value is null. (Update engine spec accordingly: `null` means delete.) **Decision for clean semantics:** use `null` as delete marker (JSON-serializable, vs `undefined` which can't go on the wire). Update Task 2 step 1 accordingly: in `setPresence`, treat `value === null` as delete.
- `clearAttributes()`: convenience — call `removeAttribute` for every known own key.
- `raiseHand()` / `lowerHand()`: sugar over `setAttribute("hand-raised", true)` / `removeAttribute("hand-raised")`.
- `chat.send(body, { to? })`: send `chat` with `from = this.peerId`, `ts = Date.now()`.
- `stop()`: detach all listeners; if `manageJoin` and we own the join, send `leave`.

- [ ] **Step 3: Re-export from core index**

```ts
export {
  defineRoomChannel,
  RoomChannel,
  type RoomChannelOptions,
  type RoomChannelEvents,
  type ChatHistoryEntry,
} from "./room/room-channel.ts";
```

- [ ] **Step 4: Tests**

Use `defineInMemoryTransportPair` from `@forinda/test-helpers` plus a tiny fake "engine" that dispatches messages back. Or use the real engine from signaling-protocol — even better. Write tests for:

1. `setAttribute("hand-raised", true)` causes a `presence` event with the attribute set.
2. `raiseHand()` / `lowerHand()` round-trip through the engine.
3. Chat `send("hi")` from peer A is received by peer B.
4. DM `send("psst", { to: "B" })` is received by B but not by C.
5. Chat history is capped at `chatHistoryLimit`.
6. Joining mid-room receives `presence-snapshot` for already-present peers.
7. `stop()` after `start()` removes all listeners (no leak).

- [ ] **Step 5: Verify**

```bash
pnpm --filter @forinda/video-sdk-core typecheck
pnpm --filter @forinda/video-sdk-core test
```

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): defineRoomChannel + presence/chat APIs (EPIC-11)"
```

---

## Task 4: React hooks

**Files:**

- Create: `packages/react/src/use-room-channel.ts`
- Create: `packages/react/src/use-presence.ts`
- Create: `packages/react/src/use-chat.ts`
- Create: `packages/react/src/use-raise-hand.ts`
- Modify: `packages/react/src/index.ts`
- Create: `packages/react/test/unit/use-room-channel.test.tsx`
- Create: `packages/react/test/unit/use-presence.test.tsx`
- Create: `packages/react/test/unit/use-chat.test.tsx`

- [ ] **Step 1: `useRoomChannel`**

Returns a stable `RoomChannel` (constructed once per `room`/`peerId` pair). Uses the `VideoSdkProvider` for `signaling`. Auto-starts on mount, cleans up on unmount via AbortController. Mirrors `usePublisher` / `useViewer` shape.

- [ ] **Step 2: `usePresence(channel)`**

Returns `{ peers: Record<peerId, attrs>, setAttribute, removeAttribute, clearAttributes }` — uses `useSyncExternalStore` over `channel.on("presence")` and `channel.on("presence-snapshot")`.

- [ ] **Step 3: `useChat(channel)`**

Returns `{ messages: ChatHistoryEntry[], send }` — `useSyncExternalStore` over `channel.on("chat")`.

- [ ] **Step 4: `useRaiseHand(channel)`**

Sugar: `{ raised: boolean, raise(), lower(), toggle() }`. Reads `presence` for own `peerId`'s `"hand-raised"` attribute.

- [ ] **Step 5: Re-export**

In `react/src/index.ts`:

```ts
export {
  useRoomChannel,
  type UseRoomChannelOptions,
  type UseRoomChannelResult,
} from "./use-room-channel.ts";
export { usePresence, type UsePresenceResult } from "./use-presence.ts";
export { useChat, type UseChatResult } from "./use-chat.ts";
export { useRaiseHand, type UseRaiseHandResult } from "./use-raise-hand.ts";
```

- [ ] **Step 6: Tests**

Mirror the `useViewer` test style: stub a `RoomChannel`, render the hook with `renderHook`, assert state transitions.

- [ ] **Step 7: Verify**

```bash
pnpm --filter @forinda/video-sdk-react typecheck
pnpm --filter @forinda/video-sdk-react test
```

- [ ] **Step 8: Commit**

```bash
git add packages/react
git commit -m "feat(react): useRoomChannel + usePresence + useChat + useRaiseHand hooks (EPIC-11)"
```

---

## Task 5: READMEs + tag

**Files:**

- Modify: `packages/signaling-protocol/README.md`
- Modify: `packages/core/README.md`
- Modify: `packages/react/README.md`

- [ ] **Step 1: Document new wire types** in signaling-protocol README (table row per type).

- [ ] **Step 2: Document `defineRoomChannel`** in core README — full options table, events table, methods table, example.

- [ ] **Step 3: Document the four hooks** in react README — usage example for each.

- [ ] **Step 4: Verify**

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

- [ ] **Step 5: Commit + tag**

```bash
git add packages
git commit -m "docs(presence-chat): per-package READMEs for EPIC-11 surfaces"
git tag -a v0.0.0-epic-11 -m "EPIC-11: presence + raise hand + chat (protocol + core + react)"
```
