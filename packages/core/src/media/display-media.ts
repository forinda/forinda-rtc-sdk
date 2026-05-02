/**
 * `getDisplayMedia` wrapper for screen / window / tab sharing.
 *
 * Mirror of {@link "@/media/user-media.ts".getUserMedia} but talks to the
 * display-capture API. Defaults `audio` to `false` because most browsers
 * silently drop the audio request unless the user explicitly grants it
 * (and most consumers don't actually want system audio mixed in).
 *
 * Error mapping:
 *
 *   | DOMException.name        | thrown                  |
 *   | ------------------------ | ----------------------- |
 *   | NotAllowedError          | PermissionDeniedError   |
 *   | AbortError               | PermissionDeniedError   | (user clicked Cancel in picker)
 *   | SecurityError            | PermissionDeniedError   |
 *   | NotFoundError            | DeviceNotFoundError     |
 *   | NotReadableError         | DeviceInUseError        |
 *   | OverconstrainedError     | OverconstrainedError    |
 *   | TypeError                | ConfigurationError      |
 *   | (anything else)          | SdkError                |
 */

import {
  ConfigurationError,
  DeviceInUseError,
  DeviceNotFoundError,
  OverconstrainedError,
  PermissionDeniedError,
  SdkError,
} from "@/errors/errors.ts";

/** Options for {@link getDisplayMedia}. */
export interface DisplayCaptureOptions {
  /** Default `false` — most consumers don't want system audio. */
  audio?: boolean | MediaTrackConstraints;
  /** Default `true` — there's almost no point calling this without video. */
  video?: boolean | MediaTrackConstraints;
}

/**
 * Open the browser's screen-share picker and return the captured stream.
 * Throws a typed `SdkError` subclass on failure (including user-cancelled).
 */
export async function getDisplayMedia(opts: DisplayCaptureOptions = {}): Promise<MediaStream> {
  if (typeof navigator === "undefined" || navigator.mediaDevices === undefined) {
    throw new ConfigurationError("navigator.mediaDevices is not available");
  }
  const md = navigator.mediaDevices as MediaDevices & {
    getDisplayMedia?: (c: DisplayMediaStreamOptions) => Promise<MediaStream>;
  };
  if (typeof md.getDisplayMedia !== "function") {
    throw new ConfigurationError("navigator.mediaDevices.getDisplayMedia is not available");
  }
  const constraints: DisplayMediaStreamOptions = {
    audio: opts.audio ?? false,
    video: opts.video ?? true,
  };
  try {
    return await md.getDisplayMedia(constraints);
  } catch (cause) {
    throw mapDisplayMediaError(cause);
  }
}

function mapDisplayMediaError(cause: unknown): SdkError {
  const name = (cause as { name?: string } | null)?.name ?? "";
  const message = (cause as { message?: string } | null)?.message ?? "display capture error";
  switch (name) {
    case "NotAllowedError":
    case "AbortError":
    case "SecurityError":
      return new PermissionDeniedError(message, { cause });
    case "NotFoundError":
      return new DeviceNotFoundError(message, { cause });
    case "NotReadableError":
      return new DeviceInUseError(message, { cause });
    case "OverconstrainedError":
      return new OverconstrainedError(message, { cause });
    case "TypeError":
      return new ConfigurationError(message, { cause });
    default:
      return new SdkError(message, { code: "display_capture_error", cause });
  }
}
