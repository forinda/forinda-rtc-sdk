/**
 * `WebSocketSignaling` — production browser-side `SignalingTransport`.
 *
 * Wraps a real `WebSocket` (or an injectable factory for tests) and adds
 * the production behaviors the spec requires:
 *
 * 1. **Auto-reconnect** with bounded exponential backoff + jitter. Loops
 *    forever; the session-level `RetryPolicy` (in Publisher/Viewer) bounds
 *    the user-visible give-up. Opt out via `reconnect: false`.
 * 2. **Outbound buffering** — messages sent while not yet `connected` are
 *    queued and flushed in order when the socket opens. The buffer is
 *    preserved across reconnect attempts.
 * 3. **Heartbeat ping** every `heartbeatIntervalMs` (default 30s). Sent as
 *    a literal `{"type":"ping"}` JSON string (not a wire-format message).
 *    If no inbound activity within `2 * heartbeatIntervalMs`, force a
 *    reconnect.
 * 4. **Auth callback** — if `auth: () => string | Promise<string>` is
 *    supplied, the resolved token is appended as `?token=...` (or
 *    `&token=...`) on every connect attempt (so rotated tokens work).
 *
 * Validates every inbound message via `SignalingMessage.safeParse`.
 * Malformed payloads are dropped with a warn-level log and never reach the
 * `message` handler.
 */

import {
  SignalingMessage,
  type SignalingMessageType,
  type SignalingTransport,
  type TransportState,
  getLogger,
} from "@forinda/video-sdk-core";
import { nextBackoff, type BackoffOptions } from "./backoff.ts";

export type WebSocketFactory = (url: string, protocols?: string | string[]) => WebSocket;

/** Constructor options for {@link defineWebSocketSignaling}. */
export interface WebSocketSignalingOptions {
  /** Endpoint URL (`wss://...` or `ws://...`). */
  url: string;
  /** Optional WebSocket sub-protocols. */
  protocols?: string | string[];
  /** Override the WebSocket constructor (test injection). Defaults to `globalThis.WebSocket`. */
  wsFactory?: WebSocketFactory;
  /** Auto-reconnect on unexpected close. Default `true`. */
  reconnect?: boolean;
  /** Backoff config for the reconnect loop. */
  backoff?: BackoffOptions;
  /** Heartbeat ping interval in ms. Default `30000`. Set `0` to disable. */
  heartbeatIntervalMs?: number;
  /** Async token resolver — returned string appended as `?token=...`. */
  auth?: () => string | Promise<string>;
}

type MessageHandler = (msg: SignalingMessageType) => void;
type StateHandler = (state: TransportState) => void;

const PING_FRAME = '{"type":"ping"}';

/**
 * Browser WebSocket transport. Construct via {@link defineWebSocketSignaling};
 * the class is exported for type imports + `instanceof` checks.
 */
export class WebSocketSignaling implements SignalingTransport {
  private readonly opts: WebSocketSignalingOptions;
  private readonly wsFactory: WebSocketFactory;
  private readonly reconnect: boolean;
  private readonly heartbeatIntervalMs: number;
  private _state: TransportState = "idle";
  private ws: WebSocket | undefined;
  private messageHandlers = new Set<MessageHandler>();
  private stateHandlers = new Set<StateHandler>();
  private outboundQueue: SignalingMessageType[] = [];
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private lastInboundAt = 0;
  private userClosed = false;
  /** Disposers for the listeners on the current ws. Reset on each open. */
  private wsDisposers: (() => void)[] = [];

  constructor(opts: WebSocketSignalingOptions) {
    this.opts = opts;
    this.wsFactory = opts.wsFactory ?? ((url, protocols) => new WebSocket(url, protocols));
    this.reconnect = opts.reconnect ?? true;
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? 30_000;
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
    this.userClosed = false;
    this.transitionTo("connecting");
    await this.openSocket();
  }

  async disconnect(): Promise<void> {
    if (this._state === "closed") return;
    this.userClosed = true;
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.stopHeartbeat();
    if (this.ws !== undefined) {
      this.ws.close(1000, "client disconnect");
    }
    this.transitionTo("closed");
  }

  async send(message: SignalingMessageType): Promise<void> {
    if (this._state === "connected" && this.ws !== undefined) {
      this.ws.send(JSON.stringify(message));
      return;
    }
    // Queue while connecting, reconnecting, or idle.
    this.outboundQueue.push(message);
  }

  private transitionTo(next: TransportState): void {
    if (this._state === next) return;
    this._state = next;
    for (const h of this.stateHandlers) {
      try {
        h(next);
      } catch {
        // ignore listener exceptions
      }
    }
  }

  private async openSocket(): Promise<void> {
    let url = this.opts.url;
    if (this.opts.auth !== undefined) {
      const token = await this.opts.auth();
      const sep = url.includes("?") ? "&" : "?";
      url = `${url}${sep}token=${encodeURIComponent(token)}`;
    }

    const ws = this.wsFactory(url, this.opts.protocols);
    this.ws = ws;

    const onOpen = (): void => {
      this.reconnectAttempt = 0;
      this.transitionTo("connected");
      this.lastInboundAt = Date.now();
      this.startHeartbeat();
      this.flushQueue();
    };

    const onMessage = (event: Event): void => {
      this.lastInboundAt = Date.now();
      const data = (event as MessageEvent).data;
      if (typeof data !== "string") return;
      // Ignore pings/pongs and other transport-internal frames silently.
      if (data === PING_FRAME) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch (cause) {
        getLogger().warn("ws: malformed JSON inbound", { data, cause });
        return;
      }
      // Ignore other transport-internal control frames (e.g. server pong).
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        (parsed as { type?: string }).type === "pong"
      ) {
        return;
      }
      const result = SignalingMessage.safeParse(parsed);
      if (!result.success) {
        getLogger().warn("ws: inbound failed schema validation", {
          data,
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

    const onClose = (): void => {
      this.stopHeartbeat();
      for (const d of this.wsDisposers) d();
      this.wsDisposers = [];
      this.ws = undefined;

      if (this.userClosed || !this.reconnect) {
        this.transitionTo("closed");
        return;
      }

      this.transitionTo("reconnecting");
      this.scheduleReconnect();
    };

    const onError = (): void => {
      // close handler will fire next; nothing to do here.
    };

    ws.addEventListener("open", onOpen);
    ws.addEventListener("message", onMessage);
    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onError);

    this.wsDisposers.push(
      () => ws.removeEventListener("open", onOpen),
      () => ws.removeEventListener("message", onMessage),
      () => ws.removeEventListener("close", onClose),
      () => ws.removeEventListener("error", onError),
    );
  }

  private scheduleReconnect(): void {
    const delay = nextBackoff(this.reconnectAttempt, this.opts.backoff);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      void this.openSocket();
    }, delay);
  }

  private flushQueue(): void {
    if (this.ws === undefined) return;
    while (this.outboundQueue.length > 0) {
      const next = this.outboundQueue.shift();
      if (next === undefined) break;
      this.ws.send(JSON.stringify(next));
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatIntervalMs <= 0) return;
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      // Liveness check: if no inbound activity for 2× interval, force reconnect.
      if (Date.now() - this.lastInboundAt > this.heartbeatIntervalMs * 2) {
        if (this.ws !== undefined) {
          this.ws.close(4000, "heartbeat timeout");
        }
        return;
      }
      // Send ping. Bypass send() because PING_FRAME isn't a wire-format message.
      if (this.ws !== undefined && this._state === "connected") {
        this.ws.send(PING_FRAME);
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }
}

/**
 * Declarative factory for {@link WebSocketSignaling}. Recommended call style.
 *
 * ```ts
 * const signaling = defineWebSocketSignaling({
 *   url: "wss://signal.example.com",
 *   reconnect: true,
 *   auth: async () => fetchAuthToken(),
 * });
 * ```
 */
export function defineWebSocketSignaling(opts: WebSocketSignalingOptions): WebSocketSignaling {
  return new WebSocketSignaling(opts);
}
