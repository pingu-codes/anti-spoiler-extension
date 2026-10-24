---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Build with `bun run build` (no Vite; see `scripts/build.ts`), typecheck with `bun run check`, format with `bun fmt`.
- Site selectors live in `src/sites/`; see README "How it works" before changing how hiding works.
- Dependencies are pinned. Prefer `bun install --offline` / `--prefer-offline`, because downloads are slow here.
