import { defineStore } from "pinia";
import {
  analyzeHeader,
  createDefaultMapping,
  createTransactions,
  readCsvFile,
  type MappingSelection,
} from "../services/importService";
import type { UnifiedTx } from "../types";

interface ImportState {
  bankName: string;
  bookingAccount: string;
  header: string[];
  dataRows: string[][];
  mapping: MappingSelection | null;
  detectedBank: string | null;
  skippedRows: number;
  warning: string | null;
  loading: boolean;
  error: string | null;
  lastImported: UnifiedTx[];
}

export const useImportStore = defineStore("import", {
  state: (): ImportState => ({
    bankName: "",
    bookingAccount: "",
    header: [],
    dataRows: [],
    mapping: null,
    detectedBank: null,
    skippedRows: 0,
    warning: null,
    loading: false,
    error: null,
    lastImported: [],
  }),
  getters: {
    hasHeader(state): boolean {
      return state.header.length > 0;
    },
  },
  actions: {
    setBankName(value: string): void {
      this.bankName = value.trim();
    },
    setBookingAccount(value: string): void {
      this.bookingAccount = value.trim();
    },
    setMapping(mapping: MappingSelection): void {
      this.mapping = { ...mapping };
    },
    reset(): void {
      this.header = [];
      this.dataRows = [];
      this.mapping = null;
      this.detectedBank = null;
      this.skippedRows = 0;
      this.warning = null;
      this.lastImported = [];
      this.error = null;
    },
    async loadFile(file: File): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const rows = await readCsvFile(file);
        const detection = analyzeHeader(rows);
        this.header = detection.header;
        this.dataRows = detection.dataRows;
        this.detectedBank = detection.detectedBank ?? null;
        this.skippedRows = detection.skippedRows;
        this.warning = detection.warning ?? null;
        if (!this.mapping || this.mapping.booking_date.length === 0) {
          this.mapping = createDefaultMapping(detection.header);
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : "CSV konnte nicht geladen werden";
        this.reset();
      } finally {
        this.loading = false;
      }
    },
    importTransactions(displaySettings?: Parameters<typeof createTransactions>[4]): UnifiedTx[] {
      if (!this.mapping || this.header.length === 0) {
        this.error = "Bitte Mapping und Kopfzeile prüfen";
        return [];
      }
      const transactions = createTransactions(
        this.dataRows,
        this.header,
        this.mapping,
        { bankName: this.bankName, bookingAccount: this.bookingAccount },
        displaySettings,
      );
      this.lastImported = transactions;
      return transactions;
    },
  },
});
