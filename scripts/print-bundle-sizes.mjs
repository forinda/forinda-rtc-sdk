#!/usr/bin/env node
/**
 * Walk every publishable package's `dist/`, report `index.js` (raw + gzipped)
 * and `index.d.ts` (raw) sizes. Output is a markdown table written to stdout
 * AND appended to `$GITHUB_STEP_SUMMARY` when running under GitHub Actions.
 *
 * Not yet a regression gate — that's a follow-up once we have baseline
 * numbers tracked across runs (planned: extend this script + commit
 * `bundle-budgets.json`, fail when any size grows >10%).
 */

import { readdirSync, readFileSync, statSync, existsSync, appendFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(__dirname, "..");
const packagesDir = join(repoRoot, "packages");

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function inspect(pkgDir) {
  const distDir = join(pkgDir, "dist");
  if (!existsSync(distDir)) return null;
  const candidates = ["index.js", "index.mjs"];
  let jsPath = null;
  for (const c of candidates) {
    const p = join(distDir, c);
    if (existsSync(p)) {
      jsPath = p;
      break;
    }
  }
  if (jsPath === null) return null;
  const dtsPath = join(distDir, "index.d.ts");
  const js = readFileSync(jsPath);
  const gz = gzipSync(js);
  const dtsSize = existsSync(dtsPath) ? statSync(dtsPath).size : null;
  return {
    js: js.length,
    gz: gz.length,
    dts: dtsSize,
    file: relative(repoRoot, jsPath),
  };
}

const rows = [];
for (const name of readdirSync(packagesDir)) {
  const pkgDir = join(packagesDir, name);
  const pkgJsonPath = join(pkgDir, "package.json");
  if (!existsSync(pkgJsonPath)) continue;
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  if (pkgJson.private === true) continue;
  const sizes = inspect(pkgDir);
  if (sizes === null) {
    rows.push({ name: pkgJson.name, status: "no dist (run `pnpm build`)" });
    continue;
  }
  rows.push({ name: pkgJson.name, ...sizes });
}

let md = "## Bundle sizes\n\n";
md += "| Package | Entry | Raw | Gzipped | .d.ts |\n";
md += "| ------- | ----- | --- | ------- | ----- |\n";
for (const r of rows) {
  if (r.status) {
    md += `| \`${r.name}\` | — | — | — | ${r.status} |\n`;
    continue;
  }
  md += `| \`${r.name}\` | \`${r.file}\` | ${fmt(r.js)} | **${fmt(r.gz)}** | ${
    r.dts === null ? "—" : fmt(r.dts)
  } |\n`;
}

process.stdout.write(md);

const summary = process.env.GITHUB_STEP_SUMMARY;
if (typeof summary === "string" && summary.length > 0) {
  appendFileSync(summary, md);
}
