// Build-time: generates the static stylesheet injected via the manifest, so
// spoilers are hidden from first paint. Every rule applies unless the content
// script marks its feature as off, so a slow (or broken) script fails safe.
import type { Feature } from "../lib/settings";
import type { Site } from "../sites";
import { LABEL_ATTR, OFF_ATTR } from "./constants";

const on = (f: Feature) => `:root:not([${OFF_ATTR}~="${f}"])`;
const any = (selectors: string[]) => `:is(${selectors.join(", ")})`;

export function siteCss(site: Site): string {
  const titles = any(site.titles);
  const rules = [
    // contrast(0) flattens any image to uniform grey; the low opacity lets it
    // pick up the page background so it suits both light and dark themes.
    `${on("thumbnails")} ${any(site.thumbnails)} { filter: contrast(0) opacity(0.2) !important; }`,
    `${on("thumbnails")} ${any(site.previews)} { display: none !important; }`,

    // Hide the real text and draw the label over the same box. The pseudo
    // element covers the whole box so clicks still reach links. Positioning is
    // zero-specificity so it never overrides an element's own positioning.
    `:where(${on("titles")}) :where(${site.titles.join(", ")}) { position: relative; }`,
    `${on("titles")} ${titles} { visibility: hidden !important; }`,
    `${on("titles")} ${titles}::before {
      content: attr(${LABEL_ATTR}) !important;
      visibility: visible !important;
      position: absolute !important;
      inset: 0 !important;
      display: block !important;
      overflow: hidden !important;
      white-space: nowrap !important;
      text-overflow: ellipsis !important;
      color: inherit !important;
    }`,
    // Nested matches would otherwise draw the label twice.
    `${on("titles")} [${LABEL_ATTR}] [${LABEL_ATTR}]::before { content: none !important; }`,

    `${on("progress")} ${any(site.progress)} { display: none !important; }`,
  ];
  if (site.css) rules.push(site.css);
  return rules.join("\n") + "\n";
}
