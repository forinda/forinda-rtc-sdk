import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineRoomChannel, type RoomChannel } from "@/room/room-channel.ts";
import {
  defineEngineFixture,
  type EngineFixture,
  type FixtureTransport,
} from "@forinda/test-helpers";

async function startChannel(
  socketId: string,
  peerId: string,
  fixture: EngineFixture,
): Promise<{ channel: RoomChannel; transport: FixtureTransport }> {
  const transport = await fixture.open(socketId);
  const channel = defineRoomChannel({ signaling: transport, room: "demo", peerId });
  await channel.start();
  return { channel, transport };
}

describe("defineRoomChannel — presence", () => {
  let fx: EngineFixture;
  beforeEach(() => {
    fx = defineEngineFixture();
  });
  afterEach(async () => {
    await fx.closeAll();
  });

  it("setAttribute round-trips and updates the local presence map", async () => {
    const a = await startChannel("sa", "alice", fx);
    const b = await startChannel("sb", "bob", fx);

    let bobObserved: { peer: string; attributes: Record<string, unknown> } | undefined;
    b.channel.on("presence", (e) => {
      bobObserved = e;
    });

    await a.channel.setAttribute("hand-raised", true);
    await Promise.resolve();

    expect(bobObserved).toEqual({ peer: "alice", attributes: { "hand-raised": true } });
    expect(a.channel.peers.get("alice")).toEqual({ "hand-raised": true });
    expect(b.channel.peers.get("alice")).toEqual({ "hand-raised": true });
  });

  it("raiseHand / lowerHand sugar drives the hand-raised attribute", async () => {
    const a = await startChannel("sa", "alice", fx);
    const b = await startChannel("sb", "bob", fx);

    await a.channel.raiseHand();
    expect(b.channel.peers.get("alice")).toEqual({ "hand-raised": true });

    await a.channel.lowerHand();
    expect(b.channel.peers.get("alice")).toBeUndefined();
  });

  it("late joiner receives a populated presence-snapshot", async () => {
    const a = await startChannel("sa", "alice", fx);
    await a.channel.setAttribute("status", "🎬");

    const b = await startChannel("sb", "bob", fx);

    expect(b.channel.peers.get("alice")).toEqual({ status: "🎬" });
  });

  it("clearAttributes removes every previously-set own key", async () => {
    const a = await startChannel("sa", "alice", fx);
    const b = await startChannel("sb", "bob", fx);

    await a.channel.setAttribute("a", 1);
    await a.channel.setAttribute("b", 2);
    await a.channel.clearAttributes();

    expect(b.channel.peers.get("alice")).toBeUndefined();
  });

  it("peer-left removes the peer from the local presence map", async () => {
    const a = await startChannel("sa", "alice", fx);
    const b = await startChannel("sb", "bob", fx);

    await a.channel.setAttribute("hand-raised", true);
    await a.transport.disconnect();
    await Promise.resolve();

    expect(b.channel.peers.get("alice")).toBeUndefined();
  });
});

describe("defineRoomChannel — chat", () => {
  let fx: EngineFixture;
  beforeEach(() => {
    fx = defineEngineFixture();
  });
  afterEach(async () => {
    await fx.closeAll();
  });

  it("broadcast chat reaches every other room member and the sender's optimistic entry confirms", async () => {
    const a = await startChannel("sa", "alice", fx);
    const b = await startChannel("sb", "bob", fx);
    const c = await startChannel("sc", "carol", fx);

    await a.channel.sendChat("hi room");
    await Promise.resolve();

    expect(b.channel.chatHistory.map((m) => m.body)).toEqual(["hi room"]);
    expect(c.channel.chatHistory.map((m) => m.body)).toEqual(["hi room"]);
    // Optimistic append: sender's own history holds exactly one entry,
    // flipped to "confirmed" once the server echo (matched by clientId)
    // reconciles. No duplicates.
    expect(a.channel.chatHistory).toHaveLength(1);
    expect(a.channel.chatHistory[0]?.body).toBe("hi room");
    expect(a.channel.chatHistory[0]?.status).toBe("confirmed");
  });

  it("DM with `to` reaches only the targeted peer", async () => {
    const a = await startChannel("sa", "alice", fx);
    const b = await startChannel("sb", "bob", fx);
    const c = await startChannel("sc", "carol", fx);

    await a.channel.sendChat("psst", { to: "bob" });
    await Promise.resolve();

    expect(b.channel.chatHistory.map((m) => m.body)).toEqual(["psst"]);
    expect(c.channel.chatHistory).toHaveLength(0);
  });

  it("chat history is capped at chatHistoryLimit", async () => {
    const transport = await fx.open("sa");
    const a = defineRoomChannel({
      signaling: transport,
      room: "demo",
      peerId: "alice",
      chatHistoryLimit: 3,
    });
    await a.start();
    const b = await startChannel("sb", "bob", fx);

    for (let i = 1; i <= 5; i += 1) {
      await b.channel.sendChat(`msg-${i}`);
    }
    await Promise.resolve();

    expect(a.chatHistory.map((m) => m.body)).toEqual(["msg-3", "msg-4", "msg-5"]);
  });

  it("stop() detaches listeners — no further presence/chat after stop", async () => {
    const a = await startChannel("sa", "alice", fx);
    const b = await startChannel("sb", "bob", fx);
    await a.channel.stop();

    await b.channel.setAttribute("hand-raised", true);
    await Promise.resolve();

    // alice's channel was stopped before bob's update, so it should not have
    // observed bob's presence change.
    expect(a.channel.peers.get("bob")).toBeUndefined();
  });
});
