import {
  DEFAULTS,
  FEATURES,
  isOn,
  loadSettings,
  onSettingsChange,
  type Settings,
} from "../lib/settings";
import type { Site } from "../sites";
import { OFF_ATTR } from "./constants";
import { skipControls } from "./controls";
import { titleHasher } from "./titles";

export function run(site: Site) {
  const root = document.documentElement;
  const titles = titleHasher(site);
  const controls = skipControls(site);

  function apply(s: Settings) {
    const off = FEATURES.filter((f) => !isOn(s, f.key)).map((f) => f.key);
    if (off.length) root.setAttribute(OFF_ATTR, off.join(" "));
    else root.removeAttribute(OFF_ATTR);
    titles.toggle(isOn(s, "titles"));
    controls.toggle(isOn(s, "controls"));
  }

  // Start hashing immediately; stored settings can only switch things off.
  titles.toggle(isOn(DEFAULTS, "titles"));
  loadSettings().then(apply);
  onSettingsChange(apply);
}
