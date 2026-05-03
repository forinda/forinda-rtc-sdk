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
  external: ["vue", "@forinda/video-sdk-core", "@forinda/video-sdk-sfu-livekit", "livekit-client"],
  banner: { js: createBanner() },
});
