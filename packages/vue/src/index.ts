/**
 * Public surface for `@forinda/video-sdk-vue`.
 *
 * Re-exports only — implementation lives in sibling files.
 */

export {
  VideoSdkPlugin,
  VideoSdkConfigKey,
  useVideoSdkConfig,
  type VideoSdkConfig,
} from "./plugin.ts";

export { useUserMedia, type UserMediaState, type UseUserMediaResult } from "./use-user-media.ts";
export {
  useDisplayMedia,
  type DisplayMediaState,
  type UseDisplayMediaOptions,
  type UseDisplayMediaResult,
} from "./use-display-media.ts";
export { useDevices, type UseDevicesResult } from "./use-devices.ts";

export {
  usePublisher,
  type UsePublisherOptions,
  type UsePublisherResult,
} from "./use-publisher.ts";
export { useViewer, type UseViewerOptions, type UseViewerResult } from "./use-viewer.ts";
export { useConnectionStats, type UseConnectionStatsOptions } from "./use-connection-stats.ts";

export { useRoom, type UseRoomOptions, type UseRoomResult } from "./use-room.ts";
export {
  useRoomChannel,
  type UseRoomChannelOptions,
  type UseRoomChannelResult,
} from "./use-room-channel.ts";
export { usePresence, type UsePresenceResult } from "./use-presence.ts";
export { useChat, type UseChatResult } from "./use-chat.ts";
export { useRaiseHand, type UseRaiseHandResult } from "./use-raise-hand.ts";

export { useRecorder, type UseRecorderResult } from "./use-recorder.ts";
export { useUploader, type UseUploaderResult } from "./use-uploader.ts";

export { VideoView } from "./video-view.ts";
