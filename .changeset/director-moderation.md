---
"@forinda/video-sdk-signaling-protocol": minor
"@forinda/video-sdk-core": minor
"@forinda/video-sdk-react": minor
"@forinda/video-sdk-vue": patch
"@forinda/video-sdk-signaling-ws": patch
"@forinda/video-sdk-signaling-broadcast": patch
"@forinda/video-sdk-elements": patch
---

Director role + moderation commands (EPIC-12).

### Added

- **`Role: "director"`** — fourth role in the schema. The engine enforces first-claim wins per room: a second peer attempting to join with `role: "director"` rejects with the new `SignalingDirectorConflictError(code: "director_conflict")`.
- **Six director-only commands** as flat top-level wire-format messages: `mute`, `unmute`, `kick`, `promote`, `demote`, `set-bitrate`. Plus a server → target `kicked` notification.
- **Honor-based by default** — the engine relays each command to the target. With `defineSignalingEngine({ enforceModerationCommands: true })` the engine rejects non-director senders with the new `SignalingPermissionError(code: "not_authorized")`. Enforced `kick` additionally drops the target's room binding.
- **State piggybacks on presence** — `mute` / `unmute` encode their effect as `director-muted-audio` / `director-muted-video` attributes on the target's presence entry, so late joiners see current mute state via the existing `presence-snapshot` mechanism. No new state-snapshot wire type added.
- **`Room.directors`** (core) — live `readonly string[]` of director peer ids, kept in sync with `peer-joined` / `peer-left` / `promote` / `demote` events. New `joined` event fires once `ensureJoined` succeeds.
- **`useRoom().role` / `directors` / `sendCommand(cmd)`** (react) — adapter surface for moderation UIs.

### Deferred to follow-up (EPIC-12b)

- Vue adapter parity for `sendCommand`.
- `<forinda-room-controls>` Web Component.
- Server-enforced `set-bitrate` (requires SFU integration — EPIC-14).
