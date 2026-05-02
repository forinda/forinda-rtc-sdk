import { defineConfig } from "tsup";
import { createBanner } from "../../tools/build-banner.ts";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: { resolve: true },
  sourcemap: true,
  clean: true,
  target: "es2022",
  treeshake: true,
  tsconfig: "./tsconfig.build.json",
  banner: { js: createBanner() },
});
