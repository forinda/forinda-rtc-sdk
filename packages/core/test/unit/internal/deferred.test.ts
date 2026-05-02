import { describe, expect, it } from "vitest";
import { defineDeferred } from "@/internal/deferred.ts";

describe("defineDeferred", () => {
  it("resolve fulfills the promise", async () => {
    const d = defineDeferred<number>();
    d.resolve(42);
    await expect(d.promise).resolves.toBe(42);
  });

  it("reject rejects the promise", async () => {
    const d = defineDeferred<number>();
    d.reject(new Error("nope"));
    await expect(d.promise).rejects.toThrow("nope");
  });

  it("can be awaited from elsewhere before settling", async () => {
    const d = defineDeferred<string>();
    setTimeout(() => d.resolve("late"), 0);
    await expect(d.promise).resolves.toBe("late");
  });
});
