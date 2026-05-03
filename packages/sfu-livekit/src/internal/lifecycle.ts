/**
 * Bridges LiveKit's `Room.state` strings into our `SfuConnectionState`
 * lifecycle vocabulary so publisher + viewer can use one mapping.
 */

import type { SfuConnectionState } from "../types.ts";

export function mapLiveKitState(state: string): SfuConnectionState {
  switch (state) {
    case "disconnected":
      return "closed";
    case "connecting":
    case "reconnecting":
      return "connecting";
    case "connected":
      return "connected";
    default:
      return "idle";
  }
}
