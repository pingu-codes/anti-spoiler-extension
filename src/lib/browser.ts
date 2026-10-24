// Minimal typings for the slice of the WebExtension API we use. Firefox exposes
// a promise-based `browser`; Chromium's MV3 `chrome` returns promises too.

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

interface StorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface ExtEvent<T extends (...args: any[]) => unknown> {
  addListener(cb: T): void;
}

interface Alarm {
  name: string;
}

interface Permissions {
  origins?: string[];
}

interface ExtensionApi {
  storage: {
    sync: StorageArea;
    local: StorageArea;
    onChanged: ExtEvent<
      (changes: Record<string, StorageChange>, area: string) => void
    >;
  };
  runtime: {
    openOptionsPage(): Promise<void>;
    onStartup: ExtEvent<() => void>;
  };
  alarms: {
    get(name: string): Promise<Alarm | undefined>;
    create(name: string, info: { periodInMinutes: number }): unknown;
    onAlarm: ExtEvent<(alarm: Alarm) => unknown>;
  };
  permissions: {
    contains(p: Permissions): Promise<boolean>;
    request(p: Permissions): Promise<boolean>;
  };
}

const g = globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi };

export const ext = (g.browser ?? g.chrome) as ExtensionApi;
