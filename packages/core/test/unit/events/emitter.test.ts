import { describe, expect, it, vi } from "vitest";
import { defineEmitter, Emitter } from "@/events/emitter.ts";

interface Events {
  hello: { name: string };
  count: number;
}

describe("Emitter", () => {
  it("factory returns an Emitter", () => {
    const e = defineEmitter<Events>();
    expect(e).toBeInstanceOf(Emitter);
  });

  it("on registers a listener; emit invokes it", () => {
    const e = defineEmitter<Events>();
    const handler = vi.fn();
    e.on("hello", handler);
    e.emit("hello", { name: "alice" });
    expect(handler).toHaveBeenCalledWith({ name: "alice" });
  });

  it("on returns an unsubscribe", () => {
    const e = defineEmitter<Events>();
    const handler = vi.fn();
    const off = e.on("count", handler);
    off();
    e.emit("count", 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("multiple listeners are invoked in registration order", () => {
    const e = defineEmitter<Events>();
    const calls: string[] = [];
    e.on("hello", () => calls.push("a"));
    e.on("hello", () => calls.push("b"));
    e.on("hello", () => calls.push("c"));
    e.emit("hello", { name: "x" });
    expect(calls).toEqual(["a", "b", "c"]);
  });

  it("emit with no listeners is a no-op", () => {
    const e = defineEmitter<Events>();
    expect(() => e.emit("hello", { name: "ghost" })).not.toThrow();
  });

  it("once registers a single-shot listener", () => {
    const e = defineEmitter<Events>();
    const handler = vi.fn();
    e.once("count", handler);
    e.emit("count", 1);
    e.emit("count", 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it("off removes a specific listener", () => {
    const e = defineEmitter<Events>();
    const a = vi.fn();
    const b = vi.fn();
    e.on("count", a);
    e.on("count", b);
    e.off("count", a);
    e.emit("count", 7);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith(7);
  });

  it("removeAllListeners(event) clears one event", () => {
    const e = defineEmitter<Events>();
    const a = vi.fn();
    const b = vi.fn();
    e.on("hello", a);
    e.on("count", b);
    e.removeAllListeners("hello");
    e.emit("hello", { name: "x" });
    e.emit("count", 1);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith(1);
  });

  it("removeAllListeners() with no arg clears every event", () => {
    const e = defineEmitter<Events>();
    const a = vi.fn();
    const b = vi.fn();
    e.on("hello", a);
    e.on("count", b);
    e.removeAllListeners();
    e.emit("hello", { name: "x" });
    e.emit("count", 1);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it("an exception in one listener does not stop subsequent listeners", () => {
    const e = defineEmitter<Events>();
    const onError = vi.fn();
    e.on("hello", () => {
      throw new Error("boom");
    });
    e.on("hello", onError);
    e.emit("hello", { name: "x" });
    expect(onError).toHaveBeenCalled();
  });
});
