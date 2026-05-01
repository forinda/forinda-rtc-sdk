import { describe, expect, it, vi } from "vitest";
import { PeerNotFoundError } from "../../src/errors.ts";
import { defineSession } from "../../src/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });

const sdp = (from: string, to: string) =>
  JSON.stringify({ type: "sdp", from, to, sdp: { type: "offer", sdp: "v=0..." } });

const ice = (from: string, to: string) =>
  JSON.stringify({ type: "ice", from, to, candidate: null });

describe("Session — PeerNotFoundError", () => {
  it("throws PeerNotFoundError when SDP target is missing", async () => {
    const session = defineSession();
    session.onSend(vi.fn());
    await session.handleConnection("s1", {});
    await session.handleMessage("s1", join("demo", "alice"));

    await expect(session.handleMessage("s1", sdp("alice", "ghost"))).rejects.toBeInstanceOf(
      PeerNotFoundError,
    );
  });

  it("throws PeerNotFoundError when ICE target is missing", async () => {
    const session = defineSession();
    session.onSend(vi.fn());
    await session.handleConnection("s1", {});
    await session.handleMessage("s1", join("demo", "alice"));

    await expect(session.handleMessage("s1", ice("alice", "ghost"))).rejects.toBeInstanceOf(
      PeerNotFoundError,
    );
  });

  it("does not throw when target peer exists in another room (cross-room not tightened)", async () => {
    // Spec is silent on cross-room SDP; v0.1.0 treats any registered peerId as routable.
    // This test pins the behavior — change the spec before changing the test.
    const session = defineSession();
    session.onSend(vi.fn());
    await session.handleConnection("s1", {});
    await session.handleMessage("s1", join("room-a", "alice"));
    await session.handleConnection("s2", {});
    await session.handleMessage("s2", join("room-b", "bob"));

    // alice tries to send to bob who is in another room — this should still route
    await session.handleMessage("s1", sdp("alice", "bob"));
    // No throw.
  });
});
