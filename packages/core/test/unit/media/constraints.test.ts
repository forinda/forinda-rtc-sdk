import { describe, expect, it } from "vitest";
import { buildConstraints, type CaptureOptions } from "@/media/constraints.ts";

describe("buildConstraints", () => {
  it("audio:true + video:true -> both true", () => {
    expect(buildConstraints({ audio: true, video: true })).toEqual({
      audio: true,
      video: true,
    });
  });

  it("audio:false + video:true -> video only", () => {
    expect(buildConstraints({ audio: false, video: true })).toEqual({
      audio: false,
      video: true,
    });
  });

  it("video options expand into MediaTrackConstraints", () => {
    const opts: CaptureOptions = {
      audio: true,
      video: { width: 1280, height: 720, facingMode: "user" },
    };
    expect(buildConstraints(opts)).toEqual({
      audio: true,
      video: { width: 1280, height: 720, facingMode: "user" },
    });
  });

  it("audio options expand into MediaTrackConstraints", () => {
    expect(
      buildConstraints({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }),
    ).toEqual({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
  });

  it("deviceId hint is forwarded for both kinds", () => {
    expect(
      buildConstraints({
        audio: { deviceId: "mic-1" },
        video: { deviceId: "cam-2" },
      }),
    ).toEqual({
      audio: { deviceId: "mic-1" },
      video: { deviceId: "cam-2" },
    });
  });

  it("default opts (empty object) -> audio:true + video:true", () => {
    expect(buildConstraints({})).toEqual({ audio: true, video: true });
  });

  it("either side false stays false (does not coerce to true)", () => {
    expect(buildConstraints({ audio: false, video: false })).toEqual({
      audio: false,
      video: false,
    });
  });
});
