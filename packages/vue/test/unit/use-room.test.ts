import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineEngineFixture, type EngineFixture } from "@forinda/test-helpers";
import { useRoom } from "@/use-room.ts";
import { withScope } from "../_helpers/with-scope.ts";

describe("useRoom", () => {
  it("surfaces a configuration error when no signaling and no plugin", () => {
    const { result, dispose } = withScope(() => useRoom({ room: "demo" }));
    expect(result.room.value).toBeNull();
    expect(result.error.value).not.toBeNull();
    dispose();
  });

  describe("with engine fixture", () => {
    let fx: EngineFixture;
    beforeEach(() => {
      fx = defineEngineFixture();
    });
    afterEach(async () => {
      await fx.closeAll();
    });

    it("constructs a Room when signaling is provided", async () => {
      const transport = await fx.open("sa");
      const { result, dispose } = withScope(() =>
        useRoom({ room: "demo", peerId: "alice", signaling: transport }),
      );
      expect(result.room.value).not.toBeNull();
      expect(result.error.value).toBeNull();
      dispose();
    });
  });
});
