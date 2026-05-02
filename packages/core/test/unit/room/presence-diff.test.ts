import { describe, expect, it } from "vitest";
import { definePresenceDiff } from "@/room/presence-diff.ts";

describe("definePresenceDiff", () => {
  it("returns empty diffs for identical maps", () => {
    const a = { alice: { hand: true } };
    const result = definePresenceDiff(a, a);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([]);
  });

  it("detects an added peer", () => {
    const result = definePresenceDiff({}, { alice: { hand: true } });
    expect(result.added).toEqual([{ peer: "alice", attributes: { hand: true } }]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([]);
  });

  it("detects a removed peer", () => {
    const result = definePresenceDiff({ alice: { hand: true } }, {});
    expect(result.removed).toEqual([{ peer: "alice", attributes: { hand: true } }]);
    expect(result.added).toEqual([]);
    expect(result.changed).toEqual([]);
  });

  it("detects an attribute change with previous-vs-next deltas", () => {
    const result = definePresenceDiff(
      { alice: { hand: true, status: "ok" } },
      { alice: { hand: false, status: "ok" } },
    );
    expect(result.changed).toEqual([
      {
        peer: "alice",
        changed: { hand: false },
        next: { hand: false, status: "ok" },
      },
    ]);
  });

  it("treats a removed attribute as `null` in the changed delta", () => {
    const result = definePresenceDiff(
      { alice: { hand: true, status: "ok" } },
      { alice: { hand: true } },
    );
    expect(result.changed[0]?.changed).toEqual({ status: null });
  });

  it("works with Map inputs as well as plain objects", () => {
    const prev = new Map([["alice", { hand: true }]]);
    const next = new Map([
      ["alice", { hand: false }],
      ["bob", { joining: true }],
    ]);
    const result = definePresenceDiff(prev, next);
    expect(result.added).toEqual([{ peer: "bob", attributes: { joining: true } }]);
    expect(result.changed[0]?.changed).toEqual({ hand: false });
  });

  it("does not emit a `changed` entry when only attribute references differ", () => {
    const result = definePresenceDiff({ alice: { hand: true } }, { alice: { hand: true } });
    expect(result.changed).toEqual([]);
  });
});
