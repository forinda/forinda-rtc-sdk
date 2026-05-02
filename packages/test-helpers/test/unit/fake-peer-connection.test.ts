import { describe, expect, it, vi } from "vitest";
import { defineFakePeerConnection } from "@/fake-peer-connection.ts";

describe("defineFakePeerConnection", () => {
  it("starts in default state", () => {
    const pc = defineFakePeerConnection();
    expect(pc.connectionState).toBe("new");
    expect(pc.iceConnectionState).toBe("new");
    expect(pc.signalingState).toBe("stable");
  });

  it("close() flips all states to 'closed'", () => {
    const pc = defineFakePeerConnection();
    pc.close();
    expect(pc.connectionState).toBe("closed");
    expect(pc.iceConnectionState).toBe("closed");
    expect(pc.signalingState).toBe("closed");
  });

  it("__setState patches individual fields", () => {
    const pc = defineFakePeerConnection();
    pc.__setState({ connectionState: "connecting" });
    expect(pc.connectionState).toBe("connecting");
    expect(pc.iceConnectionState).toBe("new");
  });

  it("addEventListener / __fire dispatches to all registered handlers", () => {
    const pc = defineFakePeerConnection();
    const a = vi.fn();
    const b = vi.fn();
    pc.addEventListener("connectionstatechange", a);
    pc.addEventListener("connectionstatechange", b);
    pc.__fire("connectionstatechange");
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("removeEventListener stops the handler from firing", () => {
    const pc = defineFakePeerConnection();
    const handler = vi.fn();
    pc.addEventListener("track", handler);
    pc.removeEventListener("track", handler);
    pc.__fire("track");
    expect(handler).not.toHaveBeenCalled();
  });

  it("__fire passes payload through as the event", () => {
    const pc = defineFakePeerConnection();
    const handler = vi.fn();
    pc.addEventListener("icecandidate", handler);
    const payload = { candidate: { candidate: "c=…" } };
    pc.__fire("icecandidate", payload);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it("createOffer / createAnswer return shaped descriptors", async () => {
    const pc = defineFakePeerConnection();
    const offer = await pc.createOffer();
    const answer = await pc.createAnswer();
    expect(offer.type).toBe("offer");
    expect(answer.type).toBe("answer");
  });

  it("getStats returns an empty RTCStatsReport-shaped Map", async () => {
    const pc = defineFakePeerConnection();
    const stats = await pc.getStats();
    expect(stats.size).toBe(0);
  });
});
