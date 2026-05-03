/**
 * `useSfuViewer` — symmetric to `useSfuPublisher`, returns the inbound
 * `MediaStream` once tracks land.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  defineSfuViewer,
  type SfuConnectionState,
  type SfuViewer,
  type SfuViewerOptions,
} from "@forinda/video-sdk-sfu-livekit";
import type { SdkError } from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseSfuViewerOptions extends SfuViewerOptions {
  autoStart?: boolean;
}

export interface UseSfuViewerResult {
  viewer: SfuViewer | null;
  state: SfuConnectionState;
  stream: MediaStream | null;
  error: SdkError | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useSfuViewer(opts: UseSfuViewerOptions): UseSfuViewerResult {
  const [viewer, setViewer] = useState<SfuViewer | null>(null);
  const [state, setState] = useState<SfuConnectionState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<SdkError | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const autoStart = opts.autoStart ?? true;

  useEffect(() => {
    if (isServer) return;
    const o = optsRef.current;
    const ctrl = new AbortController();

    const v = defineSfuViewer({
      url: o.url,
      token: o.token,
      room: o.room,
      peerId: o.peerId,
      publisherId: o.publisherId,
      ...(o.retry !== undefined ? { retry: o.retry } : {}),
      ...(o.stats !== undefined ? { stats: o.stats } : {}),
    });
    setViewer(v);

    const offState = v.on("state", (s) => {
      if (!ctrl.signal.aborted) setState(s);
    });
    const offTrack = v.on("track", ({ stream: s }) => {
      if (!ctrl.signal.aborted) setStream(s);
    });
    const offError = v.on("error", (e) => {
      if (!ctrl.signal.aborted) setError(e);
    });

    if (autoStart) void v.start();

    return () => {
      ctrl.abort();
      offState();
      offTrack();
      offError();
      void v.stop();
      setViewer(null);
      setState("idle");
      setStream(null);
      setError(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, opts.url, opts.room, opts.peerId, opts.publisherId, opts.token]);

  const start = useCallback(async (): Promise<void> => {
    if (viewer) await viewer.start();
  }, [viewer]);
  const stop = useCallback(async (): Promise<void> => {
    if (viewer) await viewer.stop();
  }, [viewer]);

  return { viewer, state, stream, error, start, stop };
}
