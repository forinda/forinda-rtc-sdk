/**
 * `useRaiseHand` — sugar over `usePresence` for the most common interaction
 * pattern. Reads the channel peer's own `"hand-raised"` attribute and
 * exposes raise / lower / toggle actions.
 */

import { useCallback } from "react";
import type { RoomChannel } from "@forinda/video-sdk-core";
import { usePresence } from "./use-presence.ts";

export interface UseRaiseHandResult {
  raised: boolean;
  raise: () => Promise<void>;
  lower: () => Promise<void>;
  toggle: () => Promise<void>;
}

export function useRaiseHand(channel: RoomChannel | null): UseRaiseHandResult {
  const { peers } = usePresence(channel);
  const raised = channel ? peers[channel.peerId]?.["hand-raised"] === true : false;

  const raise = useCallback(async (): Promise<void> => {
    if (channel) await channel.raiseHand();
  }, [channel]);

  const lower = useCallback(async (): Promise<void> => {
    if (channel) await channel.lowerHand();
  }, [channel]);

  const toggle = useCallback(async (): Promise<void> => {
    if (!channel) return;
    if (channel.peers.get(channel.peerId)?.["hand-raised"] === true) {
      await channel.lowerHand();
    } else {
      await channel.raiseHand();
    }
  }, [channel]);

  return { raised, raise, lower, toggle };
}
