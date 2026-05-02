import { describe, expect, it } from "vitest";

describe("auto-registration entry", () => {
  it("registers all elements when the index module is imported", async () => {
    await import("@/index.ts");
    expect(customElements.get("forinda-video-publisher")).toBeDefined();
    expect(customElements.get("forinda-video-viewer")).toBeDefined();
    expect(customElements.get("forinda-video-device-picker")).toBeDefined();
  });

  it("manual entry exposes classes without auto-registering under a custom name", async () => {
    const { ForindaVideoPublisher, registerAll } = await import("@/manual.ts");
    expect(ForindaVideoPublisher).toBeDefined();
    expect(registerAll).toBeInstanceOf(Function);
    registerAll();
    expect(customElements.get("forinda-video-publisher")).toBe(ForindaVideoPublisher);
  });
});
