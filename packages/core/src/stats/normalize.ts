/**
 * Reduce one `RTCStatsReport` into a flat `ConnectionStats`.
 *
 * The browser stats API is a `Map<string, RTCStats>` where each entry has a
 * `type` that determines its other fields. We pick out the entries we care
 * about (`inbound-rtp`, `outbound-rtp`, `candidate-pair`) and compute the
 * normalized fields.
 *
 * Bitrate calculation is *cumulative-byte based*, not delta-based — for
 * instantaneous bitrate the {@link "@/stats/collector.ts".StatsCollector}
 * tracks deltas across polls. v0.1.0 keeps `normalizeStats` stateless; the
 * collector layers in delta tracking.
 */

import type { ConnectionStats } from "@/stats/types.ts";

interface NormalizeContext {
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
}

interface InboundRtpEntry {
  type: "inbound-rtp";
  bytesReceived?: number;
  packetsLost?: number;
  packetsReceived?: number;
  jitter?: number;
  framesPerSecond?: number;
  frameWidth?: number;
  frameHeight?: number;
}

interface OutboundRtpEntry {
  type: "outbound-rtp";
  bytesSent?: number;
  framesPerSecond?: number;
  frameWidth?: number;
  frameHeight?: number;
  qualityLimitationReason?: "none" | "cpu" | "bandwidth" | "other";
}

interface CandidatePairEntry {
  type: "candidate-pair";
  nominated?: boolean;
  state?: string;
  currentRoundTripTime?: number;
}

type StatsEntry = (InboundRtpEntry | OutboundRtpEntry | CandidatePairEntry | { type: string }) & {
  id?: string;
};

/**
 * Convert a raw `RTCStatsReport` into a `ConnectionStats` for the given
 * peer. `ctx` carries connection-level state the report itself doesn't
 * expose.
 */
export function normalizeStats(
  report: RTCStatsReport,
  peerId: string,
  ctx: NormalizeContext,
): ConnectionStats {
  const stats: ConnectionStats = {
    peerId,
    timestamp: Date.now(),
    connectionState: ctx.connectionState,
    iceConnectionState: ctx.iceConnectionState,
    inbound: {
      bitrateBps: 0,
      packetsLost: 0,
      packetLossRatio: 0,
      jitterMs: 0,
      framesPerSecond: null,
      frameWidth: null,
      frameHeight: null,
    },
    outbound: {
      bitrateBps: 0,
      framesPerSecond: null,
      frameWidth: null,
      frameHeight: null,
      qualityLimitationReason: "none",
    },
    rttMs: null,
  };

  for (const entry of report.values() as IterableIterator<StatsEntry>) {
    if (entry.type === "inbound-rtp") {
      const e = entry as InboundRtpEntry;
      stats.inbound.bitrateBps += (e.bytesReceived ?? 0) * 8;
      stats.inbound.packetsLost += e.packetsLost ?? 0;
      const received = e.packetsReceived ?? 0;
      const total = received + (e.packetsLost ?? 0);
      if (total > 0) {
        stats.inbound.packetLossRatio = (e.packetsLost ?? 0) / total;
      }
      stats.inbound.jitterMs = (e.jitter ?? 0) * 1000;
      if (e.framesPerSecond !== undefined) stats.inbound.framesPerSecond = e.framesPerSecond;
      if (e.frameWidth !== undefined) stats.inbound.frameWidth = e.frameWidth;
      if (e.frameHeight !== undefined) stats.inbound.frameHeight = e.frameHeight;
    } else if (entry.type === "outbound-rtp") {
      const e = entry as OutboundRtpEntry;
      stats.outbound.bitrateBps += (e.bytesSent ?? 0) * 8;
      if (e.framesPerSecond !== undefined) stats.outbound.framesPerSecond = e.framesPerSecond;
      if (e.frameWidth !== undefined) stats.outbound.frameWidth = e.frameWidth;
      if (e.frameHeight !== undefined) stats.outbound.frameHeight = e.frameHeight;
      if (e.qualityLimitationReason !== undefined)
        stats.outbound.qualityLimitationReason = e.qualityLimitationReason;
    } else if (entry.type === "candidate-pair") {
      const e = entry as CandidatePairEntry;
      if ((e.nominated ?? false) || e.state === "succeeded") {
        if (e.currentRoundTripTime !== undefined) {
          stats.rttMs = e.currentRoundTripTime * 1000;
        }
      }
    }
  }

  return stats;
}
