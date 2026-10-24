import { SITES } from "../src/sites";

export type Target = "chrome" | "firefox";

export function manifest(target: Target, version: string) {
  return {
    manifest_version: 3,
    name: "Anti-Spoiler",
    version,
    description:
      "Hides thumbnails, titles, progress bars and timestamps on YouTube and Twitch.",
    permissions: ["storage", "alarms"],
    // YouTube feeds and channel lookups, and the local companion server (any
    // port). Twitch's API allows any origin, so it needs no entry.
    host_permissions: ["https://www.youtube.com/*", "http://127.0.0.1/*"],
    action: { default_title: "Anti-Spoiler", default_popup: "popup.html" },
    background:
      target === "chrome"
        ? { service_worker: "background.js" }
        : { scripts: ["background.js"] },
    // The home page doubles as the options page, so the popup can open (or
    // focus) it with runtime.openOptionsPage().
    options_ui: { page: "home.html", open_in_tab: true },
    content_scripts: SITES.map((site) => ({
      matches: site.matches,
      js: [`${site.name}.js`],
      css: [`${site.name}.css`],
      run_at: "document_start",
      all_frames: site.allFrames ?? false,
    })),
    ...(target === "firefox" && {
      browser_specific_settings: {
        gecko: {
          id: "anti-spoiler-ext@ciarankelly",
          strict_min_version: "121.0",
          data_collection_permissions: { required: ["none"] },
        },
      },
    }),
  };
}
