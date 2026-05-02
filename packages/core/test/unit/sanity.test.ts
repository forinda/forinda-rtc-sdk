import { describe, expect, it } from "vitest";

describe("sanity", () => {
  it("runs in jsdom", () => {
    expect(typeof window).toBe("object");
    expect(typeof document).toBe("object");
  });
});
