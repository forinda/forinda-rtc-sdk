/**
 * `Room` — higher-level coordinator that owns a single `SignalingTransport`
 * lifecycle plus the **single** `join` for the room. Eliminates the
 * footgun where a `Publisher` and a `RoomChannel` (or any other child)
 * sharing one transport silently overwrite each other's join binding on
 * the engine.
 *
 * Composition is via either:
 *
 * 1. **Sugar methods on the Room itself** — `room.publisher({ stream })`,
 *    `room.viewer({ publisherId })`, `room.channel()`, `room.recorder(stream)`.
 *    Each is a thin wrapper around its proxy factory.
 * 2. **Proxy factories** — `defineAttachedPublisher(room, opts)` etc. for
 *    when you want the call site to look like `definePublisher` but
 *    coordinate via a Room.
 *
 * Standalone `definePublisher` / `defineViewer` / `defineRoomChannel` /
 * `defineRecorder` continue to work unchanged. Use a `Room` only when
 * sharing a transport between media + presence/chat in the same browser
 * tab.
 *
 * Lifecycle:
 *
 * ```
 * idle → connecting → connected → closed
 * ```
 *
 * Once `closed`, a Room cannot be restarted. Construct a fresh one.
 *
 * Prefer {@link defineRoom} as the call style; the class is exported for
 * type imports and `instanceof` checks only.
 */

import { ConfigurationError } from "@/errors/errors.ts";
import { defineEmitter, type Emitter } from "@/events/emitter.ts";
import { defineRecorder, type Recorder } from "@/recording/recorder.ts";
import type { RecorderOptions } from "@/recording/types.ts";
import { defineAttachedPublisher, type Publisher } from "@/publisher/publisher.ts";
import { defineAttachedViewer, type Viewer } from "@/viewer/viewer.ts";
import type { AttachedPublisherOptions } from "@/publisher/types.ts";
import type { AttachedViewerOptions } from "@/viewer/types.ts";
import type { RoleValue } from "@forinda/video-sdk-signaling-protocol";
import type { SignalingTransport } from "@/signaling/transport.ts";
import { defineAttachedRoomChannel, type RoomChannel } from "./room-channel.ts";
import type { AttachedRoomChannelOptions, RoomLeader, RoomOptions, RoomState } from "./types.ts";

type RoomEvents = {
  state: RoomState;
  error: Error;
  /** Fires once `ensureJoined` succeeds (the engine accepted the join). */
  joined: { role: RoleValue };
};

export class Room implements RoomLeader {
  readonly room: string;
  readonly peerId: string;
  readonly signaling: SignalingTransport;
  private readonly emitter: Emitter<RoomEvents> = defineEmitter();
  private roomState: RoomState = "idle";
  private joinedRole: RoleValue | null = null;
  private connectPromise: Promise<void> | null = null;
  private joinPromise: Promise<void> | null = null;
  private readonly directorSet = new Set<string>();
  private offDirectorMessages: (() => void) | null = null;

  constructor(opts: RoomOptions) {
    this.signaling = opts.signaling;
    this.room = opts.room;
    this.peerId =
      opts.peerId ?? (typeof crypto !== "undefined" ? crypto.randomUUID() : `peer-${Date.now()}`);
    this.offDirectorMessages = this.signaling.on("message", (msg) => {
      if (msg.type === "peer-joined" && msg.role === "director") {
        this.directorSet.add(msg.peer);
      } else if (msg.type === "peer-left") {
        this.directorSet.delete(msg.peer);
      } else if (msg.type === "promote") {
        this.directorSet.add(msg.target);
      } else if (msg.type === "demote") {
        this.directorSet.delete(msg.target);
      }
    });
  }

  /** Current lifecycle state. */
  get state(): RoomState {
    return this.roomState;
  }

  /** The role the Room joined as, or `null` until the first child starts. */
  get role(): RoleValue | null {
    return this.joinedRole;
  }

  /**
   * Live list of director peer ids in this room. Updated on every
   * `peer-joined` (with role=director), `peer-left`, `promote`, and
   * `demote` event. When this Room joins as a director, self is added
   * to the set immediately.
   */
  get directors(): readonly string[] {
    return [...this.directorSet];
  }

  /** Subscribe to a typed Room event. Returns an unsubscribe function. */
  on<E extends keyof RoomEvents>(event: E, handler: (payload: RoomEvents[E]) => void): () => void {
    return this.emitter.on(event, handler);
  }

  /**
   * Open the transport if not already open. Idempotent across concurrent
   * callers — every child that calls this during the same connect window
   * shares the same in-flight promise.
   */
  async ensureConnected(): Promise<void> {
    if (this.roomState === "closed") {
      throw new ConfigurationError("Room is closed; create a new instance to reuse");
    }
    if (this.signaling.state === "connected") {
      this.transition("connected");
      return;
    }
    if (this.connectPromise) return this.connectPromise;
    this.transition("connecting");
    this.connectPromise = this.signaling.connect().then(
      () => {
        this.transition("connected");
        this.connectPromise = null;
      },
      (err: unknown) => {
        this.connectPromise = null;
        this.emitter.emit("error", err instanceof Error ? err : new Error(String(err)));
        throw err;
      },
    );
    return this.connectPromise;
  }

  /**
   * Issue the room's `join` with `role` iff no peer has joined yet. Subsequent
   * calls assert the role matches and resolve without sending. Throws
   * {@link ConfigurationError} on role mismatch — one Room can't be both
   * publisher and viewer.
   */
  async ensureJoined(role: RoleValue): Promise<void> {
    if (this.joinedRole !== null) {
      if (this.joinedRole !== role) {
        throw new ConfigurationError(
          `Room already joined as '${this.joinedRole}'; cannot also join as '${role}'. ` +
            `Use a separate Room (with its own peerId) when you need both roles.`,
        );
      }
      return;
    }
    if (this.joinPromise) return this.joinPromise;
    // Assign the in-flight handle BEFORE the first `await`. Concurrent
    // callers in the same tick must see this and wait, not start their
    // own join.
    this.joinPromise = (async () => {
      try {
        await this.ensureConnected();
        await this.signaling.send({
          type: "join",
          room: this.room,
          peer: this.peerId,
          role,
        });
        this.joinedRole = role;
        if (role === "director") {
          this.directorSet.add(this.peerId);
        }
        this.emitter.emit("joined", { role });
      } catch (err) {
        this.joinPromise = null;
        this.emitter.emit("error", err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    })();
    return this.joinPromise;
  }

  /**
   * Send a `leave` (when joined) and disconnect the transport. Idempotent.
   * After `close()` the Room is unusable.
   */
  async close(): Promise<void> {
    if (this.roomState === "closed") return;
    this.transition("closed");
    if (this.offDirectorMessages !== null) {
      this.offDirectorMessages();
      this.offDirectorMessages = null;
    }
    this.directorSet.clear();
    if (this.joinedRole !== null) {
      try {
        await this.signaling.send({ type: "leave", room: this.room, peer: this.peerId });
      } catch {
        // Transport may already be torn down; the engine will clean up the
        // peer entry on socket disconnect anyway.
      }
      this.joinedRole = null;
    }
    try {
      await this.signaling.disconnect();
    } catch {
      // Same reasoning.
    }
  }

  // --- Sugar factories ------------------------------------------------------
  // Thin wrappers around the proxy factories. Equivalent to calling
  // `defineAttachedX(this, opts)` directly.

  /** Construct a Publisher attached to this Room. The Room owns the join. */
  publisher(opts: AttachedPublisherOptions): Publisher {
    return defineAttachedPublisher(this, opts);
  }

  /** Construct a Viewer attached to this Room. The Room owns the join. */
  viewer(opts: AttachedViewerOptions): Viewer {
    return defineAttachedViewer(this, opts);
  }

  /** Construct a RoomChannel (presence + chat) attached to this Room. */
  channel(opts: AttachedRoomChannelOptions = {}): RoomChannel {
    return defineAttachedRoomChannel(this, opts);
  }

  /**
   * Construct a {@link Recorder} for the given stream. Recorder is pure
   * media — it doesn't touch signaling — so this is a convenience pass-
   * through for symmetry, not coordination.
   */
  recorder(stream: MediaStream, opts: RecorderOptions = {}): Recorder {
    return defineRecorder(stream, opts);
  }

  private transition(next: RoomState): void {
    if (this.roomState === next) return;
    this.roomState = next;
    this.emitter.emit("state", next);
  }
}

/**
 * Declarative factory for {@link Room}. Recommended call style.
 *
 * ```ts
 * const room = defineRoom({ signaling, room: "demo", peerId: "alice" });
 * const publisher = room.publisher({ stream });
 * const channel = room.channel();
 * await publisher.start();
 * ```
 */
export function defineRoom(opts: RoomOptions): Room {
  return new Room(opts);
}
