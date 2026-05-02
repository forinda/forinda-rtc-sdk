/**
 * Public surface for `@forinda/video-sdk-core`.
 *
 * EPIC-3a exports the foundational primitives (logger, events, errors,
 * media helpers, peer wrappers, stats). EPIC-3b extends this with the
 * Publisher/Viewer orchestration layer.
 *
 * Re-exports only — implementation lives in sibling files. Always import
 * from this entrypoint.
 */

// Logger
export { defaultLogger, getLogger, setLogger, type Logger } from "./logger/logger.ts";

// Events
export { defineEmitter, Emitter, type EventMap, type Listener } from "./events/emitter.ts";

// Errors (SDK + re-exported protocol errors)
export {
  ConfigurationError,
  DeviceInUseError,
  DeviceNotFoundError,
  DtlsFailedError,
  IceFailedError,
  NegotiationError,
  OverconstrainedError,
  PeerConnectionError,
  PeerNotFoundError,
  PermissionDeniedError,
  RoomFullError,
  SdkError,
  SignalingAuthError,
  SignalingProtocolError,
  SignalingValidationError,
  type SdkErrorOptions,
  type SignalingErrorOptions,
} from "./errors/errors.ts";

// Internal helpers (exported for advanced consumers)
export { invariant } from "./internal/assert.ts";
export { defineDeferred, type Deferred } from "./internal/deferred.ts";

// Signaling
export {
  IceCand,
  JoinRoom,
  LeaveRoom,
  PeerJoined,
  PeerLeft,
  Sdp,
  SignalingMessage,
  type ChatMessage,
  type IceCandMessage,
  type JoinRoomMessage,
  type JsonValue,
  type LeaveRoomMessage,
  type PeerJoinedMessage,
  type PeerLeftMessage,
  type PresenceSnapshotMessage,
  type PresenceStateMessage,
  type PresenceUpdateMessage,
  type SdpMessage,
  type SignalingMessageType,
  type SignalingTransport,
  type TransportState,
} from "./signaling/transport.ts";

// Media
export { buildConstraints, type CaptureOptions } from "./media/constraints.ts";
export { getUserMedia } from "./media/user-media.ts";
export { getDisplayMedia, type DisplayCaptureOptions } from "./media/display-media.ts";
export { enumerateDevices, watchDevices, type DeviceList } from "./media/devices.ts";
export { replaceAudioTrack, replaceVideoTrack } from "./media/track-replacer.ts";

// Peer
export { normalizeIceServers, type IceServerConfig } from "./peer/ice.ts";
export { hasMediaSection, listCodecPayloadTypes } from "./peer/sdp.ts";
export {
  definePeerConnection,
  PeerConnection,
  type PcFactory,
  type PeerConnectionEvents,
  type PeerConnectionOptions,
} from "./peer/peer-connection.ts";
export {
  defineNegotiator,
  Negotiator,
  type NegotiatorOptions,
  type SendFn,
} from "./peer/negotiation.ts";

// Stats
export type { ConnectionStats, InboundStats, OutboundStats } from "./stats/types.ts";
export { normalizeStats } from "./stats/normalize.ts";
export {
  defineStatsCollector,
  StatsCollector,
  type StatsCollectorEvents,
  type StatsCollectorOptions,
} from "./stats/collector.ts";

// State machine
export {
  defineStateMachine,
  StateMachine,
  type ConnectionState,
  type StateMachineOptions,
} from "./state/connection-state.ts";

// Retry policy
export { defineRetryPolicy, RetryPolicy, type RetryConfig } from "./retry/policy.ts";

// Publisher
export { definePublisher, Publisher } from "./publisher/publisher.ts";
export type { PublisherEvents, PublisherOptions, ViewerInfo } from "./publisher/types.ts";

// Viewer
export { defineViewer, Viewer } from "./viewer/viewer.ts";
export type { ViewerEvents, ViewerOptions } from "./viewer/types.ts";

// Room channel — presence + chat
export { defineRoomChannel, RoomChannel } from "./room/room-channel.ts";
export type {
  ChatHistoryEntry,
  PresenceEntry,
  RoomChannelEvents,
  RoomChannelOptions,
  RoomPeerEntry,
} from "./room/types.ts";
export {
  definePresenceDiff,
  type PresenceDiff,
  type PresenceDiffChange,
  type PresenceDiffEntry,
  type PresenceMap,
} from "./room/presence-diff.ts";

// Recording — MediaRecorder wrapper
export { defineRecorder, Recorder } from "./recording/recorder.ts";
export {
  DEFAULT_CODEC_PREFERENCES,
  isRecordingTypeSupported,
  pickRecordingType,
} from "./recording/codec-support.ts";
export type {
  RecorderChunk,
  RecorderEvents,
  RecorderOptions,
  RecorderState,
} from "./recording/types.ts";
