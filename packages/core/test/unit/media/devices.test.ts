import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enumerateDevices, watchDevices } from "@/media/devices.ts";
import { installFakeMediaDevices } from "../../_mocks/fake-media-devices.ts";

let fixture: ReturnType<typeof installFakeMediaDevices>;

beforeEach(() => {
  fixture = installFakeMediaDevices();
});

afterEach(() => {
  fixture.cleanup();
});

const dev = (kind: MediaDeviceKind, deviceId: string, label = "", groupId = ""): MediaDeviceInfo =>
  ({
    deviceId,
    groupId,
    kind,
    label,
    toJSON: () => ({ deviceId, groupId, kind, label }),
  }) as MediaDeviceInfo;

describe("enumerateDevices", () => {
  it("groups devices by kind", async () => {
    fixture.enumerateDevices.mockResolvedValue([
      dev("audioinput", "mic-1", "Built-in Mic"),
      dev("audiooutput", "spk-1", "Headphones"),
      dev("videoinput", "cam-1", "FaceTime HD"),
      dev("videoinput", "cam-2", "External"),
    ]);
    const result = await enumerateDevices();
    expect(result.microphones.map((d) => d.deviceId)).toEqual(["mic-1"]);
    expect(result.speakers.map((d) => d.deviceId)).toEqual(["spk-1"]);
    expect(result.cameras.map((d) => d.deviceId)).toEqual(["cam-1", "cam-2"]);
  });

  it("dedupes by deviceId (some browsers list duplicates)", async () => {
    fixture.enumerateDevices.mockResolvedValue([
      dev("videoinput", "cam-1", "FaceTime HD"),
      dev("videoinput", "cam-1", "FaceTime HD"),
    ]);
    const result = await enumerateDevices();
    expect(result.cameras).toHaveLength(1);
  });

  it("returns empty arrays when no devices", async () => {
    fixture.enumerateDevices.mockResolvedValue([]);
    const result = await enumerateDevices();
    expect(result).toEqual({ cameras: [], microphones: [], speakers: [] });
  });
});

describe("watchDevices", () => {
  it("invokes callback once on subscription with current devices", async () => {
    fixture.enumerateDevices.mockResolvedValue([dev("videoinput", "cam-1", "Cam")]);
    const cb = vi.fn();
    const off = watchDevices(cb);
    await Promise.resolve();
    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]?.[0]?.cameras).toHaveLength(1);
    off();
  });

  it("re-invokes callback when devicechange fires", async () => {
    fixture.enumerateDevices.mockResolvedValue([dev("videoinput", "cam-1", "Cam")]);
    const cb = vi.fn();
    const off = watchDevices(cb);
    await Promise.resolve();
    await Promise.resolve();
    cb.mockClear();

    fixture.enumerateDevices.mockResolvedValue([
      dev("videoinput", "cam-1", "Cam"),
      dev("videoinput", "cam-2", "External"),
    ]);
    fixture.fireDeviceChange();
    await Promise.resolve();
    await Promise.resolve();
    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[cb.mock.calls.length - 1]?.[0]?.cameras).toHaveLength(2);
    off();
  });

  it("returned unsubscribe stops further callbacks", async () => {
    fixture.enumerateDevices.mockResolvedValue([]);
    const cb = vi.fn();
    const off = watchDevices(cb);
    await Promise.resolve();
    await Promise.resolve();
    cb.mockClear();
    off();

    fixture.fireDeviceChange();
    await Promise.resolve();
    expect(cb).not.toHaveBeenCalled();
  });
});
