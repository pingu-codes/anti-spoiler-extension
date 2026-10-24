import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Job } from "../src/lib/api";
import { createQueue, STATE_FILE } from "./queue";
import type { Probe, Runner } from "./ytdlp";

let dir: string;
let now: number;
let probes: Record<string, Probe | Error>;
let calls: string[];

const VOD: Probe = { liveStatus: "was_live", duration: 3600, release: null };

const runner: Runner = {
  async probe(job) {
    calls.push(`probe ${job.id}`);
    const p = probes[job.id] ?? VOD;
    if (p instanceof Error) throw p;
    return p;
  },
  async download(job, onProgress) {
    calls.push(`download ${job.id}`);
    onProgress(50);
    await Bun.write(join(dir, `${job.key}.mp4`), "video");
  },
};

const queue = (r = runner) => createQueue({ dir, runner: r, now: () => now });
const saved = async () =>
  (await Bun.file(join(dir, STATE_FILE)).json()) as Job[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "anti-spoiler-"));
  now = 1_800_000_000_000;
  probes = {};
  calls = [];
});
afterEach(() => rm(dir, { recursive: true, force: true }));

test("downloads a queued job and persists it", async () => {
  const q = queue();
  await q.start();
  await q.add({ platform: "youtube", id: "aaaaaaaaaaa" });
  await q.idle();
  expect(q.get("youtube-aaaaaaaaaaa")).toMatchObject({ state: "done" });
  expect(q.get("youtube-aaaaaaaaaaa")!.progress).toBeUndefined();
  expect(calls).toEqual(["probe aaaaaaaaaaa", "download aaaaaaaaaaa"]);
  expect(await saved()).toMatchObject([
    { key: "youtube-aaaaaaaaaaa", state: "done" },
  ]);
});

test("adding a key twice doesn't duplicate it", async () => {
  const q = queue();
  await q.start();
  await q.add({ platform: "twitch", id: "123" });
  await q.add({ platform: "twitch", id: "123" });
  await q.idle();
  expect(q.list()).toHaveLength(1);
  expect(calls.filter((c) => c.startsWith("download"))).toHaveLength(1);
});

test("live videos wait and are probed again later", async () => {
  probes["aaaaaaaaaaa"] = {
    liveStatus: "is_live",
    duration: null,
    release: null,
  };
  const q = queue();
  await q.start();
  await q.add({ platform: "youtube", id: "aaaaaaaaaaa" });
  await q.idle();
  expect(q.get("youtube-aaaaaaaaaaa")).toMatchObject({
    state: "waiting",
    retryAt: now + 15 * 60_000,
  });

  q.pump();
  await q.idle();
  expect(calls).toEqual(["probe aaaaaaaaaaa"]);

  delete probes["aaaaaaaaaaa"];
  now += 15 * 60_000;
  q.pump();
  await q.idle();
  expect(q.get("youtube-aaaaaaaaaaa")!.state).toBe("done");
  expect(q.get("youtube-aaaaaaaaaaa")!.retryAt).toBeUndefined();
});

test("short videos are skipped; adding again downloads anyway", async () => {
  probes["aaaaaaaaaaa"] = { ...VOD, duration: 600 };
  const q = queue();
  await q.start();
  await q.add({ platform: "youtube", id: "aaaaaaaaaaa", minDuration: 1800 });
  await q.idle();
  expect(q.get("youtube-aaaaaaaaaaa")!.state).toBe("skipped");

  await q.add({ platform: "youtube", id: "aaaaaaaaaaa" });
  await q.idle();
  const job = q.get("youtube-aaaaaaaaaaa")!;
  expect(job.state).toBe("done");
  expect(job.minDuration).toBeUndefined();
});

test("failures keep the error; adding again retries", async () => {
  probes["aaaaaaaaaaa"] = new Error(
    "ERROR: [youtube] aaaaaaaaaaa: Private video",
  );
  const q = queue();
  await q.start();
  await q.add({ platform: "youtube", id: "aaaaaaaaaaa" });
  await q.idle();
  expect(q.get("youtube-aaaaaaaaaaa")).toMatchObject({
    state: "failed",
    error: "ERROR: [youtube] aaaaaaaaaaa: Private video",
  });

  delete probes["aaaaaaaaaaa"];
  await q.add({ platform: "youtube", id: "aaaaaaaaaaa" });
  await q.idle();
  expect(q.get("youtube-aaaaaaaaaaa")!.state).toBe("done");
  expect(q.get("youtube-aaaaaaaaaaa")!.error).toBeUndefined();
});

test("restart requeues unfinished jobs and drops missing files", async () => {
  const jobs: Job[] = [
    {
      key: "twitch-1",
      platform: "twitch",
      id: "1",
      state: "downloading",
      progress: 40,
      addedAt: 1,
    },
    { key: "twitch-2", platform: "twitch", id: "2", state: "done", addedAt: 2 },
    { key: "twitch-3", platform: "twitch", id: "3", state: "done", addedAt: 3 },
  ];
  await Bun.write(join(dir, STATE_FILE), JSON.stringify(jobs));
  await Bun.write(join(dir, "twitch-3.mp4"), "video");

  const q = queue();
  await q.start();
  await q.idle();
  expect(q.list().map((j) => [j.key, j.state])).toEqual([
    ["twitch-3", "done"],
    ["twitch-1", "done"],
  ]);
  expect(calls).toEqual(["probe 1", "download 1"]);
});

test("removing a running job cancels it and deletes its files", async () => {
  let started!: () => void;
  const running = new Promise<void>((r) => (started = r));
  const slow: Runner = {
    ...runner,
    async download(job, _, signal) {
      await Bun.write(join(dir, `${job.key}.f137.mp4.part`), "partial");
      started();
      await new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("Cancelled"))),
      );
    },
  };
  await Bun.write(join(dir, "youtube-aaaaaaaaaab.mp4"), "someone else's");
  const q = queue(slow);
  await q.start();
  await q.add({ platform: "youtube", id: "aaaaaaaaaaa" });
  await running;
  expect(q.get("youtube-aaaaaaaaaaa")!.state).toBe("downloading");

  expect(await q.remove("youtube-aaaaaaaaaaa")).toBe(true);
  expect(q.get("youtube-aaaaaaaaaaa")).toBeUndefined();
  expect((await readdir(dir)).sort()).toEqual([
    STATE_FILE,
    "youtube-aaaaaaaaaab.mp4",
  ]);
  expect(await saved()).toEqual([]);
  expect(await q.remove("youtube-aaaaaaaaaaa")).toBe(false);
});
