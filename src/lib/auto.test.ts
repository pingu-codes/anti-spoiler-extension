import { expect, test } from "bun:test";
import { matchesRule } from "./auto";
import type { AutoRule } from "./favorites";
import type { Video } from "./feeds";

const since = Date.parse("2026-10-20T00:00:00Z");
const video: Video = {
  platform: "youtube",
  id: "aaaaaaaaaaa",
  title: "LCK  Worlds Final | FULL vod",
  published: since + 1000,
  channel: "youtube:channel:UC",
  channelName: "LCK",
};
const rule: AutoRule = { enabled: true, since };

test.each<[string, Partial<Video>, Partial<AutoRule>, boolean]>([
  ["new video, no keywords", {}, {}, true],
  ["rule switched off", {}, { enabled: false }, false],
  ["published before the rule", { published: since - 1 }, {}, false],
  ["still live", { live: true }, {}, false],
  ["keyword, any case", {}, { keywords: ["full VOD"] }, true],
  ["any of several keywords", {}, { keywords: ["nope", "worlds"] }, true],
  ["whitespace is normalized", {}, { keywords: ["lck worlds"] }, true],
  ["no keyword matches", {}, { keywords: ["highlights"] }, false],
])("%s", (_, v, r, expected) => {
  expect(matchesRule({ ...video, ...v }, { ...rule, ...r })).toBe(expected);
});
