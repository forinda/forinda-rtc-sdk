import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineStatsCollector, StatsCollector } from "@/stats/collector.ts";
import { defineFakePeerConnection } from "@forinda/test-helpers";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StatsCollector", () => {
  it("factory returns a StatsCollector", () => {
    const pc = defineFakePeerConnection();
    const collector = defineStatsCollector({ pc, peerId: "alice", intervalMs: 1000 });
    expect(collector).toBeInstanceOf(StatsCollector);
  });

  it("does not poll until start() is called", async () => {
    const pc = defineFakePeerConnection();
    defineStatsCollector({ pc, peerId: "alice", intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(pc.getStats).not.toHaveBeenCalled();
  });

  it("polls getStats on the configured interval after start()", async () => {
    const pc = defineFakePeerConnection();
    const collector = defineStatsCollector({ pc, peerId: "alice", intervalMs: 1000 });
    collector.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(pc.getStats).toHaveBeenCalledTimes(3);
    collector.stop();
  });

  it("emits 'stats' with normalized stats on each poll", async () => {
    const pc = defineFakePeerConnection();
    pc.__setState({ connectionState: "connected", iceConnectionState: "connected" });
    const collector = defineStatsCollector({ pc, peerId: "alice", intervalMs: 500 });
    const onStats = vi.fn();
    collector.on("stats", onStats);
    collector.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onStats).toHaveBeenCalledTimes(2);
    expect(onStats.mock.calls[0]?.[0]?.peerId).toBe("alice");
    expect(onStats.mock.calls[0]?.[0]?.connectionState).toBe("connected");
    collector.stop();
  });

  it("stop() cancels further polls", async () => {
    const pc = defineFakePeerConnection();
    const collector = defineStatsCollector({ pc, peerId: "alice", intervalMs: 1000 });
    collector.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(pc.getStats).toHaveBeenCalledTimes(1);
    collector.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(pc.getStats).toHaveBeenCalledTimes(1);
  });

  it("manual collect() returns the latest stats without affecting the poll loop", async () => {
    const pc = defineFakePeerConnection();
    pc.__setState({ connectionState: "connected", iceConnectionState: "connected" });
    const collector = defineStatsCollector({ pc, peerId: "alice", intervalMs: 1000 });
    const stats = await collector.collect();
    expect(stats.peerId).toBe("alice");
    expect(pc.getStats).toHaveBeenCalledTimes(1);
  });
});
