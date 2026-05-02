import { describe, expect, it } from "vitest";
import { defineSignalingEngine } from "@/engine.ts";
import { SignalingPermissionError } from "@/errors.ts";
import type { SignalingMessageType } from "@/messages.ts";

const join = (
  peer: string,
  role: "publisher" | "viewer" | "presence" | "director" = "presence",
) => JSON.stringify({ type: "join", room: "demo", peer, role });

const mute = (target: string, kind: "audio" | "video" = "audio") =>
  JSON.stringify({ type: "mute", target, kind });

const unmute = (target: string, kind: "audio" | "video" = "audio") =>
  JSON.stringify({ type: "unmute", target, kind });

const kick = (target: string, reason?: string) =>
  JSON.stringify({ type: "kick", target, ...(reason ? { reason } : {}) });

const setBitrate = (target: string, bitsPerSec: number) =>
  JSON.stringify({ type: "set-bitrate", target, bitsPerSec });

async function withDirectorAndPeer(opts?: { enforce?: boolean }) {
  const session = defineSignalingEngine({
    enforceModerationCommands: opts?.enforce ?? false,
  }).openSession();
  const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
  session.onSend((peerId, msg) => {
    sent.push({ peerId, msg });
  });
  await session.handleConnection("sa", {});
  await session.handleConnection("sb", {});
  await session.handleMessage("sa", join("alice", "director"));
  await session.handleMessage("sb", join("bob", "publisher"));
  return { session, sent };
}

describe("Session — mute / unmute (EPIC-12)", () => {
  it("relays mute to the target and broadcasts presence-state to all members", async () => {
    const { session, sent } = await withDirectorAndPeer();
    sent.length = 0;
    await session.handleMessage("sa", mute("bob", "audio"));

    expect(
      sent.find(
        (s) => s.peerId === "bob" && s.msg.type === "mute" && s.msg.kind === "audio",
      ),
    ).toBeDefined();
    const presenceUpdates = sent.filter((s) => s.msg.type === "presence-state");
    expect(presenceUpdates.length).toBeGreaterThan(0);
    const peerIds = new Set(presenceUpdates.map((s) => s.peerId));
    expect(peerIds.has("alice")).toBe(true);
    expect(peerIds.has("bob")).toBe(true);
    const sample = presenceUpdates[0]?.msg as Extract<
      SignalingMessageType,
      { type: "presence-state" }
    >;
    expect(sample.peer).toBe("bob");
    expect(sample.attributes).toMatchObject({ "director-muted-audio": true });
  });

  it("unmute clears the presence flag", async () => {
    const { session, sent } = await withDirectorAndPeer();
    await session.handleMessage("sa", mute("bob", "audio"));
    sent.length = 0;
    await session.handleMessage("sa", unmute("bob", "audio"));

    const presenceUpdate = sent.find((s) => s.msg.type === "presence-state");
    const payload = presenceUpdate!.msg as Extract<
      SignalingMessageType,
      { type: "presence-state" }
    >;
    // Cleared attribute → key is absent from the broadcast payload.
    expect(payload.attributes["director-muted-audio"]).toBeUndefined();
  });

  it("with enforcement on, a non-director's mute is rejected", async () => {
    const { session } = await withDirectorAndPeer({ enforce: true });
    await session.handleConnection("sc", {});
    await session.handleMessage("sc", join("carol", "presence"));

    await expect(session.handleMessage("sc", mute("bob", "audio"))).rejects.toBeInstanceOf(
      SignalingPermissionError,
    );
  });
});

describe("Session — kick (EPIC-12)", () => {
  it("relays a `kicked` notification to the target then drops the peer", async () => {
    const { session, sent } = await withDirectorAndPeer({ enforce: true });
    sent.length = 0;

    await session.handleMessage("sa", kick("bob", "spam"));

    const notify = sent.find(
      (s) => s.peerId === "bob" && s.msg.type === "kicked" && s.msg.reason === "spam",
    );
    expect(notify).toBeDefined();

    const left = sent.find(
      (s) =>
        s.peerId === "alice" &&
        s.msg.type === "peer-left" &&
        (s.msg as Extract<SignalingMessageType, { type: "peer-left" }>).peer === "bob",
    );
    expect(left).toBeDefined();

    const room = session.rooms()[0];
    expect(room?.peers.find((p) => p.peerId === "bob")).toBeUndefined();
  });

  it("with enforcement off, kick is relayed but the engine does NOT drop the peer", async () => {
    const { session, sent } = await withDirectorAndPeer({ enforce: false });
    sent.length = 0;

    await session.handleMessage("sa", kick("bob"));

    expect(sent.find((s) => s.peerId === "bob" && s.msg.type === "kicked")).toBeDefined();
    const room = session.rooms()[0];
    expect(room?.peers.find((p) => p.peerId === "bob")).toBeDefined();
  });
});

describe("Session — set-bitrate (EPIC-12)", () => {
  it("relays the bitrate hint to the target", async () => {
    const { session, sent } = await withDirectorAndPeer();
    sent.length = 0;
    await session.handleMessage("sa", setBitrate("bob", 1_500_000));

    const relayed = sent.find((s) => s.peerId === "bob" && s.msg.type === "set-bitrate");
    expect(relayed).toBeDefined();
  });

  it("with enforcement on, a non-director's set-bitrate is rejected", async () => {
    const { session } = await withDirectorAndPeer({ enforce: true });
    await session.handleConnection("sc", {});
    await session.handleMessage("sc", join("carol", "presence"));

    await expect(
      session.handleMessage("sc", setBitrate("bob", 500_000)),
    ).rejects.toBeInstanceOf(SignalingPermissionError);
  });
});
