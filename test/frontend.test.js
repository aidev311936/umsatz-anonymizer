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

test('anonymize leaves clearing transactions untouched', () => {
  const rows = [
    { Type: 'Clearing', Verwendungszweck: 'Keine Änderung', Zahlungspartner: 'ACME GmbH' },
  ];

  const [result] = anonymize(rows);

  assert.deepStrictEqual(result, rows[0]);
});

test('anonymize replaces digit sequences for Lastschrift and Rücklastschrift', () => {
  const rows = [
    { Type: 'Lastschrift', Verwendungszweck: 'Rechnung 12345', Zahlungspartner: 'ACME GmbH' },
    { Type: 'Rücklastschrift', Verwendungszweck: 'Rückgabe 42-987', Zahlungspartner: 'Bank' },
  ];

  const anonymized = anonymize(rows);

  assert.strictEqual(anonymized[0].Verwendungszweck, 'Rechnung XXX');
  assert.strictEqual(anonymized[0].Zahlungspartner, 'ACME GmbH');
  assert.strictEqual(anonymized[1].Verwendungszweck, 'Rückgabe XXX-XXX');
});

test('anonymize masks last names for transfers to private persons', () => {
  const rows = [
    {
      Type: 'Überweisung',
      Verwendungszweck: 'Miete für Max Mustermann',
      Zahlungspartner: 'Max Mustermann',
    },
  ];

  const [result] = anonymize(rows);

  assert.strictEqual(result.Verwendungszweck, 'Miete für Max XXX');
  assert.strictEqual(result.Zahlungspartner, 'Max XXX');
});

test('anonymize masks digits for transfers to companies', () => {
  const rows = [
    {
      Type: 'Überweisung',
      Verwendungszweck: 'Rechnung 998877',
      Zahlungspartner: 'Supermarkt GmbH',
    },
  ];

  const [result] = anonymize(rows);

  assert.strictEqual(result.Verwendungszweck, 'Rechnung XXX');
  assert.strictEqual(result.Zahlungspartner, 'Supermarkt GmbH');
});

test('anonymize keeps identical usage and partner text for companies', () => {
  const rows = [
    {
      Type: 'Lastschrift',
      Verwendungszweck: 'SPOTIFY AB',
      Zahlungspartner: 'SPOTIFY AB',
    },
  ];

  const [result] = anonymize(rows);

  assert.deepStrictEqual(result, rows[0]);
});

test('anonymize masks last names for top-ups from private persons', () => {
  const rows = [
    {
      Type: 'Aufladung',
      Verwendungszweck: 'Aufladung Anna Lena Meier',
      Zahlungspartner: 'ANNA LENA MEIER',
    },
  ];

  const [result] = anonymize(rows);

  assert.strictEqual(result.Verwendungszweck, 'Aufladung Anna Lena XXX');
  assert.strictEqual(result.Zahlungspartner, 'ANNA LENA XXX');
});

test('anonymize fully protects provided example dataset', () => {
  const rows = [
    {
      Datum: '2024-06-01 09:37:25.130000',
      Betrag: '43,52',
      Verwendungszweck: 'MCDONALDS 1378 - BERLIN, DEU',
      Zahlungspartner: 'MCDONALDS 1378 - BERLIN, DEU',
      Type: 'Clearing',
    },
    {
      Datum: '2024-06-01 10:20:59.826667',
      Betrag: '500,6',
      Verwendungszweck: 'Schmidt, 304458',
      Zahlungspartner: 'Plan-Finanz24 GmbH',
      Type: 'Überweisung',
    },
    {
      Datum: '2024-06-01 12:19:54.153333',
      Betrag: '35,99',
      Verwendungszweck: 'Hugendubel - Berlin, DEU',
      Zahlungspartner: 'Hugendubel - Berlin, DEU',
      Type: 'Clearing',
    },
    {
      Datum: '2024-06-03 03:35:19.563333',
      Betrag: '19,95',
      Verwendungszweck: 'NATURKAUFHAUS - Berlin, DEU',
      Zahlungspartner: 'NATURKAUFHAUS - Berlin, DEU',
      Type: 'Clearing',
    },
    {
      Datum: '2024-06-04 06:08:51.253333',
      Betrag: '9,06',
      Verwendungszweck: 'Lidl sagt Danke - Berlin, DEU',
      Zahlungspartner: 'Lidl sagt Danke - Berlin, DEU',
      Type: 'Clearing',
    },
    {
      Datum: '2024-06-04 11:24:13.906667',
      Betrag: '8,53',
      Verwendungszweck: 'REWE Markt GmbH-Zw - Berlin, DEU',
      Zahlungspartner: 'REWE Markt GmbH-Zw - Berlin, DEU',
      Type: 'Clearing',
    },
    {
      Datum: '2024-06-04 16:50:41.443333',
      Betrag: '29,6',
      Verwendungszweck: 'Überweisung',
      Zahlungspartner: 'Detlef Schmidt',
      Type: 'Überweisung',
    },
    {
      Datum: '2024-06-05 06:11:20.276667',
      Betrag: '1000',
      Verwendungszweck: 'COMMERZBANK ATM - BERLIN, DEU',
      Zahlungspartner: 'COMMERZBANK ATM - BERLIN, DEU',
      Type: 'Clearing',
    },
    {
      Datum: '2024-06-07 10:09:41.333333',
      Betrag: '30,01',
      Verwendungszweck: 'SPRINT STATION 600020 - Berlin, DEU',
      Zahlungspartner: 'SPRINT STATION 600020 - Berlin, DEU',
      Type: 'Clearing',
    },
    {
      Datum: '2024-06-07 10:20:15.493333',
      Betrag: '29,6',
      Verwendungszweck: 'Renault Megane Versicherung',
      Zahlungspartner: 'Detlef Schmidt',
      Type: 'Überweisung',
    },
    {
      Datum: '2024-06-08 09:33:38.993333',
      Betrag: '12,03',
      Verwendungszweck: 'REWE Markt GmbH-Zw - Berlin, DEU',
      Zahlungspartner: 'REWE Markt GmbH-Zw - Berlin, DEU',
      Type: 'Clearing',
    },
    {
      Datum: '2024-06-09 05:55:32.356667',
      Betrag: '32,6',
      Verwendungszweck: 'Nespresso - Duesseldorf, DEU',
      Zahlungspartner: 'Nespresso - Duesseldorf, DEU',
      Type: 'Clearing',
    },
    {
      Datum: '2024-06-10 13:27:27.086667',
      Betrag: '150,6',
      Verwendungszweck: 'Rate für Garten ',
      Zahlungspartner: 'Sabine Schmidt',
      Type: 'Überweisung',
    },
    {
      Datum: '2024-06-10 13:34:25.776667',
      Betrag: '46,6',
      Verwendungszweck: '837000000000',
      Zahlungspartner: 'Vattenfall Europe Sales GmbH',
      Type: 'Überweisung',
    },
    {
      Datum: '2024-06-10 13:34:53.566667',
      Betrag: '21,6',
      Verwendungszweck: '837000000000',
      Zahlungspartner: 'Vattenfall Europe Sales GmbH',
      Type: 'Überweisung',
    },
    {
      Datum: '2024-06-13 05:29:10.003333',
      Betrag: '2,25',
      Verwendungszweck: 'Rossmann 3630 - Berlin, DEU',
      Zahlungspartner: 'Rossmann 3630 - Berlin, DEU',
      Type: 'Clearing',
    },
    {
      Datum: '2024-06-13 16:34:25.287000',
      Betrag: '58,98',
      Verwendungszweck:
        'AZV-Ref.Nr 24381922-476 06/2024 K-NR. 332810006 Ihre Rechnung online bei www.vodafone.de/meinkabel',
      Zahlungspartner: 'Vodafone Deutschland GmbH',
      Type: 'Lastschrift',
    },
  ];

  const anonymized = anonymize(rows);

  assert.deepStrictEqual(anonymized, [
    rows[0],
    {
      ...rows[1],
      Verwendungszweck: 'XXX, XXX',
    },
    rows[2],
    rows[3],
    rows[4],
    rows[5],
    {
      ...rows[6],
      Zahlungspartner: 'Detlef XXX',
    },
    rows[7],
    rows[8],
    {
      ...rows[9],
      Zahlungspartner: 'Detlef XXX',
    },
    rows[10],
    rows[11],
    {
      ...rows[12],
      Zahlungspartner: 'Sabine XXX',
    },
    {
      ...rows[13],
      Verwendungszweck: 'XXX',
    },
    {
      ...rows[14],
      Verwendungszweck: 'XXX',
    },
    rows[15],
    {
      ...rows[16],
      Verwendungszweck:
        'AZV-Ref.Nr XXX-XXX XX/XXXX K-NR. XXX Ihre Rechnung online bei www.vodafone.de/meinkabel',
    },
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
