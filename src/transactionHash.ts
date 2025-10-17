import { UnifiedTx } from "./types";

const encoder = new TextEncoder();

type HashRelevantFields = Pick<UnifiedTx,
  | "booking_date_raw"
  | "booking_text"
  | "booking_type"
  | "booking_amount"
  | "booking_account"
>;

function normalizeTransaction(tx: UnifiedTx): Required<HashRelevantFields> {
  return {
    booking_date_raw: tx.booking_date_raw ?? tx.booking_date,
    booking_text: tx.booking_text ?? "",
    booking_type: tx.booking_type ?? "",
    booking_amount: tx.booking_amount ?? "",
    booking_account: tx.booking_account ?? "",
  };
}

function serializeTransaction(tx: UnifiedTx): string {
  const normalized = normalizeTransaction(tx);
  return JSON.stringify(normalized);
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

async function digestSha256(data: Uint8Array): Promise<ArrayBuffer> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API is not available for hashing transactions.");
  }
  return subtle.digest("SHA-256", data as BufferSource);
}

export function serializeUnifiedTxForHash(tx: UnifiedTx): string {
  return serializeTransaction(tx);
}

export async function computeUnifiedTxHash(tx: UnifiedTx): Promise<string> {
  const serialized = serializeTransaction(tx);
  const data = encoder.encode(serialized);
  const digest = await digestSha256(data);
  return arrayBufferToHex(digest);
}
