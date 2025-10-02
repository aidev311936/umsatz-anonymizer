const BANK_MAPPINGS_KEY = "bank_mappings_v1";
const TRANSACTIONS_KEY = "transactions_unified_v1";
const TRANSACTIONS_MASKED_KEY = "transactions_unified_masked_v1";
const ANON_RULES_KEY = "anonymization_rules_v1";
const CURRENT_RULE_VERSION = 2;
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
    const displayFormatRaw = typeof maybe.booking_date_display_format === "string"
        ? maybe.booking_date_display_format
        : parseFormat;
    return {
        bank_name: maybe.bank_name,
        booking_date: [...maybe.booking_date],
        booking_text: [...maybe.booking_text],
        booking_type: [...maybe.booking_type],
        booking_amount: [...maybe.booking_amount],
        booking_date_parse_format: parseFormat,
        booking_date_display_format: displayFormatRaw,
    };
}
function sanitizeBankMapping(mapping) {
    const parseFormat = mapping.booking_date_parse_format.trim();
    const displayFormatRaw = mapping.booking_date_display_format.trim();
    const displayFormat = displayFormatRaw.length > 0 ? displayFormatRaw : parseFormat;
    return {
        bank_name: mapping.bank_name,
        booking_date: [...mapping.booking_date],
        booking_text: [...mapping.booking_text],
        booking_type: [...mapping.booking_type],
        booking_amount: [...mapping.booking_amount],
        booking_date_parse_format: parseFormat,
        booking_date_display_format: displayFormat,
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
export function loadBankMappings() {
    const parsed = safeParse(localStorage.getItem(BANK_MAPPINGS_KEY));
    if (!Array.isArray(parsed)) {
        return [];
    }
    return parsed
        .map(toBankMapping)
        .filter((entry) => entry !== null)
        .map(sanitizeBankMapping);
}
export function saveBankMapping(mapping) {
    const sanitized = sanitizeBankMapping(mapping);
    const existing = loadBankMappings();
    const index = existing.findIndex((entry) => entry.bank_name === sanitized.bank_name);
    if (index >= 0) {
        existing[index] = sanitized;
    }
    else {
        existing.push(sanitized);
    }
    localStorage.setItem(BANK_MAPPINGS_KEY, JSON.stringify(existing, null, 2));
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
function persistTransactions(key, entries) {
    const sanitized = entries.map(sanitizeTransaction);
    const sorted = sortTransactions(sanitized);
    localStorage.setItem(key, JSON.stringify(sorted, null, 2));
}
export function loadTransactions() {
    const parsed = safeParse(localStorage.getItem(TRANSACTIONS_KEY));
    if (!Array.isArray(parsed)) {
        return [];
    }
    const normalized = parsed
        .map(toUnifiedTx)
        .filter((entry) => entry !== null)
        .map(sanitizeTransaction);
    return sortTransactions(normalized);
}
export function saveTransactions(entries) {
    persistTransactions(TRANSACTIONS_KEY, entries);
}
export function appendTransactions(entries) {
    const current = loadTransactions();
    const combined = current.concat(entries.map(sanitizeTransaction));
    persistTransactions(TRANSACTIONS_KEY, combined);
    return sortTransactions(combined);
}
export function loadMaskedTransactions() {
    const parsed = safeParse(localStorage.getItem(TRANSACTIONS_MASKED_KEY));
    if (!Array.isArray(parsed)) {
        return [];
    }
    const normalized = parsed
        .map(toUnifiedTx)
        .filter((entry) => entry !== null)
        .map(sanitizeTransaction);
    return sortTransactions(normalized);
}
export function saveMaskedTransactions(entries) {
    persistTransactions(TRANSACTIONS_MASKED_KEY, entries);
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
