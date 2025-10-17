import { defineStore } from "pinia";
import { sanitizeSettings } from "../services/displayService";
import {
  ensureStorageInitialized,
  getDisplaySettings,
  storeDisplaySettings,
  type DisplaySettings,
} from "../services/storageService";

interface DisplaySettingsState {
  settings: DisplaySettings | null;
  loading: boolean;
  error: string | null;
}

export const useDisplaySettingsStore = defineStore("displaySettings", {
  state: (): DisplaySettingsState => ({
    settings: null,
    loading: false,
    error: null,
  }),
  getters: {
    resolvedSettings(state): DisplaySettings {
      return state.settings ?? sanitizeSettings(null);
    },
  },
  actions: {
    async initialize(): Promise<void> {
      if (this.settings) {
        return;
      }
      this.loading = true;
      this.error = null;
      try {
        await ensureStorageInitialized();
        const settings = getDisplaySettings();
        this.settings = sanitizeSettings(settings);
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Einstellungen konnten nicht geladen werden";
        this.settings = sanitizeSettings(null);
      } finally {
        this.loading = false;
      }
    },
    async save(settings: DisplaySettings): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const sanitized = sanitizeSettings(settings);
        await storeDisplaySettings(sanitized);
        this.settings = sanitized;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Einstellungen konnten nicht gespeichert werden";
        throw error;
      } finally {
        this.loading = false;
      }
    },
    updateDraft(settings: Partial<DisplaySettings>): void {
      const current = this.settings ?? sanitizeSettings(null);
      this.settings = sanitizeSettings({ ...current, ...settings });
    },
  },
});
