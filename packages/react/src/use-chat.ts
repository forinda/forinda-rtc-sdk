/**
 * `useChat` — observe a `RoomChannel`'s rolling chat history and expose a
 * stable `send` callback for broadcasts and DMs.
 */

import { useCallback, useEffect, useState } from "react";
import type { ChatHistoryEntry, RoomChannel } from "@forinda/video-sdk-core";

export interface UseChatResult {
  messages: readonly ChatHistoryEntry[];
  /**
   * Send a chat message. Omit `to` for a room-wide broadcast.
   * Resolves with the entry's `id` (or `""` when no channel is attached);
   * the id correlates with the underlying channel's `chat-status` events.
   */
  send: (body: string, opts?: { to?: string }) => Promise<string>;
}

const EMPTY: readonly ChatHistoryEntry[] = [];

export function useChat(channel: RoomChannel | null): UseChatResult {
  const [messages, setMessages] = useState<readonly ChatHistoryEntry[]>(() =>
    channel ? [...channel.chatHistory] : EMPTY,
  );

  useEffect(() => {
    if (!channel) {
      setMessages(EMPTY);
      return;
    }
    setMessages([...channel.chatHistory]);
    const off = channel.on("chat", () => setMessages([...channel.chatHistory]));
    return off;
  }, [channel]);

  const send = useCallback(
    async (body: string, opts: { to?: string } = {}): Promise<string> => {
      if (!channel) return "";
      return channel.sendChat(body, opts);
    },
    [channel],
  );

  return { messages, send };
}
