import { format, isValid, parse } from 'date-fns';

const DATE_FORMATS = [
  'dd.MM.yyyy HH:mm:ss',
  'dd.MM.yyyy HH:mm',
  'dd.MM.yyyy',
  "yyyy-MM-dd'T'HH:mm:ss",
  "yyyy-MM-dd'T'HH:mm",
  'yyyy-MM-dd HH:mm:ss',
  'yyyy-MM-dd'
];

export interface DateParseResult {
  value: string;
  valid: boolean;
}

export function parseBookingDate(input: string | undefined): DateParseResult {
  const value = (input ?? '').trim();
  if (!value) {
    return { value: '', valid: false };
  }

  for (const pattern of DATE_FORMATS) {
    const parsed = parse(value, pattern, new Date());
    if (isValid(parsed)) {
      return { value: format(parsed, 'yyyy-MM-dd'), valid: true };
    }
  }

  return { value: '', valid: false };
}
