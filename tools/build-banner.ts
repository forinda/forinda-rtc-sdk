import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface BannerOptions {
  packageJsonPath?: string;
  author?: string;
  license?: string;
}

interface PackageJsonShape {
  name: string;
  version: string;
  license?: string;
}

export function createBanner(opts: BannerOptions = {}): string {
  const pkgPath = resolve(opts.packageJsonPath ?? "./package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJsonShape;
  const author = opts.author ?? "Felix Orinda";
  const license = opts.license ?? pkg.license ?? "MIT";
  const date = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  return `/*! ${pkg.name} v${pkg.version} | (c) ${year} ${author} | built ${date} | ${license} */`;
}
