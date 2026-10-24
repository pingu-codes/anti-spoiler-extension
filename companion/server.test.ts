import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { API_HEADER, type StateResponse } from "../src/lib/api";
import { createQueue } from "./queue";
import { createHandler } from "./server";
import type { Runner } from "./ytdlp";

const TOKEN = "test-token";
const KEY = "youtube-aaaaaaaaaaa";

let dir: string;
let server: ReturnType<typeof Bun.serve>;
let handle: (req: Request) => Promise<Response>;
let base: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "anti-spoiler-"));
  const runner: Runner = {
    probe: async () => ({
      liveStatus: "not_live",
      duration: 60,
      release: null,
    }),
    download: async (job) => {
      await Bun.write(join(dir, `${job.key}.mp4`), "0123456789");
    },
  };
  const queue = createQueue({ dir, runner });
  await queue.start();
  await queue.add({ platform: "youtube", id: "aaaaaaaaaaa" });
  await queue.idle();

  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (req) => handle(req),
  });
  base = `http://127.0.0.1:${server.port}`;
  handle = createHandler({
    queue,
    token: TOKEN,
    port: server.port!,
    info: { version: "test", ytdlp: "2026.01.01", ffmpeg: true, dir },
  });
});

afterAll(async () => {
  server.stop(true);
  await rm(dir, { recursive: true, force: true });
});

const api = (path: string, init: RequestInit = {}) =>
  fetch(base + path, {
    ...init,
    headers: { [API_HEADER]: "1", ...(init.headers as object) },
  });

describe("access", () => {
  test("rejects other Host headers (DNS rebinding)", async () => {
    const res = await handle(
      new Request(`${base}/api/state`, {
        headers: { host: `evil.test:${server.port}`, [API_HEADER]: "1" },
      }),
    );
    expect(res.status).toBe(403);
  });

  test("/api needs the custom header", async () => {
    expect((await fetch(`${base}/api/state`)).status).toBe(403);
    expect((await api("/api/state")).status).toBe(200);
  });

  test("CORS preflight only succeeds for extension origins", async () => {
    const preflight = (origin: string) =>
      fetch(`${base}/api/state`, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": API_HEADER,
        },
      });
    for (const origin of [
      "moz-extension://0b1e4b5c-1234-4cde-9abc-def012345678",
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    ]) {
      const res = await preflight(origin);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
        API_HEADER,
      );
    }
    const evil = await preflight("https://evil.test");
    expect(evil.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("api", () => {
  test("state lists jobs with a playable src once done", async () => {
    const state = (await (await api("/api/state")).json()) as StateResponse;
    expect(state.ytdlp).toBe("2026.01.01");
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0]!.src).toBe(`${base}/files/${KEY}?t=${TOKEN}`);
  });

  test("POST validates the body", async () => {
    const post = (body: unknown) =>
      api("/api/downloads", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
    expect((await post({ platform: "youtube", id: "--exec=ls" })).status).toBe(
      400,
    );
    expect((await post({ platform: "vimeo", id: "1" })).status).toBe(400);
    expect((await post({ url: "https://example.com" })).status).toBe(400);
    const res = await post({ platform: "youtube", id: "aaaaaaaaaaa" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ key: KEY, state: "done" });
  });

  test("DELETE checks the key", async () => {
    expect(
      (await api("/api/downloads/..%2Fx", { method: "DELETE" })).status,
    ).toBe(400);
    expect(
      (await api("/api/downloads/twitch-9", { method: "DELETE" })).status,
    ).toBe(404);
  });
});

describe("files", () => {
  test("need the token", async () => {
    expect((await fetch(`${base}/files/${KEY}`)).status).toBe(403);
    expect((await fetch(`${base}/files/${KEY}?t=wrong`)).status).toBe(403);
    expect((await fetch(`${base}/files/twitch-9?t=${TOKEN}`)).status).toBe(404);
  });

  test("serve the video", async () => {
    const res = await fetch(`${base}/files/${KEY}?t=${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(await res.text()).toBe("0123456789");
  });

  test("answer Range requests, so the player can seek", async () => {
    const res = await fetch(`${base}/files/${KEY}?t=${TOKEN}`, {
      headers: { Range: "bytes=2-5" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(await res.text()).toBe("2345");
  });
});
