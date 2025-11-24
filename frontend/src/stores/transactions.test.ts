import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import type { UnifiedTx, TransactionImportSummary } from "../services/storageService";
import { useTransactionsStore } from "./transactions";

const storageServiceMocks = vi.hoisted(() => ({
  appendImportedTransactions: vi.fn(),
  ensureStorageInitialized: vi.fn(),
  fetchTransactionImportHistory: vi.fn(),
  getMaskedTransactions: vi.fn(),
  getTransactionImports: vi.fn(),
  getTransactions: vi.fn(),
  persistMaskedToBackend: vi.fn(),
  storeMaskedTransactions: vi.fn(),
  storeTransactions: vi.fn(),
}));

vi.mock("../services/anonymizationService", () => ({
  anonymizeTransactions: vi.fn(),
}));

vi.mock("../services/storageService", () => storageServiceMocks);

describe("transactions store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    storageServiceMocks.storeMaskedTransactions.mockResolvedValue(undefined);
  });

  it("clears masked transactions and anonymization state after importing new data", async () => {
    const existingMasked: UnifiedTx[] = [
      {
        id: "masked-1",
        bookingDate: "2024-04-01",
        valueDate: "2024-04-01",
        amount: 100,
        currency: "EUR",
        bookingText: "Masked",
        purpose: "Masked purpose",
        counterpartName: "Masked name",
        counterpartAccount: "123",
        counterpartyBankCode: "456",
        additionalText: "",
        customerReference: "",
      },
    ];

    const importedEntries: UnifiedTx[] = [
      {
        id: "new-1",
        bookingDate: "2024-05-01",
        valueDate: "2024-05-01",
        amount: 200,
        currency: "EUR",
        bookingText: "New",
        purpose: "New purpose",
        counterpartName: "New name",
        counterpartAccount: "789",
        counterpartyBankCode: "012",
        additionalText: "",
        customerReference: "",
      },
    ];

    const importedHistory: TransactionImportSummary[] = [
      {
        id: "summary-1",
        createdAt: "2024-05-02",
        bankName: "Test Bank",
        bookingAccount: "0001",
        transactionCount: 1,
      },
    ];

    storageServiceMocks.getTransactions.mockReturnValue(importedEntries);
    storageServiceMocks.getTransactionImports.mockReturnValue(importedHistory);
    storageServiceMocks.appendImportedTransactions.mockResolvedValue({
      transactions: importedEntries,
      addedCount: importedEntries.length,
      skippedDuplicates: 0,
    });

    const store = useTransactionsStore();
    store.setMaskedTransactions(existingMasked);
    store.anonymized = [...existingMasked];
    store.anonymizationWarnings = ["warning"];

    const result = await store.appendImported(importedEntries, { bankName: "Test Bank", bookingAccount: "0001" });

    expect(storageServiceMocks.appendImportedTransactions).toHaveBeenCalledWith(importedEntries, {
      bankName: "Test Bank",
      bookingAccount: "0001",
    });
    expect(store.transactions).toEqual(importedEntries);
    expect(store.history).toEqual(importedHistory);
    expect(store.anonymized).toEqual([]);
    expect(store.anonymizationWarnings).toEqual([]);
    expect(store.maskedTransactions).toEqual([]);
    expect(storageServiceMocks.storeMaskedTransactions).toHaveBeenCalledWith([]);
    expect(result).toEqual({
      transactions: importedEntries,
      addedCount: importedEntries.length,
      skippedDuplicates: 0,
    });
  });
});

