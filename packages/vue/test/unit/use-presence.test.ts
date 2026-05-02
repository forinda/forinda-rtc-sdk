import { describe, expect, it } from "vitest";
import { shallowRef } from "vue";
import type { RoomChannel } from "@forinda/video-sdk-core";
import { usePresence } from "@/use-presence.ts";
import { defineFakeRoomChannel } from "../_helpers/fake-room-channel.ts";
import { withScope } from "../_helpers/with-scope.ts";

describe("usePresence", () => {
  it("returns an empty map for a null channel", () => {
    const { result, dispose } = withScope(() => usePresence(null));
    expect(result.peers.value).toEqual({});
    dispose();
  });

  it("snapshots the current peers on mount", () => {
    const ch = defineFakeRoomChannel("alice");
    ch.__setPresence("alice", { mic: true });
    ch.__setPresence("bob", { mic: false });
    const { result, dispose } = withScope(() => usePresence(ch));
    expect(result.peers.value.alice).toEqual({ mic: true });
    expect(result.peers.value.bob).toEqual({ mic: false });
    dispose();
  });

  it("updates on presence event", async () => {
    const ch = defineFakeRoomChannel("alice");
    const { result, dispose } = withScope(() => usePresence(ch));
    await result.setAttribute("mic", true);
    expect(result.peers.value.alice).toEqual({ mic: true });
    dispose();
  });

  it("removes peer on peer-left", () => {
    const ch = defineFakeRoomChannel("alice");
    ch.__setPresence("bob", { mic: true });
    const { result, dispose } = withScope(() => usePresence(ch));
    expect(result.peers.value.bob).toBeDefined();
    (ch.peers as Map<string, unknown>).delete("bob");
    ch.__fire("peer-left", { peer: "bob" });
    expect(result.peers.value.bob).toBeUndefined();
    dispose();
  });

  it("re-subscribes when channel ref swaps from null to populated", async () => {
    const channelRef = shallowRef<RoomChannel | null>(null);
    const { result, dispose } = withScope(() => usePresence(channelRef));
    expect(result.peers.value).toEqual({});

    const ch = defineFakeRoomChannel("alice");
    ch.__setPresence("alice", { mic: true });
    channelRef.value = ch as unknown as RoomChannel;
    // watch is sync; immediate also fires once. Allow a flush.
    await Promise.resolve();
    expect(result.peers.value.alice).toEqual({ mic: true });
    dispose();
  });
});
