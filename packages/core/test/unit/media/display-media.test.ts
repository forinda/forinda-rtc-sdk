import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ConfigurationError,
  DeviceInUseError,
  DeviceNotFoundError,
  OverconstrainedError,
  PermissionDeniedError,
  SdkError,
} from "@/errors/errors.ts";
import { getDisplayMedia } from "@/media/display-media.ts";
import { fakeMediaStream, installFakeMediaDevices } from "../../_mocks/fake-media-devices.ts";

let fixture: ReturnType<typeof installFakeMediaDevices>;

beforeEach(() => {
  fixture = installFakeMediaDevices();
});

afterEach(() => {
  fixture.cleanup();
});

class FakeDOMException extends Error {
  override readonly name: string;
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

describe("getDisplayMedia", () => {
  it("returns the stream when getDisplayMedia resolves", async () => {
    const stream = fakeMediaStream(["video"]);
    fixture.getDisplayMedia.mockResolvedValue(stream);
    const result = await getDisplayMedia();
    expect(result).toBe(stream);
    expect(fixture.getDisplayMedia).toHaveBeenCalledWith({ audio: false, video: true });
  });

  it("forwards explicit audio + video constraints", async () => {
    const stream = fakeMediaStream(["audio", "video"]);
    fixture.getDisplayMedia.mockResolvedValue(stream);
    await getDisplayMedia({ audio: true, video: { frameRate: 30 } });
    expect(fixture.getDisplayMedia).toHaveBeenCalledWith({
      audio: true,
      video: { frameRate: 30 },
    });
  });

  it("maps NotAllowedError -> PermissionDeniedError", async () => {
    fixture.getDisplayMedia.mockRejectedValue(new FakeDOMException("NotAllowedError", "denied"));
    await expect(getDisplayMedia()).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("maps AbortError (user cancelled picker) -> PermissionDeniedError", async () => {
    fixture.getDisplayMedia.mockRejectedValue(new FakeDOMException("AbortError", "user cancelled"));
    await expect(getDisplayMedia()).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("maps NotFoundError -> DeviceNotFoundError", async () => {
    fixture.getDisplayMedia.mockRejectedValue(new FakeDOMException("NotFoundError", "no display"));
    await expect(getDisplayMedia()).rejects.toBeInstanceOf(DeviceNotFoundError);
  });

  it("maps NotReadableError -> DeviceInUseError", async () => {
    fixture.getDisplayMedia.mockRejectedValue(new FakeDOMException("NotReadableError", "in use"));
    await expect(getDisplayMedia()).rejects.toBeInstanceOf(DeviceInUseError);
  });

  it("maps OverconstrainedError -> OverconstrainedError", async () => {
    fixture.getDisplayMedia.mockRejectedValue(
      new FakeDOMException("OverconstrainedError", "bad constraint"),
    );
    await expect(getDisplayMedia()).rejects.toBeInstanceOf(OverconstrainedError);
  });

  it("maps TypeError -> ConfigurationError", async () => {
    fixture.getDisplayMedia.mockRejectedValue(new FakeDOMException("TypeError", "bad opts"));
    await expect(getDisplayMedia()).rejects.toBeInstanceOf(ConfigurationError);
  });

  it("falls back to SdkError for unknown DOMException names", async () => {
    fixture.getDisplayMedia.mockRejectedValue(new FakeDOMException("WeirdError", "unknown"));
    await expect(getDisplayMedia()).rejects.toBeInstanceOf(SdkError);
  });

  it("throws ConfigurationError when getDisplayMedia is not available", async () => {
    fixture.cleanup();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => Promise.resolve(fakeMediaStream()) },
    });
    await expect(getDisplayMedia()).rejects.toBeInstanceOf(ConfigurationError);
  });
});
