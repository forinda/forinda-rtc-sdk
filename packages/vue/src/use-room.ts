/**
 * `useRoom` — construct + manage a `Room` for the lifetime of the calling
 * component. The Room owns the signaling transport's connect/disconnect
 * cycle and coordinates the single `join` across every attached child
 * (`Publisher`, `Viewer`, `RoomChannel`).
 *
 * Pair with `usePublisher({ attach: room })`, `useViewer({ attach: room })`,
 * `useRoomChannel({ attach: room })` — when `attach` is set, those
 * composables defer to the Room instead of opening their own transport.
 *
 * SSR-safe: returns inert refs on the server.
 */

import { onScopeDispose, ref, shallowRef, type Ref } from "vue";
import {
  defineRoom,
  type Room,
  type SignalingTransport,
  type TransportState,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";
import { useVideoSdkConfig } from "./plugin.ts";

export interface UseRoomOptions {
  room: string;
  peerId?: string;
  /** Pre-built signaling transport. Falls back to `VideoSdkPlugin`'s factory. */
  signaling?: SignalingTransport;
}

export interface UseRoomResult {
  room: Ref<Room | null>;
  /** Underlying signaling transport state — useful for "Connecting…" UI. */
  state: Ref<TransportState>;
  error: Ref<Error | null>;
}

export function useRoom(opts: UseRoomOptions): UseRoomResult {
  const config = useVideoSdkConfig();
  const room = shallowRef<Room | null>(null);
  const state = ref<TransportState>("idle");
  const error = shallowRef<Error | null>(null);

  if (!isServer) {
    const signaling = opts.signaling ?? config.signaling?.();
    if (signaling === undefined) {
      error.value = new Error(
        "useRoom: no signaling transport (provide opts.signaling or VideoSdkPlugin)",
      );
    } else {
      const r = defineRoom({
        signaling,
        room: opts.room,
        ...(opts.peerId !== undefined ? { peerId: opts.peerId } : {}),
      });
      room.value = r;
      state.value = signaling.state;

      const offError = r.on("error", (e) => {
        error.value = e;
      });
      const offTransportState = signaling.on("state", (s: TransportState) => {
        state.value = s;
      });

      onScopeDispose(() => {
        offError();
        offTransportState();
        void r.close();
        room.value = null;
        state.value = "idle";
      });
    }
  }

  return { room, state, error };
}
