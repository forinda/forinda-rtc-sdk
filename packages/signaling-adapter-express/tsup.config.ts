import { defineConfig } from "tsup";
import { createBanner } from "../../tools/build-banner.ts";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  platform: "node",
  treeshake: true,
  external: ["ws", "express"],
  tsconfig: "./tsconfig.build.json",
  outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
  banner: { js: createBanner() },
});
