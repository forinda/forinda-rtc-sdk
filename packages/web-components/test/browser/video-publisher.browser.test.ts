import { describe, expect, it } from "vitest";
import { ForindaVideoPublisher } from "@/elements/video-publisher.ts";
import { registerAll } from "@/elements/register.ts";

describe("<forinda-video-publisher> in real Chromium (EPIC-8)", () => {
  it("acquires a real getUserMedia stream when source=camera", async () => {
    registerAll();
    const el = document.createElement("forinda-video-publisher") as ForindaVideoPublisher;
    el.setAttribute("source", "camera");
    el.setAttribute("audio", "");
    el.setAttribute("video", "");
    el.setAttribute("manual-play", "");
    el.setAttribute("room", "demo");
    el.setAttribute("signaling-url", "ws://127.0.0.1:9");
    document.body.appendChild(el);

    // Wait for the element to acquire media. We hook into the `ready` event
    // which fires after getUserMedia resolves and the publisher is constructed.
    const stream = await new Promise<MediaStream>((resolve) => {
      el.addEventListener("ready", (e) =>
        resolve((e as CustomEvent<{ stream: MediaStream }>).detail.stream),
      );
    });
    expect(stream.getTracks().length).toBeGreaterThan(0);
    el.remove();
  });
});
