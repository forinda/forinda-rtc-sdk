import { describe, expect, it, vi } from "vitest";
import { SignalingValidationError } from "@/errors.ts";
import type { SignalingMessageType } from "@/messages.ts";
import { defineSession } from "@/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" | "presence" = "presence") =>
  JSON.stringify({ type: "join", room, peer, role });

const presenceUpdate = (peer: string, attributes: Record<string, unknown>) =>
  JSON.stringify({ type: "presence-update", peer, attributes });

const chat = (from: string, body: string, to?: string) =>
  JSON.stringify({
    type: "chat",
    from,
    body,
    ts: 1_700_000_000,
    ...(to !== undefined ? { to } : {}),
  });

async function joinPair(): Promise<{
  send: ReturnType<typeof vi.fn>;
  session: ReturnType<typeof defineSession>;
}> {
  const session = defineSession();
  const send = vi.fn();
  session.onSend(send);
  await session.handleConnection("sa", {});
  await session.handleMessage("sa", join("demo", "alice"));
  await session.handleConnection("sb", {});
  await session.handleMessage("sb", join("demo", "bob"));
  return { send, session };
}

describe("Session — presence", () => {
  it("broadcasts presence-state to every room member (incl. sender) on update", async () => {
    const { send, session } = await joinPair();
    send.mockClear();

    await session.handleMessage("sa", presenceUpdate("alice", { "hand-raised": true }));

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith("alice", {
      type: "presence-state",
      peer: "alice",
      attributes: { "hand-raised": true },
    });
    expect(send).toHaveBeenCalledWith("bob", {
      type: "presence-state",
      peer: "alice",
      attributes: { "hand-raised": true },
    });
  });

  it("treats null attribute value as delete", async () => {
    const { send, session } = await joinPair();
    await session.handleMessage("sa", presenceUpdate("alice", { hand: true, status: "ok" }));
    send.mockClear();

    await session.handleMessage("sa", presenceUpdate("alice", { hand: null }));

    expect(send).toHaveBeenCalledWith("alice", {
      type: "presence-state",
      peer: "alice",
      attributes: { status: "ok" },
    });
  });

  it("sends a populated presence-snapshot to a late joiner", async () => {
    const { send, session } = await joinPair();
    await session.handleMessage("sa", presenceUpdate("alice", { "hand-raised": true }));
    send.mockClear();

    await session.handleConnection("sc", {});
    await session.handleMessage("sc", join("demo", "carol"));

    // carol receives:
    //   peer-joined(alice), peer-joined(bob), presence-snapshot.
    // alice + bob each receive peer-joined(carol). Order is fanout-then-snapshot.
    const carolSnapshot = send.mock.calls.find(
      ([peer, msg]) => peer === "carol" && msg.type === "presence-snapshot",
    );
    expect(carolSnapshot).toBeDefined();
    expect(carolSnapshot?.[1]).toEqual({
      type: "presence-snapshot",
      room: "demo",
      peers: { alice: { "hand-raised": true } },
    });
  });

  it("broadcasts empty presence-state to remaining peers when a peer leaves", async () => {
    const { send, session } = await joinPair();
    await session.handleMessage("sa", presenceUpdate("alice", { "hand-raised": true }));
    send.mockClear();

    await session.handleMessage(
      "sa",
      JSON.stringify({ type: "leave", room: "demo", peer: "alice" }),
    );

    expect(send).toHaveBeenCalledWith("bob", { type: "peer-left", peer: "alice" });
    expect(send).toHaveBeenCalledWith("bob", {
      type: "presence-state",
      peer: "alice",
      attributes: {},
    });
  });

  it("broadcasts cleared presence on disconnect", async () => {
    const { send, session } = await joinPair();
    await session.handleMessage("sa", presenceUpdate("alice", { "hand-raised": true }));
    send.mockClear();

    await session.handleDisconnect("sa");

    expect(send).toHaveBeenCalledWith("bob", {
      type: "presence-state",
      peer: "alice",
      attributes: {},
    });
  });

  it("does NOT send the trailing empty presence-state when the leaver had no attributes", async () => {
    const { send, session } = await joinPair();
    send.mockClear();

    await session.handleMessage(
      "sa",
      JSON.stringify({ type: "leave", room: "demo", peer: "alice" }),
    );

    const presenceCalls = send.mock.calls.filter(([, msg]) => msg.type === "presence-state");
    expect(presenceCalls).toHaveLength(0);
  });

  it("rejects presence-update from a peer not bound to a room", async () => {
    const session = defineSession();
    session.onSend(vi.fn());
    await session.handleConnection("solo", {});
    await expect(
      session.handleMessage("solo", presenceUpdate("ghost", { hand: true })),
    ).rejects.toBeInstanceOf(SignalingValidationError);
  });

  it("rejects presence-update where claimed peerId differs from the socket binding", async () => {
    const { session } = await joinPair();
    await expect(
      session.handleMessage("sa", presenceUpdate("bob", { hand: true })),
    ).rejects.toBeInstanceOf(SignalingValidationError);
  });
});

describe("Session — chat", () => {
  it("broadcasts a roomwide chat to everyone except the sender", async () => {
    const { send, session } = await joinPair();
    send.mockClear();

    await session.handleMessage("sa", chat("alice", "hello room"));

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("bob", {
      type: "chat",
      from: "alice",
      body: "hello room",
      ts: 1_700_000_000,
    });
  });

  it("delivers a DM to only the targeted peer", async () => {
    const session = defineSession();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("demo", "alice"));
    await session.handleConnection("sb", {});
    await session.handleMessage("sb", join("demo", "bob"));
    await session.handleConnection("sc", {});
    await session.handleMessage("sc", join("demo", "carol"));
    send.mockClear();

    await session.handleMessage("sa", chat("alice", "psst", "bob"));

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      "bob",
      expect.objectContaining({ type: "chat", from: "alice", to: "bob", body: "psst" }),
    );
  });

  it("silently drops a DM to a peer not in the same room", async () => {
    const { send, session } = await joinPair();
    send.mockClear();

    await session.handleMessage("sa", chat("alice", "ghost", "ghost"));

    expect(send).not.toHaveBeenCalled();
  });

  it("rejects chat from a socket without a join binding", async () => {
    const session = defineSession();
    session.onSend(vi.fn());
    await session.handleConnection("solo", {});
    await expect(session.handleMessage("solo", chat("ghost", "boo"))).rejects.toBeInstanceOf(
      SignalingValidationError,
    );
  });

  it("rejects chat where claimed `from` differs from the socket binding", async () => {
    const { session } = await joinPair();
    await expect(session.handleMessage("sa", chat("bob", "spoof"))).rejects.toBeInstanceOf(
      SignalingValidationError,
    );
  });
});

describe("Session — chat clientId echo (EPIC-20)", () => {
  it("echoes a clientId-tagged chat back to the sender", async () => {
    const session = defineSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => sent.push({ peerId, msg }));

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleMessage(
      "sa",
      JSON.stringify({ type: "join", room: "demo", peer: "alice", role: "publisher" }),
    );
    await session.handleMessage(
      "sb",
      JSON.stringify({ type: "join", room: "demo", peer: "bob", role: "presence" }),
    );
    sent.length = 0;

    await session.handleMessage(
      "sa",
      JSON.stringify({
        type: "chat",
        from: "alice",
        body: "hello",
        ts: 123,
        clientId: "abc-123",
      }),
    );

    const chats = sent.filter((s) => s.msg.type === "chat");
    expect(chats.map((s) => s.peerId).sort()).toEqual(["alice", "bob"]);
    for (const c of chats) {
      expect(c.msg).toMatchObject({
        type: "chat",
        from: "alice",
        body: "hello",
        clientId: "abc-123",
      });
    }
  });

  it("does NOT echo to the sender when clientId is omitted (legacy clients)", async () => {
    const session = defineSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => sent.push({ peerId, msg }));

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleMessage(
      "sa",
      JSON.stringify({ type: "join", room: "demo", peer: "alice", role: "publisher" }),
    );
    await session.handleMessage(
      "sb",
      JSON.stringify({ type: "join", room: "demo", peer: "bob", role: "presence" }),
    );
    sent.length = 0;

    await session.handleMessage(
      "sa",
      JSON.stringify({ type: "chat", from: "alice", body: "hello", ts: 123 }),
    );

    const chats = sent.filter((s) => s.msg.type === "chat");
    expect(chats.map((s) => s.peerId)).toEqual(["bob"]);
  });
});
