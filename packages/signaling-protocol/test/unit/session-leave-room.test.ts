import { describe, expect, it, vi } from "vitest";
import { defineSession } from "../../src/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });
const leave = (room: string, peer: string) => JSON.stringify({ type: "leave", room, peer });

describe("Session.handleMessage — leave", () => {
  it("removes the peer from the room", async () => {
    const session = defineSession();
    session.onSend(vi.fn());
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    expect(session.rooms()[0]?.peers).toHaveLength(1);

    await session.handleMessage("socket-a", leave("demo", "alice"));
    expect(session.rooms()[0]?.peers ?? []).toHaveLength(0);
  });

  it("broadcasts peer-left to remaining peers", async () => {
    const session = defineSession();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    await session.handleConnection("socket-b", {});
    await session.handleMessage("socket-b", join("demo", "bob", "viewer"));
    send.mockClear();

    await session.handleMessage("socket-a", leave("demo", "alice"));

    expect(send).toHaveBeenCalledWith("bob", { type: "peer-left", peer: "alice" });
  });

  it("is a no-op when the peer is not in the room", async () => {
    const session = defineSession();
    const send = vi.fn();
    session.onSend(send);
    await session.handleConnection("socket-a", {});
    await session.handleMessage("socket-a", join("demo", "alice"));
    send.mockClear();

    // alice trying to leave a room she isn't in
    await session.handleMessage("socket-a", leave("other-room", "alice"));
    expect(send).not.toHaveBeenCalled();
  });
});
