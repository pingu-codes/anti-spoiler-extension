import type { Site } from "./types";

export const youtube: Site = {
  name: "youtube",
  matches: ["*://www.youtube.com/*", "*://www.youtube-nocookie.com/*"],
  // Covers embedded players on other sites.
  allFrames: true,

  thumbnails: [
    "ytd-thumbnail img",
    "ytd-playlist-thumbnail img",
    "yt-thumbnail-view-model img",
    "yt-collection-thumbnail-view-model img",
    "ytm-shorts-lockup-view-model img",
    "ytd-reel-item-renderer img",
    "ytd-notification-renderer :is(.thumbnail-container, #thumbnail-container) img",
    // Player: poster, end screen, end cards, autoplay "up next".
    ".ytp-cued-thumbnail-overlay-image",
    ".ytp-videowall-still-image",
    ".ytp-ce-covering-image",
    ".ytp-autonav-endscreen-upnext-thumbnail",
  ],

  previews: [
    "ytd-moving-thumbnail-renderer",
    "#mouseover-overlay",
    "ytd-video-preview",
    "#video-preview",
  ],

  titles: [
    "#video-title",
    ".yt-lockup-metadata-view-model__title",
    ".yt-lockup-metadata-view-model-wiz__title",
    ".shortsLockupViewModelHostMetadataTitle",
    ".shortsLockupViewModelHostOutsideMetadataTitle",
    ".ytShortsVideoTitleViewModelShortsVideoTitle",
    "ytd-watch-metadata #title h1",
    "#info-contents h1.title",
    ".miniplayer-title",
    "ytd-notification-renderer .message",
    // Player overlays.
    ".ytp-title-link",
    ".ytp-videowall-still-info-title",
    ".ytp-ce-video-title",
    ".ytp-autonav-endscreen-upnext-title",
  ],

  channels: [
    ["ytd-watch-metadata", "#owner ytd-channel-name #text"],
    ["ytd-playlist-panel-video-renderer", "#byline"],
    [
      "ytd-rich-grid-media, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer",
      "ytd-channel-name #text",
    ],
    [
      "yt-lockup-view-model",
      ":is(.yt-content-metadata-view-model__metadata-row, .yt-content-metadata-view-model-wiz__metadata-row):first-child",
    ],
  ],
  pageChannel: "ytd-watch-metadata #owner ytd-channel-name #text",

  progress: [
    // Thumbnail overlays: resume bar, duration badge.
    "ytd-thumbnail-overlay-resume-playback-renderer",
    "ytd-thumbnail-overlay-time-status-renderer",
    "yt-thumbnail-overlay-progress-bar-view-model",
    "yt-thumbnail-bottom-overlay-view-model",
    "yt-thumbnail-overlay-badge-view-model",
    ".ytThumbnailOverlayProgressBarHost",
    // Player: seek bar (incl. "most replayed" heat map), time, chapter.
    ".ytp-progress-bar-container",
    ".ytp-fine-scrubbing-container",
    ".ytp-tooltip.ytp-preview",
    ".ytp-time-display",
    ".ytp-chapter-container",
    ".ytp-videowall-still-info-duration",
    ".ytp-ce-video-duration",
    ".ytp-autonav-timestamp",
    // Chapter / key-moment lists with timestamps.
    "ytd-macro-markers-list-renderer",
    "ytd-expandable-metadata-renderer",
    "ytd-reel-video-renderer #progress-bar",
  ],

  documentTitle(title, url, label) {
    if (!/^\/(watch|shorts\/|live\/)/.test(url.pathname)) return null;
    const m = title.match(/^(\(\d+\)\s*)?(.*?)(\s+-\s+YouTube)?$/);
    if (!m?.[2] || m[2] === "YouTube") return null;
    return `${m[1] ?? ""}${label(m[2])}${m[3] ?? ""}`;
  },

  showControls: (url) => /^\/(watch|live|embed)\b/.test(url.pathname),
  player: "#movie_player",
  css: `.ad-showing anti-spoiler-controls { display: none !important; }`,
};
