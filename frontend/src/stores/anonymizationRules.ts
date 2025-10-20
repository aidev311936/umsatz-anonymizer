import { defineStore } from "pinia";
import {
  ensureStorageInitialized,
  getAnonymizationRules,
  importRulesFromFile,
  storeAnonymizationRules,
  type AnonRule,
} from "../services/storageService";

interface RulesState {
  rules: AnonRule[];
  version: number | null;
  loading: boolean;
  error: string | null;
}

export const useAnonymizationRulesStore = defineStore("anonymizationRules", {
  state: (): RulesState => ({
    rules: [],
    version: null,
    loading: false,
    error: null,
  }),
  actions: {
    async initialize(): Promise<void> {
      if (this.rules.length > 0) {
        return;
      }
      this.loading = true;
      this.error = null;
      try {
        await ensureStorageInitialized();
        const { rules, version } = getAnonymizationRules();
        this.rules = rules;
        this.version = version;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Regeln konnten nicht geladen werden";
        this.rules = [];
        this.version = null;
      } finally {
        this.loading = false;
      }
    },
    async save(rules: AnonRule[]): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        await storeAnonymizationRules(rules);
        this.rules = [...rules];
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Regeln konnten nicht gespeichert werden";
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async importRules(raw: unknown): Promise<AnonRule[] | null> {
      this.loading = true;
      this.error = null;
      try {
        const rules = await importRulesFromFile(raw);
        if (rules) {
          this.rules = rules;
        }
        return rules;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Import der Regeln fehlgeschlagen";
        return null;
      } finally {
        this.loading = false;
      }
    },
    setRules(rules: AnonRule[]): void {
      this.rules = [...rules];
    },
  },
});
