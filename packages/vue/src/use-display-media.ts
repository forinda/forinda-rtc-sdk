/**
 * `useDisplayMedia` — request a screen-share `MediaStream` and manage its
 * lifecycle.
 *
 * Mirror of {@link "./use-user-media.ts".useUserMedia} for the screen-capture
 * API. The `"ended"` state reflects when the user stops sharing via the
 * browser's own UI ("Stop sharing" pill), not just scope dispose.
 *
 * Default `autoStart: false` — screen share usually waits for a user click.
 *
 * SSR-safe: returns inert refs on the server.
 */

import { onScopeDispose, ref, shallowRef, type Ref } from "vue";
import {
  getDisplayMedia,
  type DisplayCaptureOptions,
  type SdkError,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export type DisplayMediaState = "idle" | "requesting" | "granted" | "denied" | "ended" | "error";

export interface UseDisplayMediaResult {
  stream: Ref<MediaStream | null>;
  error: Ref<SdkError | null>;
  state: Ref<DisplayMediaState>;
  /** Re-open the picker. Stops any current stream first. */
  refresh: () => Promise<void>;
  /** Stop tracks and reset state to `"idle"`. */
  stop: () => void;
  /** Manually start sharing — mirrors `refresh` but reads naturally on a button handler. */
  start: () => Promise<void>;
}

export interface UseDisplayMediaOptions extends DisplayCaptureOptions {
  /** Auto-open the picker on mount. Default `false`. */
  autoStart?: boolean;
}

export function useDisplayMedia(opts: UseDisplayMediaOptions = {}): UseDisplayMediaResult {
  const { autoStart = false, ...captureOpts } = opts;
  const stream = shallowRef<MediaStream | null>(null);
  const error = shallowRef<SdkError | null>(null);
  const state = ref<DisplayMediaState>("idle");

  let ctrl: AbortController | null = null;

  const stop = (): void => {
    if (stream.value) {
      for (const t of stream.value.getTracks()) t.stop();
      stream.value = null;
    }
    state.value = "idle";
    error.value = null;
  };

  const request = async (signal: AbortSignal): Promise<void> => {
    if (isServer) return;
    state.value = "requesting";
    error.value = null;
    try {
      const s = await getDisplayMedia(captureOpts);
      if (signal.aborted) {
        for (const t of s.getTracks()) t.stop();
        return;
      }
      stream.value = s;
      state.value = "granted";
      const videoTrack = s.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener("ended", () => {
          if (signal.aborted) return;
          for (const t of s.getTracks()) t.stop();
          stream.value = null;
          state.value = "ended";
        });
      }
    } catch (e) {
      if (signal.aborted) return;
      const err = e as SdkError;
      error.value = err;
      state.value = err.code === "permission_denied" ? "denied" : "error";
    }
  };

  const refresh = async (): Promise<void> => {
    if (ctrl) ctrl.abort();
    stop();
    ctrl = new AbortController();
    await request(ctrl.signal);
  };

  const start = refresh;

  if (!isServer && autoStart) {
    ctrl = new AbortController();
    void request(ctrl.signal);
  }

  onScopeDispose(() => {
    if (ctrl) ctrl.abort();
    stop();
  });

  return { stream, error, state, refresh, stop, start };
}
