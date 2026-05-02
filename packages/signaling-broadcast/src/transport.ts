/**
 * `BroadcastSignaling` — same-tab `SignalingTransport` over `BroadcastChannel`.
 *
 * Useful for:
 * - Demos that run publisher and viewer in the same browser tab (or two
 *   tabs of the same origin).
 * - Unit / integration tests that need a real `SignalingTransport` without
 *   spinning up a server.
 *
 * Limitations:
 * - **Same-origin only.** `BroadcastChannel` is scoped to the browsing
 *   context — it cannot bridge two machines or cross-origin tabs.
 * - **No reconnect.** Channels are process-local and don't drop. If the
 *   underlying tab closes, every transport in the channel is gone.
 * - **No buffering.** Delivery is synchronous within a tab.
 * - **No auth.** This is a local mechanism; if you want auth, use a real
 *   server transport (`@forinda/video-sdk-signaling-ws`).
 */

import {
  SignalingMessage,
  type SignalingMessageType,
  type SignalingTransport,
  type TransportState,
  getLogger,
} from "@forinda/video-sdk-core";

/** Constructor options for {@link defineBroadcastSignaling}. */
export interface BroadcastSignalingOptions {
  /** Channel name. Two transports must share this string to communicate. */
  channel: string;
}

type MessageHandler = (msg: SignalingMessageType) => void;
type StateHandler = (state: TransportState) => void;

/**
 * Same-tab BroadcastChannel transport. Construct via
 * {@link defineBroadcastSignaling}; the class is exported for type imports
 * + `instanceof` checks.
 */
export class BroadcastSignaling implements SignalingTransport {
  private readonly channelName: string;
  private _state: TransportState = "idle";
  private bc: BroadcastChannel | undefined;
  private messageHandlers = new Set<MessageHandler>();
  private stateHandlers = new Set<StateHandler>();

  constructor(opts: BroadcastSignalingOptions) {
    this.channelName = opts.channel;
  }

  get state(): TransportState {
    return this._state;
  }

  on(event: "message", handler: MessageHandler): () => void;
  on(event: "state", handler: StateHandler): () => void;
  on(event: "message" | "state", handler: MessageHandler | StateHandler): () => void {
    if (event === "message") {
      const h = handler as MessageHandler;
      this.messageHandlers.add(h);
      return () => this.messageHandlers.delete(h);
    }
    const h = handler as StateHandler;
    this.stateHandlers.add(h);
    return () => this.stateHandlers.delete(h);
  }

  async connect(): Promise<void> {
    if (this._state === "connected" || this._state === "connecting") return;
    this.transitionTo("connecting");
    this.bc = new BroadcastChannel(this.channelName);
    this.bc.addEventListener("message", this.onChannelMessage);
    this.transitionTo("connected");
  }

  async disconnect(): Promise<void> {
    if (this._state === "closed") return;
    if (this.bc !== undefined) {
      this.bc.removeEventListener("message", this.onChannelMessage);
      this.bc.close();
      this.bc = undefined;
    }
    this.transitionTo("closed");
  }

  async send(message: SignalingMessageType): Promise<void> {
    if (this.bc === undefined || this._state !== "connected") {
      throw new Error("BroadcastSignaling: cannot send while not connected");
    }
    this.bc.postMessage(message);
  }

  private readonly onChannelMessage = (event: MessageEvent): void => {
    const result = SignalingMessage.safeParse(event.data);
    if (!result.success) {
      getLogger().warn("broadcast: inbound failed schema validation", {
        data: event.data,
        cause: result.error,
      });
      return;
    }
    for (const h of this.messageHandlers) {
      try {
        h(result.data);
      } catch {
        // ignore listener exceptions
      }
    }
  };

  private transitionTo(next: TransportState): void {
    if (this._state === next) return;
    this._state = next;
    for (const h of this.stateHandlers) {
      try {
        h(next);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Declarative factory for {@link BroadcastSignaling}. Recommended call style.
 *
 * ```ts
 * const a = defineBroadcastSignaling({ channel: "demo-room" });
 * const b = defineBroadcastSignaling({ channel: "demo-room" });
 * await a.connect();
 * await b.connect();
 * a.on("message", (msg) => console.log(msg));
 * await b.send({ type: "join", room: "demo", peer: "p", role: "publisher" });
 * ```
 */
export function defineBroadcastSignaling(opts: BroadcastSignalingOptions): BroadcastSignaling {
  return new BroadcastSignaling(opts);
}
