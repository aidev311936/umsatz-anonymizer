import { beforeEach, describe, expect, it } from "vitest";
import { __resetBankMappingsForTests, loadBankMappings, saveBankMapping } from "./storage";
import type { BankMapping } from "./types";

describe("bank mapping storage", () => {
  beforeEach(() => {
    __resetBankMappingsForTests();
  });

  it("persists sanitized detection metadata", () => {
    const mapping: BankMapping = {
      bank_name: "Test Bank",
      booking_date: [" Datum "],
      booking_text: ["Text"],
      booking_type: ["Typ"],
      booking_amount: ["Betrag"],
      booking_date_parse_format: "",
      without_header: true,
      detection: {
        header_signature: [" Buchungstag ", ""],
        without_header: {
          column_count: 3,
          column_markers: [" date ", "", "number"],
        },
      },
    };

    const saved = saveBankMapping(mapping);
    expect(saved.detection).toEqual({
      header_signature: ["Buchungstag"],
      without_header: {
        column_count: 3,
        column_markers: ["date", "number"],
      },
    });

    const stored = loadBankMappings();
    expect(stored).toHaveLength(1);
    expect(stored[0].detection).toEqual(saved.detection);
  });

  it("drops invalid detection payloads", () => {
    const mapping: BankMapping = {
      bank_name: "Invalid Detection",
      booking_date: ["Date"],
      booking_text: ["Text"],
      booking_type: ["Type"],
      booking_amount: ["Amount"],
      booking_date_parse_format: "",
      without_header: false,
      detection: 42 as unknown as BankMapping["detection"],
    };

    const saved = saveBankMapping(mapping);
    expect(saved.detection).toBeNull();

    const stored = loadBankMappings();
    expect(stored[0].detection).toBeNull();
  });
});
