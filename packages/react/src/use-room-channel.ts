/**
 * `useRoomChannel` — construct + manage a `RoomChannel` for the lifetime of
 * the calling component. Mirrors the shape of `usePublisher` / `useViewer`:
 * resolves signaling from `VideoSdkProvider` when not supplied directly,
 * auto-starts on mount (default), and tears down cleanly via
 * `AbortController` on unmount.
 *
 * SSR-safe: returns inert state on the server.
 */

import { useEffect, useRef, useState } from "react";
import {
  defineRoomChannel,
  type RoomChannel,
  type SignalingTransport,
  type TransportState,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";
import { useVideoSdkConfig } from "./provider.tsx";

export interface UseRoomChannelOptions {
  room: string;
  peerId?: string;
  signaling?: SignalingTransport;
  /** Issue join + leave on the transport. Default `true`. */
  manageJoin?: boolean;
  /** Cap on the rolling chat-history buffer. Default `200`. */
  chatHistoryLimit?: number;
  /** Auto-call `channel.start()` on mount. Default `true`. */
  autoStart?: boolean;
}

export interface UseRoomChannelResult {
  channel: RoomChannel | null;
  /** Underlying signaling transport state. Convenient for "Connecting…" UI. */
  state: TransportState;
  error: Error | null;
}

export function useRoomChannel(opts: UseRoomChannelOptions): UseRoomChannelResult {
  const config = useVideoSdkConfig();
  const [channel, setChannel] = useState<RoomChannel | null>(null);
  const [state, setState] = useState<TransportState>("idle");
  const [error, setError] = useState<Error | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const autoStart = opts.autoStart ?? true;

  useEffect(() => {
    if (isServer) return;

    const o = optsRef.current;
    const signaling = o.signaling ?? config.signaling?.();
    if (signaling === undefined) {
      setError(
        new Error(
          "useRoomChannel: no signaling transport (provide opts.signaling or VideoSdkProvider)",
        ),
      );
      return;
    }

    const ctrl = new AbortController();
    const ch = defineRoomChannel({
      signaling,
      room: o.room,
      ...(o.peerId !== undefined ? { peerId: o.peerId } : {}),
      ...(o.manageJoin !== undefined ? { manageJoin: o.manageJoin } : {}),
      ...(o.chatHistoryLimit !== undefined ? { chatHistoryLimit: o.chatHistoryLimit } : {}),
    });
    setChannel(ch);
    setState(signaling.state);

    const offError = ch.on("error", (e) => {
      if (!ctrl.signal.aborted) setError(e);
    });
    const offTransportState = signaling.on("state", (s: TransportState) => {
      if (!ctrl.signal.aborted) setState(s);
    });

    if (autoStart) {
      void ch.start().catch((e: unknown) => {
        if (!ctrl.signal.aborted) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      });
    }

    return () => {
      ctrl.abort();
      offError();
      offTransportState();
      void ch.stop();
      setChannel(null);
      setState("idle");
      setError(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, opts.room, opts.peerId]);

  return { channel, state, error };
}
