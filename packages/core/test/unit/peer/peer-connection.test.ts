import { afterEach, describe, expect, it, vi } from "vitest";
import { definePeerConnection, PeerConnection } from "@/peer/peer-connection.ts";
import { createFakePeerConnection } from "../../_mocks/fake-pc.ts";

const PC_FACTORY = vi.fn();

afterEach(() => {
  PC_FACTORY.mockReset();
});

describe("PeerConnection", () => {
  it("factory returns a PeerConnection", () => {
    const pc = createFakePeerConnection();
    PC_FACTORY.mockReturnValue(pc);
    const wrapped = definePeerConnection({
      iceServers: [],
      pcFactory: PC_FACTORY,
    });
    expect(wrapped).toBeInstanceOf(PeerConnection);
  });

  it("constructs a real RTCPeerConnection through the factory", () => {
    const pc = createFakePeerConnection();
    PC_FACTORY.mockReturnValue(pc);
    definePeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      pcFactory: PC_FACTORY,
    });
    expect(PC_FACTORY).toHaveBeenCalledWith({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
  });

  it("emits connectionstate when the underlying PC fires connectionstatechange", () => {
    const pc = createFakePeerConnection();
    PC_FACTORY.mockReturnValue(pc);
    const wrapped = definePeerConnection({ iceServers: [], pcFactory: PC_FACTORY });

    const handler = vi.fn();
    wrapped.on("connectionstate", handler);

    pc.__setState({ connectionState: "connected" });
    pc.__fire("connectionstatechange");

    expect(handler).toHaveBeenCalledWith("connected");
  });

  it("emits iceconnectionstate", () => {
    const pc = createFakePeerConnection();
    PC_FACTORY.mockReturnValue(pc);
    const wrapped = definePeerConnection({ iceServers: [], pcFactory: PC_FACTORY });

    const handler = vi.fn();
    wrapped.on("iceconnectionstate", handler);

    pc.__setState({ iceConnectionState: "checking" });
    pc.__fire("iceconnectionstatechange");

    expect(handler).toHaveBeenCalledWith("checking");
  });

  it("emits icecandidate with the candidate or null end-of-candidates", () => {
    const pc = createFakePeerConnection();
    PC_FACTORY.mockReturnValue(pc);
    const wrapped = definePeerConnection({ iceServers: [], pcFactory: PC_FACTORY });

    const handler = vi.fn();
    wrapped.on("icecandidate", handler);

    const candidate = { candidate: "candidate:..." } as RTCIceCandidate;
    pc.__fire("icecandidate", { candidate } as unknown as Event);
    expect(handler).toHaveBeenCalledWith(candidate);

    pc.__fire("icecandidate", { candidate: null } as unknown as Event);
    expect(handler).toHaveBeenCalledWith(null);
  });

  it("emits track when the PC fires a track event", () => {
    const pc = createFakePeerConnection();
    PC_FACTORY.mockReturnValue(pc);
    const wrapped = definePeerConnection({ iceServers: [], pcFactory: PC_FACTORY });

    const handler = vi.fn();
    wrapped.on("track", handler);

    const event = {
      track: { kind: "video" } as MediaStreamTrack,
      streams: [{} as MediaStream],
    };
    pc.__fire("track", event as unknown as Event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it("close calls the underlying RTCPeerConnection.close and removes listeners", () => {
    const pc = createFakePeerConnection();
    PC_FACTORY.mockReturnValue(pc);
    const wrapped = definePeerConnection({ iceServers: [], pcFactory: PC_FACTORY });

    const handler = vi.fn();
    wrapped.on("connectionstate", handler);

    wrapped.close();
    expect(pc.close).toHaveBeenCalled();

    pc.__setState({ connectionState: "failed" });
    pc.__fire("connectionstatechange");
    expect(handler).not.toHaveBeenCalled();
  });

  it("exposes the underlying RTCPeerConnection via .raw", () => {
    const pc = createFakePeerConnection();
    PC_FACTORY.mockReturnValue(pc);
    const wrapped = definePeerConnection({ iceServers: [], pcFactory: PC_FACTORY });
    expect(wrapped.raw).toBe(pc);
  });
});
