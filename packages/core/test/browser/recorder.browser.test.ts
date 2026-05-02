import { describe, expect, it } from "vitest";
import { defineRecorder } from "@/recording/recorder.ts";
import { getUserMedia } from "@/media/user-media.ts";

describe("Recorder against real MediaRecorder (EPIC-8)", () => {
  it("records ≥100ms of synthetic media to a non-empty Blob", async () => {
    const stream = await getUserMedia({ video: true, audio: false });
    const recorder = defineRecorder(stream, { timesliceMs: 100 });
    const blobPromise = new Promise<Blob>((resolve) => {
      recorder.on("stop", ({ blob }) => resolve(blob));
    });
    recorder.start();
    await new Promise((r) => setTimeout(r, 200));
    await recorder.stop();
    const blob = await blobPromise;
    expect(blob.size).toBeGreaterThan(0);
    for (const t of stream.getTracks()) t.stop();
  });
});
