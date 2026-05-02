import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useRoomChannel } from "@/use-room-channel.ts";
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useRoomChannel", () => {
  it("constructs a channel and exposes it", async () => {
    const signaling = defineFakeTransport();
    const { result } = renderHook(() =>
      useRoomChannel({ room: "demo", peerId: "alice", signaling }),
    );

    await waitFor(() => expect(result.current.channel).not.toBeNull());
    expect(result.current.channel?.peerId).toBe("alice");
    expect(result.current.error).toBeNull();
  });

  it("sets an error when no signaling is provided", () => {
    const { result } = renderHook(() => useRoomChannel({ room: "demo" }));

    expect(result.current.channel).toBeNull();
    expect(result.current.error?.message).toMatch(/no signaling transport/);
  });

  it("tears down the channel on unmount", async () => {
    const signaling = defineFakeTransport();
    const { result, unmount } = renderHook(() =>
      useRoomChannel({ room: "demo", peerId: "alice", signaling }),
    );

    await waitFor(() => expect(result.current.channel).not.toBeNull());
    const stopSpy = vi.spyOn(result.current.channel!, "stop");

    unmount();
    expect(stopSpy).toHaveBeenCalled();
  });
});
