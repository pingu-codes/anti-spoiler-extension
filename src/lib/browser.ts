// Minimal typings for the slice of the WebExtension API we use. Firefox exposes
// a promise-based `browser`; Chromium's MV3 `chrome` returns promises too.

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface ExtensionApi {
  storage: {
    sync: StorageArea;
    onChanged: {
      addListener(
        cb: (changes: Record<string, StorageChange>, area: string) => void,
      ): void;
    };
  };
}

const g = globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi };

export const ext = (g.browser ?? g.chrome) as ExtensionApi;
