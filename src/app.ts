import { parseCsv } from "./csv.js";
import { detectHeader, HeaderDetectionResult } from "./headerDetect.js";
import { buildMappingUI, MappingUIController } from "./mappingUI.js";
import { applyMapping } from "./transform.js";
import { renderTable } from "./render.js";
import {
  appendTransactions,
  loadAnonymizationRules,
  loadBankMappings,
  loadMaskedTransactions,
  loadTransactions,
  saveBankMapping,
  saveAnonymizationRules,
  saveTransactions,
  saveMaskedTransactions,
} from "./storage.js";
import { applyAnonymization } from "./anonymize.js";
import { buildRulesUI, RulesUIController } from "./rulesUI.js";
import { AnonRule, BankMapping, UnifiedTx } from "./types.js";
import { formatDateWithFormat, parseDateWithFormat } from "./dateFormat.js";

type MappingSelection = Omit<BankMapping, "bank_name">;

const fileInput = document.getElementById("csvInput") as HTMLInputElement | null;
const bankNameInput = document.getElementById("bankName") as HTMLInputElement | null;
const mappingContainer = document.getElementById("mappingContainer");
const saveMappingButton = document.getElementById("saveMappingButton") as HTMLButtonElement | null;
const importButton = document.getElementById("importButton") as HTMLButtonElement | null;
const statusArea = document.getElementById("statusArea");
const tableBody = document.getElementById("transactionsBody") as HTMLTableSectionElement | null;
const anonymizeButton = document.getElementById("anonymizeButton") as HTMLButtonElement | null;
const saveMaskedButton = document.getElementById("saveMaskedButton") as HTMLButtonElement | null;
const rulesContainer = document.getElementById("rulesContainer");
const saveRulesButton = document.getElementById("saveRulesButton") as HTMLButtonElement | null;

let mappingController: MappingUIController | null = null;
let rulesController: RulesUIController | null = null;
let detectedHeader: HeaderDetectionResult | null = null;
let transactions: UnifiedTx[] = [];
let anonymizedActive = false;
let anonymizedCache: UnifiedTx[] = [];
let lastAnonymizationWarnings: string[] = [];

function getConfiguredRules(): AnonRule[] {
  if (rulesController) {
    return rulesController.getRules();
  }
  const { rules } = loadAnonymizationRules();
  return rules;
}

function assertElement<T extends HTMLElement>(value: T | null, message: string): T {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

const ensuredFileInput = assertElement(fileInput, "CSV Eingabefeld nicht gefunden");
const ensuredBankNameInput = assertElement(bankNameInput, "Banknamenfeld nicht gefunden");
const ensuredMappingContainer = assertElement(mappingContainer, "Mapping-Container nicht gefunden");
const ensuredSaveMappingButton = assertElement(saveMappingButton, "Mapping speichern Button fehlt");
const ensuredImportButton = assertElement(importButton, "Import Button fehlt");
const ensuredStatusArea = assertElement(statusArea, "Statusbereich fehlt");
const ensuredTableBody = assertElement(tableBody, "Tabellenkörper fehlt");
const ensuredAnonymizeButton = assertElement(anonymizeButton, "Anonymisieren Button fehlt");
const ensuredSaveMaskedButton = assertElement(saveMaskedButton, "Speichern Button fehlt");
const ensuredRulesContainer = assertElement(rulesContainer, "Regel-Container fehlt");
const ensuredSaveRulesButton = assertElement(saveRulesButton, "Regel speichern Button fehlt");

type StatusType = "info" | "error" | "warning";

function setStatus(message: string, type: StatusType = "info"): void {
  ensuredStatusArea.textContent = message;
  ensuredStatusArea.setAttribute("data-status", type);
}

function resetAnonymizationState(): void {
  anonymizedActive = false;
  anonymizedCache = [];
  lastAnonymizationWarnings = [];
  ensuredAnonymizeButton.textContent = "Anonymisieren";
  ensuredSaveMaskedButton.disabled = true;
}

function renderTransactions(view: UnifiedTx[]): void {
  renderTable(view, ensuredTableBody);
  if (view.length === 0) {
    setStatus("Keine Umsätze gespeichert.", "info");
  }
}

function loadMapping(bankName: string): MappingSelection | null {
  const mappings = loadBankMappings();
  const found = mappings.find((entry) => entry.bank_name.toLowerCase() === bankName.toLowerCase());
  if (!found) {
    return null;
  }
  const { bank_name: _ignored, ...rest } = found;
  return rest;
}

function ensureMappingController(headers: string[], initial?: MappingSelection): void {
  mappingController = buildMappingUI(ensuredMappingContainer, headers, initial ?? undefined);
}

function handleFileSelection(file: File): void {
  setStatus("CSV wird gelesen ...", "info");
  parseCsv(file)
    .then((rows) => {
      detectedHeader = detectHeader(rows);
      if (!detectedHeader.header || detectedHeader.header.length === 0) {
        setStatus(detectedHeader.warning ?? "Keine gültige Kopfzeile gefunden.", "error");
        return;
      }
      const headers = detectedHeader.header;
      const bankSuggestion = detectedHeader.detectedBank ?? "";
      if (bankSuggestion && ensuredBankNameInput.value.trim().length === 0) {
        ensuredBankNameInput.value = bankSuggestion;
      }
      const storedMapping = ensuredBankNameInput.value
        ? loadMapping(ensuredBankNameInput.value.trim())
        : bankSuggestion
        ? loadMapping(bankSuggestion)
        : null;
      ensureMappingController(headers, storedMapping ?? undefined);
      if (detectedHeader.warning) {
        setStatus(detectedHeader.warning, "warning");
      } else {
        setStatus(
          `Header erkannt (${headers.join(", ")}). ${detectedHeader.detectedBank ? `Bank: ${detectedHeader.detectedBank}` : ""}`.trim(),
          "info"
        );
      }
    })
    .catch((error) => {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Fehler beim Einlesen der Datei", "error");
    });
}

function getCurrentMapping(bankName: string): BankMapping | null {
  if (!mappingController) {
    return null;
  }
  const mapping = mappingController.getMapping();
  return {
    bank_name: bankName,
    booking_date: mapping.booking_date,
    booking_text: mapping.booking_text,
    booking_type: mapping.booking_type,
    booking_amount: mapping.booking_amount,
    booking_date_parse_format: mapping.booking_date_parse_format,
    booking_date_display_format: mapping.booking_date_display_format,
  };
}

function describeMappingField(field: keyof MappingSelection): string {
  switch (field) {
    case "booking_date":
      return "Buchungsdatum";
    case "booking_text":
      return "Buchungstext";
    case "booking_type":
      return "Buchungsart";
    case "booking_amount":
      return "Betrag";
    case "booking_date_parse_format":
      return "Datumsformat (Import)";
    case "booking_date_display_format":
      return "Datumsformat (Anzeige)";
    default:
      return field;
  }
}

function validateMapping(mapping: BankMapping): { valid: boolean; missing: (keyof MappingSelection)[] } {
  const missing: (keyof MappingSelection)[] = [];
  if (mapping.booking_date.length === 0) {
    missing.push("booking_date");
  }
  if (mapping.booking_text.length === 0) {
    missing.push("booking_text");
  }
  if (mapping.booking_type.length === 0) {
    missing.push("booking_type");
  }
  if (mapping.booking_amount.length === 0) {
    missing.push("booking_amount");
  }
  if (mapping.booking_date_parse_format.trim().length === 0) {
    missing.push("booking_date_parse_format");
  }
  return { valid: missing.length === 0, missing };
}

function reformatTransactionsForBank(mapping: BankMapping): number {
  const existing = loadTransactions();
  if (existing.length === 0) {
    return 0;
  }

  const parseFormat = mapping.booking_date_parse_format.trim();
  const displayFormatRaw = mapping.booking_date_display_format.trim();
  const displayFormat = displayFormatRaw.length > 0 ? displayFormatRaw : parseFormat;

  let updated = 0;

  const next = existing.map((tx) => {
    if (tx.bank_name.toLowerCase() !== mapping.bank_name.toLowerCase()) {
      return tx;
    }

    const rawSource = tx.booking_date_raw ?? tx.booking_date;
    const normalizedRaw = rawSource ?? "";

    let nextDisplay = normalizedRaw;
    let nextIso: string | null = null;

    if (parseFormat && normalizedRaw.length > 0) {
      const parsed = parseDateWithFormat(normalizedRaw, parseFormat);
      if (parsed) {
        nextIso = parsed.toISOString();
        const effectiveDisplay = displayFormat.length > 0 ? displayFormat : parseFormat;
        nextDisplay = effectiveDisplay
          ? formatDateWithFormat(parsed, effectiveDisplay)
          : normalizedRaw;
      }
    }

    if (!parseFormat) {
      nextIso = null;
      nextDisplay = normalizedRaw;
    } else if (nextIso === null) {
      nextDisplay = normalizedRaw;
    }

    const needsUpdate =
      tx.booking_date_raw !== normalizedRaw ||
      tx.booking_date !== nextDisplay ||
      tx.booking_date_iso !== nextIso;

    if (!needsUpdate) {
      return tx;
    }

    updated += 1;
    return {
      ...tx,
      booking_date_raw: normalizedRaw,
      booking_date: nextDisplay,
      booking_date_iso: nextIso,
    };
  });

  if (updated > 0) {
    saveTransactions(next);
  }

  return updated;
}

function handleSaveMapping(): void {
  const bankName = ensuredBankNameInput.value.trim();
  if (!bankName) {
    setStatus("Bitte Banknamen angeben, bevor das Mapping gespeichert wird.", "warning");
    return;
  }
  const mapping = getCurrentMapping(bankName);
  if (!mapping) {
    setStatus("Es wurde noch kein Mapping erstellt.", "warning");
    return;
  }
  const validation = validateMapping(mapping);
  if (!validation.valid) {
    const missingLabels = validation.missing.map(describeMappingField);
    setStatus(`Folgende Zuordnungen fehlen: ${missingLabels.join(", ")}`, "warning");
    return;
  }
  saveBankMapping(mapping);
  const updatedCount = reformatTransactionsForBank(mapping);
  if (updatedCount > 0) {
    transactions = loadTransactions();
    resetAnonymizationState();
    renderTransactions(transactions);
    setStatus(
      `Mapping gespeichert. ${updatedCount} gespeicherte Umsätze aktualisiert.`,
      "info"
    );
  } else {
    setStatus("Mapping gespeichert.", "info");
  }
}

function handleImport(): void {
  if (!detectedHeader || detectedHeader.header.length === 0) {
    setStatus("Bitte zuerst eine CSV-Datei laden.", "warning");
    return;
  }
  const bankName = ensuredBankNameInput.value.trim();
  if (!bankName) {
    setStatus("Bitte Banknamen angeben.", "warning");
    return;
  }
  const mapping = getCurrentMapping(bankName);
  if (!mapping) {
    setStatus("Bitte zuerst ein Mapping erstellen.", "warning");
    return;
  }
  const validation = validateMapping(mapping);
  if (!validation.valid) {
    const missingLabels = validation.missing.map(describeMappingField);
    setStatus(`Folgende Zuordnungen fehlen: ${missingLabels.join(", ")}`, "warning");
    return;
  }
  const rows = detectedHeader.dataRows;
  const transformed = applyMapping(rows, detectedHeader.header, mapping, bankName);
  if (transformed.length === 0) {
    setStatus("Keine Datenzeilen gefunden.", "warning");
    return;
  }
  transactions = appendTransactions(transformed);
  resetAnonymizationState();
  renderTransactions(transactions);
  setStatus(`${transformed.length} Umsätze importiert und gespeichert.`, "info");
}

function handleBankNameChange(): void {
  if (!mappingController) {
    return;
  }
  const bankName = ensuredBankNameInput.value.trim();
  if (!bankName) {
    mappingController.clear();
    return;
  }
  const stored = loadMapping(bankName);
  if (stored) {
    mappingController.setMapping(stored);
    setStatus(`Gespeichertes Mapping für ${bankName} geladen.`, "info");
  } else {
    mappingController.clear();
  }
}

function handleToggleAnonymization(): void {
  if (transactions.length === 0) {
    setStatus("Keine Daten zum Anonymisieren.", "warning");
    return;
  }
  if (!anonymizedActive) {
    const rules = getConfiguredRules();
    const result = applyAnonymization(transactions, rules);
    anonymizedCache = result.data;
    lastAnonymizationWarnings = result.warnings;
    anonymizedActive = true;
    ensuredAnonymizeButton.textContent = "Original anzeigen";
    ensuredSaveMaskedButton.disabled = false;
    renderTransactions(anonymizedCache);
    if (lastAnonymizationWarnings.length > 0) {
      setStatus(lastAnonymizationWarnings.join(" "), "warning");
    } else {
      setStatus("Anonymisierte Ansicht aktiviert.", "info");
    }
  } else {
    anonymizedActive = false;
    ensuredAnonymizeButton.textContent = "Anonymisieren";
    ensuredSaveMaskedButton.disabled = true;
    renderTransactions(transactions);
    if (lastAnonymizationWarnings.length > 0) {
      setStatus("Originaldaten angezeigt. Prüfen Sie zuvor gemeldete Warnungen.", "warning");
    } else {
      setStatus("Originaldaten angezeigt.", "info");
    }
  }
}

function handleSaveMaskedCopy(): void {
  if (!anonymizedActive || anonymizedCache.length === 0) {
    setStatus("Keine anonymisierten Daten zum Speichern vorhanden.", "warning");
    return;
  }
  saveMaskedTransactions(anonymizedCache);
  setStatus("Anonymisierte Kopie gespeichert.", "info");
}

function handleSaveRules(): void {
  if (!rulesController) {
    return;
  }
  const rules = rulesController.getRules();
  saveAnonymizationRules(rules);

  if (anonymizedActive) {
    const result = applyAnonymization(transactions, rules);
    anonymizedCache = result.data;
    lastAnonymizationWarnings = result.warnings;
    renderTransactions(anonymizedCache);
    if (lastAnonymizationWarnings.length > 0) {
      setStatus(`Regeln gespeichert. ${lastAnonymizationWarnings.join(" ")}`, "warning");
    } else {
      setStatus("Regeln gespeichert und anonymisierte Ansicht aktualisiert.", "info");
    }
  } else {
    setStatus("Anonymisierungsregeln gespeichert.", "info");
  }
}

function handleApplySingleRule(rule: AnonRule): void {
  const baseData = anonymizedActive ? anonymizedCache : transactions;
  if (baseData.length === 0) {
    setStatus("Keine Daten zum Anwenden der Regel vorhanden.", "warning");
    return;
  }

  const result = applyAnonymization(baseData, [rule]);
  anonymizedCache = result.data;
  anonymizedActive = true;
  lastAnonymizationWarnings = result.warnings;
  ensuredAnonymizeButton.textContent = "Original anzeigen";
  ensuredSaveMaskedButton.disabled = anonymizedCache.length === 0;
  renderTransactions(anonymizedCache);

  if (lastAnonymizationWarnings.length > 0) {
    setStatus(`Regel "${rule.id}" angewendet. ${lastAnonymizationWarnings.join(" ")}`, "warning");
  } else {
    setStatus(`Regel "${rule.id}" angewendet.`, "info");
  }
}

function init(): void {
  transactions = loadTransactions();
  renderTransactions(transactions);
  const masked = loadMaskedTransactions();
  if (masked.length > 0) {
    setStatus("Es sind bereits anonymisierte Daten gespeichert.", "info");
  }

  ensuredFileInput.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
  });

  ensuredBankNameInput.addEventListener("change", handleBankNameChange);
  ensuredSaveMappingButton.addEventListener("click", (event) => {
    event.preventDefault();
    handleSaveMapping();
  });
  ensuredImportButton.addEventListener("click", (event) => {
    event.preventDefault();
    handleImport();
  });
  ensuredAnonymizeButton.addEventListener("click", (event) => {
    event.preventDefault();
    handleToggleAnonymization();
  });
  ensuredSaveMaskedButton.addEventListener("click", (event) => {
    event.preventDefault();
    handleSaveMaskedCopy();
  });

  rulesController = buildRulesUI(ensuredRulesContainer);
  const { rules } = loadAnonymizationRules();
  rulesController.setRules(rules);

  ensuredRulesContainer.addEventListener("ruleapply", (event) => {
    const customEvent = event as CustomEvent<AnonRule>;
    if (customEvent.detail) {
      handleApplySingleRule(customEvent.detail);
    }
  });

  ensuredSaveRulesButton.addEventListener("click", (event) => {
    event.preventDefault();
    handleSaveRules();
  });
}

init();
