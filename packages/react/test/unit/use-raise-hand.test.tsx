import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRaiseHand } from "@/use-raise-hand.ts";
import { defineFakeRoomChannel } from "./_helpers/fake-room-channel.ts";

describe("useRaiseHand", () => {
  it("returns raised=false when channel is null", () => {
    const { result } = renderHook(() => useRaiseHand(null));
    expect(result.current.raised).toBe(false);
  });

  it("flips raised true after raise() and back after lower()", async () => {
    const ch = defineFakeRoomChannel("alice");
    const { result } = renderHook(() => useRaiseHand(ch));

    await act(async () => {
      await result.current.raise();
    });
    expect(result.current.raised).toBe(true);

    await act(async () => {
      await result.current.lower();
    });
    expect(result.current.raised).toBe(false);
  });

  it("toggle() switches the hand state", async () => {
    const ch = defineFakeRoomChannel("alice");
    const { result } = renderHook(() => useRaiseHand(ch));

    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.raised).toBe(true);

    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.raised).toBe(false);
  });

  it("only reads own peer's hand-raised attribute", () => {
    const ch = defineFakeRoomChannel("alice");
    ch.__setPresence("bob", { "hand-raised": true });

    const { result } = renderHook(() => useRaiseHand(ch));

    expect(result.current.raised).toBe(false);
  });
});
