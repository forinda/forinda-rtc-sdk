import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { useDevices } from "@/use-devices.ts";
import { withScope } from "../_helpers/with-scope.ts";

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
    const { result, dispose } = withScope(() => useDevices());
    expect(result.cameras.value).toEqual([]);

    // watchDevices runs an immediate enumeration; flush microtasks.
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));

    expect(result.cameras.value).toHaveLength(1);
    expect(result.cameras.value[0]?.deviceId).toBe("cam-1");
    expect(result.microphones.value[0]?.deviceId).toBe("mic-1");
    dispose();
  });

  it("re-enumerates on devicechange", async () => {
    deviceList = [dev("videoinput", "cam-1")];
    const { result, dispose } = withScope(() => useDevices());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.cameras.value).toHaveLength(1);

    deviceList = [dev("videoinput", "cam-1"), dev("videoinput", "cam-2")];
    for (const l of listeners) l();
    await new Promise((r) => setTimeout(r, 0));
    expect(result.cameras.value).toHaveLength(2);
    dispose();
  });

  it("exposes a refresh function", async () => {
    deviceList = [dev("videoinput", "cam-1")];
    const { result, dispose } = withScope(() => useDevices());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.cameras.value).toHaveLength(1);

    deviceList = [dev("videoinput", "cam-1"), dev("videoinput", "cam-2")];
    await result.refresh();
    expect(result.cameras.value).toHaveLength(2);
    dispose();
  });

  it("removes the devicechange listener on scope dispose", async () => {
    const { dispose } = withScope(() => useDevices());
    await new Promise((r) => setTimeout(r, 0));
    expect(listeners.size).toBe(1);
    dispose();
    expect(listeners.size).toBe(0);
  });
});
