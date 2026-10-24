// HTTP API for the extension. Only the extension can use it:
// - the Host header must be the loopback address (blocks DNS rebinding),
// - /api needs a custom header, which a web page can't send cross-origin
//   because the CORS preflight only succeeds for extension origins,
// - /files needs a per-run token, handed out in /api/state.
import {
  API_HEADER,
  isAddJob,
  KEY_RE,
  type Job,
  type StateResponse,
} from "../src/lib/api";
import type { Queue } from "./queue";

const EXTENSION_ORIGIN = /^(chrome|moz)-extension:\/\/[\w-]+$/;

export interface Info {
  version: string;
  ytdlp: string | null;
  ffmpeg: boolean;
  dir: string;
}

export function createHandler({
  queue,
  token,
  port,
  info,
}: {
  queue: Queue;
  token: string;
  port: number;
  info: Info;
}) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const view = (job: Job) =>
    job.state === "done"
      ? {
          ...job,
          src: `http://127.0.0.1:${port}/files/${job.key}?t=${token}`,
        }
      : job;

  return async function handle(req: Request): Promise<Response> {
    if (!hosts.has(req.headers.get("host") ?? ""))
      return new Response("Forbidden", { status: 403 });

    const origin = req.headers.get("origin");
    const headers: Record<string, string> = { Vary: "Origin" };
    if (origin && EXTENSION_ORIGIN.test(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Headers"] = `${API_HEADER}, Content-Type`;
      headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE";
    }
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers });
    const fail = (error: string, status: number) => json({ error }, status);

    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });

    const { pathname, searchParams } = new URL(req.url);
    const [, area, resource, key] = pathname.split("/");

    // <video> can't send headers, so files use the token instead.
    if (area === "files" && req.method === "GET") {
      const job = resource && KEY_RE.test(resource) && queue.get(resource);
      if (searchParams.get("t") !== token) return fail("Bad token", 403);
      if (!job || job.state !== "done") return fail("Not found", 404);
      // Bun answers Range requests for file responses itself (206).
      return new Response(Bun.file(queue.videoPath(job.key)), {
        headers: { "Content-Type": "video/mp4", "Cache-Control": "no-store" },
      });
    }

    if (area !== "api") return fail("Not found", 404);
    if (req.headers.get(API_HEADER) !== "1")
      return fail(`Missing ${API_HEADER} header`, 403);

    switch (`${req.method} ${resource}${key ? "/:key" : ""}`) {
      case "GET state": {
        const state: StateResponse = { ...info, jobs: queue.list().map(view) };
        return json(state);
      }
      case "POST downloads": {
        const body = await req.json().catch(() => null);
        if (!isAddJob(body)) return fail("Expected {platform, id}", 400);
        return json(view(await queue.add(body)));
      }
      case "DELETE downloads/:key": {
        if (!KEY_RE.test(key!)) return fail("Bad key", 400);
        return (await queue.remove(key!))
          ? new Response(null, { status: 204, headers })
          : fail("Not found", 404);
      }
    }
    return fail("Not found", 404);
  };
}
