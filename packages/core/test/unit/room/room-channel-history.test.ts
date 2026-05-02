import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineRoomChannel } from "@/room/room-channel.ts";
import type { ChatHistoryEntry } from "@/room/types.ts";
import { defineEngineFixture, type EngineFixture } from "@forinda/test-helpers";

describe("RoomChannel — chat history replay (EPIC-22)", () => {
  let fx: EngineFixture;
  beforeEach(() => {
    fx = defineEngineFixture({ chatHistoryPerRoom: 10 });
  });
  afterEach(async () => {
    await fx.closeAll();
  });

  it("opts into history via replayHistory; receives a chat-history event", async () => {
    const aTransport = await fx.open("sa");
    const a = defineRoomChannel({ signaling: aTransport, room: "demo", peerId: "alice" });
    await a.start();
    await a.sendChat("first");
    await a.sendChat("second");

    const bTransport = await fx.open("sb");
    const b = defineRoomChannel({
      signaling: bTransport,
      room: "demo",
      peerId: "bob",
      replayHistory: true,
    });

    const histories: ChatHistoryEntry[][] = [];
    b.on("chat-history", (h) => histories.push(h));

    await b.start();
    // Engine fans out the chat-history immediately on join — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(histories).toHaveLength(1);
    expect(histories[0]?.map((e) => e.body)).toEqual(["first", "second"]);
    // chatHistory is seeded with the replayed messages.
    expect(b.chatHistory.map((e) => e.body)).toEqual(["first", "second"]);
    // All status: confirmed (these arrived from the server).
    expect(b.chatHistory.every((e) => e.status === "confirmed")).toBe(true);
  });

  it("does NOT receive chat-history when replayHistory is omitted", async () => {
    const aTransport = await fx.open("sa");
    const a = defineRoomChannel({ signaling: aTransport, room: "demo", peerId: "alice" });
    await a.start();
    await a.sendChat("x");

    const bTransport = await fx.open("sb");
    const b = defineRoomChannel({ signaling: bTransport, room: "demo", peerId: "bob" });

    const histories: ChatHistoryEntry[][] = [];
    b.on("chat-history", (h) => histories.push(h));

    await b.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(histories).toHaveLength(0);
    expect(b.chatHistory).toHaveLength(0);
  });
});
