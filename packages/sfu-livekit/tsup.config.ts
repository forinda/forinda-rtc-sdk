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
  minify: true,
  tsconfig: "./tsconfig.build.json",
  external: ["livekit-client", "@forinda/video-sdk-core"],
  banner: { js: createBanner() },
});
