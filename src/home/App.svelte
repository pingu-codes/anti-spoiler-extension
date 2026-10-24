<script lang="ts">
  import type { StateResponse } from "../lib/api";
  import { getState } from "../lib/companion";
  import {
    loadSettings,
    onSettingsChange,
    type Settings,
  } from "../lib/settings";
  import Home from "./Home.svelte";
  import Watch from "./Watch.svelte";

  let settings = $state<Settings>();
  // undefined until the first poll; null while the companion isn't running.
  let companion = $state<StateResponse | null>();
  let hash = $state(location.hash);
  const watching = $derived(/^#watch\/([\w-]+)$/.exec(hash)?.[1]);

  loadSettings().then((s) => (settings = s));
  onSettingsChange((s) => (settings = s));

  async function refresh() {
    companion = await getState().catch(() => null);
  }

  $effect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 3000);
    return () => clearInterval(timer);
  });
</script>

<svelte:window onhashchange={() => (hash = location.hash)} />

{#if settings}
  {#if watching}
    {#key watching}
      <Watch key={watching} {settings} {companion} />
    {/key}
  {:else}
    <Home {settings} {companion} {refresh} />
  {/if}
{/if}
