import { computeUnifiedTxHash } from "../transactionHash";
import { UnifiedTx } from "../types";

export type StoredTransaction = UnifiedTx & { hash: string };

type PrepareEntries = (entries: UnifiedTx[], source?: UnifiedTx[]) => Promise<StoredTransaction[]>;

export type SessionScopedStore = {
  loadSnapshot: () => Promise<StoredTransaction[]>;
  storeMany: (entries: UnifiedTx[], source?: UnifiedTx[]) => Promise<StoredTransaction[]>;
  addIfMissing: (entry: UnifiedTx) => Promise<boolean>;
};

type StorageBackend = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const memoryFallback = new Map<string, string>();
let backend: StorageBackend | null = null;
let usingMemoryFallback = false;

function getBackend(): StorageBackend {
  if (backend) {
    return backend;
  }

  if (typeof window !== "undefined") {
    try {
      const storage = window.sessionStorage;
      const testKey = "umsatz_anonymizer__session_scoped_storage_test";
      storage.setItem(testKey, "ok");
      storage.removeItem(testKey);
      backend = {
        getItem: (key) => storage.getItem(key),
        setItem: (key, value) => storage.setItem(key, value),
        removeItem: (key) => storage.removeItem(key),
      } satisfies StorageBackend;
      return backend;
    } catch (error) {
      console.warn("Session storage is not available – falling back to in-memory storage.", error);
    }
  }

  usingMemoryFallback = true;
  backend = {
    getItem: (key) => memoryFallback.get(key) ?? null,
    setItem: (key, value) => {
      memoryFallback.set(key, value);
    },
    removeItem: (key) => {
      memoryFallback.delete(key);
    },
  } satisfies StorageBackend;
  return backend;
}

export function sessionScopedGetItem(key: string): string | null {
  return getBackend().getItem(key);
}

export function sessionScopedSetItem(key: string, value: string): void {
  getBackend().setItem(key, value);
}

export function sessionScopedRemoveItem(key: string): void {
  getBackend().removeItem(key);
}

export function clearAllSessionScopedStorage(): void {
  memoryFallback.clear();

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.clear();
  } catch (error) {
    if (!usingMemoryFallback) {
      console.warn("Failed to clear session storage", error);
    }
  }
}

function getIndexKey(storeName: string): string {
  return `${storeName}:index`;
}

function getEntryKey(storeName: string, hash: string): string {
  return `${storeName}:${hash}`;
}

function readIndex(storeName: string): string[] {
  const raw = getBackend().getItem(getIndexKey(storeName));
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
      return [...new Set(parsed)];
    }
  } catch (error) {
    console.warn(`Failed to parse session storage index for ${storeName}`, error);
  }
  return [];
}

function writeIndex(storeName: string, hashes: string[]): void {
  const backendInstance = getBackend();
  backendInstance.setItem(getIndexKey(storeName), JSON.stringify(hashes));
}

function cloneUnifiedTx(tx: UnifiedTx): UnifiedTx {
  return {
    bank_name: tx.bank_name,
    booking_amount: tx.booking_amount,
    booking_date: tx.booking_date,
    booking_date_iso: tx.booking_date_iso,
    booking_date_raw: tx.booking_date_raw,
    booking_text: tx.booking_text,
    booking_type: tx.booking_type,
    booking_account: typeof tx.booking_account === "string" ? tx.booking_account : "",
    booking_hash:
      typeof (tx as UnifiedTx & { booking_hash?: unknown }).booking_hash === "string"
        ? (tx as UnifiedTx & { booking_hash?: string }).booking_hash
        : undefined,
  };
}

// Builds a deterministic key we can reuse to map source transactions to their
// masked counterparts. The resulting string is only used internally to group
// items that share the same identifying fields so we can keep reusing the hash
// that was already computed for a matching source entry.
function transactionLinkKey(entry: UnifiedTx): string {
  return [
    entry.bank_name,
    entry.booking_date_raw,
    entry.booking_type,
    entry.booking_amount,
    entry.booking_account ?? "",
  ].join("|");
}

async function prepareStoredTransactions(entries: UnifiedTx[]): Promise<StoredTransaction[]> {
  const unique: StoredTransaction[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const unified = cloneUnifiedTx(entry);
    const hash =
      typeof (entry as UnifiedTx & { booking_hash?: unknown }).booking_hash === "string" &&
      (entry as UnifiedTx & { booking_hash?: string }).booking_hash.length > 0
        ? (entry as UnifiedTx & { booking_hash?: string }).booking_hash
        : await computeUnifiedTxHash(unified);
    unified.booking_hash = hash;
    if (seen.has(hash)) {
      continue;
    }
    seen.add(hash);
    unique.push({ ...unified, hash });
  }
  return unique;
}

async function buildHashQueues(source: UnifiedTx[]): Promise<Map<string, string[]>> {
  const hashes = await Promise.all(
    source.map((entry) => {
      if (
        typeof (entry as UnifiedTx & { booking_hash?: unknown }).booking_hash === "string" &&
        (entry as UnifiedTx & { booking_hash?: string }).booking_hash.length > 0
      ) {
        return Promise.resolve((entry as UnifiedTx & { booking_hash?: string }).booking_hash);
      }
      return computeUnifiedTxHash(entry);
    }),
  );
  const queues = new Map<string, string[]>();
  hashes.forEach((hash, index) => {
    const key = transactionLinkKey(source[index]);
    const queue = queues.get(key);
    if (queue) {
      queue.push(hash);
    } else {
      queues.set(key, [hash]);
    }
  });
  return queues;
}

function takeHashForEntry(queues: Map<string, string[]>, entry: UnifiedTx): string | null {
  const key = transactionLinkKey(entry);
  const queue = queues.get(key);
  if (!queue || queue.length === 0) {
    return null;
  }
  const [hash] = queue.splice(0, 1);
  if (queue.length === 0) {
    queues.delete(key);
  }
  return hash;
}

async function prepareMaskedStoredTransactions(
  entries: UnifiedTx[],
  source?: UnifiedTx[],
): Promise<StoredTransaction[]> {
  const sourceQueues = source ? await buildHashQueues(source.map(cloneUnifiedTx)) : null;
  const prepared: StoredTransaction[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const unified = cloneUnifiedTx(entry);
    let hash: string | null =
      typeof (entry as UnifiedTx & { booking_hash?: unknown }).booking_hash === "string" &&
      (entry as UnifiedTx & { booking_hash?: string }).booking_hash.length > 0
        ? (entry as UnifiedTx & { booking_hash?: string }).booking_hash
        : null;
    if (!hash && sourceQueues) {
      hash = takeHashForEntry(sourceQueues, unified);
    }
    if (!hash) {
      hash = await computeUnifiedTxHash(unified);
    }
    unified.booking_hash = hash;
    if (seen.has(hash)) {
      continue;
    }
    seen.add(hash);
    prepared.push({ ...unified, hash });
  }
  return prepared;
}

function serializeEntry(entry: UnifiedTx): string {
  return JSON.stringify(cloneUnifiedTx(entry));
}

function deserializeEntry(serialized: string): UnifiedTx | null {
  try {
    const parsed = JSON.parse(serialized) as Partial<UnifiedTx>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return cloneUnifiedTx(parsed as UnifiedTx);
  } catch (error) {
    console.warn("Failed to parse transaction from session storage", error);
    return null;
  }
}

function createSessionScopedStore(
  storeName: "raw_transactions" | "masked_transactions",
  prepareEntries: PrepareEntries,
): SessionScopedStore {
  return {
    async loadSnapshot(): Promise<StoredTransaction[]> {
      const hashes = readIndex(storeName);
      const backendInstance = getBackend();
      const results: StoredTransaction[] = [];
      for (const hash of hashes) {
        const raw = backendInstance.getItem(getEntryKey(storeName, hash));
        if (!raw) {
          continue;
        }
        const unified = deserializeEntry(raw);
        if (!unified) {
          continue;
        }
        results.push({ ...unified, hash });
      }
      return results;
    },

    async storeMany(entries: UnifiedTx[], source?: UnifiedTx[]): Promise<StoredTransaction[]> {
      const prepared = await prepareEntries(entries, source);
      const backendInstance = getBackend();
      const previousIndex = readIndex(storeName);
      const nextIndex: string[] = [];
      const retained = new Set<string>();

      for (const entry of prepared) {
        retained.add(entry.hash);
        nextIndex.push(entry.hash);
        backendInstance.setItem(getEntryKey(storeName, entry.hash), serializeEntry(entry));
      }

      for (const hash of previousIndex) {
        if (!retained.has(hash)) {
          backendInstance.removeItem(getEntryKey(storeName, hash));
        }
      }

      writeIndex(storeName, nextIndex);
      return prepared;
    },

    async addIfMissing(entry: UnifiedTx): Promise<boolean> {
      const unified = cloneUnifiedTx(entry);
      const hash = await computeUnifiedTxHash(unified);
      unified.booking_hash = hash;
      const backendInstance = getBackend();
      const key = getEntryKey(storeName, hash);
      if (backendInstance.getItem(key) !== null) {
        return false;
      }
      backendInstance.setItem(key, serializeEntry(unified));
      const hashes = readIndex(storeName);
      hashes.push(hash);
      writeIndex(storeName, [...new Set(hashes)]);
      return true;
    },
  };
}

export const rawTransactionsSessionStorage = createSessionScopedStore(
  "raw_transactions",
  (entries) => prepareStoredTransactions(entries),
);

export const maskedTransactionsSessionStorage = createSessionScopedStore(
  "masked_transactions",
  prepareMaskedStoredTransactions,
);

export function __isUsingSessionStorageFallbackForTests(): boolean {
  return usingMemoryFallback;
}

export const sessionScopedStorageAdapter = {
  clearAll: clearAllSessionScopedStorage,
};

