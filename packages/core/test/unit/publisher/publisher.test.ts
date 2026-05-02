import { describe, expect, it, vi } from "vitest";
import { definePublisher, Publisher } from "@/publisher/publisher.ts";
import { createInMemoryTransportPair } from "../../_mocks/in-memory-signaling.ts";
import { fakeMediaStream } from "../../_mocks/fake-media-devices.ts";

describe("Publisher (skeleton)", () => {
  it("factory returns a Publisher", () => {
    const { publisher: signaling } = createInMemoryTransportPair();
    const p = definePublisher({
      signaling,
      room: "demo",
      stream: fakeMediaStream(),
    });
    expect(p).toBeInstanceOf(Publisher);
  });

  it("starts in idle state with empty peer list", () => {
    const { publisher: signaling } = createInMemoryTransportPair();
    const p = definePublisher({
      signaling,
      room: "demo",
      stream: fakeMediaStream(),
    });
    expect(p.state).toBe("idle");
    expect(p.peers()).toEqual([]);
  });

  it("auto-generates a peerId when not provided", () => {
    const { publisher: signaling } = createInMemoryTransportPair();
    const p = definePublisher({ signaling, room: "demo", stream: fakeMediaStream() });
    expect(p.peerId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("uses an explicit peerId when provided", () => {
    const { publisher: signaling } = createInMemoryTransportPair();
    const p = definePublisher({
      signaling,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
    });
    expect(p.peerId).toBe("alice");
  });

  it("start() transitions through connecting → connected and emits state events", async () => {
    const { publisher: signaling } = createInMemoryTransportPair();
    const p = definePublisher({
      signaling,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
    });
    const states: string[] = [];
    p.on("state", (s) => states.push(s));

    await p.start();

    expect(states).toContain("connecting");
    expect(states).toContain("connected");
    expect(p.state).toBe("connected");
  });

  it("start() sends a join message via the signaling transport", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const inbound: unknown[] = [];
    viewerSig.on("message", (m) => inbound.push(m));

    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
    });
    await p.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(inbound).toContainEqual({
      type: "join",
      room: "demo",
      peer: "alice",
      role: "publisher",
    });
  });

  it("stop() sends a leave and reaches closed", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const inbound: unknown[] = [];
    viewerSig.on("message", (m) => inbound.push(m));

    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
    });
    await p.start();
    await Promise.resolve();
    await p.stop();
    await Promise.resolve();

    expect(p.state).toBe("closed");
    expect(inbound).toContainEqual({ type: "leave", room: "demo", peer: "alice" });
  });

  it("stop() is idempotent", async () => {
    const { publisher: signaling } = createInMemoryTransportPair();
    const p = definePublisher({
      signaling,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
    });
    await p.start();
    await p.stop();
    await expect(p.stop()).resolves.toBeUndefined();
    expect(p.state).toBe("closed");
  });

  it("start() is idempotent (no-op when already started)", async () => {
    const { publisher: signaling } = createInMemoryTransportPair();
    const p = definePublisher({
      signaling,
      room: "demo",
      stream: fakeMediaStream(),
    });
    await p.start();
    const handler = vi.fn();
    p.on("state", handler);
    await p.start();
    expect(handler).not.toHaveBeenCalled();
  });
});
