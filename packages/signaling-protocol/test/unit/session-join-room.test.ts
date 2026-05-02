import { describe, expect, it, vi } from "vitest";
import { SignalingValidationError } from "@/errors.ts";
import { defineSession } from "@/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });

describe("Session.handleMessage — join", () => {
  it("parses a valid join and registers the peer in the room", async () => {
    const session = defineSession();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-1", {});
    await session.handleMessage("socket-1", join("demo", "alice"));

    const rooms = session.rooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.roomId).toBe("demo");
    expect(rooms[0]?.peers).toHaveLength(1);
    expect(rooms[0]?.peers[0]?.peerId).toBe("alice");
    expect(rooms[0]?.peers[0]?.role).toBe("publisher");
  });

  it("broadcasts peer-joined both to existing peers and to the joiner", async () => {
    const session = defineSession();
    const send = vi.fn();
    session.onSend(send);

    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));

    send.mockClear(); // ignore alice's own join — no peers to notify yet

    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));

    // Three calls: alice told about bob, bob told about alice, bob's
    // initial presence-snapshot for the room.
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenCalledWith("alice", {
      type: "peer-joined",
      peer: "bob",
      role: "viewer",
    });
    expect(send).toHaveBeenCalledWith("bob", {
      type: "peer-joined",
      peer: "alice",
      role: "publisher",
    });
    expect(send).toHaveBeenCalledWith("bob", {
      type: "presence-snapshot",
      room: "demo",
      peers: {},
    });
  });

  it("also sends peer-joined for each existing peer back to the joiner", async () => {
    const session = defineSession();
    const send = vi.fn();
    session.onSend(send);

    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice", "publisher"));
    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));

    // bob should have been told about alice
    expect(send).toHaveBeenCalledWith("bob", {
      type: "peer-joined",
      peer: "alice",
      role: "publisher",
    });
  });

  it("rejects JSON that fails zod validation with SignalingValidationError", async () => {
    const session = defineSession();
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", {});
    await expect(session.handleMessage("socket-1", '{"type":"join"}')).rejects.toBeInstanceOf(
      SignalingValidationError,
    );
  });

  it("rejects malformed JSON with SignalingValidationError", async () => {
    const session = defineSession();
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", {});
    await expect(session.handleMessage("socket-1", "not json")).rejects.toBeInstanceOf(
      SignalingValidationError,
    );
  });

  it("rejects messages from unknown sockets", async () => {
    const session = defineSession();
    session.onSend(vi.fn());
    await expect(
      session.handleMessage("ghost-socket", join("demo", "alice")),
    ).rejects.toBeInstanceOf(SignalingValidationError);
  });
});
