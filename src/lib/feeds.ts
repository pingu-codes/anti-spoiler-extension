// Recent videos for favourite channels. Runs in the background service worker
// too, which has no DOMParser, so the YouTube feed is parsed with regexes.
//
// Only titles, dates and thumbnails are read. Descriptions narrate results
// and view counts hint at which games were big, so they're never parsed.
import type { Platform } from "./api";
import { ext } from "./browser";
import {
  channelKey,
  parseChannelInput,
  type Channel,
  type FeedKind,
} from "./favorites";

export interface Video {
  platform: Platform;
  id: string;
  title: string;
  /** ms since epoch. */
  published: number;
  /** `channelKey` of the favourite it came from. */
  channel: string;
  channelName: string;
  /** Twitch only. */
  durationSec?: number;
  /** A Twitch VOD that's still recording. */
  live?: boolean;
  thumb?: string;
}

export interface Feed {
  fetchedAt: number;
  videos: Video[];
  error?: string;
}

type Entry = Omit<Video, "platform" | "channel" | "channelName">;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeXml(s: string): string {
  return s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e] ?? m;
    const code = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

const tag = (xml: string, name: string) =>
  new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];

export function parseAtom(xml: string): { title: string; entries: Entry[] } {
  const [head = "", ...entries] = xml.split("<entry>");
  return {
    title: decodeXml(tag(head, "title") ?? ""),
    entries: entries.flatMap((e) => {
      const id = tag(e, "yt:videoId");
      const title = tag(e, "title");
      const published = Date.parse(tag(e, "published") ?? "");
      if (!id || title === undefined || Number.isNaN(published)) return [];
      const thumb = /<media:thumbnail url="([^"]+)"/.exec(e)?.[1];
      return [
        {
          id,
          title: decodeXml(title),
          published,
          ...(thumb && { thumb: decodeXml(thumb) }),
        },
      ];
    }),
  };
}

async function youtubeFeed(param: "channel_id" | "playlist_id", id: string) {
  const res = await fetch(
    `https://www.youtube.com/feeds/videos.xml?${param}=${encodeURIComponent(id)}`,
    { credentials: "omit" },
  );
  // Empty playlists (e.g. a channel that never streams) 404.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`YouTube feed returned ${res.status}`);
  return parseAtom(await res.text());
}

// Every channel has auto-generated playlists: UULF = videos (no Shorts),
// UULV = past live streams.
function youtubePlaylists(channelId: string, feed: FeedKind = "all") {
  const rest = channelId.slice(2);
  if (feed === "live") return [`UULV${rest}`];
  if (feed === "uploads") return [`UULF${rest}`];
  return [`UULF${rest}`, `UULV${rest}`];
}

// Twitch's own web client. The official Helix API needs an OAuth app secret,
// which can't live in an extension. This is unofficial, so errors surface in
// the UI rather than being hidden.
const TWITCH_GQL = "https://gql.twitch.tv/gql";
const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const TWITCH_QUERY = `query($login:String!){user(login:$login){displayName videos(first:30,type:ARCHIVE,sort:TIME){edges{node{id title publishedAt lengthSeconds status previewThumbnailURL(width:320,height:180)}}}}}`;

interface TwitchResponse {
  data?: {
    user?: {
      displayName: string;
      videos?: {
        edges: {
          node: {
            id: string;
            title: string | null;
            publishedAt: string;
            lengthSeconds: number;
            status: string;
            previewThumbnailURL?: string;
          };
        }[];
      };
    } | null;
  };
  errors?: { message: string }[];
}

export function parseTwitchVideos(json: unknown): {
  name: string;
  videos: Entry[];
} {
  const { data, errors } = json as TwitchResponse;
  if (errors?.[0]) throw new Error(`Twitch: ${errors[0].message}`);
  const user = data?.user;
  if (!user) throw new Error("Twitch channel not found");
  return {
    name: user.displayName,
    videos: (user.videos?.edges ?? []).map(({ node }) => ({
      id: node.id,
      title: node.title ?? "",
      published: Date.parse(node.publishedAt),
      durationSec: node.lengthSeconds,
      ...(node.status === "RECORDING" && { live: true }),
      ...(node.previewThumbnailURL && { thumb: node.previewThumbnailURL }),
    })),
  };
}

async function twitchVideos(login: string) {
  const res = await fetch(TWITCH_GQL, {
    method: "POST",
    headers: { "Client-ID": TWITCH_CLIENT_ID },
    body: JSON.stringify({ query: TWITCH_QUERY, variables: { login } }),
    credentials: "omit",
  });
  if (!res.ok) throw new Error(`Twitch returned ${res.status}`);
  return parseTwitchVideos(await res.json());
}

export async function fetchChannelVideos(ch: Channel): Promise<Video[]> {
  const from = { channel: channelKey(ch), channelName: ch.name };
  if (ch.platform === "twitch") {
    const { videos } = await twitchVideos(ch.id);
    return videos.map((v) => ({ ...v, ...from, platform: "twitch" }));
  }
  const playlists =
    ch.kind === "playlist" ? [ch.id] : youtubePlaylists(ch.id, ch.feed);
  const feeds = await Promise.all(
    playlists.map((p) => youtubeFeed("playlist_id", p)),
  );
  const seen = new Set<string>();
  return feeds
    .flatMap((f) => f?.entries ?? [])
    .filter((e) => !seen.has(e.id) && seen.add(e.id))
    .map((e) => ({ ...e, ...from, platform: "youtube" as const }))
    .sort((a, b) => b.published - a.published);
}

export const feedKey = (c: Channel) => `feed:${channelKey(c)}`;

/**
 * Cached videos per channel (keyed by `channelKey`), refetching any older
 * than `maxAgeMs`. Each channel has its own storage key, so the home page and
 * the background can refresh at the same time without clobbering each other.
 */
export async function getFeeds(
  channels: Channel[],
  { force = false, maxAgeMs = 15 * 60_000 } = {},
): Promise<Record<string, Feed>> {
  const keys = channels.map(feedKey);
  const cached = keys.length ? await ext.storage.local.get(keys) : {};
  const out: Record<string, Feed> = {};
  await Promise.all(
    channels.map(async (c) => {
      const prev = cached[feedKey(c)] as Feed | undefined;
      const fresh =
        prev && !prev.error && Date.now() - prev.fetchedAt < maxAgeMs;
      if (!force && fresh) return void (out[channelKey(c)] = prev);
      let feed: Feed;
      try {
        feed = { fetchedAt: Date.now(), videos: await fetchChannelVideos(c) };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        feed = { fetchedAt: Date.now(), videos: prev?.videos ?? [], error };
      }
      await ext.storage.local.set({ [feedKey(c)]: feed });
      out[channelKey(c)] = feed;
    }),
  );
  return out;
}

async function youtubeChannelId(handle: string) {
  const res = await fetch(
    `https://www.youtube.com/@${encodeURIComponent(handle)}`,
    { credentials: "omit" },
  );
  if (res.status === 404) throw new Error(`No YouTube channel @${handle}`);
  const html = await res.text();
  const id =
    /<meta property="og:url" content="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(
      html,
    )?.[1] ?? /itemprop="identifier" content="(UC[\w-]{22})"/.exec(html)?.[1];
  if (!id)
    throw new Error(
      "Couldn't look up that handle. Paste the channel's /channel/UC… URL instead.",
    );
  return id;
}

/** Turns what the user typed into a favourite, checking that it exists. */
export async function resolveChannel(input: string): Promise<Channel> {
  const parsed = parseChannelInput(input);
  if (!parsed)
    throw new Error(
      "Enter a YouTube @handle, channel or playlist URL, or a Twitch channel.",
    );
  if (parsed.platform === "twitch") {
    const { name } = await twitchVideos(parsed.id);
    return { platform: "twitch", kind: "channel", id: parsed.id, name };
  }
  const ref =
    "handle" in parsed
      ? { kind: "channel" as const, id: await youtubeChannelId(parsed.handle) }
      : parsed;
  const feed = await youtubeFeed(
    ref.kind === "channel" ? "channel_id" : "playlist_id",
    ref.id,
  );
  if (!feed) throw new Error("YouTube doesn't know that channel or playlist.");
  return {
    platform: "youtube",
    kind: ref.kind,
    id: ref.id,
    name: feed.title || ref.id,
    ...(ref.kind === "channel" && { feed: "all" as const }),
  };
}
