/**
 * Hot-swap helpers for `RTCRtpSender.replaceTrack`.
 *
 * Used by Publisher (EPIC-3b) when the consumer changes camera/microphone
 * mid-call. Finds the sender whose current track matches the requested kind
 * (`video` or `audio`) and calls `replaceTrack` — does not renegotiate.
 *
 * Throws {@link ConfigurationError} when no matching sender exists or the
 * supplied track is the wrong kind. Both indicate consumer bugs (you can't
 * replace a video track on a call that never published video).
 */

import { ConfigurationError } from "@/errors/errors.ts";

async function replaceTrackByKind(
  pc: RTCPeerConnection,
  kind: "audio" | "video",
  newTrack: MediaStreamTrack,
): Promise<void> {
  if (newTrack.kind !== kind) {
    throw new ConfigurationError(
      `replace${kind}Track expected a ${kind} track, got ${newTrack.kind}`,
    );
  }
  const sender = pc.getSenders().find((s) => s.track?.kind === kind);
  if (sender === undefined) {
    throw new ConfigurationError(`no ${kind} sender on this peer connection`);
  }
  await sender.replaceTrack(newTrack);
}

/** Swap the video track on the first video `RTCRtpSender`. */
export async function replaceVideoTrack(
  pc: RTCPeerConnection,
  newTrack: MediaStreamTrack,
): Promise<void> {
  await replaceTrackByKind(pc, "video", newTrack);
}

/** Swap the audio track on the first audio `RTCRtpSender`. */
export async function replaceAudioTrack(
  pc: RTCPeerConnection,
  newTrack: MediaStreamTrack,
): Promise<void> {
  await replaceTrackByKind(pc, "audio", newTrack);
}
