/**
 * `useRoom` — construct + manage a `Room` for the lifetime of the calling
 * component. The Room owns the signaling transport's connect/disconnect
 * cycle and coordinates the single `join` across every attached child
 * (`Publisher`, `Viewer`, `RoomChannel`).
 *
 * Pair with `usePublisher({ attach: room })`, `useViewer({ attach: room })`,
 * `useRoomChannel({ attach: room })`, `useRecorder(stream, ..., { attach })`
 * — when `attach` is set, those hooks defer to the Room instead of opening
 * their own transport.
 *
 * SSR-safe: returns inert state on the server.
 */

import { useEffect, useRef, useState } from "react";
import {
  defineRoom,
  type Room,
  type SignalingTransport,
  type TransportState,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";
import { useVideoSdkConfig } from "./provider.tsx";

export interface UseRoomOptions {
  room: string;
  peerId?: string;
  /** Pre-built signaling transport. Falls back to `VideoSdkProvider`'s factory. */
  signaling?: SignalingTransport;
}

export interface UseRoomResult {
  room: Room | null;
  /** Underlying signaling transport state — useful for "Connecting…" UI. */
  state: TransportState;
  error: Error | null;
}

export function useRoom(opts: UseRoomOptions): UseRoomResult {
  const config = useVideoSdkConfig();
  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<TransportState>("idle");
  const [error, setError] = useState<Error | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (isServer) return;

    const o = optsRef.current;
    const signaling = o.signaling ?? config.signaling?.();
    if (signaling === undefined) {
      setError(
        new Error("useRoom: no signaling transport (provide opts.signaling or VideoSdkProvider)"),
      );
      return;
    }

    const ctrl = new AbortController();
    const r = defineRoom({
      signaling,
      room: o.room,
      ...(o.peerId !== undefined ? { peerId: o.peerId } : {}),
    });
    setRoom(r);
    setState(signaling.state);

    const offError = r.on("error", (e) => {
      if (!ctrl.signal.aborted) setError(e);
    });
    const offTransportState = signaling.on("state", (s: TransportState) => {
      if (!ctrl.signal.aborted) setState(s);
    });

    return () => {
      ctrl.abort();
      offError();
      offTransportState();
      void r.close();
      setRoom(null);
      setState("idle");
      setError(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.room, opts.peerId]);

  return { room, state, error };
}
