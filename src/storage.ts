import { AnonRule, BankMapping, UnifiedTx } from "./types.js";

const BANK_MAPPINGS_KEY = "bank_mappings_v1";
const TRANSACTIONS_KEY = "transactions_unified_v1";
const TRANSACTIONS_MASKED_KEY = "transactions_unified_masked_v1";
const ANON_RULES_KEY = "anonymization_rules_v1";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isBankMapping(value: unknown): value is BankMapping {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const maybe = value as Partial<BankMapping>;
  return (
    typeof maybe.bank_name === "string" &&
    isStringArray(maybe.booking_date) &&
    isStringArray(maybe.booking_text) &&
    isStringArray(maybe.booking_type) &&
    isStringArray(maybe.booking_amount)
  );
}

function safeParse<T>(text: string | null): T | null {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.warn("Failed to parse JSON from storage", error);
    return null;
  }
}

export function loadBankMappings(): BankMapping[] {
  const parsed = safeParse<unknown>(localStorage.getItem(BANK_MAPPINGS_KEY));
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(isBankMapping);
}

export function saveBankMapping(mapping: BankMapping): void {
  const existing = loadBankMappings();
  const index = existing.findIndex((entry) => entry.bank_name === mapping.bank_name);
  if (index >= 0) {
    existing[index] = mapping;
  } else {
    existing.push(mapping);
  }
  localStorage.setItem(BANK_MAPPINGS_KEY, JSON.stringify(existing, null, 2));
}

function isUnifiedTx(value: unknown): value is UnifiedTx {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const maybe = value as Partial<UnifiedTx>;
  return (
    typeof maybe.bank_name === "string" &&
    typeof maybe.booking_date === "string" &&
    typeof maybe.booking_text === "string" &&
    typeof maybe.booking_type === "string" &&
    typeof maybe.booking_amount === "string"
  );
}

export function loadTransactions(): UnifiedTx[] {
  const parsed = safeParse<unknown>(localStorage.getItem(TRANSACTIONS_KEY));
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(isUnifiedTx);
}

export function appendTransactions(entries: UnifiedTx[]): UnifiedTx[] {
  const current = loadTransactions();
  const next = current.concat(entries);
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(next, null, 2));
  return next;
}

export function loadMaskedTransactions(): UnifiedTx[] {
  const parsed = safeParse<unknown>(localStorage.getItem(TRANSACTIONS_MASKED_KEY));
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(isUnifiedTx);
}

export function saveMaskedTransactions(entries: UnifiedTx[]): void {
  localStorage.setItem(TRANSACTIONS_MASKED_KEY, JSON.stringify(entries, null, 2));
}

function isAnonRule(value: unknown): value is AnonRule {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const maybe = value as Partial<AnonRule> & { type?: string };
  if ("enabled" in maybe && typeof maybe.enabled !== "boolean" && typeof maybe.enabled !== "undefined") {
    return false;
  }
  if (maybe.type === "regex") {
    return (
      typeof maybe.id === "string" &&
      Array.isArray(maybe.fields) &&
      maybe.fields.every((field) => typeof field === "string") &&
      typeof maybe.pattern === "string" &&
      typeof maybe.replacement === "string"
    );
  }
  if (maybe.type === "mask") {
    return (
      typeof maybe.id === "string" &&
      Array.isArray(maybe.fields) &&
      maybe.fields.every((field) => typeof field === "string") &&
      typeof maybe.maskStrategy === "string"
    );
  }
  return false;
}

const DEFAULT_RULES: { version: number; rules: AnonRule[] } = {
  version: 2,
  rules: [
    {
      id: "iban_mask",
      fields: ["booking_text"],
      type: "regex",
      pattern: "(?:DE\\d{2}\\s?(?:\\d\\s?){18})",
      flags: "gi",
      replacement: "DE•• •••• •••• •••• •••• ••",
      enabled: true,
    },
    {
      id: "digit_block_mask",
      fields: ["booking_text"],
      type: "regex",
      pattern: "\\d+",
      flags: "g",
      replacement: "XXX",
      enabled: true,
    },
  ],
};

function normalizeRule(rule: AnonRule): AnonRule {
  const enabled = rule.enabled !== false;
  if (rule.type === "regex") {
    return {
      ...rule,
      fields: ["booking_text"],
      enabled,
    };
  }
  return {
    ...rule,
    fields: ["booking_text"],
    enabled,
  };
}

export function loadAnonymizationRules(): { rules: AnonRule[]; version: number } {
  const parsed = safeParse<unknown>(localStorage.getItem(ANON_RULES_KEY));
  if (
    parsed &&
    typeof parsed === "object" &&
    parsed !== null &&
    "rules" in parsed &&
    Array.isArray((parsed as { rules: unknown }).rules)
  ) {
    let rules = (parsed as { rules: unknown[]; version?: number }).rules.filter(isAnonRule).map(normalizeRule);
    let version = typeof (parsed as { version?: number }).version === "number" ? (parsed as { version?: number }).version! : 1;
    if (version < DEFAULT_RULES.version) {
      localStorage.setItem(ANON_RULES_KEY, JSON.stringify(DEFAULT_RULES, null, 2));
      return DEFAULT_RULES;
    }
    if (rules.length === 0) {
      rules = DEFAULT_RULES.rules.map(normalizeRule);
    }
    const sanitized = { rules, version };
    localStorage.setItem(ANON_RULES_KEY, JSON.stringify(sanitized, null, 2));
    return sanitized;
  }
  localStorage.setItem(ANON_RULES_KEY, JSON.stringify(DEFAULT_RULES, null, 2));
  return DEFAULT_RULES;
}

export function saveAnonymizationRules(payload: { rules: AnonRule[]; version: number }): void {
  const sanitized = {
    version: Math.max(payload.version, DEFAULT_RULES.version),
    rules: payload.rules.map(normalizeRule),
  };
  localStorage.setItem(ANON_RULES_KEY, JSON.stringify(sanitized, null, 2));
}
