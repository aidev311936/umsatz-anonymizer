import Papa from "papaparse";

function normalizeValue(value: unknown): string {
  if (typeof value === "string") {
    return value.replace(/\uFEFF/g, "").trim();
  }
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function decodeContent(buffer: ArrayBuffer): string {
  const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    const text = utf8Decoder.decode(buffer);
    const suspiciousCount = (text.match(/[ÃÂ]/g) ?? []).length;
    if (suspiciousCount > 0 && suspiciousCount / Math.max(text.length, 1) > 0.01) {
      return decodeWithLegacyEncoding(buffer);
    }
    return text;
  } catch (error) {
    return decodeWithLegacyEncoding(buffer);
  }
}

function decodeWithLegacyEncoding(buffer: ArrayBuffer): string {
  const encodings = ["windows-1252", "iso-8859-1", "latin1"];
  for (const encoding of encodings) {
    try {
      return new TextDecoder(encoding).decode(buffer);
    } catch (error) {
      if (!(error instanceof RangeError)) {
        throw error;
      }
    }
  }
  throw new Error("Unsupported encoding for CSV file");
}

export function parseCsv(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error("Datei konnte nicht gelesen werden"));
    };
    reader.onload = () => {
      const result = reader.result;
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error("Ungültiges Dateiformat"));
        return;
      }
      const content = decodeContent(result);
      try {
        Papa.parse(content, {
          delimiter: "",
          skipEmptyLines: false,
          transform: (value) => (typeof value === "string" ? value.trim() : value),
          complete: (results) => {
            const rows = results.data
              .filter((row): row is unknown[] => Array.isArray(row))
              .map((row) => row.map((value) => normalizeValue(value)));
            resolve(rows as string[][]);
          },
          error: (error) => {
            reject(error as Error);
          },
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Fehler beim CSV-Parsing"));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
