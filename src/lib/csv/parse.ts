const HEADER_KEYWORDS = [
  'Buchungstag',
  'Vorgang',
  'Wertstellung',
  'Buchungstext',
  'Umsatz in EUR'
];

const DELIMITER_CANDIDATES = [';', ',', '	'];

export interface ParseResult {
  headers: string[];
  rows: string[][];
  delimiter: string;
  encoding: string;
}

function stripBom(content: string): string {
  if (!content) {
    return '';
  }
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

function sanitiseRows(rows: string[][]): string[][] {
  return rows
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

function countColumns(line: string, delimiter: string): number {
  let count = 1;
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (!insideQuotes && char === delimiter) {
      count += 1;
    }
  }

  return count;
}

function detectDelimiter(lines: string[]): string {
  let bestDelimiter = ';';
  let bestScore = 0;

  for (const candidate of DELIMITER_CANDIDATES) {
    let highestCount = 0;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      const columnCount = countColumns(rawLine, candidate);
      highestCount = Math.max(highestCount, columnCount);
    }
    if (highestCount > bestScore) {
      bestScore = highestCount;
      bestDelimiter = candidate;
    }
  }

  return bestDelimiter;
}

function parseCsvWithDelimiter(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let insideQuotes = false;

  const pushValue = () => {
    currentRow.push(currentValue);
    currentValue = '';
  };

  const pushRow = () => {
    if (insideQuotes) {
      currentValue += '\n';
      return;
    }
    pushValue();
    rows.push(currentRow);
    currentRow = [];
  };

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (char === '"') {
      if (insideQuotes && content[i + 1] === '"') {
        currentValue += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (!insideQuotes) {
      if (char === delimiter) {
        pushValue();
        continue;
      }
      if (char === '\n') {
        pushRow();
        continue;
      }
    }

    currentValue += char;
  }

  pushValue();
  rows.push(currentRow);

  return rows;
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

export function parseCsvContent(content: string, options?: { encoding?: string }): ParseResult {
  const normalizedContent = stripBom(content).replace(/\r\n/g, '\n');
  const lines = normalizedContent.split('\n');
  const delimiter = detectDelimiter(lines);
  const rawRows = parseCsvWithDelimiter(normalizedContent, delimiter);
  const rows = sanitiseRows(rawRows);
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
    encoding: options?.encoding ?? 'utf-8'
  };
}

export async function parseCsvFile(file: File): Promise<ParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const { text, encoding } = decodeWithFallback(arrayBuffer);
  return parseCsvContent(text, { encoding });
}

export function parseCsvBuffer(buffer: ArrayBuffer): ParseResult {
  const { text, encoding } = decodeWithFallback(buffer);
  return parseCsvContent(text, { encoding });
}
