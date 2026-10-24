# anti-spoiler-ext

A browser extension that prevents spoilers while watching sports or other content on youtube/twitch.

Frontend uses svelte styled with tailwindcss.

Should work for both firefox and chromium.

Use `bun fmt` for formatting.

## Features

These are default on but individually toggleable:

- Removes the rendering of thumbnails on youtube / twitch and replaces them with blank images.
- Removes the titles of youtube / twitch vods/videos and replaces them with the channel name and a hash of the title, e.g. `Caedrel · #d22c00a9` (prevents spoilers from titles)
- Hides your current watch progress / watching bar and any timestamps
- Adds easier to use back/forwards (10 seconds, 1 minute, 10 minutes) navigation controls

The toolbar popup has a toggle for each feature, plus a master switch. Changes
apply to open tabs right away.

### Home page and downloads

**Open home** in the popup opens a page that lists recent videos from your
favourite YouTube and Twitch channels (e.g. `@LCK`, `twitch.tv/riotgames`).
The page follows the same settings, so it shows hashed titles, blank tiles and
no durations. From there you can pre-download VODs and watch them in a
built-in player. The player has no seek bar and no time display, only the skip
buttons, and it remembers where you stopped. This is especially handy for
Twitch, where past broadcasts expire.

Downloads go through a small local companion server that runs yt-dlp:

```sh
brew install yt-dlp deno ffmpeg   # yt-dlp needs Deno for YouTube
bun run companion                 # keep it running while you use downloads
```

Videos are saved to `~/Movies/Anti-Spoiler` as `<platform>-<id>.mp4`, so the
folder doesn't show titles. The companion accepts two environment variables:

- `ANTI_SPOILER_DIR` changes where videos are saved.
- `YTDLP_ARGS` passes extra flags to yt-dlp, split on spaces. For example,
  `YTDLP_ARGS="--cookies-from-browser firefox"` helps if YouTube asks yt-dlp
  to sign in.

Each channel's **⋯** menu has these options:

- **Show** (YouTube channels): full broadcasts, uploads or both.
  - Full broadcasts are safest for esports, because one upload per game gives
    away how long a series went.
- **Auto-download new videos**: queues new videos published after you switch
  it on. It checks every 30 minutes while the browser is open, and you can
  also press **Check rules now**. It has two optional filters:
  - a minimum length, checked by the companion so it's never shown;
  - title keywords.

To have the companion start at login, point a launchd agent at
`bun companion/index.ts` in this folder.

## Development

```sh
bun install       # deps are pinned; `bun install --offline` works from a warm cache
bun run build     # minified build → dist/chrome, dist/firefox
bun run dev       # unminified + source maps, rebuilds on changes in src/
bun run check     # typecheck
bun test          # unit tests (feeds, channel input, rules, companion)
bun run companion # local download server for the home page
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
    titles.ts     title → channel + hash label, tooltips, tab title
    controls.ts   mounts Controls.svelte into the player (shadow DOM)
    run.ts        wires settings to the features
  popup/        settings popup (Svelte + Tailwind)
  home/         home page: favourites, feeds, downloads, player (#watch/<key>)
  background/   runs auto-download rules on an alarm
  lib/          settings and favourites storage, feeds, hashing,
                companion client, WebExtension API shim
companion/      local Bun server that runs yt-dlp and serves the files
```

- **Hiding is CSS-first.** Each site gets a stylesheet, generated from its
  selectors in `src/sites/`, that the manifest injects at `document_start`, so
  spoilers never paint. Every rule is on unless the content script lists that
  feature in `data-anti-spoiler-off` on `<html>`, so if the script is slow or
  broken, things stay hidden.
- **Thumbnails** get `filter: contrast(0)`, which turns any image into a flat
  grey tile without changing layout. Hover previews are removed.
- **Titles** keep their text, which is hidden with `visibility: hidden`, and
  a label is drawn over the same box by a `::before` pseudo-element. The
  content script only sets a `data-anti-spoiler-label` attribute, so YouTube's
  and Twitch's frameworks never see their DOM change. The label is the channel
  name plus a hash of the title (FNV-1a), e.g. `Caedrel · #d22c00a9`. The hash
  is stable, so the same video shows the same label on every page. Each site's
  `channels` config says where to find a title's channel (e.g. the card's
  channel link). If no channel is found, the label is just the hash. `title`
  tooltips and the tab title on video pages are swapped for the label too, and
  restored when the feature is turned off.
- **Skip controls** show on YouTube watch/live/embed pages and Twitch VODs
  (`/videos/…`), only when the video has a finite duration. They live in a
  closed shadow root inside the player, so they also work in fullscreen. They
  set `video.currentTime` and stop one second before the end, so the end screen
  doesn't appear. Svelte is compiled with `fragments: "tree"` because YouTube enforces
  Trusted Types, which blocks `innerHTML`.
- **Feeds** come from YouTube's public RSS feeds and Twitch's web GraphQL API
  (unofficial, with Twitch's own client id). No API keys are needed.
  - For YouTube, each channel's auto-generated playlists are used: `UULF…` for
    uploads without Shorts, and `UULV…` for past streams.
  - The feed parser reads titles, dates and thumbnails only. Descriptions
    often narrate results and view counts hint at the big games, so they're
    never parsed.
  - It uses regexes because the background service worker has no
    `DOMParser`.
- **The companion** (`companion/`) is the only part that downloads.
  - **Job flow:** the extension sends `{platform, id}` and the companion
    builds the URL itself. It probes the video first. Live or upcoming videos
    wait and are re-checked every 15 minutes. Videos shorter than a rule's
    minimum are skipped. Everything else downloads one at a time as h264/AAC
    mp4, which plays in both browsers.
  - **What it never records:** it doesn't keep titles or log yt-dlp's output,
    and it never embeds chapters or metadata.
  - **Who can use it:** only this extension.
    - It listens on 127.0.0.1 and rejects other `Host` headers, which blocks
      DNS rebinding.
    - `/api` requires an `X-Anti-Spoiler` header. Web pages can't send that
      header cross-origin, because the CORS preflight only succeeds for
      extension origins.
    - `<video>` can't send headers, so files are served with a per-run token
      instead.

### When a site changes its markup

Selectors live in `src/sites/youtube.ts` and `src/sites/twitch.ts`. A selector
that stops matching does nothing, so the fix is usually to add the new
selector next to the old one and rebuild.

`samples/` holds saved page HTML (e.g. `samples/twitch.html`, a VOD page) for
checking selectors against real markup. Twitch's class names are generated by
styled-components and change between deploys, so prefer `data-a-target`
attributes, semantic tags (`article`, `h4`) or the few stable class names
(`.channel-info-content`, `.timestamp-metadata__bar`).

## Known gaps

- The Twitch VOD-page selectors have been checked against `samples/twitch.html`.
  The YouTube selectors and other Twitch pages (live, directory, search)
  haven't been checked against real markup yet.
- The Twitch VOD title relies on `:has()`, so the minimum Firefox version is 121.
- Twitch card stats hide views and upload date along with the duration.
- 7TV's VOD chat timestamps are hidden. Twitch's own VOD chat timestamps
  haven't been checked.
- Descriptions, comments, chat messages and the OS media controls (Media Session
  metadata) aren't touched.
- On Twitch, seeking writes to the `<video>` element directly; if Twitch's
  player ignores that, it would need a main-world script to use the player's
  own seek API.
- Home page and downloads:
  - YouTube feeds only include each playlist's 15 most recent videos.
  - A past stream's `published` date is when the stream was created, so a
    stream scheduled before you switched on an auto rule won't be auto-queued.
    Download it by hand.
  - Finder shows file sizes in the download folder, and a size hints at a
    VOD's length.
  - The player sets the OS media controls (macOS Now Playing) to the hashed
    title and tries to hide the length. Whether the scrubber disappears
    depends on the browser and OS.
  - The Twitch feed uses an unofficial API. If Twitch changes it, the channel
    shows an error on the home page.
