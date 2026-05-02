import { describe, expect, it } from "vitest";
import type { ChatHistoryEntry } from "@forinda/video-sdk-core";
import { useChat } from "@/use-chat.ts";
import { defineFakeRoomChannel } from "../_helpers/fake-room-channel.ts";
import { withScope } from "../_helpers/with-scope.ts";

describe("useChat", () => {
  it("returns empty messages for a null channel", () => {
    const { result, dispose } = withScope(() => useChat(null));
    expect(result.messages.value).toEqual([]);
    dispose();
  });

  it("snapshots existing chat history on mount", () => {
    const ch = defineFakeRoomChannel("alice");
    (ch.chatHistory as unknown as ChatHistoryEntry[]).push({
      type: "chat",
      from: "bob",
      body: "hi",
      ts: 1,
      receivedAt: 1,
    });
    const { result, dispose } = withScope(() => useChat(ch));
    expect(result.messages.value).toHaveLength(1);
    expect(result.messages.value[0]?.body).toBe("hi");
    dispose();
  });

  it("updates on chat event via send()", async () => {
    const ch = defineFakeRoomChannel("alice");
    const { result, dispose } = withScope(() => useChat(ch));
    await result.send("hello");
    expect(result.messages.value).toHaveLength(1);
    expect(result.messages.value[0]?.body).toBe("hello");
    expect(result.messages.value[0]?.from).toBe("alice");
    dispose();
  });

  it("forwards opts.to for direct messages", async () => {
    const ch = defineFakeRoomChannel("alice");
    const { result, dispose } = withScope(() => useChat(ch));
    await result.send("hi bob", { to: "bob" });
    expect(result.messages.value[0]?.to).toBe("bob");
    dispose();
  });
});

describe("useChat — EPIC-20 surface", () => {
  it("send() returns the entry id", async () => {
    const ch = defineFakeRoomChannel("alice");
    (ch.sendChat as unknown) = async (body: string) => {
      const id = `id-${body}`;
      (ch.chatHistory as unknown as ChatHistoryEntry[]).push({
        type: "chat",
        from: "alice",
        body,
        ts: 1,
        receivedAt: 1,
        id,
        status: "confirmed",
      });
      return id;
    };

    const { result, dispose } = withScope(() => useChat(ch));

    const returned = await result.send("hello");
    expect(returned).toBe("id-hello");

    dispose();
  });

  it("returns empty string when no channel", async () => {
    const { result, dispose } = withScope(() => useChat(null));
    const returned = await result.send("hello");
    expect(returned).toBe("");
    dispose();
  });
});
