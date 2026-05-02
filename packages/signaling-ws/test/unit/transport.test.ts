import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineWebSocketSignaling, WebSocketSignaling } from "@/transport.ts";
import { createFakeWebSocketFactory } from "../_mocks/fake-websocket.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WebSocketSignaling — construction + lifecycle", () => {
  it("factory returns a WebSocketSignaling", () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
    });
    expect(t).toBeInstanceOf(WebSocketSignaling);
  });

  it("starts in idle state", () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
    });
    expect(t.state).toBe("idle");
  });

  it("connect transitions to connecting then connected on socket open", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
    });
    const states: string[] = [];
    t.on("state", (s) => states.push(s));

    await t.connect();
    expect(t.state).toBe("connecting");

    fixture.lastInstance().__open();
    expect(t.state).toBe("connected");
    expect(states).toEqual(["connecting", "connected"]);
  });

  it("disconnect closes ws and reaches closed", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
    });
    await t.connect();
    fixture.lastInstance().__open();

    await t.disconnect();
    expect(t.state).toBe("closed");
    expect(fixture.lastInstance().close).toHaveBeenCalledWith(1000, "client disconnect");
  });

  it("connect is idempotent (no-op when already connecting/connected)", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
    });
    await t.connect();
    expect(fixture.instances).toHaveLength(1);
    await t.connect();
    expect(fixture.instances).toHaveLength(1);
  });
});

describe("WebSocketSignaling — send + buffer", () => {
  it("send while connected writes to ws.send", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
    });
    await t.connect();
    fixture.lastInstance().__open();

    await t.send({ type: "join", room: "demo", peer: "alice", role: "publisher" });
    expect(fixture.lastInstance().send).toHaveBeenCalledWith(
      JSON.stringify({ type: "join", room: "demo", peer: "alice", role: "publisher" }),
    );
  });

  it("send before open is queued; flushed on open in order", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
    });
    await t.connect();

    await t.send({ type: "join", room: "r", peer: "p1", role: "publisher" });
    await t.send({ type: "leave", room: "r", peer: "p1" });

    expect(fixture.lastInstance().send).not.toHaveBeenCalled();

    fixture.lastInstance().__open();

    expect(fixture.lastInstance().send).toHaveBeenCalledTimes(2);
    expect(fixture.lastInstance().send).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ type: "join", room: "r", peer: "p1", role: "publisher" }),
    );
    expect(fixture.lastInstance().send).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({ type: "leave", room: "r", peer: "p1" }),
    );
  });
});

describe("WebSocketSignaling — inbound message validation", () => {
  it("delivers a valid message to handlers", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
    });
    const onMessage = vi.fn();
    t.on("message", onMessage);
    await t.connect();
    fixture.lastInstance().__open();

    fixture
      .lastInstance()
      .__message(JSON.stringify({ type: "peer-joined", peer: "bob", role: "viewer" }));

    expect(onMessage).toHaveBeenCalledWith({
      type: "peer-joined",
      peer: "bob",
      role: "viewer",
    });
  });

  it("drops malformed JSON without invoking handlers", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
    });
    const onMessage = vi.fn();
    t.on("message", onMessage);
    await t.connect();
    fixture.lastInstance().__open();

    fixture.lastInstance().__message("not json");

    expect(onMessage).not.toHaveBeenCalled();
  });

  it("drops schema-failing messages without invoking handlers", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
    });
    const onMessage = vi.fn();
    t.on("message", onMessage);
    await t.connect();
    fixture.lastInstance().__open();

    fixture.lastInstance().__message(JSON.stringify({ type: "broadcast" }));

    expect(onMessage).not.toHaveBeenCalled();
  });
});

describe("WebSocketSignaling — auto-reconnect", () => {
  it("reconnects after backoff on unexpected close", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
      backoff: { initialMs: 1000, jitter: 0 },
    });
    await t.connect();
    fixture.lastInstance().__open();
    expect(t.state).toBe("connected");

    fixture.lastInstance().__close(1006, "abnormal");
    expect(t.state).toBe("reconnecting");

    expect(fixture.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(fixture.instances).toHaveLength(2);

    fixture.lastInstance().__open();
    expect(t.state).toBe("connected");
  });

  it("reconnect: false transitions to closed on first drop", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
      reconnect: false,
    });
    await t.connect();
    fixture.lastInstance().__open();

    fixture.lastInstance().__close(1006, "abnormal");
    expect(t.state).toBe("closed");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fixture.instances).toHaveLength(1);
  });

  it("buffer survives reconnect — messages flush after reopen", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
      backoff: { initialMs: 100, jitter: 0 },
    });
    await t.connect();
    fixture.lastInstance().__open();

    // Drop, send while reconnecting, then complete reconnect.
    fixture.lastInstance().__close(1006);
    expect(t.state).toBe("reconnecting");
    await t.send({ type: "join", room: "r", peer: "p", role: "viewer" });

    await vi.advanceTimersByTimeAsync(150);
    expect(fixture.instances).toHaveLength(2);
    fixture.lastInstance().__open();

    expect(fixture.lastInstance().send).toHaveBeenCalledWith(
      JSON.stringify({ type: "join", room: "r", peer: "p", role: "viewer" }),
    );
  });
});

describe("WebSocketSignaling — heartbeat", () => {
  it("sends ping at heartbeatIntervalMs", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
      heartbeatIntervalMs: 1000,
    });
    await t.connect();
    fixture.lastInstance().__open();

    await vi.advanceTimersByTimeAsync(1100);
    expect(fixture.lastInstance().send).toHaveBeenCalledWith('{"type":"ping"}');
  });

  it("inbound activity resets the liveness clock", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
      heartbeatIntervalMs: 1000,
    });
    await t.connect();
    fixture.lastInstance().__open();

    // Inbound at 800ms (within window) — should NOT trigger reconnect.
    await vi.advanceTimersByTimeAsync(800);
    fixture
      .lastInstance()
      .__message(JSON.stringify({ type: "peer-joined", peer: "x", role: "viewer" }));

    // Advance through one full interval; activity clock was reset.
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.state).toBe("connected");
    expect(fixture.lastInstance().close).not.toHaveBeenCalled();
  });

  it("force-reconnects when no inbound activity for 2× interval", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
      heartbeatIntervalMs: 500,
      backoff: { initialMs: 100, jitter: 0 },
    });
    await t.connect();
    fixture.lastInstance().__open();

    // No inbound activity. After 2× interval (1000ms) the heartbeat should close.
    await vi.advanceTimersByTimeAsync(1500);
    expect(fixture.lastInstance().close).toHaveBeenCalledWith(4000, "heartbeat timeout");
  });

  it("heartbeatIntervalMs: 0 disables ping", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
      heartbeatIntervalMs: 0,
    });
    await t.connect();
    fixture.lastInstance().__open();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fixture.lastInstance().send).not.toHaveBeenCalled();
  });
});

describe("WebSocketSignaling — auth callback", () => {
  it("appends ?token=... when auth provided", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com/path",
      wsFactory: fixture.factory,
      auth: () => "abc123",
    });
    await t.connect();
    expect(fixture.lastInstance().url).toBe("wss://example.com/path?token=abc123");
  });

  it("appends &token=... when URL already has query", async () => {
    const fixture = createFakeWebSocketFactory();
    const t = defineWebSocketSignaling({
      url: "wss://example.com/path?room=demo",
      wsFactory: fixture.factory,
      auth: () => "abc123",
    });
    await t.connect();
    expect(fixture.lastInstance().url).toBe("wss://example.com/path?room=demo&token=abc123");
  });

  it("re-fetches token on every reconnect attempt", async () => {
    const fixture = createFakeWebSocketFactory();
    const auth = vi
      .fn<() => string>()
      .mockReturnValueOnce("token-1")
      .mockReturnValueOnce("token-2");

    const t = defineWebSocketSignaling({
      url: "wss://example.com",
      wsFactory: fixture.factory,
      auth,
      backoff: { initialMs: 100, jitter: 0 },
    });
    await t.connect();
    fixture.lastInstance().__open();
    expect(fixture.lastInstance().url).toBe("wss://example.com?token=token-1");

    fixture.lastInstance().__close(1006);
    await vi.advanceTimersByTimeAsync(150);

    expect(fixture.instances).toHaveLength(2);
    expect(fixture.lastInstance().url).toBe("wss://example.com?token=token-2");
    expect(auth).toHaveBeenCalledTimes(2);
  });
});
