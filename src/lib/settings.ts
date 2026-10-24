import { ext } from "./browser";

export const FEATURES = [
  {
    key: "thumbnails",
    label: "Hide thumbnails",
    description: "Blank out video thumbnails and hover previews.",
  },
  {
    key: "titles",
    label: "Hash titles",
    description: "Replace video titles with a short hash of the title.",
  },
  {
    key: "progress",
    label: "Hide progress & timestamps",
    description: "Hide seek bars, durations, chapters and watch progress.",
  },
  {
    key: "controls",
    label: "Skip controls",
    description: "Add ±10s / 1m / 10m buttons to the player.",
  },
] as const;

export type Feature = (typeof FEATURES)[number]["key"];

export type Settings = { enabled: boolean } & Record<Feature, boolean>;

export const DEFAULTS: Settings = {
  enabled: true,
  thumbnails: true,
  titles: true,
  progress: true,
  controls: true,
};

const KEY = "settings";

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = (await ext.storage.sync.get(KEY))[KEY];
    return { ...DEFAULTS, ...(stored as Partial<Settings> | undefined) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): Promise<void> {
  return ext.storage.sync.set({ [KEY]: settings });
}

export function onSettingsChange(cb: (settings: Settings) => void) {
  ext.storage.onChanged.addListener((changes, area) => {
    const change = changes[KEY];
    if (area === "sync" && change) {
      cb({ ...DEFAULTS, ...(change.newValue as Partial<Settings>) });
    }
  });
}

/** True if a feature should be active given the master switch. */
export const isOn = (s: Settings, f: Feature) => s.enabled && s[f];
