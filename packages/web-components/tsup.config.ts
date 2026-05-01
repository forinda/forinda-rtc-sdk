import { defineConfig } from "tsup";
import { createBanner } from "../../tools/build-banner.ts";

export default defineConfig({
  entry: ["src/index.ts", "src/manual.ts"],
  format: ["esm", "iife"],
  globalName: "ForindaVideoSdk",
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  treeshake: true,
  banner: { js: createBanner() },
});
