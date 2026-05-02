#!/usr/bin/env node
/**
 * Bin shim — npm/pnpm point the `forinda-signaling` global symlink here.
 * Loads the compiled CLI module and invokes its `main` entry. Keeping the
 * shim minimal lets the build output evolve without invalidating installed
 * symlinks.
 */
import { main } from "../dist/cli.js";

main(process.argv).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
