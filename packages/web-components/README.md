# @forinda/video-sdk-elements

Web Components (custom HTML elements) for the Forinda video SDK.

Drop-in tags: `<video-publisher>`, `<video-viewer>`, `<video-device-picker>`. Works in any framework that consumes custom elements (Vue, Svelte, Angular, Solid, plain HTML).

> 🚧 Foundation skeleton — implementation in EPIC-6. See `docs/superpowers/specs/2026-05-02-video-sdk-design.md`.

## Auto-register vs manual

Default (auto-register on import):

```ts
import "@forinda/video-sdk-elements";
```

Manual (explicit, custom prefix):

```ts
import { defineElements } from "@forinda/video-sdk-elements/manual";
defineElements({ prefix: "forinda-" });
```

CDN drop-in:

```html
<script src="https://unpkg.com/@forinda/video-sdk-elements/dist/index.global.js"></script>
```
