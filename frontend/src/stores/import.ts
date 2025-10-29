import { defineStore } from "pinia";
import { analyzeHeader, createDefaultMapping, createTransactions, readCsvFile } from "../services/importService";
import type { DetectedBankCandidate } from "../headerDetect";
import { useBankMappingsStore } from "./bankMappings";
import type { MappingSelection, UnifiedTx } from "../types";

interface ImportState {
  bankName: string;
  bookingAccount: string;
  header: string[];
  dataRows: string[][];
  hasHeader: boolean;
  mapping: MappingSelection | null;
  detectedBank: string | null;
  skippedRows: number;
  warning: string | null;
  loading: boolean;
  error: string | null;
  lastImported: UnifiedTx[];
  candidates: DetectedBankCandidate[];
}

export const useImportStore = defineStore("import", {
  state: (): ImportState => ({
    bankName: "",
    bookingAccount: "",
    header: [],
    dataRows: [],
    hasHeader: false,
    mapping: null,
    detectedBank: null,
    skippedRows: 0,
    warning: null,
    loading: false,
    error: null,
    lastImported: [],
    candidates: [],
  }),
  getters: {
    hasHeader(state): boolean {
      return state.hasHeader;
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
      this.hasHeader = false;
      this.mapping = null;
      this.detectedBank = null;
      this.skippedRows = 0;
      this.warning = null;
      this.lastImported = [];
      this.error = null;
      this.candidates = [];
    },
    async loadFile(file: File): Promise<void> {
      const bankMappingsStore = useBankMappingsStore();
      this.loading = true;
      this.error = null;
      try {
        await bankMappingsStore.initialize();
        const rows = await readCsvFile(file);
        const detection = analyzeHeader(rows, bankMappingsStore.mappings);
        const preferredCandidate =
          detection.candidates.find((candidate) => candidate.passed) ?? detection.candidates[0] ?? null;
        const matchedMapping = preferredCandidate?.passed ? preferredCandidate.mapping : null;
        this.header = detection.header;
        this.dataRows = detection.dataRows;
        this.hasHeader = detection.hasHeader;
        this.candidates = detection.candidates;
        this.detectedBank =
          matchedMapping?.bank_name ?? preferredCandidate?.mapping.bank_name ?? this.detectedBank ?? null;
        this.skippedRows = detection.skippedRows;
        this.warning = detection.warning ?? null;
        if (!this.mapping || this.mapping.booking_date.length === 0) {
          if (matchedMapping) {
            this.mapping = {
              booking_date: [...matchedMapping.booking_date],
              booking_text: [...matchedMapping.booking_text],
              booking_type: [...matchedMapping.booking_type],
              booking_amount: [...matchedMapping.booking_amount],
              booking_date_parse_format: matchedMapping.booking_date_parse_format,
              without_header: matchedMapping.without_header,
            };
          } else {
            const fallback = createDefaultMapping(detection.header);
            this.mapping = {
              ...fallback,
              without_header: detection.hasHeader ? fallback.without_header : true,
            };
          }
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
