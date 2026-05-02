/**
 * `definePresenceDiff` — pure function that compares two presence
 * snapshots and returns a structural diff.
 *
 * Useful for delta UIs ("Bob just raised his hand", "Carol left the
 * room") without subscribing to every individual `presence-state` /
 * `peer-left` event. Pass the previous and next maps from
 * {@link "./room-channel.ts".RoomChannel.peers} (or any compatible shape).
 *
 * Equality is deep on attribute values via `JSON.stringify`. Cheap for
 * the small flat objects presence is intended for; not appropriate for
 * deeply nested mutable graphs (which presence shouldn't carry anyway).
 */

import type { JsonValue } from "@forinda/video-sdk-signaling-protocol";

export type PresenceMap =
  | ReadonlyMap<string, Readonly<Record<string, JsonValue>>>
  | Readonly<Record<string, Readonly<Record<string, JsonValue>>>>;

/** One peer's attributes paired with the peerId. */
export interface PresenceDiffEntry {
  peer: string;
  attributes: Record<string, JsonValue>;
}

/** A peer whose attributes changed between snapshots. */
export interface PresenceDiffChange {
  peer: string;
  /** Attributes that became, were updated, or disappeared (`null` when removed). */
  changed: Record<string, JsonValue | null>;
  /** Attributes after the change (i.e. the `next` snapshot's view). */
  next: Record<string, JsonValue>;
}

export interface PresenceDiff {
  added: PresenceDiffEntry[];
  removed: PresenceDiffEntry[];
  changed: PresenceDiffChange[];
}

function asEntries(
  m: PresenceMap,
): Iterable<readonly [string, Readonly<Record<string, JsonValue>>]> {
  return m instanceof Map ? m.entries() : Object.entries(m);
}

function attrsOf(m: PresenceMap, peer: string): Readonly<Record<string, JsonValue>> | undefined {
  return m instanceof Map ? m.get(peer) : (m as Record<string, Record<string, JsonValue>>)[peer];
}

function isSame(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function definePresenceDiff(prev: PresenceMap, next: PresenceMap): PresenceDiff {
  const added: PresenceDiffEntry[] = [];
  const removed: PresenceDiffEntry[] = [];
  const changed: PresenceDiffChange[] = [];

  for (const [peer, nextAttrs] of asEntries(next)) {
    const prevAttrs = attrsOf(prev, peer);
    if (prevAttrs === undefined) {
      added.push({ peer, attributes: { ...nextAttrs } });
      continue;
    }
    const delta: Record<string, JsonValue | null> = {};
    for (const [k, v] of Object.entries(nextAttrs)) {
      if (!Object.prototype.hasOwnProperty.call(prevAttrs, k) || !isSame(prevAttrs[k]!, v)) {
        delta[k] = v;
      }
    }
    for (const k of Object.keys(prevAttrs)) {
      if (!Object.prototype.hasOwnProperty.call(nextAttrs, k)) {
        delta[k] = null;
      }
    }
    if (Object.keys(delta).length > 0) {
      changed.push({ peer, changed: delta, next: { ...nextAttrs } });
    }
  }

  for (const [peer, prevAttrs] of asEntries(prev)) {
    if (attrsOf(next, peer) === undefined) {
      removed.push({ peer, attributes: { ...prevAttrs } });
    }
  }

  return { added, removed, changed };
}
