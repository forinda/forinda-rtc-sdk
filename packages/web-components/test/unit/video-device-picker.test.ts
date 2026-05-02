import { describe, expect, it, vi } from "vitest";
import { ForindaVideoDevicePicker } from "@/elements/video-device-picker.ts";
import type { DeviceList } from "@forinda/video-sdk-core";

if (!customElements.get(ForindaVideoDevicePicker.tagName)) {
  customElements.define(ForindaVideoDevicePicker.tagName, ForindaVideoDevicePicker);
}

function makeEl(attrs: Record<string, string>): ForindaVideoDevicePicker {
  const el = document.createElement(ForindaVideoDevicePicker.tagName) as ForindaVideoDevicePicker;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function defineFakeWatcher() {
  let cb: ((d: DeviceList) => void) | null = null;
  const unsubscribe = vi.fn();
  const watcher = (callback: (d: DeviceList) => void): (() => void) => {
    cb = callback;
    return unsubscribe;
  };
  const emit = (d: DeviceList): void => {
    cb?.(d);
  };
  return { watcher, emit, unsubscribe };
}

const sampleDevices: DeviceList = {
  cameras: [
    {
      deviceId: "cam-1",
      kind: "videoinput",
      label: "Front Camera",
      groupId: "g1",
    } as MediaDeviceInfo,
    {
      deviceId: "cam-2",
      kind: "videoinput",
      label: "Back Camera",
      groupId: "g1",
    } as MediaDeviceInfo,
  ],
  microphones: [
    {
      deviceId: "mic-1",
      kind: "audioinput",
      label: "Built-in Mic",
      groupId: "g2",
    } as MediaDeviceInfo,
  ],
  speakers: [],
};

describe("<forinda-video-device-picker>", () => {
  it("renders a select with placeholder + camera options by default", async () => {
    const { watcher, emit } = defineFakeWatcher();
    const el = makeEl({});
    el.overrides = { watchDevices: watcher as never };
    document.body.appendChild(el);
    emit(sampleDevices);
    await Promise.resolve();
    const select = el.shadowRoot?.querySelector("select") as HTMLSelectElement;
    expect(select.options.length).toBe(3);
    expect(select.options[0]?.disabled).toBe(true);
    expect(select.options[1]?.value).toBe("cam-1");
    expect(select.options[2]?.value).toBe("cam-2");
    el.remove();
  });

  it("respects kind=microphone", async () => {
    const { watcher, emit } = defineFakeWatcher();
    const el = makeEl({ kind: "microphone" });
    el.overrides = { watchDevices: watcher as never };
    document.body.appendChild(el);
    emit(sampleDevices);
    await Promise.resolve();
    const select = el.shadowRoot?.querySelector("select") as HTMLSelectElement;
    expect(select.options[1]?.value).toBe("mic-1");
    expect(select.options[1]?.textContent).toBe("Built-in Mic");
    el.remove();
  });

  it("emits 'change' event with deviceId when selection changes", async () => {
    const { watcher, emit } = defineFakeWatcher();
    const el = makeEl({});
    el.overrides = { watchDevices: watcher as never };
    const handler = vi.fn();
    el.addEventListener("change", handler);
    document.body.appendChild(el);
    emit(sampleDevices);
    await Promise.resolve();

    const select = el.shadowRoot?.querySelector("select") as HTMLSelectElement;
    select.value = "cam-2";
    select.dispatchEvent(new Event("change"));

    expect(handler).toHaveBeenCalledOnce();
    const detail = (handler.mock.calls[0]?.[0] as CustomEvent<{ deviceId: string }>).detail;
    expect(detail.deviceId).toBe("cam-2");
    el.remove();
  });

  it("preserves current selection across hotplug refreshes when device still present", async () => {
    const { watcher, emit } = defineFakeWatcher();
    const el = makeEl({});
    el.overrides = { watchDevices: watcher as never };
    document.body.appendChild(el);
    emit(sampleDevices);
    await Promise.resolve();

    const select = el.shadowRoot?.querySelector("select") as HTMLSelectElement;
    select.value = "cam-2";

    emit({ ...sampleDevices });
    await Promise.resolve();
    expect(select.value).toBe("cam-2");
    el.remove();
  });

  it("emits an error when watcher throws on connect", async () => {
    const el = makeEl({});
    el.overrides = {
      watchDevices: (() => {
        throw "no media";
      }) as never,
    };
    const handler = vi.fn();
    el.addEventListener("error", handler);
    document.body.appendChild(el);
    expect(handler).toHaveBeenCalledOnce();
    const detail = (handler.mock.calls[0]?.[0] as CustomEvent<Error>).detail;
    expect(detail).toBeInstanceOf(Error);
    expect(detail.message).toBe("no media");
    el.remove();
  });

  it("unsubscribes on disconnect", async () => {
    const { watcher, unsubscribe } = defineFakeWatcher();
    const el = makeEl({});
    el.overrides = { watchDevices: watcher as never };
    document.body.appendChild(el);
    el.remove();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
