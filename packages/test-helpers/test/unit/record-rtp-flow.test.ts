import { describe, expect, it } from "vitest";
import { recordRtpFlow } from "@/record-rtp-flow.ts";
import type { ConnectionStats } from "@forinda/video-sdk-core";

function defineSample(overrides: Partial<ConnectionStats> = {}): ConnectionStats {
  return {
    peerId: "peer-1",
    timestamp: 0,
    connectionState: "connected",
    iceConnectionState: "connected",
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
    ...overrides,
  };
}

function defineEmitter(): {
  on(event: "stats", handler: (s: ConnectionStats) => void): () => void;
  emit(s: ConnectionStats): void;
} {
  const handlers = new Set<(s: ConnectionStats) => void>();
  return {
    on(_event, handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    emit(s) {
      for (const h of handlers) h(s);
    },
  };
}

describe("recordRtpFlow", () => {
  it("resolves on the first sample with positive inbound bitrate", async () => {
    const emitter = defineEmitter();
    const promise = recordRtpFlow(emitter);

    emitter.emit(defineSample({ inbound: { ...defineSample().inbound, bitrateBps: 0 } }));
    emitter.emit(defineSample({ inbound: { ...defineSample().inbound, bitrateBps: 12000 } }));

    const result = await promise;
    expect(result.inbound.bitrateBps).toBe(12000);
  });

  it("rejects with sample count on timeout", async () => {
    const emitter = defineEmitter();
    const promise = recordRtpFlow(emitter, { timeoutMs: 30 });
    emitter.emit(defineSample());
    emitter.emit(defineSample());
    await expect(promise).rejects.toThrow(/no matching sample within 30ms/);
    await expect(promise).rejects.toThrow(/saw 2 sample/);
  });

  it("respects a custom predicate", async () => {
    const emitter = defineEmitter();
    const promise = recordRtpFlow(emitter, {
      predicate: (s) => s.inbound.framesPerSecond !== null && s.inbound.framesPerSecond >= 30,
    });

    emitter.emit(defineSample({ inbound: { ...defineSample().inbound, framesPerSecond: 15 } }));
    emitter.emit(defineSample({ inbound: { ...defineSample().inbound, framesPerSecond: 30 } }));

    const result = await promise;
    expect(result.inbound.framesPerSecond).toBe(30);
  });

  it("supports a bare subscribe-fn source", async () => {
    const handlers = new Set<(s: ConnectionStats) => void>();
    const subscribe = (h: (s: ConnectionStats) => void): (() => void) => {
      handlers.add(h);
      return () => handlers.delete(h);
    };
    const promise = recordRtpFlow(subscribe);
    for (const h of handlers)
      h(defineSample({ inbound: { ...defineSample().inbound, bitrateBps: 1 } }));
    await expect(promise).resolves.toBeDefined();
  });
});
