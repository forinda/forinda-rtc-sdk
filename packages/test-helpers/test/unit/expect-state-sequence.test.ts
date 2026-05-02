import { describe, expect, it } from "vitest";
import { expectStateSequence } from "@/expect-state-sequence.ts";

function defineEmitter<T>(): {
  on(event: "state", handler: (s: T) => void): () => void;
  emit(s: T): void;
} {
  const handlers = new Set<(s: T) => void>();
  return {
    on(_event, handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    emit(s) {
      for (const h of handlers) h(s);
    },
  };
}

describe("expectStateSequence", () => {
  it("resolves once the requested sequence is observed in order", async () => {
    const emitter = defineEmitter<string>();
    const promise = expectStateSequence(emitter, ["connecting", "connected"]);
    emitter.emit("connecting");
    emitter.emit("connected");
    await expect(promise).resolves.toBeUndefined();
  });

  it("tolerates intermediate non-matching states", async () => {
    const emitter = defineEmitter<string>();
    const promise = expectStateSequence(emitter, ["connected", "closed"]);
    emitter.emit("connecting");
    emitter.emit("connected");
    emitter.emit("reconnecting");
    emitter.emit("closed");
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects with a useful error on timeout, listing observed states", async () => {
    const emitter = defineEmitter<string>();
    const promise = expectStateSequence(emitter, ["connected"], { timeoutMs: 30 });
    emitter.emit("connecting");
    await expect(promise).rejects.toThrow(/timed out after 30ms/);
    await expect(promise).rejects.toThrow(/observed \["connecting"\]/);
  });

  it("rejects when the sequence is empty", async () => {
    const emitter = defineEmitter<string>();
    await expect(expectStateSequence(emitter, [])).rejects.toThrow(/must not be empty/);
  });

  it("supports a bare subscribe-fn source", async () => {
    const handlers = new Set<(s: string) => void>();
    const subscribe = (h: (s: string) => void): (() => void) => {
      handlers.add(h);
      return () => handlers.delete(h);
    };
    const promise = expectStateSequence(subscribe, ["ready"]);
    for (const h of handlers) h("ready");
    await expect(promise).resolves.toBeUndefined();
  });

  it("unsubscribes after success", async () => {
    let active = 0;
    const subscribe = (h: (s: string) => void): (() => void) => {
      active += 1;
      h("ready");
      return () => {
        active -= 1;
      };
    };
    await expectStateSequence(subscribe, ["ready"]);
    expect(active).toBe(0);
  });
});
