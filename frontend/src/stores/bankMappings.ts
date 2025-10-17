import { defineStore } from "pinia";
import {
  ensureStorageInitialized,
  getBankMappings,
  importBankMappingsFromFile,
  storeBankMapping,
  type BankMapping,
} from "../services/storageService";

interface BankMappingsState {
  mappings: BankMapping[];
  loading: boolean;
  error: string | null;
}

export const useBankMappingsStore = defineStore("bankMappings", {
  state: (): BankMappingsState => ({
    mappings: [],
    loading: false,
    error: null,
  }),
  getters: {
    knownBanks(state): string[] {
      return state.mappings.map((mapping) => mapping.bank_name).sort();
    },
    mappingByBank: (state) => (bankName: string): BankMapping | undefined =>
      state.mappings.find((mapping) => mapping.bank_name === bankName),
  },
  actions: {
    async initialize(): Promise<void> {
      if (this.mappings.length > 0) {
        return;
      }
      this.loading = true;
      this.error = null;
      try {
        await ensureStorageInitialized();
        this.mappings = getBankMappings();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Bank-Mappings konnten nicht geladen werden";
        this.mappings = [];
      } finally {
        this.loading = false;
      }
    },
    async save(mapping: BankMapping): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        await storeBankMapping(mapping);
        const existingIndex = this.mappings.findIndex(
          (entry) => entry.bank_name.toLowerCase() === mapping.bank_name.toLowerCase(),
        );
        if (existingIndex >= 0) {
          this.mappings.splice(existingIndex, 1, mapping);
        } else {
          this.mappings.push(mapping);
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Bank-Mapping konnte nicht gespeichert werden";
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async importMappings(raw: unknown): Promise<BankMapping[] | null> {
      this.loading = true;
      this.error = null;
      try {
        const result = await importBankMappingsFromFile(raw);
        if (result) {
          this.mappings = result;
        }
        return result;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Import der Mappings fehlgeschlagen";
        return null;
      } finally {
        this.loading = false;
      }
    },
  },
});
