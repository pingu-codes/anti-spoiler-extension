<script lang="ts">
  import Controls from "../content/Controls.svelte";
  import type { StateResponse } from "../lib/api";
  import { hashTitle, label, normalize } from "../lib/hash";
  import {
    clearResume,
    loadMeta,
    loadResume,
    markSeen,
    saveResume,
    type VideoMeta,
  } from "../lib/local";
  import { seek } from "../lib/seek";
  import { isOn, type Settings } from "../lib/settings";

  let {
    key,
    settings,
    companion,
  }: {
    key: string;
    settings: Settings;
    companion: StateResponse | null | undefined;
  } = $props();

  const job = $derived(companion?.jobs.find((j) => j.key === key));
  // Pinned once known: the token in the URL changes when the companion
  // restarts, and a new src would restart playback from the beginning.
  let src = $state<string>();
  $effect(() => {
    if (!src && job?.src) src = job.src;
  });

  let meta = $state<VideoMeta>();
  $effect(() => {
    loadMeta([key]).then((m) => (meta = m[key]));
  });

  const hashed = $derived(isOn(settings, "titles"));
  const title = $derived(
    meta ? (hashed ? hashTitle(normalize(meta.title)) : meta.title) : key,
  );
  const tabTitle = $derived(
    meta && hashed ? label(normalize(meta.title), meta.channelName) : title,
  );
  // With progress hidden there's no seek bar, so the skip buttons always show.
  const native = $derived(!isOn(settings, "progress"));
  const skips = $derived(!native || isOn(settings, "controls"));

  let video = $state<HTMLVideoElement>();
  let wrapper = $state<HTMLDivElement>();
  let paused = $state(true);
  let muted = $state(false);
  let volume = $state(1);
  let active = $state(true);
  let fullscreen = $state(false);
  let failed = $state(false);

  let idle: ReturnType<typeof setTimeout>;
  function poke() {
    active = true;
    clearTimeout(idle);
    idle = setTimeout(() => (active = false), 2500);
  }

  const toggle = () => (video?.paused ? video.play() : video?.pause());
  const toggleFullscreen = () =>
    document.fullscreenElement
      ? document.exitFullscreen()
      : wrapper?.requestFullscreen();

  async function restore() {
    const t = await loadResume(key);
    if (video && t > 0 && t < video.duration - 10) video.currentTime = t;
  }

  let lastSave = 0;
  function persist(force = false) {
    if (!video?.currentTime || video.ended) return;
    if (!force && Date.now() - lastSave < 5000) return;
    lastSave = Date.now();
    saveResume(key, video.currentTime);
  }

  // OS media controls (macOS Now Playing, Chrome's media hub) would otherwise
  // show the real title and a scrubber with the length.
  function mediaSession() {
    if (native || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({
      title,
      artist: meta?.channelName ?? "Anti-Spoiler",
    });
    try {
      ms.setPositionState({ duration: Infinity, position: 0, playbackRate: 1 });
    } catch {}
    ms.setActionHandler("seekbackward", () => video && seek(video, -10));
    ms.setActionHandler("seekforward", () => video && seek(video, 10));
  }

  let marked = false;
  function onplay() {
    mediaSession();
    if (!marked) markSeen(key);
    marked = true;
  }

  function onkeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (!video || e.metaKey || e.ctrlKey || e.altKey) return;
    if (target.closest("input, textarea")) return;
    // Native controls handle their own keys when the video has focus.
    if (native && target === video) return;
    const v = video;
    const keys: Record<string, () => unknown> = {
      " ": toggle,
      k: toggle,
      ArrowLeft: () => seek(v, -10),
      j: () => seek(v, -10),
      ArrowRight: () => seek(v, 10),
      l: () => seek(v, 10),
      ArrowUp: () => (v.volume = Math.min(1, v.volume + 0.1)),
      ArrowDown: () => (v.volume = Math.max(0, v.volume - 0.1)),
      m: () => (v.muted = !v.muted),
      f: toggleFullscreen,
    };
    const run = keys[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!run) return;
    e.preventDefault();
    run();
    poke();
  }

  const button =
    "cursor-pointer rounded-lg p-2 text-white hover:bg-white/15 active:bg-white/25";
</script>

<svelte:head><title>{tabTitle}</title></svelte:head>
<svelte:window {onkeydown} onpagehide={() => persist(true)} />
<svelte:document
  onfullscreenchange={() => (fullscreen = !!document.fullscreenElement)}
/>

<div class="flex h-screen flex-col bg-black font-sans text-sm text-zinc-100">
  {#if !fullscreen}
    <header class="flex items-center gap-3 px-4 py-3">
      <a
        href="#/"
        class="rounded-lg px-2 py-1 text-zinc-400 hover:bg-white/10 hover:text-white"
        >← Home</a
      >
      <div class="min-w-0">
        <p class={["truncate font-medium", hashed && meta && "font-mono"]}>
          {title}
        </p>
        {#if meta}
          <p class="truncate text-xs text-zinc-400">{meta.channelName}</p>
        {/if}
      </div>
    </header>
  {/if}

  {#if src && !failed}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={wrapper}
      class={[
        "relative flex-1 overflow-hidden bg-black",
        !active && !paused && "cursor-none",
      ]}
      onmousemove={poke}
      onmouseleave={() => (active = false)}
    >
      <!-- svelte-ignore a11y_media_has_caption, a11y_click_events_have_key_events -->
      <video
        bind:this={video}
        bind:paused
        bind:muted
        bind:volume
        {src}
        autoplay
        controls={native}
        class="absolute inset-0 size-full"
        onclick={() => !native && toggle()}
        ondblclick={toggleFullscreen}
        onloadedmetadata={restore}
        ontimeupdate={() => persist()}
        onpause={() => persist(true)}
        {onplay}
        onseeked={mediaSession}
        onended={() => clearResume(key)}
        onerror={() => (failed = true)}
      ></video>

      {#if video && wrapper && skips}
        <Controls {video} player={wrapper} />
      {/if}

      {#if !native}
        <div
          class={[
            "absolute inset-x-0 bottom-0 flex items-center gap-1 bg-linear-to-t from-black/80 to-transparent px-4 pt-12 pb-3 transition-opacity duration-200",
            active || paused ? "opacity-100" : "pointer-events-none opacity-0",
          ]}
        >
          <button
            type="button"
            class={button}
            aria-label={paused ? "Play" : "Pause"}
            onmousedown={(e) => e.preventDefault()}
            onclick={toggle}
          >
            {#if paused}
              <svg viewBox="0 0 20 20" fill="currentColor" class="size-5"
                ><path
                  d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.34-5.89a1.5 1.5 0 0 0 0-2.54L6.3 2.84Z"
                /></svg
              >
            {:else}
              <svg viewBox="0 0 20 20" fill="currentColor" class="size-5"
                ><path
                  d="M5.75 3a.75.75 0 0 0-.75.75v12.5c0 .41.34.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75A.75.75 0 0 0 7.25 3h-1.5ZM12.75 3a.75.75 0 0 0-.75.75v12.5c0 .41.34.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-1.5Z"
                /></svg
              >
            {/if}
          </button>
          <button
            type="button"
            class={button}
            aria-label={muted ? "Unmute" : "Mute"}
            onmousedown={(e) => e.preventDefault()}
            onclick={() => (muted = !muted)}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" class="size-5"
              ><path
                d="M10.5 3.75a.75.75 0 0 0-1.26-.55L5.6 6.5H3.75A1.75 1.75 0 0 0 2 8.25v3.5c0 .97.78 1.75 1.75 1.75H5.6l3.64 3.3a.75.75 0 0 0 1.26-.55V3.75Z"
              />{#if !muted && volume > 0}<path
                  d="M13.2 6.8a.75.75 0 0 1 1.06 0 4.5 4.5 0 0 1 0 6.4.75.75 0 1 1-1.06-1.06 3 3 0 0 0 0-4.28.75.75 0 0 1 0-1.06Z"
                />{:else}<path
                  d="M13.28 7.22a.75.75 0 1 0-1.06 1.06L13.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L15 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L16.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L15 8.94l-1.72-1.72Z"
                />{/if}</svg
            >
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            aria-label="Volume"
            class="w-24 accent-white"
            bind:value={volume}
            oninput={() => (muted = false)}
          />
          <span class="flex-1"></span>
          <button
            type="button"
            class={button}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            onmousedown={(e) => e.preventDefault()}
            onclick={toggleFullscreen}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" class="size-5"
              ><path
                d="M3 4.25C3 3.56 3.56 3 4.25 3h3a.75.75 0 0 1 0 1.5H4.5v2.75a.75.75 0 0 1-1.5 0v-3ZM12 3.75c0-.41.34-.75.75-.75h3c.69 0 1.25.56 1.25 1.25v3a.75.75 0 0 1-1.5 0V4.5h-2.75a.75.75 0 0 1-.75-.75ZM3.75 12c.41 0 .75.34.75.75v2.75h2.75a.75.75 0 0 1 0 1.5h-3C3.56 17 3 16.44 3 15.75v-3c0-.41.34-.75.75-.75ZM16.25 12c.41 0 .75.34.75.75v3c0 .69-.56 1.25-1.25 1.25h-3a.75.75 0 0 1 0-1.5h2.75v-2.75c0-.41.34-.75.75-.75Z"
              /></svg
            >
          </button>
        </div>
      {/if}
    </div>
  {:else}
    <div
      class="flex flex-1 items-center justify-center px-6 text-center text-zinc-400"
    >
      {#if failed}
        Couldn't load the video. Is the companion still running?
      {:else if companion === undefined}
        Connecting to the companion…
      {:else if companion === null}
        The companion isn't running. Start it with <code
          class="mx-1 rounded bg-white/10 px-1.5 py-0.5">bun run companion</code
        >
      {:else if !job}
        This video isn't downloaded.
      {:else if job.state === "downloading"}
        Still downloading ({Math.floor(job.progress ?? 0)}%).
      {:else}
        Not downloaded yet.
      {/if}
    </div>
  {/if}
</div>
