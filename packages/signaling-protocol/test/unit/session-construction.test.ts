import { describe, expect, it, vi } from "vitest";
import { defineSession } from "../../src/session.ts";

describe("Session — construction and onSend", () => {
  it("constructs with default options", () => {
    const session = defineSession();
    expect(session.socketCount()).toBe(0);
    expect(session.rooms()).toEqual([]);
  });

  it("accepts maxPeersPerRoom and authenticate options", () => {
    const session = defineSession({
      maxPeersPerRoom: 4,
      authenticate: async () => true,
    });
    expect(session.socketCount()).toBe(0);
  });

  it("onSend registers and returns an unsubscribe", () => {
    const session = defineSession();
    const handler = vi.fn();
    const off = session.onSend(handler);
    expect(typeof off).toBe("function");
    off();
    const off2 = session.onSend(handler);
    expect(typeof off2).toBe("function");
  });

  it("throws when more than one onSend is registered", () => {
    const session = defineSession();
    session.onSend(vi.fn());
    expect(() => session.onSend(vi.fn())).toThrow(/onSend/);
  });
});
