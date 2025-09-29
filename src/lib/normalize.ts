import { parseBookingDate } from '../utils/date';

export interface MappingConfig {
  bookingDate?: string;
  bookingText: string[];
  bookingType?: string;
  bookingAmount?: string;
}

export interface NormalizedRow {
  booking_date: string;
  booking_text: string;
  booking_type: string;
  booking_amount: string;
  dateValid: boolean;
  amountValid: boolean;
}

export interface NormalizationResult {
  rows: NormalizedRow[];
  invalidDateCount: number;
  invalidAmountCount: number;
}

function normaliseTextParts(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseType(value: string | undefined): string {
  return (value ?? '').trim();
}

function normaliseAmount(rawValue: string | undefined): { value: string; valid: boolean } {
  const value = (rawValue ?? '').trim();
  if (!value) {
    return { value: '', valid: false };
  }

  let cleaned = value.replace(/(EUR|€)/gi, '');
  cleaned = cleaned.replace(/\s+/g, '');
  cleaned = cleaned.replace(/\./g, '');
  cleaned = cleaned.replace(/,/g, '.');

  if (cleaned.endsWith('-')) {
    cleaned = `-${cleaned.slice(0, -1)}`;
  }

  if (!cleaned || cleaned === '-' || cleaned === '+') {
    return { value: '', valid: false };
  }

  const parsed = Number.parseFloat(cleaned);
  if (Number.isNaN(parsed)) {
    return { value: '', valid: false };
  }

  return { value: parsed.toFixed(2), valid: true };
}

export function normaliseRows(
  rows: string[][],
  headers: string[],
  mapping: MappingConfig
): NormalizationResult {
  if (!mapping.bookingDate || !mapping.bookingType || !mapping.bookingAmount || mapping.bookingText.length === 0) {
    throw new Error('Es wurden nicht alle Felder zugeordnet.');
  }

  const headerIndex = new Map<string, number>();
  headers.forEach((header, index) => {
    headerIndex.set(header.trim(), index);
  });

  const getCell = (row: string[], column: string | undefined): string => {
    if (!column) {
      return '';
    }
    const index = headerIndex.get(column.trim());
    if (index === undefined) {
      return '';
    }
    return row[index] ?? '';
  };

  let invalidDateCount = 0;
  let invalidAmountCount = 0;

  const normalizedRows: NormalizedRow[] = rows.map((row) => {
    const dateValue = getCell(row, mapping.bookingDate);
    const parsedDate = parseBookingDate(dateValue);
    if (!parsedDate.valid) {
      invalidDateCount += 1;
    }

    const textParts = mapping.bookingText.map((column) => getCell(row, column));
    const textValue = normaliseTextParts(textParts);

    const typeValue = normaliseType(getCell(row, mapping.bookingType));

    const amountResult = normaliseAmount(getCell(row, mapping.bookingAmount));
    if (!amountResult.valid) {
      invalidAmountCount += 1;
    }

    return {
      booking_date: parsedDate.value,
      booking_text: textValue,
      booking_type: typeValue,
      booking_amount: amountResult.value,
      dateValid: parsedDate.valid,
      amountValid: amountResult.valid
    };
  });

  return {
    rows: normalizedRows,
    invalidDateCount,
    invalidAmountCount
  };
}

export function buildNormalizedCsv(rows: NormalizedRow[]): string {
  const header = 'booking_date,booking_text,booking_type,booking_amount';
  const body = rows
    .map((row) => {
      const values = [row.booking_date, row.booking_text, row.booking_type, row.booking_amount];
      return values
        .map((value) => {
          const safe = value ?? '';
          if (safe.includes('"') || safe.includes(',') || safe.includes('\n')) {
            return `"${safe.replace(/"/g, '""')}"`;
          }
          return safe;
        })
        .join(',');
    })
    .join('\n');
  return `${header}\n${body}`;
}
