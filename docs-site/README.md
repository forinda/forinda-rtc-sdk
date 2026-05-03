# @forinda/docs-site

VitePress documentation site for the Forinda RTC SDK. Private package — never published.

## Develop

```bash
pnpm install
pnpm docs:dev      # http://localhost:5173/forinda-rtc-sdk/
```

## Build

```bash
pnpm docs:build    # outputs to docs-site/.vitepress/dist
pnpm docs:preview  # serves the built output
```

## How it stays in sync

- Per-package pages under `packages/*.md` `<!--@include-->` the upstream READMEs at build time. Touching a README rebuilds.
- Cookbook pages embed the four files under `docs/*.md` the same way.
- TypeDoc + `typedoc-plugin-markdown` generates per-symbol pages under `symbols/<package>/`. Run via `pnpm --filter @forinda/docs-site typedoc`.

## Deploy

`.github/workflows/docs.yml` builds + deploys to GitHub Pages on push to `main`.

**One-time setup** (already done if you can see the site live): repo Settings → Pages → Source = "GitHub Actions".
