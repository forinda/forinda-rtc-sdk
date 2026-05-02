/**
 * Option, event, and snapshot shapes for {@link "./room-channel.ts".RoomChannel}.
 *
 * Kept separate so consumers can `import type { RoomChannelOptions }` without
 * pulling the implementation graph.
 */

import type { ChatMessage, JsonValue, RoleValue } from "@forinda/video-sdk-signaling-protocol";
import type { RetryConfig } from "@/retry/policy.ts";
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
  /**
   * Auto-retry policy for transport drops. The channel reconnects, re-issues
   * `join` (when `manageJoin`), re-broadcasts the local presence map, and
   * marks all in-flight pending chats as `failed`. Default: enabled with
   * `defineRetryPolicy`'s defaults. Set `enabled: false` to disable.
   */
  retry?: RetryConfig;
  /**
   * Timeout (ms) before an un-acknowledged outgoing chat flips to `failed`.
   * Default `10_000`. The ack is a server-echo of the chat with the same
   * `clientId`, so the timeout covers both network drop and engine refusal.
   */
  chatAckTimeoutMs?: number;
  /**
   * **Internal.** Set by `defineAttachedRoomChannel`. Use the proxy
   * factory or `room.channel()` instead of touching this directly.
   */
  __leader?: RoomLeader;
}

/**
 * Constructor options for `defineAttachedRoomChannel`. `signaling` /
 * `room` / `peerId` / `manageJoin` come from the leader; consumers supply
 * only channel-local tunables.
 */
export interface AttachedRoomChannelOptions {
  chatHistoryLimit?: number;
  retry?: RetryConfig;
  chatAckTimeoutMs?: number;
}

/**
 * One chat message in the rolling history.
 *
 * - `id`: the `clientId` that round-trips through the server. For chats
 *   this peer originated, the id is generated locally and reused for the
 *   server echo. For incoming chats from other peers, the id is taken
 *   from `msg.clientId` when present, otherwise generated locally so
 *   every entry has a stable identifier.
 * - `status`: lifecycle. Always `"confirmed"` for incoming chats. For
 *   outgoing chats: starts `"pending"` (synchronous append on `sendChat`),
 *   flips to `"confirmed"` on server echo, or `"failed"` on
 *   `chatAckTimeoutMs` / `signaling.send` rejection.
 * - `receivedAt`: locally-stamped receive timestamp, independent of the
 *   wire `ts` so consumers can sort by receipt order even when peer clocks
 *   skew.
 */
export interface ChatHistoryEntry extends ChatMessage {
  receivedAt: number;
  id: string;
  status: "pending" | "confirmed" | "failed";
}

/** Lifecycle states for a `RoomChannel`. */
export type RoomChannelState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed";

/** Status update for a single chat entry. */
export interface ChatStatusEntry {
  id: string;
  status: ChatHistoryEntry["status"];
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
  /** Fires when an outgoing chat's status changes. */
  "chat-status": ChatStatusEntry;
  /** Channel-level lifecycle state. */
  state: RoomChannelState;
  /** Internal channel error (validation, unexpected message). */
  error: Error;
};

/**
 * Internal coordination contract between {@link "./room.ts".Room} and
 * attached children (`Publisher`, `Viewer`, `RoomChannel`). Children call
 * `ensureConnected()` + `ensureJoined(role)` from `start()` instead of
 * managing the transport + join themselves; the Room enforces
 * exactly-one-join semantics across every attached child.
 *
 * Exported so the proxy factories (`defineAttachedPublisher` etc.) can
 * type-check the `__leader` private option, but not part of the consumer-
 * facing surface — use `defineRoom` and the proxy factories instead.
 */
export interface RoomLeader {
  readonly room: string;
  readonly peerId: string;
  readonly signaling: SignalingTransport;
  /** The role the Room has joined as, or `null` until the first child starts. */
  readonly role: RoleValue | null;
  /** Open the transport if not already open. Idempotent. */
  ensureConnected(): Promise<void>;
  /**
   * Issue the room's `join` with the given role iff no peer has joined yet.
   * Subsequent calls assert the role matches and resolve without sending.
   * Throws `ConfigurationError` on role mismatch (one Room can't be both
   * publisher and viewer — that's a different room).
   */
  ensureJoined(role: RoleValue): Promise<void>;
}

/** Lifecycle states for a {@link "./room.ts".Room}. */
export type RoomState = "idle" | "connecting" | "connected" | "closed";

/** Constructor options for {@link "./room.ts".defineRoom}. */
export interface RoomOptions {
  /** Pre-built signaling transport. The Room owns connect/disconnect. */
  signaling: SignalingTransport;
  /** Room id every attached child observes. */
  room: string;
  /** Peer id every attached child speaks as. Defaults to `crypto.randomUUID()`. */
  peerId?: string;
}
