import { describe, expect, test } from "bun:test";
import { decodeXml, parseAtom, parseTwitchVideos } from "./feeds";
import { hashTitle, normalize } from "./hash";

// Shaped like YouTube's playlist feed; the content is made up.
const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?playlist_id=UULVtest"/>
 <id>yt:playlist:UULVtest</id>
 <yt:playlistId>UULVtest</yt:playlistId>
 <title>Test &amp; Esports</title>
 <author><name>Test Esports</name></author>
 <published>2020-01-01T00:00:00+00:00</published>
 <entry>
  <id>yt:video:aaaaaaaaaaa</id>
  <yt:videoId>aaaaaaaaaaa</yt:videoId>
  <title>Team A vs Team B &amp; co &#39;Week 1&#x27; &lt;Day 2&gt;</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=aaaaaaaaaaa"/>
  <published>2026-10-20T10:00:00+00:00</published>
  <media:group>
   <media:title>Team A vs Team B &amp; co</media:title>
   <media:thumbnail url="https://i1.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg" width="480" height="360"/>
   <media:description>SECRET Team A wins 3-0</media:description>
   <media:community>
    <media:starRating count="10" average="5.00" min="1" max="5"/>
    <media:statistics views="987654"/>
   </media:community>
  </media:group>
 </entry>
 <entry>
  <id>yt:video:b-b_bbbbbbb</id>
  <yt:videoId>b-b_bbbbbbb</yt:videoId>
  <title>Second</title>
  <published>2026-10-21T10:00:00+00:00</published>
 </entry>
 <entry>
  <title>No id, skipped</title>
  <published>2026-10-21T10:00:00+00:00</published>
 </entry>
</feed>`;

describe("decodeXml", () => {
  test("named and numeric entities", () => {
    expect(decodeXml("a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;")).toBe(
      `a & b <c> "d" 'e'`,
    );
    expect(decodeXml("&#39;&#x27;&#x1F600;")).toBe("''😀");
    expect(decodeXml("&unknown; &#x110000;")).toBe("&unknown; &#x110000;");
  });
});

describe("parseAtom", () => {
  const feed = parseAtom(ATOM);

  test("reads the feed title and entries", () => {
    expect(feed.title).toBe("Test & Esports");
    expect(feed.entries).toEqual([
      {
        id: "aaaaaaaaaaa",
        title: "Team A vs Team B & co 'Week 1' <Day 2>",
        published: Date.parse("2026-10-20T10:00:00Z"),
        thumb: "https://i1.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
      },
      {
        id: "b-b_bbbbbbb",
        title: "Second",
        published: Date.parse("2026-10-21T10:00:00Z"),
      },
    ]);
  });

  test("never reads descriptions or view counts", () => {
    const json = JSON.stringify(feed);
    expect(json).not.toContain("SECRET");
    expect(json).not.toContain("987654");
  });

  test("decoded titles hash like the page text does", () => {
    // youtube.com renders the decoded text; the content script hashes that.
    const onPage = "Team A vs Team B & co 'Week 1' <Day 2>";
    expect(hashTitle(normalize(feed.entries[0]!.title))).toBe(
      hashTitle(normalize(onPage)),
    );
  });
});

describe("parseTwitchVideos", () => {
  const node = {
    id: "2000000001",
    title: "LCK Finals",
    publishedAt: "2026-10-20T10:00:00Z",
    lengthSeconds: 18000,
    status: "RECORDED",
    previewThumbnailURL: "https://static-cdn.jtvnw.net/thumb.jpg",
  };

  test("maps videos and flags ones still recording", () => {
    const { name, videos } = parseTwitchVideos({
      data: {
        user: {
          displayName: "LCK",
          videos: {
            edges: [
              { node },
              { node: { ...node, id: "2000000002", status: "RECORDING" } },
            ],
          },
        },
      },
    });
    expect(name).toBe("LCK");
    expect(videos[0]).toEqual({
      id: "2000000001",
      title: "LCK Finals",
      published: Date.parse("2026-10-20T10:00:00Z"),
      durationSec: 18000,
      thumb: "https://static-cdn.jtvnw.net/thumb.jpg",
    });
    expect(videos[0]!.live).toBeUndefined();
    expect(videos[1]!.live).toBe(true);
  });

  test("unknown channel and API errors throw", () => {
    expect(() => parseTwitchVideos({ data: { user: null } })).toThrow(
      "not found",
    );
    expect(() =>
      parseTwitchVideos({ errors: [{ message: "integrity check failed" }] }),
    ).toThrow("integrity check failed");
  });
});
