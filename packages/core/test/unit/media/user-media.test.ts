import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DeviceInUseError,
  DeviceNotFoundError,
  OverconstrainedError,
  PermissionDeniedError,
  SdkError,
} from "@/errors/errors.ts";
import { getUserMedia } from "@/media/user-media.ts";
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

describe("getUserMedia", () => {
  it("returns the stream when getUserMedia resolves", async () => {
    const stream = fakeMediaStream();
    fixture.getUserMedia.mockResolvedValue(stream);
    const result = await getUserMedia({ audio: true, video: true });
    expect(result).toBe(stream);
    expect(fixture.getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
  });

  it("maps NotAllowedError -> PermissionDeniedError", async () => {
    fixture.getUserMedia.mockRejectedValue(new FakeDOMException("NotAllowedError", "denied"));
    await expect(getUserMedia({ audio: true })).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("maps NotFoundError -> DeviceNotFoundError", async () => {
    fixture.getUserMedia.mockRejectedValue(new FakeDOMException("NotFoundError", "no device"));
    await expect(getUserMedia({ video: true })).rejects.toBeInstanceOf(DeviceNotFoundError);
  });

  it("maps NotReadableError -> DeviceInUseError", async () => {
    fixture.getUserMedia.mockRejectedValue(new FakeDOMException("NotReadableError", "in use"));
    await expect(getUserMedia({ video: true })).rejects.toBeInstanceOf(DeviceInUseError);
  });

  it("maps OverconstrainedError -> OverconstrainedError", async () => {
    fixture.getUserMedia.mockRejectedValue(
      new FakeDOMException("OverconstrainedError", "bad constraint"),
    );
    await expect(getUserMedia({ video: true })).rejects.toBeInstanceOf(OverconstrainedError);
  });

  it("falls back to SdkError for unknown DOMException names", async () => {
    fixture.getUserMedia.mockRejectedValue(new FakeDOMException("AbortError", "aborted"));
    const err = await getUserMedia({ video: true }).catch((e) => e);
    expect(err).toBeInstanceOf(SdkError);
    expect(err).not.toBeInstanceOf(PermissionDeniedError);
  });

  it("preserves the underlying DOMException as cause", async () => {
    const cause = new FakeDOMException("NotAllowedError", "denied");
    fixture.getUserMedia.mockRejectedValue(cause);
    const err: PermissionDeniedError = await getUserMedia({ audio: true }).catch((e) => e);
    expect(err.cause).toBe(cause);
  });

  it("throws ConfigurationError when navigator.mediaDevices is unavailable", async () => {
    fixture.cleanup();
    await expect(getUserMedia({ audio: true })).rejects.toThrow(/mediaDevices/);
  });
});
