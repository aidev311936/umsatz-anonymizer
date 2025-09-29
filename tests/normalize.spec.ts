import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsvContent } from '../src/lib/csv/parse';
import { buildNormalizedCsv, MappingConfig, normaliseRows } from '../src/lib/normalize';

describe('normalisation', () => {
  it('normalises comdirect rows', () => {
    const content = readFileSync('fixtures/comdirect.csv', 'utf-8');
    const parsed = parseCsvContent(content);

    const mapping: MappingConfig = {
      bookingDate: 'Buchungstag',
      bookingText: ['Buchungstext'],
      bookingType: 'Vorgang',
      bookingAmount: 'Umsatz in EUR'
    };

    const result = normaliseRows(parsed.rows, parsed.headers, mapping);

    expect(result.invalidAmountCount).toBe(0);
    expect(result.invalidDateCount).toBe(0);
    expect(result.rows[0]).toMatchObject({
      booking_date: '2025-09-21',
      booking_text: 'REWE Markt 1234',
      booking_type: 'Kartenzahlung',
      booking_amount: '-35.67',
      dateValid: true,
      amountValid: true
    });
  });

  it('concatenates paycenter text columns and normalises amounts', () => {
    const content = readFileSync('fixtures/paycenter.csv', 'utf-8');
    const parsed = parseCsvContent(content);

    const mapping: MappingConfig = {
      bookingDate: 'Datum',
      bookingText: ['Verwendungszweck', 'Zahlungspartner'],
      bookingType: 'Type',
      bookingAmount: 'Betrag'
    };

    const result = normaliseRows(parsed.rows, parsed.headers, mapping);

    expect(result.rows[0]).toMatchObject({
      booking_date: '2025-09-20',
      booking_text: 'Rechnung 0815 ACME GmbH',
      booking_type: 'Überweisung',
      booking_amount: '-120.00'
    });

    const csv = buildNormalizedCsv(result.rows);
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toBe('booking_date,booking_text,booking_type,booking_amount');
  });

  it('counts invalid values during normalisation', () => {
    const mapping: MappingConfig = {
      bookingDate: 'Datum',
      bookingText: ['Text'],
      bookingType: 'Art',
      bookingAmount: 'Betrag'
    };

    const headers = ['Datum', 'Text', 'Art', 'Betrag'];
    const rows = [
      ['31.02.2025', 'Test', 'Fehler', 'abc'],
      ['', 'Leer', 'Fehler', '1.234,00 EUR']
    ];

    const result = normaliseRows(rows, headers, mapping);

    expect(result.invalidDateCount).toBe(2);
    expect(result.invalidAmountCount).toBe(1);
    expect(result.rows[1].booking_amount).toBe('1234.00');
  });
});
