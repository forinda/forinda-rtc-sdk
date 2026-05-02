/**
 * `useDevices` — subscribe to the OS-attached input/output device list.
 *
 * Wraps `watchDevices(cb)` from core. Auto-refreshes on hotplug.
 * SSR-safe: returns empty arrays on the server.
 */

import { onScopeDispose, shallowRef, type Ref } from "vue";
import { enumerateDevices, watchDevices, type DeviceList } from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseDevicesResult {
  cameras: Ref<DeviceList["cameras"]>;
  microphones: Ref<DeviceList["microphones"]>;
  speakers: Ref<DeviceList["speakers"]>;
  refresh: () => Promise<void>;
}

export function useDevices(): UseDevicesResult {
  const cameras = shallowRef<DeviceList["cameras"]>([]);
  const microphones = shallowRef<DeviceList["microphones"]>([]);
  const speakers = shallowRef<DeviceList["speakers"]>([]);

  const apply = (list: DeviceList): void => {
    cameras.value = list.cameras;
    microphones.value = list.microphones;
    speakers.value = list.speakers;
  };

  const refresh = async (): Promise<void> => {
    if (isServer) return;
    try {
      apply(await enumerateDevices());
    } catch {
      // Stay at last-known state.
    }
  };

  if (!isServer) {
    const off = watchDevices(apply);
    onScopeDispose(off);
  }

  return { cameras, microphones, speakers, refresh };
}
