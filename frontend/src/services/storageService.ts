import {
  appendTransactions,
  clearPersistentData,
  fetchTransactionImportsFromBackend,
  importAnonymizationRules,
  importBankMappings,
  initializeStorage,
  loadAnonymizationRules,
  loadBankMappings,
  loadDisplaySettings,
  loadMaskedTransactions,
  loadTransactionImports,
  loadTransactions,
  persistMaskedTransactions,
  saveAnonymizationRules,
  saveBankMapping,
  saveDisplaySettings,
  saveMaskedTransactions,
  saveTransactions,
  type AppendTransactionsResult,
} from "../storage";
import type {
  AnonRule,
  BankMapping,
  DisplaySettings,
  TransactionImportSummary,
  UnifiedTx,
} from "../types";

export async function ensureStorageInitialized(): Promise<void> {
  await initializeStorage();
}

export function getBankMappings(): BankMapping[] {
  return loadBankMappings();
}

export function getTransactionImports(): TransactionImportSummary[] {
  return loadTransactionImports();
}

export function getDisplaySettings(): DisplaySettings {
  return loadDisplaySettings();
}

export function getTransactions(): UnifiedTx[] {
  return loadTransactions();
}

export function getMaskedTransactions(): UnifiedTx[] {
  return loadMaskedTransactions();
}

export function getAnonymizationRules(): { rules: AnonRule[]; version: number } {
  return loadAnonymizationRules();
}

export async function storeTransactions(entries: UnifiedTx[]): Promise<void> {
  saveTransactions(entries);
}

export async function storeMaskedTransactions(entries: UnifiedTx[]): Promise<void> {
  await saveMaskedTransactions(entries);
}

export async function storeDisplaySettings(settings: DisplaySettings): Promise<void> {
  saveDisplaySettings(settings);
}

export async function storeAnonymizationRules(rules: AnonRule[]): Promise<void> {
  saveAnonymizationRules(rules);
}

export async function storeBankMapping(mapping: BankMapping): Promise<BankMapping> {
  return saveBankMapping(mapping);
}

export async function importBankMappingsFromFile(raw: unknown): Promise<BankMapping[] | null> {
  return importBankMappings(raw);
}

export async function importRulesFromFile(raw: unknown): Promise<AnonRule[] | null> {
  const result = importAnonymizationRules(raw);
  return result?.rules ?? null;
}

export async function appendImportedTransactions(
  entries: UnifiedTx[],
  _options: {
    bankName: string;
    bookingAccount: string;
  },
): Promise<AppendTransactionsResult> {
  const result = await appendTransactions(entries);
  return result;
}

export async function fetchTransactionImportHistory(): Promise<TransactionImportSummary[]> {
  return fetchTransactionImportsFromBackend();
}

export async function persistMaskedToBackend(): Promise<void> {
  await persistMaskedTransactions();
}

export async function resetPersistentData(): Promise<void> {
  clearPersistentData();
}

export type {
  AnonRule,
  BankMapping,
  DisplaySettings,
  TransactionImportSummary,
  UnifiedTx,
  AppendTransactionsResult,
};
