import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { definePublisher } from "@/publisher/publisher.ts";
import type { SignalingTransport, TransportState } from "@/signaling/transport.ts";
import { defineFakePeerConnection } from "@forinda/test-helpers";
import { fakeMediaStream } from "../../_mocks/fake-media-devices.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Controllable signaling transport: tests can drive its state transitions
 * to simulate connect, drop, reconnect, etc.
 */
function createControllableTransport(): SignalingTransport & {
  __setState: (s: TransportState) => void;
  __connectShouldFail: () => void;
  connectMock: ReturnType<typeof vi.fn>;
  sendMock: ReturnType<typeof vi.fn>;
} {
  const messageHandlers = new Set<() => void>();
  const stateHandlers = new Set<(s: TransportState) => void>();
  let state: TransportState = "idle";
  let nextConnectShouldFail = false;

  const connectMock = vi.fn(async () => {
    if (nextConnectShouldFail) {
      nextConnectShouldFail = false;
      throw new Error("connect failed");
    }
    state = "connected";
    for (const h of stateHandlers) h(state);
  });

  const sendMock = vi.fn(async () => undefined);

  const transport = {
    get state() {
      return state;
    },
    connect: connectMock,
    disconnect: vi.fn(async () => {
      state = "closed";
      for (const h of stateHandlers) h(state);
    }),
    send: sendMock,
    on(event: "message" | "state", handler: (...args: unknown[]) => void) {
      if (event === "message") {
        messageHandlers.add(handler as () => void);
        return () => messageHandlers.delete(handler as () => void);
      }
      stateHandlers.add(handler as (s: TransportState) => void);
      return () => stateHandlers.delete(handler as (s: TransportState) => void);
    },
    __setState(s: TransportState) {
      state = s;
      for (const h of stateHandlers) h(s);
    },
    __connectShouldFail() {
      nextConnectShouldFail = true;
    },
    connectMock,
    sendMock,
  } as SignalingTransport & {
    __setState: (s: TransportState) => void;
    __connectShouldFail: () => void;
    connectMock: ReturnType<typeof vi.fn>;
    sendMock: ReturnType<typeof vi.fn>;
  };
  return transport;
}

describe("Publisher — auto-retry", () => {
  it("emits failed → retry event → reconnects after backoff when signaling drops", async () => {
    const signaling = createControllableTransport();
    const fakePc = defineFakePeerConnection();

    const p = definePublisher({
      signaling,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => fakePc,
      retry: { initialBackoffMs: 1000, jitter: 0, maxAttempts: 5 },
    });

    const states: string[] = [];
    p.on("state", (s) => states.push(s));
    const onRetry = vi.fn();
    p.on("retry", onRetry);

    await p.start();
    expect(p.state).toBe("connected");

    // Simulate signaling drop.
    signaling.__setState("closed");
    expect(p.state).toBe("failed");
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]?.[0]?.attempt).toBe(1);
    expect(onRetry.mock.calls[0]?.[0]?.nextDelayMs).toBe(1000);

    // Advance past backoff → publisher attempts reconnect.
    signaling.connectMock.mockClear();
    await vi.advanceTimersByTimeAsync(1100);
    expect(signaling.connectMock).toHaveBeenCalled();
    expect(p.state).toBe("connected");

    await p.stop();
  });

  it("transitions to closed with retry_exhausted error after maxAttempts", async () => {
    const signaling = createControllableTransport();
    const fakePc = defineFakePeerConnection();

    const p = definePublisher({
      signaling,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => fakePc,
      retry: { initialBackoffMs: 100, jitter: 0, maxAttempts: 2 },
    });

    const onError = vi.fn();
    p.on("error", onError);

    await p.start();

    // Drop, fail to reconnect, drop again.
    signaling.__setState("closed");
    signaling.__connectShouldFail();
    await vi.advanceTimersByTimeAsync(150);
    // After failed reconnect, retry attempt 2 scheduled
    signaling.__connectShouldFail();
    await vi.advanceTimersByTimeAsync(250);
    // Now budget exhausted — next failure should fail with retry_exhausted
    signaling.__setState("closed");
    await vi.advanceTimersByTimeAsync(500);

    expect(p.state).toBe("closed");
    expect(onError).toHaveBeenCalled();
    const lastErr = onError.mock.calls[onError.mock.calls.length - 1]?.[0];
    expect(lastErr?.code).toBe("retry_exhausted");
  });

  it("disabled retry transitions straight to closed on signaling drop", async () => {
    const signaling = createControllableTransport();
    const fakePc = defineFakePeerConnection();

    const p = definePublisher({
      signaling,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => fakePc,
      retry: { enabled: false },
    });

    const onError = vi.fn();
    p.on("error", onError);

    await p.start();
    signaling.__setState("closed");
    expect(p.state).toBe("closed");
    expect(onError).toHaveBeenCalled();
  });

  it("stop() during scheduled retry cancels the retry", async () => {
    const signaling = createControllableTransport();
    const fakePc = defineFakePeerConnection();

    const p = definePublisher({
      signaling,
      room: "demo",
      peerId: "alice",
      stream: fakeMediaStream(),
      pcFactory: () => fakePc,
      retry: { initialBackoffMs: 5000, jitter: 0 },
    });

    await p.start();
    signaling.__setState("closed");
    expect(p.state).toBe("failed");

    await p.stop();
    expect(p.state).toBe("closed");

    signaling.connectMock.mockClear();
    await vi.advanceTimersByTimeAsync(10000);
    expect(signaling.connectMock).not.toHaveBeenCalled();
  });
});
