import { describe, expect, it, vi } from "vitest";
import { defineSession } from "@/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });

const sdp = (from: string, to: string, type: "offer" | "answer", body = "v=0...") =>
  JSON.stringify({ type: "sdp", from, to, sdp: { type, sdp: body } });

describe("Session.handleMessage — sdp", () => {
  it("routes an offer from publisher to viewer", async () => {
    const session = defineSession();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));
    send.mockClear();

    await session.handleMessage("socket-a", sdp("alice", "bob", "offer"));

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("bob", {
      type: "sdp",
      from: "alice",
      to: "bob",
      sdp: { type: "offer", sdp: "v=0..." },
    });
  });

  it("routes an answer back", async () => {
    const session = defineSession();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));
    send.mockClear();

    await session.handleMessage("socket-b", sdp("bob", "alice", "answer"));

    expect(send).toHaveBeenCalledWith(
      "alice",
      expect.objectContaining({ type: "sdp", from: "bob", to: "alice" }),
    );
  });
});
