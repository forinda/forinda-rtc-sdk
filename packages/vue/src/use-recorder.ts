/**
 * `useRecorder` — record a `MediaStream` to a `Blob` for the lifetime of
 * the calling component.
 *
 * Constructs a `Recorder` lazily (only on the first `start`) so we don't
 * burn `MediaRecorder` instances on every render. Auto-stops on scope
 * dispose. Streams change does NOT reset the recorder — consumers should
 * stop and re-create explicitly.
 *
 * `downloadUrl` is a fresh object URL minted whenever a new blob arrives,
 * with the previous one revoked. Bind directly to `<a download :href>`.
 *
 * SSR-safe: returns inert refs on the server.
 */

import { onScopeDispose, ref, shallowRef, watch, type Ref } from "vue";
import {
  defineRecorder,
  type Recorder,
  type RecorderOptions,
  type RecorderState,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseRecorderResult {
  recorder: Ref<Recorder | null>;
  state: Ref<RecorderState>;
  blob: Ref<Blob | null>;
  downloadUrl: Ref<string | null>;
  chunks: Ref<readonly Blob[]>;
  error: Ref<Error | null>;
  start: () => void;
  stop: () => Promise<Blob | null>;
  pause: () => void;
  resume: () => void;
}

export function useRecorder(
  stream: MediaStream | null,
  opts: RecorderOptions = {},
): UseRecorderResult {
  const recorder = shallowRef<Recorder | null>(null);
  const state = ref<RecorderState>("idle");
  const blob = shallowRef<Blob | null>(null);
  const chunks = shallowRef<readonly Blob[]>([]);
  const error = shallowRef<Error | null>(null);
  const downloadUrl = ref<string | null>(null);

  function ensureRecorder(): Recorder | null {
    if (isServer || stream === null) return null;
    if (recorder.value === null) {
      const r = defineRecorder(stream, opts);
      r.on("state", (s) => {
        state.value = s;
      });
      r.on("dataavailable", () => {
        chunks.value = [...r.chunks];
      });
      r.on("error", (e) => {
        error.value = e;
      });
      r.on("stop", ({ blob: b }) => {
        blob.value = b;
      });
      recorder.value = r;
    }
    return recorder.value;
  }

  // Mint a fresh URL on every blob; revoke the previous as soon as we swap.
  watch(blob, (b, _prev, onCleanup) => {
    if (b === null || isServer) {
      downloadUrl.value = null;
      return;
    }
    const url = URL.createObjectURL(b);
    downloadUrl.value = url;
    onCleanup(() => URL.revokeObjectURL(url));
  });

  onScopeDispose(() => {
    const r = recorder.value;
    if (r && (r.state === "recording" || r.state === "paused")) {
      void r.stop();
    }
    recorder.value = null;
  });

  return {
    recorder,
    state,
    blob,
    downloadUrl,
    chunks,
    error,
    start: () => {
      const r = ensureRecorder();
      if (!r) return;
      error.value = null;
      blob.value = null;
      chunks.value = [];
      try {
        r.start();
      } catch (e) {
        error.value = e instanceof Error ? e : new Error(String(e));
      }
    },
    stop: async () => {
      const r = recorder.value;
      if (!r) return null;
      return r.stop();
    },
    pause: () => recorder.value?.pause(),
    resume: () => recorder.value?.resume(),
  };
}
