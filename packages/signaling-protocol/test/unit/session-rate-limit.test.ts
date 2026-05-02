import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignalingRateLimitError } from "@/errors.ts";
import { defineSignalingEngine } from "@/engine.ts";
import type { SignalingMessageType } from "@/messages.ts";

const join = (peer: string, role: "publisher" | "viewer" | "presence" = "presence") =>
  JSON.stringify({ type: "join", room: "demo", peer, role });

const chat = (from: string, body: string) =>
  JSON.stringify({ type: "chat", from, body, ts: 1, clientId: `c-${body}` });

const presenceUpdate = (peer: string, key: string, value: unknown) =>
  JSON.stringify({ type: "presence-update", peer, attributes: { [key]: value } });

describe("Session — chat rate limit (EPIC-22)", () => {
  let now = 0;
  beforeEach(() => {
    now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });
  afterEach(() => vi.restoreAllMocks());

  it("rejects chat once the per-peer bucket is empty", async () => {
    const engine = defineSignalingEngine({ rateLimit: { chatPerSec: 2 } });
    const session = engine.openSession();
    session.onSend(() => {});

    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice", "publisher"));

    await session.handleMessage("sa", chat("alice", "1"));
    await session.handleMessage("sa", chat("alice", "2"));
    await expect(session.handleMessage("sa", chat("alice", "3"))).rejects.toBeInstanceOf(
      SignalingRateLimitError,
    );
  });

  it("recovers after the refill window", async () => {
    const engine = defineSignalingEngine({ rateLimit: { chatPerSec: 1 } });
    const session = engine.openSession();
    session.onSend(() => {});
    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice", "publisher"));

    await session.handleMessage("sa", chat("alice", "ok"));
    await expect(session.handleMessage("sa", chat("alice", "fast"))).rejects.toBeInstanceOf(
      SignalingRateLimitError,
    );

    now = 1_500; // 1.5s later, refill puts a token back
    await session.handleMessage("sa", chat("alice", "post-refill"));
  });

  it("does NOT cross-charge presence and chat budgets", async () => {
    const engine = defineSignalingEngine({
      rateLimit: { chatPerSec: 1, presenceUpdatesPerSec: 1 },
    });
    const session = engine.openSession();
    session.onSend(() => {});
    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice", "publisher"));

    await session.handleMessage("sa", chat("alice", "1"));
    // chat bucket is empty…
    await expect(session.handleMessage("sa", chat("alice", "2"))).rejects.toBeInstanceOf(
      SignalingRateLimitError,
    );
    // …but presence bucket is untouched.
    await session.handleMessage("sa", presenceUpdate("alice", "k", "v"));
  });

  it("no rate limit when option is omitted (default behavior preserved)", async () => {
    const engine = defineSignalingEngine();
    const session = engine.openSession();
    session.onSend(() => {});
    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice", "publisher"));

    for (let i = 0; i < 50; i++) {
      await session.handleMessage("sa", chat("alice", `${i}`));
    }
  });
});

describe("Session — presence rate limit (EPIC-22)", () => {
  let now = 0;
  beforeEach(() => {
    now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });
  afterEach(() => vi.restoreAllMocks());

  it("rejects presence-update once the bucket is empty", async () => {
    const engine = defineSignalingEngine({ rateLimit: { presenceUpdatesPerSec: 2 } });
    const session = engine.openSession();
    session.onSend(() => {});
    await session.handleConnection("sa", {});
    await session.handleMessage("sa", join("alice", "presence"));

    await session.handleMessage("sa", presenceUpdate("alice", "k", "v1"));
    await session.handleMessage("sa", presenceUpdate("alice", "k", "v2"));
    await expect(
      session.handleMessage("sa", presenceUpdate("alice", "k", "v3")),
    ).rejects.toBeInstanceOf(SignalingRateLimitError);
  });
});

// Silence unused import warnings for SignalingMessageType (kept for future tests).
void (null as SignalingMessageType | null);
