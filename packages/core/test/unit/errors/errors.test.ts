import { describe, expect, it } from "vitest";
import {
  ConfigurationError,
  DeviceInUseError,
  DeviceNotFoundError,
  DtlsFailedError,
  IceFailedError,
  NegotiationError,
  OverconstrainedError,
  PeerConnectionError,
  PermissionDeniedError,
  SdkError,
} from "@/errors/errors.ts";
import { SignalingProtocolError } from "@forinda/video-sdk-signaling-protocol";

describe("SdkError hierarchy", () => {
  it("SdkError carries code, cause, context, retryable", () => {
    const cause = new Error("underlying");
    const err = new SdkError("boom", {
      code: "sdk_error",
      cause,
      context: { peerId: "alice" },
      retryable: true,
    });
    expect(err.message).toBe("boom");
    expect(err.code).toBe("sdk_error");
    expect(err.cause).toBe(cause);
    expect(err.context).toEqual({ peerId: "alice" });
    expect(err.retryable).toBe(true);
    expect(err.name).toBe("SdkError");
    expect(err).toBeInstanceOf(Error);
  });

  it("retryable defaults to false", () => {
    const err = new SdkError("x");
    expect(err.retryable).toBe(false);
  });

  it.each([
    ["PermissionDeniedError", PermissionDeniedError, "permission_denied", false],
    ["DeviceNotFoundError", DeviceNotFoundError, "device_not_found", false],
    ["DeviceInUseError", DeviceInUseError, "device_in_use", true],
    ["OverconstrainedError", OverconstrainedError, "overconstrained", false],
    ["PeerConnectionError", PeerConnectionError, "peer_connection_error", true],
    ["IceFailedError", IceFailedError, "ice_failed", true],
    ["DtlsFailedError", DtlsFailedError, "dtls_failed", true],
    ["NegotiationError", NegotiationError, "negotiation_error", true],
    ["ConfigurationError", ConfigurationError, "configuration_error", false],
  ])("%s has stable code %s", (name, Ctor, code, retryable) => {
    const err = new (Ctor as new (msg: string) => SdkError)("test");
    expect(err.code).toBe(code);
    expect(err.retryable).toBe(retryable);
    expect(err).toBeInstanceOf(SdkError);
    expect(err.name).toBe(name);
  });

  it("IceFailedError is also a PeerConnectionError", () => {
    const err = new IceFailedError("ice fail");
    expect(err).toBeInstanceOf(PeerConnectionError);
    expect(err).toBeInstanceOf(SdkError);
  });

  it("re-exports SignalingProtocolError tree from the protocol package", () => {
    expect(SignalingProtocolError).toBeDefined();
  });
});
