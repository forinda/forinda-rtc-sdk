/**
 * `usePresence` — observe a `RoomChannel`'s live presence map and expose
 * write helpers as stable callbacks.
 *
 * Snapshots are produced fresh on every change so React re-renders by
 * referential inequality. Returns inert state when `channel` is `null`
 * (e.g. before `useRoomChannel` has constructed its handle, or on SSR).
 */

import { useCallback, useEffect, useState } from "react";
import type { JsonValue, RoomChannel } from "@forinda/video-sdk-core";

export interface UsePresenceResult {
  /** Live snapshot of every peer's presence attributes in the room. */
  peers: Record<string, Record<string, JsonValue>>;
  setAttribute: (key: string, value: JsonValue) => Promise<void>;
  removeAttribute: (key: string) => Promise<void>;
  clearAttributes: () => Promise<void>;
}

const EMPTY: Record<string, Record<string, JsonValue>> = {};

function snapshot(channel: RoomChannel | null): Record<string, Record<string, JsonValue>> {
  if (!channel) return EMPTY;
  const next: Record<string, Record<string, JsonValue>> = {};
  for (const [peer, attrs] of channel.peers) next[peer] = { ...attrs };
  return next;
}

export function usePresence(channel: RoomChannel | null): UsePresenceResult {
  const [peers, setPeers] = useState<Record<string, Record<string, JsonValue>>>(() =>
    snapshot(channel),
  );

  useEffect(() => {
    if (!channel) {
      setPeers(EMPTY);
      return;
    }
    setPeers(snapshot(channel));
    const offState = channel.on("presence", () => setPeers(snapshot(channel)));
    const offSnap = channel.on("presence-snapshot", () => setPeers(snapshot(channel)));
    const offLeft = channel.on("peer-left", () => setPeers(snapshot(channel)));
    return () => {
      offState();
      offSnap();
      offLeft();
    };
  }, [channel]);

  const setAttribute = useCallback(
    async (key: string, value: JsonValue): Promise<void> => {
      if (channel) await channel.setAttribute(key, value);
    },
    [channel],
  );

  const removeAttribute = useCallback(
    async (key: string): Promise<void> => {
      if (channel) await channel.removeAttribute(key);
    },
    [channel],
  );

  const clearAttributes = useCallback(async (): Promise<void> => {
    if (channel) await channel.clearAttributes();
  }, [channel]);

  return { peers, setAttribute, removeAttribute, clearAttributes };
}
