/**
 * Viewer option, event, and snapshot shapes.
 */

import type { SdkError } from "@/errors/errors.ts";
import type { PcFactory } from "@/peer/peer-connection.ts";
import type { RetryConfig } from "@/retry/policy.ts";
import type { SignalingTransport } from "@/signaling/transport.ts";
import type { ConnectionState } from "@/state/connection-state.ts";
import type { ConnectionStats } from "@/stats/types.ts";

/** Constructor options for `Viewer` / `defineViewer`. */
export interface ViewerOptions {
  signaling: SignalingTransport;
  room: string;
  /** Peer id this viewer advertises. Defaults to `crypto.randomUUID()`. */
  peerId?: string;
  /** The publisher peer id this viewer subscribes to. */
  publisherId: string;
  iceServers?: RTCIceServer[];
  stats?: { interval: number };
  retry?: RetryConfig;
  /** Override the `RTCPeerConnection` constructor (test injection). */
  pcFactory?: PcFactory;
}

/** Typed event map emitted by `Viewer`. */
export type ViewerEvents = {
  state: ConnectionState;
  track: { stream: MediaStream };
  stats: ConnectionStats;
  retry: { attempt: number; nextDelayMs: number; lastError: SdkError };
  error: SdkError;
};
