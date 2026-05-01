import { describe, expect, it, vi } from "vitest";
import { SignalingAuthError } from "../../src/errors.ts";
import { defineSession } from "../../src/session.ts";

const join = (room: string, peer: string, role: "publisher" | "viewer" = "publisher") =>
  JSON.stringify({ type: "join", room, peer, role });

describe("Session — authenticate", () => {
  it("passes the token and room to the authenticate callback", async () => {
    const authenticate = vi.fn(async () => true);
    const session = defineSession({ authenticate });
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", { token: "jwt.here" });
    await session.handleMessage("socket-1", join("demo", "alice"));

    expect(authenticate).toHaveBeenCalledWith("jwt.here", "demo");
  });

  it("passes undefined when no token was provided", async () => {
    const authenticate = vi.fn(async () => true);
    const session = defineSession({ authenticate });
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", {});
    await session.handleMessage("socket-1", join("demo", "alice"));

    expect(authenticate).toHaveBeenCalledWith(undefined, "demo");
  });

  it("rejects join with SignalingAuthError when callback returns false", async () => {
    const session = defineSession({ authenticate: async () => false });
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", { token: "bad" });
    await expect(session.handleMessage("socket-1", join("demo", "alice"))).rejects.toBeInstanceOf(
      SignalingAuthError,
    );
  });

  it("does not register the peer when auth fails", async () => {
    const session = defineSession({ authenticate: async () => false });
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", {});
    await session.handleMessage("socket-1", join("demo", "alice")).catch(() => {});

    expect(session.rooms()).toEqual([]);
  });

  it("supports synchronous boolean return from authenticate", async () => {
    const session = defineSession({ authenticate: () => true });
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", {});
    await session.handleMessage("socket-1", join("demo", "alice"));
    expect(session.rooms()).toHaveLength(1);
  });

  it("skips auth when no callback is configured", async () => {
    const session = defineSession();
    session.onSend(vi.fn());
    await session.handleConnection("socket-1", {});
    await session.handleMessage("socket-1", join("demo", "alice"));
    expect(session.rooms()).toHaveLength(1);
  });
});
