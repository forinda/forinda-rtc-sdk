# Contributing to forinda-rtc-sdk

Thanks for your interest. This is an actively-developed monorepo; please read this guide before opening issues or PRs.

## Requirements

- **Node 20+** (LTS). The lockfile is generated against pnpm 9.12; the repo enforces this via `engines` and `packageManager`.
- **pnpm 9+**. Install via `corepack enable` (recommended) or `npm i -g pnpm`.
- **Git**.

## Getting started

```bash
git clone https://github.com/forinda/forinda-rtc-sdk.git
cd forinda-rtc-sdk
pnpm install
pnpm typecheck    # type-check every package
pnpm build        # build every package
pnpm test         # run unit tests
pnpm lint         # oxlint + oxfmt format check
```

`pnpm lint` runs `oxlint` per package then a repo-wide `oxfmt --check`. To auto-format: `pnpm format`.

## Repository layout

```
packages/<name>/        # publishable npm packages
apps/<name>/            # internal runnable apps (dev signaling server, etc.)
tools/                  # build helpers (banner generator)
docs/superpowers/       # design specs + implementation plans
```

Each package has:

- `tsconfig.json` — IDE + typecheck (includes tests)
- `tsconfig.build.json` — tsup (src only)
- `vitest.config.ts` — jsdom env (browser packages) or node env (server packages), `@/*` alias
- `src/` and `test/unit/` — source + tests
- `README.md` — purpose, usage

## Conventions

- **Public API uses `defineX({...})` factories.** Underlying classes are still exported for type imports + `instanceof` checks; the factory is the recommended call style across the codebase.
- **Inline JSDoc on every `src/` file.** File-header docblock + JSDoc on every exported symbol explaining the _why_ and _contract_.
- **Path aliases.** Tests use `import { X } from "@/path/to/mod.ts"`. Src files keep sibling imports relative.
- **TS 6 with `.ts` import extensions.** Already enabled in the root `tsconfig.base.json`.
- **`exactOptionalPropertyTypes: true`.** Declare optional class fields as `private foo: T | undefined;` (not `private foo?: T;`) when you need to assign `undefined` later.

## Workflow

1. Create a branch off `main`.
2. Write failing tests first (TDD). Tests live next to the code they cover under `test/unit/<subsystem>/`.
3. Implement. Keep changes scoped — one logical change per commit.
4. Verify locally:

   ```bash
   pnpm --filter <package> test
   pnpm --filter <package> typecheck
   pnpm --filter <package> build
   pnpm lint
   ```

5. Add a [changeset](https://github.com/changesets/changesets):

   ```bash
   pnpm changeset
   ```

6. Push and open a PR.

## Commit messages

Conventional Commits style:

```
<type>(<scope>): <subject>

<optional body>
```

Common types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `build`, `ci`.

## Testing

- **Unit tests** — Vitest + jsdom. Run via `pnpm test`. Coverage threshold ≥ 90% lines per package.
- **Integration tests** — `@vitest/browser` + Chromium (planned for EPIC-8). Not yet wired.
- **End-to-end** — Playwright (planned for EPIC-8).

Use the `_mocks/` fixtures (`fake-pc.ts`, `fake-media-devices.ts`, `in-memory-signaling.ts`) instead of mocking `globalThis` directly.

## Releases

See **[`RELEASE.md`](./RELEASE.md)** for the full process. Short version: publishing is **manually triggered** from the Actions tab (never on push), because it's irreversible. Use `pnpm changeset` to record what should ship; `changesets/action` opens a "Version Packages" PR; merging it + triggering Release a second time publishes to npm with provenance and creates one GitHub Release per package.

## License

MIT.
