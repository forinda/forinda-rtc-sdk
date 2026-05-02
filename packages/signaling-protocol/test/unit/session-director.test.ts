import { describe, expect, it } from "vitest";
import { defineSignalingEngine } from "@/engine.ts";
import {
  SignalingDirectorConflictError,
  SignalingPermissionError,
} from "@/errors.ts";
import type { SignalingMessageType } from "@/messages.ts";

const join = (
  peer: string,
  role: "publisher" | "viewer" | "presence" | "director" = "presence",
) => JSON.stringify({ type: "join", room: "demo", peer, role });

const promote = (target: string) => JSON.stringify({ type: "promote", target });
const demote = (target: string) => JSON.stringify({ type: "demote", target });

describe("Session — director role (EPIC-12)", () => {
  it("first peer to join with role=director becomes director", async () => {
    const session = defineSignalingEngine().openSession();
    session.onSend(() => {});

    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice", "director"));

    const room = session.rooms()[0];
    expect(room?.peers.find((p) => p.peerId === "alice")?.role).toBe("director");
  });

  it("rejects a second director claim", async () => {
    const session = defineSignalingEngine().openSession();
    session.onSend(() => {});

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleMessage("sa", join("alice", "director"));

    await expect(session.handleMessage("sb", join("bob", "director"))).rejects.toBeInstanceOf(
      SignalingDirectorConflictError,
    );
  });

  it("releases the director slot when the director leaves", async () => {
    const session = defineSignalingEngine().openSession();
    session.onSend(() => {});

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleMessage("sa", join("alice", "director"));
    await session.handleDisconnect("sa");

    // Bob can now claim it.
    await session.handleMessage("sb", join("bob", "director"));
  });

  it("promote adds another peer to the director set (honor mode = always relayed)", async () => {
    const session = defineSignalingEngine().openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleMessage("sa", join("alice", "director"));
    await session.handleMessage("sb", join("bob", "presence"));

    sent.length = 0;
    await session.handleMessage("sa", promote("bob"));

    // Engine relays the promote to the target so bob's client knows.
    const relayed = sent.find((s) => s.peerId === "bob" && s.msg.type === "promote");
    expect(relayed).toBeDefined();
  });

  it("demote removes a peer from the director set", async () => {
    const session = defineSignalingEngine().openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleMessage("sa", join("alice", "director"));
    await session.handleMessage("sb", join("bob", "presence"));

    await session.handleMessage("sa", promote("bob"));
    sent.length = 0;
    await session.handleMessage("sa", demote("bob"));

    const relayed = sent.find((s) => s.peerId === "bob" && s.msg.type === "demote");
    expect(relayed).toBeDefined();
  });

  it("with enforcement on, a non-director's promote is rejected", async () => {
    const session = defineSignalingEngine({ enforceModerationCommands: true }).openSession();
    session.onSend(() => {});

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleConnection("sc", {});
    await session.handleMessage("sa", join("alice", "director"));
    await session.handleMessage("sb", join("bob", "presence"));
    await session.handleMessage("sc", join("carol", "presence"));

    await expect(session.handleMessage("sb", promote("carol"))).rejects.toBeInstanceOf(
      SignalingPermissionError,
    );
  });

  it("with enforcement off, a non-director's promote is relayed (honor mode)", async () => {
    const session = defineSignalingEngine().openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleConnection("sb", {});
    await session.handleConnection("sc", {});
    await session.handleMessage("sa", join("alice", "director"));
    await session.handleMessage("sb", join("bob", "presence"));
    await session.handleMessage("sc", join("carol", "presence"));

    sent.length = 0;
    await session.handleMessage("sb", promote("carol"));
    expect(sent.find((s) => s.peerId === "carol" && s.msg.type === "promote")).toBeDefined();
  });
});
