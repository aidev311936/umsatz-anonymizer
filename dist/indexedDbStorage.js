import { computeUnifiedTxHash } from "./transactionHash.js";
const DB_NAME = "umsatz_anonymizer";
const DB_VERSION = 3;
const RAW_STORE = "raw_transactions";
const MASKED_STORE = "masked_transactions";
const RAW_HASH_INDEX = "hash";
let dbPromise = null;
function openDatabase() {
    if (!dbPromise) {
        if (typeof indexedDB === "undefined") {
            return Promise.reject(new Error("IndexedDB is not supported in this environment."));
        }
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const database = request.result;
                const transaction = request.transaction;
                if (!transaction) {
                    return;
                }
                let rawStore;
                if (!database.objectStoreNames.contains(RAW_STORE)) {
                    rawStore = database.createObjectStore(RAW_STORE, { autoIncrement: true });
                }
                else {
                    rawStore = transaction.objectStore(RAW_STORE);
                }
                const ensureHashIndex = () => {
                    if (!rawStore.indexNames.contains(RAW_HASH_INDEX)) {
                        rawStore.createIndex(RAW_HASH_INDEX, RAW_HASH_INDEX, { unique: true });
                    }
                };
                const oldVersion = event.oldVersion ?? 0;
                if (oldVersion < 3) {
                    const getAllRequest = rawStore.getAll();
                    getAllRequest.onerror = () => {
                        console.error("Failed to read existing raw transactions during migration.", getAllRequest.error);
                        transaction.abort();
                    };
                    getAllRequest.onsuccess = async () => {
                        const records = Array.isArray(getAllRequest.result)
                            ? getAllRequest.result
                            : [];
                        const uniqueByHash = new Map();
                        for (const record of records) {
                            const unified = cloneUnifiedTx(record);
                            const hash = await computeUnifiedTxHash(unified);
                            if (!uniqueByHash.has(hash)) {
                                uniqueByHash.set(hash, unified);
                            }
                        }
                        try {
                            await requestAsPromise(rawStore.clear());
                            ensureHashIndex();
                            for (const [hash, value] of uniqueByHash.entries()) {
                                const stored = { ...cloneUnifiedTx(value), hash };
                                await requestAsPromise(rawStore.add(stored, hash));
                            }
                        }
                        catch (error) {
                            console.error("Failed to migrate raw transactions for hash index", error);
                            transaction.abort();
                        }
                    };
                }
                else {
                    ensureHashIndex();
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
function requestAsPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
    });
}
function getAllFromStore(storeName) {
    return openDatabase().then((database) => new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => {
            const result = Array.isArray(request.result)
                ? request.result
                : [];
            resolve(result.map(cloneUnifiedTx));
        };
        request.onerror = () => {
            reject(request.error ?? new Error("Failed to read from IndexedDB."));
        };
    }));
}
function runTransaction(storeName, mode, work) {
    return openDatabase().then((database) => new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let settled = false;
        const resolveOnce = () => {
            if (!settled) {
                settled = true;
                resolve();
            }
        };
        const rejectOnce = (error) => {
            if (!settled) {
                settled = true;
                reject(error);
            }
        };
        const fail = (error) => {
            rejectOnce(error);
            try {
                transaction.abort();
            }
            catch {
                // ignore abort errors – transaction is already closing
            }
        };
        transaction.oncomplete = () => {
            resolveOnce();
        };
        transaction.onerror = () => {
            rejectOnce(transaction.error ?? new Error("IndexedDB transaction failed."));
        };
        transaction.onabort = () => {
            rejectOnce(transaction.error ?? new Error("IndexedDB transaction aborted."));
        };
        const track = (request) => {
            if (!request) {
                return request;
            }
            request.onerror = () => {
                fail(request.error ?? new Error("IndexedDB request failed."));
            };
            return request;
        };
        try {
            work(store, track, fail);
        }
        catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
        }
    }));
}
function cloneUnifiedTx(tx) {
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
export async function ensureIndexedDbReady() {
    await openDatabase();
}
async function prepareStoredTransactions(entries) {
    const prepared = await Promise.all(entries.map(async (entry) => {
        const unified = cloneUnifiedTx(entry);
        const hash = await computeUnifiedTxHash(unified);
        return { ...unified, hash };
    }));
    return prepared;
}
function transactionLinkKey(entry) {
    return [entry.bank_name, entry.booking_date_raw, entry.booking_type, entry.booking_amount].join("|");
}
async function buildHashQueues(source) {
    const hashes = await Promise.all(source.map((entry) => computeUnifiedTxHash(entry)));
    const queues = new Map();
    hashes.forEach((hash, index) => {
        const key = transactionLinkKey(source[index]);
        const queue = queues.get(key);
        if (queue) {
            queue.push(hash);
        }
        else {
            queues.set(key, [hash]);
        }
    });
    return queues;
}
function takeHashForEntry(queues, entry) {
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
async function prepareMaskedStoredTransactions(entries, source) {
    const sourceQueues = source ? await buildHashQueues(source.map(cloneUnifiedTx)) : null;
    const prepared = [];
    for (const entry of entries) {
        const unified = cloneUnifiedTx(entry);
        let hash = null;
        if (sourceQueues) {
            hash = takeHashForEntry(sourceQueues, unified);
        }
        if (!hash) {
            hash = await computeUnifiedTxHash(unified);
        }
        prepared.push({ ...unified, hash });
    }
    return prepared;
}
export async function initializeIndexedDbStorage() {
    const [rawTransactions, maskedTransactions] = await Promise.all([
        getAllFromStore(RAW_STORE),
        getAllFromStore(MASKED_STORE),
    ]);
    return {
        rawTransactions,
        maskedTransactions,
    };
}
export async function storeRawTransactions(entries) {
    const storedEntries = await prepareStoredTransactions(entries);
    await runTransaction(RAW_STORE, "readwrite", (store, track, fail) => {
        const clearRequest = track(store.clear());
        if (!clearRequest) {
            return;
        }
        clearRequest.onsuccess = () => {
            try {
                for (const entry of storedEntries) {
                    track(store.add(entry, entry.hash));
                }
            }
            catch (error) {
                fail(error instanceof Error ? error : new Error(String(error)));
            }
        };
    });
}
export async function addRawTransactionIfMissing(entry, hash) {
    let added = false;
    await runTransaction(RAW_STORE, "readwrite", (store, track, fail) => {
        try {
            const index = store.index(RAW_HASH_INDEX);
            const checkRequest = track(index.get(hash));
            if (!checkRequest) {
                return;
            }
            checkRequest.onsuccess = () => {
                const existing = checkRequest.result;
                if (existing) {
                    return;
                }
                try {
                    const addRequest = track(store.add({ ...cloneUnifiedTx(entry), hash }, hash));
                    if (addRequest) {
                        addRequest.onsuccess = () => {
                            added = true;
                        };
                    }
                }
                catch (error) {
                    fail(error instanceof Error ? error : new Error(String(error)));
                }
            };
        }
        catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
        }
    });
    return added;
}
export async function clearRawTransactions() {
    await runTransaction(RAW_STORE, "readwrite", (store, track) => {
        track(store.clear());
    });
}
export async function storeMaskedTransactions(entries, source) {
    const storedEntries = await prepareMaskedStoredTransactions(entries, source);
    await runTransaction(MASKED_STORE, "readwrite", (store, track, fail) => {
        const clearRequest = track(store.clear());
        if (!clearRequest) {
            return;
        }
        clearRequest.onsuccess = () => {
            try {
                for (const entry of storedEntries) {
                    track(store.add(entry, entry.hash));
                }
            }
            catch (error) {
                fail(error instanceof Error ? error : new Error(String(error)));
            }
        };
    });
}
export function loadMaskedTransactionsSnapshot() {
    return getAllFromStore(MASKED_STORE);
}
export async function clearMaskedTransactions() {
    await runTransaction(MASKED_STORE, "readwrite", (store, track) => {
        track(store.clear());
    });
}
export async function clearAllIndexedDbData() {
    await Promise.all([clearRawTransactions(), clearMaskedTransactions()]);
}
