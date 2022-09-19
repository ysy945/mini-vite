const esbuild = require("esbuild");
const path = require("path");
// esbuild.build({
// entryPoints: ["./src/node/cli.ts"],
// outdir: path.resolve(__dirname, "./node"),
// bundle: true,
// sourcemap: false,
// minify: false,
// splitting: false,
// format: "cjs",
// platform: "node",
// target: ["es2015"],
// external: ["esbuild", "rollup"],
// });
esbuild.build({
  entryPoints: ["./src/node/index.ts"],
  outdir: path.resolve(__dirname, "./node"),
  bundle: true,
  sourcemap: false,
  minify: false,
  splitting: false,
  format: "cjs",
  platform: "node",
  target: ["esnext"],
  external: ["esbuild", "rollup", "commander"],
});

esbuild.build({
  entryPoints: ["./src/client/index.ts"],
  outdir: path.resolve(__dirname, "./client"),
  bundle: true,
  sourcemap: false,
  minify: false,
  splitting: false,
  format: "esm",
  target: ["esnext"],
  external: ["esbuild", "rollup", "commander"],
});
