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

export function parseCsv(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error("Datei konnte nicht gelesen werden"));
    };
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : new TextDecoder("utf-8").decode(reader.result as ArrayBuffer);
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
    reader.readAsText(file, "utf-8");
  });
}
