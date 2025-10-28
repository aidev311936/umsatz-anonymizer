export interface BankMapping {
  bank_name: string;
  booking_date: string[];
  booking_text: string[];
  booking_type: string[];
  booking_amount: string[];
  booking_date_parse_format: string;
  without_header: boolean;
}

export interface UnifiedTx {
  bank_name: string;
  booking_date: string;
  booking_date_raw: string;
  booking_date_iso: string | null;
  booking_text: string;
  booking_type: string;
  booking_amount: string;
  booking_account: string;
  booking_hash?: string;
}

export interface TransactionImportSummary {
  bank_name: string;
  booking_account: string;
  created_on: string | null;
  first_booking_date: string;
  last_booking_date: string;
}

export interface DisplaySettings {
  booking_date_display_format: string;
  booking_amount_display_format: string;
}

export type AnonRule =
  | {
      id: string;
      fields: (keyof UnifiedTx)[];
      type: "regex";
      pattern: string;
      flags?: string;
      replacement: string;
      enabled?: boolean;
    }
  | {
      id: string;
      fields: (keyof UnifiedTx)[];
      type: "mask";
      maskStrategy: "full" | "keepFirstLast" | "partialPercent";
      maskChar?: string;
      minLen?: number;
      maskPercent?: number;
      enabled?: boolean;
    };
