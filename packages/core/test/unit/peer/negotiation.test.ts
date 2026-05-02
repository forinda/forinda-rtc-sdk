import { describe, expect, it, vi } from "vitest";
import { defineNegotiator, Negotiator } from "@/peer/negotiation.ts";
import { createFakePeerConnection } from "../../_mocks/fake-pc.ts";

describe("Negotiator", () => {
  it("factory returns a Negotiator", () => {
    const pc = createFakePeerConnection();
    const send = vi.fn();
    const n = defineNegotiator({
      pc,
      polite: true,
      localPeerId: "alice",
      remotePeerId: "bob",
      send,
    });
    expect(n).toBeInstanceOf(Negotiator);
  });

  it("makeOffer creates an offer, sets it as local, and sends an SDP message", async () => {
    const pc = createFakePeerConnection();
    const send = vi.fn();
    const n = defineNegotiator({
      pc,
      polite: false,
      localPeerId: "alice",
      remotePeerId: "bob",
      send,
    });

    await n.makeOffer();

    expect(pc.createOffer).toHaveBeenCalled();
    expect(pc.setLocalDescription).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({
      type: "sdp",
      from: "alice",
      to: "bob",
      sdp: { type: "offer", sdp: "v=0...offer" },
    });
  });

  it("handleSdp answer applies the remote description without responding", async () => {
    const pc = createFakePeerConnection();
    const send = vi.fn();
    const n = defineNegotiator({
      pc,
      polite: true,
      localPeerId: "alice",
      remotePeerId: "bob",
      send,
    });

    await n.handleSdp({ type: "answer", sdp: "v=0...answer" });

    expect(pc.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "v=0...answer",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("handleSdp offer applies the remote description, creates an answer, and sends it", async () => {
    const pc = createFakePeerConnection();
    pc.__setState({ signalingState: "stable" });
    const send = vi.fn();
    const n = defineNegotiator({
      pc,
      polite: true,
      localPeerId: "alice",
      remotePeerId: "bob",
      send,
    });

    await n.handleSdp({ type: "offer", sdp: "v=0...offer" });

    expect(pc.setRemoteDescription).toHaveBeenCalledWith({
      type: "offer",
      sdp: "v=0...offer",
    });
    expect(pc.createAnswer).toHaveBeenCalled();
    expect(pc.setLocalDescription).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({
      type: "sdp",
      from: "alice",
      to: "bob",
      sdp: { type: "answer", sdp: "v=0...answer" },
    });
  });

  it("handleIce forwards a candidate to the PC", async () => {
    const pc = createFakePeerConnection();
    const send = vi.fn();
    const n = defineNegotiator({
      pc,
      polite: true,
      localPeerId: "alice",
      remotePeerId: "bob",
      send,
    });

    const candidate = { candidate: "candidate:..." };
    await n.handleIce(candidate);
    expect(pc.addIceCandidate).toHaveBeenCalledWith(candidate);
  });

  it("handleIce(null) skips addIceCandidate (end-of-candidates marker)", async () => {
    const pc = createFakePeerConnection();
    const send = vi.fn();
    const n = defineNegotiator({
      pc,
      polite: true,
      localPeerId: "alice",
      remotePeerId: "bob",
      send,
    });
    await n.handleIce(null);
    expect(pc.addIceCandidate).not.toHaveBeenCalled();
  });

  it("polite peer accepts incoming offer on collision", async () => {
    const pc = createFakePeerConnection();
    pc.__setState({ signalingState: "have-local-offer" });
    const send = vi.fn();
    const n = defineNegotiator({
      pc,
      polite: true,
      localPeerId: "alice",
      remotePeerId: "bob",
      send,
    });

    await n.handleSdp({ type: "offer", sdp: "v=0...remote-offer" });
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({
      type: "offer",
      sdp: "v=0...remote-offer",
    });
  });

  it("impolite peer ignores incoming offer during collision", async () => {
    const pc = createFakePeerConnection();
    pc.__setState({ signalingState: "have-local-offer" });
    const send = vi.fn();
    const n = defineNegotiator({
      pc,
      polite: false,
      localPeerId: "alice",
      remotePeerId: "bob",
      send,
    });

    await n.handleSdp({ type: "offer", sdp: "v=0...remote-offer" });
    expect(pc.setRemoteDescription).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
