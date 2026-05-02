/**
 * `useUploader` — wire a `Recorder` to an `Uploader` for the lifetime of
 * the active scope. Returns reactive state for "Uploading…" /
 * "Failed (retry?)" UI.
 *
 * SSR-safe: returns inert refs on the server.
 */

import { onScopeDispose, ref, shallowRef, type Ref } from "vue";
import {
  pipeRecorderTo,
  type Recorder,
  type Uploader,
  type UploaderState,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";

export interface UseUploaderResult {
  state: Ref<UploaderState>;
  pendingBytes: Ref<number>;
  error: Ref<Error | null>;
  retry: () => Promise<void>;
}

export function useUploader(
  recorder: Recorder | null,
  uploader: Uploader | null,
): UseUploaderResult {
  const state = ref<UploaderState>(uploader?.state ?? "idle");
  const pendingBytes = ref<number>(uploader?.pendingBytes ?? 0);
  const error = shallowRef<Error | null>(null);

  if (!isServer && recorder !== null && uploader !== null) {
    const dispose = pipeRecorderTo(recorder, uploader);

    const offState = uploader.on("state", (s) => {
      state.value = s;
      pendingBytes.value = uploader.pendingBytes;
    });
    const offAck = uploader.on("ack", () => {
      pendingBytes.value = uploader.pendingBytes;
    });
    const offError = uploader.on("error", (e) => {
      error.value = e;
    });

    onScopeDispose(() => {
      offState();
      offAck();
      offError();
      dispose();
    });
  }

  return {
    state,
    pendingBytes,
    error,
    retry: async () => {
      if (uploader !== null) await uploader.retry();
    },
  };
}
