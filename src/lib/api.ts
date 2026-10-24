// Shared by the extension and the local companion server (companion/).

export const COMPANION_PORT = 47800;

/** Required on every /api request. Web pages can't send it cross-origin. */
export const API_HEADER = "X-Anti-Spoiler";

export type Platform = "youtube" | "twitch";

export const ID_RE: Record<Platform, RegExp> = {
  youtube: /^[\w-]{11}$/,
  twitch: /^\d{1,12}$/,
};

export const KEY_RE = /^(youtube|twitch)-[\w-]+$/;

/** Identifies a video across the extension and the companion. */
export const jobKey = (platform: Platform, id: string) => `${platform}-${id}`;

export const videoUrl = (platform: Platform, id: string) =>
  platform === "youtube"
    ? `https://www.youtube.com/watch?v=${id}`
    : `https://www.twitch.tv/videos/${id}`;

export type JobState =
  | "queued"
  | "probing"
  | "waiting" // live or upcoming; probed again at `retryAt`
  | "downloading"
  | "done"
  | "failed"
  | "skipped"; // shorter than `minDuration`

export interface Job {
  key: string;
  platform: Platform;
  id: string;
  state: JobState;
  /** Seconds. Set by auto rules; shorter videos are skipped. */
  minDuration?: number;
  /** 0–100 while downloading. */
  progress?: number;
  error?: string;
  /** ms since epoch. */
  retryAt?: number;
  addedAt: number;
}

export interface JobView extends Job {
  /** Playable URL, once done. */
  src?: string;
}

export interface StateResponse {
  version: string;
  ytdlp: string | null;
  ffmpeg: boolean;
  dir: string;
  jobs: JobView[];
}

export interface AddJob {
  platform: Platform;
  id: string;
  minDuration?: number;
}

export function isAddJob(v: unknown): v is AddJob {
  const j = v as Partial<AddJob> | null;
  return (
    typeof j === "object" &&
    j !== null &&
    (j.platform === "youtube" || j.platform === "twitch") &&
    typeof j.id === "string" &&
    ID_RE[j.platform].test(j.id) &&
    (j.minDuration === undefined ||
      (typeof j.minDuration === "number" && j.minDuration >= 0))
  );
}
