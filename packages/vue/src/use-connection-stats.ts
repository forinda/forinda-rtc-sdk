/**
 * `useConnectionStats` — standalone stats subscription for consumers
 * managing their own Publisher / Viewer instance.
 *
 * Returns a `Ref<ConnectionStats[]>` for a Publisher, `Ref<ConnectionStats | null>`
 * for a Viewer.
 */

import { onScopeDispose, shallowRef, type Ref } from "vue";
import type { ConnectionStats, Publisher, Viewer } from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseConnectionStatsOptions {
  /** Reserved for future use (the underlying engine controls the interval). */
  interval?: number;
}

export function useConnectionStats(
  source: Publisher | null,
  opts?: UseConnectionStatsOptions,
): Ref<ConnectionStats[]>;
export function useConnectionStats(
  source: Viewer | null,
  opts?: UseConnectionStatsOptions,
): Ref<ConnectionStats | null>;
export function useConnectionStats(
  source: Publisher | Viewer | null,
  _opts: UseConnectionStatsOptions = {},
): Ref<ConnectionStats[] | ConnectionStats | null> {
  const stats = shallowRef<ConnectionStats[] | ConnectionStats | null>(null);

  if (!isServer && source !== null) {
    type StatsHandler = (s: ConnectionStats[] | ConnectionStats) => void;
    type StatsOn = (event: "stats", handler: StatsHandler) => () => void;
    const off = (source.on as unknown as StatsOn)("stats", (s) => {
      stats.value = s;
    });
    onScopeDispose(off);
  }

  return stats;
}
