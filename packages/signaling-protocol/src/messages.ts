import { z } from "zod";

export const PeerId = z.string().min(1).max(128);
export const RoomId = z.string().min(1).max(128);

export const Role = z.enum(["publisher", "viewer"]);

export const JoinRoom = z.object({
  type: z.literal("join"),
  room: RoomId,
  peer: PeerId,
  role: Role,
});

export const LeaveRoom = z.object({
  type: z.literal("leave"),
  room: RoomId,
  peer: PeerId,
});

export const PeerJoined = z.object({
  type: z.literal("peer-joined"),
  peer: PeerId,
  role: Role,
});

export const PeerLeft = z.object({
  type: z.literal("peer-left"),
  peer: PeerId,
});

export const Sdp = z.object({
  type: z.literal("sdp"),
  from: PeerId,
  to: PeerId,
  sdp: z.object({
    type: z.enum(["offer", "answer"]),
    sdp: z.string(),
  }),
});

export const IceCand = z.object({
  type: z.literal("ice"),
  from: PeerId,
  to: PeerId,
  candidate: z.union([z.record(z.unknown()), z.null()]),
});

export const SignalingMessage = z.discriminatedUnion("type", [
  JoinRoom,
  LeaveRoom,
  PeerJoined,
  PeerLeft,
  Sdp,
  IceCand,
]);

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
