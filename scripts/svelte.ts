import type { BunPlugin } from "bun";
import { compile } from "svelte/compiler";

export const svelte = ({ dev }: { dev: boolean }): BunPlugin => ({
  name: "svelte",
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const { js, warnings } = compile(await Bun.file(path).text(), {
        filename: path,
        dev,
        css: "injected",
        discloseVersion: false,
        // Build DOM with createElement rather than innerHTML: YouTube enforces
        // Trusted Types, which would reject innerHTML from the content script.
        fragments: "tree",
      });
      for (const w of warnings) console.warn(`${path}: ${w.message}`);
      return { contents: js.code, loader: "js" };
    });

    // Svelte gates dev-only code on `esm-env` imports, which Bun doesn't inline
    // across modules. Turning them into local constants lets the minifier drop
    // those branches (roughly halves the bundle).
    const env: Record<string, boolean> = {
      DEV: dev,
      BROWSER: true,
      NODE: false,
    };
    build.onLoad(
      { filter: /[\\/]node_modules[\\/]svelte[\\/]src[\\/].*\.js$/ },
      async ({ path }) => {
        const code = (await Bun.file(path).text()).replace(
          /import\s*\{([^}]*)\}\s*from\s*["']esm-env["'];?/g,
          (_, names: string) =>
            names
              .split(",")
              .map((n) => n.trim())
              .filter(Boolean)
              .map((n) => {
                const [name, alias = name] = n.split(/\s+as\s+/) as [
                  string,
                  string?,
                ];
                return `const ${alias} = ${env[name]};`;
              })
              .join("\n"),
        );
        return { contents: code, loader: "js" };
      },
    );
  },
});
