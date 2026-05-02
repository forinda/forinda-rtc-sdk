import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineUploader } from "@/recording/uploader.ts";
import type { UploaderState } from "@/recording/uploader-types.ts";

function blob(size: number, type = "video/webm"): Blob {
  // Build a real Blob the size we asked for.
  const bytes = new Uint8Array(size);
  return new Blob([bytes], { type });
}

describe("defineUploader — happy path", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
  });

  it("POSTs each chunk to the configured url", async () => {
    const u = defineUploader({ url: "https://example.test/upload", fetchImpl });
    await u.send(blob(100));
    await u.send(blob(200));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchImpl.mock.calls[0]!;
    expect(firstUrl).toBe("https://example.test/upload");
    expect((firstInit as RequestInit).method).toBe("POST");
  });

  it("forwards configured headers and the chunk's mime type", async () => {
    const u = defineUploader({
      url: "https://example.test/upload",
      headers: { Authorization: "Bearer t" },
      fetchImpl,
    });
    await u.send(blob(100, "video/mp4"));

    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer t");
    expect(headers.get("Content-Type")).toBe("video/mp4");
  });

  it("uses keepalive for chunks at or below the threshold", async () => {
    const u = defineUploader({
      url: "https://example.test/upload",
      keepaliveThresholdBytes: 100,
      fetchImpl,
    });
    await u.send(blob(80));
    await u.send(blob(200));

    const initSmall = fetchImpl.mock.calls[0]![1] as RequestInit;
    const initLarge = fetchImpl.mock.calls[1]![1] as RequestInit;
    expect(initSmall.keepalive).toBe(true);
    expect(initLarge.keepalive).not.toBe(true);
  });

  it("emits ack with cumulative totals", async () => {
    const u = defineUploader({ url: "https://example.test/upload", fetchImpl });
    const acks: Array<{ bytes: number; totalBytes: number }> = [];
    u.on("ack", (e) => acks.push(e));

    await u.send(blob(100));
    await u.send(blob(50));

    expect(acks).toEqual([
      { bytes: 100, totalBytes: 100 },
      { bytes: 50, totalBytes: 150 },
    ]);
  });
});

describe("defineUploader — failure + recovery", () => {
  it("flips to failed on HTTP 5xx and emits error", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));
    const u = defineUploader({ url: "https://example.test/upload", fetchImpl });

    const states: UploaderState[] = [];
    const errors: Error[] = [];
    u.on("state", (s) => states.push(s));
    u.on("error", (e) => errors.push(e));

    await u.send(blob(100)).catch(() => {});
    expect(u.state).toBe("failed");
    expect(states).toContain("failed");
    expect(errors[0]?.message).toMatch(/503/);
  });

  it("retry() resends the queued chunk after a transient failure", async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) return new Response("nope", { status: 500 });
      return new Response("ok", { status: 200 });
    });
    const u = defineUploader({ url: "https://example.test/upload", fetchImpl });

    await u.send(blob(100)).catch(() => {});
    expect(u.state).toBe("failed");

    await u.retry();

    expect(u.state).toBe("idle");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects send when maxQueuedBytes would be exceeded", async () => {
    let resolveFetch: ((r: Response) => void) | undefined;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const u = defineUploader({
      url: "https://example.test/upload",
      maxQueuedBytes: 200,
      fetchImpl,
    });

    void u.send(blob(150));
    // Second chunk exceeds the cap (150 in-flight + 100 queued > 200).
    await expect(u.send(blob(100))).rejects.toMatchObject({
      code: "uploader_queue_overflow",
    });
    resolveFetch?.(new Response("ok", { status: 200 }));
  });
});

describe("defineUploader — close", () => {
  it("rejects subsequent sends after close()", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const u = defineUploader({ url: "https://example.test/upload", fetchImpl });
    u.close();
    expect(u.state).toBe("closed");
    await expect(u.send(blob(10))).rejects.toMatchObject({ code: "uploader_closed" });
  });
});
