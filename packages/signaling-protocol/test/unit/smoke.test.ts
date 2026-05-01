import { describe, expect, it, vi } from "vitest";
import {
  defineSignalingEngine,
  PeerNotFoundError,
  RoomFullError,
  Session,
  SignalingAuthError,
  SignalingMessage,
  SignalingValidationError,
} from "@/index.ts";

describe("public surface — happy path", () => {
  it("full publish/view exchange runs end-to-end via the public surface", async () => {
    const engine = defineSignalingEngine({ maxPeersPerRoom: 4 });
    const session = engine.openSession();
    expect(session).toBeInstanceOf(Session);

    const sent: { peerId: string; message: unknown }[] = [];
    session.onSend((peerId, message) => {
      sent.push({ peerId, message });
    });

    await session.handleConnection("socket-alice", {});
    await session.handleMessage(
      "socket-alice",
      JSON.stringify({ type: "join", room: "demo", peer: "alice", role: "publisher" }),
    );

    await session.handleConnection("socket-bob", {});
    await session.handleMessage(
      "socket-bob",
      JSON.stringify({ type: "join", room: "demo", peer: "bob", role: "viewer" }),
    );

    await session.handleMessage(
      "socket-alice",
      JSON.stringify({
        type: "sdp",
        from: "alice",
        to: "bob",
        sdp: { type: "offer", sdp: "v=0..." },
      }),
    );

    const offer = sent.find(
      (s) =>
        s.peerId === "bob" &&
        typeof s.message === "object" &&
        s.message !== null &&
        (s.message as { type?: string }).type === "sdp",
    );
    expect(offer).toBeDefined();

    await session.handleDisconnect("socket-bob");
    expect(session.rooms()[0]?.peers.map((p) => p.peerId)).toEqual(["alice"]);
  });

  it("exposes all error classes and the wire-format schema", () => {
    expect(SignalingValidationError).toBeDefined();
    expect(SignalingAuthError).toBeDefined();
    expect(RoomFullError).toBeDefined();
    expect(PeerNotFoundError).toBeDefined();
    expect(SignalingMessage.parse).toBeDefined();
  });
});
