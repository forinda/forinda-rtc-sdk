# EPIC-1: Monorepo Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the empty pnpm + wireit monorepo for `forinda-video-sdk` with all package skeletons, lint/format/typecheck/build/CI wiring in place, ready for EPIC-2 to start writing real code.

**Architecture:** pnpm workspace at the root; one `packages/<name>` directory per published package; `apps/<name>` for runnable apps; `examples/` deferred to EPIC-7. Every package builds with tsup (ESM-only), type-checks with `tsc --noEmit`, lints with oxlint, formats with oxfmt (Prettier fallback documented). Wireit per-package script convention. Changesets owns versioning. GitHub Actions runs lint + typecheck + build on every PR (test jobs added in later epics when there's something to test).

**Tech Stack:** pnpm 9, Node 20 LTS, TypeScript 6.0, tsup, wireit, oxlint, oxfmt (Prettier fallback), Changesets, GitHub Actions, MIT license.

**Spec reference:** `docs/superpowers/specs/2026-05-02-video-sdk-design.md` — Sections 2, 3, 4, 15.

**Definition of done:**

- `pnpm install` succeeds from a clean clone.
- `pnpm -r typecheck` exits 0 across all 12 packages + 1 app.
- `pnpm -r build` exits 0 and emits `dist/index.js` + `dist/index.d.ts` per package.
- `pnpm -r lint` exits 0.
- GitHub Actions CI runs the same three commands on PR.
- Changesets is initialized and `pnpm changeset` interactive flow works.
- Repo is tagged `v0.0.0-foundation`.

---

## File structure created by this epic

```
forinda-video-sdk/
  .editorconfig
  .gitignore
  .nvmrc
  .npmrc
  LICENSE                                          # MIT
  README.md                                        # root directory listing
  package.json                                     # workspace root
  pnpm-workspace.yaml
  tsconfig.base.json
  oxlint.json
  oxfmt.json                                       # OR .prettierrc.json (fallback)
  .changeset/
    config.json
    README.md
  .github/
    workflows/
      ci.yml
      release.yml
  packages/
    core/
      package.json
      tsconfig.json
      tsup.config.ts
      README.md
      src/index.ts
    signaling-protocol/                            # same shape as core
    signaling-ws/
    signaling-broadcast/
    signaling-adapter-ws/
    signaling-adapter-express/
    signaling-adapter-hono/
    signaling-adapter-bun/
    signaling-server/                              # also has src/cli.ts + bin field
    react/
    web-components/
    test-helpers/                                  # private:true
  apps/
    dev-signaling-server/
      package.json
      tsconfig.json
      src/index.ts
      README.md
  docs/
    superpowers/specs/2026-05-02-video-sdk-design.md     # already exists
    superpowers/plans/2026-05-02-EPIC-1-monorepo-foundation.md  # this file
```

**File responsibilities:**

| File                              | Owns                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` (root)             | workspace declaration, pinned `packageManager`, root scripts (`-r` recursion), shared dev deps (typescript, tsup, wireit, oxlint, oxfmt or prettier, @changesets/cli) |
| `pnpm-workspace.yaml`             | glob list of workspaces                                                                                                                                               |
| `.npmrc`                          | pnpm strictness flags                                                                                                                                                 |
| `tsconfig.base.json`              | strict TS, ES2022, bundler resolution — extended by every package                                                                                                     |
| `oxlint.json`                     | lint rules                                                                                                                                                            |
| `oxfmt.json` / `.prettierrc.json` | format rules                                                                                                                                                          |
| `.changeset/config.json`          | changesets behavior (independent versioning, MIT, public access)                                                                                                      |
| `.github/workflows/ci.yml`        | lint + typecheck + build on every PR                                                                                                                                  |
| `.github/workflows/release.yml`   | changesets version PR + npm publish on main merge                                                                                                                     |
| `packages/<name>/package.json`    | name, version (0.0.0), exports, deps, wireit scripts                                                                                                                  |
| `packages/<name>/tsconfig.json`   | extends tsconfig.base, sets rootDir/outDir                                                                                                                            |
| `packages/<name>/tsup.config.ts`  | tsup build config — ESM, dts, target                                                                                                                                  |
| `packages/<name>/src/index.ts`    | empty public surface stub (`export {};`)                                                                                                                              |
| `packages/<name>/README.md`       | one-paragraph package purpose                                                                                                                                         |

---

## Task 1: Initialize git repo, .gitignore, LICENSE

**Files:**

- Create: `.gitignore`
- Create: `LICENSE`
- Create: `.editorconfig`
- Create: `.nvmrc`

- [ ] **Step 1: Initialize git repo**

Run from `/home/forinda/dev/open-source/forinda-video-sdk`:

```bash
git init
git branch -m main
```

Expected: `Initialized empty Git repository in .../forinda-video-sdk/.git/`

- [ ] **Step 2: Create `.gitignore`**

Create `.gitignore` with:

```gitignore
# deps
node_modules/

# build outputs
dist/
build/
*.tsbuildinfo

# logs
npm-debug.log*
pnpm-debug.log*
*.log

# coverage
coverage/
.nyc_output/

# editor / OS
.DS_Store
.idea/
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json.example
*.swp

# env
.env
.env.local
.env.*.local

# changeset publish artifact
.changeset/*.tmp

# wireit cache
.wireit/

# playwright
playwright-report/
test-results/
```

- [ ] **Step 3: Create `LICENSE` (MIT)**

Create `LICENSE` with:

```
MIT License

Copyright (c) 2026 Forinda

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Create `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 5: Create `.nvmrc`**

```
20
```

- [ ] **Step 6: Verify**

Run:

```bash
ls -la .gitignore LICENSE .editorconfig .nvmrc
git status
```

Expected: all four files listed; git shows them as untracked.

- [ ] **Step 7: Commit**

```bash
git add .gitignore LICENSE .editorconfig .nvmrc
git commit -m "chore: initialize repo with license and editor config"
```

---

## Task 2: Workspace root — package.json, pnpm-workspace.yaml, .npmrc

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "apps/*"
  - "examples/*"
```

- [ ] **Step 2: Create `.npmrc`**

```
strict-peer-dependencies=true
auto-install-peers=true
public-hoist-pattern[]=*types*
public-hoist-pattern[]=*eslint*
public-hoist-pattern[]=*oxlint*
shared-workspace-lockfile=true
save-workspace-protocol=rolling
```

- [ ] **Step 3: Create root `package.json`**

```json
{
  "name": "forinda-video-sdk",
  "version": "0.0.0",
  "private": true,
  "description": "Open-source, framework-agnostic WebRTC video SDK monorepo",
  "license": "MIT",
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "build": "pnpm -r --filter './packages/*' --filter './apps/*' run build",
    "typecheck": "pnpm -r --filter './packages/*' --filter './apps/*' run typecheck",
    "lint": "pnpm -r --filter './packages/*' --filter './apps/*' run lint",
    "test": "pnpm -r --filter './packages/*' run test",
    "test:integration": "pnpm -r --filter './packages/*' run test:integration",
    "clean": "pnpm -r exec rm -rf dist .wireit *.tsbuildinfo && rm -rf node_modules",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "pnpm build && changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.9",
    "oxlint": "^0.11.0",
    "tsup": "^8.3.0",
    "typescript": "^6.0.0",
    "wireit": "^0.14.9"
  }
}
```

> Note: `oxfmt` is intentionally not pinned in this task — Task 4 picks oxfmt vs Prettier and adds the dev dep then.

- [ ] **Step 4: Install dependencies**

Run:

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install
```

Expected: lockfile generated (`pnpm-lock.yaml`), `node_modules/` populated, no errors.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --version
node --version
```

Expected: `9.12.0` and `v20.x.x` (or whatever 20.x is on the machine).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml .npmrc pnpm-lock.yaml
git commit -m "chore: bootstrap pnpm workspace with root scripts"
```

---

## Task 3: TypeScript base config

**Files:**

- Create: `tsconfig.base.json`

- [ ] **Step 1: Create `tsconfig.base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,

    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,

    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    "newLine": "lf"
  }
}
```

- [ ] **Step 2: Verify TypeScript installed**

Run:

```bash
pnpm exec tsc --version
```

Expected: `Version 5.6.x`

- [ ] **Step 3: Commit**

```bash
git add tsconfig.base.json
git commit -m "chore: add strict TypeScript base config"
```

---

## Task 4: Lint and format — oxlint + oxfmt (Prettier fallback)

**Files:**

- Create: `oxlint.json`
- Create: `oxfmt.json` OR `.prettierrc.json` (decision in Step 1)
- Modify: `package.json` (add format dep)

- [ ] **Step 1: Decide oxfmt vs Prettier**

Run:

```bash
pnpm dlx oxfmt --version
```

Expected: prints a version string.

- If the command succeeds and prints a version, proceed with **oxfmt** (Step 2a).
- If the command errors (`command not found`, `package not found`, or any failure), proceed with **Prettier fallback** (Step 2b). Note this decision in the commit message.

- [ ] **Step 2a (oxfmt path): Add oxfmt dev dep**

Run:

```bash
pnpm add -Dw oxfmt
```

Create `oxfmt.json`:

```json
{
  "lineWidth": 100,
  "indentWidth": 2,
  "useTabs": false,
  "singleQuote": true,
  "trailingComma": "all",
  "semi": true
}
```

- [ ] **Step 2b (Prettier fallback path): Add prettier dev dep**

Run:

```bash
pnpm add -Dw prettier
```

Create `.prettierrc.json`:

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "singleQuote": true,
  "trailingComma": "all",
  "semi": true,
  "endOfLine": "lf"
}
```

Create `.prettierignore`:

```
dist/
node_modules/
pnpm-lock.yaml
.changeset/
*.tsbuildinfo
.wireit/
coverage/
```

- [ ] **Step 3: Create `oxlint.json`**

```json
{
  "$schema": "https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxlint/configuration_schema.json",
  "categories": {
    "correctness": "error",
    "suspicious": "error",
    "perf": "warn",
    "style": "off"
  },
  "rules": {
    "no-console": "warn",
    "no-debugger": "error",
    "eqeqeq": "error",
    "no-unused-vars": "error",
    "no-empty": "error"
  },
  "ignorePatterns": [
    "dist",
    "node_modules",
    ".changeset",
    ".wireit",
    "coverage",
    "*.config.ts",
    "*.config.js"
  ]
}
```

- [ ] **Step 4: Verify oxlint runs**

Run:

```bash
pnpm exec oxlint --version
pnpm exec oxlint --print-config .
```

Expected: prints version, prints resolved config without errors.

- [ ] **Step 5: Verify formatter runs**

If oxfmt path:

```bash
pnpm exec oxfmt --check .
```

If Prettier path:

```bash
pnpm exec prettier --check . --ignore-path .prettierignore
```

Expected: exits 0 (nothing to format yet) or reports files that need formatting (acceptable — there's only JSON/Markdown so far).

- [ ] **Step 6: Commit**

If oxfmt:

```bash
git add oxlint.json oxfmt.json package.json pnpm-lock.yaml
git commit -m "chore: configure oxlint and oxfmt"
```

If Prettier fallback:

```bash
git add oxlint.json .prettierrc.json .prettierignore package.json pnpm-lock.yaml
git commit -m "chore: configure oxlint; oxfmt unavailable, using Prettier fallback"
```

---

## Task 5: Initialize Changesets

**Files:**

- Create: `.changeset/config.json`
- Create: `.changeset/README.md` (auto-generated, then customized)

- [ ] **Step 1: Run changeset init**

```bash
pnpm exec changeset init
```

Expected: creates `.changeset/config.json` and `.changeset/README.md`.

- [ ] **Step 2: Replace `.changeset/config.json` with the project config**

Overwrite `.changeset/config.json` with:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@forinda/test-helpers", "dev-signaling-server"]
}
```

- [ ] **Step 3: Verify changeset CLI works**

Run:

```bash
pnpm exec changeset status
```

Expected: prints "No changesets present" — this is success, the CLI is wired.

- [ ] **Step 4: Commit**

```bash
git add .changeset/
git commit -m "chore: initialize changesets with public access and independent versioning"
```

---

## Task 6: GitHub Actions CI workflow (skeleton)

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  typecheck:
    name: Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

> Test jobs (unit, integration, e2e, bun-tests) are intentionally NOT added here. They get added in EPIC-8 when there are tests to run.

- [ ] **Step 2: Validate YAML syntax**

Run:

```bash
pnpm dlx js-yaml .github/workflows/ci.yml > /dev/null && echo "YAML valid"
```

Expected: `YAML valid`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint, typecheck, build jobs (test jobs added in later epics)"
```

---

## Task 7: GitHub Actions release workflow

**Files:**

- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: https://registry.npmjs.org/
      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm release
          version: pnpm version-packages
          commit: "chore: version packages"
          title: "chore: version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: "true"
```

- [ ] **Step 2: Validate YAML syntax**

```bash
pnpm dlx js-yaml .github/workflows/release.yml > /dev/null && echo "YAML valid"
```

Expected: `YAML valid`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add changesets-driven release workflow with npm provenance"
```

---

## Task 8: Scaffold all 12 packages — shared template + per-package deltas

This task creates 11 published packages and 1 internal package using the template below. Every package has the same skeleton; per-package deltas are listed inline. Each package is its own git commit so failures are easy to bisect.

### Shared template

Every package has these five files. Substitute `<NAME>` (without scope) and `<DESCRIPTION>` per package; use the per-package "Public surface" stub for `src/index.ts`.

`packages/<NAME>/package.json`:

```jsonc
{
  "name": "@forinda/video-sdk-<NAME>",
  "version": "0.0.0",
  "description": "<DESCRIPTION>",
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
    },
    "./package.json": "./package.json",
  },
  "files": ["dist", "README.md", "LICENSE"],
  "engines": { "node": ">=20.0.0" },
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "wireit",
    "typecheck": "wireit",
    "lint": "wireit",
  },
  "wireit": {
    "build": {
      "command": "tsup",
      "files": ["src/**/*.ts", "tsup.config.ts", "tsconfig.json", "../../tsconfig.base.json"],
      "output": ["dist/**"],
      "clean": "if-file-deleted",
      "dependencies": ["^build"],
    },
    "typecheck": {
      "command": "tsc --noEmit",
      "files": ["src/**/*.ts", "tsconfig.json", "../../tsconfig.base.json"],
      "output": [],
    },
    "lint": {
      "command": "oxlint src",
      "files": ["src/**/*.ts", "../../oxlint.json"],
      "output": [],
    },
  },
  "devDependencies": {
    "tsup": "^8.3.0",
    "typescript": "^6.0.0",
    "wireit": "^0.14.9",
    "oxlint": "^0.11.0",
  },
}
```

`packages/<NAME>/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

`packages/<NAME>/tsup.config.ts`:

```ts
import { defineConfig } from "tsup";
import { createBanner } from "../../tools/build-banner.ts";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  treeshake: true,
  banner: { js: createBanner() },
});
```

> Note: every package's `tsup.config.ts` includes `banner: { js: createBanner() }` (or a shebang-prefixed variant for CLIs). The banner stamps `(c) <year> Felix Orinda | built <date>` at the top of every emitted `dist/*.js`. See `tools/README.md` for utility details. Per-package overrides below preserve the same banner line.

`packages/<NAME>/README.md`:

```markdown
# @forinda/video-sdk-<NAME>

<DESCRIPTION>

> 🚧 Foundation skeleton — implementation in EPIC-N. See `docs/superpowers/specs/2026-05-02-video-sdk-design.md`.
```

`packages/<NAME>/src/index.ts`:

Empty stub per package — see the per-package "Public surface" code blocks below.

---

### Step pattern (repeat for every package)

For each package:

1. Create the four template files above with the correct `<NAME>`, `<DESCRIPTION>`, `src/index.ts` body, and any per-package additions (extra deps, extra files).
2. Run `pnpm install --filter @forinda/video-sdk-<NAME>` from the repo root if the package has new deps not in root.
3. Run `pnpm --filter @forinda/video-sdk-<NAME> build` — expected: `dist/index.js`, `dist/index.js.map`, `dist/index.d.ts` produced.
4. Run `pnpm --filter @forinda/video-sdk-<NAME> typecheck` — expected: exits 0.
5. Run `pnpm --filter @forinda/video-sdk-<NAME> lint` — expected: exits 0.
6. `git add packages/<NAME> package.json pnpm-lock.yaml` and commit with message `chore(<NAME>): scaffold package skeleton`.

---

### Package 8.1: `core`

- [ ] **Step 1: Apply template** with:
  - `<NAME>` = `core`
  - `<DESCRIPTION>` = `Framework-agnostic WebRTC publish/view core for the Forinda video SDK`
  - Add to `package.json`: `"dependencies": { "@forinda/video-sdk-signaling-protocol": "workspace:*", "zod": "^3.23.8" }`
  - `src/index.ts`:
    ```ts
    export {};
    ```

- [ ] **Step 2: Install + build + typecheck + lint + commit** (per the step pattern above).

> The actual public exports listed in spec Section 5.5 are populated in EPIC-3, not here.

---

### Package 8.2: `signaling-protocol`

- [ ] **Step 1: Apply template** with:
  - `<NAME>` = `signaling-protocol`
  - `<DESCRIPTION>` = `Pure protocol engine and wire-format zod schemas for the Forinda video SDK signaling layer`
  - Add to `package.json`: `"dependencies": { "zod": "^3.23.8" }`
  - `src/index.ts`:
    ```ts
    export {};
    ```

- [ ] **Step 2: Install + build + typecheck + lint + commit.**

---

### Package 8.3: `signaling-ws`

- [ ] **Step 1: Apply template** with:
  - `<NAME>` = `signaling-ws`
  - `<DESCRIPTION>` = `Browser WebSocket client transport for Forinda video SDK signaling`
  - Add to `package.json`: `"peerDependencies": { "@forinda/video-sdk-core": "workspace:*", "@forinda/video-sdk-signaling-protocol": "workspace:*" }`
  - `src/index.ts`:
    ```ts
    export {};
    ```

- [ ] **Step 2: Install + build + typecheck + lint + commit.**

---

### Package 8.4: `signaling-broadcast`

- [ ] **Step 1: Apply template** with:
  - `<NAME>` = `signaling-broadcast`
  - `<DESCRIPTION>` = `Same-tab BroadcastChannel client transport for Forinda video SDK demos and tests`
  - Add to `package.json`: `"peerDependencies": { "@forinda/video-sdk-core": "workspace:*", "@forinda/video-sdk-signaling-protocol": "workspace:*" }`
  - `src/index.ts`:
    ```ts
    export {};
    ```

- [ ] **Step 2: Install + build + typecheck + lint + commit.**

---

### Package 8.5: `signaling-adapter-ws`

- [ ] **Step 1: Apply template** with:
  - `<NAME>` = `signaling-adapter-ws`
  - `<DESCRIPTION>` = `Node WebSocket server adapter for Forinda video SDK signaling protocol`
  - Add to `package.json`: `"dependencies": { "@forinda/video-sdk-signaling-protocol": "workspace:*", "ws": "^8.18.0" }`, `"devDependencies": { "@types/ws": "^8.5.13", "tsup": "^8.3.0", "typescript": "^6.0.0", "wireit": "^0.14.9", "oxlint": "^0.11.0" }`
  - `tsup.config.ts` — add `target: 'node20'` and `platform: 'node'`:

    ```ts
    import { defineConfig } from "tsup";

    export default defineConfig({
      entry: ["src/index.ts"],
      format: ["esm"],
      dts: true,
      sourcemap: true,
      clean: true,
      target: "node20",
      platform: "node",
      treeshake: true,
    });
    ```

  - `src/index.ts`:
    ```ts
    export {};
    ```

- [ ] **Step 2: Install + build + typecheck + lint + commit.**

---

### Package 8.6: `signaling-adapter-express` (dual ESM + CJS)

Express is the only package in the monorepo that ships **both ESM and CJS** outputs. Express is heavily used in CJS-first Node projects; ESM-only would lock those consumers out. Every other package stays ESM-only.

- [ ] **Step 1: Apply template** with the following overrides (the standard template is overridden in three places — `package.json`, `tsup.config.ts`, and the dist artifacts produced):
  - `<NAME>` = `signaling-adapter-express`
  - `<DESCRIPTION>` = `Express integration for Forinda video SDK signaling protocol (dual ESM + CJS)`
  - **Replace** `package.json` with the version below (note `main` points to CJS, `module` to ESM, `exports` has both `import` and `require` conditions):

    ```jsonc
    {
      "name": "@forinda/video-sdk-signaling-adapter-express",
      "version": "0.0.0",
      "description": "Express integration for Forinda video SDK signaling protocol (dual ESM + CJS)",
      "license": "MIT",
      "type": "module",
      "sideEffects": false,
      "main": "./dist/index.cjs",
      "module": "./dist/index.js",
      "types": "./dist/index.d.ts",
      "exports": {
        ".": {
          "types": "./dist/index.d.ts",
          "import": "./dist/index.js",
          "require": "./dist/index.cjs",
        },
        "./package.json": "./package.json",
      },
      "files": ["dist", "README.md", "LICENSE"],
      "engines": { "node": ">=20.0.0" },
      "publishConfig": { "access": "public" },
      "scripts": {
        "build": "wireit",
        "typecheck": "wireit",
        "lint": "wireit",
      },
      "wireit": {
        "build": {
          "command": "tsup",
          "files": ["src/**/*.ts", "tsup.config.ts", "tsconfig.json", "../../tsconfig.base.json"],
          "output": ["dist/**"],
          "clean": "if-file-deleted",
          "dependencies": ["^build"],
        },
        "typecheck": {
          "command": "tsc --noEmit",
          "files": ["src/**/*.ts", "tsconfig.json", "../../tsconfig.base.json"],
          "output": [],
        },
        "lint": {
          "command": "oxlint src",
          "files": ["src/**/*.ts", "../../oxlint.json"],
          "output": [],
        },
      },
      "dependencies": {
        "@forinda/video-sdk-signaling-protocol": "workspace:*",
        "ws": "^8.18.0",
      },
      "peerDependencies": {
        "express": "^4.21.0 || ^5.0.0",
      },
      "devDependencies": {
        "@types/express": "^5.0.0",
        "@types/ws": "^8.5.13",
        "express": "^5.0.0",
        "tsup": "^8.3.0",
        "typescript": "^6.0.0",
        "wireit": "^0.14.9",
        "oxlint": "^0.11.0",
      },
    }
    ```

  - **Replace** `tsup.config.ts` with the dual-format config below (`format: ['esm', 'cjs']` produces `index.js` (ESM) + `index.cjs` (CJS); `dts: true` emits one shared `index.d.ts`):

    ```ts
    import { defineConfig } from "tsup";

    export default defineConfig({
      entry: ["src/index.ts"],
      format: ["esm", "cjs"],
      dts: true,
      sourcemap: true,
      clean: true,
      target: "node20",
      platform: "node",
      treeshake: true,
      outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
    });
    ```

  - `src/index.ts`:
    ```ts
    export {};
    ```

- [ ] **Step 2: Install + build + typecheck + lint + commit.**

  Build verification: confirm `dist/` contains **both** `index.js` (ESM) and `index.cjs` (CJS), plus `index.d.ts`. Source maps `index.js.map` + `index.cjs.map` should also be present.

---

### Package 8.7: `signaling-adapter-hono`

- [ ] **Step 1: Apply template** with:
  - `<NAME>` = `signaling-adapter-hono`
  - `<DESCRIPTION>` = `Hono integration for Forinda video SDK signaling protocol`
  - Add to `package.json`: `"dependencies": { "@forinda/video-sdk-signaling-protocol": "workspace:*" }`, `"peerDependencies": { "hono": "^4.6.0" }`, `"devDependencies": { "hono": "^4.6.0", "tsup": "^8.3.0", "typescript": "^6.0.0", "wireit": "^0.14.9", "oxlint": "^0.11.0" }`
  - `tsup.config.ts` — Node target as in 8.5.
  - `src/index.ts`:
    ```ts
    export {};
    ```

- [ ] **Step 2: Install + build + typecheck + lint + commit.**

---

### Package 8.8: `signaling-adapter-bun`

- [ ] **Step 1: Apply template** with:
  - `<NAME>` = `signaling-adapter-bun`
  - `<DESCRIPTION>` = `Bun native WebSocket server adapter for Forinda video SDK signaling protocol`
  - Add to `package.json`: `"dependencies": { "@forinda/video-sdk-signaling-protocol": "workspace:*" }`, `"devDependencies": { "@types/bun": "^1.1.14", "tsup": "^8.3.0", "typescript": "^6.0.0", "wireit": "^0.14.9", "oxlint": "^0.11.0" }`
  - `tsup.config.ts` — Bun-compatible (Node target works; Bun reads ESM):

    ```ts
    import { defineConfig } from "tsup";

    export default defineConfig({
      entry: ["src/index.ts"],
      format: ["esm"],
      dts: true,
      sourcemap: true,
      clean: true,
      target: "es2022",
      platform: "neutral",
      treeshake: true,
    });
    ```

  - `src/index.ts`:
    ```ts
    export {};
    ```

- [ ] **Step 2: Install + build + typecheck + lint + commit.**

---

### Package 8.9: `signaling-server` (CLI + library)

- [ ] **Step 1: Apply template** with:
  - `<NAME>` = `signaling-server`
  - `<DESCRIPTION>` = `Standalone reference signaling server for the Forinda video SDK (library + CLI)`
  - Replace `package.json` with the version below (adds `bin`, second entry for CLI, two exports):

    ```jsonc
    {
      "name": "@forinda/video-sdk-signaling-server",
      "version": "0.0.0",
      "description": "Standalone reference signaling server for the Forinda video SDK (library + CLI)",
      "license": "MIT",
      "type": "module",
      "sideEffects": false,
      "main": "./dist/index.js",
      "types": "./dist/index.d.ts",
      "bin": {
        "forinda-signaling": "./dist/cli.js",
      },
      "exports": {
        ".": {
          "types": "./dist/index.d.ts",
          "import": "./dist/index.js",
        },
        "./package.json": "./package.json",
      },
      "files": ["dist", "README.md", "LICENSE"],
      "engines": { "node": ">=20.0.0" },
      "publishConfig": { "access": "public" },
      "scripts": {
        "build": "wireit",
        "typecheck": "wireit",
        "lint": "wireit",
      },
      "wireit": {
        "build": {
          "command": "tsup",
          "files": ["src/**/*.ts", "tsup.config.ts", "tsconfig.json", "../../tsconfig.base.json"],
          "output": ["dist/**"],
          "clean": "if-file-deleted",
          "dependencies": ["^build"],
        },
        "typecheck": {
          "command": "tsc --noEmit",
          "files": ["src/**/*.ts", "tsconfig.json", "../../tsconfig.base.json"],
          "output": [],
        },
        "lint": {
          "command": "oxlint src",
          "files": ["src/**/*.ts", "../../oxlint.json"],
          "output": [],
        },
      },
      "dependencies": {
        "@forinda/video-sdk-signaling-adapter-ws": "workspace:*",
        "@forinda/video-sdk-signaling-protocol": "workspace:*",
      },
      "devDependencies": {
        "tsup": "^8.3.0",
        "typescript": "^6.0.0",
        "wireit": "^0.14.9",
        "oxlint": "^0.11.0",
      },
    }
    ```

  - `tsup.config.ts` — emits `index` and `cli` (Node target):

    ```ts
    import { defineConfig } from "tsup";

    export default defineConfig({
      entry: ["src/index.ts", "src/cli.ts"],
      format: ["esm"],
      dts: true,
      sourcemap: true,
      clean: true,
      target: "node20",
      platform: "node",
      treeshake: true,
      banner: { js: "#!/usr/bin/env node" },
    });
    ```

    > Note: the `banner` shebang attaches to **both** entry outputs; `cli.js` needs it, `index.js` is unaffected. EPIC-4 will refine this.

  - `src/index.ts`:
    ```ts
    export {};
    ```
  - `src/cli.ts`:
    ```ts
    export {};
    ```

- [ ] **Step 2: Install + build + typecheck + lint + commit.**

---

### Package 8.10: `react`

- [ ] **Step 1: Apply template** with:
  - `<NAME>` = `react`
  - `<DESCRIPTION>` = `React hooks and components for the Forinda video SDK`
  - Add to `package.json`: `"peerDependencies": { "@forinda/video-sdk-core": "workspace:*", "react": ">=18.0.0" }`, `"devDependencies": { "@types/react": "^18.3.12", "react": "^18.3.1", "tsup": "^8.3.0", "typescript": "^6.0.0", "wireit": "^0.14.9", "oxlint": "^0.11.0" }`
  - `tsup.config.ts` — add JSX support:

    ```ts
    import { defineConfig } from "tsup";

    export default defineConfig({
      entry: ["src/index.ts"],
      format: ["esm"],
      dts: true,
      sourcemap: true,
      clean: true,
      target: "es2022",
      treeshake: true,
      external: ["react", "react-dom"],
    });
    ```

  - `tsconfig.json` — add JSX:

    ```json
    {
      "extends": "../../tsconfig.base.json",
      "compilerOptions": {
        "rootDir": "src",
        "outDir": "dist",
        "noEmit": true,
        "jsx": "react-jsx",
        "lib": ["ES2022", "DOM", "DOM.Iterable"]
      },
      "include": ["src/**/*.ts", "src/**/*.tsx"]
    }
    ```

  - `src/index.ts`:
    ```ts
    export {};
    ```

- [ ] **Step 2: Install + build + typecheck + lint + commit.**

---

### Package 8.11: `web-components` (publishes as `@forinda/video-sdk-elements`)

- [ ] **Step 1: Apply template** with one rename\*\*
  - Directory name on disk: `packages/web-components/`
  - Package name in `package.json`: `@forinda/video-sdk-elements` (intentional — directory describes the layer, published name is shorter for HTML users).
  - `<DESCRIPTION>` = `Web Components (custom HTML elements) for the Forinda video SDK`
  - Add to `package.json`: `"peerDependencies": { "@forinda/video-sdk-core": "workspace:*" }`
  - `tsconfig.json` — add DOM lib:

    ```json
    {
      "extends": "../../tsconfig.base.json",
      "compilerOptions": {
        "rootDir": "src",
        "outDir": "dist",
        "noEmit": true,
        "lib": ["ES2022", "DOM", "DOM.Iterable"]
      },
      "include": ["src/**/*.ts"]
    }
    ```

  - `tsup.config.ts` — emits both ESM and IIFE bundles:

    ```ts
    import { defineConfig } from "tsup";

    export default defineConfig({
      entry: ["src/index.ts", "src/manual.ts"],
      format: ["esm", "iife"],
      globalName: "ForindaVideoSdk",
      dts: true,
      sourcemap: true,
      clean: true,
      target: "es2022",
      treeshake: true,
    });
    ```

  - `package.json` — adjust `exports` to expose the manual entry too:

    ```jsonc
    {
      "name": "@forinda/video-sdk-elements",
      "version": "0.0.0",
      "description": "Web Components (custom HTML elements) for the Forinda video SDK",
      "license": "MIT",
      "type": "module",
      "sideEffects": true,
      "main": "./dist/index.js",
      "types": "./dist/index.d.ts",
      "exports": {
        ".": {
          "types": "./dist/index.d.ts",
          "import": "./dist/index.js",
        },
        "./manual": {
          "types": "./dist/manual.d.ts",
          "import": "./dist/manual.js",
        },
        "./global": "./dist/index.global.js",
        "./package.json": "./package.json",
      },
      "files": ["dist", "README.md", "LICENSE"],
      "engines": { "node": ">=20.0.0" },
      "publishConfig": { "access": "public" },
      "scripts": {
        "build": "wireit",
        "typecheck": "wireit",
        "lint": "wireit",
      },
      "wireit": {
        "build": {
          "command": "tsup",
          "files": ["src/**/*.ts", "tsup.config.ts", "tsconfig.json", "../../tsconfig.base.json"],
          "output": ["dist/**"],
          "clean": "if-file-deleted",
          "dependencies": ["^build"],
        },
        "typecheck": {
          "command": "tsc --noEmit",
          "files": ["src/**/*.ts", "tsconfig.json", "../../tsconfig.base.json"],
          "output": [],
        },
        "lint": {
          "command": "oxlint src",
          "files": ["src/**/*.ts", "../../oxlint.json"],
          "output": [],
        },
      },
      "peerDependencies": {
        "@forinda/video-sdk-core": "workspace:*",
      },
      "devDependencies": {
        "tsup": "^8.3.0",
        "typescript": "^6.0.0",
        "wireit": "^0.14.9",
        "oxlint": "^0.11.0",
      },
    }
    ```

    Note `sideEffects: true` here — auto-registering elements on import is the entire point.

  - `src/index.ts`:
    ```ts
    export {};
    ```
  - `src/manual.ts`:
    ```ts
    export {};
    ```

- [ ] **Step 2: Install + build + typecheck + lint + commit.**

---

### Package 8.12: `test-helpers` (private, not published)

- [ ] **Step 1: Apply template** with:
  - Directory: `packages/test-helpers/`
  - Package name: `@forinda/test-helpers`
  - `<DESCRIPTION>` = `Internal test helpers for the Forinda video SDK monorepo (not published)`
  - Replace top-level `package.json` keys:
    - Remove `"publishConfig"`.
    - Add `"private": true` at the top.
    - Remove `"files"` (irrelevant for private packages).
  - `src/index.ts`:
    ```ts
    export {};
    ```

  Final `package.json`:

  ```jsonc
  {
    "name": "@forinda/test-helpers",
    "version": "0.0.0",
    "private": true,
    "description": "Internal test helpers for the Forinda video SDK monorepo (not published)",
    "license": "MIT",
    "type": "module",
    "sideEffects": false,
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js",
      },
      "./package.json": "./package.json",
    },
    "engines": { "node": ">=20.0.0" },
    "scripts": {
      "build": "wireit",
      "typecheck": "wireit",
      "lint": "wireit",
    },
    "wireit": {
      "build": {
        "command": "tsup",
        "files": ["src/**/*.ts", "tsup.config.ts", "tsconfig.json", "../../tsconfig.base.json"],
        "output": ["dist/**"],
        "clean": "if-file-deleted",
        "dependencies": ["^build"],
      },
      "typecheck": {
        "command": "tsc --noEmit",
        "files": ["src/**/*.ts", "tsconfig.json", "../../tsconfig.base.json"],
        "output": [],
      },
      "lint": {
        "command": "oxlint src",
        "files": ["src/**/*.ts", "../../oxlint.json"],
        "output": [],
      },
    },
    "devDependencies": {
      "tsup": "^8.3.0",
      "typescript": "^6.0.0",
      "wireit": "^0.14.9",
      "oxlint": "^0.11.0",
    },
  }
  ```

- [ ] **Step 2: Install + build + typecheck + lint + commit.**

---

## Task 9: Scaffold `apps/dev-signaling-server`

**Files:**

- Create: `apps/dev-signaling-server/package.json`
- Create: `apps/dev-signaling-server/tsconfig.json`
- Create: `apps/dev-signaling-server/tsup.config.ts`
- Create: `apps/dev-signaling-server/src/index.ts`
- Create: `apps/dev-signaling-server/README.md`

- [ ] **Step 1: Create `apps/dev-signaling-server/package.json`**

```json
{
  "name": "dev-signaling-server",
  "version": "0.0.0",
  "private": true,
  "description": "Local development signaling server for Forinda video SDK examples and tests",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "wireit",
    "typecheck": "wireit",
    "lint": "wireit",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  },
  "wireit": {
    "build": {
      "command": "tsup",
      "files": ["src/**/*.ts", "tsup.config.ts", "tsconfig.json", "../../tsconfig.base.json"],
      "output": ["dist/**"],
      "clean": "if-file-deleted",
      "dependencies": ["^build"]
    },
    "typecheck": {
      "command": "tsc --noEmit",
      "files": ["src/**/*.ts", "tsconfig.json", "../../tsconfig.base.json"],
      "output": []
    },
    "lint": {
      "command": "oxlint src",
      "files": ["src/**/*.ts", "../../oxlint.json"],
      "output": []
    }
  },
  "dependencies": {
    "@forinda/video-sdk-signaling-server": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.3.0",
    "tsx": "^4.19.2",
    "typescript": "^6.0.0",
    "wireit": "^0.14.9",
    "oxlint": "^0.11.0"
  }
}
```

- [ ] **Step 2: Create `apps/dev-signaling-server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `apps/dev-signaling-server/tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  sourcemap: true,
  clean: true,
  target: "node20",
  platform: "node",
});
```

- [ ] **Step 4: Create `apps/dev-signaling-server/src/index.ts`**

```ts
export {};
```

- [ ] **Step 5: Create `apps/dev-signaling-server/README.md`**

```markdown
# dev-signaling-server

Local dev server wrapping `@forinda/video-sdk-signaling-server` with logging.

> 🚧 Foundation skeleton — implementation in EPIC-4.

## Run

\`\`\`bash
pnpm --filter dev-signaling-server dev
\`\`\`
```

- [ ] **Step 6: Install, build, typecheck, lint**

```bash
pnpm install
pnpm --filter dev-signaling-server build
pnpm --filter dev-signaling-server typecheck
pnpm --filter dev-signaling-server lint
```

Expected: all four exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/ package.json pnpm-lock.yaml
git commit -m "chore(dev-signaling-server): scaffold local development server app"
```

---

## Task 10: Root README

**Files:**

- Create: `README.md`

- [ ] **Step 1: Create root `README.md`**

```markdown
# Forinda Video SDK

> Open-source, framework-agnostic WebRTC video SDK. Publish, view, and embed peer-to-peer video in any frontend or backend.

> 🚧 **Status:** Pre-release. Foundation epic complete. Implementation in progress.

## Packages

| Package                                                                                | Description                                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`@forinda/video-sdk-core`](./packages/core)                                           | Framework-agnostic WebRTC publish/view core                                     |
| [`@forinda/video-sdk-signaling-protocol`](./packages/signaling-protocol)               | Pure protocol engine + wire-format zod schemas                                  |
| [`@forinda/video-sdk-signaling-ws`](./packages/signaling-ws)                           | Browser WebSocket client transport                                              |
| [`@forinda/video-sdk-signaling-broadcast`](./packages/signaling-broadcast)             | Same-tab BroadcastChannel client transport (demos, tests)                       |
| [`@forinda/video-sdk-signaling-adapter-ws`](./packages/signaling-adapter-ws)           | Node `ws` server adapter                                                        |
| [`@forinda/video-sdk-signaling-adapter-express`](./packages/signaling-adapter-express) | Express server adapter                                                          |
| [`@forinda/video-sdk-signaling-adapter-hono`](./packages/signaling-adapter-hono)       | Hono server adapter                                                             |
| [`@forinda/video-sdk-signaling-adapter-bun`](./packages/signaling-adapter-bun)         | Bun native WS server adapter                                                    |
| [`@forinda/video-sdk-signaling-server`](./packages/signaling-server)                   | Standalone reference server (library + CLI)                                     |
| [`@forinda/video-sdk-react`](./packages/react)                                         | React hooks and components                                                      |
| [`@forinda/video-sdk-elements`](./packages/web-components)                             | Web Components (`<video-publisher>`, `<video-viewer>`, `<video-device-picker>`) |

## Apps

| App                                                   | Description                        |
| ----------------------------------------------------- | ---------------------------------- |
| [`dev-signaling-server`](./apps/dev-signaling-server) | Local development signaling server |

## Development

Requires Node 20+ and pnpm 9+.

\`\`\`bash
corepack enable
pnpm install
pnpm build # build every package
pnpm typecheck # type-check every package
pnpm lint # lint every package
\`\`\`

## License

MIT — see [LICENSE](./LICENSE).

## Spec

See [`docs/superpowers/specs/2026-05-02-video-sdk-design.md`](./docs/superpowers/specs/2026-05-02-video-sdk-design.md) for the v0.1.0 design.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add root README with package directory and quickstart"
```

---

## Task 11: Whole-workspace verification

This task verifies the foundation actually works as a unit.

- [ ] **Step 1: Clean state**

```bash
pnpm clean
```

Expected: removes all `dist/`, `.wireit/`, `*.tsbuildinfo`, and root `node_modules/`.

- [ ] **Step 2: Reinstall from lockfile**

```bash
pnpm install --frozen-lockfile
```

Expected: install completes; `pnpm-lock.yaml` is unchanged afterwards (`git status` shows it clean). If it changed, the lockfile was stale — investigate before continuing.

- [ ] **Step 3: Whole-workspace typecheck**

```bash
pnpm typecheck
```

Expected: every package + app exits 0. Output shows wireit running `tsc --noEmit` per package.

- [ ] **Step 4: Whole-workspace build**

```bash
pnpm build
```

Expected: every package emits `dist/index.js` and `dist/index.d.ts` (signaling-server also emits `dist/cli.js`; web-components also emits `dist/index.global.js` and `dist/manual.js`). Wireit caches; second `pnpm build` should report cached results in <2s.

- [ ] **Step 5: Verify each package's emitted dist/**

```bash
for pkg in packages/*/; do
  echo "=== $pkg ==="
  ls "${pkg}dist/" 2>/dev/null || echo "  no dist (FAIL)"
done
ls apps/dev-signaling-server/dist/
```

Expected: every directory listed contains at least `index.js` and (for published packages) `index.d.ts`.

- [ ] **Step 6: Whole-workspace lint**

```bash
pnpm lint
```

Expected: exits 0 for every package.

- [ ] **Step 7: Verify wireit caching works**

```bash
pnpm build
```

Expected: completes in <3 seconds, output mentions "fresh" / cached results for every package.

- [ ] **Step 8: Verify changeset CLI**

```bash
pnpm changeset --empty
git status
```

Expected: creates a `.changeset/<name>.md` empty changeset; remove it before committing:

```bash
rm .changeset/*.md
# (keep .changeset/README.md and .changeset/config.json)
git status
```

Expected clean.

- [ ] **Step 9: Commit if any incidental changes**

If steps 3-7 produced any unexpected file changes, investigate. If none, no commit needed.

```bash
git status
```

Expected: clean working tree.

---

## Task 12: Tag baseline

- [ ] **Step 1: Confirm clean tree + all CI commands pass locally**

```bash
git status
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all four exit 0; `git status` clean.

- [ ] **Step 2: Tag the baseline**

```bash
git tag -a v0.0.0-foundation -m "EPIC-1 complete: monorepo foundation"
```

- [ ] **Step 3: Verify tag**

```bash
git tag -l
git log --oneline -1
```

Expected: tag listed; HEAD points at the most recent commit.

- [ ] **Step 4: (When remote exists) push branch + tag**

```bash
# Only if a remote has been set up; skip otherwise.
git push -u origin main
git push origin v0.0.0-foundation
```

Expected: pushed without errors. If no remote yet, skip — the tag still lives locally and serves as a checkpoint.

---

## Self-review notes

**Spec coverage check** (against `docs/superpowers/specs/2026-05-02-video-sdk-design.md`):

| Spec section / requirement                                                                       | Plan task                                           |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Section 2 — repo layout                                                                          | Task 8 (packages), Task 9 (app), present throughout |
| Section 3 — pnpm 9, Node 20, TypeScript 6.0, tsup, wireit, oxlint, oxfmt-or-Prettier, Changesets | Tasks 2, 3, 4, 5                                    |
| Section 3 — wireit per-package script convention                                                 | Task 8 template                                     |
| Section 3 — ESM-only `exports` field with `types`                                                | Task 8 template                                     |
| Section 3 — `engines.node >= 20`, pinned `packageManager`                                        | Task 2                                              |
| Section 4 — MIT, npm provenance                                                                  | Task 1 (LICENSE), Task 7 (release.yml)              |
| Section 12 — CI lint/typecheck/build jobs                                                        | Task 6                                              |
| Section 12 — release workflow with changesets + provenance                                       | Task 7                                              |
| Section 15 — EPIC-1 outcome ("CI skeleton")                                                      | Tasks 6 + 7                                         |
| Section 15 — package scaffolding for all packages                                                | Task 8                                              |

Test jobs from Section 12 (unit, integration, e2e, bun-tests) are **deliberately deferred** to EPIC-8 — there are no tests to run yet.

**Type/name consistency check:** All `package.json` `name` fields match the spec's table. Directory `web-components/` publishes as `@forinda/video-sdk-elements` — intentional and called out in Task 8.11. Internal package is `@forinda/test-helpers` (no `video-sdk-` prefix) per spec Section 12.

**Placeholder scan:** No "TBD" / "TODO" / "fill in later" outside of the README skeletons (which are themselves complete and explicit).

---

## Out of scope for EPIC-1

These belong to later epics — do not add them to the foundation:

- Any actual implementation in `src/index.ts` files (EPIC-2 onwards).
- Test files, vitest configs, `@vitest/browser` (EPIC-8).
- Playwright e2e setup (EPIC-8).
- Example apps (EPIC-7).
- `cem analyze` for custom-elements.json (EPIC-6).
- Any documentation site (deferred past v0.1.0).
- Husky/lint-staged/commitlint (out of scope per spec Section 3).
- Issue templates / PR templates (nice-to-have, but EPIC-9 if at all).
