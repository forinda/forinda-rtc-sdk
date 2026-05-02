/**
 * Wire-format zod schemas for the Forinda signaling protocol.
 *
 * This file is the **single source of truth** for what travels on the wire
 * between a browser SDK client (via `@forinda/video-sdk-core`) and any
 * server adapter (`@forinda/video-sdk-signaling-adapter-*`). Both the
 * runtime schemas (`JoinRoom`, `Sdp`, …) and inferred TS types
 * (`JoinRoomMessage`, `SdpMessage`, …) are exported so consumers get
 * structural and runtime safety from one definition.
 *
 * Six message types form a discriminated union on `type`:
 *
 *   ┌──────────────────┬─────────────────────────────────────────────────┐
 *   │ type             │ purpose                                         │
 *   ├──────────────────┼─────────────────────────────────────────────────┤
 *   │ "join"           │ client → server: enter a room as publisher/viewer│
 *   │ "leave"          │ client → server: exit a room voluntarily        │
 *   │ "peer-joined"    │ server → client: notify of another peer arriving│
 *   │ "peer-left"      │ server → client: notify of another peer leaving │
 *   │ "sdp"            │ peer → peer (via server): offer/answer exchange │
 *   │ "ice"            │ peer → peer (via server): ICE candidate         │
 *   └──────────────────┴─────────────────────────────────────────────────┘
 *
 * Validation policy: the engine calls `SignalingMessage.parse(raw)` on every
 * inbound message at the boundary. Malformed payloads throw a zod error
 * that the engine catches and converts to {@link "./errors.ts".SignalingValidationError}.
 *
 * Versioning: the schema set is intentionally minimal for v0.1.0. Backward-
 * compatible additions go through `z.discriminatedUnion`'s type-literal
 * extension; breaking changes require a new spec slice.
 */

import { z } from "zod";

/** Validates a peer identifier (1–128 chars). Rejects empty or oversized ids. */
export const PeerId = z.string().min(1).max(128);

/** Validates a room identifier (1–128 chars). Rejects empty or oversized ids. */
export const RoomId = z.string().min(1).max(128);

/**
 * The role a peer joins a room with. v0.1 ships publisher / viewer / presence.
 * EPIC-12 adds `"director"` for moderation; the engine enforces first-claim
 * wins per room (subsequent director claims throw `SignalingDirectorConflictError`).
 *
 * `"presence"` is the chat-only / observer role — joiners participate in
 * presence + chat but never negotiate media.
 */
export const Role = z.enum(["publisher", "viewer", "presence", "director"]);

/**
 * Recursive JSON-compatible value. Used as the value type for free-form
 * presence attributes — anything you can `JSON.stringify` works.
 *
 * Use the literal `null` to delete a key on a `presence-update` (engine
 * treats `null` as "remove this attribute").
 */
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

/** Validates a presence attribute key (1–64 chars; ASCII-ish recommended). */
const PresenceAttrKey = z.string().min(1).max(64);
const PresenceAttrMap = z.record(PresenceAttrKey, JsonValueSchema);

/**
 * Client → server. Enter a room with the chosen identity and role.
 *
 * The engine emits `peer-joined` to existing room members AND back to the
 * joiner for each existing peer, so the joiner sees the room as it stands.
 */
export const JoinRoom = z.object({
  type: z.literal("join"),
  room: RoomId,
  peer: PeerId,
  role: Role,
  /**
   * Optional opt-in: when `true` AND the engine has `chatHistoryPerRoom > 0`,
   * the engine sends the joiner a single `chat-history` message right after
   * `presence-snapshot`. Omitted means the joiner does not want history —
   * preserves v0.1 behavior so legacy clients are unaffected by the new
   * message type.
   */
  replayHistory: z.boolean().optional(),
});

/**
 * Client → server. Voluntary exit. The engine treats a socket disconnect as
 * an implicit leave for the bound peer, so this is only needed for explicit
 * "switch rooms" or "log out" flows.
 */
export const LeaveRoom = z.object({
  type: z.literal("leave"),
  room: RoomId,
  peer: PeerId,
});

/**
 * Server → client. A new peer has joined the room. Carries enough for the
 * recipient to decide whether to start a peer connection.
 */
export const PeerJoined = z.object({
  type: z.literal("peer-joined"),
  peer: PeerId,
  role: Role,
});

/** Server → client. A peer has left the room (voluntarily or via disconnect). */
export const PeerLeft = z.object({
  type: z.literal("peer-left"),
  peer: PeerId,
});

/**
 * Peer → peer (via the server). Carries an SDP offer or answer. The server
 * routes the message to the `to` peer's socket without inspecting the SDP
 * body — codec selection, simulcast, etc. are negotiated end-to-end.
 */
export const Sdp = z.object({
  type: z.literal("sdp"),
  from: PeerId,
  to: PeerId,
  sdp: z.object({
    type: z.enum(["offer", "answer"]),
    sdp: z.string(),
  }),
});

/**
 * Peer → peer (via the server). Carries a single ICE candidate or `null` to
 * mark end-of-candidates. The candidate payload is opaque (RTCIceCandidateInit
 * has no canonical schema across browsers).
 */
export const IceCand = z.object({
  type: z.literal("ice"),
  from: PeerId,
  to: PeerId,
  candidate: z.union([z.record(z.unknown()), z.null()]),
});

/**
 * Client → server. Set, replace, or remove one or more of this peer's
 * presence attributes. The engine merges the incoming map into the peer's
 * existing presence: a `null` value removes the key, any other value
 * overwrites.
 */
export const PresenceUpdate = z.object({
  type: z.literal("presence-update"),
  peer: PeerId,
  attributes: PresenceAttrMap,
});

/**
 * Server → client. Fired whenever any peer's presence map changes (own or
 * remote). After a peer leaves the room the engine fires one final
 * `presence-state` with `attributes: {}` to signal the entry is cleared.
 */
export const PresenceState = z.object({
  type: z.literal("presence-state"),
  peer: PeerId,
  attributes: PresenceAttrMap,
});

/**
 * Server → joining client. Initial snapshot of every peer's presence in the
 * room, sent once right after the join is accepted. Empty `peers: {}` when
 * nobody has set any attributes yet.
 */
export const PresenceSnapshot = z.object({
  type: z.literal("presence-snapshot"),
  room: RoomId,
  peers: z.record(PeerId, PresenceAttrMap),
});

/**
 * Client → server (broadcast) or client → server → specific peer (DM).
 * `to` omitted means broadcast to the whole room (excluding sender). The
 * server validates `from` matches the socket's bound peerId before relaying.
 */
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

/**
 * The discriminated union of every wire-format message. Use `.parse(raw)` for
 * boundary validation; use `.safeParse(raw)` when you need a non-throwing
 * branch (the Session does this so it can attach context to its own typed
 * SignalingValidationError).
 */
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

// Inferred TS types — exported so consumers get one definition for runtime + types.
export type PeerIdValue = z.infer<typeof PeerId>;
export type RoomIdValue = z.infer<typeof RoomId>;
export type RoleValue = z.infer<typeof Role>;
export type JoinRoomMessage = z.infer<typeof JoinRoom>;
export type LeaveRoomMessage = z.infer<typeof LeaveRoom>;
export type PeerJoinedMessage = z.infer<typeof PeerJoined>;
export type PeerLeftMessage = z.infer<typeof PeerLeft>;
export type SdpMessage = z.infer<typeof Sdp>;
export type IceCandMessage = z.infer<typeof IceCand>;
export type PresenceUpdateMessage = z.infer<typeof PresenceUpdate>;
export type PresenceStateMessage = z.infer<typeof PresenceState>;
export type PresenceSnapshotMessage = z.infer<typeof PresenceSnapshot>;
export type ChatMessage = z.infer<typeof Chat>;
export type ChatHistoryMessage = z.infer<typeof ChatHistory>;
export type MuteMessage = z.infer<typeof Mute>;
export type UnmuteMessage = z.infer<typeof Unmute>;
export type KickMessage = z.infer<typeof Kick>;
export type KickedMessage = z.infer<typeof Kicked>;
export type PromoteMessage = z.infer<typeof Promote>;
export type DemoteMessage = z.infer<typeof Demote>;
export type SetBitrateMessage = z.infer<typeof SetBitrate>;
export type MuteKindValue = z.infer<typeof MuteKind>;
export type SignalingMessageType = z.infer<typeof SignalingMessage>;
