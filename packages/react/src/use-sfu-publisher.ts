/**
 * `useSfuPublisher` — same shape as `usePublisher` but routes media
 * through a LiveKit SFU instead of mesh WebRTC.
 *
 * Token must be supplied by the caller (server-minted). The hook does
 * not bind to `VideoSdkProvider` — SFU lives in its own dimension from
 * our signaling.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  defineSfuPublisher,
  type SfuConnectionState,
  type SfuPublisher,
  type SfuPublisherOptions,
} from "@forinda/video-sdk-sfu-livekit";
import type { SdkError } from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseSfuPublisherOptions extends Omit<SfuPublisherOptions, "stream"> {
  stream: MediaStream | null;
  autoStart?: boolean;
}

export interface UseSfuPublisherResult {
  publisher: SfuPublisher | null;
  state: SfuConnectionState;
  viewers: readonly string[];
  error: SdkError | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  replaceVideoTrack: (track: MediaStreamTrack) => Promise<void>;
  replaceAudioTrack: (track: MediaStreamTrack) => Promise<void>;
}

export function useSfuPublisher(opts: UseSfuPublisherOptions): UseSfuPublisherResult {
  const [publisher, setPublisher] = useState<SfuPublisher | null>(null);
  const [state, setState] = useState<SfuConnectionState>("idle");
  const [viewers, setViewers] = useState<readonly string[]>([]);
  const [error, setError] = useState<SdkError | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const autoStart = opts.autoStart ?? true;
  const hasStream = opts.stream !== null;

  useEffect(() => {
    if (isServer || !hasStream) return;
    const o = optsRef.current;
    const ctrl = new AbortController();

    const p = defineSfuPublisher({
      url: o.url,
      token: o.token,
      room: o.room,
      peerId: o.peerId,
      stream: o.stream as MediaStream,
      ...(o.retry !== undefined ? { retry: o.retry } : {}),
      ...(o.stats !== undefined ? { stats: o.stats } : {}),
    });
    setPublisher(p);

    const offState = p.on("state", (s) => {
      if (!ctrl.signal.aborted) setState(s);
    });
    const offJoin = p.on("viewer-joined", () => {
      if (!ctrl.signal.aborted) setViewers([...p.peers()]);
    });
    const offLeave = p.on("viewer-left", () => {
      if (!ctrl.signal.aborted) setViewers([...p.peers()]);
    });
    const offError = p.on("error", (e) => {
      if (!ctrl.signal.aborted) setError(e);
    });

    if (autoStart) void p.start();

    return () => {
      ctrl.abort();
      offState();
      offJoin();
      offLeave();
      offError();
      void p.stop();
      setPublisher(null);
      setState("idle");
      setViewers([]);
      setError(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStream, autoStart, opts.url, opts.room, opts.peerId, opts.token]);

  const start = useCallback(async (): Promise<void> => {
    if (publisher) await publisher.start();
  }, [publisher]);
  const stop = useCallback(async (): Promise<void> => {
    if (publisher) await publisher.stop();
  }, [publisher]);
  const replaceVideoTrack = useCallback(
    async (track: MediaStreamTrack) => {
      if (publisher) await publisher.replaceVideoTrack(track);
    },
    [publisher],
  );
  const replaceAudioTrack = useCallback(
    async (track: MediaStreamTrack) => {
      if (publisher) await publisher.replaceAudioTrack(track);
    },
    [publisher],
  );

  return { publisher, state, viewers, error, start, stop, replaceVideoTrack, replaceAudioTrack };
}
