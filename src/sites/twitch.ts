import type { Site } from "./types";

const card = '[data-a-target="preview-card-image-link"]';
// Info panel under the player on VOD and channel pages.
const info = ".channel-info-content";

export const twitch: Site = {
  name: "twitch",
  matches: ["*://www.twitch.tv/*"],

  thumbnails: [`${card} img`, ".tw-card-img img"],

  previews: [`${card} video`],

  titles: [
    // VOD / clip / stream cards: <article> … <a href="/videos/…"><h4 title="…">.
    "article a :is(h3, h4)",
    '[data-a-target="preview-card-title-link"] :is(h3, h4)',
    // VOD title: no stable hook of its own, but it directly follows the
    // "Yesterday" timestamp block.
    `${info} div:has(> div > .timestamp-metadata__bar) + div`,
    '[data-a-target="stream-title"]',
    '[data-a-target="player-info-title"]',
    '[data-a-target="clip-title"]',
  ],

  channels: [
    ["article", '[data-a-target="preview-card-channel-link"]'],
    [info, "h1"],
  ],
  pageChannel: `${info} h1`,

  progress: [
    '[data-a-target="player-seekbar"]',
    ".seekbar-interaction-area",
    '[data-a-target="player-seekbar-current-time"]',
    '[data-a-target="player-seekbar-duration"]',
    ".live-time",
    // Duration / resume bar overlaid on VOD cards.
    `${card} :is(.tw-media-card-stat, [class*="MediaCardStat"], [role="progressbar"])`,
    // 7TV's VOD chat shows each message's position in the VOD.
    ".seventv-chat-vod-message-timestamp",
  ],

  documentTitle(title, url, label) {
    if (!url.pathname.startsWith("/videos/")) return null;
    const m = title.match(/^(.*?)(\s+-\s+Twitch)?$/);
    if (!m?.[1] || m[1] === "Twitch") return null;
    return `${label(m[1])}${m[2] ?? ""}`;
  },

  showControls: (url) => url.pathname.startsWith("/videos/"),
  player: '.video-player__container, [data-a-target="video-player"]',
};
