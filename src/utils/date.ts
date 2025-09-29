export interface DateParseResult {
  value: string;
  valid: boolean;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) {
    return false;
  }
  if (day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateTime(hour: number, minute: number, second: number): boolean {
  if (hour < 0 || hour > 23) {
    return false;
  }
  if (minute < 0 || minute > 59) {
    return false;
  }
  if (second < 0 || second > 59) {
    return false;
  }
  return true;
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseGermanDate(value: string): DateParseResult | null {
  const match = value.match(
    /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) {
    return null;
  }

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  const hour = match[4] ? Number.parseInt(match[4], 10) : 0;
  const minute = match[5] ? Number.parseInt(match[5], 10) : 0;
  const second = match[6] ? Number.parseInt(match[6], 10) : 0;

  if (!isValidDateParts(year, month, day)) {
    return { value: '', valid: false };
  }
  if (!validateTime(hour, minute, second)) {
    return { value: '', valid: false };
  }

  return { value: formatDate(year, month, day), valid: true };
}

function parseIsoDate(value: string): DateParseResult | null {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const hour = match[4] ? Number.parseInt(match[4], 10) : 0;
  const minute = match[5] ? Number.parseInt(match[5], 10) : 0;
  const second = match[6] ? Number.parseInt(match[6], 10) : 0;

  if (!isValidDateParts(year, month, day)) {
    return { value: '', valid: false };
  }
  if (!validateTime(hour, minute, second)) {
    return { value: '', valid: false };
  }

  return { value: formatDate(year, month, day), valid: true };
}

export function parseBookingDate(input: string | undefined): DateParseResult {
  const value = (input ?? '').trim();
  if (!value) {
    return { value: '', valid: false };
  }

  const germanResult = parseGermanDate(value);
  if (germanResult) {
    return germanResult;
  }

  const isoResult = parseIsoDate(value);
  if (isoResult) {
    return isoResult;
  }

  return { value: '', valid: false };
}
