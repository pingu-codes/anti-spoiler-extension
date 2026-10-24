declare module "*.svelte" {
  import type { Component } from "svelte";
  const component: Component<any>;
  export default component;
}

/** Compiled Tailwind CSS for the skip controls, inlined at build time. */
declare const __OVERLAY_CSS__: string;
