<script lang="ts">
  import {
    FEATURES,
    loadSettings,
    saveSettings,
    type Settings,
  } from "../lib/settings";
  import { ext } from "../lib/browser";
  import Toggle from "./Toggle.svelte";

  let settings = $state<Settings>();

  loadSettings().then((s) => (settings = s));

  $effect(() => {
    if (settings) saveSettings($state.snapshot(settings));
  });
</script>

<main
  class="w-80 bg-white p-4 font-sans text-sm text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
>
  {#if settings}
    <header class="mb-3 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-base font-semibold">Anti-Spoiler</h1>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          YouTube &amp; Twitch
        </p>
      </div>
      <Toggle bind:checked={settings.enabled} label="Enable Anti-Spoiler" />
    </header>

    <ul
      class="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700"
    >
      {#each FEATURES as f (f.key)}
        <li
          class={[
            "flex items-center justify-between gap-3 px-3 py-2.5",
            !settings.enabled && "opacity-50",
          ]}
        >
          <div>
            <p class="font-medium">{f.label}</p>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              {f.description}
            </p>
          </div>
          <Toggle
            bind:checked={settings[f.key]}
            disabled={!settings.enabled}
            label={f.label}
          />
        </li>
      {/each}
    </ul>

    <button
      type="button"
      class="mt-3 w-full cursor-pointer rounded-lg bg-zinc-900 px-3 py-2 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      onclick={() => ext.runtime.openOptionsPage().then(() => window.close())}
    >
      Open home
    </button>
  {/if}
</main>
