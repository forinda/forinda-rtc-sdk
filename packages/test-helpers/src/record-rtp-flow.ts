/**
 * `recordRtpFlow` — wait for the first inbound RTP packet on a `Viewer` (or
 * any source emitting `ConnectionStats`).
 *
 * Subscribes to the `stats` event and resolves on the first sample whose
 * `inbound.bitrateBps > 0`. Used by integration tests to assert that media
 * actually flows end-to-end (vs only ICE/DTLS connecting).
 *
 * Rejects on timeout, including the count of stat samples observed — when
 * a test fails, "saw 0 stats samples" vs "saw 12 samples but all zero
 * bitrate" tells you very different things.
 *
 * @example
 * ```ts
 * const stats = await recordRtpFlow(viewer, { timeoutMs: 5000 });
 * expect(stats.inbound.bitrateBps).toBeGreaterThan(0);
 * ```
 */

import type { ConnectionStats } from "@forinda/video-sdk-core";

export type StatsSource =
  | { on(event: "stats", handler: (stats: ConnectionStats) => void): () => void }
  | ((handler: (stats: ConnectionStats) => void) => () => void);

export interface RecordRtpFlowOptions {
  /** Reject after this many ms. Default 5000. */
  timeoutMs?: number;
  /**
   * Predicate applied to each stats sample; resolve when it returns true.
   * Default: `(s) => s.inbound.bitrateBps > 0`. Override when you care about
   * a different signal (e.g. `s.inbound.framesPerSecond`).
   */
  predicate?: (stats: ConnectionStats) => boolean;
}

export function recordRtpFlow(
  source: StatsSource,
  options: RecordRtpFlowOptions = {},
): Promise<ConnectionStats> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const predicate = options.predicate ?? ((s) => s.inbound.bitrateBps > 0);
  let samples = 0;

  return new Promise<ConnectionStats>((resolve, reject) => {
    let unsubscribe: (() => void) | null = null;
    let pendingCleanup = false;

    const cleanup = (): void => {
      if (unsubscribe) unsubscribe();
      else pendingCleanup = true;
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `recordRtpFlow: no matching sample within ${timeoutMs}ms (saw ${samples} sample(s))`,
        ),
      );
    }, timeoutMs);

    const handler = (stats: ConnectionStats): void => {
      samples += 1;
      if (predicate(stats)) {
        clearTimeout(timer);
        cleanup();
        resolve(stats);
      }
    };

    unsubscribe = typeof source === "function" ? source(handler) : source.on("stats", handler);
    if (pendingCleanup) unsubscribe();
  });
}
