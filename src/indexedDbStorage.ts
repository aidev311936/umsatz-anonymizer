import { UnifiedTx } from "./types.js";

const DB_NAME = "umsatz_anonymizer";
const DB_VERSION = 1;
const RAW_STORE = "raw_transactions";
const MASKED_STORE = "masked_transactions";

type StoreName = typeof RAW_STORE | typeof MASKED_STORE;

interface IndexedDbSnapshot {
  rawTransactions: UnifiedTx[];
  maskedTransactions: UnifiedTx[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new Error("IndexedDB is not supported in this environment."));
    }
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(RAW_STORE)) {
          database.createObjectStore(RAW_STORE, { autoIncrement: true });
        }
        if (!database.objectStoreNames.contains(MASKED_STORE)) {
          database.createObjectStore(MASKED_STORE, { autoIncrement: true });
        }
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error ?? new Error("Failed to open IndexedDB."));
      };
      request.onblocked = () => {
        console.warn("IndexedDB upgrade blocked. Close other tabs using the app to proceed.");
      };
    });
  }
  return dbPromise;
}

function getAllFromStore(storeName: StoreName): Promise<UnifiedTx[]> {
  return openDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => {
          const result = Array.isArray(request.result) ? (request.result as UnifiedTx[]) : [];
          resolve(result.map(cloneTransaction));
        };
        request.onerror = () => {
          reject(request.error ?? new Error("Failed to read from IndexedDB."));
        };
      }),
  );
}

function runTransaction(storeName: StoreName, mode: IDBTransactionMode, work: (store: IDBObjectStore) => void): Promise<void> {
  return openDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = () => {
          reject(transaction.error ?? new Error("IndexedDB transaction failed."));
        };
        transaction.onabort = () => {
          reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
        };
        try {
          work(store);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }),
  );
}

function cloneTransaction(tx: UnifiedTx): UnifiedTx {
  return {
    bank_name: tx.bank_name,
    booking_amount: tx.booking_amount,
    booking_date: tx.booking_date,
    booking_date_iso: tx.booking_date_iso,
    booking_date_raw: tx.booking_date_raw,
    booking_text: tx.booking_text,
    booking_type: tx.booking_type,
  };
}

export async function initializeIndexedDbStorage(): Promise<IndexedDbSnapshot> {
  const [rawTransactions, maskedTransactions] = await Promise.all([
    getAllFromStore(RAW_STORE),
    getAllFromStore(MASKED_STORE),
  ]);
  return {
    rawTransactions,
    maskedTransactions,
  };
}

export async function storeRawTransactions(entries: UnifiedTx[]): Promise<void> {
  await runTransaction(RAW_STORE, "readwrite", (store) => {
    store.clear();
    for (const entry of entries) {
      store.add(cloneTransaction(entry));
    }
  });
}

export async function appendRawTransactions(entries: UnifiedTx[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  await runTransaction(RAW_STORE, "readwrite", (store) => {
    for (const entry of entries) {
      store.add(cloneTransaction(entry));
    }
  });
}

export async function clearRawTransactions(): Promise<void> {
  await runTransaction(RAW_STORE, "readwrite", (store) => {
    store.clear();
  });
}

export async function storeMaskedTransactions(entries: UnifiedTx[]): Promise<void> {
  await runTransaction(MASKED_STORE, "readwrite", (store) => {
    store.clear();
    for (const entry of entries) {
      store.add(cloneTransaction(entry));
    }
  });
}

export function loadMaskedTransactionsSnapshot(): Promise<UnifiedTx[]> {
  return getAllFromStore(MASKED_STORE);
}

export async function clearMaskedTransactions(): Promise<void> {
  await runTransaction(MASKED_STORE, "readwrite", (store) => {
    store.clear();
  });
}

export async function clearAllIndexedDbData(): Promise<void> {
  await Promise.all([clearRawTransactions(), clearMaskedTransactions()]);
}
