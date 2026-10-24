/** Collapse whitespace so the same title hashes identically everywhere. */
export const normalize = (text: string | null) =>
  (text ?? "").replace(/\s+/g, " ").trim();

/** Short, stable, non-reversible label for a title (FNV-1a, 32 bit). */
export function hashTitle(title: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < title.length; i++) {
    h ^= title.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "#" + (h >>> 0).toString(16).padStart(8, "0");
}

/** What's shown instead of a title: the channel (if known) and the hash. */
export const label = (title: string, channel?: string | null) =>
  channel ? `${channel} · ${hashTitle(title)}` : hashTitle(title);
