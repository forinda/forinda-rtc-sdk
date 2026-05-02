/**
 * `useChat` — observe a `RoomChannel`'s rolling chat history and expose a
 * stable `send` callback for broadcasts and DMs.
 */

import { useCallback, useEffect, useState } from "react";
import type { ChatHistoryEntry, RoomChannel } from "@forinda/video-sdk-core";

export interface UseChatResult {
  messages: readonly ChatHistoryEntry[];
  /** Send a chat message. Omit `to` for a room-wide broadcast. */
  send: (body: string, opts?: { to?: string }) => Promise<void>;
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
    async (body: string, opts: { to?: string } = {}): Promise<void> => {
      if (channel) await channel.sendChat(body, opts);
    },
    [channel],
  );

  return { messages, send };
}
