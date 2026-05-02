# Release process

How `forinda-rtc-sdk` ships to npm + GitHub Releases.

> **TL;DR:** publishing is **manual via the Actions UI**, not automatic on push. Two clicks per release: open the version PR → merge it → click Release again to publish.

## What's automated

| Concern                                                                                   | Tool                                                                                                           | Where                                                        |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Decide which packages bump + by how much                                                  | [Changesets](https://github.com/changesets/changesets)                                                         | `pnpm changeset` writes a `.changeset/*.md` file             |
| Per-package `CHANGELOG.md` generation                                                     | [`@changesets/changelog-github`](https://github.com/changesets/changesets/tree/main/packages/changelog-github) | runs during the version PR; links every PR + author handle   |
| Bump `package.json` versions + cross-package range updates                                | `changeset version` (run by `changesets/action`)                                                               | committed into the version PR                                |
| Publish to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements) | `pnpm release` (= `pnpm build && changeset publish`)                                                           | runs in CI on the second Release trigger                     |
| Create a GitHub Release per package per version                                           | `changesets/action@v1` with `createGithubReleases: true`                                                       | uses each package's `CHANGELOG.md` entry as the release body |
| Tag every published version                                                               | created by `changesets/action` (`@scope/pkg@1.2.3`)                                                            | one git tag per published package per release                |

## Trigger model

Release is **`workflow_dispatch` only** — `.github/workflows/release.yml` does NOT fire on push to `main`. Why:

- Push to `main` happens on every merge. A workflow that runs on push but doesn't always publish is noise.
- Publishing is irreversible — npm yanks are deprecated, GitHub Releases are visible immediately.
- Manual fire is the explicit gate; combined with branch protection on `main`, it prevents accidental publishes.

## Normal release — the steady-state flow

You're shipping changes that have already merged to `main`.

1. **(Per change, before merging.)** When you commit something that ships, run `pnpm changeset` and select the bump types per package. Write a one-liner. The `.changeset/*.md` file gets committed into your PR.
2. **Merge** your PR to `main`. Nothing publishes.
3. **Open Actions → Release → Run workflow** on `main`. Changesets opens (or updates) a PR titled **"chore: version packages"** that:
   - consumes every pending `.changeset/*.md`
   - bumps each affected package's `package.json` `version`
   - writes new entries into per-package `CHANGELOG.md` (with PR + author links)
   - bumps any cross-package `workspace:*` ranges that need it
   - deletes the consumed changeset files
4. **Review** the version PR (especially the changelog text + the bump magnitudes). **Merge** it.
5. **Open Actions → Release → Run workflow** on `main` again. Changesets sees no pending changesets and the package.json versions are ahead of npm → publishes everything with `--provenance` and creates one GitHub Release per package per new version.
6. **Verify**:

   ```bash
   npm view @forinda/video-sdk-core@<new-version>
   gh release list --repo forinda/forinda-rtc-sdk
   ```

That's it.

## First release (v0.1.0) — bootstrap

Skipped Changesets for v0.1.0. Here's why and how:

**Why skip Changesets:** Changesets cascades a peer-dep version bump to a major bump for any dependent. Four of our packages (`signaling-ws`, `signaling-broadcast`, `react`, `elements`) have `@forinda/video-sdk-core` as a `peerDependency`. So a `minor` bump on core would push them to `1.0.0` while everything else went to `0.1.0` — confusing version mismatch on the very first release.

**What was done:** every publishable package's `version` was set to `0.1.0` directly in `package.json`, and per-package `CHANGELOG.md` files were seeded by hand with a `## 0.1.0` section.

**To publish v0.1.0:**

1. **Add the npm token.** GitHub Settings → Secrets and variables → Actions → New repository secret named `NPM_TOKEN`. Use a [granular access token](https://docs.npmjs.com/about-access-tokens) scoped to publish on `@forinda`. Token must have `automation` permissions.
2. **Sanity check locally.**

   ```bash
   pnpm install
   pnpm test
   pnpm typecheck
   pnpm lint
   pnpm build
   git status        # must be clean
   ```

3. **Trigger Release.** Actions → Release → Run workflow on `main`. The first run will publish all 11 packages at `0.1.0` and create matching GitHub Releases.
4. **Verify.**

   ```bash
   npm view @forinda/video-sdk-core@0.1.0
   npm view @forinda/video-sdk-react@0.1.0
   gh release list --repo forinda/forinda-rtc-sdk --limit 15
   ```

5. **From v0.1.1 onwards**, follow the _Patch / minor / major_ flow below.

## Cheat sheet — picking the right release type

| Want                                                 | Bump type   | npm dist-tag | Example              |
| ---------------------------------------------------- | ----------- | ------------ | -------------------- |
| Pure bug fix, no API change                          | `patch`     | `latest`     | 0.1.0 → 0.1.1        |
| New feature, no breaking change                      | `minor`     | `latest`     | 0.1.1 → 0.2.0        |
| Breaking change                                      | `major`     | `latest`     | 0.2.0 → 1.0.0        |
| Feedback round on an unstable API change             | pre-release | `next`       | 0.2.0 → 0.3.0-next.0 |
| Wider beta of a near-final version (e.g. before 1.0) | pre-release | `beta`       | 0.9.0 → 1.0.0-beta.0 |

`patch` / `minor` / `major` are picked **per-package** in the `pnpm changeset` interactive prompt. Pre-releases use a **mode switch** (see below) — every changeset created while in pre-mode gets the dist-tag automatically.

## Patch / minor / major releases

Steady-state. Same flow each time, just different bump answer.

### Patch (bug fix)

```bash
git switch -c fix/some-bug
# edit code, write tests
pnpm changeset
#   ? Which packages would you like to include?
#     ✔ @forinda/video-sdk-core
#   ? Which packages should have a major bump?  (none)
#   ? Which packages should have a minor bump?  (none)
#   ? Which packages should have a patch bump?  ← @forinda/video-sdk-core
#   ? Please enter a summary for this change …  fix: handle null candidates in negotiator
git add . && git commit && gh pr create
# merge → Actions → Release → review version PR → merge → Release again
```

### Minor (additive feature)

Same flow, pick **`minor`** at the bump prompt. Multiple packages can be picked together — common when a new core API ships alongside its React hook + element wrapper.

### Major (breaking change)

Same flow, pick **`major`**. Important: write the migration steps inside the changeset body — that text becomes the GitHub Release notes adopters read. Example body:

```markdown
**BREAKING:** `definePublisher` now requires `peerId` (was optional, defaulted to `crypto.randomUUID()`).

### Migration

Existing call sites that relied on the auto-generated peerId must explicitly pass one:

    const peerId = crypto.randomUUID();
    const publisher = definePublisher({ signaling, room, stream, peerId });

We now consider it a configuration bug to leave peerId implicit when reconnecting (auto-generated value churns on every page reload, breaking presence sticky-state).
```

Cross-package implication: a `major` bump on a package with peer-deps cascades to `major` on every dependent. Account for this in the changeset body — if you don't want the cascade, see the v0.1.0 bootstrap notes for how to manually pin versions.

## Pre-release flows (`next`, `beta`, etc.)

Pre-releases ship under an alternate npm dist-tag. Adopters opt in with `pnpm add @forinda/video-sdk-core@next` (or `@beta`); their default `pnpm add @forinda/video-sdk-core` keeps installing the latest `latest`-tagged version.

Pre-releases are managed by Changesets' **pre-release mode**. The mode is sticky — once entered, every `changeset version` run produces pre-release versions until you exit.

### Cutting a `next` pre-release (early feedback)

Use `next` for "I want to ship something, get feedback, but don't want random `pnpm add @forinda/...` to install it yet."

```bash
# 1. Enter pre-release mode on `next`. Writes .changeset/pre.json.
pnpm changeset pre enter next
git add .changeset/pre.json && git commit -m "chore: enter next pre-release mode"

# 2. Add changesets as normal during the pre-release window.
pnpm changeset            # describe the change
git add . && git commit && gh pr create
# merge to main

# 3. Trigger Release once → opens version PR with pre-release versions:
#       0.2.0 → 0.3.0-next.0
#    Merge it.
# 4. Trigger Release again → publishes under dist-tag `next`.
#       npm view @forinda/video-sdk-core dist-tags
#         latest: 0.2.0
#         next:   0.3.0-next.0

# 5. Iterate: each new changeset bumps the pre suffix (.0 → .1 → .2 …).
#    All shipped under `next`.

# 6. When ready to graduate to `latest`:
pnpm changeset pre exit
git add .changeset/pre.json && git commit -m "chore: exit pre-release mode"
# Trigger Release → version PR collapses pre-versions into the final
#       0.3.0-next.5 → 0.3.0
# Merge → Release again → publishes 0.3.0 under `latest`.
```

### Cutting a `beta` pre-release (wider audience, near-final)

Same flow, just a different tag name:

```bash
pnpm changeset pre enter beta
# ...add changesets, version, publish — they ship under `beta` tag
pnpm changeset pre exit
```

Convention for this repo:

| Tag    | Purpose                                                                        |
| ------ | ------------------------------------------------------------------------------ |
| `next` | Active development pre-release. Things may shift between consecutive `next.N`. |
| `beta` | Frozen API, looking for production validation before promoting to `latest`.    |

Ad-hoc tags are fine when you want a milestone-specific channel — e.g. `pnpm changeset pre enter rc-2026-q3`.

### Common pre-release pitfalls

1. **Forgetting `pnpm changeset pre exit`.** Every subsequent release stays in pre-mode and never reaches `latest`. The `.changeset/pre.json` file is the source of truth — its presence means "in pre-mode."
2. **Mixing pre and non-pre changesets in the same release cycle.** Don't add a changeset after `pre exit` runs unless you've already let the version PR merge; otherwise the new changeset re-enters non-pre territory mid-cycle. Cleanest: exit → release → start the next cycle fresh.
3. **Adopters pinning to `next`.** Document in the changeset body that `next` is unstable. Real adopters should pin exact versions (`@forinda/video-sdk-core@0.3.0-next.5`) or use `beta`.
4. **GitHub Releases for pre-releases.** `changesets/action` marks the GitHub Release as **prerelease** automatically when the version contains a `-` qualifier, so they don't pollute the release feed for adopters watching only stable.

## Hotfix path

Same as Patch above, plus a heads-up: when the fix is critical and you want it on every minor line you support, you'd typically need a maintenance branch (`v0.1.x`) and cherry-pick. We don't have that branching strategy yet — when we do, this section gets expanded.

## Yanking / unpublishing

- **npm**: `npm deprecate "@forinda/video-sdk-core@1.2.3" "Use 1.2.4 — broken validation"`. **Never** `npm unpublish` post-72h (npm refuses anyway).
- **GitHub Release**: Releases are stable identifiers; deleting them breaks anyone linking to the release notes. Prefer editing the body to flag the issue and pointing to the fix.

## What gets published vs. skipped

Per `.changeset/config.json`:

- **Published:** every package under `packages/` with `"private": false` (effectively absent — pnpm/npm publish defaults to public when `publishConfig.access: "public"` is set, which we have on every shipping package).
- **Always ignored:** `@forinda/test-helpers` (private internal helpers) and `dev-signaling-server` (the apps/ runnable). Listed under `ignore: [...]` in the changesets config.
- **`examples/*`** apps are also `private: true` — pnpm publish skips them automatically.

## Repository secrets needed

| Secret         | Purpose                                                      | Required for                                        |
| -------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| `NPM_TOKEN`    | npm publish auth, granular `automation`-scoped on `@forinda` | every publish                                       |
| `GITHUB_TOKEN` | GH Releases creation, version-PR creation                    | every release-action run (auto-provided by Actions) |

## Files involved

- `.github/workflows/release.yml` — the workflow.
- `.github/workflows/ci.yml` — gate before merge (lint, typecheck, test, build, bundle sizes).
- `.changeset/config.json` — Changesets config (changelog formatter, ignored packages).
- `.changeset/*.md` — pending changeset files.
- `packages/*/CHANGELOG.md` — per-package release notes (Changesets writes these; never edit by hand once Changesets is in the loop, except for the v0.1.0 bootstrap).
- `CHANGELOG.md` (repo root) — high-level milestone log; epic-by-epic narrative.
- `scripts/print-bundle-sizes.mjs` — gzipped bundle-size report run in CI.
