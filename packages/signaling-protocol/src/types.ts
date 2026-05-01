import type { RoleValue, SignalingMessageType } from "./messages.ts";

export type PeerId = string;
export type RoomId = string;
export type SocketId = string;

export interface RoomPeer {
  readonly peerId: PeerId;
  readonly socketId: SocketId;
  readonly role: RoleValue;
}

export interface RoomSnapshot {
  readonly roomId: RoomId;
  readonly peers: readonly RoomPeer[];
}

export type SendHandler = (peerId: PeerId, message: SignalingMessageType) => void | Promise<void>;
