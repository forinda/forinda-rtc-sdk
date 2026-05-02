import { describe, expect, it } from "vitest";
import { getUserMedia } from "@/media/user-media.ts";

describe("getUserMedia in real Chromium (EPIC-8)", () => {
  it("resolves with a stream containing a real video track", async () => {
    const stream = await getUserMedia({ video: true, audio: false });
    const tracks = stream.getVideoTracks();
    expect(tracks.length).toBe(1);
    expect(tracks[0]?.kind).toBe("video");
    for (const t of stream.getTracks()) t.stop();
  });
});
