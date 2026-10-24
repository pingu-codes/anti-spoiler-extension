<script lang="ts">
  let {
    checked = $bindable(),
    disabled = false,
    label,
  }: { checked: boolean; disabled?: boolean; label: string } = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={() => (checked = !checked)}
  class={[
    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
    checked ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600",
  ]}
>
  <span
    class={[
      "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform",
      checked && "translate-x-4",
    ]}
  ></span>
</button>
