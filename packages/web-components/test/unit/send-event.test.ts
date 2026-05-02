import { describe, expect, it, vi } from "vitest";
import { dispatchTypedEvent } from "@/internal/send-event.ts";

describe("dispatchTypedEvent", () => {
  it("fires a CustomEvent with the given type and detail", () => {
    const el = document.createElement("div");
    const handler = vi.fn();
    el.addEventListener("ready", handler);

    dispatchTypedEvent(el, "ready", { id: "abc" });

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0]?.[0] as CustomEvent<{ id: string }>;
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.type).toBe("ready");
    expect(event.detail).toEqual({ id: "abc" });
  });

  it("does not bubble", () => {
    const parent = document.createElement("div");
    const child = document.createElement("div");
    parent.appendChild(child);
    const parentHandler = vi.fn();
    parent.addEventListener("ping", parentHandler);

    dispatchTypedEvent(child, "ping", null);

    expect(parentHandler).not.toHaveBeenCalled();
  });

  it("returns true when no listener calls preventDefault", () => {
    const el = document.createElement("div");
    expect(dispatchTypedEvent(el, "ok", null)).toBe(true);
  });
});
