/**
 * SFU-specific error codes. Extends the core `SdkError` so consumers can
 * `instanceof SdkError` and switch on `code`.
 */

import { SdkError, type SdkErrorOptions } from "@forinda/video-sdk-core";

export type SfuErrorCode =
  /** WebSocket / signaling failed; LiveKit `connect()` rejected. */
  | "sfu_connect_failed"
  /** Token validation failed at LiveKit. Usually a malformed or expired JWT. */
  | "sfu_token_invalid"
  /** `LocalParticipant.publishTrack` rejected. Usually codec / device / permissions. */
  | "sfu_publish_failed"
  /** `Room.disconnect()` fired unexpectedly during an active session. */
  | "sfu_disconnected";

export class SfuError extends SdkError {
  constructor(message: string, opts: Omit<SdkErrorOptions, "code"> & { code: SfuErrorCode }) {
    super(message, opts);
    this.name = "SfuError";
  }
}
