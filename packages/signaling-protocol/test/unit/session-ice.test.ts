import { describe, expect, it, vi } from "vitest";
import { defineSession } from "../../src/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });

const ice = (from: string, to: string, candidate: unknown) =>
  JSON.stringify({ type: "ice", from, to, candidate });

describe("Session.handleMessage — ice", () => {
  it("routes an ICE candidate object to the target peer", async () => {
    const session = defineSession();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));
    send.mockClear();

    const candidate = { candidate: "candidate:1 1 udp 2113937151 ...", sdpMid: "0" };
    await session.handleMessage("socket-a", ice("alice", "bob", candidate));

    expect(send).toHaveBeenCalledWith("bob", {
      type: "ice",
      from: "alice",
      to: "bob",
      candidate,
    });
  });

  it("routes a null end-of-candidates marker", async () => {
    const session = defineSession();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));
    send.mockClear();

    await session.handleMessage("socket-a", ice("alice", "bob", null));

    expect(send).toHaveBeenCalledWith(
      "bob",
      expect.objectContaining({ type: "ice", candidate: null }),
    );
  });
});
