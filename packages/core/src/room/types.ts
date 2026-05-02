/**
 * Option, event, and snapshot shapes for {@link "./room-channel.ts".RoomChannel}.
 *
 * Kept separate so consumers can `import type { RoomChannelOptions }` without
 * pulling the implementation graph.
 */

import type {
  ChatMessage,
  JsonValue,
  RoleValue,
} from "@forinda/video-sdk-signaling-protocol";
import type { SignalingTransport } from "@/signaling/transport.ts";

/**
 * Constructor options for {@link defineRoomChannel}.
 */
export interface RoomChannelOptions {
  /** Pre-built signaling transport. The channel never opens or closes it. */
  signaling: SignalingTransport;
  /** Room id this channel observes. */
  room: string;
  /** Peer id this channel speaks as. Defaults to `crypto.randomUUID()`. */
  peerId?: string;
  /**
   * When `true` the channel issues its own `join` (role: `"presence"`) and
   * matching `leave` on `start()` / `stop()`. Set `false` when sharing the
   * transport with a Publisher or Viewer that already manages the join —
   * the channel still subscribes to inbound messages but never speaks. */
  manageJoin?: boolean;
  /** Cap on the in-memory chat history buffer. Default `200`. */
  chatHistoryLimit?: number;
}

/**
 * One delivered chat message plus a locally-stamped receive timestamp.
 * `receivedAt` is independent of the wire `ts` so consumers can sort messages
 * by receipt order even when peer clocks skew.
 */
export interface ChatHistoryEntry extends ChatMessage {
  receivedAt: number;
}

/** Snapshot of a peer's presence delivered alongside the `presence` event. */
export interface PresenceEntry {
  peer: string;
  attributes: Record<string, JsonValue>;
}

/** Snapshot of a peer joining the room (mirrors signaling-protocol shape). */
export interface RoomPeerEntry {
  peer: string;
  role: RoleValue;
}

/** Typed event map emitted by `RoomChannel`. */
export type RoomChannelEvents = {
  /** Fires for each `presence-state` arriving on the wire (own + remote). */
  presence: PresenceEntry;
  /** Fires once after `start()` with the engine's initial presence snapshot. */
  "presence-snapshot": Record<string, Record<string, JsonValue>>;
  /** Fires for every `peer-joined` from the engine. */
  "peer-joined": RoomPeerEntry;
  /** Fires for every `peer-left` from the engine. */
  "peer-left": { peer: string };
  /** Fires for every `chat` delivered to this peer (broadcast or DM). */
  chat: ChatHistoryEntry;
  /** Internal channel error (validation, unexpected message). */
  error: Error;
};
