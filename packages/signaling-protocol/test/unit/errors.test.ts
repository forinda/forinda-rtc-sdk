import { describe, expect, it } from "vitest";
import {
  PeerNotFoundError,
  RoomFullError,
  SignalingAuthError,
  SignalingProtocolError,
  SignalingValidationError,
} from "@/errors.ts";

describe("SignalingProtocolError hierarchy", () => {
  it("SignalingProtocolError carries code, cause, context", () => {
    const cause = new Error("underlying");
    const err = new SignalingProtocolError("boom", {
      code: "protocol_error",
      cause,
      context: { room: "r" },
    });
    expect(err.message).toBe("boom");
    expect(err.code).toBe("protocol_error");
    expect(err.cause).toBe(cause);
    expect(err.context).toEqual({ room: "r" });
    expect(err.name).toBe("SignalingProtocolError");
    expect(err).toBeInstanceOf(Error);
  });

  it("SignalingValidationError has stable code", () => {
    const err = new SignalingValidationError("bad message", { context: { raw: "{}" } });
    expect(err.code).toBe("signaling_validation");
    expect(err).toBeInstanceOf(SignalingProtocolError);
  });

  it("SignalingAuthError has stable code", () => {
    const err = new SignalingAuthError("rejected", { context: { peer: "alice" } });
    expect(err.code).toBe("signaling_auth");
    expect(err).toBeInstanceOf(SignalingProtocolError);
  });

  it("RoomFullError has stable code and exposes capacity", () => {
    const err = new RoomFullError("room demo full", {
      context: { room: "demo", capacity: 50 },
    });
    expect(err.code).toBe("room_full");
    expect(err).toBeInstanceOf(SignalingProtocolError);
  });

  it("PeerNotFoundError has stable code and exposes peerId", () => {
    const err = new PeerNotFoundError("peer alice not in room", {
      context: { peer: "alice", room: "demo" },
    });
    expect(err.code).toBe("peer_not_found");
    expect(err).toBeInstanceOf(SignalingProtocolError);
  });

  it("all subclasses survive instanceof through transpilation", () => {
    const e1 = new RoomFullError("x", { context: { room: "r", capacity: 1 } });
    expect(e1 instanceof RoomFullError).toBe(true);
    expect(e1 instanceof SignalingProtocolError).toBe(true);
    expect(e1 instanceof Error).toBe(true);
  });
});
