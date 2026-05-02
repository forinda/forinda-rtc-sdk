/**
 * `getUserMedia` wrapper.
 *
 * The browser API throws raw `DOMException` instances with a `name` that
 * varies across versions. This wrapper:
 * 1. Builds the constraints via {@link "@/media/constraints.ts".buildConstraints}.
 * 2. Calls `navigator.mediaDevices.getUserMedia`.
 * 3. Maps `DOMException.name` -> typed `SdkError` subclass.
 *
 * Error mapping:
 *
 *   | DOMException.name        | thrown                  |
 *   | ------------------------ | ----------------------- |
 *   | NotAllowedError          | PermissionDeniedError   |
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
import { buildConstraints, type CaptureOptions } from "@/media/constraints.ts";

/**
 * Request a media stream from the browser. Throws a typed `SdkError`
 * subclass on failure.
 */
export async function getUserMedia(opts: CaptureOptions): Promise<MediaStream> {
  if (typeof navigator === "undefined" || navigator.mediaDevices === undefined) {
    throw new ConfigurationError("navigator.mediaDevices is not available");
  }
  const constraints = buildConstraints(opts);
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (cause) {
    throw mapMediaError(cause);
  }
}

function mapMediaError(cause: unknown): SdkError {
  const name = (cause as { name?: string } | null)?.name ?? "";
  const message = (cause as { message?: string } | null)?.message ?? "media error";
  switch (name) {
    case "NotAllowedError":
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
      return new SdkError(message, { code: "media_error", cause });
  }
}
