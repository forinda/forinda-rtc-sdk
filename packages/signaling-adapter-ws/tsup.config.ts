import { defineConfig } from "tsup";
import { createBanner } from "../../tools/build-banner.ts";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  platform: "node",
  treeshake: true,
  external: ["ws"],
  tsconfig: "./tsconfig.build.json",
  banner: { js: createBanner() },
});
