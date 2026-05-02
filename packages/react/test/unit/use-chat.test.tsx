import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useChat } from "@/use-chat.ts";
import { defineFakeRoomChannel } from "./_helpers/fake-room-channel.ts";

describe("useChat", () => {
  it("returns empty messages when channel is null", () => {
    const { result } = renderHook(() => useChat(null));
    expect(result.current.messages).toEqual([]);
  });

  it("re-renders when a 'chat' event arrives", async () => {
    const ch = defineFakeRoomChannel();
    const { result } = renderHook(() => useChat(ch));

    await act(async () => {
      await ch.sendChat("hello");
    });

    expect(result.current.messages.map((m) => m.body)).toEqual(["hello"]);
  });

  it("send proxies to the channel and supports DMs", async () => {
    const ch = defineFakeRoomChannel();
    const { result } = renderHook(() => useChat(ch));

    await act(async () => {
      await result.current.send("psst", { to: "bob" });
    });

    expect(ch.sendChat).toHaveBeenCalledWith("psst", { to: "bob" });
    expect(result.current.messages[0]?.to).toBe("bob");
  });
});

describe("useChat — EPIC-20 surface", () => {
  it("send() returns the entry id", async () => {
    const ch = defineFakeRoomChannel("alice");
    ch.sendChat = vi.fn(async (body: string) => {
      const id = `id-${body}`;
      (ch.chatHistory as unknown as Array<unknown>).push({
        type: "chat",
        from: "alice",
        body,
        ts: 1,
        receivedAt: 1,
        id,
        status: "confirmed" as const,
      });
      return id;
    }) as unknown as typeof ch.sendChat;

    const { result } = renderHook(() => useChat(ch));

    let returned = "";
    await act(async () => {
      returned = await result.current.send("hello");
    });

    expect(returned).toBe("id-hello");
  });
});
