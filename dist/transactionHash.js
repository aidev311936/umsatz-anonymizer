const encoder = new TextEncoder();
function normalizeTransaction(tx) {
    return {
        bank_name: tx.bank_name,
        booking_date: tx.booking_date,
        booking_date_raw: tx.booking_date_raw ?? tx.booking_date,
        booking_date_iso: tx.booking_date_iso ?? null,
        booking_text: tx.booking_text,
        booking_type: tx.booking_type,
        booking_amount: tx.booking_amount,
    };
}
function serializeTransaction(tx) {
    const normalized = normalizeTransaction(tx);
    return JSON.stringify(normalized);
}
function arrayBufferToHex(buffer) {
    const bytes = new Uint8Array(buffer);
    let hex = "";
    for (const byte of bytes) {
        hex += byte.toString(16).padStart(2, "0");
    }
    return hex;
}
async function digestSha256(data) {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        throw new Error("Web Crypto API is not available for hashing transactions.");
    }
    return subtle.digest("SHA-256", data);
}
export function serializeUnifiedTxForHash(tx) {
    return serializeTransaction(tx);
}
export async function computeUnifiedTxHash(tx) {
    const serialized = serializeTransaction(tx);
    const data = encoder.encode(serialized);
    const digest = await digestSha256(data);
    return arrayBufferToHex(digest);
}
