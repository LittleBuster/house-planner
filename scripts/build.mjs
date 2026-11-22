import * as esbuild from "esbuild";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await copyFile("index.html", "dist/index.html");
const options = {
  entryPoints: ["src/main.tsx"],
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: ["safari16"],
  minify: !process.argv.includes("--serve"),
  sourcemap: process.argv.includes("--serve"),
  legalComments: "eof",
  loader: { ".glb": "binary" },
  define: { "process.env.NODE_ENV": '"production"' },
};
if (process.argv.includes("--serve")) {
  const context = await esbuild.context(options);
  await context.watch();
  await context.serve({ servedir: "dist", port: 4173, host: "127.0.0.1" });
  console.log("ДомПлан: http://127.0.0.1:4173");
} else {
  await esbuild.build(options);
  console.log("ДомПлан собран: dist/index.html");
}
