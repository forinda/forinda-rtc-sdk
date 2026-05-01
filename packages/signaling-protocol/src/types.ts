/**
 * Shared, lightweight type aliases used across the signaling-protocol package.
 *
 * These are the *runtime-irrelevant* types: branded strings, snapshot shapes,
 * and the {@link SendHandler} contract that links the engine to its host
 * transport. The runtime classes (Room, Session, SignalingEngine) live in
 * sibling files; the schemas (zod) live in `./messages.ts`.
 *
 * Why this file exists separately:
 * - Keeps cross-cutting types one click away from any module that imports them.
 * - Avoids circular imports (none of these types pull in heavy zod schemas).
 */

import type { RoleValue, SignalingMessageType } from "./messages.ts";

/**
 * The opaque identity a peer announces when joining a room.
 * Validated against {@link "./messages.ts".PeerId} (1–128 chars).
 */
export type PeerId = string;

/**
 * The room identifier a peer joins.
 * Validated against {@link "./messages.ts".RoomId} (1–128 chars).
 */
export type RoomId = string;

/**
 * A transport-layer socket identifier supplied by the host (WebSocket id,
 * connection id, etc.). The protocol engine never inspects its format —
 * it's purely a routing handle.
 */
export type SocketId = string;

/**
 * A peer's record while it's in a room. Carries enough to route messages
 * (peerId), bind to a transport (socketId), and broadcast role-aware events
 * (role).
 */
export interface RoomPeer {
  readonly peerId: PeerId;
  readonly socketId: SocketId;
  readonly role: RoleValue;
}

/**
 * A read-only snapshot of one room — used by {@link "./session.ts".Session.rooms}
 * for diagnostics and tests. Mutating the snapshot does not affect engine state.
 */
export interface RoomSnapshot {
  readonly roomId: RoomId;
  readonly peers: readonly RoomPeer[];
}

/**
 * Callback the host registers via `session.onSend(...)`. The engine invokes
 * it whenever an outbound message needs delivery to a specific peer. The
 * host is responsible for finding the socket bound to `peerId` and writing
 * the serialized message to it.
 *
 * Returning a Promise is supported for hosts that need to await flush; the
 * engine does not await the result for control-flow purposes.
 */
export type SendHandler = (peerId: PeerId, message: SignalingMessageType) => void | Promise<void>;
