// Everything that knows about yt-dlp's command line and output. Titles never
// leave this module: output files are named by key, and only progress and
// the probe line are parsed from stdout.
import { join } from "node:path";
import { videoUrl, type Job } from "../src/lib/api";

export interface Probe {
  /** yt-dlp's live_status: is_live, is_upcoming, post_live, was_live, not_live. */
  liveStatus: string | null;
  /** Seconds. */
  duration: number | null;
  /** Unix seconds; when an upcoming stream or premiere starts. */
  release: number | null;
}

/** Does the actual work for the queue; tests swap in a fake. */
export interface Runner {
  probe(job: Job, signal: AbortSignal): Promise<Probe>;
  download(
    job: Job,
    onProgress: (percent: number) => void,
    signal: AbortSignal,
  ): Promise<void>;
}

const PROGRESS = "ASP ";

export function probeArgs(url: string, extra: string[] = []) {
  return [
    ...extra,
    "--no-warnings",
    "--no-playlist",
    // Upcoming streams have no formats yet; still read their metadata.
    "--ignore-no-formats-error",
    "--print",
    "%(live_status)s|%(duration)s|%(release_timestamp)s",
    "--",
    url,
  ];
}

// No --embed-* or --write-* flags: chapters, descriptions and metadata are
// all spoilers.
export function downloadArgs(
  url: string,
  dir: string,
  key: string,
  extra: string[] = [],
) {
  return [
    ...extra,
    "--no-warnings",
    "--no-playlist",
    "--newline",
    "--progress-template",
    `download:${PROGRESS}%(progress._percent_str)s`,
    // h264 + AAC in mp4 plays in every browser.
    "-S",
    "vcodec:h264,res:1080,acodec:m4a",
    "--merge-output-format",
    "mp4",
    "--remux-video",
    "mp4",
    // Parallel fragments; speeds up Twitch's HLS a lot.
    "-N",
    "8",
    "-P",
    dir,
    "-o",
    `${key}.%(ext)s`,
    "--",
    url,
  ];
}

export function parseProbe(line: string): Probe | null {
  const parts = line.trim().split("|");
  if (parts.length !== 3) return null;
  const [live, duration, release] = parts;
  const num = (s?: string) => {
    const n = Number(s);
    return s && s !== "NA" && Number.isFinite(n) ? n : null;
  };
  return {
    liveStatus: live && live !== "NA" ? live : null,
    duration: num(duration),
    release: num(release),
  };
}

export function parseProgress(line: string): number | null {
  if (!line.startsWith(PROGRESS)) return null;
  const m = /([\d.]+)%/.exec(line);
  return m ? Math.min(100, Number(m[1])) : null;
}

const RECHECK_MS = 15 * 60_000;
const NOT_READY = new Set(["is_live", "is_upcoming", "post_live"]);

export type Decision =
  | { state: "waiting"; retryAt: number }
  | { state: "skipped" }
  | { state: "downloading" };

export function decide(
  probe: Probe,
  minDuration: number | undefined,
  now: number,
): Decision {
  if (probe.liveStatus && NOT_READY.has(probe.liveStatus)) {
    const release = (probe.release ?? 0) * 1000;
    return { state: "waiting", retryAt: Math.max(now + RECHECK_MS, release) };
  }
  if (minDuration && probe.duration !== null && probe.duration < minDuration)
    return { state: "skipped" };
  return { state: "downloading" };
}

async function readLines(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
) {
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of stream) {
    const lines = (rest + decoder.decode(chunk, { stream: true })).split(
      /\r\n|\r|\n/,
    );
    rest = lines.pop() ?? "";
    for (const l of lines) if (l) onLine(l);
  }
  if (rest) onLine(rest);
}

async function run(
  bin: string,
  args: string[],
  onLine: (line: string) => void,
  signal: AbortSignal,
) {
  const proc = Bun.spawn([bin, ...args], { stdout: "pipe", stderr: "pipe" });
  const kill = () => proc.kill();
  signal.addEventListener("abort", kill);
  let error = "";
  try {
    await Promise.all([
      readLines(proc.stdout, onLine),
      readLines(proc.stderr, (l) => {
        if (l.startsWith("ERROR:")) error = l.slice(0, 300);
      }),
    ]);
    const code = await proc.exited;
    if (signal.aborted) throw new Error("Cancelled");
    if (code !== 0) throw new Error(error || `yt-dlp exited with ${code}`);
  } finally {
    signal.removeEventListener("abort", kill);
  }
}

export function ytdlpRunner({
  bin,
  dir,
  extraArgs = [],
}: {
  bin: string;
  dir: string;
  extraArgs?: string[];
}): Runner {
  return {
    async probe(job, signal) {
      let probe: Probe | null = null;
      const url = videoUrl(job.platform, job.id);
      await run(
        bin,
        probeArgs(url, extraArgs),
        (l) => (probe ??= parseProbe(l)),
        signal,
      );
      if (!probe) throw new Error("Couldn't read the video's details");
      return probe;
    },

    async download(job, onProgress, signal) {
      const url = videoUrl(job.platform, job.id);
      await run(
        bin,
        downloadArgs(url, dir, job.key, extraArgs),
        (l) => {
          const p = parseProgress(l);
          if (p !== null) onProgress(p);
        },
        signal,
      );
      if (!(await Bun.file(join(dir, `${job.key}.mp4`)).exists()))
        throw new Error("yt-dlp finished without producing an mp4");
    },
  };
}
