/**
 * `usePublisher` — construct a `Publisher`, subscribe to its events, and
 * surface the live state as a snapshot.
 *
 * Cleans up the publisher on unmount via `AbortController` so StrictMode
 * double-invocation is idempotent.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  definePublisher,
  type ConnectionState,
  type ConnectionStats,
  type PcFactory,
  type Publisher,
  type RetryConfig,
  type SdkError,
  type SignalingTransport,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";
import { useVideoSdkConfig } from "./provider.tsx";

export interface UsePublisherOptions {
  room: string;
  stream: MediaStream | null;
  peerId?: string;
  signaling?: SignalingTransport;
  iceServers?: RTCIceServer[];
  stats?: { interval: number };
  retry?: RetryConfig;
  pcFactory?: PcFactory;
  /** Auto-call `start()` once a stream is supplied. Default `true`. */
  autoStart?: boolean;
}

export interface UsePublisherResult {
  publisher: Publisher | null;
  state: ConnectionState;
  viewers: readonly string[];
  stats: ConnectionStats[] | null;
  error: SdkError | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  replaceVideoTrack: (track: MediaStreamTrack) => Promise<void>;
  replaceAudioTrack: (track: MediaStreamTrack) => Promise<void>;
}

export function usePublisher(opts: UsePublisherOptions): UsePublisherResult {
  const config = useVideoSdkConfig();
  const [publisher, setPublisher] = useState<Publisher | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [viewers, setViewers] = useState<readonly string[]>([]);
  const [stats, setStats] = useState<ConnectionStats[] | null>(null);
  const [error, setError] = useState<SdkError | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const autoStart = opts.autoStart ?? true;
  const hasStream = opts.stream !== null;

  useEffect(() => {
    if (isServer) return;
    if (!hasStream) return;

    const o = optsRef.current;
    const signaling = o.signaling ?? config.signaling?.();
    if (signaling === undefined) {
      setError({
        name: "ConfigurationError",
        message:
          "usePublisher: no signaling transport (provide opts.signaling or VideoSdkProvider)",
        code: "configuration_error",
        retryable: false,
      } as SdkError);
      return;
    }

    const ctrl = new AbortController();
    const p = definePublisher({
      signaling,
      room: o.room,
      stream: o.stream as MediaStream,
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
    setPublisher(p);

    const offState = p.on("state", (s) => {
      if (!ctrl.signal.aborted) setState(s);
    });
    const offViewer = p.on("viewer", () => {
      if (!ctrl.signal.aborted) setViewers([...p.peers()]);
    });
    const offViewerLeft = p.on("viewer-left", () => {
      if (!ctrl.signal.aborted) setViewers([...p.peers()]);
    });
    const offStats = p.on("stats", (s) => {
      if (!ctrl.signal.aborted) setStats(s);
    });
    const offError = p.on("error", (e) => {
      if (!ctrl.signal.aborted) setError(e);
    });

    if (autoStart) {
      void p.start();
    }

    return () => {
      ctrl.abort();
      offState();
      offViewer();
      offViewerLeft();
      offStats();
      offError();
      void p.stop();
      setPublisher(null);
      setState("idle");
      setViewers([]);
      setStats(null);
      setError(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStream, autoStart, opts.room, opts.peerId]);

  const start = useCallback(async (): Promise<void> => {
    if (publisher !== null) await publisher.start();
  }, [publisher]);

  const stop = useCallback(async (): Promise<void> => {
    if (publisher !== null) await publisher.stop();
  }, [publisher]);

  const replaceVideoTrack = useCallback(
    async (track: MediaStreamTrack): Promise<void> => {
      if (publisher !== null) await publisher.replaceVideoTrack(track);
    },
    [publisher],
  );

  const replaceAudioTrack = useCallback(
    async (track: MediaStreamTrack): Promise<void> => {
      if (publisher !== null) await publisher.replaceAudioTrack(track);
    },
    [publisher],
  );

  return {
    publisher,
    state,
    viewers,
    stats,
    error,
    start,
    stop,
    replaceVideoTrack,
    replaceAudioTrack,
  };
}
