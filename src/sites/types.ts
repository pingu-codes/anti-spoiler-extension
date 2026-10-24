export interface Site {
  /** Used for output file names (`<name>.js`, `<name>.css`). */
  name: string;
  matches: string[];
  allFrames?: boolean;

  /** Images / background-image elements rendered as a flat blank tile. */
  thumbnails: string[];
  /** Animated hover previews etc. that are removed entirely. */
  previews: string[];
  /** Elements whose text is replaced by a label: channel + hash of the text. */
  titles: string[];
  /**
   * How to find the channel a title belongs to, as `[scope, channel]` pairs:
   * the channel name is the text of `channel` inside the title's closest
   * `scope`. The first pair that yields a name wins.
   */
  channels: [scope: string, channel: string][];
  /** Channel name on a video page, used for the tab title. */
  pageChannel?: string;
  /** Seek bars, durations, chapters, resume bars. Removed entirely. */
  progress: string[];

  /**
   * Return the tab title to show, or null to leave it alone. `label` turns a
   * video title into its label (page channel + hash).
   */
  documentTitle?(
    title: string,
    url: URL,
    label: (title: string) => string,
  ): string | null;

  /** Whether the skip controls belong on this page. */
  showControls(url: URL): boolean;
  /** Ancestor of the <video> to mount the skip controls into. */
  player: string;
  /** Extra page CSS, e.g. hiding the controls during ads. */
  css?: string;
}
