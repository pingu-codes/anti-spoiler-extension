// Auto-download rules: queue new videos from favourites with a rule switched
// on. Run by the background on an alarm, and by "Check rules now".
import { jobKey } from "./api";
import { addDownload } from "./companion";
import { channelKey, loadFavorites, type AutoRule } from "./favorites";
import { getFeeds, type Video } from "./feeds";
import { normalize } from "./hash";
import { loadAutoQueued, saveAutoQueued, saveMeta } from "./local";

export function matchesRule(v: Video, rule: AutoRule): boolean {
  if (!rule.enabled || v.live || v.published < rule.since) return false;
  if (!rule.keywords?.length) return true;
  const title = normalize(v.title).toLowerCase();
  return rule.keywords.some((k) => title.includes(k.toLowerCase()));
}

export async function runAutoRules(): Promise<{
  queued: number;
  error?: string;
}> {
  const channels = (await loadFavorites()).filter((c) => c.auto?.enabled);
  if (!channels.length) return { queued: 0 };
  const feeds = await getFeeds(channels, { maxAgeMs: 10 * 60_000 });
  const done = new Set(await loadAutoQueued());
  let queued = 0;
  try {
    for (const c of channels) {
      for (const v of feeds[channelKey(c)]?.videos ?? []) {
        const key = jobKey(v.platform, v.id);
        if (done.has(key) || !matchesRule(v, c.auto!)) continue;
        const min = c.auto!.minMinutes;
        // Throws if the companion isn't running; the next run tries again.
        await addDownload({
          platform: v.platform,
          id: v.id,
          ...(min ? { minDuration: min * 60 } : {}),
        });
        await saveMeta(v);
        done.add(key);
        queued++;
      }
    }
  } catch (e) {
    return { queued, error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (queued) await saveAutoQueued([...done]);
  }
  return { queued };
}
