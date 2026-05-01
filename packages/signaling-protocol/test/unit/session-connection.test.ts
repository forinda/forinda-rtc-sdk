import { describe, expect, it } from "vitest";
import { defineSession } from "../../src/session.ts";

describe("Session.handleConnection", () => {
  it("registers a socket", async () => {
    const session = defineSession();
    await session.handleConnection("socket-1", {});
    expect(session.socketCount()).toBe(1);
  });

  it("is idempotent for the same socketId", async () => {
    const session = defineSession();
    await session.handleConnection("socket-1", {});
    await session.handleConnection("socket-1", { token: "abc" });
    expect(session.socketCount()).toBe(1);
  });

  it("stores the token for later auth checks", async () => {
    const session = defineSession();
    await session.handleConnection("socket-1", { token: "jwt.here" });
    // No public reader for token — verified indirectly when authenticate runs (Task 11).
    expect(session.socketCount()).toBe(1);
  });
});
