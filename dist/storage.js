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
const TRANSACTIONS_KEY = "transactions_unified_v1";
const TRANSACTIONS_MASKED_KEY = "transactions_unified_masked_v1";
const ANON_RULES_KEY = "anonymization_rules_v1";
const DISPLAY_SETTINGS_KEY = "display_settings_v1";
const CURRENT_RULE_VERSION = 2;
const bankMappingsCache = [];
let transactionsCache = [];
let maskedTransactionsCache = [];
let displaySettingsCache = sanitizeDisplaySettings(null);
let settingsCache = {};
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
            bankMappingsCache.length = 0;
            bankMappingsCache.push(...mappings);
            updateTransactionsCache(indexedDbSnapshot.rawTransactions);
            const maskedSource = masked.length > 0 ? masked : indexedDbSnapshot.maskedTransactions;
            const sanitizedMasked = updateMaskedTransactionsCache(maskedSource);
            await storeMaskedTransactionsInDb(sanitizedMasked);
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
export function loadBankMappings() {
    return bankMappingsCache.map(sanitizeBankMapping);
}
export function importBankMappings(raw) {
    if (!Array.isArray(raw)) {
        return null;
    }
    const sanitized = raw
        .map(toBankMapping)
        .filter((entry) => entry !== null)
        .map(sanitizeBankMapping);
    bankMappingsCache.length = 0;
    bankMappingsCache.push(...sanitized);
    fireAndForget(Promise.all(sanitized.map((entry) => apiRequest("/bank-mapping", {
        method: "POST",
        body: JSON.stringify(entry),
    }))), "importBankMappings");
    return sanitized;
}
export function saveBankMapping(mapping) {
    const sanitized = sanitizeBankMapping(mapping);
    const existing = loadBankMappings();
    const index = existing.findIndex((entry) => entry.bank_name === sanitized.bank_name);
    if (index >= 0) {
        bankMappingsCache[index] = sanitized;
    }
    else {
        bankMappingsCache.push(sanitized);
    }
    fireAndForget(apiRequest("/bank-mapping", {
        method: "POST",
        body: JSON.stringify(sanitized),
    }), "saveBankMapping");
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
    await storeMaskedTransactionsInDb(updated);
}
export async function persistMaskedTransactions() {
    const stored = await loadMaskedTransactionsSnapshot();
    const updated = updateMaskedTransactionsCache(stored);
    await storeMaskedTransactionsInDb(updated);
    await apiRequest("/transactions/masked", {
        method: "POST",
        body: JSON.stringify({ transactions: updated }),
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
    displaySettingsCache = sanitizeDisplaySettings(null);
    settingsCache = {};
    initialized = false;
    initializationPromise = null;
    fireAndForget(apiRequest("/storage", {
        method: "DELETE",
    }), "clearPersistentData");
    fireAndForget(clearAllIndexedDbData(), "clearIndexedDbStorage");
    const keys = [
        BANK_MAPPINGS_KEY,
        TRANSACTIONS_KEY,
        TRANSACTIONS_MASKED_KEY,
        ANON_RULES_KEY,
        DISPLAY_SETTINGS_KEY,
    ];
    for (const key of keys) {
        localStorage.removeItem(key);
    }
}
