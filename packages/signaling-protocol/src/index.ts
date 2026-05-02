/**
 * Public surface for `@forinda/video-sdk-signaling-protocol`.
 *
 * Re-exports only — implementation lives in sibling files. Consumers should
 * always import from this entrypoint, never reach into `./session.ts` etc.
 *
 * Recommended call style is the `defineX({...})` factories
 * (`defineSignalingEngine`, `defineSession`, `defineRoom`); the underlying
 * classes are also exported for type imports and `instanceof` checks.
 */

// Engine + factory
export { defineSignalingEngine, SignalingEngine, type SignalingEngineOptions } from "./engine.ts";

// Session + factory
export {
  defineSession,
  DEFAULT_MAX_PEERS_PER_ROOM,
  Session,
  type AuthenticateFn,
  type SessionOptions,
  type SocketInfo,
} from "./session.ts";

// Room + factory (re-exported for advanced consumers; mostly internal)
export { defineRoom, Room, type RoomOptions } from "./rooms.ts";

// Wire format — schemas + inferred types (single source of truth)
export {
  Chat,
  IceCand,
  JoinRoom,
  LeaveRoom,
  PeerJoined,
  PeerLeft,
  PeerId as PeerIdSchema,
  PresenceSnapshot,
  PresenceState,
  PresenceUpdate,
  RoomId as RoomIdSchema,
  Role,
  Sdp,
  SignalingMessage,
  type ChatMessage,
  type IceCandMessage,
  type JoinRoomMessage,
  type JsonValue,
  type LeaveRoomMessage,
  type PeerIdValue,
  type PeerJoinedMessage,
  type PeerLeftMessage,
  type PresenceSnapshotMessage,
  type PresenceStateMessage,
  type PresenceUpdateMessage,
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
  SignalingRateLimitError,
  SignalingValidationError,
  type SignalingErrorOptions,
} from "./errors.ts";

// Shared types
export type { PeerId, RoomId, RoomPeer, RoomSnapshot, SendHandler, SocketId } from "./types.ts";
