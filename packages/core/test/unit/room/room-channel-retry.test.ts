import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineRoomChannel } from "@/room/room-channel.ts";
import type { ChatStatusEntry, RoomChannelState } from "@/room/types.ts";
import { defineEngineFixture, type EngineFixture } from "@forinda/test-helpers";

describe("RoomChannel — retry + presence resync (EPIC-20)", () => {
  let fx: EngineFixture;
  beforeEach(() => {
    fx = defineEngineFixture();
  });
  afterEach(async () => {
    await fx.closeAll();
  });

  it("transitions to reconnecting when the transport closes after start", async () => {
    vi.useFakeTimers();
    try {
      const transport = await fx.open("sa");
      const channel = defineRoomChannel({
        signaling: transport,
        room: "demo",
        peerId: "alice",
        retry: { initialBackoffMs: 10, maxAttempts: 3, jitter: 0 },
      });
      await channel.start();

      const seen: RoomChannelState[] = [];
      channel.on("state", (s) => seen.push(s));

      await transport.disconnect();

      expect(seen).toContain("reconnecting");
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-broadcasts previously-set presence attributes after reconnect", async () => {
    vi.useFakeTimers();
    try {
      const transport = await fx.open("sa");
      const channel = defineRoomChannel({
        signaling: transport,
        room: "demo",
        peerId: "alice",
        retry: { initialBackoffMs: 10, maxAttempts: 3, jitter: 0 },
      });
      await channel.start();

      await channel.setAttribute("hand-raised", true);
      await channel.setAttribute("status", "🎬");

      const sentAfterReconnect: Array<Record<string, unknown>> = [];

      // Simulate transport close → reconnect.
      await transport.disconnect();

      // After disconnect, replace send to capture re-broadcasts.
      transport.send = async (m) => {
        sentAfterReconnect.push(m as Record<string, unknown>);
      };

      await vi.advanceTimersByTimeAsync(50);

      const presenceUpdates = sentAfterReconnect.filter((m) => m.type === "presence-update");
      const flat: Record<string, unknown> = {};
      for (const u of presenceUpdates) {
        const attrs = (u as { attributes: Record<string, unknown> }).attributes;
        Object.assign(flat, attrs);
      }
      expect(flat).toEqual({ "hand-raised": true, status: "🎬" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks all in-flight pending chats as failed on reconnect", async () => {
    vi.useFakeTimers();
    try {
      const transport = await fx.open("sa");
      const channel = defineRoomChannel({
        signaling: transport,
        room: "demo",
        peerId: "alice",
        retry: { initialBackoffMs: 10, maxAttempts: 3, jitter: 0 },
        chatAckTimeoutMs: 60_000,
      });
      await channel.start();

      // Hijack send so the chat never reaches the engine — it stays pending.
      transport.send = async () => {};

      const id = await channel.sendChat("in flight");
      expect(channel.chatHistory[0]?.status).toBe("pending");

      const statuses: ChatStatusEntry[] = [];
      channel.on("chat-status", (s) => statuses.push(s));

      await transport.disconnect();
      await vi.advanceTimersByTimeAsync(50);

      expect(channel.chatHistory[0]?.status).toBe("failed");
      expect(statuses.find((s) => s.id === id && s.status === "failed")).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits state=closed when retry budget is exhausted", async () => {
    vi.useFakeTimers();
    try {
      const transport = await fx.open("sa");
      const channel = defineRoomChannel({
        signaling: transport,
        room: "demo",
        peerId: "alice",
        retry: { initialBackoffMs: 10, maxAttempts: 1, jitter: 0 },
      });
      await channel.start();

      // Make every reconnect attempt fail.
      transport.connect = async () => {
        throw new Error("denied");
      };

      const errors: Error[] = [];
      channel.on("error", (e) => errors.push(e));

      await transport.disconnect();
      await vi.advanceTimersByTimeAsync(100);

      expect(channel.state).toBe("closed");
      expect(errors.some((e) => /retry budget exhausted/i.test(e.message))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
