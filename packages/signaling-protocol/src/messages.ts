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
 * The role a peer joins a room with. v0.1.0 supports a one-publisher → many-viewers
 * topology; richer roles (moderator, co-host, etc.) come in later epics.
 */
export const Role = z.enum(["publisher", "viewer"]);

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
export type SignalingMessageType = z.infer<typeof SignalingMessage>;
