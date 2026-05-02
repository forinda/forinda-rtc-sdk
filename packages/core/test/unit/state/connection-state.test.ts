import { describe, expect, it, vi } from "vitest";
import {
  type ConnectionState,
  defineStateMachine,
  StateMachine,
} from "@/state/connection-state.ts";

describe("StateMachine", () => {
  it("factory returns a StateMachine", () => {
    const sm = defineStateMachine();
    expect(sm).toBeInstanceOf(StateMachine);
  });

  it("defaults to idle", () => {
    expect(defineStateMachine().current()).toBe("idle");
  });

  it("respects custom initial state", () => {
    expect(defineStateMachine({ initial: "connected" }).current()).toBe("connected");
  });

  it("idle -> connecting allowed", () => {
    const sm = defineStateMachine();
    expect(sm.transition("connecting")).toBe(true);
    expect(sm.current()).toBe("connecting");
  });

  it("idle -> connected forbidden (must go through connecting)", () => {
    const sm = defineStateMachine();
    expect(sm.transition("connected")).toBe(false);
    expect(sm.current()).toBe("idle");
  });

  it("connecting -> connected allowed", () => {
    const sm = defineStateMachine({ initial: "connecting" });
    expect(sm.transition("connected")).toBe(true);
  });

  it("connected -> reconnecting allowed", () => {
    const sm = defineStateMachine({ initial: "connected" });
    expect(sm.transition("reconnecting")).toBe(true);
  });

  it("reconnecting -> connecting forbidden (no regress)", () => {
    const sm = defineStateMachine({ initial: "reconnecting" });
    expect(sm.transition("connecting")).toBe(false);
  });

  it("any state -> closed allowed", () => {
    for (const s of ["idle", "connecting", "connected", "reconnecting", "failed"] as const) {
      const sm = defineStateMachine({ initial: s });
      expect(sm.transition("closed")).toBe(true);
    }
  });

  it("closed is terminal", () => {
    const sm = defineStateMachine({ initial: "closed" });
    expect(sm.transition("connecting")).toBe(false);
    expect(sm.transition("idle")).toBe(false);
    expect(sm.current()).toBe("closed");
  });

  it("failed -> reconnecting allowed (auto-retry)", () => {
    const sm = defineStateMachine({ initial: "failed" });
    expect(sm.transition("reconnecting")).toBe(true);
  });

  it("emits change events on real transitions", () => {
    const sm = defineStateMachine();
    const handler = vi.fn();
    sm.on(handler);
    sm.transition("connecting");
    sm.transition("connected");
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, "connecting");
    expect(handler).toHaveBeenNthCalledWith(2, "connected");
  });

  it("does not emit when transitioning to the current state (idempotent)", () => {
    const sm = defineStateMachine({ initial: "connected" });
    const handler = vi.fn();
    sm.on(handler);
    expect(sm.transition("connected")).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not emit on a forbidden transition", () => {
    const sm = defineStateMachine();
    const handler = vi.fn();
    sm.on(handler);
    sm.transition("connected"); // forbidden from idle
    expect(handler).not.toHaveBeenCalled();
  });

  it("handler unsubscribe stops further notifications", () => {
    const sm = defineStateMachine();
    const handler = vi.fn();
    const off = sm.on(handler);
    sm.transition("connecting");
    off();
    sm.transition("connected");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ConnectionState union exports the six states", () => {
    const s: ConnectionState[] = [
      "idle",
      "connecting",
      "connected",
      "reconnecting",
      "failed",
      "closed",
    ];
    expect(s).toHaveLength(6);
  });
});
