---
"@forinda/video-sdk-core": patch
"@forinda/video-sdk-react": patch
"@forinda/video-sdk-signaling-adapter-ws": patch
"@forinda/video-sdk-signaling-adapter-express": patch
"@forinda/video-sdk-signaling-adapter-hono": patch
"@forinda/video-sdk-signaling-adapter-bun": patch
---

Documentation pass — no code changes.

- Replaced placeholder READMEs on the four signaling-adapter packages with full surface docs (options table, handle shape, auth example, what-it-doesn't-do). `signaling-adapter-hono` and `signaling-adapter-bun` are explicitly flagged as stub packages with workarounds documented.
- `core`: install snippet now lists `@forinda/video-sdk-signaling-ws` (the example uses it). Recording options table now documents `maxBufferedBytes`. Added a `definePresenceDiff` example next to the Room channel section.
- `react`: install snippet fix to match `core`. `useRoomChannel` result now shows the `state` field. `useRecorder` example shows `downloadUrl` and `maxBufferedBytes`.
- All cross-package links in published READMEs are now absolute npm URLs so they resolve when rendered on npmjs.com.
- Stripped every `EPIC-N` and `docs/superpowers/` reference from adopter-facing READMEs.
