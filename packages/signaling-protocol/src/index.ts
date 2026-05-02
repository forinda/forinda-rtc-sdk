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
  ChatHistory,
  Demote,
  IceCand,
  JoinRoom,
  Kick,
  Kicked,
  LeaveRoom,
  Mute,
  MuteKind,
  PeerJoined,
  PeerLeft,
  PeerId as PeerIdSchema,
  PresenceSnapshot,
  PresenceState,
  PresenceUpdate,
  Promote,
  RoomId as RoomIdSchema,
  Role,
  Sdp,
  SetBitrate,
  SignalingMessage,
  Unmute,
  type ChatHistoryMessage,
  type ChatMessage,
  type DemoteMessage,
  type IceCandMessage,
  type JoinRoomMessage,
  type JsonValue,
  type KickMessage,
  type KickedMessage,
  type LeaveRoomMessage,
  type MuteKindValue,
  type MuteMessage,
  type PeerIdValue,
  type PeerJoinedMessage,
  type PeerLeftMessage,
  type PresenceSnapshotMessage,
  type PresenceStateMessage,
  type PresenceUpdateMessage,
  type PromoteMessage,
  type RoleValue,
  type RoomIdValue,
  type SdpMessage,
  type SetBitrateMessage,
  type SignalingMessageType,
  type UnmuteMessage,
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
