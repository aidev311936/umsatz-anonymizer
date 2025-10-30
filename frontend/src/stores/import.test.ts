import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useImportStore } from "./import";
import type { DetectedBankCandidate } from "../headerDetect";
import type { BankMapping } from "../types";

function createCandidate(bankName: string, passed = true): DetectedBankCandidate {
  const mapping: BankMapping = {
    bank_name: bankName,
    booking_date: ["Buchungstag"],
    booking_text: ["Verwendungszweck"],
    booking_type: ["Art"],
    booking_amount: ["Betrag"],
    booking_date_parse_format: "dd.MM.yyyy",
    without_header: false,
  };

  return {
    mapping,
    score: passed ? 100 : 80,
    passed,
    matchedHeaderSignature: passed,
    matchedStructure: passed,
    issues: [],
  };
}

describe("import store bank detection", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("auto-selects the only detected bank", () => {
    const store = useImportStore();
    store.setDetectedBankCandidates([createCandidate("Auto Bank")]);

    expect(store.selectedDetectedBank?.mapping.bank_name).toBe("Auto Bank");
    expect(store.bankName).toBe("Auto Bank");
    expect(store.requiresManualBankSelection).toBe(false);
  });

  it("prefers passing candidates and allows switching between them", () => {
    const store = useImportStore();
    const candidates = [createCandidate("Primary Bank"), createCandidate("Fallback Bank", false)];

    store.setDetectedBankCandidates(candidates);

    expect(store.selectedDetectedBank?.mapping.bank_name).toBe("Primary Bank");
    expect(store.requiresManualBankSelection).toBe(true);

    store.selectDetectedBank(1);

    expect(store.selectedDetectedBank?.mapping.bank_name).toBe("Fallback Bank");
    expect(store.bankName).toBe("Fallback Bank");
  });

  it("enters manual mode when no candidates are available", () => {
    const store = useImportStore();

    store.setBankName("Manual Entry");
    store.setDetectedBankCandidates([]);

    expect(store.selectedDetectedBank).toBeNull();
    expect(store.requiresManualBankSelection).toBe(true);
    expect(store.bankName).toBe("Manual Entry");
  });
});

describe("useImportStore hasHeader state", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("allows updating the hasHeader state flag", () => {
    const store = useImportStore();

    expect(store.hasHeader).toBe(false);

    store.hasHeader = true;

    expect(store.hasHeader).toBe(true);

    store.reset();

    expect(store.hasHeader).toBe(false);
  });
});

