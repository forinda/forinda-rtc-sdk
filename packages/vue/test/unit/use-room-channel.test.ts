import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineEngineFixture, type EngineFixture } from "@forinda/test-helpers";
import { useRoomChannel } from "@/use-room-channel.ts";
import { withScope } from "../_helpers/with-scope.ts";

describe("useRoomChannel", () => {
  it("errors when no signaling and no attach", () => {
    const { result, dispose } = withScope(() => useRoomChannel({ room: "demo", autoStart: false }));
    expect(result.channel.value).toBeNull();
    expect(result.error.value).not.toBeNull();
    dispose();
  });

  it("errors when room missing and no attach", async () => {
    const fx = defineEngineFixture();
    const transport = await fx.open("sa");
    const { result, dispose } = withScope(() =>
      useRoomChannel({ signaling: transport, autoStart: false }),
    );
    expect(result.error.value).not.toBeNull();
    dispose();
    await fx.closeAll();
  });

  describe("with engine fixture", () => {
    let fx: EngineFixture;
    beforeEach(() => {
      fx = defineEngineFixture();
    });
    afterEach(async () => {
      await fx.closeAll();
    });

    it("constructs a channel given signaling + room", async () => {
      const transport = await fx.open("sa");
      const { result, dispose } = withScope(() =>
        useRoomChannel({
          room: "demo",
          peerId: "alice",
          signaling: transport,
          autoStart: false,
        }),
      );
      expect(result.channel.value).not.toBeNull();
      expect(result.error.value).toBeNull();
      dispose();
    });
  });
});
