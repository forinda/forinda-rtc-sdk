/**
 * `useConnectionStats` — standalone stats poller for consumers managing
 * their own Publisher / Viewer instance.
 *
 * Returns `ConnectionStats[]` for a Publisher, `ConnectionStats | null` for
 * a Viewer.
 */

import { useEffect, useState } from "react";
import type { ConnectionStats, Publisher, Viewer } from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseConnectionStatsOptions {
  /** Polling interval in ms. Defaults to 1000. */
  interval?: number;
}

/**
 * Subscribe to a Publisher's stats events (returns array of stats per viewer)
 * or a Viewer's stats events (returns single stats object).
 */
export function useConnectionStats(
  source: Publisher | null,
  opts?: UseConnectionStatsOptions,
): ConnectionStats[];
export function useConnectionStats(
  source: Viewer | null,
  opts?: UseConnectionStatsOptions,
): ConnectionStats | null;
export function useConnectionStats(
  source: Publisher | Viewer | null,
  _opts: UseConnectionStatsOptions = {},
): ConnectionStats[] | ConnectionStats | null {
  const [stats, setStats] = useState<ConnectionStats[] | ConnectionStats | null>(null);

  useEffect(() => {
    if (isServer) return;
    if (source === null) return;

    type StatsHandler = (s: ConnectionStats[] | ConnectionStats) => void;
    type StatsOn = (event: "stats", handler: StatsHandler) => () => void;
    const off = (source.on as unknown as StatsOn)("stats", (s) => {
      setStats(s);
    });
    return off;
  }, [source]);

  return stats as ConnectionStats[] | ConnectionStats | null;
}
