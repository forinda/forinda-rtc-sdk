import { describe, expect, it, vi } from "vitest";
import { defineTokenBucket } from "@/rate-limit.ts";

describe("defineTokenBucket", () => {
  it("starts with `capacity` tokens — burst is allowed", () => {
    const b = defineTokenBucket({ capacity: 5, refillPerSec: 1, now: () => 0 });
    for (let i = 0; i < 5; i++) expect(b.consume()).toBe(true);
    expect(b.consume()).toBe(false);
  });

  it("refills linearly over time", () => {
    let now = 0;
    const b = defineTokenBucket({ capacity: 2, refillPerSec: 1, now: () => now });
    expect(b.consume()).toBe(true);
    expect(b.consume()).toBe(true);
    expect(b.consume()).toBe(false);
    now = 1_000; // one second later → 1 token refilled
    expect(b.consume()).toBe(true);
    expect(b.consume()).toBe(false);
  });

  it("caps refill at `capacity`", () => {
    let now = 0;
    const b = defineTokenBucket({ capacity: 3, refillPerSec: 10, now: () => now });
    for (let i = 0; i < 3; i++) b.consume();
    now = 60_000; // 60s × 10/s = 600 tokens of credit, but capped at 3
    let consumed = 0;
    while (b.consume()) consumed++;
    expect(consumed).toBe(3);
  });

  it("treats refillPerSec=0 as 'never refills' (consume burns tokens permanently)", () => {
    let now = 0;
    const b = defineTokenBucket({ capacity: 1, refillPerSec: 0, now: () => now });
    expect(b.consume()).toBe(true);
    now = 60_000;
    expect(b.consume()).toBe(false);
  });

  it("uses Date.now by default", () => {
    const spy = vi.spyOn(Date, "now").mockReturnValue(123);
    try {
      const b = defineTokenBucket({ capacity: 1, refillPerSec: 1 });
      expect(b.consume()).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
