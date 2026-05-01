import { describe, expect, it } from "vitest";
import { RoomFullError } from "@/errors.ts";
import { defineRoom, Room } from "@/rooms.ts";

const peer = (
  peerId: string,
  socketId = `s-${peerId}`,
  role: "publisher" | "viewer" = "publisher",
) => ({
  peerId,
  socketId,
  role,
});

describe("Room", () => {
  it("starts empty", () => {
    const room = defineRoom({ id: "demo", capacity: 10 });
    expect(room.id).toBe("demo");
    expect(room.size).toBe(0);
    expect(room.peers()).toEqual([]);
  });

  it("adds a peer", () => {
    const room = defineRoom({ id: "demo", capacity: 10 });
    room.add(peer("alice"));
    expect(room.size).toBe(1);
    expect(room.has("alice")).toBe(true);
    expect(room.peers().map((p) => p.peerId)).toEqual(["alice"]);
  });

  it("removes a peer by id", () => {
    const room = defineRoom({ id: "demo", capacity: 10 });
    room.add(peer("alice"));
    room.add(peer("bob"));
    const removed = room.remove("alice");
    expect(removed?.peerId).toBe("alice");
    expect(room.size).toBe(1);
    expect(room.has("alice")).toBe(false);
  });

  it("removeBySocket finds peer by socketId", () => {
    const room = defineRoom({ id: "demo", capacity: 10 });
    room.add(peer("alice", "socket-1"));
    const removed = room.removeBySocket("socket-1");
    expect(removed?.peerId).toBe("alice");
    expect(room.size).toBe(0);
  });

  it("removeBySocket returns undefined when no match", () => {
    const room = defineRoom({ id: "demo", capacity: 10 });
    expect(room.removeBySocket("nope")).toBeUndefined();
  });

  it("add throws RoomFullError when capacity reached", () => {
    const room = defineRoom({ id: "demo", capacity: 2 });
    room.add(peer("a"));
    room.add(peer("b"));
    expect(() => room.add(peer("c"))).toThrow(RoomFullError);
  });

  it("add replaces an existing peer with the same id (rejoin)", () => {
    const room = defineRoom({ id: "demo", capacity: 10 });
    room.add(peer("alice", "socket-1", "publisher"));
    room.add(peer("alice", "socket-2", "viewer"));
    expect(room.size).toBe(1);
    expect(room.get("alice")?.socketId).toBe("socket-2");
    expect(room.get("alice")?.role).toBe("viewer");
  });

  it("peers() returns a readonly snapshot, not the live map", () => {
    const room = defineRoom({ id: "demo", capacity: 10 });
    room.add(peer("alice"));
    const snap = room.peers();
    room.add(peer("bob"));
    expect(snap).toHaveLength(1);
  });

  it("isFull reflects current size", () => {
    const room = defineRoom({ id: "demo", capacity: 2 });
    expect(room.isFull()).toBe(false);
    room.add(peer("a"));
    expect(room.isFull()).toBe(false);
    room.add(peer("b"));
    expect(room.isFull()).toBe(true);
  });
});
