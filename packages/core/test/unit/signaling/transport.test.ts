import { describe, expect, it, vi } from "vitest";
import {
  SignalingMessage,
  type SignalingMessageType,
  type SignalingTransport,
  type TransportState,
} from "@/signaling/transport.ts";

describe("SignalingTransport interface", () => {
  it("an in-memory adapter satisfies the contract structurally", async () => {
    const messageHandlers = new Set<(msg: SignalingMessageType) => void>();
    const stateHandlers = new Set<(state: TransportState) => void>();
    let state: TransportState = "idle";

    const adapter: SignalingTransport = {
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
      async send(_message) {
        // no-op echo for the test
      },
      on(event, handler) {
        if (event === "message") {
          messageHandlers.add(handler as (msg: SignalingMessageType) => void);
          return () => messageHandlers.delete(handler as (msg: SignalingMessageType) => void);
        }
        stateHandlers.add(handler as (state: TransportState) => void);
        return () => stateHandlers.delete(handler as (state: TransportState) => void);
      },
    };

    const onState = vi.fn();
    adapter.on("state", onState);
    await adapter.connect();
    expect(onState).toHaveBeenCalledWith("connected");
    expect(adapter.state).toBe("connected");
    await adapter.disconnect();
    expect(adapter.state).toBe("closed");
  });

  it("re-exports the wire-format zod schema and inferred type from the protocol package", () => {
    expect(SignalingMessage).toBeDefined();
    expect(SignalingMessage.parse).toBeDefined();
    const parsed: SignalingMessageType = SignalingMessage.parse({
      type: "join",
      room: "r",
      peer: "p",
      role: "publisher",
    });
    expect(parsed.type).toBe("join");
  });
});
