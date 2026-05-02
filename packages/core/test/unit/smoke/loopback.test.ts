import { describe, expect, it, vi } from "vitest";
import { definePublisher, defineViewer } from "@/index.ts";
import { defineFakePeerConnection } from "@forinda/test-helpers";
import { defineInMemoryTransportPair } from "@forinda/test-helpers";
import { fakeMediaStream } from "../../_mocks/fake-media-devices.ts";

describe("public surface — publisher ↔ viewer loopback", () => {
  it("end-to-end: viewer joins, publisher sees viewer event, viewer sees track event", async () => {
    const { publisher: pubSig, viewer: viewerSig } = defineInMemoryTransportPair();

    // Two distinct fake PCs — publisher's view, viewer's view.
    const pubPc = defineFakePeerConnection();
    const viewerPc = defineFakePeerConnection();

    // Build paired stream so the viewer's track event fires in tandem with
    // negotiation completion.
    const remoteStream = {} as MediaStream;

    const pub = definePublisher({
      signaling: pubSig,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => pubPc,
    });
    const viewer = defineViewer({
      signaling: viewerSig,
      room: "demo",
      peerId: "bob",
      publisherId: "alice",
      pcFactory: () => viewerPc,
    });

    const onPubViewer = vi.fn();
    pub.on("viewer", onPubViewer);
    const onViewerTrack = vi.fn();
    viewer.on("track", onViewerTrack);

    // Wire signaling: publisher sees inbound peer-joined when viewer joins
    // (we rely on the in-memory transport for this).
    await pub.start();

    // The viewer's join → no peer-joined emitted automatically by the
    // in-memory transport (it doesn't simulate a server). For the smoke
    // test we manually inject the peer-joined notifications that a real
    // server would broadcast.
    await viewer.start();

    // Manually broadcast peer-joined notifications via the transport
    // (simulates a real server broadcasting room state).
    await viewerSig.send({ type: "peer-joined", peer: "bob", role: "viewer" });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onPubViewer).toHaveBeenCalledWith({ peerId: "bob" });
    expect(pub.peers()).toContain("bob");

    // Tell the viewer about the publisher.
    await pubSig.send({ type: "peer-joined", peer: "alice", role: "publisher" });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Simulate the viewer's PC receiving an offer (via the SDP routing the
    // publisher already kicked off through pub.makeOffer → in-memory
    // transport delivery). The fake PC's createAnswer returns a canned
    // answer, so the viewer will reply automatically.

    // Once the viewer's PC fires `track`, the viewer should expose the stream.
    viewerPc.__fire("track", {
      track: { kind: "video" } as MediaStreamTrack,
      streams: [remoteStream],
    } as unknown as Event);

    expect(onViewerTrack).toHaveBeenCalledWith({ stream: remoteStream });
    expect(viewer.stream).toBe(remoteStream);

    await pub.stop();
    await viewer.stop();
    expect(pub.state).toBe("closed");
    expect(viewer.state).toBe("closed");
  });
});
