import { mount, unmount } from "svelte";
import type { Site } from "../sites";
import { CONTROLS_TAG } from "./constants";
import Controls from "./Controls.svelte";

// Events that would otherwise reach the player (play/pause, fullscreen, ...).
const CONTAINED = [
  "click",
  "dblclick",
  "mousedown",
  "mouseup",
  "pointerdown",
  "pointerup",
  "keydown",
];

function createHost() {
  const host = document.createElement(CONTROLS_TAG);
  for (const e of CONTAINED)
    host.addEventListener(e, (ev) => ev.stopPropagation());
  const shadow = host.attachShadow({ mode: "closed" });
  // <style> works everywhere; adopted sheets also dodge a strict style-src CSP.
  const style = document.createElement("style");
  style.textContent = __OVERLAY_CSS__;
  shadow.append(style);
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(__OVERLAY_CSS__);
    shadow.adoptedStyleSheets = [sheet];
  } catch {}
  return { host, shadow };
}

/** Mounts the skip controls into the current player, following navigations. */
export function skipControls(site: Site) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let current:
    | {
        video: HTMLVideoElement;
        host: HTMLElement;
        app: ReturnType<typeof mount>;
      }
    | undefined;

  function teardown() {
    if (!current) return;
    unmount(current.app);
    current.host.remove();
    current = undefined;
  }

  function sync() {
    const video = site.showControls(new URL(location.href))
      ? document.querySelector<HTMLVideoElement>(`:is(${site.player}) video`)
      : null;
    const player = video?.closest<HTMLElement>(site.player);
    if (
      current &&
      current.video === video &&
      current.host.parentElement === player
    )
      return;
    teardown();
    if (!video || !player) return;
    const { host, shadow } = createHost();
    player.append(host);
    current = {
      video,
      host,
      app: mount(Controls, { target: shadow, props: { video, player } }),
    };
  }

  return {
    toggle(on: boolean) {
      clearInterval(timer);
      timer = undefined;
      if (!on) return teardown();
      // Both sites are SPAs that swap players around; polling is simple and cheap.
      timer = setInterval(sync, 1000);
      sync();
    },
  };
}
