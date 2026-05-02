/**
 * Paired in-memory `SignalingTransport`s for integration tests.
 *
 * `defineInMemoryTransportPair()` returns `{ publisher, viewer }`. The pair
 * is symmetric — the field names label intent, not behavior. Each side's
 * `send(msg)` enqueues the message into the other's `message` listeners
 * (via `queueMicrotask`, mirroring real async). Calling `connect()` on
 * either side flips both to `connected`; `disconnect()` flips both to
 * `closed`.
 *
 * No JSON serialization happens here. Wire-format validation is exercised by
 * the `@forinda/video-sdk-signaling-protocol` test suite; this helper
 * focuses on publisher↔viewer choreography in core/react/elements tests.
 */

import type {
  SignalingMessageType,
  SignalingTransport,
  TransportState,
} from "@forinda/video-sdk-core";

interface PairedTransport extends SignalingTransport {
  __deliver(message: SignalingMessageType): void;
  __setState(state: TransportState): void;
  __setPeer(peer: PairedTransport): void;
}

function defineSide(): PairedTransport {
  const messageHandlers = new Set<(msg: SignalingMessageType) => void>();
  const stateHandlers = new Set<(state: TransportState) => void>();
  let state: TransportState = "idle";
  let peer: PairedTransport | undefined;

  const t: PairedTransport = {
    get state() {
      return state;
    },
    async connect() {
      if (state === "connected") return;
      state = "connected";
      for (const h of stateHandlers) h(state);
      if (peer !== undefined && peer.state !== "connected") {
        peer.__setState("connected");
      }
    },
    async disconnect() {
      if (state === "closed") return;
      state = "closed";
      for (const h of stateHandlers) h(state);
      if (peer !== undefined && peer.state !== "closed") {
        peer.__setState("closed");
      }
    },
    async send(message) {
      if (peer === undefined) return;
      const target = peer;
      queueMicrotask(() => target.__deliver(message));
    },
    on(event, handler) {
      if (event === "message") {
        const h = handler as (msg: SignalingMessageType) => void;
        messageHandlers.add(h);
        return () => messageHandlers.delete(h);
      }
      const h = handler as (s: TransportState) => void;
      stateHandlers.add(h);
      return () => stateHandlers.delete(h);
    },
    __deliver(message) {
      for (const h of messageHandlers) h(message);
    },
    __setState(next) {
      state = next;
      for (const h of stateHandlers) h(state);
    },
    __setPeer(p) {
      peer = p;
    },
  };

  return t;
}

/**
 * Build two paired in-memory `SignalingTransport`s. Messages sent from
 * `publisher.send` arrive at handlers registered on
 * `viewer.on("message", ...)` and vice versa.
 */
export function defineInMemoryTransportPair(): {
  publisher: SignalingTransport;
  viewer: SignalingTransport;
} {
  const publisher = defineSide();
  const viewer = defineSide();
  publisher.__setPeer(viewer);
  viewer.__setPeer(publisher);
  return { publisher, viewer };
}
