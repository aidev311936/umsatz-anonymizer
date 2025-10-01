export interface BankMapping {
  bank_name: string;
  booking_date: string[];
  booking_text: string[];
  booking_type: string[];
  booking_amount: string[];
}

export interface UnifiedTx {
  bank_name: string;
  booking_date: string;
  booking_text: string;
  booking_type: string;
  booking_amount: string;
}

interface BaseAnonRule {
  id: string;
  fields: (keyof UnifiedTx)[];
  enabled?: boolean;
}

export type AnonRule =
  | (BaseAnonRule & {
      type: "regex";
      pattern: string;
      flags?: string;
      replacement: string;
    })
  | (BaseAnonRule & {
      type: "mask";
      maskStrategy: "full" | "keepFirstLast" | "partialPercent";
      maskChar?: string;
      minLen?: number;
      maskPercent?: number;
    });
