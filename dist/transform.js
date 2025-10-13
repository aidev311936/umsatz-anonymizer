import { formatDateWithFormat, parseDateWithFormat } from "./dateFormat.js";
import { DEFAULT_DATE_DISPLAY_FORMAT } from "./displaySettings.js";
function createIndexMap(header) {
    const map = {};
    header.forEach((name, index) => {
        if (!(name in map)) {
            map[name] = index;
        }
    });
    return map;
}
function readValue(row, columnName, indexMap) {
    const index = indexMap[columnName];
    if (index === undefined) {
        return "";
    }
    return (row[index] ?? "").toString().trim();
}
function firstNonEmpty(values) {
    for (const value of values) {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }
    return "";
}
function joinValues(values) {
    return values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .join(" ");
}
function isTransactionEmpty(tx) {
    return (tx.booking_date.trim() === "" &&
        tx.booking_text.trim() === "" &&
        tx.booking_type.trim() === "" &&
        tx.booking_amount.trim() === "");
}
export function applyMapping(rows, header, mapping, bankName, bookingAccount, displaySettings) {
    const indexMap = createIndexMap(header);
    const transactions = [];
    for (const row of rows) {
        const bookingDateRaw = firstNonEmpty(mapping.booking_date.map((column) => readValue(row, column, indexMap)));
        const bookingText = joinValues(mapping.booking_text.map((column) => readValue(row, column, indexMap)));
        const bookingType = firstNonEmpty(mapping.booking_type.map((column) => readValue(row, column, indexMap)));
        const bookingAmount = firstNonEmpty(mapping.booking_amount.map((column) => readValue(row, column, indexMap)));
        const parseFormat = mapping.booking_date_parse_format?.trim() ?? "";
        const displayFormatRaw = displaySettings.booking_date_display_format?.trim() ?? "";
        const displayFormat = displayFormatRaw.length > 0 ? displayFormatRaw : DEFAULT_DATE_DISPLAY_FORMAT;
        let bookingDateFormatted = bookingDateRaw;
        let bookingDateIso = null;
        if (parseFormat && bookingDateRaw.length > 0) {
            const parsed = parseDateWithFormat(bookingDateRaw, parseFormat);
            if (parsed) {
                bookingDateIso = parsed.toISOString();
                const targetFormat = displayFormat.length > 0 ? displayFormat : parseFormat;
                bookingDateFormatted = targetFormat
                    ? formatDateWithFormat(parsed, targetFormat)
                    : bookingDateRaw;
            }
        }
        const tx = {
            bank_name: bankName,
            booking_date: bookingDateFormatted,
            booking_date_raw: bookingDateRaw,
            booking_date_iso: bookingDateIso,
            booking_text: bookingText,
            booking_type: bookingType,
            booking_amount: bookingAmount,
            booking_account: bookingAccount,
        };
        if (!isTransactionEmpty(tx)) {
            transactions.push(tx);
        }
    }
    return transactions;
}
