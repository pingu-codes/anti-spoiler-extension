import { label, normalize } from "../lib/hash";
import type { Site } from "../sites";
import { LABEL_ATTR, TOOLTIP_ATTR } from "./constants";

/**
 * Keeps `LABEL_ATTR` on every title element in sync with its text (the CSS
 * renders it), and swaps `title` tooltips and the tab title for the label.
 * The page's own text is never modified, so the site's framework is unaware.
 */
export function titleHasher(site: Site) {
  const selector = site.titles.join(", ");
  const channelSelector = site.channels.map(([, c]) => c).join(", ");
  const pending = new Set<Element>();
  let scheduled = false;
  let docTitle: { original: string; shown: string } | undefined;

  const text = (el: Element | null | undefined) =>
    normalize(el?.textContent ?? null);

  function channelOf(el: Element) {
    for (const [scope, channel] of site.channels) {
      const name = text(el.closest(scope)?.querySelector(channel));
      if (name) return name;
    }
  }

  function swapTooltip(el: Element | null, value: string) {
    const tip = el?.getAttribute("title");
    if (!el || tip == null || tip === value) return;
    el.setAttribute(TOOLTIP_ATTR, tip);
    el.setAttribute("title", value);
  }

  function process(el: Element) {
    const title = text(el);
    if (!title) return el.removeAttribute(LABEL_ATTR);
    const value = label(title, channelOf(el));
    if (el.getAttribute(LABEL_ATTR) !== value)
      el.setAttribute(LABEL_ATTR, value);
    swapTooltip(el, value);
    swapTooltip(el.closest("a"), value);
  }

  function syncDocumentTitle() {
    const current = document.title;
    const original = current === docTitle?.shown ? docTitle.original : current;
    // Recomputed every time: the channel name may render after the title.
    const page =
      site.pageChannel && text(document.querySelector(site.pageChannel));
    const shown = site.documentTitle?.(original, new URL(location.href), (t) =>
      label(t, page),
    );
    docTitle = shown ? { original, shown } : undefined;
    const next = shown ?? original;
    if (next !== current) document.title = next;
  }

  function flush() {
    scheduled = false;
    for (const el of pending) if (el.isConnected) process(el);
    pending.clear();
    syncDocumentTitle();
  }

  const add = (root: ParentNode | null | undefined) =>
    root?.querySelectorAll(selector).forEach((t) => pending.add(t));

  function queue(node: Node) {
    const el = node instanceof Element ? node : node.parentElement;
    if (!el) return;
    const title = el.closest(selector);
    if (title) pending.add(title);
    // An updated tooltip on a link wrapping a title.
    else if (el.localName === "a") add(el);
    if (node instanceof Element) add(node);
    // A channel name rendered (or changed) after its titles.
    if (channelSelector && el.closest(channelSelector)) {
      for (const [scope] of site.channels) add(el.closest(scope));
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  }

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      queue(r.target);
      r.addedNodes.forEach(queue);
    }
    schedule();
  });

  function start() {
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title"],
    });
    add(document);
    schedule();
  }

  function stop() {
    observer.disconnect();
    pending.clear();
    for (const el of document.querySelectorAll(`[${TOOLTIP_ATTR}]`)) {
      el.setAttribute("title", el.getAttribute(TOOLTIP_ATTR)!);
      el.removeAttribute(TOOLTIP_ATTR);
    }
    if (docTitle && document.title === docTitle.shown)
      document.title = docTitle.original;
    docTitle = undefined;
  }

  let running = false;
  return {
    toggle(on: boolean) {
      if (on === running) return;
      running = on;
      on ? start() : stop();
    },
  };
}
