# EPIC-19 `defineRoom` Higher-Level Primitive

> Use checkbox (`- [ ]`) syntax for tracking. Hybrid approach — Room owns transport + first-join coordination; existing factories gain `attach?: Room` so consumers can either compose via Room sugar or call `definePublisher({ attach: room, ... })` directly.

**Goal:** Eliminate the duplicate-join footgun (gap #2) when sharing one signaling transport between Publisher/Viewer/RoomChannel/Recorder. Make composition discoverable.

**Architecture:**

- `defineRoom({ signaling, room, peerId? })` returns a `Room` handle that owns the transport's connect/disconnect lifecycle and the **single** `join` message for the room.
- For the attached case we add **proxy factories**: `defineAttachedPublisher(room, opts)`, `defineAttachedViewer(room, opts)`, `defineAttachedRoomChannel(room, opts)`. They construct the same `Publisher`/`Viewer`/`RoomChannel` classes but pass an internal `__leader: RoomLeader` field so lifecycle methods defer to the Room. Standalone `definePublisher` etc. are unchanged.
- Room sugar methods are thin wrappers around the proxy factories: `room.publisher({ stream })` is `defineAttachedPublisher(room, { stream })`.

**Out of scope:** `<forinda-room>` web component (separate UX pass — better designed once the React surface lands and we see real usage).

---

## File structure

- `packages/core/src/room/room.ts` — `defineRoom` + `Room` class
- `packages/core/src/room/types.ts` — extend with `RoomOptions`, `RoomState`, `RoomEvents`, `RoomLeader` interface
- `packages/core/src/publisher/types.ts` + `publisher.ts` — add `attach?: Room` discriminated overload
- `packages/core/src/viewer/types.ts` + `viewer.ts` — same
- `packages/core/src/room/room-channel.ts` — same plus existing `manageJoin` interplay
- `packages/core/src/index.ts` — re-exports
- `packages/core/test/unit/room/room.test.ts` — single-join coordination + sugar method tests
- `packages/react/src/use-room.ts` — new hook
- `packages/react/src/use-publisher.ts` / `use-viewer.ts` / `use-room-channel.ts` / `use-recorder.ts` — accept `attach?: Room`
- `packages/react/src/index.ts` — re-export
- `packages/react/test/unit/use-room.test.tsx` + smoke updates
- `packages/core/README.md` + `packages/react/README.md` — `defineRoom` / `useRoom` sections

---

## Task 1: Core — `defineRoom` + first-join coordinator

**Files:**

- Create: `packages/core/src/room/room.ts`
- Modify: `packages/core/src/room/types.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: `RoomLeader` interface** (in `types.ts`) — the internal contract Publisher/Viewer/RoomChannel use to coordinate.

```ts
import type { RoleValue } from "@forinda/video-sdk-signaling-protocol";

export type RoomState = "idle" | "connecting" | "connected" | "closed";

export interface RoomLeader {
  readonly room: string;
  readonly peerId: string;
  readonly signaling: SignalingTransport;
  /** Open the transport if not already open. Idempotent. */
  ensureConnected(): Promise<void>;
  /**
   * Issue the room's join with the given role iff no peer has joined yet.
   * Subsequent calls assert the role matches and resolve without sending.
   */
  ensureJoined(role: RoleValue): Promise<void>;
  /** Leave + close the transport. Idempotent. */
  close(): Promise<void>;
}
```

- [ ] **Step 2: `Room` class** in `room.ts` implements `RoomLeader`. Tracks `joinedRole: RoleValue | null`. `ensureJoined(role)` short-circuits when role matches and throws `ConfigurationError` when it doesn't — that's the structural fix for "trying to be both publisher and viewer in one Room."

Sugar methods (pure delegation):

```ts
publisher(opts: Omit<PublisherOptions, "signaling" | "room" | "peerId">) { return definePublisher({ attach: this, ...opts }); }
viewer(opts: Omit<ViewerOptions, "signaling" | "room" | "peerId">) { return defineViewer({ attach: this, ...opts }); }
channel(opts: Omit<RoomChannelOptions, "signaling" | "room" | "peerId" | "manageJoin"> = {}) { return defineRoomChannel({ attach: this, ...opts }); }
recorder(stream: MediaStream, opts: RecorderOptions = {}) { return defineRecorder(stream, opts); }
```

- [ ] **Step 3: `defineRoom` factory** following project conventions.

- [ ] **Step 4: Re-export from core index.**

- [ ] **Step 5: Verify typecheck.**

- [ ] **Step 6: Commit.**

---

## Task 2: Extend `definePublisher` with `attach?: Room`

**Files:**

- Modify: `packages/core/src/publisher/types.ts`
- Modify: `packages/core/src/publisher/publisher.ts`
- Modify: `packages/core/test/unit/publisher/publisher.test.ts` (add a "publisher attached to Room shares the same join" test)

- [ ] **Step 1: Discriminated-union `PublisherOptions`** — keep the standalone shape, add an `attach: Room` shape that picks `stream`, `iceServers`, `stats`, `retry`, `pcFactory` only.

- [ ] **Step 2: Resolve options** in the constructor — when `attach` is set, pull `signaling`/`room`/`peerId` from `attach`; otherwise existing path.

- [ ] **Step 3: Lifecycle changes** — `start()` calls `attach.ensureConnected()` + `attach.ensureJoined("publisher")` instead of issuing its own `connect`/`join`. `stop()` skips the `leave` (Room owns that).

- [ ] **Step 4: Tests.** Use `defineEngineFixture` from test-helpers to verify only one `peer-joined` is broadcast even when both Publisher and RoomChannel attach to the same Room.

- [ ] **Step 5: Commit.**

---

## Task 3: Extend `defineViewer` with `attach?: Room`

Same pattern as Task 2. Role: `"viewer"`. Tests symmetric.

---

## Task 4: Extend `defineRoomChannel` with `attach?: Room`

Same pattern. Role: `"presence"` when standalone; when attached, defers to whatever the Room's peer joined as. Tests verify presence + chat work alongside an attached Publisher.

The existing `manageJoin` option becomes redundant when `attach` is set — explicitly disallow combining (TS error + runtime guard).

---

## Task 5: React — `useRoom` + extend hooks with `attach?: Room`

**Files:**

- Create: `packages/react/src/use-room.ts`
- Modify: `packages/react/src/use-publisher.ts`, `use-viewer.ts`, `use-room-channel.ts`, `use-recorder.ts`
- Modify: `packages/react/src/index.ts`
- Create: `packages/react/test/unit/use-room.test.tsx`

- [ ] **Step 1: `useRoom({ room, peerId?, signaling? })`** — constructs a `Room` for the lifetime of the component. Returns `{ room, state, error }`. State surfaces transport state.

- [ ] **Step 2: Each hook accepts `attach?: Room`** — when set, skips its own signaling/room/peerId resolution.

- [ ] **Step 3: Tests.**

- [ ] **Step 4: Commit.**

---

## Task 6: README updates + tag

- [ ] Core README: `defineRoom` section before the Room channel section. Show the recommended composition pattern.
- [ ] React README: `useRoom` section.
- [ ] Migration note: "existing `definePublisher({ signaling, room, ... })` calls keep working unchanged. Use `defineRoom` only when sharing a transport between media + chat."
- [ ] Add a changeset (`minor` for core + react; consumers get a new API).
- [ ] Final lint/typecheck/test/build sweep.
- [ ] `git tag -a v0.0.0-epic-19 -m "EPIC-19: defineRoom higher-level primitive"`
