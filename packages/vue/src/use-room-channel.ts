/**
 * `useRoomChannel` — construct + manage a `RoomChannel` for the lifetime of
 * the calling component. Resolves signaling from `VideoSdkPlugin` when not
 * supplied directly, auto-starts on creation (default), tears down on scope
 * dispose.
 *
 * SSR-safe: returns inert refs on the server.
 */

import { onScopeDispose, ref, shallowRef, type Ref } from "vue";
import {
  defineAttachedRoomChannel,
  defineRoomChannel,
  type Room,
  type RoomChannel,
  type SignalingTransport,
  type TransportState,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";
import { useVideoSdkConfig } from "./plugin.ts";

export interface UseRoomChannelOptions {
  /** Required when `attach` is omitted. */
  room?: string;
  peerId?: string;
  signaling?: SignalingTransport;
  /** Issue join + leave on the transport. Default `true`. Ignored when attached. */
  manageJoin?: boolean;
  /** Cap on the rolling chat-history buffer. Default `200`. */
  chatHistoryLimit?: number;
  /** Auto-call `channel.start()`. Default `true`. */
  autoStart?: boolean;
  /** Attach to a Room — Room owns transport + the coordinated `join`. */
  attach?: Room;
}

export interface UseRoomChannelResult {
  channel: Ref<RoomChannel | null>;
  state: Ref<TransportState>;
  error: Ref<Error | null>;
}

export function useRoomChannel(opts: UseRoomChannelOptions): UseRoomChannelResult {
  const config = useVideoSdkConfig();
  const channel = shallowRef<RoomChannel | null>(null);
  const state = ref<TransportState>("idle");
  const error = shallowRef<Error | null>(null);

  const autoStart = opts.autoStart ?? true;

  if (!isServer) {
    let ch: RoomChannel;
    let transportForState: SignalingTransport;

    if (opts.attach) {
      ch = defineAttachedRoomChannel(opts.attach, {
        ...(opts.chatHistoryLimit !== undefined ? { chatHistoryLimit: opts.chatHistoryLimit } : {}),
      });
      transportForState = opts.attach.signaling;
    } else {
      const signaling = opts.signaling ?? config.signaling?.();
      if (signaling === undefined) {
        error.value = new Error(
          "useRoomChannel: no signaling transport (provide opts.signaling, opts.attach, or VideoSdkPlugin)",
        );
        return { channel, state, error };
      }
      if (opts.room === undefined) {
        error.value = new Error(
          "useRoomChannel: opts.room is required when not attaching to a Room",
        );
        return { channel, state, error };
      }
      ch = defineRoomChannel({
        signaling,
        room: opts.room,
        ...(opts.peerId !== undefined ? { peerId: opts.peerId } : {}),
        ...(opts.manageJoin !== undefined ? { manageJoin: opts.manageJoin } : {}),
        ...(opts.chatHistoryLimit !== undefined ? { chatHistoryLimit: opts.chatHistoryLimit } : {}),
      });
      transportForState = signaling;
    }

    channel.value = ch;
    state.value = transportForState.state;

    const offError = ch.on("error", (e) => {
      error.value = e;
    });
    const offTransportState = transportForState.on("state", (s: TransportState) => {
      state.value = s;
    });

    if (autoStart) {
      void ch.start().catch((e: unknown) => {
        error.value = e instanceof Error ? e : new Error(String(e));
      });
    }

    onScopeDispose(() => {
      offError();
      offTransportState();
      void ch.stop();
      channel.value = null;
      state.value = "idle";
    });
  }

  return { channel, state, error };
}
