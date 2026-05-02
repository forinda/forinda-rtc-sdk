import { describe, expect, it, vi } from "vitest";
import { ConfigurationError } from "@/errors/errors.ts";
import { replaceAudioTrack, replaceVideoTrack } from "@/media/track-replacer.ts";

const fakeSender = (kind: "audio" | "video") => {
  const replaceTrack = vi.fn(async () => undefined);
  return {
    track: { kind } as MediaStreamTrack,
    replaceTrack,
  } as unknown as RTCRtpSender;
};

const fakePcWith = (...senders: RTCRtpSender[]) =>
  ({
    getSenders: () => senders,
  }) as unknown as RTCPeerConnection;

const fakeTrack = (kind: "audio" | "video"): MediaStreamTrack => ({ kind }) as MediaStreamTrack;

describe("track-replacer", () => {
  it("replaceVideoTrack swaps the track on the matching sender", async () => {
    const videoSender = fakeSender("video");
    const audioSender = fakeSender("audio");
    const pc = fakePcWith(videoSender, audioSender);
    const newTrack = fakeTrack("video");

    await replaceVideoTrack(pc, newTrack);

    expect(videoSender.replaceTrack).toHaveBeenCalledWith(newTrack);
    expect(audioSender.replaceTrack).not.toHaveBeenCalled();
  });

  it("replaceAudioTrack swaps the track on the matching sender", async () => {
    const audioSender = fakeSender("audio");
    const pc = fakePcWith(audioSender);
    const newTrack = fakeTrack("audio");

    await replaceAudioTrack(pc, newTrack);

    expect(audioSender.replaceTrack).toHaveBeenCalledWith(newTrack);
  });

  it("throws ConfigurationError when no matching sender exists", async () => {
    const pc = fakePcWith(fakeSender("audio"));
    await expect(replaceVideoTrack(pc, fakeTrack("video"))).rejects.toBeInstanceOf(
      ConfigurationError,
    );
  });

  it("rejects when the new track kind does not match the helper", async () => {
    const pc = fakePcWith(fakeSender("video"));
    await expect(replaceVideoTrack(pc, fakeTrack("audio"))).rejects.toBeInstanceOf(
      ConfigurationError,
    );
  });
});
