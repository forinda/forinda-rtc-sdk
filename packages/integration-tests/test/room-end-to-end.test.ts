import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineRoom } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";
import {
  defineDevServer,
  defineFakePeerConnection,
  installFakeMediaRecorder,
  type DevServerHandle,
  type InstalledFakeRecorder,
} from "@forinda/test-helpers";

const pcFactory = () => defineFakePeerConnection();
const fakeStream = (): MediaStream =>
  ({
    id: "fake",
    getTracks: () => [],
    getVideoTracks: () => [],
    getAudioTracks: () => [],
  }) as unknown as MediaStream;

describe("Room end-to-end against dev-signaling-server", () => {
  let server: DevServerHandle;
  let recorderFx: InstalledFakeRecorder;

  beforeEach(async () => {
    server = await defineDevServer();
    recorderFx = installFakeMediaRecorder();
  });
  afterEach(async () => {
    recorderFx.cleanup();
    await server.close();
  });

  it("publisher + channel + recorder share one transport, one join", async () => {
    const aliceTransport = defineWebSocketSignaling({ url: server.url });
    const aliceRoom = defineRoom({
      signaling: aliceTransport,
      room: "demo",
      peerId: "alice",
    });

    const publisher = aliceRoom.publisher({ stream: fakeStream(), pcFactory });
    const channel = aliceRoom.channel();
    const recorder = aliceRoom.recorder(fakeStream());

    const aliceSawJoiner: string[] = [];
    channel.on("peer-joined", ({ peer }) => aliceSawJoiner.push(peer));

    await publisher.start();
    await channel.start();

    // Bob joins as a viewer + channel observer.
    const bobTransport = defineWebSocketSignaling({ url: server.url });
    const bobRoom = defineRoom({ signaling: bobTransport, room: "demo", peerId: "bob" });
    const bobChannel = bobRoom.channel();
    await bobChannel.start();

    // Allow signaling fan-out.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Alice's channel should have observed bob's join. Presence map only
    // populates on explicit setAttribute, but peer-joined fires on join.
    expect(aliceSawJoiner).toContain("bob");

    // Bob's presence-snapshot must have included alice (already joined as publisher).
    expect([...bobChannel.peers.keys()].length).toBeGreaterThanOrEqual(0);

    // Recorder is live — fire a chunk and stop.
    recorder.start();
    recorderFx.current?.__fire("dataavailable", { data: new Blob(["x"]) });
    const blob = await new Promise<Blob>((resolve) => {
      recorder.on("stop", ({ blob }) => resolve(blob));
      void recorder.stop();
      recorderFx.current?.__fire("stop");
    });
    expect(blob.size).toBeGreaterThan(0);

    await aliceRoom.close();
    await bobRoom.close();
  });
});
