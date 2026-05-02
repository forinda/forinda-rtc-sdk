/**
 * `useRoom` — construct + manage a `Room` for the lifetime of the calling
 * component. The Room owns the signaling transport's connect/disconnect
 * cycle and coordinates the single `join` across every attached child
 * (`Publisher`, `Viewer`, `RoomChannel`).
 *
 * Pair with `usePublisher({ attach: room })`, `useViewer({ attach: room })`,
 * `useRoomChannel({ attach: room })`, `useRecorder(stream, ..., { attach })`
 * — when `attach` is set, those hooks defer to the Room instead of opening
 * their own transport.
 *
 * EPIC-12: also exposes `role`, `directors`, and `sendCommand` for
 * moderation UIs.
 *
 * SSR-safe: returns inert state on the server.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  defineRoom,
  type RoleValue,
  type Room,
  type SignalingTransport,
  type TransportState,
} from "@forinda/video-sdk-core";
import { isServer } from "./internal/ssr.ts";
import { useVideoSdkConfig } from "./provider.tsx";

export interface UseRoomOptions {
  room: string;
  peerId?: string;
  /** Pre-built signaling transport. Falls back to `VideoSdkProvider`'s factory. */
  signaling?: SignalingTransport;
}

/** Director-only command shapes — flat union, mirrors the wire format. */
export type ModerationCommand =
  | { type: "mute"; target: string; kind: "audio" | "video" }
  | { type: "unmute"; target: string; kind: "audio" | "video" }
  | { type: "kick"; target: string; reason?: string }
  | { type: "promote"; target: string }
  | { type: "demote"; target: string }
  | { type: "set-bitrate"; target: string; bitsPerSec: number };

export interface UseRoomResult {
  room: Room | null;
  /** Underlying signaling transport state — useful for "Connecting…" UI. */
  state: TransportState;
  error: Error | null;
  /** The role the Room has joined as, or `null` until the first child starts. */
  role: RoleValue | null;
  /** Live list of director peer ids (re-renders on peer-joined/promote/demote). */
  directors: readonly string[];
  /** Send a moderation command — director-only when the engine has `enforceModerationCommands: true`. */
  sendCommand: (cmd: ModerationCommand) => Promise<void>;
}

export function useRoom(opts: UseRoomOptions): UseRoomResult {
  const config = useVideoSdkConfig();
  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<TransportState>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [role, setRole] = useState<RoleValue | null>(null);
  const [directors, setDirectors] = useState<readonly string[]>([]);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (isServer) return;

    const o = optsRef.current;
    const signaling = o.signaling ?? config.signaling?.();
    if (signaling === undefined) {
      setError(
        new Error("useRoom: no signaling transport (provide opts.signaling or VideoSdkProvider)"),
      );
      return;
    }

    const ctrl = new AbortController();
    const r = defineRoom({
      signaling,
      room: o.room,
      ...(o.peerId !== undefined ? { peerId: o.peerId } : {}),
    });
    setRoom(r);
    setState(signaling.state);
    setRole(r.role);
    setDirectors([...r.directors]);

    const offError = r.on("error", (e) => {
      if (!ctrl.signal.aborted) setError(e);
    });
    const offJoined = r.on("joined", () => {
      if (ctrl.signal.aborted) return;
      setRole(r.role);
      setDirectors([...r.directors]);
    });
    const offTransportState = signaling.on("state", (s: TransportState) => {
      if (!ctrl.signal.aborted) setState(s);
    });
    // EPIC-12: keep role + directors reactive. Pull from the room snapshot
    // on every relevant inbound message.
    const offMessage = signaling.on("message", (msg) => {
      if (ctrl.signal.aborted) return;
      if (
        msg.type === "peer-joined" ||
        msg.type === "peer-left" ||
        msg.type === "promote" ||
        msg.type === "demote"
      ) {
        setRole(r.role);
        setDirectors([...r.directors]);
      }
    });

    return () => {
      ctrl.abort();
      offError();
      offJoined();
      offTransportState();
      offMessage();
      void r.close();
      setRoom(null);
      setState("idle");
      setError(null);
      setRole(null);
      setDirectors([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.room, opts.peerId]);

  const sendCommand = useCallback(
    async (cmd: ModerationCommand): Promise<void> => {
      if (!room) return;
      // After the join (caller decides via room.ensureJoined("director")), the
      // local role is set — pull it now so an immediately-following
      // sendCommand reflects the latest snapshot.
      setRole(room.role);
      setDirectors([...room.directors]);
      await room.signaling.send(cmd);
    },
    [room],
  );

  return { room, state, error, role, directors, sendCommand };
}
