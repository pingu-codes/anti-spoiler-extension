<script lang="ts">
  import type { AutoRule, Channel, FeedKind } from "../lib/favorites";
  import Toggle from "../popup/Toggle.svelte";

  let {
    channel = $bindable(),
    onfeedchange,
    onremove,
    onclose,
  }: {
    channel: Channel;
    onfeedchange: () => void;
    onremove: () => void;
    onclose: () => void;
  } = $props();

  const FEEDS: { value: FeedKind; label: string }[] = [
    { value: "live", label: "Full broadcasts" },
    { value: "uploads", label: "Uploads" },
    { value: "all", label: "Both" },
  ];

  const href = $derived(
    channel.platform === "twitch"
      ? `https://www.twitch.tv/${channel.id}/videos`
      : channel.kind === "playlist"
        ? `https://www.youtube.com/playlist?list=${channel.id}`
        : `https://www.youtube.com/channel/${channel.id}`,
  );

  let keywords = $state(channel.auto?.keywords?.join(", ") ?? "");

  function setRule(patch: Partial<AutoRule>) {
    channel.auto = {
      enabled: false,
      since: Date.now(),
      ...channel.auto,
      ...patch,
    };
  }

  function setKeywords(text: string) {
    keywords = text;
    const list = text
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    setRule({ keywords: list.length ? list : undefined });
  }

  const field =
    "rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-950";
</script>

<section
  class="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
>
  <header class="flex items-center gap-3">
    <h2 class="font-semibold">{channel.name}</h2>
    <a
      {href}
      target="_blank"
      rel="noreferrer"
      class="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
      >Open on {channel.platform === "youtube" ? "YouTube" : "Twitch"}</a
    >
    <button
      type="button"
      class="ml-auto cursor-pointer rounded-lg px-3 py-1.5 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
      onclick={onclose}>Done</button
    >
  </header>

  {#if channel.platform === "youtube" && channel.kind === "channel"}
    <div class="space-y-1.5">
      <p class="font-medium">Show</p>
      <div
        class="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
      >
        {#each FEEDS as f (f.value)}
          <button
            type="button"
            class={[
              "cursor-pointer rounded-md px-3 py-1",
              (channel.feed ?? "all") === f.value
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800",
            ]}
            onclick={() => {
              channel.feed = f.value;
              onfeedchange();
            }}>{f.label}</button
          >
        {/each}
      </div>
      <p class="text-xs text-zinc-500 dark:text-zinc-400">
        Full broadcasts are safest for esports: separate uploads per game give
        away how long a series went.
      </p>
    </div>
  {/if}

  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="font-medium">Auto-download new videos</p>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          Checked every 30 minutes while the browser is open. Only videos
          published after you switch this on.
        </p>
      </div>
      <Toggle
        label="Auto-download"
        bind:checked={
          () => channel.auto?.enabled ?? false,
          (on) =>
            setRule(
              on ? { enabled: true, since: Date.now() } : { enabled: false },
            )
        }
      />
    </div>

    {#if channel.auto?.enabled}
      <div class="grid gap-3 sm:grid-cols-[auto_1fr]">
        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium">Minimum length (minutes)</span>
          <input
            type="number"
            min="0"
            step="5"
            placeholder="Any"
            class="{field} w-32"
            value={channel.auto.minMinutes ?? ""}
            oninput={(e) =>
              setRule({
                minMinutes: Number(e.currentTarget.value) || undefined,
              })}
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium">
            Title contains any of (comma-separated)
          </span>
          <input
            type="text"
            placeholder="e.g. LCK, Full VOD"
            class={field}
            value={keywords}
            oninput={(e) => setKeywords(e.currentTarget.value)}
          />
        </label>
      </div>
      <p class="text-xs text-zinc-500 dark:text-zinc-400">
        Lengths are checked by the companion and never shown.
      </p>
    {/if}
  </div>

  <button
    type="button"
    class="cursor-pointer text-xs font-medium text-red-600 hover:underline dark:text-red-400"
    onclick={() => {
      if (confirm(`Remove ${channel.name} from favourites?`)) onremove();
    }}>Remove channel</button
  >
</section>
