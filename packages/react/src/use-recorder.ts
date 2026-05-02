/**
 * `useRecorder` — record a `MediaStream` to a `Blob` for the lifetime of
 * the calling component.
 *
 * Constructs a `Recorder` lazily (only once, on the first call to `start`)
 * so we don't burn `MediaRecorder` instances on every render. State surface
 * mirrors the underlying recorder events: `state`, `chunks`, the final
 * `blob`, and the most recent `error`. Auto-stops on unmount.
 *
 * SSR-safe: returns inert state on the server.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  defineRecorder,
  type Recorder,
  type RecorderOptions,
  type RecorderState,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseRecorderResult {
  recorder: Recorder | null;
  state: RecorderState;
  /** Final blob — `null` until `stop()` resolves. */
  blob: Blob | null;
  /**
   * Object URL for `blob`, created lazily and revoked when `blob` changes
   * or the component unmounts. `null` while no blob is available. Bind
   * directly to an `<a download href={downloadUrl}>` for one-line downloads.
   */
  downloadUrl: string | null;
  /** Read-only accumulated chunks. */
  chunks: readonly Blob[];
  error: Error | null;
  start: () => void;
  stop: () => Promise<Blob | null>;
  pause: () => void;
  resume: () => void;
}

export function useRecorder(
  stream: MediaStream | null,
  opts: RecorderOptions = {},
): UseRecorderResult {
  const [state, setState] = useState<RecorderState>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [chunks, setChunks] = useState<readonly Blob[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Tear down on unmount. Stream changes don't reset the recorder — consumers
  // who want to start a new clip should explicitly stop and re-render.
  useEffect(() => {
    return () => {
      const r = recorderRef.current;
      if (r && (r.state === "recording" || r.state === "paused")) {
        void r.stop();
      }
      recorderRef.current = null;
    };
  }, []);

  const ensureRecorder = useCallback((): Recorder | null => {
    if (isServer || stream === null) return null;
    if (recorderRef.current === null) {
      const r = defineRecorder(stream, optsRef.current);
      r.on("state", setState);
      r.on("dataavailable", () => setChunks([...r.chunks]));
      r.on("error", (e) => setError(e));
      r.on("stop", ({ blob: b }) => setBlob(b));
      recorderRef.current = r;
    }
    return recorderRef.current;
  }, [stream]);

  const start = useCallback((): void => {
    const r = ensureRecorder();
    if (!r) return;
    setError(null);
    setBlob(null);
    setChunks([]);
    try {
      r.start();
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [ensureRecorder]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const r = recorderRef.current;
    if (!r) return null;
    return r.stop();
  }, []);

  const pause = useCallback((): void => {
    recorderRef.current?.pause();
  }, []);

  const resume = useCallback((): void => {
    recorderRef.current?.resume();
  }, []);

  // Mint a fresh object URL for each blob; revoke the old one as soon as
  // the new blob arrives or the component unmounts. Anything else leaks.
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  useEffect(() => {
    if (blob === null || isServer) {
      setDownloadUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  return {
    recorder: recorderRef.current,
    state,
    blob,
    downloadUrl,
    chunks,
    error,
    start,
    stop,
    pause,
    resume,
  };
}
