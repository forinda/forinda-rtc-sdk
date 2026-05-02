import { describe, expect, it } from "vitest";
import { useRaiseHand } from "@/use-raise-hand.ts";
import { defineFakeRoomChannel } from "../_helpers/fake-room-channel.ts";
import { withScope } from "../_helpers/with-scope.ts";

describe("useRaiseHand", () => {
  it("starts unraised", () => {
    const ch = defineFakeRoomChannel("alice");
    const { result, dispose } = withScope(() => useRaiseHand(ch));
    expect(result.raised.value).toBe(false);
    dispose();
  });

  it("flips on raise()", async () => {
    const ch = defineFakeRoomChannel("alice");
    const { result, dispose } = withScope(() => useRaiseHand(ch));
    await result.raise();
    expect(result.raised.value).toBe(true);
    dispose();
  });

  it("flips back on lower()", async () => {
    const ch = defineFakeRoomChannel("alice");
    const { result, dispose } = withScope(() => useRaiseHand(ch));
    await result.raise();
    expect(result.raised.value).toBe(true);
    await result.lower();
    expect(result.raised.value).toBe(false);
    dispose();
  });

  it("toggle() flips both ways", async () => {
    const ch = defineFakeRoomChannel("alice");
    const { result, dispose } = withScope(() => useRaiseHand(ch));
    await result.toggle();
    expect(result.raised.value).toBe(true);
    await result.toggle();
    expect(result.raised.value).toBe(false);
    dispose();
  });

  it("is inert with a null channel", async () => {
    const { result, dispose } = withScope(() => useRaiseHand(null));
    expect(result.raised.value).toBe(false);
    await result.raise();
    await result.lower();
    await result.toggle();
    expect(result.raised.value).toBe(false);
    dispose();
  });
});
