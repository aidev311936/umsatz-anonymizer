import { parseDateWithFormat } from "./dateFormat";
import type { BankMapping } from "./types";

export interface DetectedBankCandidate {
  mapping: BankMapping;
  score: number;
  passed: boolean;
  matchedHeaderSignature: boolean;
  matchedStructure: boolean;
  headerRowIndex?: number;
  dataStartIndex?: number;
  issues: string[];
}

export interface HeaderDetectionResult {
  header: string[];
  dataRows: string[][];
  candidates: DetectedBankCandidate[];
  hasHeader: boolean;
  skippedRows: number;
  warning?: string;
}

/**
 * Scoring weights for the bank detection algorithm.
 * 
 * The algorithm evaluates CSV files against bank mappings to determine which bank
 * format matches best. Each scoring component contributes to the total score:
 * 
 * - HEADER_MATCH_SCORE (100): Awarded when the header signature matches exactly
 * - COLUMN_COUNT_SCORE (60): Awarded when the column count matches expected value
 * - COLUMN_MARKER_SCORE (20): Awarded when column markers (date/number/text) match
 * - DATE_COMPATIBILITY_SCORE (15): Awarded when date columns parse correctly
 * - AMOUNT_COMPATIBILITY_SCORE (15): Awarded when amount columns are valid numbers
 * 
 * Total possible score: 100 + 60 + 20 + 15 + 15 = 210 points
 * A score ≥ 100 typically indicates a strong match. Candidates are marked as "passed"
 * when they match either the header signature OR the structural requirements.
 */
const HEADER_MATCH_SCORE = 100;
const COLUMN_COUNT_SCORE = 60;
const COLUMN_MARKER_SCORE = 20;
const DATE_COMPATIBILITY_SCORE = 15;
const AMOUNT_COMPATIBILITY_SCORE = 15;
const SAMPLE_ROW_LIMIT = 10;

function sanitizeCell(cell: string): string {
  return cell.replace(/\uFEFF/g, "").trim();
}

function sanitizeRow(row: string[]): string[] {
  return row.map((cell) => sanitizeCell(cell ?? ""));
}

function isRowEmpty(row: string[]): boolean {
  return row.every((cell) => cell.trim().length === 0);
}

function normalizeHeaderValue(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function isProbablyNumber(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  const normalized = trimmed
    .replace(/[\s\u00a0]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(/,/g, ".");
  if (normalized === "" || normalized === "." || normalized === "+" || normalized === "-") {
    return false;
  }
  if (!/^[-+]?\d*(?:\.\d+)?$/.test(normalized)) {
    return false;
  }
  return !Number.isNaN(Number.parseFloat(normalized));
}

function isProbablyDate(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (!/[0-9]/.test(trimmed)) {
    return false;
  }
  if (/^\d{1,4}$/.test(trimmed)) {
    return false;
  }

  const candidates: string[] = [];
  const dotted = /^([0-9]{1,2})[.\/-]([0-9]{1,2})[.\/-]([0-9]{2,4})$/;
  const iso = /^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})/;

  const dottedMatch = dotted.exec(trimmed);
  if (dottedMatch) {
    const year = dottedMatch[3].padStart(4, "0");
    const month = dottedMatch[2].padStart(2, "0");
    const day = dottedMatch[1].padStart(2, "0");
    candidates.push(`${year}-${month}-${day}`);
  }

  if (iso.test(trimmed)) {
    candidates.push(trimmed);
  }

  candidates.push(trimmed.replace(/\//g, "-").replace(/\./g, "-"));

  return candidates.some((candidate) => !Number.isNaN(Date.parse(candidate)));
}

function computeColumnMarkers(rows: string[][], columnCount: number): string[] {
  const markers: string[] = [];
  for (let index = 0; index < columnCount; index += 1) {
    const values = rows
      .map((row) => (row[index] ?? "").toString().trim())
      .filter((value) => value.length > 0);
    if (values.length === 0) {
      markers.push("empty");
      continue;
    }
    if (values.every(isProbablyDate)) {
      markers.push("date");
      continue;
    }
    if (values.every(isProbablyNumber)) {
      markers.push("number");
      continue;
    }
    markers.push("text");
  }
  return markers;
}

function findHeaderSignatureIndex(rows: string[][], signature: string[]): number | null {
  const normalizedSignature = signature
    .map((entry) => normalizeHeaderValue(entry ?? ""))
    .filter((entry) => entry.length > 0);

  if (normalizedSignature.length === 0) {
    return null;
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.length < normalizedSignature.length) {
      continue;
    }
    const normalizedRow = row.map((entry) => normalizeHeaderValue(entry ?? ""));
    let matches = 0;
    for (let column = 0; column < normalizedSignature.length; column += 1) {
      if (normalizedRow[column] === normalizedSignature[column]) {
        matches += 1;
        continue;
      }
      break;
    }
    if (matches === normalizedSignature.length) {
      return index;
    }
  }

  return null;
}

function parsePlaceholder(column: string): number | null {
  const match = /^\$(\d+)$/.exec(column.trim());
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  if (Number.isNaN(value) || value <= 0) {
    return null;
  }
  return value - 1;
}

function findFirstPlaceholderIndex(columns: string[]): number | null {
  for (const column of columns) {
    const index = parsePlaceholder(column);
    if (index !== null) {
      return index;
    }
  }
  return null;
}

function evaluateHeaderlessCandidate(
  mapping: BankMapping,
  rows: string[][],
): { matched: boolean; score: number; issues: string[]; dataStartIndex?: number } {
  const detection = mapping.detection?.without_header;
  const expectedColumnCount = detection?.column_count ?? null;
  const expectedMarkers = detection?.column_markers?.map((entry) => entry.toLowerCase()) ?? [];

  let dataStartIndex: number | undefined;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (isRowEmpty(row)) {
      continue;
    }
    if (expectedColumnCount === null || row.length === expectedColumnCount) {
      dataStartIndex = index;
      break;
    }
  }

  if (dataStartIndex === undefined) {
    const fallbackIndex = rows.findIndex((row) => !isRowEmpty(row));
    if (fallbackIndex === -1) {
      return { matched: false, score: 0, issues: ["no_data_rows"] };
    }
    dataStartIndex = fallbackIndex;
  }

  const sampleRows = rows
    .slice(dataStartIndex)
    .filter((row) => !isRowEmpty(row))
    .slice(0, SAMPLE_ROW_LIMIT);

  if (sampleRows.length === 0) {
    return { matched: false, score: 0, issues: ["no_data_rows"] };
  }

  let score = 0;
  const issues: string[] = [];
  let matched = true;

  const actualColumnCount = sampleRows.reduce((max, row) => Math.max(max, row.length), 0);

  if (expectedColumnCount !== null) {
    if (actualColumnCount === expectedColumnCount) {
      score += COLUMN_COUNT_SCORE;
    } else {
      matched = false;
      issues.push("column_count_mismatch");
    }
  }

  if (expectedMarkers.length > 0) {
    const columnCount = Math.max(actualColumnCount, expectedMarkers.length);
    const actualMarkers = computeColumnMarkers(sampleRows, columnCount);
    const normalizedActual = actualMarkers.map((entry) => entry.toLowerCase());
    const markerMatches = expectedMarkers.filter(
      (marker, index) => normalizedActual[index] === marker,
    );
    if (markerMatches.length === expectedMarkers.length) {
      score += COLUMN_MARKER_SCORE;
    } else {
      matched = false;
      issues.push("column_markers_mismatch");
    }
  }

  const dateColumnIndex = findFirstPlaceholderIndex(mapping.booking_date);
  if (dateColumnIndex !== null) {
    const parseFormat = mapping.booking_date_parse_format?.trim() ?? "";
    const values = sampleRows
      .map((row) => (row[dateColumnIndex] ?? "").toString().trim())
      .filter((value) => value.length > 0);
    if (values.length > 0) {
      const compatible = values.every((value) =>
        parseFormat ? parseDateWithFormat(value, parseFormat) !== null : isProbablyDate(value),
      );
      if (compatible) {
        score += DATE_COMPATIBILITY_SCORE;
      } else {
        matched = false;
        issues.push("date_incompatible");
      }
    }
  }

  const amountColumnIndex = findFirstPlaceholderIndex(mapping.booking_amount);
  if (amountColumnIndex !== null) {
    const values = sampleRows
      .map((row) => (row[amountColumnIndex] ?? "").toString().trim())
      .filter((value) => value.length > 0);
    if (values.length > 0) {
      const compatible = values.every((value) => isProbablyNumber(value));
      if (compatible) {
        score += AMOUNT_COMPATIBILITY_SCORE;
      } else {
        matched = false;
        issues.push("amount_incompatible");
      }
    }
  }

  return { matched, score, issues, dataStartIndex };
}

function evaluateCandidate(mapping: BankMapping, rows: string[][]): DetectedBankCandidate {
  const issues: string[] = [];
  let score = 0;
  let matchedHeaderSignature = false;
  let matchedStructure = false;
  let headerRowIndex: number | undefined;
  let dataStartIndex: number | undefined;

  const headerSignature = mapping.detection?.header_signature ?? [];
  if (headerSignature.length > 0) {
    const index = findHeaderSignatureIndex(rows, headerSignature);
    if (index !== null) {
      matchedHeaderSignature = true;
      headerRowIndex = index;
      dataStartIndex = index + 1;
      score += HEADER_MATCH_SCORE + headerSignature.length;
    } else {
      issues.push("header_signature_mismatch");
    }
  }

  if (mapping.without_header) {
    const structure = evaluateHeaderlessCandidate(mapping, rows);
    matchedStructure = structure.matched;
    if (structure.dataStartIndex !== undefined) {
      dataStartIndex = structure.dataStartIndex;
      if (matchedStructure && !matchedHeaderSignature) {
        headerRowIndex = structure.dataStartIndex;
      }
    }
    score += structure.score;
    issues.push(...structure.issues);
  }

  const passed = matchedHeaderSignature || matchedStructure;

  return {
    mapping,
    score,
    passed,
    matchedHeaderSignature,
    matchedStructure,
    headerRowIndex,
    dataStartIndex,
    issues,
  };
}

export function detectHeader(rows: string[][], mappings: BankMapping[]): HeaderDetectionResult {
  const sanitized = rows.map(sanitizeRow);
  const firstNonEmptyIndex = sanitized.findIndex((row) => !isRowEmpty(row));

  if (firstNonEmptyIndex === -1) {
    return {
      header: [],
      dataRows: [],
      candidates: [],
      hasHeader: false,
      skippedRows: sanitized.length,
      warning: "Keine Headerzeile erkannt. Bitte CSV prüfen.",
    };
  }

  const candidates = mappings.map((mapping) => evaluateCandidate(mapping, sanitized));
  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.mapping.bank_name.localeCompare(b.mapping.bank_name);
  });

  const preferredCandidate = candidates.find((candidate) => candidate.passed) ?? candidates[0] ?? null;

  let headerIndex = firstNonEmptyIndex;
  let hasHeader = true;

  if (preferredCandidate) {
    if (preferredCandidate.matchedHeaderSignature && preferredCandidate.headerRowIndex !== undefined) {
      headerIndex = preferredCandidate.headerRowIndex;
      hasHeader = true;
    } else if (preferredCandidate.mapping.without_header && preferredCandidate.matchedStructure) {
      if (preferredCandidate.dataStartIndex !== undefined) {
        headerIndex = preferredCandidate.dataStartIndex;
      }
      hasHeader = false;
    } else {
      if (preferredCandidate.passed) {
        headerIndex = preferredCandidate.headerRowIndex ?? firstNonEmptyIndex;
        hasHeader =
          preferredCandidate.matchedHeaderSignature || !preferredCandidate.mapping.without_header;
      } else if (preferredCandidate.mapping.without_header) {
        if (preferredCandidate.dataStartIndex !== undefined) {
          headerIndex = preferredCandidate.dataStartIndex;
        } else if (preferredCandidate.headerRowIndex !== undefined) {
          headerIndex = preferredCandidate.headerRowIndex;
        } else {
          headerIndex = firstNonEmptyIndex;
        }
        hasHeader = false;
      } else {
        headerIndex = preferredCandidate.headerRowIndex ?? firstNonEmptyIndex;
        hasHeader = true;
      }
    }
  }

  if (headerIndex < 0) {
    headerIndex = firstNonEmptyIndex;
  }

  const headerRow = sanitized[headerIndex] ?? [];
  const dataRows = sanitized.slice(headerIndex + 1).filter((row) => !isRowEmpty(row));
  const skippedRows = headerIndex;

  let warning: string | undefined;
  if (!preferredCandidate || !preferredCandidate.passed) {
    warning = hasHeader
      ? "Unbekannte Kopfzeile erkannt. Bitte Zuordnung prüfen."
      : "Keine Kopfzeile erkannt. Bitte Mapping prüfen.";
  }

  return {
    header: headerRow,
    dataRows,
    candidates,
    hasHeader,
    skippedRows,
    warning,
  };
}
