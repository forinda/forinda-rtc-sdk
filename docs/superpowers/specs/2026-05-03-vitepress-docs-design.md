# VitePress docs site — design

> **Status:** approved (brainstorm). Implementation plan to follow.
>
> **Date:** 2026-05-03

## Goal

Ship a hosted documentation site at `https://forinda.github.io/forinda-rtc-sdk/` that complements the existing per-package READMEs with a curated narrative layer (Get Started + Cookbook) and auto-generated per-symbol API pages, without duplicating any content.

## Non-goals (explicit, locked in during brainstorm)

- Custom domain or migration to Cloudflare/Vercel — flip the workflow target later if needed.
- Algolia DocSearch — VitePress's built-in local search (minisearch) is enough for v1.
- i18n.
- Versioned docs — single "latest" view; tags get added once v1.0 lands.
- Moving `docs/*.md` into `docs-site/` — those files keep living where they are for direct GitHub viewing; the Cookbook section embeds them.
- Wiring `docs:build` into the root `pnpm build` — docs build is a sibling target so package CI stays fast.
- Per-symbol READMEs replacing TypeDoc, or vice-versa — the hybrid is deliberate (see Architecture).

## Architecture

**Single source of truth, three projection layers:**

1. **Source** — code lives in `packages/*/src/**`; user-facing reference lives in `packages/*/README.md`; cross-cutting narrative lives in `docs/*.md`. None of that moves.
2. **Site source** — handwritten markdown in `docs-site/{get-started,cookbook,packages}/` plus VitePress config under `docs-site/.vitepress/`.
3. **Generated content** — TypeDoc + `typedoc-plugin-markdown` writes per-symbol pages into `docs-site/typedoc/generated/` at build time.

VitePress's `<!--@include: <path>-->` directive pulls READMEs and narrative docs into the site at build time, so editing `packages/core/README.md` rebuilds the docs site automatically and stays in lockstep with the published package README.

**New workspace package:** `@forinda/docs-site` (private), located at `docs-site/`. Wireit-driven build/dev/preview scripts.

## Information architecture

```
/                                Landing — hero, "what you get", 3 CTAs
/get-started/
  install                        pnpm add … per-stack
  quick-start                    minimal mesh publisher (mirrors README quick-start)
  pick-your-stack                decision tree: vanilla / react / vue / elements · mesh / sfu
/packages/
  index                          packages overview table (links into each)
  core                           README include + "Browse symbols →"
  signaling-protocol
  signaling-ws
  signaling-broadcast
  signaling-adapter-ws
  signaling-adapter-express
  signaling-server
  react
  vue
  elements                       (directory: packages/web-components)
  sfu-livekit
  <package>/symbols/             generated TypeDoc tree per package
/cookbook/
  architecture                   include docs/architecture.md
  patterns                       include docs/patterns.md
  sfu-integration                include docs/sfu-integration.md
  troubleshooting                include docs/troubleshooting.md
```

## File structure

| File / directory                            | Responsibility                                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs-site/package.json`                    | New private package `@forinda/docs-site`. Wireit scripts: `dev`, `build`, `preview`, `typedoc`.                                                                                                              |
| `docs-site/tsconfig.json`                   | Picks up `.vitepress/config.ts` and any TS helper modules.                                                                                                                                                   |
| `docs-site/.vitepress/config.ts`            | VitePress site config — `base: '/forinda-rtc-sdk/'`, nav, sidebar, theme, search.                                                                                                                            |
| `docs-site/.vitepress/theme/index.ts`       | Extends default theme.                                                                                                                                                                                       |
| `docs-site/.vitepress/theme/custom.css`     | Accent overrides (`--vp-c-brand-1` left at default indigo for v1; revisit later if branding requires).                                                                                                       |
| `docs-site/index.md`                        | Landing page (hero + 3 CTA buttons → quick-start, packages overview, cookbook).                                                                                                                              |
| `docs-site/get-started/install.md`          | Per-stack install snippets + peer-dep notes.                                                                                                                                                                 |
| `docs-site/get-started/quick-start.md`      | Minimal mesh publisher walkthrough.                                                                                                                                                                          |
| `docs-site/get-started/pick-your-stack.md`  | Decision tree for framework + mesh vs SFU.                                                                                                                                                                   |
| `docs-site/packages/index.md`               | Sortable overview table of all packages.                                                                                                                                                                     |
| `docs-site/packages/<name>.md` (×11)        | One per package. Route name = published package name (e.g. `elements`); include path = directory (`packages/web-components/README.md`). Body = `<!--@include-->` of the README plus a "Browse symbols" link. |
| `docs-site/cookbook/architecture.md`        | `<!--@include: ../../docs/architecture.md-->`                                                                                                                                                                |
| `docs-site/cookbook/patterns.md`            | `<!--@include: ../../docs/patterns.md-->`                                                                                                                                                                    |
| `docs-site/cookbook/sfu-integration.md`     | `<!--@include: ../../docs/sfu-integration.md-->`                                                                                                                                                             |
| `docs-site/cookbook/troubleshooting.md`     | `<!--@include: ../../docs/troubleshooting.md-->`                                                                                                                                                             |
| `docs-site/typedoc/typedoc.json`            | TypeDoc config: per-package `entryPoints`, `plugin: ["typedoc-plugin-markdown"]`, output → `generated/`.                                                                                                     |
| `docs-site/typedoc/generated/` (gitignored) | Generated per-symbol markdown pages.                                                                                                                                                                         |
| `docs-site/scripts/smoke.mjs`               | Post-build assertion: greps `dist/index.html` for the hero string.                                                                                                                                           |
| `docs-site/public/`                         | Static assets (favicon, og-image — drop-ins; no logo art for v1).                                                                                                                                            |
| `docs-site/README.md`                       | Local dev instructions + the one-time "set Pages source = Actions" repo setting.                                                                                                                             |
| `.github/workflows/docs.yml`                | Build + deploy to GitHub Pages on `main` push or manual dispatch.                                                                                                                                            |
| Root `package.json`                         | Add `docs:dev`, `docs:build`, `docs:preview` scripts that filter to `@forinda/docs-site`.                                                                                                                    |
| `.gitignore`                                | Add `docs-site/.vitepress/dist/` and `docs-site/typedoc/generated/`.                                                                                                                                         |
| `pnpm-workspace.yaml`                       | No change needed if `docs-site/` is matched by an existing glob; otherwise add `docs-site`.                                                                                                                  |
| `.changeset/docs-site.md`                   | Empty (private package — no public bump). Skip changeset.                                                                                                                                                    |
| Root `README.md`                            | Add a single "Documentation" sentence near the top: "📖 Live docs: [forinda.github.io/forinda-rtc-sdk]…".                                                                                                    |

## Build pipeline

| Script         | Command                                                             | Wireit dependencies                                                       |
| -------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `docs:typedoc` | `typedoc --options docs-site/typedoc/typedoc.json`                  | `packages/*/src/**`, `packages/*/tsconfig.json`                           |
| `docs:build`   | `vitepress build docs-site` then `node docs-site/scripts/smoke.mjs` | `docs:typedoc`, `docs-site/**`, `packages/*/README.md`, `docs/*.md`       |
| `docs:dev`     | `vitepress dev docs-site`                                           | `docs:typedoc` (one-shot at startup; not re-run on file change for speed) |
| `docs:preview` | `vitepress preview docs-site`                                       | depends on existing `dist/`                                               |

Wireit `files` globs include the README + narrative paths so external edits invalidate the docs build cache.

## Deployment (`.github/workflows/docs.yml`)

- **Triggers:** push to `main` touching `docs-site/**`, `packages/*/README.md`, `docs/*.md`, `packages/*/src/**`; plus `workflow_dispatch`.
- **Permissions:** `contents: read`, `pages: write`, `id-token: write`.
- **Steps:**
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` (Node 20)
  3. `pnpm/action-setup@v4`
  4. `pnpm install --frozen-lockfile`
  5. `pnpm docs:build`
  6. `actions/upload-pages-artifact@v3` (path: `docs-site/.vitepress/dist`)
  7. `actions/deploy-pages@v4`
- **Concurrency:** `group: pages, cancel-in-progress: false` — finish in-flight deploys.
- **One-time manual setup (documented in `docs-site/README.md`):** repo Settings → Pages → Source = "GitHub Actions".

## Theme

- VitePress default theme.
- `custom.css` for any later accent tweaks (left at default indigo for v1).
- Hero on landing page: project name + tagline + three CTA buttons (Get Started · Packages · Cookbook).
- Built-in local search.
- Edit-this-page links pointing at `https://github.com/forinda/forinda-rtc-sdk/edit/main/docs-site/` for handwritten pages, and at the upstream README path for included pages (configured per-page via the include comment).

## Testing

- `pnpm docs:build` must exit 0 (the test).
- `docs-site/scripts/smoke.mjs` post-build asserts: `dist/index.html` contains the hero string and at least one `/packages/` link.
- No vitest suite — the build is the test.
- CI workflow runs `docs:build` on every PR (a separate job in `docs.yml`'s push branch, plus a `pull_request` trigger that builds without deploying) so docs breakage blocks merge.

## Mesh-only consumers / bundle impact

None. `@forinda/docs-site` is private and never published. No runtime dependency on any package in the workspace ever.

## Migration / rollout

- v1: ship with all 11 package pages + 4 cookbook pages + 3 get-started pages.
- README in each package picks up an unchanged "Documentation" footer link to the live site.
- Existing `docs/*.md` paths keep working on GitHub directly — docs site is purely additive.

## Open questions deferred until after v1 ships

- Whether to add a logo / brand mark (currently using text only).
- Whether to swap minisearch for Algolia DocSearch (file an application once site has traffic).
- Whether to spin up a custom domain.
- Whether to add a versioned docs sidebar once v1.0 of the packages cuts.

## Acceptance

- ✅ Site builds locally via `pnpm docs:dev`.
- ✅ `pnpm docs:build` produces `docs-site/.vitepress/dist/` with all nav routes resolvable.
- ✅ Smoke check passes.
- ✅ Workflow deploys to GitHub Pages on merge to `main`.
- ✅ Each `/packages/<name>` page renders the upstream README content verbatim.
- ✅ `/packages/<name>/symbols/` lists every public export from `packages/<name>/src/index.ts`.
- ✅ Cookbook pages embed the four `docs/*.md` files unchanged.
- ✅ Local search returns hits for "publisher", "viewer", "sfu", "raise hand".
