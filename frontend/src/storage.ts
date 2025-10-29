import { sanitizeDisplaySettings } from "./displaySettings";
import {
  AnonRule,
  BankMapping,
  BankMappingDetection,
  DisplaySettings,
  TransactionImportSummary,
  UnifiedTx,
} from "./types";
import { computeUnifiedTxHash } from "./transactionHash";
import { getApiBaseUrl } from "./apiBase";
import {
  maskedTransactionsSessionStorage,
  purgeLegacyPersistentStorage,
  rawTransactionsSessionStorage,
  sessionScopedGetItem,
  sessionScopedRemoveItem,
  sessionScopedSetItem,
  type StoredTransaction,
} from "./services/sessionScopedStorage";

const maskedTransactionsStorage: {
  loadSnapshot: () => Promise<StoredTransaction[]>;
  store: (entries: UnifiedTx[], source?: UnifiedTx[]) => Promise<StoredTransaction[]>;
} = {
  loadSnapshot: () => maskedTransactionsSessionStorage.loadSnapshot(),
  store: (entries, source) => maskedTransactionsSessionStorage.storeMany(entries, source),
};

export function __setMaskedTransactionsStorageForTests(
  overrides: Partial<typeof maskedTransactionsStorage>,
): () => void {
  const previous = { ...maskedTransactionsStorage };
  Object.assign(maskedTransactionsStorage, overrides);
  return () => {
    Object.assign(maskedTransactionsStorage, previous);
  };
}

export function __resetBankMappingsForTests(): void {
  bankMappingsCache.length = 0;
  remoteBankMappings = [];
  localBankMappings = [];
  sessionScopedRemoveItem(LOCAL_BANK_MAPPINGS_KEY);
}

function fireAndForget(promise: Promise<unknown>, context: string): void {
  void promise.catch((error) => {
    console.error(`${context} failed`, error);
  });
}

async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}${path}`;
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
    throw new Error(
      message && message.trim().length > 0
        ? `Request to ${path} failed with status ${response.status}: ${message}`
        : `Request to ${path} failed with status ${response.status}`,
    );
  }
  return response;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

const BANK_MAPPINGS_KEY = "bank_mappings_v1";
const LOCAL_BANK_MAPPINGS_KEY = "bank_mappings_local_v1";
const TRANSACTIONS_KEY = "transactions_unified_v1";
const TRANSACTIONS_MASKED_KEY = "transactions_unified_masked_v1";
const ANON_RULES_KEY = "anonymization_rules_v1";
const DISPLAY_SETTINGS_KEY = "display_settings_v1";
const CURRENT_RULE_VERSION = 2;

const bankMappingsCache: BankMapping[] = [];
let remoteBankMappings: BankMapping[] = [];
let localBankMappings: BankMapping[] = [];
let transactionsCache: UnifiedTx[] = [];
let maskedTransactionsCache: UnifiedTx[] = [];
let displaySettingsCache: DisplaySettings = sanitizeDisplaySettings(null);
let settingsCache: Record<string, unknown> = {};
let transactionImportsCache: TransactionImportSummary[] = [];
let initialized = false;
let initializationPromise: Promise<void> | null = null;

export async function initializeStorage(): Promise<void> {
  if (initialized) {
    return;
  }
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await purgeLegacyPersistentStorage();
      const [
        settings,
        mappings,
        rawSnapshot,
        maskedSnapshot,
        masked,
      ] = await Promise.all([
        fetchSettingsFromBackend(),
        fetchBankMappingsFromBackend(),
        rawTransactionsSessionStorage.loadSnapshot(),
        maskedTransactionsStorage.loadSnapshot(),
        fetchMaskedTransactionsFromBackend(),
      ]);
      settingsCache = settings;
      const display = settings[DISPLAY_SETTINGS_KEY];
      if (display && typeof display === "object") {
        displaySettingsCache = sanitizeDisplaySettings(display as Partial<DisplaySettings>);
      } else {
        displaySettingsCache = sanitizeDisplaySettings(null);
      }
      remoteBankMappings = [...mappings];
      localBankMappings = loadLocalBankMappings();
      setBankMappingsCacheFromSources();
      const snapshotTransactions = rawSnapshot.map(({ hash, ...entry }) => ({
        ...entry,
        booking_hash: hash,
      }));
      updateTransactionsCache(snapshotTransactions);
      const maskedSessionTransactions = maskedSnapshot.map(({ hash, ...entry }) => ({
        ...entry,
        booking_hash: hash,
      }));
      const maskedSource = masked.length > 0 ? masked : maskedSessionTransactions;
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function sanitizeDetection(value: unknown): BankMappingDetection | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const maybe = value as {
    header_signature?: unknown;
    without_header?: unknown;
  };

  const detection: BankMappingDetection = {};

  if (Array.isArray(maybe.header_signature)) {
    const signature = maybe.header_signature
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (signature.length > 0) {
      detection.header_signature = signature;
    }
  }

  if (
    typeof maybe.without_header === "object" &&
    maybe.without_header !== null &&
    !Array.isArray(maybe.without_header)
  ) {
    const raw = maybe.without_header as {
      column_count?: unknown;
      column_markers?: unknown;
    };
    const normalized: NonNullable<BankMappingDetection["without_header"]> = {};

    if (Number.isInteger(raw.column_count) && (raw.column_count as number) >= 0) {
      normalized.column_count = raw.column_count as number;
    }

    if (Array.isArray(raw.column_markers)) {
      const markers = raw.column_markers
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      if (markers.length > 0) {
        normalized.column_markers = markers;
      }
    }

    if (Object.keys(normalized).length > 0) {
      detection.without_header = normalized;
    }
  }

  return Object.keys(detection).length > 0 ? detection : null;
}

function toBankMapping(value: unknown): BankMapping | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const maybe = value as Partial<BankMapping> & {
    bank_name?: unknown;
    booking_date?: unknown;
    booking_text?: unknown;
    booking_type?: unknown;
    booking_amount?: unknown;
    booking_date_parse_format?: unknown;
    without_header?: unknown;
    detection?: unknown;
  };
  if (
    typeof maybe.bank_name !== "string" ||
    !isStringArray(maybe.booking_date) ||
    !isStringArray(maybe.booking_text) ||
    !isStringArray(maybe.booking_type) ||
    !isStringArray(maybe.booking_amount)
  ) {
    return null;
  }

  const parseFormat =
    typeof maybe.booking_date_parse_format === "string"
      ? maybe.booking_date_parse_format
      : "";
  const withoutHeader = maybe.without_header === true;
  const detection = sanitizeDetection(maybe.detection);
  return {
    bank_name: maybe.bank_name,
    booking_date: [...maybe.booking_date],
    booking_text: [...maybe.booking_text],
    booking_type: [...maybe.booking_type],
    booking_amount: [...maybe.booking_amount],
    booking_date_parse_format: parseFormat,
    without_header: withoutHeader,
    detection,
  };
}

function sanitizeBankMapping(mapping: BankMapping): BankMapping {
  const parseFormat = mapping.booking_date_parse_format.trim();
  return {
    bank_name: mapping.bank_name,
    booking_date: [...mapping.booking_date],
    booking_text: [...mapping.booking_text],
    booking_type: [...mapping.booking_type],
    booking_amount: [...mapping.booking_amount],
    booking_date_parse_format: parseFormat,
    without_header: mapping.without_header === true,
    detection: sanitizeDetection(mapping.detection ?? null),
  };
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

function mergeBankMappings(
  primary: BankMapping[],
  overrides: BankMapping[],
): BankMapping[] {
  const map = new Map<string, BankMapping>();
  const normalize = (name: string) => name.trim().toLowerCase();
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
  return Array.from(map.values()).sort((a, b) =>
    a.bank_name.localeCompare(b.bank_name, "de", { sensitivity: "base" }),
  );
}

function setBankMappingsCacheFromSources(): void {
  const combined = mergeBankMappings(remoteBankMappings, localBankMappings);
  bankMappingsCache.length = 0;
  bankMappingsCache.push(...combined);
}

function loadLocalBankMappings(): BankMapping[] {
  const parsed = safeParse<unknown>(sessionScopedGetItem(LOCAL_BANK_MAPPINGS_KEY));
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map(toBankMapping)
    .filter((entry): entry is BankMapping => entry !== null)
    .map(sanitizeBankMapping);
}

function persistLocalBankMappings(mappings: BankMapping[]): void {
  const sanitized = mappings.map(sanitizeBankMapping);
  if (sanitized.length === 0) {
    sessionScopedRemoveItem(LOCAL_BANK_MAPPINGS_KEY);
    return;
  }
  sessionScopedSetItem(LOCAL_BANK_MAPPINGS_KEY, JSON.stringify(sanitized, null, 2));
}

function toTransactionImportSummary(value: unknown): TransactionImportSummary | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const maybe = value as {
    bank_name?: unknown;
    booking_account?: unknown;
    created_on?: unknown;
    first_booking_date?: unknown;
    last_booking_date?: unknown;
  };

  if (typeof maybe.bank_name !== "string") {
    return null;
  }

  const bookingAccount =
    typeof maybe.booking_account === "string" ? maybe.booking_account : "";

  let createdOn: string | null = null;
  if (typeof maybe.created_on === "string") {
    createdOn = maybe.created_on;
  } else if (maybe.created_on instanceof Date) {
    createdOn = maybe.created_on.toISOString();
  } else if (maybe.created_on === null) {
    createdOn = null;
  }

  const first =
    typeof maybe.first_booking_date === "string" ? maybe.first_booking_date : "";
  const last =
    typeof maybe.last_booking_date === "string" ? maybe.last_booking_date : "";

  return {
    bank_name: maybe.bank_name,
    booking_account: bookingAccount,
    created_on: createdOn,
    first_booking_date: first,
    last_booking_date: last,
  };
}

function sanitizeTransactionImportSummary(
  summary: TransactionImportSummary,
): TransactionImportSummary {
  const bankName = summary.bank_name.trim();
  const bookingAccount = summary.booking_account.trim();
  const first = summary.first_booking_date ? summary.first_booking_date.trim() : "";
  const last = summary.last_booking_date ? summary.last_booking_date.trim() : "";

  let created: string | null = null;
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

async function fetchBankMappingsFromBackend(): Promise<BankMapping[]> {
  const response = await apiRequest("/bank-mapping");
  const payload = await readJson<{ mappings?: unknown }>(response);
  const entries = Array.isArray(payload.mappings) ? payload.mappings : [];
  return entries
    .map(toBankMapping)
    .filter((entry): entry is BankMapping => entry !== null)
    .map(sanitizeBankMapping);
}

async function fetchSettingsFromBackend(): Promise<Record<string, unknown>> {
  const response = await apiRequest("/settings");
  const payload = await readJson<{ settings?: Record<string, unknown> }>(response);
  return payload.settings ?? {};
}

export async function fetchTransactionImportsFromBackend(): Promise<TransactionImportSummary[]> {
  const response = await apiRequest("/transactions/imports");
  const payload = await readJson<{ imports?: unknown }>(response);
  const entries = Array.isArray(payload.imports) ? payload.imports : [];
  transactionImportsCache = entries
    .map(toTransactionImportSummary)
    .filter((entry): entry is TransactionImportSummary => entry !== null)
    .map(sanitizeTransactionImportSummary);
  return transactionImportsCache.map((entry) => ({ ...entry }));
}

export function loadBankMappings(): BankMapping[] {
  return bankMappingsCache.map(sanitizeBankMapping);
}

export function loadTransactionImports(): TransactionImportSummary[] {
  return transactionImportsCache.map((entry) => ({ ...entry }));
}

export function importBankMappings(raw: unknown): BankMapping[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const sanitized = raw
    .map(toBankMapping)
    .filter((entry): entry is BankMapping => entry !== null)
    .map(sanitizeBankMapping);
  localBankMappings = [...sanitized];
  persistLocalBankMappings(localBankMappings);
  setBankMappingsCacheFromSources();
  return sanitized;
}

export function saveBankMapping(mapping: BankMapping): BankMapping {
  const sanitized = sanitizeBankMapping(mapping);
  const normalized = sanitized.bank_name.trim().toLowerCase();
  const index = localBankMappings.findIndex(
    (entry) => entry.bank_name.trim().toLowerCase() === normalized,
  );
  if (index >= 0) {
    localBankMappings[index] = sanitized;
  } else {
    localBankMappings.push(sanitized);
  }
  persistLocalBankMappings(localBankMappings);
  setBankMappingsCacheFromSources();
  return sanitized;
}

export function loadDisplaySettings(): DisplaySettings {
  return sanitizeDisplaySettings(displaySettingsCache);
}

export function saveDisplaySettings(settings: DisplaySettings): void {
  const sanitized = sanitizeDisplaySettings(settings);
  displaySettingsCache = sanitized;
  settingsCache = { ...settingsCache, [DISPLAY_SETTINGS_KEY]: sanitized };
  fireAndForget(
    apiRequest("/settings", {
      method: "PUT",
      body: JSON.stringify(settingsCache),
    }),
    "saveDisplaySettings",
  );
}

function toUnifiedTx(value: unknown): UnifiedTx | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const maybe = value as Partial<UnifiedTx> & {
    bank_name?: unknown;
    booking_date?: unknown;
    booking_date_raw?: unknown;
    booking_date_iso?: unknown;
    booking_text?: unknown;
    booking_type?: unknown;
    booking_amount?: unknown;
    booking_account?: unknown;
    booking_hash?: unknown;
  };
  if (
    typeof maybe.bank_name !== "string" ||
    typeof maybe.booking_date !== "string" ||
    typeof maybe.booking_text !== "string" ||
    typeof maybe.booking_type !== "string" ||
    typeof maybe.booking_amount !== "string"
  ) {
    return null;
  }

  const raw =
    typeof maybe.booking_date_raw === "string"
      ? maybe.booking_date_raw
      : maybe.booking_date;

  let iso: string | null = null;
  if (typeof maybe.booking_date_iso === "string") {
    const time = Date.parse(maybe.booking_date_iso);
    iso = Number.isNaN(time) ? null : maybe.booking_date_iso;
  } else if (maybe.booking_date_iso === null) {
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
    booking_account:
      typeof maybe.booking_account === "string" ? maybe.booking_account : "",
    booking_hash: typeof maybe.booking_hash === "string" ? maybe.booking_hash : undefined,
  };
}

function extractHash(tx: UnifiedTx): string | undefined {
  const withHash = tx as UnifiedTx & { hash?: unknown };
  if (typeof withHash.booking_hash === "string" && withHash.booking_hash.length > 0) {
    return withHash.booking_hash;
  }
  if (typeof withHash.hash === "string" && withHash.hash.length > 0) {
    return withHash.hash;
  }
  return undefined;
}

function sanitizeTransaction(tx: UnifiedTx): UnifiedTx {
  const iso = tx.booking_date_iso;
  let normalizedIso: string | null = null;
  if (typeof iso === "string") {
    const time = Date.parse(iso);
    normalizedIso = Number.isNaN(time) ? null : iso;
  }
  const bookingHash = extractHash(tx);
  return {
    bank_name: tx.bank_name,
    booking_date: tx.booking_date,
    booking_date_raw: tx.booking_date_raw ?? tx.booking_date,
    booking_date_iso: normalizedIso,
    booking_text: tx.booking_text,
    booking_type: tx.booking_type,
    booking_amount: tx.booking_amount,
    booking_account: typeof tx.booking_account === "string" ? tx.booking_account : "",
    ...(bookingHash ? { booking_hash: bookingHash } : {}),
  };
}

function transactionTimestamp(tx: UnifiedTx): number {
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

function sortTransactions(entries: UnifiedTx[]): UnifiedTx[] {
  return [...entries].sort((a, b) => transactionTimestamp(b) - transactionTimestamp(a));
}

async function fetchMaskedTransactionsFromBackend(): Promise<UnifiedTx[]> {
  const response = await apiRequest("/transactions/masked");
  const payload = await readJson<{ transactions?: unknown }>(response);
  const parsed = Array.isArray(payload.transactions) ? payload.transactions : [];
  const normalized = parsed
    .map(toUnifiedTx)
    .filter((entry): entry is UnifiedTx => entry !== null)
    .map(sanitizeTransaction);
  return sortTransactions(normalized);
}

function updateTransactionsCache(entries: UnifiedTx[]): UnifiedTx[] {
  const sanitized = entries.map(sanitizeTransaction);
  transactionsCache = sortTransactions(sanitized);
  return [...transactionsCache];
}

function updateMaskedTransactionsCache(entries: UnifiedTx[]): UnifiedTx[] {
  const sanitized = entries.map(sanitizeTransaction);
  maskedTransactionsCache = sortTransactions(sanitized);
  return [...maskedTransactionsCache];
}

export function loadTransactions(): UnifiedTx[] {
  return [...transactionsCache];
}

export function saveTransactions(entries: UnifiedTx[]): void {
  const updated = updateTransactionsCache(entries);
  fireAndForget(
    rawTransactionsSessionStorage.storeMany(updated),
    "saveTransactions#session",
  );
}

export interface AppendTransactionsResult {
  transactions: UnifiedTx[];
  addedCount: number;
  skippedDuplicates: number;
}

export interface AppendTransactionsOptions {
  onProgress?: (processed: number, total: number, imported: number) => void;
}

export async function appendTransactions(
  entries: UnifiedTx[],
  options?: AppendTransactionsOptions,
): Promise<AppendTransactionsResult> {
  const sanitizedNewEntries = entries.map(sanitizeTransaction);
  const total = sanitizedNewEntries.length;
  if (total === 0) {
    return {
      transactions: [...transactionsCache],
      addedCount: 0,
      skippedDuplicates: 0,
    };
  }

  const existingSnapshot = await rawTransactionsSessionStorage.loadSnapshot();
  const snapshotEntries = existingSnapshot.map(({ hash, ...entry }) => ({
    ...entry,
    booking_hash:
      typeof entry.booking_hash === "string" && entry.booking_hash.length > 0
        ? entry.booking_hash
        : hash,
  }));
  const knownHashes = new Set(existingSnapshot.map((entry) => entry.hash));
  const uniqueEntries: UnifiedTx[] = [];
  const entriesToPersist: UnifiedTx[] = [];
  let skippedDuplicates = 0;
  let processed = 0;

  for (const entry of sanitizedNewEntries) {
    const hash = await computeUnifiedTxHash(entry);
    if (knownHashes.has(hash)) {
      skippedDuplicates += 1;
    } else {
      knownHashes.add(hash);
      const entryWithHash: UnifiedTx = { ...entry, booking_hash: hash };
      entriesToPersist.push({ ...entryWithHash });
      uniqueEntries.push({ ...entryWithHash });
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

  await rawTransactionsSessionStorage.storeMany([...snapshotEntries, ...entriesToPersist]);
  const persistedTransactions = uniqueEntries.map((entry) => ({ ...entry }));
  const combined = transactionsCache.concat(persistedTransactions);
  const updated = updateTransactionsCache(combined);

  return {
    transactions: updated,
    addedCount: persistedTransactions.length,
    skippedDuplicates,
  };
}

export function loadMaskedTransactions(): UnifiedTx[] {
  return [...maskedTransactionsCache];
}

export async function saveMaskedTransactions(entries: UnifiedTx[]): Promise<void> {
  const updated = updateMaskedTransactionsCache(entries);
  await maskedTransactionsStorage.store(updated, transactionsCache);
}

export async function persistMaskedTransactions(): Promise<void> {
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

function isAnonRule(value: unknown): value is AnonRule {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const maybe = value as Partial<AnonRule> & { type?: string };
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

function sanitizeRule(rule: AnonRule): AnonRule {
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

export function loadAnonymizationRules(): { rules: AnonRule[]; version: number } {
  const parsed = safeParse<unknown>(sessionScopedGetItem(ANON_RULES_KEY));
  if (
    parsed &&
    typeof parsed === "object" &&
    parsed !== null &&
    "rules" in parsed &&
    Array.isArray((parsed as { rules: unknown }).rules)
  ) {
    const rules = (parsed as { rules: unknown[]; version?: number }).rules.filter(isAnonRule).map(sanitizeRule);
    const version =
      typeof (parsed as { version?: number }).version === "number"
        ? (parsed as { version?: number }).version!
        : CURRENT_RULE_VERSION;
    return { rules, version };
  }
  sessionScopedSetItem(ANON_RULES_KEY, JSON.stringify(DEFAULT_RULES, null, 2));
  return DEFAULT_RULES;
}

export function saveAnonymizationRules(rules: AnonRule[]): void {
  const sanitized = {
    version: CURRENT_RULE_VERSION,
    rules: rules.map(sanitizeRule),
  };
  sessionScopedSetItem(ANON_RULES_KEY, JSON.stringify(sanitized, null, 2));
}

export function importAnonymizationRules(
  raw: unknown
): { rules: AnonRule[]; version: number } | null {
  if (Array.isArray(raw)) {
    const rules = raw.filter(isAnonRule).map(sanitizeRule);
    const payload = { version: CURRENT_RULE_VERSION, rules };
    sessionScopedSetItem(ANON_RULES_KEY, JSON.stringify(payload, null, 2));
    return payload;
  }

  if (typeof raw === "object" && raw !== null && "rules" in raw) {
    const maybe = raw as { rules?: unknown; version?: unknown };
    if (Array.isArray(maybe.rules)) {
      const rules = maybe.rules.filter(isAnonRule).map(sanitizeRule);
      const version = typeof maybe.version === "number" ? maybe.version : CURRENT_RULE_VERSION;
      const payload = { version, rules };
      sessionScopedSetItem(ANON_RULES_KEY, JSON.stringify(payload, null, 2));
      return payload;
    }
  }

  return null;
}

export function clearPersistentData(): void {
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
  fireAndForget(
    apiRequest("/storage", {
      method: "DELETE",
    }),
    "clearPersistentData",
  );
  fireAndForget(
    Promise.all([
      rawTransactionsSessionStorage.storeMany([]),
      maskedTransactionsStorage.store([], []),
    ]),
    "clearSessionStorage",
  );
  const sessionScopedKeys = [LOCAL_BANK_MAPPINGS_KEY, ANON_RULES_KEY];
  for (const key of sessionScopedKeys) {
    sessionScopedRemoveItem(key);
  }
  const persistentKeys = [
    BANK_MAPPINGS_KEY,
    TRANSACTIONS_KEY,
    TRANSACTIONS_MASKED_KEY,
    DISPLAY_SETTINGS_KEY,
  ];
  for (const key of persistentKeys) {
    localStorage.removeItem(key);
  }
}
