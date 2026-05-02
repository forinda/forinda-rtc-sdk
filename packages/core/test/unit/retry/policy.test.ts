import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineRetryPolicy, RetryPolicy } from "@/retry/policy.ts";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-02T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RetryPolicy", () => {
  it("factory returns a RetryPolicy", () => {
    const p = defineRetryPolicy();
    expect(p).toBeInstanceOf(RetryPolicy);
  });

  it("default config: enabled true, maxAttempts 5, initial 1000, max 30000", () => {
    const p = defineRetryPolicy();
    expect(p.attempt).toBe(0);
    const first = p.nextDelayMs();
    expect(first).not.toBeNull();
    // first delay is between 750 and 1250 (1000ms ±25% jitter)
    expect(first).toBeGreaterThanOrEqual(750);
    expect(first).toBeLessThanOrEqual(1250);
    expect(p.attempt).toBe(1);
  });

  it("backoff doubles each attempt with jitter", () => {
    const p = defineRetryPolicy({ initialBackoffMs: 1000, jitter: 0 });
    expect(p.nextDelayMs()).toBe(1000);
    expect(p.nextDelayMs()).toBe(2000);
    expect(p.nextDelayMs()).toBe(4000);
    expect(p.nextDelayMs()).toBe(8000);
  });

  it("backoff caps at maxBackoffMs", () => {
    const p = defineRetryPolicy({ initialBackoffMs: 1000, maxBackoffMs: 5000, jitter: 0 });
    p.nextDelayMs(); // 1000
    p.nextDelayMs(); // 2000
    p.nextDelayMs(); // 4000
    expect(p.nextDelayMs()).toBe(5000); // would be 8000, capped
    expect(p.nextDelayMs()).toBe(5000);
  });

  it("returns null when maxAttempts reached", () => {
    const p = defineRetryPolicy({ maxAttempts: 3, jitter: 0 });
    expect(p.nextDelayMs()).not.toBeNull();
    expect(p.nextDelayMs()).not.toBeNull();
    expect(p.nextDelayMs()).not.toBeNull();
    expect(p.nextDelayMs()).toBeNull();
    expect(p.isExhausted()).toBe(true);
  });

  it("returns null when maxDurationMs exceeded", () => {
    const p = defineRetryPolicy({
      maxAttempts: 100,
      maxDurationMs: 5000,
      initialBackoffMs: 1000,
      jitter: 0,
    });
    expect(p.nextDelayMs()).toBe(1000);
    vi.advanceTimersByTime(6000);
    expect(p.nextDelayMs()).toBeNull();
    expect(p.isExhausted()).toBe(true);
  });

  it("disabled policy returns null immediately", () => {
    const p = defineRetryPolicy({ enabled: false });
    expect(p.nextDelayMs()).toBeNull();
    expect(p.isExhausted()).toBe(true);
  });

  it("markSuccess after successResetMs resets attempt counter", () => {
    const p = defineRetryPolicy({ jitter: 0, successResetMs: 1000 });
    p.nextDelayMs();
    p.nextDelayMs();
    expect(p.attempt).toBe(2);
    vi.advanceTimersByTime(1500);
    p.markSuccess();
    expect(p.attempt).toBe(0);
    expect(p.nextDelayMs()).toBe(1000); // back to initial
  });

  it("markSuccess before successResetMs does NOT reset", () => {
    const p = defineRetryPolicy({ jitter: 0, successResetMs: 5000 });
    p.nextDelayMs();
    p.nextDelayMs();
    vi.advanceTimersByTime(2000); // less than 5s window
    p.markSuccess();
    expect(p.attempt).toBe(2);
  });

  it("jitter is bounded ±25% by default", () => {
    const p = defineRetryPolicy({ initialBackoffMs: 1000 });
    for (let i = 0; i < 20; i += 1) {
      const np = defineRetryPolicy({ initialBackoffMs: 1000 });
      const d = np.nextDelayMs();
      expect(d).toBeGreaterThanOrEqual(750);
      expect(d).toBeLessThanOrEqual(1250);
    }
    expect(p.attempt).toBe(0);
  });

  it("elapsedMs reflects time since first nextDelayMs call", () => {
    const p = defineRetryPolicy();
    p.nextDelayMs();
    vi.advanceTimersByTime(3000);
    expect(p.elapsedMs).toBeGreaterThanOrEqual(3000);
  });
});
