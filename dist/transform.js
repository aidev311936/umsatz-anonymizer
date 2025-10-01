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
export function applyMapping(rows, header, mapping, bankName) {
    const indexMap = createIndexMap(header);
    const transactions = [];
    for (const row of rows) {
        const bookingDate = firstNonEmpty(mapping.booking_date.map((column) => readValue(row, column, indexMap)));
        const bookingText = joinValues(mapping.booking_text.map((column) => readValue(row, column, indexMap)));
        const bookingType = firstNonEmpty(mapping.booking_type.map((column) => readValue(row, column, indexMap)));
        const bookingAmount = firstNonEmpty(mapping.booking_amount.map((column) => readValue(row, column, indexMap)));
        const tx = {
            bank_name: bankName,
            booking_date: bookingDate,
            booking_text: bookingText,
            booking_type: bookingType,
            booking_amount: bookingAmount,
        };
        if (!isTransactionEmpty(tx)) {
            transactions.push(tx);
        }
    }
    return transactions;
}
