/**
 * Public surface for `@forinda/test-helpers`.
 *
 * Internal-only utilities consumed by the SDK packages' own test suites.
 * Not published to npm.
 *
 * Re-exports only — implementations live in sibling files.
 */

export {
  defineFakePeerConnection,
  type FakePCEvent,
  type FakePeerConnection,
} from "./fake-peer-connection.ts";

export { defineInMemoryTransportPair } from "./in-memory-signaling.ts";

export {
  expectStateSequence,
  type ExpectStateSequenceOptions,
  type StateSource,
} from "./expect-state-sequence.ts";

export { defineDevServer, type DevServerHandle, type DevServerOptions } from "./dev-server.ts";

export { recordRtpFlow, type RecordRtpFlowOptions, type StatsSource } from "./record-rtp-flow.ts";
