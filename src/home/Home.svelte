<script lang="ts">
  import { untrack } from "svelte";
  import { jobKey, type StateResponse } from "../lib/api";
  import { runAutoRules } from "../lib/auto";
  import { ext } from "../lib/browser";
  import { addDownload, removeDownload } from "../lib/companion";
  import {
    channelKey,
    loadFavorites,
    saveFavorites,
    type Channel,
  } from "../lib/favorites";
  import {
    feedKey,
    getFeeds,
    resolveChannel,
    type Feed,
    type Video,
  } from "../lib/feeds";
  import {
    loadMeta,
    loadSeen,
    markSeen,
    removeMeta,
    saveMeta,
    type VideoMeta,
  } from "../lib/local";
  import type { Settings } from "../lib/settings";
  import ChannelEditor from "./ChannelEditor.svelte";
  import { message, type Item } from "./format";
  import VideoCard from "./VideoCard.svelte";

  let {
    settings,
    companion,
    refresh,
  }: {
    settings: Settings;
    companion: StateResponse | null | undefined;
    refresh: () => Promise<void>;
  } = $props();

  // Must match host_permissions in scripts/manifest.ts.
  const ORIGINS = ["https://www.youtube.com/*", "http://127.0.0.1/*"];

  let favorites = $state<Channel[]>([]);
  let loaded = $state(false);
  let feeds = $state<Record<string, Feed>>({});
  let meta = $state<Record<string, VideoMeta>>({});
  let seen = $state<string[]>([]);
  let hasAccess = $state(true);

  let tab = $state<"feed" | "downloads">("feed");
  let filter = $state<string>();
  let editing = $state<string>();
  let input = $state("");
  let adding = $state(false);
  let addError = $state("");
  let notice = $state("");
  let busy = $state(false);

  const seenSet = $derived(new Set(seen));
  const jobs = $derived(new Map(companion?.jobs.map((j) => [j.key, j])));
  const canDownload = $derived(!!companion?.ytdlp);
  const editIndex = $derived(
    favorites.findIndex((c) => channelKey(c) === editing),
  );

  const TABS = [
    ["feed", "Latest"],
    ["downloads", "Downloads"],
  ] as const;

  const toItem = (v: Video): Item => ({ ...v, key: jobKey(v.platform, v.id) });

  const feedItems = $derived(
    favorites
      .filter((c) => !filter || channelKey(c) === filter)
      .flatMap((c) => feeds[channelKey(c)]?.videos ?? [])
      .sort((a, b) => b.published - a.published)
      .map(toItem),
  );
  const byKey = $derived(
    new Map(
      Object.values(feeds)
        .flatMap((f) => f.videos)
        .map((v) => [jobKey(v.platform, v.id), v]),
    ),
  );
  const downloadItems = $derived(
    (companion?.jobs ?? []).map((j): Item => {
      const v = byKey.get(j.key);
      if (v) return toItem(v);
      const m = meta[j.key];
      return {
        key: j.key,
        platform: j.platform,
        id: j.id,
        title: m?.title,
        channelName: m?.channelName,
        published: m?.published ?? j.addedAt,
      };
    }),
  );
  const items = $derived(tab === "feed" ? feedItems : downloadItems);
  const errors = $derived(
    favorites.flatMap((c) => {
      const error = feeds[channelKey(c)]?.error;
      return error ? [`${c.name}: ${error}`] : [];
    }),
  );

  loadFavorites().then(async (list) => {
    favorites = list;
    loaded = true;
    // Cached first so the page fills instantly, then anything stale.
    feeds = await getFeeds(list, { maxAgeMs: Infinity });
    feeds = { ...feeds, ...(await getFeeds(list)) };
  });
  loadSeen().then((s) => (seen = s));
  ext.permissions.contains({ origins: ORIGINS }).then((ok) => (hasAccess = ok));

  $effect(() => {
    if (loaded) saveFavorites($state.snapshot(favorites));
  });

  // Titles for downloads that have dropped out of the feeds.
  const requested = new Set<string>();
  $effect(() => {
    const missing = (companion?.jobs ?? [])
      .map((j) => j.key)
      .filter((k) => !requested.has(k));
    if (!missing.length) return;
    for (const k of missing) requested.add(k);
    loadMeta(missing).then((m) => (meta = { ...untrack(() => meta), ...m }));
  });

  function grant() {
    // Must be called straight from the click, with nothing awaited first.
    ext.permissions.request({ origins: ORIGINS }).then((ok) => {
      hasAccess = ok;
      if (ok) refreshFeeds();
    });
  }

  async function addChannel(e: SubmitEvent) {
    e.preventDefault();
    adding = true;
    addError = "";
    try {
      const ch = await resolveChannel(input);
      if (favorites.some((c) => channelKey(c) === channelKey(ch)))
        throw new Error(`${ch.name} is already a favourite.`);
      favorites.push(ch);
      input = "";
      feeds = { ...feeds, ...(await getFeeds([ch], { force: true })) };
    } catch (err) {
      addError = message(err);
    } finally {
      adding = false;
    }
  }

  function removeChannel(c: Channel) {
    const key = channelKey(c);
    favorites = favorites.filter((x) => channelKey(x) !== key);
    ext.storage.local.remove(feedKey(c));
    editing = undefined;
    if (filter === key) filter = undefined;
  }

  async function refreshChannel(c: Channel) {
    feeds = {
      ...feeds,
      ...(await getFeeds([$state.snapshot(c)], { force: true })),
    };
  }

  async function refreshFeeds() {
    busy = true;
    const fresh = await getFeeds($state.snapshot(favorites), { force: true });
    feeds = { ...feeds, ...fresh };
    busy = false;
  }

  async function checkRules() {
    busy = true;
    const { queued, error } = await runAutoRules();
    notice = error
      ? `Couldn't queue downloads: ${error}`
      : queued
        ? `Queued ${queued} new video${queued === 1 ? "" : "s"}.`
        : "No new videos match your rules.";
    busy = false;
    await refresh();
  }

  async function download(item: Item) {
    const v = byKey.get(item.key);
    if (v) {
      await saveMeta(v);
      meta[item.key] = v;
    }
    try {
      await addDownload({ platform: item.platform, id: item.id });
    } catch (e) {
      notice = message(e);
    }
    await refresh();
  }

  async function remove(item: Item) {
    const job = jobs.get(item.key);
    if (job?.state === "done" && !confirm("Delete this download?")) return;
    try {
      await removeDownload(item.key);
      await removeMeta(item.key);
    } catch (e) {
      notice = message(e);
    }
    await refresh();
  }

  function open(item: Item) {
    if (seenSet.has(item.key)) return;
    seen.push(item.key);
    markSeen(item.key);
  }

  const chip =
    "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1";
  const chipOn =
    "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
  const chipOff =
    "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600";
  const action =
    "cursor-pointer rounded-lg px-3 py-1.5 font-medium hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-800";
</script>

<svelte:head><title>Anti-Spoiler</title></svelte:head>

<div
  class="min-h-screen bg-zinc-50 font-sans text-sm text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
>
  <header
    class="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90"
  >
    <div
      class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6"
    >
      <h1 class="text-base font-semibold">Anti-Spoiler</h1>
      <span
        class="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"
        title={companion?.dir}
      >
        <span
          class={[
            "size-2 rounded-full",
            companion === undefined
              ? "bg-zinc-400"
              : companion === null
                ? "bg-red-500"
                : companion.ytdlp
                  ? "bg-emerald-500"
                  : "bg-amber-500",
          ]}
        ></span>
        {#if companion === undefined}
          Connecting…
        {:else if companion === null}
          Companion offline
        {:else if !companion.ytdlp}
          yt-dlp missing
        {:else}
          Companion ready
        {/if}
      </span>
      <form
        class="flex w-full gap-2 sm:ml-auto sm:w-auto"
        onsubmit={addChannel}
      >
        <input
          bind:value={input}
          placeholder="@LCK, a channel or playlist URL, or a Twitch channel"
          aria-label="Add a favourite channel"
          class="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 sm:w-96 dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          class="cursor-pointer rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={adding || !input.trim()}
          >{adding ? "Adding…" : "Add"}</button
        >
      </form>
    </div>
    {#if addError}
      <p
        class="mx-auto max-w-6xl px-4 pb-3 text-xs text-red-600 sm:px-6 dark:text-red-400"
      >
        {addError}
      </p>
    {/if}
  </header>

  <main class="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
    {#if !hasAccess}
      <div
        class="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950"
      >
        <p class="flex-1">
          Anti-Spoiler needs access to YouTube's feeds and the local companion
          to show your channels.
        </p>
        <button
          type="button"
          class="cursor-pointer rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-500"
          onclick={grant}>Grant access</button
        >
      </div>
    {/if}

    {#if companion === null}
      <p
        class="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
      >
        To download videos, start the companion in the extension's folder:
        <code class="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800"
          >bun run companion</code
        >
      </p>
    {:else if companion && !companion.ytdlp}
      <p
        class="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
      >
        The companion needs yt-dlp:
        <code class="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800"
          >brew install yt-dlp deno</code
        >, then restart it.
      </p>
    {/if}

    {#if favorites.length}
      <nav class="flex flex-wrap items-center gap-2" aria-label="Channels">
        <button
          type="button"
          class={[chip, filter ? chipOff : chipOn]}
          onclick={() => (filter = undefined)}>All</button
        >
        {#each favorites as c (channelKey(c))}
          {@const key = channelKey(c)}
          <div
            class={[
              "flex items-center rounded-full border",
              filter === key ? chipOn : chipOff,
            ]}
          >
            <button
              type="button"
              class="flex cursor-pointer items-center gap-1.5 py-1 pr-1 pl-3"
              onclick={() => (filter = filter === key ? undefined : key)}
            >
              <span
                class={[
                  "size-2 rounded-full",
                  c.platform === "youtube" ? "bg-red-500" : "bg-violet-500",
                ]}
              ></span>
              {c.name}
              {#if c.auto?.enabled}
                <span class="text-emerald-600" title="Auto-download is on"
                  >↓</span
                >
              {/if}
              {#if feeds[key]?.error}
                <span class="text-red-500" title={feeds[key].error}>!</span>
              {/if}
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-full px-2 py-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              aria-label="Edit {c.name}"
              title="Edit"
              onclick={() => (editing = editing === key ? undefined : key)}
              >⋯</button
            >
          </div>
        {/each}
      </nav>
    {/if}

    {#if editIndex >= 0}
      <ChannelEditor
        bind:channel={favorites[editIndex]}
        onfeedchange={() => refreshChannel(favorites[editIndex]!)}
        onremove={() => removeChannel(favorites[editIndex]!)}
        onclose={() => (editing = undefined)}
      />
    {/if}

    <div class="flex flex-wrap items-center gap-2">
      <div
        class="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900"
        role="tablist"
      >
        {#each TABS as [value, text] (value)}
          <button
            type="button"
            role="tab"
            aria-selected={tab === value}
            class={[
              "cursor-pointer rounded-md px-3 py-1 font-medium",
              tab === value
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
            ]}
            onclick={() => (tab = value)}
          >
            {text}
            {#if value === "downloads" && companion?.jobs.length}
              <span class="ml-1 text-xs opacity-60"
                >{companion.jobs.length}</span
              >
            {/if}
          </button>
        {/each}
      </div>
      <span class="ml-auto"></span>
      <button
        type="button"
        class={action}
        disabled={busy || !favorites.length}
        onclick={refreshFeeds}>Refresh</button
      >
      {#if favorites.some((c) => c.auto?.enabled)}
        <button
          type="button"
          class={action}
          disabled={busy || !companion}
          onclick={checkRules}>Check rules now</button
        >
      {/if}
    </div>

    {#if notice}
      <div
        class="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <p class="flex-1">{notice}</p>
        <button
          type="button"
          class="cursor-pointer text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          aria-label="Dismiss"
          onclick={() => (notice = "")}>✕</button
        >
      </div>
    {/if}
    {#if tab === "feed" && errors.length}
      <ul class="space-y-1 text-xs text-red-600 dark:text-red-400">
        {#each errors as e (e)}<li>{e}</li>{/each}
      </ul>
    {/if}

    {#if items.length}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {#each items as item (item.key)}
          <VideoCard
            {item}
            job={jobs.get(item.key)}
            {settings}
            seen={seenSet.has(item.key)}
            {canDownload}
            ondownload={() => download(item)}
            onremove={() => remove(item)}
            onopen={() => open(item)}
          />
        {/each}
      </div>
    {:else if !loaded}
      <!-- Loading favourites; avoids flashing the empty state. -->
    {:else if !favorites.length}
      <div class="py-16 text-center text-zinc-500 dark:text-zinc-400">
        <p class="text-base font-medium text-zinc-900 dark:text-zinc-100">
          No favourites yet
        </p>
        <p class="mt-1">
          Add a channel above, like <code>@LCK</code>,
          <code>@lolesports</code> or <code>twitch.tv/riotgames</code>.
        </p>
      </div>
    {:else}
      <p class="py-16 text-center text-zinc-500 dark:text-zinc-400">
        {tab === "feed"
          ? "No videos yet."
          : companion === null
            ? "Start the companion to see your downloads."
            : "Nothing downloaded yet. Use Download on a video, or turn on auto-download for a channel."}
      </p>
    {/if}
  </main>
</div>
