/**
 * Publisher option, event, and snapshot shapes.
 *
 * Kept in a sibling file so consumers can `import type { PublisherOptions }`
 * without pulling the implementation graph.
 */

import type { SdkError } from "@/errors/errors.ts";
import type { PcFactory } from "@/peer/peer-connection.ts";
import type { RetryConfig } from "@/retry/policy.ts";
import type { RoomLeader } from "@/room/types.ts";
import type { SignalingTransport } from "@/signaling/transport.ts";
import type { ConnectionState } from "@/state/connection-state.ts";
import type { ConnectionStats } from "@/stats/types.ts";

/** Constructor options for `Publisher` / `definePublisher`. */
export interface PublisherOptions {
  /** Transport adapter (e.g. `signaling-ws` adapter). */
  signaling: SignalingTransport;
  /** Room id this publisher joins. */
  room: string;
  /** Peer id this publisher advertises. Defaults to `crypto.randomUUID()`. */
  peerId?: string;
  /** Local media stream to publish. */
  stream: MediaStream;
  /** STUN/TURN servers passed to every per-viewer `RTCPeerConnection`. */
  iceServers?: RTCIceServer[];
  /** Stats polling config; omit to disable auto-poll. */
  stats?: { interval: number };
  /** Retry policy. Use defaults when omitted. */
  retry?: RetryConfig;
  /** Override the `RTCPeerConnection` constructor (test injection). */
  pcFactory?: PcFactory;
  /**
   * **Internal.** Set by {@link defineAttachedPublisher} to make this
   * Publisher coordinate with a {@link RoomLeader} (Room) instead of
   * managing its own connect/join/leave. Consumers should not set this
   * directly — use the proxy factory or the `room.publisher()` sugar.
   */
  __leader?: RoomLeader;
}

/**
 * Constructor options for {@link defineAttachedPublisher}. A subset of
 * {@link PublisherOptions}: `signaling`, `room`, and `peerId` are taken
 * from the leader, so consumers only supply media + per-publisher tunables.
 */
export interface AttachedPublisherOptions {
  stream: MediaStream;
  iceServers?: RTCIceServer[];
  stats?: { interval: number };
  retry?: RetryConfig;
  pcFactory?: PcFactory;
}

/** A viewer currently connected to this publisher. */
export interface ViewerInfo {
  peerId: string;
}

/** Typed event map emitted by `Publisher`. */
export type PublisherEvents = {
  state: ConnectionState;
  viewer: ViewerInfo;
  "viewer-left": ViewerInfo;
  stats: ConnectionStats[];
  retry: { attempt: number; nextDelayMs: number; lastError: SdkError };
  error: SdkError;
};
