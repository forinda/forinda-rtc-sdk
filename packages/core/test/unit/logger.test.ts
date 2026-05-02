import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultLogger, getLogger, setLogger, type Logger } from "@/logger/logger.ts";

afterEach(() => {
  setLogger(defaultLogger);
});

describe("Logger", () => {
  it("default logger is a noop (does not throw)", () => {
    expect(() => defaultLogger.trace("trace")).not.toThrow();
    expect(() => defaultLogger.debug("debug")).not.toThrow();
    expect(() => defaultLogger.info("info")).not.toThrow();
    expect(() => defaultLogger.warn("warn")).not.toThrow();
    expect(() => defaultLogger.error("error")).not.toThrow();
  });

  it("setLogger swaps the active logger; getLogger returns it", () => {
    const custom: Logger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    setLogger(custom);
    expect(getLogger()).toBe(custom);

    getLogger().info("hello", { peerId: "alice" });
    expect(custom.info).toHaveBeenCalledWith("hello", { peerId: "alice" });
  });

  it("setLogger(defaultLogger) restores the default", () => {
    const custom: Logger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    setLogger(custom);
    setLogger(defaultLogger);
    expect(getLogger()).toBe(defaultLogger);
  });

  it("logger context is optional", () => {
    const custom: Logger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    setLogger(custom);
    getLogger().warn("no ctx");
    expect(custom.warn).toHaveBeenCalledWith("no ctx");
  });
});
