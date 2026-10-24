import { compile, optimize } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { dirname, resolve } from "node:path";

/**
 * Compiles a Tailwind entry stylesheet. With `shadow`, the output is adapted
 * for a shadow root inside someone else's page:
 * - `@property` is ignored in shadow roots, so the defaults it registers are
 *   declared as plain custom properties instead.
 * - rem is relative to the host page's root font size, so it becomes px.
 */
export async function tailwind(
  entry: string,
  { minify = true, shadow = false } = {},
) {
  const path = resolve(entry);
  const compiler = await compile(await Bun.file(path).text(), {
    base: dirname(path),
    from: path,
    onDependency() {},
  });
  const candidates = new Scanner({ sources: compiler.sources }).scan();
  let css = compiler.build(candidates);

  if (shadow) {
    const defaults: string[] = [];
    css = css.replace(
      /@property\s+(--[\w-]+)\s*\{([^}]*)\}/g,
      (_, name, body) => {
        const initial = /initial-value:\s*([^;]+)/.exec(body)?.[1]?.trim();
        if (initial) defaults.push(`${name}: ${initial};`);
        return "";
      },
    );
    if (defaults.length) {
      css = `@layer properties { :host, *, ::before, ::after, ::backdrop { ${defaults.join(" ")} } }\n${css}`;
    }
    css = css.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => `${+n * 16}px`);
  }

  return optimize(css, { minify }).code;
}
