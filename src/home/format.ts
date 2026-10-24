import type { Platform } from "../lib/api";

/** A video card: from a feed, or a download (whose title may be unknown). */
export interface Item {
  key: string;
  platform: Platform;
  id: string;
  title?: string;
  channelName?: string;
  published: number;
  durationSec?: number;
  live?: boolean;
  thumb?: string;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

export function ago(ms: number, now = Date.now()) {
  const s = (ms - now) / 1000;
  for (const [unit, size] of UNITS)
    if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
  return "just now";
}

export function clock(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export const message = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
