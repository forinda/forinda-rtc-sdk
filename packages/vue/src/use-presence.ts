/**
 * `usePresence` — observe a `RoomChannel`'s live presence map and expose
 * write helpers as plain async functions.
 *
 * Accepts a ref, a getter, or a plain value (via Vue's `MaybeRefOrGetter`)
 * because the `channel` typically comes from `useRoomChannel`'s ref and we
 * want it to swap to a non-null value when the channel finishes constructing.
 *
 * SSR/no-channel: returns inert refs and no-op writers.
 */

import { onScopeDispose, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue";
import type { JsonValue, RoomChannel } from "@forinda/video-sdk-core";

export interface UsePresenceResult {
  peers: Ref<Record<string, Record<string, JsonValue>>>;
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

export function usePresence(channel: MaybeRefOrGetter<RoomChannel | null>): UsePresenceResult {
  const peers = shallowRef<Record<string, Record<string, JsonValue>>>(snapshot(toValue(channel)));

  let cleanup: (() => void) | null = null;

  const subscribe = (ch: RoomChannel | null): void => {
    cleanup?.();
    cleanup = null;
    if (!ch) {
      peers.value = EMPTY;
      return;
    }
    peers.value = snapshot(ch);
    const offState = ch.on("presence", () => {
      peers.value = snapshot(ch);
    });
    const offSnap = ch.on("presence-snapshot", () => {
      peers.value = snapshot(ch);
    });
    const offLeft = ch.on("peer-left", () => {
      peers.value = snapshot(ch);
    });
    cleanup = () => {
      offState();
      offSnap();
      offLeft();
    };
  };

  watch(() => toValue(channel), subscribe, { immediate: true });

  onScopeDispose(() => cleanup?.());

  return {
    peers,
    setAttribute: async (key, value) => {
      const ch = toValue(channel);
      if (ch) await ch.setAttribute(key, value);
    },
    removeAttribute: async (key) => {
      const ch = toValue(channel);
      if (ch) await ch.removeAttribute(key);
    },
    clearAttributes: async () => {
      const ch = toValue(channel);
      if (ch) await ch.clearAttributes();
    },
  };
}
