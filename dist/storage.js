import { sanitizeDisplaySettings } from "./displaySettings.js";
import { computeUnifiedTxHash } from "./transactionHash.js";
import { addRawTransactionIfMissing, clearAllIndexedDbData, ensureIndexedDbReady, initializeIndexedDbStorage, loadMaskedTransactionsSnapshot, storeMaskedTransactions as storeMaskedTransactionsInDb, storeRawTransactions as storeRawTransactionsInDb, } from "./indexedDbStorage.js";
function resolveApiBase() {
    const meta = document.querySelector('meta[name="backend-base-url"]');
    const metaContent = meta?.getAttribute("content")?.trim();
    if (metaContent) {
        return metaContent.replace(/\/$/, "");
    }
    if (typeof window !== "undefined" && typeof window.BACKEND_BASE_URL === "string") {
        return window.BACKEND_BASE_URL.replace(/\/$/, "");
    }
    return "";
}
const API_BASE_URL = resolveApiBase();
const maskedTransactionsStorage = {
    loadSnapshot: loadMaskedTransactionsSnapshot,
    store: storeMaskedTransactionsInDb,
};
export function __setMaskedTransactionsStorageForTests(overrides) {
    const previous = { ...maskedTransactionsStorage };
    Object.assign(maskedTransactionsStorage, overrides);
    return () => {
        Object.assign(maskedTransactionsStorage, previous);
    };
}
function fireAndForget(promise, context) {
    void promise.catch((error) => {
        console.error(`${context} failed`, error);
    });
}
async function apiRequest(path, init) {
    const url = `${API_BASE_URL}${path}`;
    const headers = new Headers(init?.headers);
    if (!headers.has("Accept")) {
        headers.set("Accept", "application/json");
    }
    const hasBody = init?.body != null;
    if (hasBody && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    const response = await fetch(url, {
        ...init,
        headers,
        credentials: "include",
    });
    if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message && message.trim().length > 0
            ? `Request to ${path} failed with status ${response.status}: ${message}`
            : `Request to ${path} failed with status ${response.status}`);
    }
    return response;
}
async function readJson(response) {
    const text = await response.text();
    if (!text) {
        return {};
    }
    return JSON.parse(text);
}
const BANK_MAPPINGS_KEY = "bank_mappings_v1";
const LOCAL_BANK_MAPPINGS_KEY = "bank_mappings_local_v1";
const TRANSACTIONS_KEY = "transactions_unified_v1";
const TRANSACTIONS_MASKED_KEY = "transactions_unified_masked_v1";
const ANON_RULES_KEY = "anonymization_rules_v1";
const DISPLAY_SETTINGS_KEY = "display_settings_v1";
const CURRENT_RULE_VERSION = 2;
const bankMappingsCache = [];
let remoteBankMappings = [];
let localBankMappings = [];
let transactionsCache = [];
let maskedTransactionsCache = [];
let displaySettingsCache = sanitizeDisplaySettings(null);
let settingsCache = {};
let transactionImportsCache = [];
let initialized = false;
let initializationPromise = null;
export async function initializeStorage() {
    if (initialized) {
        return;
    }
    if (!initializationPromise) {
        initializationPromise = (async () => {
            const [settings, mappings, indexedDbSnapshot, masked] = await Promise.all([
                fetchSettingsFromBackend(),
                fetchBankMappingsFromBackend(),
                initializeIndexedDbStorage(),
                fetchMaskedTransactionsFromBackend(),
            ]);
            settingsCache = settings;
            const display = settings[DISPLAY_SETTINGS_KEY];
            if (display && typeof display === "object") {
                displaySettingsCache = sanitizeDisplaySettings(display);
            }
            else {
                displaySettingsCache = sanitizeDisplaySettings(null);
            }
            remoteBankMappings = [...mappings];
            localBankMappings = loadLocalBankMappings();
            setBankMappingsCacheFromSources();
            updateTransactionsCache(indexedDbSnapshot.rawTransactions);
            const maskedSource = masked.length > 0 ? masked : indexedDbSnapshot.maskedTransactions;
            const sanitizedMasked = updateMaskedTransactionsCache(maskedSource);
            await maskedTransactionsStorage.store(sanitizedMasked, transactionsCache);
            initialized = true;
        })().catch((error) => {
            initializationPromise = null;
            throw error;
        });
    }
    await initializationPromise;
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function toBankMapping(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const maybe = value;
    if (typeof maybe.bank_name !== "string" ||
        !isStringArray(maybe.booking_date) ||
        !isStringArray(maybe.booking_text) ||
        !isStringArray(maybe.booking_type) ||
        !isStringArray(maybe.booking_amount)) {
        return null;
    }
    const parseFormat = typeof maybe.booking_date_parse_format === "string"
        ? maybe.booking_date_parse_format
        : "";
    return {
        bank_name: maybe.bank_name,
        booking_date: [...maybe.booking_date],
        booking_text: [...maybe.booking_text],
        booking_type: [...maybe.booking_type],
        booking_amount: [...maybe.booking_amount],
        booking_date_parse_format: parseFormat,
    };
}
function sanitizeBankMapping(mapping) {
    const parseFormat = mapping.booking_date_parse_format.trim();
    return {
        bank_name: mapping.bank_name,
        booking_date: [...mapping.booking_date],
        booking_text: [...mapping.booking_text],
        booking_type: [...mapping.booking_type],
        booking_amount: [...mapping.booking_amount],
        booking_date_parse_format: parseFormat,
    };
}
function safeParse(text) {
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    }
    catch (error) {
        console.warn("Failed to parse JSON from storage", error);
        return null;
    }
}
function mergeBankMappings(primary, overrides) {
    const map = new Map();
    const normalize = (name) => name.trim().toLowerCase();
    primary.forEach((entry) => {
        const normalized = normalize(entry.bank_name);
        if (normalized.length > 0 && !map.has(normalized)) {
            map.set(normalized, sanitizeBankMapping(entry));
        }
    });
    overrides.forEach((entry) => {
        const normalized = normalize(entry.bank_name);
        if (normalized.length > 0) {
            map.set(normalized, sanitizeBankMapping(entry));
        }
    });
    return Array.from(map.values()).sort((a, b) => a.bank_name.localeCompare(b.bank_name, "de", { sensitivity: "base" }));
}
function setBankMappingsCacheFromSources() {
    const combined = mergeBankMappings(remoteBankMappings, localBankMappings);
    bankMappingsCache.length = 0;
    bankMappingsCache.push(...combined);
}
function loadLocalBankMappings() {
    const parsed = safeParse(localStorage.getItem(LOCAL_BANK_MAPPINGS_KEY));
    if (!Array.isArray(parsed)) {
        return [];
    }
    return parsed
        .map(toBankMapping)
        .filter((entry) => entry !== null)
        .map(sanitizeBankMapping);
}
function persistLocalBankMappings(mappings) {
    const sanitized = mappings.map(sanitizeBankMapping);
    if (sanitized.length === 0) {
        localStorage.removeItem(LOCAL_BANK_MAPPINGS_KEY);
        return;
    }
    localStorage.setItem(LOCAL_BANK_MAPPINGS_KEY, JSON.stringify(sanitized, null, 2));
}
function toTransactionImportSummary(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const maybe = value;
    if (typeof maybe.bank_name !== "string") {
        return null;
    }
    const bookingAccount = typeof maybe.booking_account === "string" ? maybe.booking_account : "";
    let createdOn = null;
    if (typeof maybe.created_on === "string") {
        createdOn = maybe.created_on;
    }
    else if (maybe.created_on instanceof Date) {
        createdOn = maybe.created_on.toISOString();
    }
    else if (maybe.created_on === null) {
        createdOn = null;
    }
    const first = typeof maybe.first_booking_date === "string" ? maybe.first_booking_date : "";
    const last = typeof maybe.last_booking_date === "string" ? maybe.last_booking_date : "";
    return {
        bank_name: maybe.bank_name,
        booking_account: bookingAccount,
        created_on: createdOn,
        first_booking_date: first,
        last_booking_date: last,
    };
}
function sanitizeTransactionImportSummary(summary) {
    const bankName = summary.bank_name.trim();
    const bookingAccount = summary.booking_account.trim();
    const first = summary.first_booking_date ? summary.first_booking_date.trim() : "";
    const last = summary.last_booking_date ? summary.last_booking_date.trim() : "";
    let created = null;
    if (typeof summary.created_on === "string") {
        const parsed = Date.parse(summary.created_on);
        created = Number.isNaN(parsed)
            ? summary.created_on.trim()
            : new Date(parsed).toISOString();
    }
    return {
        bank_name: bankName,
        booking_account: bookingAccount,
        created_on: created,
        first_booking_date: first,
        last_booking_date: last,
    };
}
async function fetchBankMappingsFromBackend() {
    const response = await apiRequest("/bank-mapping");
    const payload = await readJson(response);
    const entries = Array.isArray(payload.mappings) ? payload.mappings : [];
    return entries
        .map(toBankMapping)
        .filter((entry) => entry !== null)
        .map(sanitizeBankMapping);
}
async function fetchSettingsFromBackend() {
    const response = await apiRequest("/settings");
    const payload = await readJson(response);
    return payload.settings ?? {};
}
export async function fetchTransactionImportsFromBackend() {
    const response = await apiRequest("/transactions/imports");
    const payload = await readJson(response);
    const entries = Array.isArray(payload.imports) ? payload.imports : [];
    transactionImportsCache = entries
        .map(toTransactionImportSummary)
        .filter((entry) => entry !== null)
        .map(sanitizeTransactionImportSummary);
    return transactionImportsCache.map((entry) => ({ ...entry }));
}
export function loadBankMappings() {
    return bankMappingsCache.map(sanitizeBankMapping);
}
export function loadTransactionImports() {
    return transactionImportsCache.map((entry) => ({ ...entry }));
}
export function importBankMappings(raw) {
    if (!Array.isArray(raw)) {
        return null;
    }
    const sanitized = raw
        .map(toBankMapping)
        .filter((entry) => entry !== null)
        .map(sanitizeBankMapping);
    localBankMappings = [...sanitized];
    persistLocalBankMappings(localBankMappings);
    setBankMappingsCacheFromSources();
    return sanitized;
}
export function saveBankMapping(mapping) {
    const sanitized = sanitizeBankMapping(mapping);
    const normalized = sanitized.bank_name.trim().toLowerCase();
    const index = localBankMappings.findIndex((entry) => entry.bank_name.trim().toLowerCase() === normalized);
    if (index >= 0) {
        localBankMappings[index] = sanitized;
    }
    else {
        localBankMappings.push(sanitized);
    }
    persistLocalBankMappings(localBankMappings);
    setBankMappingsCacheFromSources();
}
export function loadDisplaySettings() {
    return sanitizeDisplaySettings(displaySettingsCache);
}
export function saveDisplaySettings(settings) {
    const sanitized = sanitizeDisplaySettings(settings);
    displaySettingsCache = sanitized;
    settingsCache = { ...settingsCache, [DISPLAY_SETTINGS_KEY]: sanitized };
    fireAndForget(apiRequest("/settings", {
        method: "PUT",
        body: JSON.stringify(settingsCache),
    }), "saveDisplaySettings");
}
function toUnifiedTx(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const maybe = value;
    if (typeof maybe.bank_name !== "string" ||
        typeof maybe.booking_date !== "string" ||
        typeof maybe.booking_text !== "string" ||
        typeof maybe.booking_type !== "string" ||
        typeof maybe.booking_amount !== "string") {
        return null;
    }
    const raw = typeof maybe.booking_date_raw === "string"
        ? maybe.booking_date_raw
        : maybe.booking_date;
    let iso = null;
    if (typeof maybe.booking_date_iso === "string") {
        const time = Date.parse(maybe.booking_date_iso);
        iso = Number.isNaN(time) ? null : maybe.booking_date_iso;
    }
    else if (maybe.booking_date_iso === null) {
        iso = null;
    }
    return {
        bank_name: maybe.bank_name,
        booking_date: maybe.booking_date,
        booking_date_raw: raw,
        booking_date_iso: iso,
        booking_text: maybe.booking_text,
        booking_type: maybe.booking_type,
        booking_amount: maybe.booking_amount,
        booking_account: typeof maybe.booking_account === "string" ? maybe.booking_account : "",
    };
}
function sanitizeTransaction(tx) {
    const iso = tx.booking_date_iso;
    let normalizedIso = null;
    if (typeof iso === "string") {
        const time = Date.parse(iso);
        normalizedIso = Number.isNaN(time) ? null : iso;
    }
    return {
        bank_name: tx.bank_name,
        booking_date: tx.booking_date,
        booking_date_raw: tx.booking_date_raw ?? tx.booking_date,
        booking_date_iso: normalizedIso,
        booking_text: tx.booking_text,
        booking_type: tx.booking_type,
        booking_amount: tx.booking_amount,
        booking_account: typeof tx.booking_account === "string" ? tx.booking_account : "",
    };
}
function transactionTimestamp(tx) {
    if (tx.booking_date_iso) {
        const time = Date.parse(tx.booking_date_iso);
        if (!Number.isNaN(time)) {
            return time;
        }
    }
    const raw = Date.parse(tx.booking_date_raw);
    if (!Number.isNaN(raw)) {
        return raw;
    }
    const display = Date.parse(tx.booking_date);
    if (!Number.isNaN(display)) {
        return display;
    }
    return Number.NEGATIVE_INFINITY;
}
function sortTransactions(entries) {
    return [...entries].sort((a, b) => transactionTimestamp(b) - transactionTimestamp(a));
}
async function fetchMaskedTransactionsFromBackend() {
    const response = await apiRequest("/transactions/masked");
    const payload = await readJson(response);
    const parsed = Array.isArray(payload.transactions) ? payload.transactions : [];
    const normalized = parsed
        .map(toUnifiedTx)
        .filter((entry) => entry !== null)
        .map(sanitizeTransaction);
    return sortTransactions(normalized);
}
function updateTransactionsCache(entries) {
    const sanitized = entries.map(sanitizeTransaction);
    transactionsCache = sortTransactions(sanitized);
    return [...transactionsCache];
}
function updateMaskedTransactionsCache(entries) {
    const sanitized = entries.map(sanitizeTransaction);
    maskedTransactionsCache = sortTransactions(sanitized);
    return [...maskedTransactionsCache];
}
export function loadTransactions() {
    return [...transactionsCache];
}
export function saveTransactions(entries) {
    const updated = updateTransactionsCache(entries);
    fireAndForget(storeRawTransactionsInDb(updated), "saveTransactions#indexedDb");
}
export async function appendTransactions(entries, options) {
    const sanitizedNewEntries = entries.map(sanitizeTransaction);
    const total = sanitizedNewEntries.length;
    if (total === 0) {
        return {
            transactions: [...transactionsCache],
            addedCount: 0,
            skippedDuplicates: 0,
        };
    }
    await ensureIndexedDbReady();
    const uniqueEntries = [];
    let skippedDuplicates = 0;
    let processed = 0;
    for (const entry of sanitizedNewEntries) {
        const hash = await computeUnifiedTxHash(entry);
        const added = await addRawTransactionIfMissing(entry, hash);
        if (added) {
            uniqueEntries.push(entry);
        }
        else {
            skippedDuplicates += 1;
        }
        processed += 1;
        options?.onProgress?.(processed, total, uniqueEntries.length);
    }
    if (uniqueEntries.length === 0) {
        return {
            transactions: [...transactionsCache],
            addedCount: 0,
            skippedDuplicates,
        };
    }
    const combined = transactionsCache.concat(uniqueEntries);
    const updated = updateTransactionsCache(combined);
    return {
        transactions: updated,
        addedCount: uniqueEntries.length,
        skippedDuplicates,
    };
}
export function loadMaskedTransactions() {
    return [...maskedTransactionsCache];
}
export async function saveMaskedTransactions(entries) {
    const updated = updateMaskedTransactionsCache(entries);
    await maskedTransactionsStorage.store(updated, transactionsCache);
}
export async function persistMaskedTransactions() {
    const stored = await maskedTransactionsStorage.loadSnapshot();
    const snapshotTransactions = stored.map(({ hash: _hash, ...entry }) => entry);
    const updated = updateMaskedTransactionsCache(snapshotTransactions);
    const persisted = await maskedTransactionsStorage.store(updated, transactionsCache);
    const payload = persisted.map(({ hash, ...entry }) => ({ ...entry, booking_hash: hash }));
    await apiRequest("/transactions/masked", {
        method: "POST",
        body: JSON.stringify({ transactions: payload }),
    });
}
function isAnonRule(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const maybe = value;
    if (maybe.type === "regex") {
        return (typeof maybe.id === "string" &&
            Array.isArray(maybe.fields) &&
            maybe.fields.every((field) => typeof field === "string") &&
            typeof maybe.pattern === "string" &&
            typeof maybe.replacement === "string");
    }
    if (maybe.type === "mask") {
        return (typeof maybe.id === "string" &&
            Array.isArray(maybe.fields) &&
            maybe.fields.every((field) => typeof field === "string") &&
            typeof maybe.maskStrategy === "string");
    }
    return false;
}
const DEFAULT_RULES = {
    version: CURRENT_RULE_VERSION,
    rules: [
        {
            id: "iban_mask",
            fields: ["booking_text"],
            type: "regex",
            pattern: "(DE\\d{2})[\\s-]?((?:\\d[\\s-]?){18})",
            flags: "gi",
            replacement: "$1 XXXX XXXX XXXX XXXX XX",
            enabled: true,
        },
        {
            id: "digits_mask",
            fields: ["booking_text"],
            type: "regex",
            pattern: "\\d{3,}",
            flags: "g",
            replacement: "XXX",
            enabled: true,
        },
    ],
};
function sanitizeRule(rule) {
    if (rule.type === "regex") {
        return {
            id: rule.id,
            type: "regex",
            pattern: rule.pattern,
            flags: rule.flags,
            replacement: rule.replacement,
            fields: ["booking_text"],
            enabled: rule.enabled !== false ? true : false,
        };
    }
    return {
        id: rule.id,
        type: "mask",
        maskStrategy: rule.maskStrategy,
        maskChar: rule.maskChar,
        minLen: rule.minLen,
        maskPercent: rule.maskPercent,
        fields: ["booking_text"],
        enabled: rule.enabled !== false ? true : false,
    };
}
export function loadAnonymizationRules() {
    const parsed = safeParse(localStorage.getItem(ANON_RULES_KEY));
    if (parsed &&
        typeof parsed === "object" &&
        parsed !== null &&
        "rules" in parsed &&
        Array.isArray(parsed.rules)) {
        const rules = parsed.rules.filter(isAnonRule).map(sanitizeRule);
        const version = typeof parsed.version === "number"
            ? parsed.version
            : CURRENT_RULE_VERSION;
        return { rules, version };
    }
    localStorage.setItem(ANON_RULES_KEY, JSON.stringify(DEFAULT_RULES, null, 2));
    return DEFAULT_RULES;
}
export function saveAnonymizationRules(rules) {
    const sanitized = {
        version: CURRENT_RULE_VERSION,
        rules: rules.map(sanitizeRule),
    };
    localStorage.setItem(ANON_RULES_KEY, JSON.stringify(sanitized, null, 2));
}
export function importAnonymizationRules(raw) {
    if (Array.isArray(raw)) {
        const rules = raw.filter(isAnonRule).map(sanitizeRule);
        const payload = { version: CURRENT_RULE_VERSION, rules };
        localStorage.setItem(ANON_RULES_KEY, JSON.stringify(payload, null, 2));
        return payload;
    }
    if (typeof raw === "object" && raw !== null && "rules" in raw) {
        const maybe = raw;
        if (Array.isArray(maybe.rules)) {
            const rules = maybe.rules.filter(isAnonRule).map(sanitizeRule);
            const version = typeof maybe.version === "number" ? maybe.version : CURRENT_RULE_VERSION;
            const payload = { version, rules };
            localStorage.setItem(ANON_RULES_KEY, JSON.stringify(payload, null, 2));
            return payload;
        }
    }
    return null;
}
export function clearPersistentData() {
    transactionsCache = [];
    maskedTransactionsCache = [];
    bankMappingsCache.length = 0;
    remoteBankMappings = [];
    localBankMappings = [];
    displaySettingsCache = sanitizeDisplaySettings(null);
    settingsCache = {};
    transactionImportsCache = [];
    initialized = false;
    initializationPromise = null;
    fireAndForget(apiRequest("/storage", {
        method: "DELETE",
    }), "clearPersistentData");
    fireAndForget(clearAllIndexedDbData(), "clearIndexedDbStorage");
    const keys = [
        BANK_MAPPINGS_KEY,
        LOCAL_BANK_MAPPINGS_KEY,
        TRANSACTIONS_KEY,
        TRANSACTIONS_MASKED_KEY,
        ANON_RULES_KEY,
        DISPLAY_SETTINGS_KEY,
    ];
    for (const key of keys) {
        localStorage.removeItem(key);
    }
}
