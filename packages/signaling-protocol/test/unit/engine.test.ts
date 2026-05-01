import { describe, expect, it, vi } from "vitest";
import { defineSignalingEngine, SignalingEngine } from "@/engine.ts";
import { Session } from "@/session.ts";

describe("defineSignalingEngine + SignalingEngine", () => {
  it("factory returns a SignalingEngine", () => {
    const engine = defineSignalingEngine();
    expect(engine).toBeInstanceOf(SignalingEngine);
  });

  it("constructs with no options", () => {
    const engine = defineSignalingEngine();
    const session = engine.openSession();
    expect(session).toBeInstanceOf(Session);
  });

  it("passes maxPeersPerRoom to created sessions", async () => {
    const engine = defineSignalingEngine({ maxPeersPerRoom: 1 });
    const session = engine.openSession();
    session.onSend(vi.fn());
    await session.handleConnection("s1", {});
    await session.handleMessage(
      "s1",
      JSON.stringify({ type: "join", room: "r", peer: "p1", role: "publisher" }),
    );
    await session.handleConnection("s2", {});
    await expect(
      session.handleMessage(
        "s2",
        JSON.stringify({ type: "join", room: "r", peer: "p2", role: "viewer" }),
      ),
    ).rejects.toThrow(/full/);
  });

  it("passes authenticate to created sessions", async () => {
    const auth = vi.fn(async () => true);
    const engine = defineSignalingEngine({ authenticate: auth });
    const session = engine.openSession();
    session.onSend(vi.fn());
    await session.handleConnection("s1", { token: "xyz" });
    await session.handleMessage(
      "s1",
      JSON.stringify({ type: "join", room: "r", peer: "p", role: "publisher" }),
    );
    expect(auth).toHaveBeenCalledWith("xyz", "r");
  });

  it("openSession returns independent sessions", async () => {
    const engine = defineSignalingEngine();
    const a = engine.openSession();
    const b = engine.openSession();
    a.onSend(vi.fn());
    b.onSend(vi.fn());
    await a.handleConnection("s1", {});
    expect(a.socketCount()).toBe(1);
    expect(b.socketCount()).toBe(0);
  });
});
