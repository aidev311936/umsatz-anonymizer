import React, { useMemo, useState } from 'react';
import Upload from '../components/Upload';
import PreviewTable from '../components/PreviewTable';
import MappingPanel from '../components/MappingPanel';
import { ParseResult } from '../lib/csv/parse';
import { buildNormalizedCsv, MappingConfig, normaliseRows, NormalizationResult } from '../lib/normalize';

const REQUIRED_COLUMNS = ['booking_date', 'booking_text', 'booking_type', 'booking_amount'];

function inferMapping(headers: string[]): MappingConfig {
  const normalizedHeaders = headers.map((header) => header.trim());
  const lowerCaseHeaders = normalizedHeaders.map((header) => header.toLowerCase());

  const findHeader = (...needles: string[]): string | undefined => {
    for (let i = 0; i < lowerCaseHeaders.length; i += 1) {
      const header = lowerCaseHeaders[i];
      if (needles.some((needle) => header.includes(needle))) {
        return normalizedHeaders[i];
      }
    }
    return undefined;
  };

  const mapping: MappingConfig = {
    bookingDate: findHeader('buchungstag', 'datum', 'date'),
    bookingText: [],
    bookingType: findHeader('vorgang', 'buchungsart', 'type'),
    bookingAmount: findHeader('umsatz', 'betrag', 'amount')
  };

  const textCandidates: string[] = [];
  const pushIfFound = (...needles: string[]) => {
    const found = findHeader(...needles);
    if (found && !textCandidates.includes(found)) {
      textCandidates.push(found);
    }
  };

  pushIfFound('buchungstext', 'verwendungszweck', 'text');
  pushIfFound('zahlungspartner', 'empfänger', 'auftraggeber');

  if (textCandidates.length === 0 && mapping.bookingType) {
    textCandidates.push(mapping.bookingType);
  }

  mapping.bookingText = textCandidates;
  return mapping;
}

function createInvalidCellMap(result: NormalizationResult | null): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  if (!result) {
    return map;
  }
  result.rows.forEach((row, index) => {
    const invalidIndices: number[] = [];
    if (!row.dateValid) {
      invalidIndices.push(0);
    }
    if (!row.amountValid) {
      invalidIndices.push(3);
    }
    if (invalidIndices.length > 0) {
      map.set(index, new Set(invalidIndices));
    }
  });
  return map;
}

const App: React.FC = () => {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string>('');
  const [mapping, setMapping] = useState<MappingConfig>({ bookingText: [] });
  const [normalisation, setNormalisation] = useState<NormalizationResult | null>(null);

  const handleParsed = (result: ParseResult) => {
    setParseResult(result);
    setNormalisation(null);
    setError('');
    setMapping(inferMapping(result.headers));
  };

  const handleError = (message: string) => {
    setError(message);
  };

  const isMappingComplete = useMemo(() => {
    return Boolean(
      mapping.bookingDate &&
        mapping.bookingType &&
        mapping.bookingAmount &&
        mapping.bookingText &&
        mapping.bookingText.length > 0
    );
  }, [mapping.bookingAmount, mapping.bookingDate, mapping.bookingText, mapping.bookingType]);

  const previewRows = useMemo(() => {
    if (!parseResult) {
      return [];
    }
    return parseResult.rows.map((row) =>
      parseResult.headers.map((_, index) => (row[index] ?? '').trim())
    );
  }, [parseResult]);

  const handleApply = () => {
    if (!parseResult) {
      return;
    }
    try {
      const result = normaliseRows(parseResult.rows, parseResult.headers, mapping);
      setNormalisation(result);
      setError('');
    } catch (err) {
      setNormalisation(null);
      setError(err instanceof Error ? err.message : 'Die Zuordnung ist fehlgeschlagen.');
    }
  };

  const invalidCells = useMemo(() => createInvalidCellMap(normalisation), [normalisation]);

  const normalizedTableRows = useMemo(() => {
    if (!normalisation) {
      return [];
    }
    return normalisation.rows.map((row) => [
      row.booking_date,
      row.booking_text,
      row.booking_type,
      row.booking_amount
    ]);
  }, [normalisation]);

  const handleExport = () => {
    if (!normalisation) {
      return;
    }
    const csv = buildNormalizedCsv(normalisation.rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'normalized_transactions.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>CSV-Umsätze normalisieren</h1>
        {normalisation && (
          <span className="badge">
            {`${normalisation.invalidDateCount} ungültige Datumswerte | ${normalisation.invalidAmountCount} ungültige Beträge`}
          </span>
        )}
      </header>
      <Upload onParsed={handleParsed} onError={handleError} />
      {parseResult && (
        <p>
          {`Erkanntes Trennzeichen: "${parseResult.delimiter === '\t' ? 'Tab' : parseResult.delimiter}" · Kodierung: ${parseResult.encoding}`}
        </p>
      )}
      {error && <div className="error-message">{error}</div>}
      {parseResult && (
        <>
          <div className="layout" style={{ marginTop: '2rem' }}>
            <PreviewTable title="CSV-Vorschau" columns={parseResult.headers} rows={previewRows} />
            <MappingPanel columns={parseResult.headers} mapping={mapping} onChange={setMapping} />
          </div>
          <div className="actions-bar">
            <button type="button" onClick={handleApply} disabled={!isMappingComplete}>
              Zuordnung anwenden
            </button>
            <button type="button" onClick={handleExport} disabled={!normalisation}>
              Normalisierte CSV exportieren
            </button>
          </div>
        </>
      )}
      {normalisation && (
        <PreviewTable
          title="Normalisierte Transaktionen"
          columns={REQUIRED_COLUMNS}
          rows={normalizedTableRows}
          invalidCells={invalidCells}
          tableClassName="normalized-table"
        />
      )}
    </div>
  );
};

export default App;
