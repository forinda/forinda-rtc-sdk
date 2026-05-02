/**
 * SDK-wide error hierarchy.
 *
 * Layered on top of the protocol error tree from
 * `@forinda/video-sdk-signaling-protocol`:
 *
 *   SdkError                                     (root for the broader SDK)
 *   ├── PermissionDeniedError
 *   ├── DeviceNotFoundError
 *   ├── DeviceInUseError
 *   ├── OverconstrainedError
 *   ├── PeerConnectionError                      (root for peer-layer errors)
 *   │   ├── IceFailedError
 *   │   ├── DtlsFailedError
 *   │   └── NegotiationError
 *   └── ConfigurationError
 *
 * Protocol errors (`SignalingProtocolError` and subclasses) are re-exported
 * unchanged — `core` never wraps them, so consumers can `instanceof`-check
 * the protocol class directly when handling signaling errors.
 *
 * Every error carries a stable `code` string (the contract — class names
 * may be renamed, codes will not), an optional `cause`, optional `context`,
 * and a `retryable` hint. The `retryable` field is advisory; the auto-retry
 * machinery (EPIC-3b) decides what to do based on which error was thrown,
 * not solely on this flag.
 */

export {
  PeerNotFoundError,
  RoomFullError,
  SignalingAuthError,
  SignalingProtocolError,
  SignalingValidationError,
  type SignalingErrorOptions,
} from "@forinda/video-sdk-signaling-protocol";

/** Constructor options shared by every {@link SdkError} subclass. */
export interface SdkErrorOptions {
  code?: string;
  cause?: unknown;
  context?: Record<string, unknown>;
  retryable?: boolean;
}

/**
 * Root of the SDK error hierarchy. Carries a stable code, optional cause +
 * context, and a `retryable` advisory flag.
 */
export class SdkError extends Error {
  readonly code: string;
  override readonly cause?: unknown;
  readonly context?: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(message: string, opts: SdkErrorOptions = {}) {
    super(message);
    this.name = "SdkError";
    this.code = opts.code ?? "sdk_error";
    if (opts.cause !== undefined) this.cause = opts.cause;
    if (opts.context !== undefined) this.context = opts.context;
    this.retryable = opts.retryable ?? false;
  }
}

type SubclassOpts = Omit<SdkErrorOptions, "code">;

/** Browser denied camera/microphone permission. Not retryable — user must grant. */
export class PermissionDeniedError extends SdkError {
  constructor(message: string, opts: SubclassOpts = {}) {
    super(message, { ...opts, code: "permission_denied" });
    this.name = "PermissionDeniedError";
  }
}

/** Requested deviceId does not exist (camera unplugged, etc.). */
export class DeviceNotFoundError extends SdkError {
  constructor(message: string, opts: SubclassOpts = {}) {
    super(message, { ...opts, code: "device_not_found" });
    this.name = "DeviceNotFoundError";
  }
}

/** OS holds the device exclusively (Zoom open, etc.). Often retryable. */
export class DeviceInUseError extends SdkError {
  constructor(message: string, opts: SubclassOpts = {}) {
    super(message, { ...opts, code: "device_in_use", retryable: opts.retryable ?? true });
    this.name = "DeviceInUseError";
  }
}

/** Constraints can't be satisfied (resolution unavailable, etc.). */
export class OverconstrainedError extends SdkError {
  constructor(message: string, opts: SubclassOpts = {}) {
    super(message, { ...opts, code: "overconstrained" });
    this.name = "OverconstrainedError";
  }
}

/** Root for `RTCPeerConnection`-layer errors. Retryable by default. */
export class PeerConnectionError extends SdkError {
  constructor(message: string, opts: SdkErrorOptions = {}) {
    super(message, {
      ...opts,
      code: opts.code ?? "peer_connection_error",
      retryable: opts.retryable ?? true,
    });
    this.name = "PeerConnectionError";
  }
}

/** ICE never connected, or went `failed` after restart attempts exhausted. */
export class IceFailedError extends PeerConnectionError {
  constructor(message: string, opts: SubclassOpts = {}) {
    super(message, { ...opts, code: "ice_failed" });
    this.name = "IceFailedError";
  }
}

/** DTLS handshake failed. */
export class DtlsFailedError extends PeerConnectionError {
  constructor(message: string, opts: SubclassOpts = {}) {
    super(message, { ...opts, code: "dtls_failed" });
    this.name = "DtlsFailedError";
  }
}

/** Perfect-negotiation collision could not be resolved or SDP exchange broke. */
export class NegotiationError extends PeerConnectionError {
  constructor(message: string, opts: SubclassOpts = {}) {
    super(message, { ...opts, code: "negotiation_error" });
    this.name = "NegotiationError";
  }
}

/** Bad iceServers config, missing required option, etc. Not retryable. */
export class ConfigurationError extends SdkError {
  constructor(message: string, opts: SubclassOpts = {}) {
    super(message, { ...opts, code: "configuration_error" });
    this.name = "ConfigurationError";
  }
}
