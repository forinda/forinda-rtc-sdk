import { describe, expect, it } from "vitest";
import {
  IceCand,
  JoinRoom,
  LeaveRoom,
  PeerJoined,
  PeerLeft,
  Sdp,
  SignalingMessage,
  type SignalingMessageType,
} from "../../src/messages.ts";

describe("wire format", () => {
  describe("JoinRoom", () => {
    it("parses a valid publisher join", () => {
      const result = JoinRoom.parse({
        type: "join",
        room: "demo-room",
        peer: "alice",
        role: "publisher",
      });
      expect(result.type).toBe("join");
      expect(result.role).toBe("publisher");
    });

    it("parses a valid viewer join", () => {
      const result = JoinRoom.parse({
        type: "join",
        room: "demo",
        peer: "bob",
        role: "viewer",
      });
      expect(result.role).toBe("viewer");
    });

    it("rejects unknown role", () => {
      expect(() =>
        JoinRoom.parse({ type: "join", room: "r", peer: "p", role: "spectator" }),
      ).toThrow();
    });

    it("rejects empty room id", () => {
      expect(() =>
        JoinRoom.parse({ type: "join", room: "", peer: "p", role: "publisher" }),
      ).toThrow();
    });

    it("rejects peer id over 128 chars", () => {
      const longPeer = "p".repeat(129);
      expect(() =>
        JoinRoom.parse({ type: "join", room: "r", peer: longPeer, role: "publisher" }),
      ).toThrow();
    });
  });

  describe("LeaveRoom", () => {
    it("parses a valid leave", () => {
      const result = LeaveRoom.parse({ type: "leave", room: "r", peer: "p" });
      expect(result.type).toBe("leave");
    });
  });

  describe("PeerJoined", () => {
    it("parses a valid peer-joined notification", () => {
      const result = PeerJoined.parse({ type: "peer-joined", peer: "p", role: "publisher" });
      expect(result.type).toBe("peer-joined");
    });
  });

  describe("PeerLeft", () => {
    it("parses a valid peer-left notification", () => {
      const result = PeerLeft.parse({ type: "peer-left", peer: "p" });
      expect(result.type).toBe("peer-left");
    });
  });

  describe("Sdp", () => {
    it("parses a valid offer", () => {
      const result = Sdp.parse({
        type: "sdp",
        from: "alice",
        to: "bob",
        sdp: { type: "offer", sdp: "v=0\r\n..." },
      });
      expect(result.sdp.type).toBe("offer");
    });

    it("parses a valid answer", () => {
      const result = Sdp.parse({
        type: "sdp",
        from: "bob",
        to: "alice",
        sdp: { type: "answer", sdp: "v=0\r\n..." },
      });
      expect(result.sdp.type).toBe("answer");
    });

    it("rejects unknown sdp type", () => {
      expect(() =>
        Sdp.parse({
          type: "sdp",
          from: "a",
          to: "b",
          sdp: { type: "rollback", sdp: "" },
        }),
      ).toThrow();
    });
  });

  describe("IceCand", () => {
    it("parses a candidate with object payload", () => {
      const result = IceCand.parse({
        type: "ice",
        from: "a",
        to: "b",
        candidate: { candidate: "candidate:...", sdpMid: "0", sdpMLineIndex: 0 },
      });
      expect(result.type).toBe("ice");
    });

    it("allows null candidate (end-of-candidates marker)", () => {
      const result = IceCand.parse({ type: "ice", from: "a", to: "b", candidate: null });
      expect(result.candidate).toBeNull();
    });
  });

  describe("SignalingMessage discriminated union", () => {
    it("routes join via discriminator", () => {
      const result = SignalingMessage.parse({
        type: "join",
        room: "r",
        peer: "p",
        role: "publisher",
      });
      expect(result.type).toBe("join");
    });

    it("rejects unknown type", () => {
      expect(() => SignalingMessage.parse({ type: "broadcast", payload: {} })).toThrow();
    });

    it("exports the union type alias", () => {
      const sample: SignalingMessageType = {
        type: "leave",
        room: "r",
        peer: "p",
      };
      expect(sample.type).toBe("leave");
    });
  });
});
