import { describe, expect, it, vi } from "vitest";
import { defineSignalingEngine } from "@/engine.ts";
import type { SignalingMessageType } from "@/messages.ts";

const join = (peer: string, opts: { replayHistory?: boolean } = {}) =>
  JSON.stringify({
    type: "join",
    room: "demo",
    peer,
    role: "presence" as const,
    ...(opts.replayHistory ? { replayHistory: true } : {}),
  });

const chat = (from: string, body: string) =>
  JSON.stringify({ type: "chat", from, body, ts: 1, clientId: `c-${body}` });

describe("Session — chat history (EPIC-22)", () => {
  it("replays history to a joiner that requested replayHistory", async () => {
    const engine = defineSignalingEngine({ chatHistoryPerRoom: 5 });
    const session = engine.openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice"));
    await session.handleMessage("sa", chat("alice", "first"));
    await session.handleMessage("sa", chat("alice", "second"));

    sent.length = 0;
    await session.handleConnection("sb", {});
    await session.handleMessage("sb", join("bob", { replayHistory: true }));

    const history = sent.find((s) => s.peerId === "bob" && s.msg.type === "chat-history");
    expect(history).toBeDefined();
    const payload = history!.msg as Extract<SignalingMessageType, { type: "chat-history" }>;
    expect(payload.room).toBe("demo");
    expect(payload.messages.map((m) => m.body)).toEqual(["first", "second"]);
  });

  it("does NOT send chat-history when the joiner omits replayHistory", async () => {
    const engine = defineSignalingEngine({ chatHistoryPerRoom: 5 });
    const session = engine.openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice"));
    await session.handleMessage("sa", chat("alice", "x"));

    sent.length = 0;
    await session.handleConnection("sb", {});
    await session.handleMessage("sb", join("bob")); // no replayHistory

    expect(sent.find((s) => s.msg.type === "chat-history")).toBeUndefined();
  });

  it("does NOT send chat-history when chatHistoryPerRoom is 0 even if joiner asks", async () => {
    const engine = defineSignalingEngine(); // chatHistoryPerRoom defaults to 0
    const session = engine.openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice"));
    await session.handleMessage("sa", chat("alice", "x"));

    sent.length = 0;
    await session.handleConnection("sb", {});
    await session.handleMessage("sb", join("bob", { replayHistory: true }));

    expect(sent.find((s) => s.msg.type === "chat-history")).toBeUndefined();
  });

  it("ring-buffers — only the last N messages survive", async () => {
    const engine = defineSignalingEngine({ chatHistoryPerRoom: 3 });
    const session = engine.openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice"));
    for (let i = 0; i < 10; i++) {
      await session.handleMessage("sa", chat("alice", `m${i}`));
    }

    sent.length = 0;
    await session.handleConnection("sb", {});
    await session.handleMessage("sb", join("bob", { replayHistory: true }));

    const history = sent.find((s) => s.msg.type === "chat-history");
    const payload = history!.msg as Extract<SignalingMessageType, { type: "chat-history" }>;
    expect(payload.messages.map((m) => m.body)).toEqual(["m7", "m8", "m9"]);
  });

  it("sends an empty chat-history when no messages have accumulated", async () => {
    const engine = defineSignalingEngine({ chatHistoryPerRoom: 5 });
    const session = engine.openSession();
    const sent: Array<{ peerId: string; msg: SignalingMessageType }> = [];
    session.onSend((peerId, msg) => {
      sent.push({ peerId, msg });
    });

    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice", { replayHistory: true }));

    const history = sent.find((s) => s.peerId === "alice" && s.msg.type === "chat-history");
    expect(history).toBeDefined();
    expect((history!.msg as { messages: unknown[] }).messages).toEqual([]);
  });
});

// Silence unused import warning during compilation transitions.
void vi.fn;
