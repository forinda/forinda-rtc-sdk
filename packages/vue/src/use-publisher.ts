/**
 * `usePublisher` — construct a `Publisher`, subscribe to its events, and
 * expose live state as Vue refs.
 *
 * Mirrors React's `usePublisher`. When `attach` is set, defers to the Room
 * for transport + single-`join` coordination via `defineAttachedPublisher`.
 *
 * SSR-safe: returns inert refs on the server.
 */

import { onScopeDispose, ref, shallowRef, type Ref } from "vue";
import {
  defineAttachedPublisher,
  definePublisher,
  type ConnectionState,
  type ConnectionStats,
  type PcFactory,
  type Publisher,
  type RetryConfig,
  type Room,
  type SdkError,
  type SignalingTransport,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";
import { useVideoSdkConfig } from "./plugin.ts";

export interface UsePublisherOptions {
  /** Required when `attach` is omitted. Ignored when attached (taken from Room). */
  room?: string;
  stream: MediaStream | null;
  /** Ignored when `attach` is set (taken from Room). */
  peerId?: string;
  /** Ignored when `attach` is set (Room owns the transport). */
  signaling?: SignalingTransport;
  iceServers?: RTCIceServer[];
  stats?: { interval: number };
  retry?: RetryConfig;
  pcFactory?: PcFactory;
  /** Auto-call `start()` once a stream is supplied. Default `true`. */
  autoStart?: boolean;
  /**
   * Attach to a Room so this publisher shares the Room's transport + the
   * single coordinated `join`. When set, `room`, `peerId`, and `signaling`
   * come from the Room.
   */
  attach?: Room;
}

export interface UsePublisherResult {
  publisher: Ref<Publisher | null>;
  state: Ref<ConnectionState>;
  viewers: Ref<readonly string[]>;
  stats: Ref<ConnectionStats[] | null>;
  error: Ref<SdkError | null>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  replaceVideoTrack: (track: MediaStreamTrack) => Promise<void>;
  replaceAudioTrack: (track: MediaStreamTrack) => Promise<void>;
}

export function usePublisher(opts: UsePublisherOptions): UsePublisherResult {
  const config = useVideoSdkConfig();
  const publisher = shallowRef<Publisher | null>(null);
  const state = ref<ConnectionState>("idle");
  const viewers = shallowRef<readonly string[]>([]);
  const stats = shallowRef<ConnectionStats[] | null>(null);
  const error = shallowRef<SdkError | null>(null);

  const autoStart = opts.autoStart ?? true;
  const hasStream = opts.stream !== null;

  if (!isServer && hasStream) {
    let p: Publisher;
    if (opts.attach) {
      p = defineAttachedPublisher(opts.attach, {
        stream: opts.stream as MediaStream,
        ...((opts.iceServers ?? config.iceServers) !== undefined
          ? { iceServers: (opts.iceServers ?? config.iceServers) as RTCIceServer[] }
          : {}),
        ...(opts.stats !== undefined ? { stats: opts.stats } : {}),
        ...((opts.retry ?? config.retry) !== undefined
          ? { retry: (opts.retry ?? config.retry) as RetryConfig }
          : {}),
        ...(opts.pcFactory !== undefined ? { pcFactory: opts.pcFactory } : {}),
      });
    } else {
      const signaling = opts.signaling ?? config.signaling?.();
      if (signaling === undefined) {
        error.value = {
          name: "ConfigurationError",
          message:
            "usePublisher: no signaling transport (provide opts.signaling, opts.attach, or VideoSdkPlugin)",
          code: "configuration_error",
          retryable: false,
        } as SdkError;
        return buildResult();
      }
      if (opts.room === undefined) {
        error.value = {
          name: "ConfigurationError",
          message: "usePublisher: opts.room is required when not attaching to a Room",
          code: "configuration_error",
          retryable: false,
        } as SdkError;
        return buildResult();
      }
      p = definePublisher({
        signaling,
        room: opts.room,
        stream: opts.stream as MediaStream,
        ...(opts.peerId !== undefined ? { peerId: opts.peerId } : {}),
        ...((opts.iceServers ?? config.iceServers) !== undefined
          ? { iceServers: (opts.iceServers ?? config.iceServers) as RTCIceServer[] }
          : {}),
        ...(opts.stats !== undefined ? { stats: opts.stats } : {}),
        ...((opts.retry ?? config.retry) !== undefined
          ? { retry: (opts.retry ?? config.retry) as RetryConfig }
          : {}),
        ...(opts.pcFactory !== undefined ? { pcFactory: opts.pcFactory } : {}),
      });
    }

    publisher.value = p;

    const offState = p.on("state", (s) => {
      state.value = s;
    });
    const offViewer = p.on("viewer", () => {
      viewers.value = [...p.peers()];
    });
    const offViewerLeft = p.on("viewer-left", () => {
      viewers.value = [...p.peers()];
    });
    const offStats = p.on("stats", (s) => {
      stats.value = s;
    });
    const offError = p.on("error", (e) => {
      error.value = e;
    });

    if (autoStart) {
      void p.start();
    }

    onScopeDispose(() => {
      offState();
      offViewer();
      offViewerLeft();
      offStats();
      offError();
      void p.stop();
      publisher.value = null;
      state.value = "idle";
      viewers.value = [];
      stats.value = null;
    });
  }

  function buildResult(): UsePublisherResult {
    return {
      publisher,
      state,
      viewers,
      stats,
      error,
      start: async () => {
        if (publisher.value) await publisher.value.start();
      },
      stop: async () => {
        if (publisher.value) await publisher.value.stop();
      },
      replaceVideoTrack: async (track) => {
        if (publisher.value) await publisher.value.replaceVideoTrack(track);
      },
      replaceAudioTrack: async (track) => {
        if (publisher.value) await publisher.value.replaceAudioTrack(track);
      },
    };
  }

  return buildResult();
}
