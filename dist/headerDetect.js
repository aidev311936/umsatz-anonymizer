const COMDIRECT_HEADER = [
    "Buchungstag",
    "Wertstellung (Valuta)",
    "Vorgang",
    "Buchungstext",
    "Umsatz in EUR",
];
const PAYCENTER_HEADER = [
    "Datum",
    "Betrag",
    "Verwendungszweck",
    "Zahlungspartner",
    "Type",
];
function sanitizeRow(row) {
    return row.map((cell) => cell.replace(/\uFEFF/g, "").trim());
}
function isRowEmpty(row) {
    return row.every((cell) => cell.trim() === "");
}
function matchesHeader(row, expected) {
    if (row.length < expected.length) {
        return false;
    }
    return expected.every((col, index) => row[index]?.toLowerCase() === col.toLowerCase());
}
export function detectHeader(rows) {
    const sanitized = rows.map(sanitizeRow);
    const comdirectIndex = sanitized.findIndex((row) => matchesHeader(row, COMDIRECT_HEADER));
    if (comdirectIndex >= 0) {
        const dataRows = sanitized.slice(comdirectIndex + 1).filter((row) => !isRowEmpty(row));
        return {
            header: sanitized[comdirectIndex].slice(0, COMDIRECT_HEADER.length),
            dataRows,
            detectedBank: "comdirect",
            skippedRows: comdirectIndex,
        };
    }
    const payCenterIndex = sanitized.findIndex((row) => matchesHeader(row, PAYCENTER_HEADER));
    if (payCenterIndex >= 0) {
        const dataRows = sanitized.slice(payCenterIndex + 1).filter((row) => !isRowEmpty(row));
        return {
            header: sanitized[payCenterIndex].slice(0, PAYCENTER_HEADER.length),
            dataRows,
            detectedBank: "PayCenter",
            skippedRows: payCenterIndex,
        };
    }
    const headerIndex = sanitized.findIndex((row) => !isRowEmpty(row));
    if (headerIndex === -1) {
        return {
            header: [],
            dataRows: [],
            skippedRows: sanitized.length,
            warning: "Keine Headerzeile erkannt. Bitte CSV prüfen.",
        };
    }
    const header = sanitized[headerIndex];
    const dataRows = sanitized.slice(headerIndex + 1).filter((row) => !isRowEmpty(row));
    return {
        header,
        dataRows,
        skippedRows: headerIndex,
        warning: "Unbekannte Kopfzeile erkannt. Bitte Zuordnung prüfen.",
    };
}
