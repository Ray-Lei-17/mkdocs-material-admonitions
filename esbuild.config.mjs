import esbuild from "esbuild";
import process from "process";

const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2018",
  platform: "browser",
  outfile: "main.js",
  external: ["obsidian"],
  sourcemap: "inline"
});

if (watch) {
  await context.watch();
  console.log("Watching...");
} else {
  await context.rebuild();
  await context.dispose();
}
