import { describe, expect, it } from "vitest";
import { detectHeader } from "./headerDetect";
import type { BankMapping } from "./types";

describe("header detection", () => {
  it("detects headers using stored signatures", () => {
    const rows = [
      ["", ""],
      [
        " Buchungstag ",
        "Wertstellung (Valuta)",
        "Vorgang",
        "Buchungstext",
        "Umsatz in EUR ",
      ],
      ["01.01.2024", "01.01.2024", "Kartenzahlung", "Supermarkt", "10,50"],
    ];

    const mapping: BankMapping = {
      bank_name: "Comdirect",
      booking_date: ["Buchungstag"],
      booking_text: ["Buchungstext"],
      booking_type: ["Vorgang"],
      booking_amount: ["Umsatz in EUR"],
      booking_date_parse_format: "dd.MM.yyyy",
      without_header: false,
      detection: {
        header_signature: [
          "Buchungstag",
          "Wertstellung (Valuta)",
          "Vorgang",
          "Buchungstext",
          "Umsatz in EUR",
        ],
      },
    };

    const result = detectHeader(rows, [mapping]);

    expect(result.hasHeader).toBe(true);
    expect(result.header).toEqual([
      "Buchungstag",
      "Wertstellung (Valuta)",
      "Vorgang",
      "Buchungstext",
      "Umsatz in EUR",
    ]);
    expect(result.dataRows).toEqual([["01.01.2024", "01.01.2024", "Kartenzahlung", "Supermarkt", "10,50"]]);
    expect(result.skippedRows).toBe(1);
    expect(result.warning).toBeUndefined();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].passed).toBe(true);
    expect(result.candidates[0].matchedHeaderSignature).toBe(true);
  });

  it("detects headerless structures using column markers and sample validation", () => {
    const rows = [
      ["", ""],
      ["01.01.2024", "Kartenzahlung", "Supermarkt", "10,50"],
      ["02.01.2024", "Kartenzahlung", "Bäcker", "-2,45"],
    ];

    const mapping: BankMapping = {
      bank_name: "Headerless Bank",
      booking_date: ["$1"],
      booking_text: ["$2", "$3"],
      booking_type: ["$2"],
      booking_amount: ["$4"],
      booking_date_parse_format: "dd.MM.yyyy",
      without_header: true,
      detection: {
        without_header: {
          column_count: 4,
          column_markers: ["date", "text", "text", "number"],
        },
      },
    };

    const result = detectHeader(rows, [mapping]);

    expect(result.hasHeader).toBe(false);
    expect(result.header).toEqual(["01.01.2024", "Kartenzahlung", "Supermarkt", "10,50"]);
    expect(result.dataRows).toEqual([["02.01.2024", "Kartenzahlung", "Bäcker", "-2,45"]]);
    expect(result.skippedRows).toBe(1);
    expect(result.warning).toBeUndefined();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].passed).toBe(true);
    expect(result.candidates[0].matchedStructure).toBe(true);
  });

  it("ranks candidates by score and prefers passing matches", () => {
    const rows = [
      ["Buchungstag", "Verwendungszweck", "Betrag"],
      ["2024-01-01", "Test", "10.00"],
    ];

    const matching: BankMapping = {
      bank_name: "Matching Bank",
      booking_date: ["Buchungstag"],
      booking_text: ["Verwendungszweck"],
      booking_type: [],
      booking_amount: ["Betrag"],
      booking_date_parse_format: "yyyy-MM-dd",
      without_header: false,
      detection: {
        header_signature: ["Buchungstag", "Verwendungszweck", "Betrag"],
      },
    };

    const nearMiss: BankMapping = {
      bank_name: "Near Miss Bank",
      booking_date: ["$1"],
      booking_text: ["$2"],
      booking_type: [],
      booking_amount: ["$3"],
      booking_date_parse_format: "dd.MM.yyyy",
      without_header: true,
      detection: {
        without_header: {
          column_count: 3,
          column_markers: ["date", "text", "number"],
        },
      },
    };

    const result = detectHeader(rows, [nearMiss, matching]);

    expect(result.warning).toBeUndefined();
    expect(result.candidates[0].mapping.bank_name).toBe("Matching Bank");
    expect(result.candidates[0].passed).toBe(true);
    expect(result.candidates[1].passed).toBe(false);
    expect(result.candidates[0].score).toBeGreaterThan(result.candidates[1].score);
  });
});
