/**
 * `useUserMedia` — request a `MediaStream` and manage its lifecycle.
 *
 * Cleans up tracks on unmount. Uses `AbortController` to make StrictMode
 * double-invocation in dev idempotent (a stream from a torn-down mount is
 * stopped before the remount fires).
 *
 * SSR-safe: returns inert state on the server.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getUserMedia, type CaptureOptions, type SdkError } from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export type UserMediaState = "idle" | "requesting" | "granted" | "denied" | "error";

export interface UseUserMediaResult {
  stream: MediaStream | null;
  error: SdkError | null;
  state: UserMediaState;
  refresh: () => Promise<void>;
  stop: () => void;
}

export function useUserMedia(opts: CaptureOptions): UseUserMediaResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<SdkError | null>(null);
  const [state, setState] = useState<UserMediaState>("idle");
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const stop = useCallback((): void => {
    setStream((current) => {
      if (current !== null) {
        for (const t of current.getTracks()) t.stop();
      }
      return null;
    });
    setState("idle");
    setError(null);
  }, []);

  const request = useCallback(async (signal: AbortSignal): Promise<void> => {
    if (isServer) return;
    setState("requesting");
    setError(null);
    try {
      const s = await getUserMedia(optsRef.current);
      if (signal.aborted) {
        for (const t of s.getTracks()) t.stop();
        return;
      }
      setStream(s);
      setState("granted");
    } catch (e) {
      if (signal.aborted) return;
      const err = e as SdkError;
      setError(err);
      setState(err.code === "permission_denied" ? "denied" : "error");
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    stop();
    const ctrl = new AbortController();
    await request(ctrl.signal);
  }, [request, stop]);

  useEffect(() => {
    if (isServer) return;
    const ctrl = new AbortController();
    void request(ctrl.signal);
    return () => {
      ctrl.abort();
      setStream((current) => {
        if (current !== null) {
          for (const t of current.getTracks()) t.stop();
        }
        return null;
      });
    };
    // We intentionally don't include `opts` in deps — option changes are
    // captured via optsRef, and re-running on every render would tear down
    // the camera. Consumers use `refresh()` for explicit re-requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { stream, error, state, refresh, stop };
}
