// Builds unpacked extensions into dist/chrome and dist/firefox.
// `--watch` rebuilds (unminified, with source maps) whenever src/ changes.
import { watch } from "node:fs";
import { cp, rm } from "node:fs/promises";
import pkg from "../package.json";
import { siteCss } from "../src/content/css";
import { SITES } from "../src/sites";
import { manifest, type Target } from "./manifest";
import { svelte } from "./svelte";
import { tailwind } from "./tailwind";

const dev = process.argv.includes("--watch");
const TARGETS: Target[] = ["chrome", "firefox"];

async function build() {
  const start = performance.now();
  const out = `dist/${TARGETS[0]}`;
  await rm("dist", { recursive: true, force: true });

  const [popupCss, homeCss, overlayCss] = await Promise.all([
    tailwind("src/popup/popup.css", { minify: !dev }),
    tailwind("src/home/home.css", { minify: !dev }),
    tailwind("src/content/overlay.css", { minify: !dev, shadow: true }),
  ]);

  const result = await Bun.build({
    entrypoints: [
      ...SITES.map((s) => `src/content/${s.name}.ts`),
      "src/popup/popup.ts",
      "src/home/home.ts",
      "src/background/background.ts",
    ],
    outdir: out,
    naming: "[name].[ext]",
    target: "browser",
    // Content scripts can't be modules; keep everything self-contained.
    format: "iife",
    minify: !dev,
    sourcemap: dev ? "inline" : "none",
    conditions: [dev ? "development" : "production"],
    define: { __OVERLAY_CSS__: JSON.stringify(overlayCss) },
    plugins: [svelte({ dev })],
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Build failed");
  }

  await Promise.all([
    Bun.write(`${out}/popup.css`, popupCss),
    cp("src/popup/popup.html", `${out}/popup.html`),
    Bun.write(`${out}/home.css`, homeCss),
    cp("src/home/home.html", `${out}/home.html`),
    ...SITES.map((s) => Bun.write(`${out}/${s.name}.css`, siteCss(s))),
  ]);

  for (const target of TARGETS) {
    const dir = `dist/${target}`;
    if (dir !== out) await cp(out, dir, { recursive: true });
    await Bun.write(
      `${dir}/manifest.json`,
      JSON.stringify(manifest(target, pkg.version), null, 2),
    );
  }

  console.log(
    `Built ${TARGETS.join(" + ")} in ${Math.round(performance.now() - start)}ms`,
  );
}

await build();

if (dev) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch("src", { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(e)), 100);
  });
  console.log("Watching src/ for changes…");
}
