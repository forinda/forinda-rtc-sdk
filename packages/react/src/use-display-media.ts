/**
 * `useDisplayMedia` — request a screen-share `MediaStream` and manage its
 * lifecycle.
 *
 * Mirror of {@link "./use-user-media.ts".useUserMedia} for the screen-capture
 * API. Adds an `"ended"` state so the hook reflects when the user stops
 * sharing via the browser's own UI (the "Stop sharing" pill) — not just when
 * the React component unmounts.
 *
 * SSR-safe: returns inert state on the server.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDisplayMedia,
  type DisplayCaptureOptions,
  type SdkError,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export type DisplayMediaState = "idle" | "requesting" | "granted" | "denied" | "ended" | "error";

export interface UseDisplayMediaResult {
  stream: MediaStream | null;
  error: SdkError | null;
  state: DisplayMediaState;
  /** Re-open the picker. Stops any current stream first. */
  refresh: () => Promise<void>;
  /** Stop tracks and reset state to `"idle"`. */
  stop: () => void;
  /**
   * Manually start sharing. Useful when you want a button click rather than
   * an auto-request on mount. When `autoStart` is false the effect is a
   * no-op until you call this.
   */
  start: () => Promise<void>;
}

export interface UseDisplayMediaOptions extends DisplayCaptureOptions {
  /** Auto-open the picker on mount. Default `false` — screen share usually waits for a user click. */
  autoStart?: boolean;
}

export function useDisplayMedia(opts: UseDisplayMediaOptions = {}): UseDisplayMediaResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<SdkError | null>(null);
  const [state, setState] = useState<DisplayMediaState>("idle");
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
      const { autoStart: _ignore, ...captureOpts } = optsRef.current;
      const s = await getDisplayMedia(captureOpts);
      if (signal.aborted) {
        for (const t of s.getTracks()) t.stop();
        return;
      }
      setStream(s);
      setState("granted");
      // Browser-side "Stop sharing" pill ends the video track. Reflect that
      // in our state so consumers can re-render.
      const videoTrack = s.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener("ended", () => {
          if (signal.aborted) return;
          for (const t of s.getTracks()) t.stop();
          setStream(null);
          setState("ended");
        });
      }
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

  const start = refresh;

  useEffect(() => {
    if (isServer) return;
    if (!optsRef.current.autoStart) return;
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
    // Auto-start runs once on mount; re-runs would tear down the picker.
    // Consumers can call `refresh()` to re-request explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { stream, error, state, refresh, stop, start };
}
