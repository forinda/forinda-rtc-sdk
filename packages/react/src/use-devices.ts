/**
 * `useDevices` — subscribe to the OS-attached input/output device list.
 *
 * Wraps `watchDevices(cb)` from core. Auto-refreshes on device hotplug.
 * SSR-safe: returns empty arrays on server.
 */

import { useCallback, useEffect, useState } from "react";
import { enumerateDevices, watchDevices, type DeviceList } from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseDevicesResult extends DeviceList {
  refresh: () => Promise<void>;
}

const EMPTY: DeviceList = { cameras: [], microphones: [], speakers: [] };

export function useDevices(): UseDevicesResult {
  const [devices, setDevices] = useState<DeviceList>(EMPTY);

  const refresh = useCallback(async (): Promise<void> => {
    if (isServer) return;
    try {
      const list = await enumerateDevices();
      setDevices(list);
    } catch {
      // ignore — the hook stays at last-known state
    }
  }, []);

  useEffect(() => {
    if (isServer) return;
    const off = watchDevices((list) => setDevices(list));
    return off;
  }, []);

  return { ...devices, refresh };
}
