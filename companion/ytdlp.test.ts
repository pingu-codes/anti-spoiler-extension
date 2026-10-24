import { describe, expect, test } from "bun:test";
import { ID_RE, videoUrl } from "../src/lib/api";
import {
  decide,
  downloadArgs,
  parseProbe,
  parseProgress,
  probeArgs,
  type Probe,
} from "./ytdlp";

describe("parseProbe", () => {
  test("reads live status, duration and release time", () => {
    expect(parseProbe("not_live|3600.5|NA")).toEqual({
      liveStatus: "not_live",
      duration: 3600.5,
      release: null,
    });
    expect(parseProbe("is_upcoming|NA|1790000000\n")).toEqual({
      liveStatus: "is_upcoming",
      duration: null,
      release: 1790000000,
    });
    expect(parseProbe("NA|NA|NA")).toEqual({
      liveStatus: null,
      duration: null,
      release: null,
    });
  });

  test("ignores other output", () => {
    expect(parseProbe("[youtube] Extracting URL")).toBeNull();
  });
});

test("parseProgress", () => {
  expect(parseProgress("ASP  45.3%")).toBe(45.3);
  expect(parseProgress("ASP 100.0%")).toBe(100);
  expect(parseProgress("ASP Unknown")).toBeNull();
  expect(parseProgress("[download]  45.3% of 1.2GiB")).toBeNull();
});

describe("decide", () => {
  const now = 1_800_000_000_000;
  const probe = (p: Partial<Probe>): Probe => ({
    liveStatus: "not_live",
    duration: 3600,
    release: null,
    ...p,
  });

  test.each(["is_live", "is_upcoming", "post_live"])(
    "%s waits 15 minutes",
    (liveStatus) => {
      expect(decide(probe({ liveStatus }), undefined, now)).toEqual({
        state: "waiting",
        retryAt: now + 15 * 60_000,
      });
    },
  );

  test("a premiere next week waits until it starts", () => {
    const release = now / 1000 + 7 * 86400;
    expect(
      decide(probe({ liveStatus: "is_upcoming", release }), undefined, now),
    ).toEqual({ state: "waiting", retryAt: release * 1000 });
  });

  test("shorter than the rule is skipped", () => {
    expect(decide(probe({ duration: 600 }), 1800, now).state).toBe("skipped");
    expect(decide(probe({ duration: 1800 }), 1800, now).state).toBe(
      "downloading",
    );
    expect(decide(probe({ duration: null }), 1800, now).state).toBe(
      "downloading",
    );
  });

  test("past streams download", () => {
    expect(decide(probe({ liveStatus: "was_live" }), undefined, now)).toEqual({
      state: "downloading",
    });
  });
});

describe("arguments", () => {
  const url = videoUrl("youtube", "aaaaaaaaaaa");
  const lists = {
    probe: probeArgs(url, ["--cookies-from-browser", "firefox"]),
    download: downloadArgs(url, "/tmp/x", "youtube-aaaaaaaaaaa"),
  };

  test.each(Object.entries(lists))("%s ends with -- url", (_, args) => {
    expect(args.slice(-2)).toEqual(["--", url]);
    expect(args.indexOf("--")).toBe(args.length - 2);
  });

  test("download names files by key and embeds nothing", () => {
    const args = lists.download;
    expect(args).toContain("youtube-aaaaaaaaaaa.%(ext)s");
    expect(args.filter((a) => /^--(embed|write)/.test(a))).toEqual([]);
  });

  test("extra args go first", () => {
    expect(lists.probe.slice(0, 2)).toEqual([
      "--cookies-from-browser",
      "firefox",
    ]);
  });
});

test("ids are validated before building URLs", () => {
  expect(ID_RE.youtube.test("aaaaaaaaaaa")).toBe(true);
  expect(ID_RE.youtube.test("--exec rm")).toBe(false);
  expect(ID_RE.twitch.test("2000000001")).toBe(true);
  expect(ID_RE.twitch.test("2000000001; ls")).toBe(false);
  expect(videoUrl("twitch", "2000000001")).toBe(
    "https://www.twitch.tv/videos/2000000001",
  );
});
