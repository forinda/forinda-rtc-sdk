import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CODEC_PREFERENCES,
  isRecordingTypeSupported,
  pickRecordingType,
} from "@/recording/codec-support.ts";
import { installFakeMediaRecorder, type InstalledFakeRecorder } from "@forinda/test-helpers";

let fixture: InstalledFakeRecorder;

beforeEach(() => {
  fixture = installFakeMediaRecorder();
});

afterEach(() => {
  fixture.cleanup();
});

describe("isRecordingTypeSupported", () => {
  it("returns true for any type when MediaRecorder accepts everything", () => {
    expect(isRecordingTypeSupported("video/webm;codecs=vp9,opus")).toBe(true);
    expect(isRecordingTypeSupported("video/mp4")).toBe(true);
  });

  it("returns false when MediaRecorder rejects the type", () => {
    fixture.setSupported((m) => m === "video/webm");
    expect(isRecordingTypeSupported("video/webm")).toBe(true);
    expect(isRecordingTypeSupported("video/webm;codecs=vp9,opus")).toBe(false);
  });

  it("returns false when MediaRecorder is unavailable", () => {
    fixture.cleanup();
    expect(isRecordingTypeSupported("video/webm")).toBe(false);
  });
});

describe("pickRecordingType", () => {
  it("returns the first supported entry", () => {
    fixture.setSupported((m) => m === "video/webm;codecs=vp8,opus" || m === "video/webm");
    const picked = pickRecordingType(DEFAULT_CODEC_PREFERENCES);
    expect(picked).toBe("video/webm;codecs=vp8,opus");
  });

  it("returns null when nothing matches", () => {
    fixture.setSupported(() => false);
    expect(pickRecordingType(["video/webm", "video/mp4"])).toBeNull();
  });

  it("respects the order of the preference list", () => {
    fixture.setSupported(() => true);
    expect(pickRecordingType(["video/mp4", "video/webm"])).toBe("video/mp4");
    expect(pickRecordingType(["video/webm", "video/mp4"])).toBe("video/webm");
  });
});
