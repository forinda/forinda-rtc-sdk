import { describe, expect, it, vi } from "vitest";
import { RoomFullError } from "@/errors.ts";
import { defineSession } from "@/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });

describe("Session — maxPeersPerRoom", () => {
  it("rejects join with RoomFullError when capacity reached", async () => {
    const session = defineSession({ maxPeersPerRoom: 2 });
    session.onSend(vi.fn());
    await session.handleConnection("s1", {});
    await session.handleMessage("s1", join("demo", "alice"));
    await session.handleConnection("s2", {});
    await session.handleMessage("s2", join("demo", "bob"));
    await session.handleConnection("s3", {});

    await expect(session.handleMessage("s3", join("demo", "carol"))).rejects.toBeInstanceOf(
      RoomFullError,
    );
  });

  it("allows the third peer to join a different room", async () => {
    const session = defineSession({ maxPeersPerRoom: 2 });
    session.onSend(vi.fn());
    await session.handleConnection("s1", {});
    await session.handleMessage("s1", join("room-a", "alice"));
    await session.handleConnection("s2", {});
    await session.handleMessage("s2", join("room-a", "bob"));
    await session.handleConnection("s3", {});

    await session.handleMessage("s3", join("room-b", "carol"));
    expect(session.rooms()).toHaveLength(2);
  });

  it("default capacity is 50", async () => {
    const session = defineSession();
    session.onSend(vi.fn());
    for (let i = 0; i < 50; i += 1) {
      await session.handleConnection(`s${i}`, {});
      await session.handleMessage(`s${i}`, join("demo", `peer-${i}`));
    }
    await session.handleConnection("s50", {});
    await expect(session.handleMessage("s50", join("demo", "peer-50"))).rejects.toBeInstanceOf(
      RoomFullError,
    );
  });
});
