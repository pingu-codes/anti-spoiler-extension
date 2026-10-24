# anti-spoiler-ext

A browser extension that prevents spoilers while watching sports or other content on youtube/twitch.

Frontend uses svelte styled with tailwindcss.

Should work for both firefox and chromium.

Use `bun fmt` for formatting.

## Features

These are default on but individually toggleable:

- Removes the rendering of thumbnails on youtube / twitch and replaces them with blank images.
- Removes the titles of youtube / twitch vods/videos and replaces them with a hash of the title (prevents spoilers from titles)
- Hides your current watch progress / watching bar and any timestamps
- Adds easier to use back/forwards (10 seconds, 1 minute, 10 minutes) navigation controls

The toolbar popup has a toggle for each feature, plus a master switch. Changes
apply to open tabs right away.

## Development

```sh
bun install       # deps are pinned; `bun install --offline` works from a warm cache
bun run build     # minified build → dist/chrome, dist/firefox
bun run dev       # unminified + source maps, rebuilds on changes in src/
bun run check     # typecheck
bun fmt           # prettier (with svelte + tailwind plugins)
```

Load the unpacked extension:

- **Chromium**: `chrome://extensions` → Developer mode → Load unpacked → `dist/chrome`
- **Firefox**: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `dist/firefox/manifest.json`

There is no Vite: `scripts/build.ts` uses `Bun.build` with a small Svelte
plugin (`scripts/svelte.ts`) and compiles Tailwind directly via
`@tailwindcss/node` (`scripts/tailwind.ts`). The two targets differ only in
`manifest.json` (`scripts/manifest.ts`).

## How it works

```
src/
  sites/        per-site selectors and rules (youtube.ts, twitch.ts)
  content/      content scripts
    css.ts        build-time generator for each site's static stylesheet
    titles.ts     title → hash, tooltips, tab title
    controls.ts   mounts Controls.svelte into the player (shadow DOM)
    run.ts        wires settings to the features
  popup/        settings popup (Svelte + Tailwind)
  lib/          settings storage, hashing, WebExtension API shim
```

- **Hiding is CSS-first.** Each site gets a stylesheet, generated from its
  selectors in `src/sites/`, that the manifest injects at `document_start`, so
  spoilers never paint. Every rule is on unless the content script lists that
  feature in `data-anti-spoiler-off` on `<html>`, so if the script is slow or
  broken, things stay hidden.
- **Thumbnails** get `filter: contrast(0)`, which turns any image into a flat
  grey tile without changing layout. Hover previews are removed.
- **Titles** keep their text, which is hidden with `visibility: hidden`, and
  the hash is drawn over the same box by a `::before` pseudo-element. The content script only
  sets a `data-anti-spoiler-hash` attribute, so YouTube's and Twitch's
  frameworks never see their DOM change. The hash (FNV-1a, e.g. `#c185f46e`)
  is stable, so the same video shows the same hash on every page. `title`
  tooltips and the tab title on video pages are swapped for the hash too, and
  restored when the feature is turned off.
- **Skip controls** show on YouTube watch/live/embed pages and Twitch VODs
  (`/videos/…`), only when the video has a finite duration. They live in a
  closed shadow root inside the player, so they also work in fullscreen. They
  set `video.currentTime` and stop one second before the end, so the end screen
  doesn't appear. Svelte is compiled with `fragments: "tree"` because YouTube enforces
  Trusted Types, which blocks `innerHTML`.

### When a site changes its markup

Selectors live in `src/sites/youtube.ts` and `src/sites/twitch.ts`. A selector
that stops matching does nothing, so the fix is usually to add the new
selector next to the old one and rebuild.

## Known gaps

- Selectors haven't been checked against the live sites in a browser yet,
  especially Twitch's.
- Descriptions, comments, chat and the OS media controls (Media Session
  metadata) aren't touched.
- On Twitch, seeking writes to the `<video>` element directly; if Twitch's
  player ignores that, it would need a main-world script to use the player's
  own seek API.
- Thumbnails are hidden but still downloaded. Blocking them with
  `declarativeNetRequest` would save bandwidth.
