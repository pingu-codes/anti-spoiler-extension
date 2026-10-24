<script lang="ts">
  import { videoUrl, type JobView } from "../lib/api";
  import { hashTitle, normalize } from "../lib/hash";
  import { isOn, type Settings } from "../lib/settings";
  import { ago, clock, type Item } from "./format";

  let {
    item,
    job,
    settings,
    seen,
    canDownload,
    ondownload,
    onremove,
    onopen,
  }: {
    item: Item;
    job?: JobView;
    settings: Settings;
    seen: boolean;
    canDownload: boolean;
    ondownload: () => void;
    onremove: () => void;
    onopen: () => void;
  } = $props();

  const hashed = $derived(item.title !== undefined && isOn(settings, "titles"));
  const title = $derived(
    item.title === undefined
      ? item.key
      : hashed
        ? hashTitle(normalize(item.title))
        : item.title,
  );
  const thumb = $derived(isOn(settings, "thumbnails") ? undefined : item.thumb);
  const duration = $derived(
    isOn(settings, "progress") ? undefined : item.durationSec,
  );
  // A stable colour per video, so blank tiles are still easy to tell apart.
  const hue = $derived(
    Math.round((parseInt(hashTitle(item.key).slice(1, 3), 16) / 256) * 360),
  );
  const site = $derived(item.platform === "youtube" ? "YouTube" : "Twitch");

  const button =
    "cursor-pointer rounded-lg px-3 py-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const primary = `${button} bg-emerald-600 text-white hover:bg-emerald-500`;
  const secondary = `${button} bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700`;
  const icon =
    "cursor-pointer rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200";
</script>

<article
  class="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
>
  <div
    class="relative aspect-video"
    style:background="linear-gradient(135deg, hsl({hue} 30% 55%), hsl({hue + 50} 30%
    35%))"
  >
    {#if thumb}
      <img
        src={thumb}
        alt=""
        loading="lazy"
        class="absolute inset-0 size-full object-cover"
      />
    {/if}
    <div class="absolute top-2 left-2 flex gap-1 text-xs font-medium">
      {#if item.live}
        <span class="rounded bg-red-600 px-1.5 py-0.5 text-white">LIVE</span>
      {/if}
      {#if !seen}
        <span class="rounded bg-emerald-500 px-1.5 py-0.5 text-white">New</span>
      {/if}
    </div>
    {#if duration !== undefined}
      <span
        class="absolute right-2 bottom-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums"
        >{clock(duration)}</span
      >
    {/if}
  </div>

  <div class="flex flex-1 flex-col gap-1 p-3">
    <p
      class={["truncate font-medium", hashed && "font-mono"]}
      title={hashed ? undefined : title}
    >
      {title}
    </p>
    <p class="truncate text-xs text-zinc-500 dark:text-zinc-400">
      {item.channelName ?? site} · {ago(item.published)}
    </p>
    {#if job?.state === "failed" && job.error}
      <p class="line-clamp-2 text-xs text-red-600 dark:text-red-400">
        {job.error}
      </p>
    {/if}

    <div class="mt-auto flex items-center gap-2 pt-2">
      {#if !job}
        <button
          type="button"
          class={primary}
          disabled={!canDownload || item.live}
          title={item.live
            ? "Still live: download it once it's finished"
            : canDownload
              ? undefined
              : "Start the companion to download"}
          onclick={ondownload}>Download</button
        >
      {:else if job.state === "done"}
        <a class={primary} href="#watch/{item.key}" onclick={onopen}>Play</a>
      {:else if job.state === "downloading"}
        <div class="flex flex-1 items-center gap-2">
          <div
            class="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
          >
            <div
              class="h-full rounded-full bg-emerald-500 transition-[width]"
              style:width="{job.progress ?? 0}%"
            ></div>
          </div>
          <span class="text-xs text-zinc-500 tabular-nums"
            >{Math.floor(job.progress ?? 0)}%</span
          >
        </div>
      {:else if job.state === "queued" || job.state === "probing"}
        <span class="text-zinc-500">
          {job.state === "queued" ? "Queued" : "Checking…"}
        </span>
      {:else if job.state === "waiting"}
        <span
          class="text-zinc-500"
          title="Still live or upcoming. Checked again every 15 minutes."
          >Waiting for VOD</span
        >
        <button type="button" class={secondary} onclick={ondownload}
          >Check now</button
        >
      {:else if job.state === "skipped"}
        <span class="text-zinc-500" title="Didn't match the channel's rule"
          >Skipped (rule)</span
        >
        <button type="button" class={secondary} onclick={ondownload}
          >Download anyway</button
        >
      {:else if job.state === "failed"}
        <button type="button" class={secondary} onclick={ondownload}
          >Retry</button
        >
      {/if}

      <span class="ml-auto"></span>
      <a
        class={icon}
        href={videoUrl(item.platform, item.id)}
        target="_blank"
        rel="noreferrer"
        title="Open on {site}"
        aria-label="Open on {site}"
        onclick={onopen}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="size-4"
          ><path
            d="M11 3a1 1 0 1 0 0 2h2.59l-6.3 6.3a1 1 0 1 0 1.42 1.4L15 6.42V9a1 1 0 1 0 2 0V4a1 1 0 0 0-1-1h-5Z"
          /><path
            d="M5 5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3a1 1 0 1 0-2 0v3H5V7h3a1 1 0 0 0 0-2H5Z"
          /></svg
        >
      </a>
      {#if job}
        <button
          type="button"
          class={icon}
          title={job.state === "done" ? "Delete download" : "Cancel"}
          aria-label={job.state === "done" ? "Delete download" : "Cancel"}
          onclick={onremove}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="size-4"
            ><path
              d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
            /></svg
          >
        </button>
      {/if}
    </div>
  </div>
</article>
