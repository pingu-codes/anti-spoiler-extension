<script lang="ts">
  import { seek } from "../lib/seek";

  let { video, player }: { video: HTMLVideoElement; player: HTMLElement } =
    $props();

  const STEPS = [600, 60, 10];
  const label = (s: number) => (s >= 60 ? `${s / 60}m` : `${s}s`);

  // Live streams report an infinite (or absurdly large) duration.
  const isSeekable = () =>
    Number.isFinite(video.duration) &&
    video.duration > 0 &&
    video.duration < 1e6;

  let seekable = $state(false);
  let paused = $state(false);
  let active = $state(true);

  $effect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const poke = () => {
      active = true;
      clearTimeout(timer);
      timer = setTimeout(() => (active = false), 2500);
    };
    const leave = () => {
      clearTimeout(timer);
      active = false;
    };
    const sync = () => {
      seekable = isSeekable();
      paused = video.paused;
    };
    const videoEvents = ["durationchange", "loadedmetadata", "play", "pause"];
    sync();
    poke();
    player.addEventListener("mousemove", poke);
    player.addEventListener("mouseleave", leave);
    for (const e of videoEvents) video.addEventListener(e, sync);
    return () => {
      clearTimeout(timer);
      player.removeEventListener("mousemove", poke);
      player.removeEventListener("mouseleave", leave);
      for (const e of videoEvents) video.removeEventListener(e, sync);
    };
  });
</script>

{#if seekable}
  <div
    class={[
      "pointer-events-none absolute inset-x-0 bottom-16 flex justify-center transition-opacity duration-200",
      active || paused ? "opacity-100" : "opacity-0",
    ]}
  >
    <div
      class="pointer-events-auto flex gap-1 rounded-full bg-black/70 p-1 font-sans text-sm font-medium text-white tabular-nums backdrop-blur-sm"
    >
      {#each STEPS as s (s)}
        {@render button(-s, `−${label(s)}`)}
      {/each}
      <span class="mx-1 w-px self-stretch bg-white/25"></span>
      {#each STEPS.toReversed() as s (s)}
        {@render button(s, `+${label(s)}`)}
      {/each}
    </div>
  </div>
{/if}

{#snippet button(delta: number, text: string)}
  <!-- mousedown is cancelled so focus (and keyboard shortcuts) stay with the player. -->
  <button
    type="button"
    tabindex="-1"
    title="{delta < 0 ? 'Back' : 'Forward'} {label(Math.abs(delta))}"
    class="cursor-pointer rounded-full px-3 py-1.5 hover:bg-white/20 active:bg-white/35"
    onmousedown={(e) => e.preventDefault()}
    onclick={() => seek(video, delta)}>{text}</button
  >
{/snippet}
