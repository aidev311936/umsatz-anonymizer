import {
  formatBookingAmount,
  formatTransactionsForDisplay,
  sanitizeDisplaySettings,
  type DisplaySettings,
} from "../displaySettings";
import type { UnifiedTx } from "../types";

export function sanitizeSettings(value: Partial<DisplaySettings> | null | undefined): DisplaySettings {
  return sanitizeDisplaySettings(value);
}

export function formatTransactions(
  transactions: UnifiedTx[],
  settings: DisplaySettings,
): UnifiedTx[] {
  return formatTransactionsForDisplay(transactions, settings);
}

export function formatAmount(value: string, settings: DisplaySettings): string {
  return formatBookingAmount(value, settings);
}
