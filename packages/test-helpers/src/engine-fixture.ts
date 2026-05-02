/**
 * `defineEngineFixture` — wires a real `Session` from `@forinda/video-sdk-signaling-protocol`
 * to N in-memory transports, each routable by `peerId` once the peer joins.
 *
 * Use when you want to test core SDK code (Publisher / Viewer / RoomChannel,
 * future `Room`) end-to-end against the actual engine — same code path as
 * production, no hand-rolled fake state machine.
 *
 * The fixture keeps a `peerId` field on each transport so the engine's
 * outbound `onSend` handler can route messages back to the right side. This
 * field is set automatically the first time a transport sees a `join` reply
 * (which it does because the engine echoes peer-joined to the joiner).
 *
 * Cleanup: call `closeAll()` in your test's `afterEach` to release ports
 * and detach handlers.
 */

import { defineSession, type Session } from "@forinda/video-sdk-signaling-protocol";
import type {
  SignalingMessageType,
  SignalingTransport,
  TransportState,
} from "@forinda/video-sdk-core";

/** A transport produced by {@link defineEngineFixture} with the routing field. */
export interface FixtureTransport extends SignalingTransport {
  /** Engine-assigned peerId once the socket has joined. Used for outbound routing. */
  __peerId?: string;
}

export interface EngineFixture {
  /** The shared `Session` driving all transports. */
  readonly session: Session;
  /**
   * Open a new transport for the given `socketId`. The returned object is
   * a real {@link SignalingTransport} — pass it straight to `definePublisher`,
   * `defineViewer`, or `defineRoomChannel`.
   */
  open(socketId: string): Promise<FixtureTransport>;
  /** Disconnect every open transport. Safe to call multiple times. */
  closeAll(): Promise<void>;
}

export interface EngineFixtureOptions {
  /** Forwarded to `defineSession({ chatHistoryPerRoom })`. */
  chatHistoryPerRoom?: number;
}

export function defineEngineFixture(opts: EngineFixtureOptions = {}): EngineFixture {
  const session = defineSession(opts);
  const transports = new Map<string, FixtureTransport>();

  session.onSend((peerId, msg) => {
    for (const t of transports.values()) {
      if (t.__peerId === peerId) {
        // Engines emit the joiner's first peer-joined echo by their own
        // peerId — capture it as the routing key for subsequent outbound
        // messages.
        feedTransport(t, msg);
        return;
      }
    }
  });

  return {
    session,
    async open(socketId) {
      const t = defineFixtureTransport(socketId, session);
      // Wrap send so we capture the peerId on join — the engine routes by
      // peerId, but the test author shouldn't have to call a manual bind step.
      const originalSend = t.send.bind(t);
      t.send = async (message) => {
        if (message.type === "join") {
          t.__peerId = message.peer;
        }
        return originalSend(message);
      };
      transports.set(socketId, t);
      return t;
    },
    async closeAll() {
      for (const t of [...transports.values()]) {
        try {
          await t.disconnect();
        } catch {
          // Already-closed transports are fine; we just want a clean teardown.
        }
      }
      transports.clear();
    },
  };
}

interface FeedableTransport extends FixtureTransport {
  __feed(msg: SignalingMessageType): void;
}

function feedTransport(t: FixtureTransport, msg: SignalingMessageType): void {
  (t as FeedableTransport).__feed(msg);
}

function defineFixtureTransport(socketId: string, session: Session): FeedableTransport {
  const messageHandlers = new Set<(m: SignalingMessageType) => void>();
  const stateHandlers = new Set<(s: TransportState) => void>();
  let state: TransportState = "idle";

  return {
    get state() {
      return state;
    },
    async connect() {
      if (state === "connected") return;
      state = "connected";
      for (const h of stateHandlers) h(state);
      await session.handleConnection(socketId, {});
    },
    async disconnect() {
      if (state === "closed") return;
      state = "closed";
      for (const h of stateHandlers) h(state);
      await session.handleDisconnect(socketId);
    },
    async send(message) {
      await session.handleMessage(socketId, JSON.stringify(message));
    },
    on<E extends "message" | "state">(
      event: E,
      handler: E extends "message"
        ? (m: SignalingMessageType) => void
        : (s: TransportState) => void,
    ): () => void {
      if (event === "message") {
        const h = handler as (m: SignalingMessageType) => void;
        messageHandlers.add(h);
        return () => messageHandlers.delete(h);
      }
      const h = handler as (s: TransportState) => void;
      stateHandlers.add(h);
      return () => stateHandlers.delete(h);
    },
    __feed(msg) {
      for (const h of messageHandlers) h(msg);
    },
  };
}
