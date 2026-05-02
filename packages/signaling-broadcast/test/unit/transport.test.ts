import { describe, expect, it, vi } from "vitest";
import { BroadcastSignaling, defineBroadcastSignaling } from "@/transport.ts";

describe("BroadcastSignaling — construction + lifecycle", () => {
  it("factory returns a BroadcastSignaling", () => {
    const t = defineBroadcastSignaling({ channel: "test-1" });
    expect(t).toBeInstanceOf(BroadcastSignaling);
  });

  it("starts in idle state", () => {
    const t = defineBroadcastSignaling({ channel: "test-2" });
    expect(t.state).toBe("idle");
  });

  it("connect transitions to connecting then connected", async () => {
    const t = defineBroadcastSignaling({ channel: "test-3" });
    const states: string[] = [];
    t.on("state", (s) => states.push(s));

    await t.connect();
    expect(t.state).toBe("connected");
    expect(states).toEqual(["connecting", "connected"]);
    await t.disconnect();
  });

  it("disconnect reaches closed", async () => {
    const t = defineBroadcastSignaling({ channel: "test-4" });
    await t.connect();
    await t.disconnect();
    expect(t.state).toBe("closed");
  });

  it("connect is idempotent", async () => {
    const t = defineBroadcastSignaling({ channel: "test-5" });
    await t.connect();
    const handler = vi.fn();
    t.on("state", handler);
    await t.connect();
    expect(handler).not.toHaveBeenCalled();
    await t.disconnect();
  });

  it("disconnect is idempotent", async () => {
    const t = defineBroadcastSignaling({ channel: "test-6" });
    await t.connect();
    await t.disconnect();
    await expect(t.disconnect()).resolves.toBeUndefined();
  });
});

describe("BroadcastSignaling — send + receive", () => {
  it("two transports on the same channel exchange messages", async () => {
    const a = defineBroadcastSignaling({ channel: "exchange-1" });
    const b = defineBroadcastSignaling({ channel: "exchange-1" });
    await a.connect();
    await b.connect();

    const onB = vi.fn();
    b.on("message", onB);

    await a.send({ type: "join", room: "demo", peer: "alice", role: "publisher" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onB).toHaveBeenCalledWith({
      type: "join",
      room: "demo",
      peer: "alice",
      role: "publisher",
    });

    await a.disconnect();
    await b.disconnect();
  });

  it("transports on different channels do NOT see each other's messages", async () => {
    const a = defineBroadcastSignaling({ channel: "chan-a" });
    const b = defineBroadcastSignaling({ channel: "chan-b" });
    await a.connect();
    await b.connect();

    const onB = vi.fn();
    b.on("message", onB);

    await a.send({ type: "join", room: "demo", peer: "x", role: "viewer" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onB).not.toHaveBeenCalled();
    await a.disconnect();
    await b.disconnect();
  });

  it("send while not connected throws", async () => {
    const t = defineBroadcastSignaling({ channel: "no-conn" });
    await expect(t.send({ type: "join", room: "r", peer: "p", role: "publisher" })).rejects.toThrow(
      /not connected/,
    );
  });

  it("invalid inbound payloads are dropped (schema validation)", async () => {
    const a = defineBroadcastSignaling({ channel: "validate-1" });
    const b = defineBroadcastSignaling({ channel: "validate-1" });
    await a.connect();
    await b.connect();

    const onB = vi.fn();
    b.on("message", onB);

    // Send an invalid payload via a raw BroadcastChannel.
    const raw = new BroadcastChannel("validate-1");
    raw.postMessage({ type: "broadcast", payload: {} });
    raw.close();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onB).not.toHaveBeenCalled();
    await a.disconnect();
    await b.disconnect();
  });

  it("on-handler unsubscribe stops further deliveries", async () => {
    const a = defineBroadcastSignaling({ channel: "unsub-1" });
    const b = defineBroadcastSignaling({ channel: "unsub-1" });
    await a.connect();
    await b.connect();

    const onB = vi.fn();
    const off = b.on("message", onB);
    off();

    await a.send({ type: "leave", room: "r", peer: "p" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onB).not.toHaveBeenCalled();
    await a.disconnect();
    await b.disconnect();
  });
});
