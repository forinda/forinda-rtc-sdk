# tools/

Internal build utilities. Not published; not a workspace package — just shared `.ts` files imported by package `tsup.config.ts` files via relative path.

## `build-banner.ts`

Generates the standard build banner stamped at the top of every emitted `dist/*.js` file. Banner format:

```
/*! @forinda/video-sdk-<name> v0.0.0 | (c) 2026 Felix Orinda | built 2026-05-02 | MIT */
```

Usage in `packages/<name>/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';
import { createBanner } from '../../tools/build-banner.ts';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  banner: { js: createBanner() },
  // ...
});
```

For packages that also ship a Node CLI shebang (e.g., `signaling-server`), prepend the shebang manually:

```ts
banner: { js: `#!/usr/bin/env node\n${createBanner()}` },
```

The shebang must be the first line of the emitted file; the banner comment that follows is harmless on stdin and ignored by Node.
