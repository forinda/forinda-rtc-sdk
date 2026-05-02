import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineRoomChannel, type RoomChannel } from "@/room/room-channel.ts";
import type { ChatStatusEntry } from "@/room/types.ts";
import { defineEngineFixture, type EngineFixture } from "@forinda/test-helpers";

async function startChannel(
  socketId: string,
  peerId: string,
  fixture: EngineFixture,
): Promise<RoomChannel> {
  const transport = await fixture.open(socketId);
  const channel = defineRoomChannel({ signaling: transport, room: "demo", peerId });
  await channel.start();
  return channel;
}

describe("RoomChannel — optimistic chat (EPIC-20)", () => {
  let fx: EngineFixture;
  beforeEach(() => {
    fx = defineEngineFixture();
  });
  afterEach(async () => {
    await fx.closeAll();
  });

  it("appends a pending entry synchronously and returns its id", async () => {
    const a = await startChannel("sa", "alice", fx);

    const id = await a.sendChat("hello");

    expect(typeof id).toBe("string");
    expect(a.chatHistory).toHaveLength(1);
    const entry = a.chatHistory[0];
    expect(entry?.id).toBe(id);
    expect(entry?.body).toBe("hello");
    expect(entry?.from).toBe("alice");
    // After awaiting, the engine echo has reconciled to confirmed.
    expect(entry?.status).toBe("confirmed");
  });

  it("emits chat-status pending → confirmed for an outgoing message", async () => {
    const a = await startChannel("sa", "alice", fx);

    const statuses: ChatStatusEntry[] = [];
    a.on("chat-status", (s) => statuses.push(s));

    const id = await a.sendChat("hi");

    expect(statuses[0]).toEqual({ id, status: "pending" });
    expect(statuses[statuses.length - 1]).toEqual({ id, status: "confirmed" });
  });

  it("does NOT push a duplicate entry when the server echo arrives", async () => {
    const a = await startChannel("sa", "alice", fx);

    await a.sendChat("only-once");

    expect(a.chatHistory.filter((e) => e.body === "only-once")).toHaveLength(1);
  });

  it("incoming chat from a remote peer arrives as confirmed", async () => {
    const a = await startChannel("sa", "alice", fx);
    const b = await startChannel("sb", "bob", fx);

    await b.sendChat("from bob");
    // Allow the engine fan-out to flush.
    await Promise.resolve();

    const received = a.chatHistory.find((e) => e.from === "bob");
    expect(received?.status).toBe("confirmed");
    expect(typeof received?.id).toBe("string");
  });

  it("flips to failed when signaling.send rejects", async () => {
    const transport = await fx.open("sa");
    const channel = defineRoomChannel({ signaling: transport, room: "demo", peerId: "alice" });
    await channel.start();

    transport.send = async () => {
      throw new Error("simulated wire error");
    };

    const statuses: ChatStatusEntry[] = [];
    channel.on("chat-status", (s) => statuses.push(s));

    let id = "";
    try {
      id = await channel.sendChat("doomed");
    } catch {
      // sendChat re-throws after marking failed.
    }

    expect(channel.chatHistory[0]?.status).toBe("failed");
    expect(statuses.map((s) => s.status)).toEqual(["pending", "failed"]);
    expect(statuses[1]?.id).toBe(id || channel.chatHistory[0]!.id);
  });
});

describe("RoomChannel — chat ack timeout", () => {
  let fx: EngineFixture;
  beforeEach(() => {
    fx = defineEngineFixture();
  });
  afterEach(async () => {
    await fx.closeAll();
  });

  it("flips to failed if no echo arrives within chatAckTimeoutMs", async () => {
    vi.useFakeTimers();
    try {
      const transport = await fx.open("sa");
      const channel = defineRoomChannel({
        signaling: transport,
        room: "demo",
        peerId: "alice",
        chatAckTimeoutMs: 100,
      });
      await channel.start();

      // Drop the echo by hijacking send to be a no-op (still resolves).
      transport.send = async () => {};

      const statuses: ChatStatusEntry[] = [];
      channel.on("chat-status", (s) => statuses.push(s));

      const id = await channel.sendChat("ghost");

      // Pending → still pending immediately.
      expect(channel.chatHistory[0]?.status).toBe("pending");

      vi.advanceTimersByTime(150);

      expect(channel.chatHistory[0]?.status).toBe("failed");
      expect(statuses).toEqual([
        { id, status: "pending" },
        { id, status: "failed" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the timer when the echo arrives in time", async () => {
    vi.useFakeTimers();
    try {
      const a = await startChannel("sa", "alice", fx);

      const statuses: ChatStatusEntry[] = [];
      a.on("chat-status", (s) => statuses.push(s));

      await a.sendChat("hi");

      vi.advanceTimersByTime(60_000);

      // Already confirmed before the timer fires; no failed event.
      expect(statuses.map((s) => s.status)).toEqual(["pending", "confirmed"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
