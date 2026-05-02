/**
 * Normalized connection stats — what consumers see via the `stats` event.
 *
 * Designed to be flat (no nested `RTCStats` chains) and stable: the keys
 * here are the contract; raw browser stats may add or rename fields, but
 * {@link "@/stats/normalize.ts".normalizeStats} maps them onto this shape.
 */

export interface InboundStats {
  bitrateBps: number;
  packetsLost: number;
  /** 0..1 ratio: lost / (lost + received). */
  packetLossRatio: number;
  jitterMs: number;
  framesPerSecond: number | null;
  frameWidth: number | null;
  frameHeight: number | null;
}

export interface OutboundStats {
  bitrateBps: number;
  framesPerSecond: number | null;
  frameWidth: number | null;
  frameHeight: number | null;
  qualityLimitationReason: "none" | "cpu" | "bandwidth" | "other";
}

export interface ConnectionStats {
  peerId: string;
  timestamp: number;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  inbound: InboundStats;
  outbound: OutboundStats;
  rttMs: number | null;
}
