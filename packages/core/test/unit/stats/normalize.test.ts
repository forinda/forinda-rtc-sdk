import { describe, expect, it } from "vitest";
import { normalizeStats } from "@/stats/normalize.ts";

const buildReport = (entries: Record<string, unknown>[]): RTCStatsReport => {
  const map = new Map<string, unknown>();
  for (const entry of entries) {
    const id = entry["id"] as string;
    map.set(id, entry);
  }
  return map as unknown as RTCStatsReport;
};

describe("normalizeStats", () => {
  it("returns zeros when the report is empty", () => {
    const stats = normalizeStats(buildReport([]), "alice", {
      connectionState: "new",
      iceConnectionState: "new",
    });
    expect(stats.peerId).toBe("alice");
    expect(stats.connectionState).toBe("new");
    expect(stats.inbound.bitrateBps).toBe(0);
    expect(stats.outbound.bitrateBps).toBe(0);
  });

  it("computes inbound bitrate from inbound-rtp", () => {
    const stats = normalizeStats(
      buildReport([
        {
          id: "i1",
          type: "inbound-rtp",
          kind: "video",
          bytesReceived: 1_000_000,
          packetsLost: 5,
          packetsReceived: 1000,
          jitter: 0.012,
          framesPerSecond: 30,
          frameWidth: 1280,
          frameHeight: 720,
        },
      ]),
      "bob",
      { connectionState: "connected", iceConnectionState: "connected" },
    );
    expect(stats.inbound.bitrateBps).toBe(1_000_000 * 8);
    expect(stats.inbound.packetsLost).toBe(5);
    expect(stats.inbound.packetLossRatio).toBeCloseTo(5 / 1005, 4);
    expect(stats.inbound.jitterMs).toBe(12);
    expect(stats.inbound.framesPerSecond).toBe(30);
    expect(stats.inbound.frameWidth).toBe(1280);
    expect(stats.inbound.frameHeight).toBe(720);
  });

  it("computes outbound bitrate from outbound-rtp", () => {
    const stats = normalizeStats(
      buildReport([
        {
          id: "o1",
          type: "outbound-rtp",
          kind: "video",
          bytesSent: 500_000,
          framesPerSecond: 24,
          frameWidth: 640,
          frameHeight: 480,
          qualityLimitationReason: "bandwidth",
        },
      ]),
      "alice",
      { connectionState: "connected", iceConnectionState: "connected" },
    );
    expect(stats.outbound.bitrateBps).toBe(500_000 * 8);
    expect(stats.outbound.framesPerSecond).toBe(24);
    expect(stats.outbound.frameWidth).toBe(640);
    expect(stats.outbound.frameHeight).toBe(480);
    expect(stats.outbound.qualityLimitationReason).toBe("bandwidth");
  });

  it("rttMs comes from selected candidate-pair currentRoundTripTime", () => {
    const stats = normalizeStats(
      buildReport([
        {
          id: "p1",
          type: "candidate-pair",
          state: "succeeded",
          nominated: true,
          currentRoundTripTime: 0.057,
        },
      ]),
      "alice",
      { connectionState: "connected", iceConnectionState: "connected" },
    );
    expect(stats.rttMs).toBe(57);
  });

  it("handles missing optional fields gracefully", () => {
    const stats = normalizeStats(
      buildReport([{ id: "x", type: "inbound-rtp", kind: "video", bytesReceived: 100 }]),
      "x",
      { connectionState: "connected", iceConnectionState: "connected" },
    );
    expect(stats.inbound.framesPerSecond).toBeNull();
    expect(stats.inbound.frameWidth).toBeNull();
    expect(stats.inbound.frameHeight).toBeNull();
    expect(stats.inbound.jitterMs).toBe(0);
  });
});
