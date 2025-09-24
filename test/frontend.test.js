const test = require('node:test');
const assert = require('node:assert');

const {
  parseCSV,
  mergeTransactions,
  anonymize,
  parseDateString,
  getDateValue,
} = require('../app');

test('parseCSV converts semicolon separated text into objects', () => {
  const text = 'A;B;C\n1;2;3\n4;5;6';
  const rows = parseCSV(text);

  assert.deepStrictEqual(rows, [
    { A: '1', B: '2', C: '3' },
    { A: '4', B: '5', C: '6' },
  ]);
});

test('mergeTransactions sorts rows by detected date descending', () => {
  const existing = [
    { Buchungsdatum: '01.01.2023', Betrag: '10' },
    { Datum: '2022-12-30', Betrag: '20' },
  ];
  const incoming = [
    { Wertstellung: '05.01.2023', Betrag: '30' },
    { Datum: '2022-12-30', Betrag: '40' },
  ];

  const merged = mergeTransactions(existing, incoming);

  assert.deepStrictEqual(merged, [
    { Wertstellung: '05.01.2023', Betrag: '30' },
    { Buchungsdatum: '01.01.2023', Betrag: '10' },
    { Datum: '2022-12-30', Betrag: '20' },
    { Datum: '2022-12-30', Betrag: '40' },
  ]);
});

test('mergeTransactions keeps original order when date comparison ties', () => {
  const rows = [
    { Buchungsdatum: '01.02.2023', Betrag: '10' },
    { Buchungsdatum: '01.02.2023', Betrag: '20' },
  ];

  const merged = mergeTransactions([], rows);

  assert.deepStrictEqual(merged, rows);
});

test('anonymize masks long numbers and simple names in Verwendungszweck', () => {
  const rows = [
    { Verwendungszweck: 'Überweisung an Max Mustermann 123456789' },
    { Verwendungszweck: 'Kartenzahlung Supermarkt 9876' },
  ];

  const anonymized = anonymize(rows);

  assert.deepStrictEqual(anonymized, [
    { Verwendungszweck: 'Überweisung an XXX XXX ***' },
    { Verwendungszweck: 'XXX XXX ***' },
  ]);
});

test('parseDateString handles german and iso formats and ignores invalid', () => {
  const german = parseDateString('15.03.2024');
  const iso = parseDateString('2024-03-16');
  const invalid = parseDateString('not a date');

  assert.ok(german instanceof Date && !Number.isNaN(german.getTime()));
  assert.strictEqual(german.getFullYear(), 2024);
  assert.ok(iso instanceof Date && !Number.isNaN(iso.getTime()));
  assert.strictEqual(iso.getMonth(), 2);
  assert.strictEqual(invalid, null);
});

test('getDateValue returns the first parsable date from preferred keys', () => {
  const row = {
    Beschreibung: 'Test',
    Datum: '17.03.2024',
    Wertstellung: '2024-03-15',
  };

  const value = getDateValue(row);

  const expected = parseDateString('17.03.2024').getTime();
  assert.strictEqual(value, expected);
});
