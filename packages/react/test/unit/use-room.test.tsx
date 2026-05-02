import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useRoom } from "@/use-room.ts";
import type {
  SignalingMessageType,
  SignalingTransport,
  TransportState,
} from "@forinda/video-sdk-core";

function defineFakeTransport(): SignalingTransport {
  const messageHandlers = new Set<(m: SignalingMessageType) => void>();
  const stateHandlers = new Set<(s: TransportState) => void>();
  let state: TransportState = "idle";
  return {
    get state() {
      return state;
    },
    async connect() {
      state = "connected";
      for (const h of stateHandlers) h(state);
    },
    async disconnect() {
      state = "closed";
      for (const h of stateHandlers) h(state);
    },
    async send() {},
    on<E extends "message" | "state">(
      event: E,
      handler: E extends "message"
        ? (m: SignalingMessageType) => void
        : (s: TransportState) => void,
    ): () => void {
      if (event === "message") {
        const h = handler as (m: SignalingMessageType) => void;
        messageHandlers.add(h);
        return () => messageHandlers.delete(h);
      }
      const h = handler as (s: TransportState) => void;
      stateHandlers.add(h);
      return () => stateHandlers.delete(h);
    },
  };
}

describe("useRoom", () => {
  it("constructs a Room and exposes it", async () => {
    const signaling = defineFakeTransport();
    const { result } = renderHook(() => useRoom({ room: "demo", peerId: "alice", signaling }));

    await waitFor(() => expect(result.current.room).not.toBeNull());
    expect(result.current.room?.peerId).toBe("alice");
    expect(result.current.error).toBeNull();
  });

  it("reports an error when no signaling is provided", () => {
    const { result } = renderHook(() => useRoom({ room: "demo" }));
    expect(result.current.room).toBeNull();
    expect(result.current.error?.message).toMatch(/no signaling transport/);
  });

  it("closes the Room on unmount", async () => {
    const signaling = defineFakeTransport();
    const { result, unmount } = renderHook(() =>
      useRoom({ room: "demo", peerId: "alice", signaling }),
    );

    await waitFor(() => expect(result.current.room).not.toBeNull());
    const closeSpy = vi.spyOn(result.current.room!, "close");

    unmount();
    expect(closeSpy).toHaveBeenCalled();
  });
});
