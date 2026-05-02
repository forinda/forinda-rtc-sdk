import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defineEngineFixture,
  defineFakePeerConnection,
  type EngineFixture,
} from "@forinda/test-helpers";
import { usePublisher } from "@/use-publisher.ts";
import { withScope } from "../_helpers/with-scope.ts";

const pcFactory = () => defineFakePeerConnection();

function fakeStream(): MediaStream {
  return { getTracks: () => [] } as unknown as MediaStream;
}

describe("usePublisher", () => {
  it("surfaces a configuration error when no signaling and no attach", () => {
    const { result, dispose } = withScope(() =>
      usePublisher({ room: "demo", stream: fakeStream() }),
    );
    expect(result.error.value).not.toBeNull();
    expect(result.error.value?.code).toBe("configuration_error");
    expect(result.publisher.value).toBeNull();
    dispose();
  });

  it("surfaces a configuration error when room is missing and no attach", async () => {
    const fx = defineEngineFixture();
    const transport = await fx.open("sa");
    const { result, dispose } = withScope(() =>
      usePublisher({ stream: fakeStream(), signaling: transport, autoStart: false }),
    );
    expect(result.error.value?.code).toBe("configuration_error");
    dispose();
    await fx.closeAll();
  });

  it("does nothing while stream is null", () => {
    const { result, dispose } = withScope(() =>
      usePublisher({ room: "demo", stream: null, autoStart: false }),
    );
    expect(result.publisher.value).toBeNull();
    expect(result.error.value).toBeNull();
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

    it("constructs a publisher when given signaling + room", async () => {
      const transport = await fx.open("sa");
      const { result, dispose } = withScope(() =>
        usePublisher({
          room: "demo",
          peerId: "alice",
          stream: fakeStream(),
          signaling: transport,
          autoStart: false,
          pcFactory,
        }),
      );
      expect(result.publisher.value).not.toBeNull();
      expect(result.error.value).toBeNull();
      dispose();
    });
  });
});
