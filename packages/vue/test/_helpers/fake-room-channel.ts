import { vi } from "vitest";
import type { ChatHistoryEntry, JsonValue, RoomChannel } from "@forinda/video-sdk-core";

/**
 * Hand-rolled `RoomChannel` substitute for Vue composable tests.
 * Surface matches what the composables actually call. `__fire` lets tests
 * dispatch events without threading a real signaling transport through.
 */
export interface FakeRoomChannel extends RoomChannel {
  __fire<
    E extends "presence" | "presence-snapshot" | "peer-joined" | "peer-left" | "chat" | "error",
  >(
    event: E,
    payload: unknown,
  ): void;
  __setPresence(peerId: string, attrs: Record<string, JsonValue>): void;
}

export function defineFakeRoomChannel(peerId = "alice"): FakeRoomChannel {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  const presenceMap = new Map<string, Record<string, JsonValue>>();
  const chatBuffer: ChatHistoryEntry[] = [];

  const ch: Partial<FakeRoomChannel> = {
    room: "demo",
    peerId,
    get peers() {
      return presenceMap;
    },
    get chatHistory() {
      return chatBuffer;
    },
    on: ((event: string, handler: (p: unknown) => void) => {
      let bucket = handlers.get(event);
      if (!bucket) {
        bucket = new Set();
        handlers.set(event, bucket);
      }
      bucket.add(handler);
      return () => bucket?.delete(handler);
    }) as RoomChannel["on"],
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    setAttribute: vi.fn(async (key: string, value: JsonValue) => {
      const existing = presenceMap.get(peerId) ?? {};
      presenceMap.set(peerId, { ...existing, [key]: value });
      handlers.get("presence")?.forEach((h) => h({ peer: peerId, attributes: { [key]: value } }));
    }),
    removeAttribute: vi.fn(async (key: string) => {
      const existing = { ...(presenceMap.get(peerId) ?? {}) };
      delete existing[key];
      if (Object.keys(existing).length === 0) presenceMap.delete(peerId);
      else presenceMap.set(peerId, existing);
      handlers.get("presence")?.forEach((h) => h({ peer: peerId, attributes: {} }));
    }),
    clearAttributes: vi.fn(async () => {
      presenceMap.delete(peerId);
      handlers.get("presence")?.forEach((h) => h({ peer: peerId, attributes: {} }));
    }),
    raiseHand: vi.fn(async function (this: FakeRoomChannel) {
      await this.setAttribute("hand-raised", true);
    }),
    lowerHand: vi.fn(async function (this: FakeRoomChannel) {
      await this.removeAttribute("hand-raised");
    }),
    sendChat: vi.fn(async (body: string, opts: { to?: string } = {}) => {
      const entry: ChatHistoryEntry = {
        type: "chat",
        from: peerId,
        body,
        ts: Date.now(),
        receivedAt: Date.now(),
        ...(opts.to !== undefined ? { to: opts.to } : {}),
      };
      chatBuffer.push(entry);
      handlers.get("chat")?.forEach((h) => h(entry));
    }),
    __fire(event, payload) {
      handlers.get(event)?.forEach((h) => h(payload));
    },
    __setPresence(p: string, attrs: Record<string, JsonValue>) {
      presenceMap.set(p, attrs);
    },
  };

  ch.raiseHand = (ch.raiseHand as (this: FakeRoomChannel) => Promise<void>).bind(
    ch as FakeRoomChannel,
  );
  ch.lowerHand = (ch.lowerHand as (this: FakeRoomChannel) => Promise<void>).bind(
    ch as FakeRoomChannel,
  );
  return ch as FakeRoomChannel;
}
