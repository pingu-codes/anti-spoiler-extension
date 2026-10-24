import type { Platform } from "./api";
import { ext } from "./browser";

export interface AutoRule {
  enabled: boolean;
  /** The companion skips shorter videos, so lengths are never shown here. */
  minMinutes?: number;
  /** If set, one of these must appear in the title (case-insensitive). */
  keywords?: string[];
  /** Only videos published after this (ms) are queued, not the back catalogue. */
  since: number;
}

/**
 * Which videos a YouTube channel shows. "live" (full broadcasts) is the safe
 * choice for esports: one upload per game gives away how long a series went.
 */
export type FeedKind = "all" | "live" | "uploads";

export interface Channel {
  platform: Platform;
  kind: "channel" | "playlist";
  /** YouTube channel (UC…) or playlist id, or a Twitch login. */
  id: string;
  name: string;
  feed?: FeedKind;
  auto?: AutoRule;
}

export const channelKey = (c: Pick<Channel, "platform" | "kind" | "id">) =>
  `${c.platform}:${c.kind}:${c.id}`;

const KEY = "favorites";

export async function loadFavorites(): Promise<Channel[]> {
  try {
    const stored = (await ext.storage.sync.get(KEY))[KEY];
    return Array.isArray(stored) ? (stored as Channel[]) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(channels: Channel[]): Promise<void> {
  return ext.storage.sync.set({ [KEY]: channels });
}

export type ChannelInput =
  | { platform: "youtube"; kind: "channel" | "playlist"; id: string }
  | { platform: "youtube"; handle: string }
  | { platform: "twitch"; kind: "channel"; id: string };

const UC_RE = /^UC[\w-]{22}$/;
const PLAYLIST_RE = /^[\w-]{12,}$/;
const HANDLE_RE = /^@[^\s/?#@]{3,100}$/u;
const TWITCH_LOGIN_RE = /^\w{2,25}$/;
// twitch.tv/<these> aren't channels.
const TWITCH_PAGES = new Set([
  "directory",
  "downloads",
  "drops",
  "inventory",
  "p",
  "search",
  "settings",
  "subscriptions",
  "turbo",
  "videos",
  "wallet",
]);

/** Accepts @handles, YouTube channel/playlist URLs, Twitch URLs and logins. */
export function parseChannelInput(input: string): ChannelInput | null {
  const s = input.trim();
  if (HANDLE_RE.test(s)) return { platform: "youtube", handle: s.slice(1) };
  if (UC_RE.test(s)) return { platform: "youtube", kind: "channel", id: s };
  if (TWITCH_LOGIN_RE.test(s))
    return { platform: "twitch", kind: "channel", id: s.toLowerCase() };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");
  const [first, second] = url.pathname.split("/").filter(Boolean);

  if (host === "youtube.com") {
    const list = url.searchParams.get("list");
    if (list && PLAYLIST_RE.test(list))
      return { platform: "youtube", kind: "playlist", id: list };
    if (first === "channel" && second && UC_RE.test(second))
      return { platform: "youtube", kind: "channel", id: second };
    const handle = first && decodeURIComponent(first);
    if (handle && HANDLE_RE.test(handle))
      return { platform: "youtube", handle: handle.slice(1) };
  }
  if (host === "twitch.tv" && first && TWITCH_LOGIN_RE.test(first)) {
    const login = first.toLowerCase();
    if (!TWITCH_PAGES.has(login))
      return { platform: "twitch", kind: "channel", id: login };
  }
  return null;
}
