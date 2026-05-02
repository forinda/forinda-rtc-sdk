import { describe, expect, it } from "vitest";
import { invariant } from "@/internal/assert.ts";

describe("invariant", () => {
  it("does nothing when condition is truthy", () => {
    expect(() => invariant(true, "should not throw")).not.toThrow();
    expect(() => invariant(1, "should not throw")).not.toThrow();
    expect(() => invariant("non-empty", "should not throw")).not.toThrow();
  });

  it("throws when condition is falsy", () => {
    expect(() => invariant(false, "must be true")).toThrow(/invariant.*must be true/i);
    expect(() => invariant(0, "non-zero")).toThrow(/non-zero/);
    expect(() => invariant(null, "non-null")).toThrow(/non-null/);
    expect(() => invariant(undefined, "defined")).toThrow(/defined/);
  });
});
