import { build, context } from "esbuild";
import { mkdir } from "node:fs/promises";

const watch = process.argv.includes("--watch");
await mkdir("dist", { recursive: true });

const options = {
  entryPoints: ["src/app.ts"],
  outfile: "dist/lyric-layer.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  legalComments: "none",
  banner: { js: "/* LyricLayer v0.1.0 — local translations for Spicy Lyrics */" },
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("LyricLayer: watching src/ and rebuilding dist/lyric-layer.js");
} else {
  await build(options);
  console.log("LyricLayer: built dist/lyric-layer.js");
}
