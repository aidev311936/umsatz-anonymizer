import { defineStore } from "pinia";
import { analyzeHeader, createDefaultMapping, createTransactions, readCsvFile } from "../services/importService";
import type { MappingSelection } from "../types";
import type { HeaderDetectionResult } from "../headerDetect";
import { useBankMappingsStore } from "./bankMappings";
import type { BankMapping, UnifiedTx } from "../types";

const MAPPING_FIELDS: Array<keyof Pick<BankMapping, "booking_date" | "booking_text" | "booking_type" | "booking_amount">> = [
  "booking_date",
  "booking_text",
  "booking_type",
  "booking_amount",
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matchMappingByHeader(
  detection: HeaderDetectionResult,
  mappings: BankMapping[],
): BankMapping | null {
  if (detection.header.length === 0) {
    return null;
  }
  const normalizedHeader = detection.header.map(normalize);
  let bestMatch: { mapping: BankMapping; score: number } | null = null;

  for (const mapping of mappings) {
    let score = 0;
    let qualifies = true;

    for (const field of MAPPING_FIELDS) {
      const columns = mapping[field];
      if (columns.length === 0) {
        continue;
      }
      const matches = columns.filter((column) => normalizedHeader.includes(normalize(column)));
      if (matches.length === 0) {
        qualifies = false;
        break;
      }
      score += matches.length;
    }

    if (!qualifies) {
      continue;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { mapping, score };
    }
  }

  return bestMatch?.mapping ?? null;
}

function resolveDetectedMapping(
  detection: HeaderDetectionResult,
  mappings: BankMapping[],
): BankMapping | null {
  if (mappings.length === 0) {
    return null;
  }

  const detectedName = detection.detectedBank?.trim();
  if (detectedName) {
    const normalizedDetected = normalize(detectedName);
    const exactMatch = mappings.find((mapping) => normalize(mapping.bank_name) === normalizedDetected);
    if (exactMatch) {
      return exactMatch;
    }

    const substringMatch = mappings.find((mapping) => {
      const normalizedBank = normalize(mapping.bank_name);
      return normalizedBank.includes(normalizedDetected) || normalizedDetected.includes(normalizedBank);
    });
    if (substringMatch) {
      return substringMatch;
    }
  }

  return matchMappingByHeader(detection, mappings);
}

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
      const bankMappingsStore = useBankMappingsStore();
      this.loading = true;
      this.error = null;
      try {
        await bankMappingsStore.initialize();
        const rows = await readCsvFile(file);
        const detection = analyzeHeader(rows);
        const matchedMapping = resolveDetectedMapping(detection, bankMappingsStore.mappings);
        this.header = detection.header;
        this.dataRows = detection.dataRows;
        this.detectedBank = matchedMapping?.bank_name ?? detection.detectedBank ?? null;
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
            this.mapping = createDefaultMapping(detection.header);
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
