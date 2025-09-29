import Papa from 'papaparse';

export interface ParseResult {
  headers: string[];
  rows: string[][];
  delimiter: string;
  encoding: string;
}

const HEADER_KEYWORDS = [
  'Buchungstag',
  'Vorgang',
  'Wertstellung',
  'Buchungstext',
  'Umsatz in EUR'
];

const DELIMITER_CANDIDATES = [';', '	', ','];

function stripBom(content: string): string {
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

function countReplacementChars(text: string): number {
  return (text.match(/�/g) ?? []).length;
}

function decodeWithFallback(buffer: ArrayBuffer): { text: string; encoding: string } {
  const utf8Decoder = new TextDecoder('utf-8');
  let text = utf8Decoder.decode(buffer);
  let encoding: string = 'utf-8';

  const replacementCount = countReplacementChars(text);
  if (replacementCount > 0) {
    const windowsDecoder = new TextDecoder('windows-1252');
    const windowsText = windowsDecoder.decode(buffer);
    const windowsReplacementCount = countReplacementChars(windowsText);
    if (windowsReplacementCount < replacementCount) {
      text = windowsText;
      encoding = 'windows-1252';
    }
  }

  return { text: stripBom(text), encoding };
}

function detectDelimiter(lines: string[]): string {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let bestDelimiter = DELIMITER_CANDIDATES[0];
    let bestCount = -1;
    for (const candidate of DELIMITER_CANDIDATES) {
      const matchCount = trimmed.split(candidate).length - 1;
      if (matchCount > bestCount) {
        bestCount = matchCount;
        bestDelimiter = candidate;
      }
    }
    if (bestCount > 0) {
      return bestDelimiter;
    }
  }
  return ';';
}

function sanitiseRows(rows: string[][]): string[][] {
  return rows
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

function locateHeaderIndex(rows: string[][]): number {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const trimmed = row.map((cell) => cell.trim());
    if (trimmed.length === 0) {
      continue;
    }
    const hasKeyword = trimmed.some((cell) => HEADER_KEYWORDS.includes(cell));
    if (trimmed.length === 2 && !hasKeyword) {
      continue;
    }
    if (hasKeyword && trimmed.length >= 3) {
      return i;
    }
  }
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].length >= 2) {
      return i;
    }
  }
  return -1;
}

export function parseCsvContent(content: string): ParseResult {
  const normalizedContent = stripBom(content);
  const lines = normalizedContent.replace(/\r\n/g, '\n').split('\n');
  const delimiter = detectDelimiter(lines);

  const parseResult = Papa.parse<string[]>(normalizedContent, {
    delimiter,
    skipEmptyLines: 'greedy'
  });

  if (parseResult.errors.length > 0) {
    throw new Error('Die CSV-Datei konnte nicht gelesen werden.');
  }

  const rows = sanitiseRows(parseResult.data as string[][]);
  const headerIndex = locateHeaderIndex(rows);

  if (headerIndex === -1) {
    throw new Error('Keine Tabellenkopfzeile gefunden.');
  }

  const headers = rows[headerIndex].map((cell) => cell.trim());
  const dataRows = rows.slice(headerIndex + 1);

  return {
    headers,
    rows: dataRows,
    delimiter,
    encoding: 'utf-8'
  };
}

export async function parseCsvFile(file: File): Promise<ParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const { text, encoding } = decodeWithFallback(arrayBuffer);
  const result = parseCsvContent(text);
  return { ...result, encoding };
}
