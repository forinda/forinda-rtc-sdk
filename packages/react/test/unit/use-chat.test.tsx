import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
