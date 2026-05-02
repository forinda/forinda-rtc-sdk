/**
 * `useViewer` — symmetric to `usePublisher` for the viewer side.
 *
 * Subscribes to `state`, `track`, `stats`, `error` events. `stream` is
 * `null` until the first `track` event arrives.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  defineAttachedViewer,
  defineViewer,
  type ConnectionState,
  type ConnectionStats,
  type PcFactory,
  type RetryConfig,
  type Room,
  type SdkError,
  type SignalingTransport,
  type Viewer,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";
import { useVideoSdkConfig } from "./provider.tsx";

export interface UseViewerOptions {
  /** Required when `attach` is omitted. Ignored when attached (taken from Room). */
  room?: string;
  publisherId: string;
  /** Ignored when `attach` is set (taken from Room). */
  peerId?: string;
  /** Ignored when `attach` is set (Room owns the transport). */
  signaling?: SignalingTransport;
  iceServers?: RTCIceServer[];
  stats?: { interval: number };
  retry?: RetryConfig;
  pcFactory?: PcFactory;
  autoStart?: boolean;
  /**
   * Attach to a {@link Room} so the viewer shares the Room's transport
   * + single-`join` coordination.
   */
  attach?: Room;
}

export interface UseViewerResult {
  viewer: Viewer | null;
  state: ConnectionState;
  stream: MediaStream | null;
  stats: ConnectionStats | null;
  error: SdkError | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useViewer(opts: UseViewerOptions): UseViewerResult {
  const config = useVideoSdkConfig();
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [stats, setStats] = useState<ConnectionStats | null>(null);
  const [error, setError] = useState<SdkError | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const autoStart = opts.autoStart ?? true;

  useEffect(() => {
    if (isServer) return;

    const o = optsRef.current;
    const ctrl = new AbortController();
    let v: Viewer;
    if (o.attach) {
      v = defineAttachedViewer(o.attach, {
        publisherId: o.publisherId,
        ...((o.iceServers ?? config.iceServers !== undefined)
          ? { iceServers: (o.iceServers ?? config.iceServers) as RTCIceServer[] }
          : {}),
        ...(o.stats !== undefined ? { stats: o.stats } : {}),
        ...((o.retry ?? config.retry !== undefined)
          ? { retry: (o.retry ?? config.retry) as RetryConfig }
          : {}),
        ...(o.pcFactory !== undefined ? { pcFactory: o.pcFactory } : {}),
      });
    } else {
      const signaling = o.signaling ?? config.signaling?.();
      if (signaling === undefined) {
        setError({
          name: "ConfigurationError",
          message:
            "useViewer: no signaling transport (provide opts.signaling, opts.attach, or VideoSdkProvider)",
          code: "configuration_error",
          retryable: false,
        } as SdkError);
        return;
      }
      if (o.room === undefined) {
        setError({
          name: "ConfigurationError",
          message: "useViewer: opts.room is required when not attaching to a Room",
          code: "configuration_error",
          retryable: false,
        } as SdkError);
        return;
      }
      v = defineViewer({
        signaling,
        room: o.room,
        publisherId: o.publisherId,
        ...(o.peerId !== undefined ? { peerId: o.peerId } : {}),
        ...((o.iceServers ?? config.iceServers !== undefined)
          ? { iceServers: (o.iceServers ?? config.iceServers) as RTCIceServer[] }
          : {}),
        ...(o.stats !== undefined ? { stats: o.stats } : {}),
        ...((o.retry ?? config.retry !== undefined)
          ? { retry: (o.retry ?? config.retry) as RetryConfig }
          : {}),
        ...(o.pcFactory !== undefined ? { pcFactory: o.pcFactory } : {}),
      });
    }
    setViewer(v);

    const offState = v.on("state", (s) => {
      if (!ctrl.signal.aborted) setState(s);
    });
    const offTrack = v.on("track", ({ stream: s }) => {
      if (!ctrl.signal.aborted) setStream(s);
    });
    const offStats = v.on("stats", (s) => {
      if (!ctrl.signal.aborted) setStats(s);
    });
    const offError = v.on("error", (e) => {
      if (!ctrl.signal.aborted) setError(e);
    });

    if (autoStart) {
      void v.start();
    }

    return () => {
      ctrl.abort();
      offState();
      offTrack();
      offStats();
      offError();
      void v.stop();
      setViewer(null);
      setState("idle");
      setStream(null);
      setStats(null);
      setError(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, opts.room, opts.publisherId, opts.peerId, opts.attach]);

  const start = useCallback(async (): Promise<void> => {
    if (viewer !== null) await viewer.start();
  }, [viewer]);

  const stop = useCallback(async (): Promise<void> => {
    if (viewer !== null) await viewer.stop();
  }, [viewer]);

  return { viewer, state, stream, stats, error, start, stop };
}
