import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineRoomChannel, type RoomChannel } from "@/room/room-channel.ts";
import type {
  SignalingMessageType,
  SignalingTransport,
  TransportState,
} from "@/signaling/transport.ts";
import { defineSession, type Session } from "@forinda/video-sdk-signaling-protocol";

/**
 * In-memory transport pair wired through a real `Session` so the
 * presence/chat round-trip exercises the actual engine logic instead of a
 * hand-rolled fake. Each transport corresponds to one socket on the engine.
 */
function defineTransport(
  socketId: string,
  session: Session,
): SignalingTransport & { __feed(msg: SignalingMessageType): void } {
  const messageHandlers = new Set<(m: SignalingMessageType) => void>();
  const stateHandlers = new Set<(s: TransportState) => void>();
  let state: TransportState = "idle";

  const t = {
    get state() {
      return state;
    },
    async connect() {
      if (state === "connected") return;
      state = "connected";
      for (const h of stateHandlers) h(state);
      await session.handleConnection(socketId, {});
    },
    async disconnect() {
      if (state === "closed") return;
      state = "closed";
      for (const h of stateHandlers) h(state);
      await session.handleDisconnect(socketId);
    },
    async send(message: SignalingMessageType) {
      await session.handleMessage(socketId, JSON.stringify(message));
    },
    on<E extends "message" | "state">(
      event: E,
      handler: E extends "message"
        ? (m: SignalingMessageType) => void
        : (s: TransportState) => void,
    ): () => void {
      if (event === "message") {
        const h = handler as (m: SignalingMessageType) => void;
        messageHandlers.add(h);
        return () => messageHandlers.delete(h);
      }
      const h = handler as (s: TransportState) => void;
      stateHandlers.add(h);
      return () => stateHandlers.delete(h);
    },
    __feed(msg: SignalingMessageType) {
      for (const h of messageHandlers) h(msg);
    },
  } satisfies SignalingTransport & { __feed(msg: SignalingMessageType): void };

  return t;
}

interface Fixture {
  session: Session;
  transports: Map<string, ReturnType<typeof defineTransport>>;
  open: (socketId: string) => Promise<ReturnType<typeof defineTransport>>;
}

function defineFixture(): Fixture {
  const session = defineSession();
  const transports = new Map<string, ReturnType<typeof defineTransport>>();

  session.onSend((peerId, msg) => {
    // Engine routes by peerId; map back to the transport that owns that peer.
    for (const t of transports.values()) {
      if ((t as unknown as { __peerId?: string }).__peerId === peerId) {
        t.__feed(msg);
        return;
      }
    }
  });

  const open = async (socketId: string): Promise<ReturnType<typeof defineTransport>> => {
    const t = defineTransport(socketId, session);
    transports.set(socketId, t);
    return t;
  };

  return { session, transports, open };
}

/**
 * Bind a transport's outbound send so the per-peer routing in `defineFixture`
 * can find it. Done after `start()` because the channel issues the join,
 * which is what tells the engine which peerId belongs to this socket.
 */
function bindPeer(
  transport: ReturnType<typeof defineTransport>,
  peerId: string,
): void {
  (transport as unknown as { __peerId: string }).__peerId = peerId;
}

async function startChannel(
  socketId: string,
  peerId: string,
  fixture: Fixture,
): Promise<{ channel: RoomChannel; transport: ReturnType<typeof defineTransport> }> {
  const transport = await fixture.open(socketId);
  bindPeer(transport, peerId);
  const channel = defineRoomChannel({ signaling: transport, room: "demo", peerId });
  await channel.start();
  return { channel, transport };
}

describe("defineRoomChannel — presence", () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = defineFixture();
  });
  afterEach(async () => {
    // Snapshot iteration so we can disconnect every transport even if some
    // are already closed by the test.
    for (const t of [...fx.transports.values()]) {
      try {
        await t.disconnect();
      } catch {
        /* ignore */
      }
    }
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
  let fx: Fixture;
  beforeEach(() => {
    fx = defineFixture();
  });
  afterEach(async () => {
    for (const t of [...fx.transports.values()]) {
      try {
        await t.disconnect();
      } catch {
        /* ignore */
      }
    }
  });

  it("broadcast chat reaches every other room member but not the sender", async () => {
    const a = await startChannel("sa", "alice", fx);
    const b = await startChannel("sb", "bob", fx);
    const c = await startChannel("sc", "carol", fx);

    await a.channel.sendChat("hi room");
    await Promise.resolve();

    expect(b.channel.chatHistory.map((m) => m.body)).toEqual(["hi room"]);
    expect(c.channel.chatHistory.map((m) => m.body)).toEqual(["hi room"]);
    expect(a.channel.chatHistory).toHaveLength(0);
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
    bindPeer(transport, "alice");
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
