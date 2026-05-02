import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigurationError } from "@/errors/errors.ts";
import { definePublisher, Publisher } from "@/publisher/publisher.ts";
import { createFakePeerConnection } from "../../_mocks/fake-pc.ts";
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

describe("Publisher — per-viewer PC management", () => {
  // Helper: simulate a viewer's peer-joined arrival via the paired transport.
  const simulateViewerJoin = async (
    pubSig: ReturnType<typeof createInMemoryTransportPair>["publisher"],
    viewerSig: ReturnType<typeof createInMemoryTransportPair>["viewer"],
    viewerPeerId: string,
  ): Promise<void> => {
    void pubSig; // pubSig is the side the publisher reads from; we send via viewerSig
    await viewerSig.send({
      type: "peer-joined",
      peer: viewerPeerId,
      role: "viewer",
    });
    // flush microtasks
    await Promise.resolve();
    await Promise.resolve();
  };

  it("emits viewer event when peer-joined arrives", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();
    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => fakePc,
    });
    const onViewer = vi.fn();
    p.on("viewer", onViewer);

    await p.start();
    await simulateViewerJoin(pubSig, viewerSig, "bob");

    expect(onViewer).toHaveBeenCalledWith({ peerId: "bob" });
    expect(p.peers()).toContain("bob");
    await p.stop();
  });

  it("adds local stream tracks to the per-viewer RTCPeerConnection", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();
    const stream = fakeMediaStream();

    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream,
      pcFactory: () => fakePc,
    });
    await p.start();
    await simulateViewerJoin(pubSig, viewerSig, "bob");

    const tracks = stream.getTracks();
    expect(fakePc.addTrack).toHaveBeenCalledTimes(tracks.length);
    for (const track of tracks) {
      expect(fakePc.addTrack).toHaveBeenCalledWith(track, stream);
    }
    await p.stop();
  });

  it("kicks off a negotiation by sending an SDP offer to the new viewer", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();
    const inbound: unknown[] = [];
    viewerSig.on("message", (m) => inbound.push(m));

    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => fakePc,
    });
    await p.start();
    await simulateViewerJoin(pubSig, viewerSig, "bob");
    // negotiator.makeOffer is async; flush
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(inbound).toContainEqual({
      type: "sdp",
      from: "alice",
      to: "bob",
      sdp: { type: "offer", sdp: "v=0...offer" },
    });
    await p.stop();
  });

  it("uses the configured iceServers when constructing per-viewer PCs", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();
    const pcFactory = vi.fn(() => fakePc);

    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      pcFactory,
    });
    await p.start();
    await simulateViewerJoin(pubSig, viewerSig, "bob");

    expect(pcFactory).toHaveBeenCalledWith({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    await p.stop();
  });

  it("tears down the per-viewer PC and emits viewer-left on peer-left", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();
    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => fakePc,
    });
    const onLeft = vi.fn();
    p.on("viewer-left", onLeft);

    await p.start();
    await simulateViewerJoin(pubSig, viewerSig, "bob");
    expect(p.peers()).toContain("bob");

    await viewerSig.send({ type: "peer-left", peer: "bob" });
    await Promise.resolve();
    await Promise.resolve();

    expect(fakePc.close).toHaveBeenCalled();
    expect(onLeft).toHaveBeenCalledWith({ peerId: "bob" });
    expect(p.peers()).not.toContain("bob");
    await p.stop();
  });

  it("routes inbound SDP answer to the matching viewer's negotiator", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();
    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => fakePc,
    });
    await p.start();
    await simulateViewerJoin(pubSig, viewerSig, "bob");

    // Drain the offer that was emitted on viewer-joined.
    await Promise.resolve();
    await Promise.resolve();
    const setRemoteCalls = vi.mocked(fakePc.setRemoteDescription).mock.calls.length;

    // Simulate viewer answering.
    await viewerSig.send({
      type: "sdp",
      from: "bob",
      to: "alice",
      sdp: { type: "answer", sdp: "v=0...answer-from-bob" },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(vi.mocked(fakePc.setRemoteDescription).mock.calls.length).toBeGreaterThan(
      setRemoteCalls,
    );
    expect(fakePc.setRemoteDescription).toHaveBeenLastCalledWith({
      type: "answer",
      sdp: "v=0...answer-from-bob",
    });
    await p.stop();
  });

  it("routes inbound ICE candidate to the matching viewer's PC", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();
    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => fakePc,
    });
    await p.start();
    await simulateViewerJoin(pubSig, viewerSig, "bob");
    await Promise.resolve();
    await Promise.resolve();

    const candidate = { candidate: "candidate:1 1 udp ...", sdpMid: "0" };
    await viewerSig.send({
      type: "ice",
      from: "bob",
      to: "alice",
      candidate,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(fakePc.addIceCandidate).toHaveBeenCalledWith(candidate);
    await p.stop();
  });

  it("ignores SDP from an unknown peer (defensive drop)", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();
    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => fakePc,
    });
    await p.start();

    await viewerSig.send({
      type: "sdp",
      from: "ghost",
      to: "alice",
      sdp: { type: "answer", sdp: "v=0..." },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(fakePc.setRemoteDescription).not.toHaveBeenCalled();
    await p.stop();
  });

  it("supports multiple simultaneous viewers", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const pcs = [createFakePeerConnection(), createFakePeerConnection()];
    let i = 0;
    const pcFactory = vi.fn(() => pcs[i++] ?? createFakePeerConnection());

    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory,
    });
    await p.start();
    await simulateViewerJoin(pubSig, viewerSig, "bob");
    await simulateViewerJoin(pubSig, viewerSig, "carol");

    expect([...p.peers()].sort()).toEqual(["bob", "carol"]);
    expect(pcFactory).toHaveBeenCalledTimes(2);
    await p.stop();
  });
});

describe("Publisher — stats + track replacers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const simulateViewerJoin = async (
    viewerSig: ReturnType<typeof createInMemoryTransportPair>["viewer"],
    viewerPeerId: string,
  ): Promise<void> => {
    await viewerSig.send({ type: "peer-joined", peer: viewerPeerId, role: "viewer" });
    await Promise.resolve();
    await Promise.resolve();
  };

  it("emits stats event on each polling tick when stats: { interval } provided", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();
    fakePc.__setState({ connectionState: "connected", iceConnectionState: "connected" });

    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => fakePc,
      stats: { interval: 1000 },
    });
    const onStats = vi.fn();
    p.on("stats", onStats);

    await p.start();
    await simulateViewerJoin(viewerSig, "bob");

    await vi.advanceTimersByTimeAsync(2500);
    expect(onStats).toHaveBeenCalled();
    const lastCall = onStats.mock.calls[onStats.mock.calls.length - 1]?.[0];
    expect(Array.isArray(lastCall)).toBe(true);
    expect(lastCall).toHaveLength(1);
    expect(lastCall[0].peerId).toBe("bob");

    await p.stop();
  });

  it("getStats() returns one entry per viewer (one-shot, no interval needed)", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const pc1 = createFakePeerConnection();
    const pc2 = createFakePeerConnection();
    pc1.__setState({ connectionState: "connected", iceConnectionState: "connected" });
    pc2.__setState({ connectionState: "connected", iceConnectionState: "connected" });
    let i = 0;
    const pcs = [pc1, pc2];

    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => pcs[i++] ?? createFakePeerConnection(),
      stats: { interval: 5000 }, // long interval; getStats() bypasses
    });
    await p.start();
    await simulateViewerJoin(viewerSig, "bob");
    await simulateViewerJoin(viewerSig, "carol");

    const stats = await p.getStats();
    expect(stats).toHaveLength(2);
    const ids = stats.map((s) => s.peerId).sort();
    expect(ids).toEqual(["bob", "carol"]);

    await p.stop();
  });

  it("getStats() returns empty array when stats not configured", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const fakePc = createFakePeerConnection();

    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => fakePc,
    });
    await p.start();
    await simulateViewerJoin(viewerSig, "bob");

    expect(await p.getStats()).toEqual([]);
    await p.stop();
  });

  it("replaceVideoTrack swaps on every viewer's PC", async () => {
    const { publisher: pubSig, viewer: viewerSig } = createInMemoryTransportPair();
    const senders = [
      { track: { kind: "video" } as MediaStreamTrack, replaceTrack: vi.fn(async () => undefined) },
      { track: { kind: "audio" } as MediaStreamTrack, replaceTrack: vi.fn(async () => undefined) },
    ] as unknown as RTCRtpSender[];
    const fakePc = createFakePeerConnection();
    vi.mocked(fakePc.getSenders).mockReturnValue(senders);

    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => fakePc,
    });
    await p.start();
    await simulateViewerJoin(viewerSig, "bob");

    const newTrack = { kind: "video" } as MediaStreamTrack;
    await p.replaceVideoTrack(newTrack);
    expect(senders[0]?.replaceTrack).toHaveBeenCalledWith(newTrack);

    await p.stop();
  });

  it("replaceVideoTrack throws ConfigurationError when no viewers connected", async () => {
    const { publisher: pubSig } = createInMemoryTransportPair();
    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => createFakePeerConnection(),
    });
    await p.start();
    await expect(p.replaceVideoTrack({ kind: "video" } as MediaStreamTrack)).rejects.toBeInstanceOf(
      ConfigurationError,
    );
    await p.stop();
  });

  it("replaceAudioTrack throws ConfigurationError when no viewers connected", async () => {
    const { publisher: pubSig } = createInMemoryTransportPair();
    const p = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => createFakePeerConnection(),
    });
    await p.start();
    await expect(p.replaceAudioTrack({ kind: "audio" } as MediaStreamTrack)).rejects.toBeInstanceOf(
      ConfigurationError,
    );
    await p.stop();
  });
});
