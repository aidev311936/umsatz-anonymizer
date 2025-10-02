import { formatDateWithFormat, parseDateWithFormat } from "./dateFormat.js";
import { BankMapping, UnifiedTx } from "./types.js";

type MappingSelection = Omit<BankMapping, "bank_name">;

function createIndexMap(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((name, index) => {
    if (!(name in map)) {
      map[name] = index;
    }
  });
  return map;
}

function readValue(row: string[], columnName: string, indexMap: Record<string, number>): string {
  const index = indexMap[columnName];
  if (index === undefined) {
    return "";
  }
  return (row[index] ?? "").toString().trim();
}

function firstNonEmpty(values: string[]): string {
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return "";
}

function joinValues(values: string[]): string {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join(" ");
}

function isTransactionEmpty(tx: UnifiedTx): boolean {
  return (
    tx.booking_date.trim() === "" &&
    tx.booking_text.trim() === "" &&
    tx.booking_type.trim() === "" &&
    tx.booking_amount.trim() === ""
  );
}

export function applyMapping(
  rows: string[][],
  header: string[],
  mapping: MappingSelection,
  bankName: string
): UnifiedTx[] {
  const indexMap = createIndexMap(header);
  const transactions: UnifiedTx[] = [];

  for (const row of rows) {
    const bookingDateRaw = firstNonEmpty(
      mapping.booking_date.map((column) => readValue(row, column, indexMap))
    );
    const bookingText = joinValues(mapping.booking_text.map((column) => readValue(row, column, indexMap)));
    const bookingType = firstNonEmpty(mapping.booking_type.map((column) => readValue(row, column, indexMap)));
    const bookingAmount = firstNonEmpty(mapping.booking_amount.map((column) => readValue(row, column, indexMap)));

    const parseFormat = mapping.booking_date_parse_format?.trim() ?? "";
    const displayFormat = mapping.booking_date_display_format?.trim() ?? "";

    let bookingDateFormatted = bookingDateRaw;
    let bookingDateIso: string | null = null;

    if (parseFormat && bookingDateRaw.length > 0) {
      const parsed = parseDateWithFormat(bookingDateRaw, parseFormat);
      if (parsed) {
        bookingDateIso = parsed.toISOString();
        const effectiveDisplayFormat = displayFormat.length > 0 ? displayFormat : parseFormat;
        bookingDateFormatted = effectiveDisplayFormat
          ? formatDateWithFormat(parsed, effectiveDisplayFormat)
          : bookingDateRaw;
      }
    }

    const tx: UnifiedTx = {
      bank_name: bankName,
      booking_date: bookingDateFormatted,
      booking_date_raw: bookingDateRaw,
      booking_date_iso: bookingDateIso,
      booking_text: bookingText,
      booking_type: bookingType,
      booking_amount: bookingAmount,
    };

    if (!isTransactionEmpty(tx)) {
      transactions.push(tx);
    }
  }

  return transactions;
}
