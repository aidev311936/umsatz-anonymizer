import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsvContent } from '../src/lib/csv/parse';

test('skips comdirect preamble and detects delimiter', () => {
  const content = readFileSync('fixtures/comdirect.csv', 'utf-8');
  const result = parseCsvContent(content);

  assert.strictEqual(result.delimiter, ';');
  assert.deepStrictEqual(result.headers, [
    'Buchungstag',
    'Wertstellung',
    'Vorgang',
    'Buchungstext',
    'Umsatz in EUR'
  ]);
  assert.strictEqual(result.rows.length, 3);
  assert.strictEqual(result.rows[0][0], '21.09.2025');
  assert.strictEqual(result.rows[0][4], '-35,67');
});

test('parses paycenter csv with comma delimiter', () => {
  const content = readFileSync('fixtures/paycenter.csv', 'utf-8');
  const result = parseCsvContent(content);

  assert.strictEqual(result.delimiter, ',');
  assert.deepStrictEqual(result.headers, [
    'Datum',
    'Verwendungszweck',
    'Zahlungspartner',
    'Type',
    'Betrag'
  ]);
  assert.strictEqual(result.rows[1][1], 'Essen');
  assert.strictEqual(result.rows[1][4], '-6.50');
});

test('ignores byte-order-mark and empty lines', () => {
  const content = '\ufefffoo,bar\n1,2\n\n';
  const result = parseCsvContent(content);

  assert.deepStrictEqual(result.headers, ['foo', 'bar']);
  assert.deepStrictEqual(result.rows, [['1', '2']]);
});
