// Download queue: one job at a time, persisted to a JSON file in the download
// directory so it survives restarts (yt-dlp resumes its .part files).
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { jobKey, type AddJob, type Job } from "../src/lib/api";
import { decide, type Runner } from "./ytdlp";

export const STATE_FILE = ".anti-spoiler.json";

export type Queue = ReturnType<typeof createQueue>;

export function createQueue({
  dir,
  runner,
  now = Date.now,
  onChange,
}: {
  dir: string;
  runner: Runner;
  now?: () => number;
  /** Called on every state transition (for logging). */
  onChange?: (job: Job) => void;
}) {
  const jobs = new Map<string, Job>();
  let active:
    | { job: Job; abort: AbortController; done: Promise<void> }
    | undefined;
  let saving = Promise.resolve();

  const file = join(dir, STATE_FILE);
  const videoPath = (key: string) => join(dir, `${key}.mp4`);

  function save() {
    const data = JSON.stringify([...jobs.values()], null, 2);
    // Chained so concurrent saves can't interleave; rename makes each atomic.
    saving = saving.then(async () => {
      await Bun.write(`${file}.tmp`, data);
      await rename(`${file}.tmp`, file);
    });
    return saving;
  }

  function transition(job: Job, changes: Partial<Job>, persist = true) {
    Object.assign(job, changes);
    for (const k of Object.keys(changes) as (keyof Job)[])
      if (changes[k] === undefined) delete job[k];
    onChange?.(job);
    return persist ? save() : Promise.resolve();
  }

  async function deleteFiles(key: string) {
    // Keys are [\w-] only (KEY_RE), so they're safe inside a glob.
    for await (const f of new Bun.Glob(`${key}.*`).scan({ cwd: dir }))
      await rm(join(dir, f), { force: true });
  }

  async function runJob(job: Job, signal: AbortSignal) {
    const current = () => !signal.aborted && jobs.get(job.key) === job;
    try {
      await transition(job, { state: "probing" }, false);
      const probe = await runner.probe(job, signal);
      if (!current()) return;
      const next = decide(probe, job.minDuration, now());
      if (next.state === "waiting") return void (await transition(job, next));
      if (next.state === "skipped")
        return void (await transition(job, { state: "skipped" }));
      await transition(job, {
        state: "downloading",
        progress: 0,
        retryAt: undefined,
      });
      await runner.download(job, (p) => (job.progress = p), signal);
      if (!current()) return;
      await transition(job, { state: "done", progress: undefined });
    } catch (e) {
      if (!current()) return;
      await transition(job, {
        state: "failed",
        progress: undefined,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /** Starts the next runnable job, if nothing is running. */
  function pump() {
    if (active) return;
    const t = now();
    const next = [...jobs.values()]
      .sort((a, b) => a.addedAt - b.addedAt)
      .find(
        (j) =>
          j.state === "queued" ||
          (j.state === "waiting" && (j.retryAt ?? 0) <= t),
      );
    if (!next) return;
    const abort = new AbortController();
    const done = runJob(next, abort.signal).finally(() => {
      active = undefined;
      pump();
    });
    active = { job: next, abort, done };
  }

  return {
    /** Newest first. */
    list(): Job[] {
      return [...jobs.values()].sort((a, b) => b.addedAt - a.addedAt);
    },

    get: (key: string) => jobs.get(key),

    videoPath,

    pump,

    /** Resolves once nothing is running (for tests). */
    async idle() {
      while (active) await active.done;
    },

    async start() {
      const f = Bun.file(file);
      if (await f.exists()) {
        for (const job of (await f.json()) as Job[]) {
          if (
            job.state === "done" &&
            !(await Bun.file(videoPath(job.key)).exists())
          )
            continue;
          if (job.state === "probing" || job.state === "downloading") {
            job.state = "queued";
            delete job.progress;
          }
          jobs.set(job.key, job);
        }
      }
      await save();
      pump();
    },

    async add({ platform, id, minDuration }: AddJob): Promise<Job> {
      const key = jobKey(platform, id);
      const existing = jobs.get(key);
      if (existing) {
        if (existing.state === "failed" || existing.state === "skipped") {
          // A manual retry, or "download anyway": drop the rule's length limit.
          await transition(existing, {
            state: "queued",
            error: undefined,
            minDuration: undefined,
          });
        } else if (existing.state === "waiting") {
          await transition(existing, { retryAt: now() });
        }
        pump();
        return existing;
      }
      const job: Job = { key, platform, id, state: "queued", addedAt: now() };
      if (minDuration) job.minDuration = minDuration;
      jobs.set(key, job);
      await transition(job, {});
      pump();
      return job;
    },

    /** Cancels the job if it's running and deletes its files. */
    async remove(key: string): Promise<boolean> {
      const job = jobs.get(key);
      if (!job) return false;
      jobs.delete(key);
      await save();
      if (active?.job === job) {
        active.abort.abort();
        await active.done;
      }
      await deleteFiles(key);
      return true;
    },
  };
}
