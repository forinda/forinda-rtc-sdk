/**
 * `VideoSdkPlugin` — supplies default config (signaling factory, ICE servers,
 * retry policy) to every composable in the tree via Vue's `provide` /
 * `inject`. Equivalent to React's `<VideoSdkProvider>`.
 *
 * Each `usePublisher` / `useViewer` / `useRoom*` composable looks up the
 * config via {@link useVideoSdkConfig}; per-call options always win over
 * provider defaults.
 *
 * @example
 * ```ts
 * import { createApp } from "vue";
 * import { VideoSdkPlugin } from "@forinda/video-sdk-vue";
 * import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";
 *
 * const app = createApp(App);
 * app.use(VideoSdkPlugin, {
 *   signaling: () => defineWebSocketSignaling({ url: "wss://signal.example.com" }),
 *   iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
 * });
 * app.mount("#app");
 * ```
 */

import { getCurrentInstance, inject, type App, type InjectionKey } from "vue";
import type { RetryConfig, SignalingTransport } from "@forinda/video-sdk-core";

export interface VideoSdkConfig {
  /**
   * Factory returning a fresh `SignalingTransport` per consumer. Using a
   * factory (not an instance) means each `usePublisher` / `useViewer` gets
   * its own transport — multiple components in one tree don't fight over
   * one socket. Use `useRoom` when you DO want one transport shared.
   */
  signaling?: () => SignalingTransport;
  iceServers?: RTCIceServer[];
  retry?: RetryConfig;
}

/**
 * Vue injection key for `VideoSdkConfig`. Symbol-typed so multiple plugins
 * can coexist without colliding.
 */
export const VideoSdkConfigKey: InjectionKey<VideoSdkConfig> = Symbol("VideoSdkConfig");

/**
 * The Vue 3 plugin. Install via `app.use(VideoSdkPlugin, config)`.
 */
export const VideoSdkPlugin = {
  install(app: App, options: VideoSdkConfig = {}): void {
    app.provide(VideoSdkConfigKey, options);
  },
};

/**
 * Read the active `VideoSdkConfig`. Returns an empty object when no plugin
 * is installed (every option is optional, and per-composable opts always
 * supersede the provider). Safe to call outside of a component instance —
 * returns `{}` when there is no active instance for `inject` to read from.
 */
export function useVideoSdkConfig(): VideoSdkConfig {
  if (!getCurrentInstance()) return {};
  return inject(VideoSdkConfigKey, {});
}
