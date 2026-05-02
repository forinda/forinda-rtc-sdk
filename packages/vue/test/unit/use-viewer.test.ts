import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defineEngineFixture,
  defineFakePeerConnection,
  type EngineFixture,
} from "@forinda/test-helpers";
import { useViewer } from "@/use-viewer.ts";
import { withScope } from "../_helpers/with-scope.ts";

const pcFactory = () => defineFakePeerConnection();

describe("useViewer", () => {
  it("surfaces a configuration error when no signaling and no attach", () => {
    const { result, dispose } = withScope(() => useViewer({ room: "demo", publisherId: "alice" }));
    expect(result.error.value?.code).toBe("configuration_error");
    expect(result.viewer.value).toBeNull();
    dispose();
  });

  it("surfaces a configuration error when room is missing and no attach", async () => {
    const fx = defineEngineFixture();
    const transport = await fx.open("sa");
    const { result, dispose } = withScope(() =>
      useViewer({ publisherId: "alice", signaling: transport, autoStart: false }),
    );
    expect(result.error.value?.code).toBe("configuration_error");
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

    it("constructs a viewer when given signaling + room", async () => {
      const transport = await fx.open("sb");
      const { result, dispose } = withScope(() =>
        useViewer({
          room: "demo",
          peerId: "bob",
          publisherId: "alice",
          signaling: transport,
          autoStart: false,
          pcFactory,
        }),
      );
      expect(result.viewer.value).not.toBeNull();
      expect(result.error.value).toBeNull();
      dispose();
    });
  });
});
