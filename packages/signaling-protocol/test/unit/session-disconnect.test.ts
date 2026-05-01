import { describe, expect, it, vi } from "vitest";
import { defineSession } from "../../src/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });

describe("Session.handleDisconnect", () => {
  it("drops the socket from the registry", async () => {
    const session = defineSession();
    session.onSend(vi.fn());
    await session.handleConnection("socket-a", {});
    expect(session.socketCount()).toBe(1);

    await session.handleDisconnect("socket-a");
    expect(session.socketCount()).toBe(0);
  });

  it("removes the disconnected peer from any room and broadcasts peer-left", async () => {
    const session = defineSession();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));
    send.mockClear();

    await session.handleDisconnect("socket-a");

    expect(send).toHaveBeenCalledWith("bob", { type: "peer-left", peer: "alice" });
    expect(session.rooms()[0]?.peers.map((p) => p.peerId)).toEqual(["bob"]);
  });

  it("garbage-collects empty rooms", async () => {
    const session = defineSession();
    session.onSend(vi.fn());
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    await session.handleDisconnect("socket-a");

    expect(session.rooms()).toEqual([]);
  });

  it("is a no-op for unknown socket", async () => {
    const session = defineSession();
    session.onSend(vi.fn());
    await expect(session.handleDisconnect("ghost")).resolves.toBeUndefined();
  });
});
