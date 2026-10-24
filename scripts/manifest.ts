import { SITES } from "../src/sites";

export type Target = "chrome" | "firefox";

export function manifest(target: Target, version: string) {
  return {
    manifest_version: 3,
    name: "Anti-Spoiler",
    version,
    description:
      "Hides thumbnails, titles, progress bars and timestamps on YouTube and Twitch.",
    permissions: ["storage"],
    action: { default_title: "Anti-Spoiler", default_popup: "popup.html" },
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
