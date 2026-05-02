/**
 * `useRaiseHand` — sugar over `usePresence` for the most common interaction
 * pattern. Reads the channel peer's own `"hand-raised"` attribute and
 * exposes raise / lower / toggle actions.
 */

import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { RoomChannel } from "@forinda/video-sdk-core";
import { usePresence } from "./use-presence.ts";

export interface UseRaiseHandResult {
  raised: ComputedRef<boolean>;
  raise: () => Promise<void>;
  lower: () => Promise<void>;
  toggle: () => Promise<void>;
}

export function useRaiseHand(channel: MaybeRefOrGetter<RoomChannel | null>): UseRaiseHandResult {
  const { peers } = usePresence(channel);

  const raised = computed(() => {
    const ch = toValue(channel);
    if (!ch) return false;
    return peers.value[ch.peerId]?.["hand-raised"] === true;
  });

  return {
    raised,
    raise: async () => {
      const ch = toValue(channel);
      if (ch) await ch.raiseHand();
    },
    lower: async () => {
      const ch = toValue(channel);
      if (ch) await ch.lowerHand();
    },
    toggle: async () => {
      const ch = toValue(channel);
      if (!ch) return;
      if (ch.peers.get(ch.peerId)?.["hand-raised"] === true) {
        await ch.lowerHand();
      } else {
        await ch.raiseHand();
      }
    },
  };
}
