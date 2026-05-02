/**
 * Browser-side signaling transport contract.
 *
 * The SDK never opens a WebSocket itself — every concrete transport (the
 * `@forinda/video-sdk-signaling-ws` WebSocket adapter, the
 * `@forinda/video-sdk-signaling-broadcast` BroadcastChannel adapter, and any
 * custom adapter a consumer writes) implements this interface. The Publisher
 * and Viewer (EPIC-3b) accept any object satisfying it.
 *
 * The only expectations on a concrete transport:
 * 1. Move through the {@link TransportState} machine in a sane order.
 * 2. Buffer outbound messages while not yet `connected` and flush on connect
 *    (recommended; not required by the type).
 * 3. Validate inbound messages with `SignalingMessage.parse` before invoking
 *    the `message` handler.
 *
 * The wire-format zod schemas + inferred types are re-exported from
 * `@forinda/video-sdk-signaling-protocol` (the canonical owner) so consumers
 * can import everything they need from `@forinda/video-sdk-core`.
 */

import type { SignalingMessageType } from "@forinda/video-sdk-signaling-protocol";

// Re-export the wire-format types so consumers don't have to depend on the
// protocol package directly.
export {
  IceCand,
  JoinRoom,
  LeaveRoom,
  PeerJoined,
  PeerLeft,
  Sdp,
  SignalingMessage,
  type IceCandMessage,
  type JoinRoomMessage,
  type LeaveRoomMessage,
  type PeerJoinedMessage,
  type PeerLeftMessage,
  type SdpMessage,
  type SignalingMessageType,
} from "@forinda/video-sdk-signaling-protocol";

/** Lifecycle states a transport moves through. */
export type TransportState = "idle" | "connecting" | "connected" | "reconnecting" | "closed";

/**
 * Browser-side transport adapter contract. Any object satisfying this shape
 * can be passed to `definePublisher({ signaling })` / `defineViewer({ signaling })`.
 */
export interface SignalingTransport {
  /** Open the transport. Resolves once connected; rejects on initial-connect failure. */
  connect(): Promise<void>;

  /** Close the transport. Always reaches `closed`. */
  disconnect(): Promise<void>;

  /** Serialize and send a wire-format message. */
  send(message: SignalingMessageType): Promise<void>;

  /** Subscribe to inbound messages. Returns an unsubscribe. */
  on(event: "message", handler: (msg: SignalingMessageType) => void): () => void;
  /** Subscribe to lifecycle state changes. Returns an unsubscribe. */
  on(event: "state", handler: (state: TransportState) => void): () => void;

  /** Current state (read-only). */
  readonly state: TransportState;
}
