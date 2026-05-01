export interface SignalingErrorOptions {
  code?: string;
  cause?: unknown;
  context?: Record<string, unknown>;
}

export class SignalingProtocolError extends Error {
  readonly code: string;
  override readonly cause?: unknown;
  readonly context?: Record<string, unknown>;

  constructor(message: string, opts: SignalingErrorOptions = {}) {
    super(message);
    this.name = "SignalingProtocolError";
    this.code = opts.code ?? "signaling_protocol_error";
    if (opts.cause !== undefined) this.cause = opts.cause;
    if (opts.context !== undefined) this.context = opts.context;
  }
}

export class SignalingValidationError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "signaling_validation" });
    this.name = "SignalingValidationError";
  }
}

export class SignalingAuthError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "signaling_auth" });
    this.name = "SignalingAuthError";
  }
}

export class RoomFullError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "room_full" });
    this.name = "RoomFullError";
  }
}

export class PeerNotFoundError extends SignalingProtocolError {
  constructor(message: string, opts: Omit<SignalingErrorOptions, "code"> = {}) {
    super(message, { ...opts, code: "peer_not_found" });
    this.name = "PeerNotFoundError";
  }
}
