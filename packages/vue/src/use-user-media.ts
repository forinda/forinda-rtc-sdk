/**
 * `useUserMedia` — request a `MediaStream` and manage its lifecycle.
 *
 * Vue equivalent of React's `useUserMedia`. Tracks are stopped on scope
 * dispose. An `AbortController` makes overlapping requests safe — a stream
 * arriving after the scope tore down is stopped before assignment.
 *
 * SSR-safe: returns inert refs on the server.
 */

import { onScopeDispose, ref, shallowRef, type Ref } from "vue";
import { getUserMedia, type CaptureOptions, type SdkError } from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export type UserMediaState = "idle" | "requesting" | "granted" | "denied" | "error";

export interface UseUserMediaResult {
  stream: Ref<MediaStream | null>;
  error: Ref<SdkError | null>;
  state: Ref<UserMediaState>;
  refresh: () => Promise<void>;
  stop: () => void;
}

export function useUserMedia(opts: CaptureOptions): UseUserMediaResult {
  const stream = shallowRef<MediaStream | null>(null);
  const error = shallowRef<SdkError | null>(null);
  const state = ref<UserMediaState>("idle");

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
      const s = await getUserMedia(opts);
      if (signal.aborted) {
        for (const t of s.getTracks()) t.stop();
        return;
      }
      stream.value = s;
      state.value = "granted";
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

  if (!isServer) {
    ctrl = new AbortController();
    void request(ctrl.signal);
  }

  onScopeDispose(() => {
    if (ctrl) ctrl.abort();
    stop();
  });

  return { stream, error, state, refresh, stop };
}
