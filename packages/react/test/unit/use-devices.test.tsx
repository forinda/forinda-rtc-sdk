import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useDevices } from "@/use-devices.ts";

interface MediaDeviceInfoLite {
  deviceId: string;
  groupId: string;
  kind: MediaDeviceKind;
  label: string;
}

const dev = (kind: MediaDeviceKind, deviceId: string, label = ""): MediaDeviceInfoLite => ({
  deviceId,
  groupId: "",
  kind,
  label,
});

let listeners: Set<() => void>;
let deviceList: MediaDeviceInfoLite[];

beforeEach(() => {
  listeners = new Set();
  deviceList = [];

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      enumerateDevices: async () => deviceList,
      addEventListener: (event: string, handler: () => void) => {
        if (event === "devicechange") listeners.add(handler);
      },
      removeEventListener: (event: string, handler: () => void) => {
        if (event === "devicechange") listeners.delete(handler);
      },
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("useDevices", () => {
  it("returns empty arrays initially, then populated devices", async () => {
    deviceList = [dev("videoinput", "cam-1", "Camera"), dev("audioinput", "mic-1", "Mic")];
    const { result } = renderHook(() => useDevices());
    expect(result.current.cameras).toEqual([]);
    await waitFor(() => {
      expect(result.current.cameras).toHaveLength(1);
    });
    expect(result.current.cameras[0]?.deviceId).toBe("cam-1");
    expect(result.current.microphones[0]?.deviceId).toBe("mic-1");
  });

  it("re-renders on devicechange", async () => {
    deviceList = [dev("videoinput", "cam-1")];
    const { result } = renderHook(() => useDevices());
    await waitFor(() => {
      expect(result.current.cameras).toHaveLength(1);
    });

    deviceList = [dev("videoinput", "cam-1"), dev("videoinput", "cam-2")];
    act(() => {
      for (const l of listeners) l();
    });
    await waitFor(() => {
      expect(result.current.cameras).toHaveLength(2);
    });
  });

  it("exposes a refresh function", async () => {
    deviceList = [dev("videoinput", "cam-1")];
    const { result } = renderHook(() => useDevices());
    await waitFor(() => {
      expect(result.current.cameras).toHaveLength(1);
    });

    deviceList = [dev("videoinput", "cam-1"), dev("videoinput", "cam-2")];
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.cameras).toHaveLength(2);
  });
});
