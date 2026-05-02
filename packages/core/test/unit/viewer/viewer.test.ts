import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineViewer, Viewer } from "@/viewer/viewer.ts";
import { createFakePeerConnection } from "../../_mocks/fake-pc.ts";
import { createInMemoryTransportPair } from "../../_mocks/in-memory-signaling.ts";

describe("Viewer (skeleton)", () => {
  it("factory returns a Viewer", () => {
    const { publisher: signaling } = createInMemoryTransportPair();
    const v = defineViewer({ signaling, room: "demo", publisherId: "alice" });
    expect(v).toBeInstanceOf(Viewer);
  });

  it("starts in idle state with null stream", () => {
    const { publisher: signaling } = createInMemoryTransportPair();
    const v = defineViewer({ signaling, room: "demo", publisherId: "alice" });
    expect(v.state).toBe("idle");
    expect(v.stream).toBeNull();
  });

  it("auto-generates a peerId when not provided", () => {
    const { publisher: signaling } = createInMemoryTransportPair();
    const v = defineViewer({ signaling, room: "demo", publisherId: "alice" });
    expect(v.peerId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("uses an explicit peerId when provided", () => {
    const { publisher: signaling } = createInMemoryTransportPair();
    const v = defineViewer({
      signaling,
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
    });
    expect(v.peerId).toBe("bob");
  });

  it("start() transitions to connecting and sends a viewer join", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const inbound: unknown[] = [];
    pubSig.on("message", (m) => inbound.push(m));

    const v = defineViewer({
      signaling: viewerSig,
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
    });
    await v.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(v.state).toBe("connecting"); // not connected yet — needs PC + track
    expect(inbound).toContainEqual({
      type: "join",
      room: "demo",
      peer: "bob",
      role: "viewer",
    });
  });

  it("stop() reaches closed", async () => {
    const { publisher: signaling } = createInMemoryTransportPair();
    const v = defineViewer({
      signaling,
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
    });
    await v.start();
    await v.stop();
    expect(v.state).toBe("closed");
  });
});

describe("Viewer — peer-joined → PC + SDP/ICE", () => {
  // helper: deliver a message to viewer (we are sending FROM the publisher side)
  const sendFromPublisher = async (
    pubSig: ReturnType<typeof createInMemoryTransportPair>["publisher"],
    msg: Parameters<typeof pubSig.send>[0],
  ): Promise<void> => {
    await pubSig.send(msg);
    await Promise.resolve();
    await Promise.resolve();
  };

  it("builds a PC and waits for offer when publisher joins", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();

    const v = defineViewer({
      signaling: viewerSig,
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      pcFactory: () => fakePc,
    });
    await v.start();
    await sendFromPublisher(pubSig, {
      type: "peer-joined",
      peer: "alice",
      role: "publisher",
    });

    // PC was constructed (proxied via addEventListener registrations from PeerConnection wrapper).
    expect(fakePc.addEventListener).toHaveBeenCalled();
    await v.stop();
  });

  it("ignores publisher joins for other publisherIds", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();
    const pcFactory = vi.fn(() => fakePc);

    const v = defineViewer({
      signaling: viewerSig,
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      pcFactory,
    });
    await v.start();
    await sendFromPublisher(pubSig, {
      type: "peer-joined",
      peer: "carol", // different publisher
      role: "publisher",
    });

    expect(pcFactory).not.toHaveBeenCalled();
    await v.stop();
  });

  it("handles inbound SDP offer (from publisher) → setRemoteDescription + sends answer", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();
    const inbound: unknown[] = [];
    pubSig.on("message", (m) => inbound.push(m));

    const v = defineViewer({
      signaling: viewerSig,
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      pcFactory: () => fakePc,
    });
    await v.start();
    await sendFromPublisher(pubSig, {
      type: "peer-joined",
      peer: "alice",
      role: "publisher",
    });

    // Drain join message buffer.
    await Promise.resolve();
    await Promise.resolve();
    inbound.length = 0;

    await sendFromPublisher(pubSig, {
      type: "sdp",
      from: "alice",
      to: "bob",
      sdp: { type: "offer", sdp: "v=0...offer" },
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(fakePc.setRemoteDescription).toHaveBeenCalledWith({
      type: "offer",
      sdp: "v=0...offer",
    });
    expect(inbound).toContainEqual({
      type: "sdp",
      from: "bob",
      to: "alice",
      sdp: { type: "answer", sdp: "v=0...answer" },
    });
    await v.stop();
  });

  it("forwards inbound ICE candidates from publisher to PC", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();

    const v = defineViewer({
      signaling: viewerSig,
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      pcFactory: () => fakePc,
    });
    await v.start();
    await sendFromPublisher(pubSig, {
      type: "peer-joined",
      peer: "alice",
      role: "publisher",
    });

    const candidate = { candidate: "candidate:1 1 udp ...", sdpMid: "0" };
    await sendFromPublisher(pubSig, {
      type: "ice",
      from: "alice",
      to: "bob",
      candidate,
    });

    expect(fakePc.addIceCandidate).toHaveBeenCalledWith(candidate);
    await v.stop();
  });

  it("ignores SDP/ICE from other peers (defensive drop)", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();

    const v = defineViewer({
      signaling: viewerSig,
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      pcFactory: () => fakePc,
    });
    await v.start();
    await sendFromPublisher(pubSig, {
      type: "peer-joined",
      peer: "alice",
      role: "publisher",
    });

    await sendFromPublisher(pubSig, {
      type: "sdp",
      from: "ghost",
      to: "bob",
      sdp: { type: "offer", sdp: "v=0..." },
    });

    expect(fakePc.setRemoteDescription).not.toHaveBeenCalled();
    await v.stop();
  });
});

describe("Viewer — track event + connected gating", () => {
  it("emits track event and exposes stream when PC fires track", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();

    const v = defineViewer({
      signaling: viewerSig,
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      pcFactory: () => fakePc,
    });
    const onTrack = vi.fn();
    v.on("track", onTrack);

    await v.start();
    await pubSig.send({
      type: "peer-joined",
      peer: "alice",
      role: "publisher",
    });
    await Promise.resolve();
    await Promise.resolve();

    const stream = {} as MediaStream;
    fakePc.__fire("track", {
      track: { kind: "video" } as MediaStreamTrack,
      streams: [stream],
    } as unknown as Event);

    expect(onTrack).toHaveBeenCalledWith({ stream });
    expect(v.stream).toBe(stream);
    await v.stop();
  });

  it("only transitions to connected when signaling+PC+track all ready", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();

    const v = defineViewer({
      signaling: viewerSig,
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      pcFactory: () => fakePc,
    });
    await v.start();
    expect(v.state).toBe("connecting"); // signaling connected but no PC + track yet

    await pubSig.send({
      type: "peer-joined",
      peer: "alice",
      role: "publisher",
    });
    await Promise.resolve();
    await Promise.resolve();

    fakePc.__setState({ connectionState: "connected" });
    fakePc.__fire("connectionstatechange");
    expect(v.state).toBe("connecting"); // PC connected but no track yet

    fakePc.__fire("track", {
      track: { kind: "video" } as MediaStreamTrack,
      streams: [{} as MediaStream],
    } as unknown as Event);
    expect(v.state).toBe("connected");
    await v.stop();
  });
});

describe("Viewer — stats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits stats event on each polling tick", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();
    fakePc.__setState({ connectionState: "connected", iceConnectionState: "connected" });

    const v = defineViewer({
      signaling: viewerSig,
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      pcFactory: () => fakePc,
      stats: { interval: 500 },
    });
    const onStats = vi.fn();
    v.on("stats", onStats);

    await v.start();
    await pubSig.send({
      type: "peer-joined",
      peer: "alice",
      role: "publisher",
    });
    await Promise.resolve();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(1100);
    expect(onStats).toHaveBeenCalled();
    expect(onStats.mock.calls[0]?.[0]?.peerId).toBe("alice");
    await v.stop();
  });

  it("getStats() works without a stats interval configured", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();
    fakePc.__setState({ connectionState: "connected", iceConnectionState: "connected" });

    const v = defineViewer({
      signaling: viewerSig,
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      pcFactory: () => fakePc,
    });
    await v.start();
    await pubSig.send({
      type: "peer-joined",
      peer: "alice",
      role: "publisher",
    });
    await Promise.resolve();
    await Promise.resolve();

    const stats = await v.getStats();
    expect(stats.peerId).toBe("alice");
    await v.stop();
  });
});
