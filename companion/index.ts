// Local companion for the extension's home page: downloads VODs with yt-dlp
// and serves them to its spoiler-free player. Listens on 127.0.0.1 only.
//
//   ANTI_SPOILER_DIR  where videos go (default ~/Movies/Anti-Spoiler)
//   YTDLP_ARGS        extra yt-dlp flags, e.g. "--cookies-from-browser firefox"
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import pkg from "../package.json";
import { COMPANION_PORT } from "../src/lib/api";
import { createQueue } from "./queue";
import { createHandler } from "./server";
import { ytdlpRunner } from "./ytdlp";

const dir =
  process.env.ANTI_SPOILER_DIR ?? join(homedir(), "Movies", "Anti-Spoiler");
const extraArgs = (process.env.YTDLP_ARGS ?? "").split(/\s+/).filter(Boolean);

await mkdir(dir, { recursive: true });

const bin = Bun.which("yt-dlp");
const ytdlp = bin
  ? Bun.spawnSync([bin, "--version"]).stdout.toString().trim() || null
  : null;
const ffmpeg = Bun.which("ffmpeg") !== null;

const queue = createQueue({
  dir,
  runner: ytdlpRunner({ bin: bin ?? "yt-dlp", dir, extraArgs }),
  // Keys only: yt-dlp's own output would print titles.
  onChange: (job) =>
    console.log(`${job.key} ${job.state}${job.error ? `: ${job.error}` : ""}`),
});
await queue.start();
// Wakes jobs waiting for a live stream or premiere to finish.
setInterval(queue.pump, 60_000);

Bun.serve({
  hostname: "127.0.0.1",
  port: COMPANION_PORT,
  fetch: createHandler({
    queue,
    token: crypto.randomUUID(),
    port: COMPANION_PORT,
    info: { version: pkg.version, ytdlp, ffmpeg, dir },
  }),
});

console.log(`Anti-Spoiler companion on http://127.0.0.1:${COMPANION_PORT}`);
console.log(`Saving to ${dir}`);
if (!ytdlp) console.warn("yt-dlp not found: brew install yt-dlp deno");
if (!ffmpeg) console.warn("ffmpeg not found: brew install ffmpeg");
