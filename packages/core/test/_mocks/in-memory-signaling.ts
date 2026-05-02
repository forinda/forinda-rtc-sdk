import type {
  SignalingMessageType,
  SignalingTransport,
  TransportState,
} from "@/signaling/transport.ts";

/**
 * Paired in-memory `SignalingTransport` fakes.
 *
 * `createInMemoryTransportPair()` returns `{ publisher, viewer }` where each
 * side's `send(msg)` enqueues the message into the other's `message`
 * listeners (queueMicrotask, mirroring real async). Calling `connect()` on
 * either side flips both to `connected`; `disconnect()` flips both to
 * `closed`.
 *
 * No JSON serialization. Wire-format validation is exercised by the
 * `@forinda/video-sdk-signaling-protocol` test suite (EPIC-2); this fixture
 * focuses on the publisher↔viewer choreography in core.
 */

interface PairedTransport extends SignalingTransport {
  __deliver(message: SignalingMessageType): void;
  __setState(state: TransportState): void;
}

function createSide(): PairedTransport {
  const messageHandlers = new Set<(msg: SignalingMessageType) => void>();
  const stateHandlers = new Set<(state: TransportState) => void>();
  let state: TransportState = "idle";
  let peer: PairedTransport | undefined;

  const t: PairedTransport = {
    get state() {
      return state;
    },
    async connect() {
      // Both sides flip to connected together; no-op if peer already did it.
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
  };

  // late binding helper — set after both sides constructed
  (t as PairedTransport & { __setPeer: (p: PairedTransport) => void }).__setPeer = (p) => {
    peer = p;
  };
  return t;
}

/**
 * Build two paired in-memory `SignalingTransport`s. Messages sent from
 * `publisher.send` arrive at handlers registered on `viewer.on("message", ...)`
 * and vice versa.
 */
export function createInMemoryTransportPair(): {
  publisher: SignalingTransport;
  viewer: SignalingTransport;
} {
  const a = createSide();
  const b = createSide();
  (a as PairedTransport & { __setPeer: (p: PairedTransport) => void }).__setPeer(b);
  (b as PairedTransport & { __setPeer: (p: PairedTransport) => void }).__setPeer(a);
  return { publisher: a, viewer: b };
}
