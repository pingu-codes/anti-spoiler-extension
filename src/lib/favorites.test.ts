import { expect, test } from "bun:test";
import { parseChannelInput } from "./favorites";

const UC = "UCvqRdlKsE5Q8mf8YXbdIJLw";

test.each([
  ["@LCK", { platform: "youtube", handle: "LCK" }],
  ["  @lolesports  ", { platform: "youtube", handle: "lolesports" }],
  [
    "https://www.youtube.com/@LCK/videos",
    { platform: "youtube", handle: "LCK" },
  ],
  ["youtube.com/@lolesports", { platform: "youtube", handle: "lolesports" }],
  [UC, { platform: "youtube", kind: "channel", id: UC }],
  [
    `https://www.youtube.com/channel/${UC}/streams`,
    { platform: "youtube", kind: "channel", id: UC },
  ],
  [
    "https://www.youtube.com/playlist?list=PLabcdefghijklmnop",
    { platform: "youtube", kind: "playlist", id: "PLabcdefghijklmnop" },
  ],
  [
    "https://m.youtube.com/watch?v=abcdefghijk&list=PLabcdefghijklmnop",
    { platform: "youtube", kind: "playlist", id: "PLabcdefghijklmnop" },
  ],
  [
    "https://www.twitch.tv/riotgames",
    { platform: "twitch", kind: "channel", id: "riotgames" },
  ],
  ["twitch.tv/LCK/videos", { platform: "twitch", kind: "channel", id: "lck" }],
  ["RiotGames", { platform: "twitch", kind: "channel", id: "riotgames" }],
])("%p", (input, expected) => {
  expect(parseChannelInput(input)).toEqual(expected as never);
});

test.each([
  "",
  "not a channel!",
  "https://www.twitch.tv/videos/2000000001",
  "https://www.twitch.tv/directory",
  "https://www.youtube.com/watch?v=abcdefghijk",
  "https://www.youtube.com/channel/not-an-id",
  "https://example.com/@LCK",
])("rejects %p", (input) => {
  expect(parseChannelInput(input)).toBeNull();
});
