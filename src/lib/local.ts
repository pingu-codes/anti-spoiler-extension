// Per-video state in storage.local. One key per video where both the home
// page and the background write, so neither overwrites the other.
import { jobKey } from "./api";
import { ext } from "./browser";
import type { Video } from "./feeds";

/** Saved when a download is queued, so it keeps its title after leaving the feed. */
export type VideoMeta = Pick<Video, "title" | "channelName" | "published">;

const metaKey = (key: string) => `meta:${key}`;
const resumeKey = (key: string) => `resume:${key}`;

export function saveMeta(v: Video) {
  const meta: VideoMeta = {
    title: v.title,
    channelName: v.channelName,
    published: v.published,
  };
  return ext.storage.local.set({ [metaKey(jobKey(v.platform, v.id))]: meta });
}

export async function loadMeta(keys: string[]) {
  if (!keys.length) return {};
  const stored = await ext.storage.local.get(keys.map(metaKey));
  const out: Record<string, VideoMeta> = {};
  for (const k of keys) {
    const m = stored[metaKey(k)];
    if (m) out[k] = m as VideoMeta;
  }
  return out;
}

export const removeMeta = (key: string) =>
  ext.storage.local.remove([metaKey(key), resumeKey(key)]);

export async function loadResume(key: string): Promise<number> {
  const t = (await ext.storage.local.get(resumeKey(key)))[resumeKey(key)];
  return typeof t === "number" ? t : 0;
}

export const saveResume = (key: string, seconds: number) =>
  ext.storage.local.set({ [resumeKey(key)]: seconds });

export const clearResume = (key: string) =>
  ext.storage.local.remove(resumeKey(key));

async function loadList(name: string): Promise<string[]> {
  const v = (await ext.storage.local.get(name))[name];
  return Array.isArray(v) ? v : [];
}

// Bounded so they don't grow forever; the oldest entries drop off.
const saveList = (name: string, list: string[]) =>
  ext.storage.local.set({ [name]: list.slice(-2000) });

/** Videos that have been opened, keyed by `jobKey`. */
export const loadSeen = () => loadList("seen");

export async function markSeen(key: string) {
  const seen = await loadSeen();
  if (!seen.includes(key)) await saveList("seen", [...seen, key]);
}

/** Videos auto rules already queued, so deleting a download doesn't re-queue it. */
export const loadAutoQueued = () => loadList("autoQueued");
export const saveAutoQueued = (keys: string[]) => saveList("autoQueued", keys);
