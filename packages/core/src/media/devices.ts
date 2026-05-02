/**
 * Device enumeration + change watcher.
 *
 * `enumerateDevices` returns a grouped, deduped view of the available
 * input/output devices. `watchDevices` subscribes to `devicechange` and
 * re-runs enumeration each time the OS hotplugs a device.
 *
 * Note: device labels are empty strings until the user has granted at least
 * one capture permission. The SDK does not work around this — UI code that
 * needs labels should request permission first (then re-enumerate).
 */

import { ConfigurationError } from "@/errors/errors.ts";

/** Grouped, deduped enumeration result. */
export interface DeviceList {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
}

function requireMediaDevices(): MediaDevices {
  if (typeof navigator === "undefined" || navigator.mediaDevices === undefined) {
    throw new ConfigurationError("navigator.mediaDevices is not available");
  }
  return navigator.mediaDevices;
}

function groupDevices(all: MediaDeviceInfo[]): DeviceList {
  const seen = new Set<string>();
  const cameras: MediaDeviceInfo[] = [];
  const microphones: MediaDeviceInfo[] = [];
  const speakers: MediaDeviceInfo[] = [];
  for (const d of all) {
    const key = `${d.kind}:${d.deviceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (d.kind === "videoinput") cameras.push(d);
    else if (d.kind === "audioinput") microphones.push(d);
    else if (d.kind === "audiooutput") speakers.push(d);
  }
  return { cameras, microphones, speakers };
}

/** Snapshot of currently-attached devices, grouped by kind and deduped. */
export async function enumerateDevices(): Promise<DeviceList> {
  const md = requireMediaDevices();
  const list = await md.enumerateDevices();
  return groupDevices(list);
}

/**
 * Subscribe to device hotplug events. The callback is invoked once
 * immediately with the current device list, and again whenever
 * `devicechange` fires. Returns an unsubscribe.
 */
export function watchDevices(callback: (devices: DeviceList) => void): () => void {
  const md = requireMediaDevices();
  let cancelled = false;

  const refresh = async (): Promise<void> => {
    const list = await md.enumerateDevices();
    if (!cancelled) callback(groupDevices(list));
  };

  const handler = (): void => {
    void refresh();
  };

  md.addEventListener("devicechange", handler);
  void refresh();

  return () => {
    cancelled = true;
    md.removeEventListener("devicechange", handler);
  };
}
