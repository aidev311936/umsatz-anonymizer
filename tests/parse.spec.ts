import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsvContent } from '../src/lib/csv/parse';

describe('CSV parsing', () => {
  it('skips the comdirect preamble and detects the delimiter', () => {
    const content = readFileSync('fixtures/comdirect.csv', 'utf-8');
    const result = parseCsvContent(content);

    expect(result.delimiter).toBe(';');
    expect(result.headers).toEqual([
      'Buchungstag',
      'Wertstellung',
      'Vorgang',
      'Buchungstext',
      'Umsatz in EUR'
    ]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0][0]).toBe('21.09.2025');
    expect(result.rows[0][4]).toBe('-35,67');
  });

  it('parses paycenter csv with comma delimiter', () => {
    const content = readFileSync('fixtures/paycenter.csv', 'utf-8');
    const result = parseCsvContent(content);

    expect(result.delimiter).toBe(',');
    expect(result.headers).toEqual(['Datum', 'Verwendungszweck', 'Zahlungspartner', 'Type', 'Betrag']);
    expect(result.rows[1][1]).toBe('Essen');
    expect(result.rows[1][4]).toBe('-6.50');
  });

  it('ignores a byte-order-mark and empty lines', () => {
    const content = '\ufefffoo,bar\n1,2\n\n';
    const result = parseCsvContent(content);

    expect(result.headers).toEqual(['foo', 'bar']);
    expect(result.rows).toEqual([['1', '2']]);
  });
});
