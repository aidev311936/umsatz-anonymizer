import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsvContent } from '../src/lib/csv/parse';
import { buildNormalizedCsv, normaliseRows, MappingConfig } from '../src/lib/normalize';

test('normalises comdirect rows', () => {
  const content = readFileSync('fixtures/comdirect.csv', 'utf-8');
  const parsed = parseCsvContent(content);

  const mapping: MappingConfig = {
    bookingDate: 'Buchungstag',
    bookingText: ['Buchungstext'],
    bookingType: 'Vorgang',
    bookingAmount: 'Umsatz in EUR'
  };

  const result = normaliseRows(parsed.rows, parsed.headers, mapping);

  assert.strictEqual(result.invalidAmountCount, 0);
  assert.strictEqual(result.invalidDateCount, 0);
  assert.deepStrictEqual(result.rows[0], {
    booking_date: '2025-09-21',
    booking_text: 'REWE Markt 1234',
    booking_type: 'Kartenzahlung',
    booking_amount: '-35.67',
    dateValid: true,
    amountValid: true
  });
});

test('concatenates paycenter text columns and normalises amounts', () => {
  const content = readFileSync('fixtures/paycenter.csv', 'utf-8');
  const parsed = parseCsvContent(content);

  const mapping: MappingConfig = {
    bookingDate: 'Datum',
    bookingText: ['Verwendungszweck', 'Zahlungspartner'],
    bookingType: 'Type',
    bookingAmount: 'Betrag'
  };

  const result = normaliseRows(parsed.rows, parsed.headers, mapping);

  assert.deepStrictEqual(result.rows[0], {
    booking_date: '2025-09-20',
    booking_text: 'Rechnung 0815 ACME GmbH',
    booking_type: 'Überweisung',
    booking_amount: '-120.00',
    dateValid: true,
    amountValid: true
  });

  const csv = buildNormalizedCsv(result.rows);
  const [headerLine] = csv.split('\n');
  assert.strictEqual(headerLine, 'booking_date,booking_text,booking_type,booking_amount');
});

test('counts invalid values during normalisation', () => {
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

  assert.strictEqual(result.invalidDateCount, 2);
  assert.strictEqual(result.invalidAmountCount, 1);
  assert.strictEqual(result.rows[1].booking_amount, '1234.00');
  assert.strictEqual(result.rows[0].booking_amount, '');
});
