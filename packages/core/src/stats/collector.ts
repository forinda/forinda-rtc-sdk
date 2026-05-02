/**
 * Periodic poller around `RTCPeerConnection.getStats`.
 *
 * Owns the timer + emits a normalized `ConnectionStats` payload on each
 * tick. Consumers subscribe via {@link StatsCollector.on}. The Publisher
 * and Viewer (EPIC-3b) wrap one of these per peer connection.
 *
 * Manual collection (`collect()`) is exposed for one-shot snapshots — used
 * by the `getStats()` methods on Publisher / Viewer that the spec defines.
 */

import { defineEmitter, type Emitter } from "@/events/emitter.ts";
import { normalizeStats } from "@/stats/normalize.ts";
import type { ConnectionStats } from "@/stats/types.ts";

export interface StatsCollectorOptions {
  pc: RTCPeerConnection;
  peerId: string;
  intervalMs: number;
}

export type StatsCollectorEvents = {
  stats: ConnectionStats;
};

/**
 * Polls `getStats` on a fixed interval. Construct via
 * {@link defineStatsCollector}; call {@link StatsCollector.start} to begin
 * polling, {@link StatsCollector.stop} to cancel.
 */
export class StatsCollector {
  private readonly pc: RTCPeerConnection;
  private readonly peerId: string;
  private readonly intervalMs: number;
  private readonly emitter: Emitter<StatsCollectorEvents> = defineEmitter();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(opts: StatsCollectorOptions) {
    this.pc = opts.pc;
    this.peerId = opts.peerId;
    this.intervalMs = opts.intervalMs;
  }

  /** Subscribe to stats events. Returns an unsubscribe. */
  on<K extends keyof StatsCollectorEvents>(
    event: K,
    handler: (payload: StatsCollectorEvents[K]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  /** Begin polling. No-op if already started. */
  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.intervalMs);
  }

  /** Cancel polling. Safe to call multiple times. */
  stop(): void {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * One-shot collection. Bypasses the interval; returns the snapshot directly.
   * Does not emit a `stats` event (intended for callers who handle the result
   * themselves).
   */
  async collect(): Promise<ConnectionStats> {
    const raw = await this.pc.getStats();
    return normalizeStats(raw, this.peerId, {
      connectionState: this.pc.connectionState,
      iceConnectionState: this.pc.iceConnectionState,
    });
  }

  private async pollOnce(): Promise<void> {
    const stats = await this.collect();
    this.emitter.emit("stats", stats);
  }
}

/**
 * Declarative factory for {@link StatsCollector}.
 *
 * ```ts
 * const collector = defineStatsCollector({ pc, peerId: "alice", intervalMs: 1000 });
 * collector.on("stats", (s) => console.log("bitrate up:", s.outbound.bitrateBps));
 * collector.start();
 * ```
 */
export function defineStatsCollector(opts: StatsCollectorOptions): StatsCollector {
  return new StatsCollector(opts);
}
