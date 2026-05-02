/**
 * `useChat` — observe a `RoomChannel`'s rolling chat history and expose a
 * stable `send` callback for broadcasts and DMs.
 *
 * Accepts a ref/getter/value so the typical pattern of plumbing
 * `useRoomChannel().channel` through works without manual unwrapping.
 */

import { onScopeDispose, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue";
import type { ChatHistoryEntry, RoomChannel } from "@forinda/video-sdk-core";

export interface UseChatResult {
  messages: Ref<readonly ChatHistoryEntry[]>;
  /** Send a chat message. Omit `to` for a room-wide broadcast. */
  send: (body: string, opts?: { to?: string }) => Promise<void>;
}

const EMPTY: readonly ChatHistoryEntry[] = [];

export function useChat(channel: MaybeRefOrGetter<RoomChannel | null>): UseChatResult {
  const initial = toValue(channel);
  const messages = shallowRef<readonly ChatHistoryEntry[]>(
    initial ? [...initial.chatHistory] : EMPTY,
  );

  let off: (() => void) | null = null;

  watch(
    () => toValue(channel),
    (ch) => {
      off?.();
      off = null;
      if (!ch) {
        messages.value = EMPTY;
        return;
      }
      messages.value = [...ch.chatHistory];
      off = ch.on("chat", () => {
        messages.value = [...ch.chatHistory];
      });
    },
    { immediate: true },
  );

  onScopeDispose(() => off?.());

  return {
    messages,
    send: async (body, opts = {}) => {
      const ch = toValue(channel);
      if (ch) await ch.sendChat(body, opts);
    },
  };
}
