import { defineStore } from "pinia";
import { anonymizeTransactions } from "../services/anonymizationService";
import {
  appendImportedTransactions,
  ensureStorageInitialized,
  fetchTransactionImportHistory,
  getMaskedTransactions,
  getTransactionImports,
  getTransactions,
  persistMaskedToBackend,
  storeMaskedTransactions,
  storeTransactions,
  type TransactionImportSummary,
  type UnifiedTx,
} from "../services/storageService";

interface TransactionsState {
  transactions: UnifiedTx[];
  maskedTransactions: UnifiedTx[];
  anonymized: UnifiedTx[];
  anonymizationWarnings: string[];
  history: TransactionImportSummary[];
  loading: boolean;
  error: string | null;
  saving: boolean;
}

export const useTransactionsStore = defineStore("transactions", {
  state: (): TransactionsState => ({
    transactions: [],
    maskedTransactions: [],
    anonymized: [],
    anonymizationWarnings: [],
    history: [],
    loading: false,
    error: null,
    saving: false,
  }),
  actions: {
    async initialize(): Promise<void> {
      if (this.transactions.length > 0 || this.maskedTransactions.length > 0) {
        return;
      }
      this.loading = true;
      this.error = null;
      try {
        await ensureStorageInitialized();
        this.transactions = getTransactions();
        this.maskedTransactions = getMaskedTransactions();
        this.history = getTransactionImports();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Transaktionen konnten nicht geladen werden";
      } finally {
        this.loading = false;
      }
    },
    async refreshHistory(): Promise<void> {
      try {
        const history = await fetchTransactionImportHistory();
        this.history = history;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Importverlauf konnte nicht aktualisiert werden";
      }
    },
    setTransactions(entries: UnifiedTx[]): void {
      this.transactions = [...entries];
    },
    setMaskedTransactions(entries: UnifiedTx[]): void {
      this.maskedTransactions = [...entries];
    },
    async saveTransactions(entries: UnifiedTx[]): Promise<void> {
      this.saving = true;
      this.error = null;
      try {
        await storeTransactions(entries);
        this.transactions = [...entries];
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Transaktionen konnten nicht gespeichert werden";
        throw error;
      } finally {
        this.saving = false;
      }
    },
    async saveMasked(entries: UnifiedTx[]): Promise<void> {
      this.saving = true;
      this.error = null;
      try {
        await storeMaskedTransactions(entries);
        this.maskedTransactions = [...entries];
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Anonymisierte Daten konnten nicht gespeichert werden";
        throw error;
      } finally {
        this.saving = false;
      }
    },
    async persistMasked(): Promise<void> {
      this.saving = true;
      this.error = null;
      try {
        await persistMaskedToBackend();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Anonymisierte Daten konnten nicht übertragen werden";
        throw error;
      } finally {
        this.saving = false;
      }
    },
    async anonymize(rules: Parameters<typeof anonymizeTransactions>[1]): Promise<void> {
      const result = await anonymizeTransactions(this.transactions, rules);
      this.anonymized = result.data;
      this.anonymizationWarnings = result.warnings;
    },
    clearAnonymization(): void {
      this.anonymized = [];
      this.anonymizationWarnings = [];
    },
    async appendImported(
      entries: UnifiedTx[],
      options: { bankName: string; bookingAccount: string },
    ): Promise<void> {
      this.saving = true;
      this.error = null;
      try {
        await appendImportedTransactions(entries, options);
        this.transactions = [...getTransactions()];
        this.history = [...getTransactionImports()];
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Import konnte nicht gespeichert werden";
        throw error;
      } finally {
        this.saving = false;
      }
    },
  },
});
