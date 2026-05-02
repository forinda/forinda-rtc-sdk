import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePresence } from "@/use-presence.ts";
import { defineFakeRoomChannel } from "./_helpers/fake-room-channel.ts";

describe("usePresence", () => {
  it("returns an empty map when channel is null", () => {
    const { result } = renderHook(() => usePresence(null));
    expect(result.current.peers).toEqual({});
  });

  it("seeds with the channel's current presence map", () => {
    const ch = defineFakeRoomChannel();
    ch.__setPresence("alice", { "hand-raised": true });
    ch.__setPresence("bob", { status: "🎬" });

    const { result } = renderHook(() => usePresence(ch));

    expect(result.current.peers).toEqual({
      alice: { "hand-raised": true },
      bob: { status: "🎬" },
    });
  });

  it("re-renders on a 'presence' event", () => {
    const ch = defineFakeRoomChannel();
    const { result } = renderHook(() => usePresence(ch));

    act(() => {
      ch.__setPresence("bob", { status: "ok" });
      ch.__fire("presence", { peer: "bob", attributes: { status: "ok" } });
    });

    expect(result.current.peers).toEqual({ bob: { status: "ok" } });
  });

  it("re-renders on a 'presence-snapshot' event", () => {
    const ch = defineFakeRoomChannel();
    const { result } = renderHook(() => usePresence(ch));

    act(() => {
      ch.__setPresence("alice", { ready: true });
      ch.__setPresence("bob", { ready: true });
      ch.__fire("presence-snapshot", { alice: { ready: true }, bob: { ready: true } });
    });

    expect(Object.keys(result.current.peers).sort()).toEqual(["alice", "bob"]);
  });

  it("setAttribute / removeAttribute / clearAttributes proxy to the channel", async () => {
    const ch = defineFakeRoomChannel();
    const { result } = renderHook(() => usePresence(ch));

    await act(async () => {
      await result.current.setAttribute("hand-raised", true);
    });
    expect(ch.setAttribute).toHaveBeenCalledWith("hand-raised", true);
    expect(result.current.peers.alice).toEqual({ "hand-raised": true });

    await act(async () => {
      await result.current.removeAttribute("hand-raised");
    });
    expect(ch.removeAttribute).toHaveBeenCalledWith("hand-raised");

    await act(async () => {
      await result.current.clearAttributes();
    });
    expect(ch.clearAttributes).toHaveBeenCalled();
  });
});
