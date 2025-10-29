import { parseCsv } from "../csv";
import { detectHeader, type HeaderDetectionResult } from "../headerDetect";
import { applyMapping } from "../transform";
import {
  formatTransactionsForDisplay,
  sanitizeDisplaySettings,
  type DisplaySettings,
} from "../displaySettings";
import type { MappingSelection, UnifiedTx } from "../types";

export async function readCsvFile(file: File): Promise<string[][]> {
  return parseCsv(file);
}

export function analyzeHeader(rows: string[][]): HeaderDetectionResult {
  return detectHeader(rows);
}

export function createTransactions(
  rows: string[][],
  header: string[],
  mapping: MappingSelection,
  options: { bankName: string; bookingAccount: string },
  displaySettings?: DisplaySettings,
): UnifiedTx[] {
  const settings = sanitizeDisplaySettings(displaySettings ?? null);
  return applyMapping(rows, header, mapping, options.bankName, options.bookingAccount, settings);
}

export function formatTransactions(
  transactions: UnifiedTx[],
  displaySettings?: DisplaySettings,
): UnifiedTx[] {
  const settings = sanitizeDisplaySettings(displaySettings ?? null);
  return formatTransactionsForDisplay(transactions, settings);
}

export function createDefaultMapping(header: string[]): MappingSelection {
  return {
    booking_date: header.length > 0 ? [header[0]] : [],
    booking_text: header.slice(1, 2),
    booking_type: header.slice(2, 3),
    booking_amount: header.slice(3, 4),
    booking_date_parse_format: "",
    without_header: false,
  };
}
