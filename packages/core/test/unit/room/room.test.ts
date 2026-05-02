import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigurationError } from "@/errors/errors.ts";
import { defineRoom, type Room } from "@/room/room.ts";
import {
  defineEngineFixture,
  defineFakePeerConnection,
  type EngineFixture,
} from "@forinda/test-helpers";

const pcFactory = () => defineFakePeerConnection();

describe("defineRoom — single-join coordination", () => {
  let fx: EngineFixture;
  let room: Room;
  beforeEach(async () => {
    fx = defineEngineFixture();
    const transport = await fx.open("sa");
    room = defineRoom({ signaling: transport, room: "demo", peerId: "alice" });
  });
  afterEach(async () => {
    await room.close();
    await fx.closeAll();
  });

  it("ensureConnected opens the transport once even under concurrent calls", async () => {
    const connectSpy = vi.spyOn(room.signaling, "connect");

    await Promise.all([room.ensureConnected(), room.ensureConnected(), room.ensureConnected()]);

    expect(connectSpy).toHaveBeenCalledOnce();
    expect(room.state).toBe("connected");
  });

  it("ensureJoined sends one join when called concurrently with the same role", async () => {
    const sendSpy = vi.spyOn(room.signaling, "send");

    await Promise.all([
      room.ensureJoined("publisher"),
      room.ensureJoined("publisher"),
      room.ensureJoined("publisher"),
    ]);

    const joinCalls = sendSpy.mock.calls.filter(([m]) => m.type === "join");
    expect(joinCalls).toHaveLength(1);
    expect(room.role).toBe("publisher");
  });

  it("rejects ensureJoined with a different role after first claim", async () => {
    await room.ensureJoined("publisher");
    await expect(room.ensureJoined("viewer")).rejects.toBeInstanceOf(ConfigurationError);
  });

  it("close() sends a leave when the Room had joined", async () => {
    await room.ensureJoined("presence");
    const sendSpy = vi.spyOn(room.signaling, "send");

    await room.close();

    const leaveCalls = sendSpy.mock.calls.filter(([m]) => m.type === "leave");
    expect(leaveCalls).toHaveLength(1);
    expect(room.state).toBe("closed");
  });

  it("a closed Room throws on ensureConnected", async () => {
    await room.close();
    await expect(room.ensureConnected()).rejects.toBeInstanceOf(ConfigurationError);
  });
});

describe("defineRoom — sugar factories share the join", () => {
  let fx: EngineFixture;
  beforeEach(() => {
    fx = defineEngineFixture();
  });
  afterEach(async () => {
    await fx.closeAll();
  });

  it("publisher + channel under one Room produce exactly one peer-joined fanout", async () => {
    // Spy on the engine's outbound deliveries by spinning a second peer that
    // observes them. If we issued two joins, observer would receive two
    // peer-joined messages for "alice". With Room coordination, exactly one.
    const observerTransport = await fx.open("sb");
    await observerTransport.connect();
    const observerJoined: string[] = [];
    observerTransport.on("message", (msg) => {
      if (msg.type === "peer-joined") observerJoined.push(`${msg.peer}/${msg.role}`);
    });
    await observerTransport.send({
      type: "join",
      room: "demo",
      peer: "bob",
      role: "viewer",
    });

    const aliceTransport = await fx.open("sa");
    const room = defineRoom({ signaling: aliceTransport, room: "demo", peerId: "alice" });
    const channel = room.channel();
    await channel.start();

    await Promise.resolve();
    await Promise.resolve();

    expect(observerJoined).toEqual(["alice/presence"]);

    await room.close();
  });

  it("publisher under Room joins as 'publisher' and channel piggybacks", async () => {
    const observer = await fx.open("sb");
    await observer.connect();
    const observerJoined: string[] = [];
    observer.on("message", (msg) => {
      if (msg.type === "peer-joined") observerJoined.push(`${msg.peer}/${msg.role}`);
    });
    await observer.send({ type: "join", room: "demo", peer: "bob", role: "presence" });

    const aliceT = await fx.open("sa");
    const room = defineRoom({ signaling: aliceT, room: "demo", peerId: "alice" });
    const fakeStream = { getTracks: () => [] } as unknown as MediaStream;
    const publisher = room.publisher({ stream: fakeStream, pcFactory });
    const channel = room.channel();

    // start publisher first → role becomes "publisher"
    await publisher.start();
    await channel.start();

    await Promise.resolve();
    await Promise.resolve();

    expect(observerJoined).toEqual(["alice/publisher"]);
    expect(room.role).toBe("publisher");

    await publisher.stop();
    await room.close();
  });

  it("viewer + channel under one Room produces one viewer join", async () => {
    const aliceT = await fx.open("sa");
    const aliceRoom = defineRoom({ signaling: aliceT, room: "demo", peerId: "alice" });
    const fakeStream = { getTracks: () => [] } as unknown as MediaStream;
    const publisher = aliceRoom.publisher({ stream: fakeStream, pcFactory });
    await publisher.start();

    const observerJoined: string[] = [];
    aliceT.on("message", (msg) => {
      if (msg.type === "peer-joined") observerJoined.push(`${msg.peer}/${msg.role}`);
    });

    const bobT = await fx.open("sb");
    const bobRoom = defineRoom({ signaling: bobT, room: "demo", peerId: "bob" });
    const viewer = bobRoom.viewer({ publisherId: "alice", pcFactory });
    const bobChannel = bobRoom.channel();
    await viewer.start();
    await bobChannel.start();

    await Promise.resolve();
    await Promise.resolve();

    expect(observerJoined).toEqual(["bob/viewer"]);

    await publisher.stop();
    await aliceRoom.close();
    await bobRoom.close();
  });
});

describe("Room — directors set (EPIC-12)", () => {
  let fx: EngineFixture;
  beforeEach(() => {
    fx = defineEngineFixture();
  });
  afterEach(async () => {
    await fx.closeAll();
  });

  it("starts empty; the joining director appears in directors", async () => {
    const transport = await fx.open("sa");
    const room = defineRoom({ signaling: transport, room: "demo", peerId: "alice" });

    expect(room.directors).toEqual([]);
    await room.ensureConnected();
    await room.ensureJoined("director");
    expect(room.directors).toEqual(["alice"]);

    await room.close();
  });

  it("adds remote directors via peer-joined events", async () => {
    const aliceT = await fx.open("sa");
    const aliceRoom = defineRoom({ signaling: aliceT, room: "demo", peerId: "alice" });
    await aliceRoom.ensureConnected();
    await aliceRoom.ensureJoined("director");

    const bobT = await fx.open("sb");
    const bobRoom = defineRoom({ signaling: bobT, room: "demo", peerId: "bob" });
    await bobRoom.ensureConnected();
    await bobRoom.ensureJoined("presence");

    // Allow alice to receive bob's peer-joined.
    await Promise.resolve();

    expect([...aliceRoom.directors].sort()).toEqual(["alice"]);
    expect([...bobRoom.directors].sort()).toEqual(["alice"]);

    await aliceRoom.close();
    await bobRoom.close();
  });
});
