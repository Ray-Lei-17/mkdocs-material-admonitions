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
  external: [
    "obsidian",
    "@codemirror/state",
    "@codemirror/view",
    "@codemirror/language",
    "@codemirror/commands",
    "@codemirror/search",
    "@codemirror/autocomplete",
    "codemirror",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
  ],
  // external: ["obsidian", "@codemirror/state", "@codemirror/view"],
  sourcemap: "inline"
});

if (watch) {
  await context.watch();
  console.log("Watching...");
} else {
  await context.rebuild();
  await context.dispose();
}
