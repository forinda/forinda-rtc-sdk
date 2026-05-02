import { describe, expect, it, vi } from "vitest";
import { defineInMemoryTransportPair } from "@/in-memory-signaling.ts";
import type { JoinRoomMessage } from "@forinda/video-sdk-core";

const joinMsg = (peer: string): JoinRoomMessage => ({
  type: "join",
  room: "demo",
  peer,
  role: "publisher",
});

describe("defineInMemoryTransportPair", () => {
  it("starts both sides idle", () => {
    const { publisher: a, viewer: b } = defineInMemoryTransportPair();
    expect(a.state).toBe("idle");
    expect(b.state).toBe("idle");
  });

  it("connect() flips both sides to 'connected' and notifies state listeners", async () => {
    const { publisher: a, viewer: b } = defineInMemoryTransportPair();
    const aStates: string[] = [];
    const bStates: string[] = [];
    a.on("state", (s) => aStates.push(s));
    b.on("state", (s) => bStates.push(s));

    await a.connect();

    expect(a.state).toBe("connected");
    expect(b.state).toBe("connected");
    expect(aStates).toEqual(["connected"]);
    expect(bStates).toEqual(["connected"]);
  });

  it("disconnect() flips both sides to 'closed'", async () => {
    const { publisher: a, viewer: b } = defineInMemoryTransportPair();
    await a.connect();
    await a.disconnect();
    expect(a.state).toBe("closed");
    expect(b.state).toBe("closed");
  });

  it("messages sent on one side arrive on the other", async () => {
    const { publisher: a, viewer: b } = defineInMemoryTransportPair();
    const handler = vi.fn();
    b.on("message", handler);

    const msg = joinMsg("alice");
    await a.send(msg);
    await Promise.resolve();
    await Promise.resolve();

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(msg);
  });

  it("unsubscribe stops further deliveries", async () => {
    const { publisher: a, viewer: b } = defineInMemoryTransportPair();
    const handler = vi.fn();
    const off = b.on("message", handler);
    off();
    await a.send(joinMsg("alice"));
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
  });

  it("connect is idempotent", async () => {
    const { publisher: a, viewer: b } = defineInMemoryTransportPair();
    const aStates: string[] = [];
    a.on("state", (s) => aStates.push(s));
    await a.connect();
    await a.connect();
    await b.connect();
    expect(aStates).toEqual(["connected"]);
  });
});
