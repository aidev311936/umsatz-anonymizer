import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LEGACY_KEYS = [
  "bank_mappings_v1",
  "bank_mappings_local_v1",
  "transactions_unified_v1",
  "transactions_unified_masked_v1",
  "anonymization_rules_v1",
  "display_settings_v1",
];

type MutableStorage = Storage & {
  __map: Map<string, string>;
};

function createFakeStorage(): MutableStorage {
  const map = new Map<string, string>();
  return {
    __map: map,
    clear: vi.fn(() => {
      map.clear();
    }),
    getItem: vi.fn((key: string) => (map.has(key) ? map.get(key)! : null)),
    key: vi.fn((index: number) => Array.from(map.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      map.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
    get length() {
      return map.size;
    },
  } as unknown as MutableStorage;
}

function createDeleteDatabaseSpy() {
  return vi.fn(() => {
    const request = {
      onblocked: null as IDBOpenDBRequest["onblocked"],
      onerror: null as IDBOpenDBRequest["onerror"],
      onsuccess: null as IDBOpenDBRequest["onsuccess"],
      readyState: "done" as IDBRequestReadyState,
      result: undefined,
      error: null,
      source: null,
      transaction: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    } as unknown as IDBOpenDBRequest;
    setTimeout(() => {
      request.onsuccess?.(new Event("success"));
    }, 0);
    return request;
  });
}

async function importModule() {
  return import("./sessionScopedStorage");
}

beforeEach(() => {
  vi.resetModules();
  const localStorage = createFakeStorage();
  const sessionStorage = createFakeStorage();
  const deleteDatabase = createDeleteDatabaseSpy();
  const indexedDB = { deleteDatabase } satisfies IDBFactory;
  const fakeWindow = {
    localStorage,
    sessionStorage,
    indexedDB,
  } as unknown as Window & { indexedDB: IDBFactory };
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("sessionStorage", sessionStorage);
  vi.stubGlobal("indexedDB", indexedDB);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("purgeLegacyPersistentStorage", () => {
  it("removes legacy data from persistent storage", async () => {
    const module = await importModule();
    const { purgeLegacyPersistentStorage } = module;
    const localStorage = globalThis.localStorage as MutableStorage;
    const deleteDatabase = (globalThis.indexedDB as IDBFactory).deleteDatabase as ReturnType<
      typeof createDeleteDatabaseSpy
    >;

    for (const key of LEGACY_KEYS) {
      localStorage.setItem(key, "value");
    }

    await purgeLegacyPersistentStorage();

    expect(deleteDatabase).toHaveBeenCalledWith("umsatz_anonymizer");
    for (const key of LEGACY_KEYS) {
      expect(localStorage.removeItem).toHaveBeenCalledWith(key);
    }
    expect(localStorage.__map.size).toBe(0);
  });

  it("only purges legacy data once per session", async () => {
    const module = await importModule();
    const { purgeLegacyPersistentStorage } = module;
    const deleteDatabase = (globalThis.indexedDB as IDBFactory).deleteDatabase as ReturnType<
      typeof createDeleteDatabaseSpy
    >;

    await purgeLegacyPersistentStorage();
    await purgeLegacyPersistentStorage();

    expect(deleteDatabase).toHaveBeenCalledTimes(1);
  });
});
