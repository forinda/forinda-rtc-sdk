/**
 * `useSfuViewer` — Vue composable; symmetric to `useSfuPublisher`.
 */

import { onScopeDispose, ref, shallowRef, type Ref } from "vue";
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
  viewer: Ref<SfuViewer | null>;
  state: Ref<SfuConnectionState>;
  stream: Ref<MediaStream | null>;
  error: Ref<SdkError | null>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useSfuViewer(opts: UseSfuViewerOptions): UseSfuViewerResult {
  const viewer = shallowRef<SfuViewer | null>(null);
  const state = ref<SfuConnectionState>("idle");
  const stream = shallowRef<MediaStream | null>(null);
  const error = shallowRef<SdkError | null>(null);

  const autoStart = opts.autoStart ?? true;

  if (!isServer) {
    const v = defineSfuViewer({
      url: opts.url,
      token: opts.token,
      room: opts.room,
      peerId: opts.peerId,
      publisherId: opts.publisherId,
      ...(opts.retry !== undefined ? { retry: opts.retry } : {}),
      ...(opts.stats !== undefined ? { stats: opts.stats } : {}),
    });
    viewer.value = v;

    const offState = v.on("state", (s) => {
      state.value = s;
    });
    const offTrack = v.on("track", ({ stream: s }) => {
      stream.value = s;
    });
    const offError = v.on("error", (e) => {
      error.value = e;
    });

    if (autoStart) void v.start();

    onScopeDispose(() => {
      offState();
      offTrack();
      offError();
      void v.stop();
      viewer.value = null;
    });
  }

  return {
    viewer,
    state,
    stream,
    error,
    start: async () => {
      if (viewer.value) await viewer.value.start();
    },
    stop: async () => {
      if (viewer.value) await viewer.value.stop();
    },
  };
}
