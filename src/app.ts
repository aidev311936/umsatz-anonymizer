import { parseCsv } from "./csv.js";
import { detectHeader, HeaderDetectionResult } from "./headerDetect.js";
import { buildMappingUI, MappingUIController } from "./mappingUI.js";
import { applyMapping } from "./transform.js";
import { renderTable } from "./render.js";
import {
  appendTransactions,
  loadDisplaySettings,
  loadAnonymizationRules,
  loadBankMappings,
  importAnonymizationRules,
  importBankMappings,
  loadMaskedTransactions,
  loadTransactions,
  saveBankMapping,
  saveDisplaySettings,
  saveAnonymizationRules,
  saveTransactions,
  saveMaskedTransactions,
} from "./storage.js";
import { applyAnonymization } from "./anonymize.js";
import { buildRulesUI, RulesUIController } from "./rulesUI.js";
import {
  formatBookingAmount,
  formatTransactionsForDisplay,
  sanitizeDisplaySettings,
} from "./displaySettings.js";
import { AnonRule, BankMapping, DisplaySettings, UnifiedTx } from "./types.js";
import { formatDateWithFormat, parseDateWithFormat } from "./dateFormat.js";
import * as auth from "./auth.js";

type MappingSelection = Omit<BankMapping, "bank_name">;

const CONFIG_MAPPING_KEY = "mapping_to_target_schema";
const CONFIG_DISPLAY_KEY = "display_settings";
const CONFIG_RULES_KEY = "anonymization_rules";

const mainElement = document.querySelector("main") as HTMLElement | null;
const tokenLoginContainer = document.getElementById("tokenLoginContainer");
const tokenForm = document.getElementById("tokenLogin") as HTMLFormElement | null;
const tokenInputField = document.getElementById("tokenLoginForm") as HTMLInputElement | null;
const tokenErrorElement = document.getElementById("tokenError");
const tokenSubmitButton = tokenForm?.querySelector(
  'button[type="submit"]',
) as HTMLButtonElement | null;
const requestTokenButton = document.getElementById("requestTokenButton") as HTMLButtonElement | null;
const logoutButton = document.getElementById("logoutButton") as HTMLButtonElement | null;

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
const dateDisplayFormatInput = document.getElementById("dateDisplayFormat") as HTMLInputElement | null;
const amountDisplayFormatInput = document.getElementById("amountDisplayFormat") as HTMLInputElement | null;
const applyDisplaySettingsButton = document.getElementById(
  "applyDisplaySettingsButton"
) as HTMLButtonElement | null;
const downloadMaskedButton = document.getElementById("downloadMaskedButton") as HTMLButtonElement | null;
const exportConfigButton = document.getElementById("exportConfigButton") as HTMLButtonElement | null;
const importConfigButton = document.getElementById("importConfigButton") as HTMLButtonElement | null;
const configImportInput = document.getElementById("configImportInput") as HTMLInputElement | null;

let mappingController: MappingUIController | null = null;
let rulesController: RulesUIController | null = null;
let detectedHeader: HeaderDetectionResult | null = null;
let transactions: UnifiedTx[] = [];
let anonymizedActive = false;
let anonymizedCache: UnifiedTx[] = [];
let lastAnonymizationWarnings: string[] = [];
let displaySettings: DisplaySettings = loadDisplaySettings();
let appInitialized = false;

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

const ensuredMainElement = assertElement(mainElement, "Hauptbereich nicht gefunden");
const ensuredTokenLoginContainer = assertElement(
  tokenLoginContainer,
  "Token-Anmeldecontainer nicht gefunden",
);
const ensuredTokenForm = assertElement(tokenForm, "Token-Anmeldeformular fehlt");
const ensuredTokenInput = assertElement(
  tokenInputField,
  "Token Eingabefeld fehlt",
);
const ensuredTokenError = assertElement(
  tokenErrorElement,
  "Token Fehlermeldungsbereich fehlt",
);
const ensuredTokenSubmitButton = assertElement(
  tokenSubmitButton,
  "Token Absenden Button fehlt",
);
const ensuredRequestTokenButton = assertElement(
  requestTokenButton,
  "Token anfordern Button fehlt",
);
const ensuredLogoutButton = assertElement(logoutButton, "Logout Button fehlt");

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
const ensuredDateDisplayFormatInput = assertElement(
  dateDisplayFormatInput,
  "Anzeige-Datumsformat Eingabefeld fehlt"
);
const ensuredAmountDisplayFormatInput = assertElement(
  amountDisplayFormatInput,
  "Anzeige-Betragsformat Eingabefeld fehlt"
);
const ensuredApplyDisplaySettingsButton = assertElement(
  applyDisplaySettingsButton,
  "Anzeige aktualisieren Button fehlt"
);
const ensuredDownloadMaskedButton = assertElement(
  downloadMaskedButton,
  "Download anonymisierte Umsätze Button fehlt"
);
const ensuredExportConfigButton = assertElement(
  exportConfigButton,
  "Konfiguration exportieren Button fehlt"
);
const ensuredImportConfigButton = assertElement(
  importConfigButton,
  "Konfiguration importieren Button fehlt"
);
const ensuredConfigImportInput = assertElement(
  configImportInput,
  "Konfigurations-Dateiupload fehlt"
);

ensuredDateDisplayFormatInput.value = displaySettings.booking_date_display_format;
ensuredAmountDisplayFormatInput.value = displaySettings.booking_amount_display_format;

type StatusType = "info" | "error" | "warning";

function setStatus(message: string, type: StatusType = "info"): void {
  ensuredStatusArea.textContent = message;
  ensuredStatusArea.setAttribute("data-status", type);
}

function clearTokenError(): void {
  ensuredTokenError.textContent = "";
  ensuredTokenError.hidden = true;
}

function setTokenError(message: string): void {
  ensuredTokenError.textContent = message;
  ensuredTokenError.hidden = false;
}

function showLogin(message?: string): void {
  ensuredMainElement.hidden = true;
  ensuredTokenLoginContainer.hidden = false;
  if (message) {
    setTokenError(message);
  } else {
    clearTokenError();
  }
  ensuredTokenInput.focus();
}

function showMain(): void {
  ensuredTokenLoginContainer.hidden = true;
  ensuredMainElement.hidden = false;
  clearTokenError();
}

function setTokenFormDisabled(disabled: boolean): void {
  ensuredTokenInput.disabled = disabled;
  ensuredTokenSubmitButton.disabled = disabled;
  ensuredRequestTokenButton.disabled = disabled;
}

function handleLogout(): void {
  auth.deleteTokenCookie();
  anonymizedActive = false;
  anonymizedCache = [];
  transactions = [];
  detectedHeader = null;
  renderTransactions([]);
  ensuredAnonymizeButton.textContent = "Anonymisieren";
  ensuredSaveMaskedButton.disabled = true;
  ensuredTokenInput.value = "";
  setStatus("Bitte melden Sie sich erneut an.", "info");
  showLogin("Sie wurden abgemeldet.");
}

function setupAuthUI(): void {
  ensuredTokenForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleTokenSubmission();
  });

  ensuredRequestTokenButton.addEventListener("click", (event) => {
    event.preventDefault();
    void handleTokenRequest();
  });

  ensuredLogoutButton.addEventListener("click", (event) => {
    event.preventDefault();
    handleLogout();
  });
}

async function handleTokenSubmission(): Promise<void> {
  clearTokenError();
  const rawToken = ensuredTokenInput.value.trim();
  if (!rawToken) {
    setTokenError("Bitte geben Sie ein Token ein.");
    return;
  }

  setTokenFormDisabled(true);
  try {
    const result = await auth.validateToken(rawToken);
    ensuredTokenInput.value = "";
    handleAuthenticated(result.message ?? "Authentifizierung erfolgreich.");
  } catch (error) {
    if (error instanceof auth.AuthError) {
      setTokenError(error.message);
    } else if (error instanceof Error) {
      setTokenError(error.message);
    } else {
      setTokenError("Unbekannter Fehler bei der Anmeldung.");
    }
  } finally {
    setTokenFormDisabled(false);
  }
}

async function handleTokenRequest(): Promise<void> {
  clearTokenError();
  setTokenFormDisabled(true);
  try {
    const result = await auth.requestNewToken();
    ensuredTokenInput.value = "";
    handleAuthenticated(
      result.message ?? "Es wurde ein neues Token erstellt und gespeichert.",
    );
  } catch (error) {
    if (error instanceof auth.AuthError) {
      setTokenError(error.message);
    } else if (error instanceof Error) {
      setTokenError(error.message);
    } else {
      setTokenError("Neues Token konnte nicht angefordert werden.");
    }
  } finally {
    setTokenFormDisabled(false);
  }
}

function hydrateTransactionsFromStorage(): void {
  transactions = loadTransactions();
  anonymizedActive = false;
  anonymizedCache = [];
  lastAnonymizationWarnings = [];
  renderTransactions(transactions);
  ensuredAnonymizeButton.textContent = "Anonymisieren";
  ensuredSaveMaskedButton.disabled = true;
  const masked = loadMaskedTransactions();
  if (masked.length > 0) {
    setStatus("Es sind bereits anonymisierte Daten gespeichert.", "info");
  }
}

function hydrateRulesFromStorage(): void {
  if (!rulesController) {
    return;
  }
  const { rules } = loadAnonymizationRules();
  rulesController.setRules(rules);
}

function handleAuthenticated(message?: string): void {
  if (!appInitialized) {
    init();
    appInitialized = true;
  } else {
    hydrateTransactionsFromStorage();
    hydrateRulesFromStorage();
  }
  showMain();
  if (message) {
    setStatus(message, "info");
  }
}

function createTimestampedFilename(base: string, extension: string): string {
  const datePart = new Date().toISOString().slice(0, 10);
  return `${base}-${datePart}.${extension}`;
}

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

type CsvColumn = "bank_name" | "booking_date" | "booking_text" | "booking_type" | "booking_amount";

const CSV_COLUMNS: CsvColumn[] = [
  "bank_name",
  "booking_date",
  "booking_text",
  "booking_type",
  "booking_amount",
];

function escapeCsvValue(value: string): string {
  const needsEscaping = /[";\n\r]/.test(value);
  const normalized = value.replace(/"/g, '""');
  return needsEscaping ? `"${normalized}"` : normalized;
}

function createCsvContent(entries: UnifiedTx[], settings: DisplaySettings): string {
  const header = CSV_COLUMNS.join(";");
  const rows = entries.map((tx) => {
    return CSV_COLUMNS
      .map((column) => {
        if (column === "booking_amount") {
          return escapeCsvValue(formatBookingAmount(tx.booking_amount, settings));
        }
        const raw = tx[column];
        const normalized = raw == null ? "" : String(raw);
        return escapeCsvValue(normalized);
      })
      .join(";");
  });
  return [header, ...rows].join("\n");
}

function resetAnonymizationState(): void {
  anonymizedActive = false;
  anonymizedCache = [];
  lastAnonymizationWarnings = [];
  ensuredAnonymizeButton.textContent = "Anonymisieren";
  ensuredSaveMaskedButton.disabled = true;
}

function renderTransactions(view: UnifiedTx[]): void {
  const isPrimaryView = view === transactions;
  const isAnonymizedView = view === anonymizedCache;
  const formatted = formatTransactionsForDisplay(view, displaySettings);

  if (isPrimaryView) {
    transactions = formatted;
  }
  if (isAnonymizedView) {
    anonymizedCache = formatted;
  }

  renderTable(formatted, ensuredTableBody, displaySettings);
  if (formatted.length === 0) {
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
  const displayFormatRaw = displaySettings.booking_date_display_format.trim();
  const displayFormat =
    displayFormatRaw.length > 0 ? displayFormatRaw : parseFormat;

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
        const targetFormat = displayFormat.length > 0 ? displayFormat : parseFormat;
        nextDisplay = targetFormat
          ? formatDateWithFormat(parsed, targetFormat)
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

function applyDisplaySettingsAndRefresh(nextSettings: DisplaySettings): UnifiedTx[] {
  displaySettings = nextSettings;
  ensuredDateDisplayFormatInput.value = nextSettings.booking_date_display_format;
  ensuredAmountDisplayFormatInput.value = nextSettings.booking_amount_display_format;
  saveDisplaySettings(displaySettings);

  if (transactions.length > 0) {
    transactions = formatTransactionsForDisplay(transactions, displaySettings);
    saveTransactions(transactions);
  } else {
    saveTransactions([]);
  }

  const stored = loadTransactions();
  transactions = formatTransactionsForDisplay(stored, displaySettings);

  if (anonymizedCache.length > 0) {
    anonymizedCache = formatTransactionsForDisplay(anonymizedCache, displaySettings);
  }

  const activeView = anonymizedActive ? anonymizedCache : transactions;
  renderTransactions(activeView);
  return activeView;
}

function handleDisplaySettingsUpdate(): void {
  const nextSettings = sanitizeDisplaySettings({
    booking_date_display_format: ensuredDateDisplayFormatInput.value,
    booking_amount_display_format: ensuredAmountDisplayFormatInput.value,
  });

  const activeView = applyDisplaySettingsAndRefresh(nextSettings);
  const message = activeView.length > 0
    ? "Anzeigeeinstellungen gespeichert und Tabelle aktualisiert."
    : "Anzeigeeinstellungen gespeichert.";
  setStatus(message, "info");
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
  const transformed = applyMapping(
    rows,
    detectedHeader.header,
    mapping,
    bankName,
    displaySettings
  );
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

function handleDownloadMaskedCsv(): void {
  const masked = loadMaskedTransactions();
  if (masked.length === 0) {
    setStatus("Keine anonymisierten Umsätze im Speicher gefunden.", "warning");
    return;
  }
  const formatted = formatTransactionsForDisplay(masked, displaySettings);
  const csvContent = createCsvContent(formatted, displaySettings);
  const filename = createTimestampedFilename("anonymisierte-umsaetze", "csv");
  triggerDownload(filename, csvContent, "text/csv;charset=utf-8");
  setStatus(`${masked.length} anonymisierte Umsätze exportiert.`, "info");
}

function handleExportConfig(): void {
  const payload = {
    [CONFIG_MAPPING_KEY]: loadBankMappings(),
    [CONFIG_DISPLAY_KEY]: loadDisplaySettings(),
    [CONFIG_RULES_KEY]: loadAnonymizationRules(),
  };
  const serialized = JSON.stringify(payload, null, 2);
  const filename = createTimestampedFilename("umsatz-anonymizer-konfiguration", "json");
  triggerDownload(filename, serialized, "application/json;charset=utf-8");
  setStatus("Konfiguration exportiert.", "info");
}

async function handleConfigFileImport(file: File): Promise<void> {
  setStatus(`Konfigurationsdatei "${file.name}" wird importiert ...`, "info");
  try {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.error(error);
      setStatus("Die Konfigurationsdatei enthält kein gültiges JSON.", "error");
      return;
    }

    if (typeof parsed !== "object" || parsed === null) {
      setStatus("Unbekanntes Format der Konfigurationsdatei.", "error");
      return;
    }

    const data = parsed as Record<string, unknown>;
    const mappingProvided = Object.prototype.hasOwnProperty.call(data, CONFIG_MAPPING_KEY);
    const displayProvided = Object.prototype.hasOwnProperty.call(data, CONFIG_DISPLAY_KEY);
    const rulesProvided = Object.prototype.hasOwnProperty.call(data, CONFIG_RULES_KEY);

    if (!mappingProvided && !displayProvided && !rulesProvided) {
      setStatus("Keine unterstützten Einstellungen in der Konfigurationsdatei gefunden.", "warning");
      return;
    }

    const summaryParts: string[] = [];
    const warningParts: string[] = [];

    let importedMappings: BankMapping[] | null = null;
    if (mappingProvided) {
      importedMappings = importBankMappings(data[CONFIG_MAPPING_KEY]);
      if (importedMappings === null) {
        warningParts.push("Mapping auf Zielschema konnte nicht importiert werden.");
      } else {
        const count = importedMappings.length;
        summaryParts.push(count === 1 ? "1 Mapping übernommen." : `${count} Mappings übernommen.`);
      }
    }

    let importedDisplaySettings: DisplaySettings | null = null;
    if (displayProvided) {
      importedDisplaySettings = sanitizeDisplaySettings(
        data[CONFIG_DISPLAY_KEY] as Partial<DisplaySettings>
      );
      summaryParts.push("Anzeigeeinstellungen übernommen.");
    }

    let importedRulesResult: { rules: AnonRule[]; version: number } | null = null;
    if (rulesProvided) {
      importedRulesResult = importAnonymizationRules(data[CONFIG_RULES_KEY]);
      if (!importedRulesResult) {
        warningParts.push("Anonymisierungsregeln konnten nicht importiert werden.");
      } else {
        const count = importedRulesResult.rules.length;
        summaryParts.push(count === 1 ? "1 Regel übernommen." : `${count} Regeln übernommen.`);
      }
    }

    if (importedDisplaySettings) {
      displaySettings = importedDisplaySettings;
    }

    let updatedTransactions = 0;
    if (importedMappings && importedMappings.length > 0) {
      importedMappings.forEach((mapping) => {
        updatedTransactions += reformatTransactionsForBank(mapping);
      });
    }

    const refreshNeeded = displayProvided || mappingProvided;
    if (refreshNeeded) {
      applyDisplaySettingsAndRefresh(displaySettings);
    }

    if (mappingProvided && mappingController) {
      const bankName = ensuredBankNameInput.value.trim();
      if (bankName) {
        const stored = loadMapping(bankName);
        if (stored) {
          mappingController.setMapping(stored);
        } else {
          mappingController.clear();
        }
      } else {
        mappingController.clear();
      }
    }

    if (importedRulesResult) {
      if (rulesController) {
        rulesController.setRules(importedRulesResult.rules);
      }

      if (anonymizedActive) {
        const result = applyAnonymization(transactions, importedRulesResult.rules);
        anonymizedCache = result.data;
        lastAnonymizationWarnings = result.warnings;
        ensuredAnonymizeButton.textContent = "Original anzeigen";
        ensuredSaveMaskedButton.disabled = anonymizedCache.length === 0;
        renderTransactions(anonymizedCache);

        if (lastAnonymizationWarnings.length > 0) {
          warningParts.push(lastAnonymizationWarnings.join(" "));
        }
      }
    }

    if (updatedTransactions > 0) {
      summaryParts.push(`${updatedTransactions} vorhandene Umsätze aktualisiert.`);
    }

    const statusType: StatusType = warningParts.length > 0 ? "warning" : "info";
    const messageParts = [...summaryParts, ...warningParts];
    const message = messageParts.length > 0 ? messageParts.join(" ") : "Konfiguration importiert.";
    setStatus(message, statusType);
  } catch (error) {
    console.error(error);
    setStatus("Fehler beim Import der Konfigurationsdatei.", "error");
  }
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
  hydrateTransactionsFromStorage();

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
  ensuredApplyDisplaySettingsButton.addEventListener("click", (event) => {
    event.preventDefault();
    handleDisplaySettingsUpdate();
  });
  ensuredAnonymizeButton.addEventListener("click", (event) => {
    event.preventDefault();
    handleToggleAnonymization();
  });
  ensuredSaveMaskedButton.addEventListener("click", (event) => {
    event.preventDefault();
    handleSaveMaskedCopy();
  });
  ensuredDownloadMaskedButton.addEventListener("click", (event) => {
    event.preventDefault();
    handleDownloadMaskedCsv();
  });
  ensuredExportConfigButton.addEventListener("click", (event) => {
    event.preventDefault();
    handleExportConfig();
  });
  ensuredImportConfigButton.addEventListener("click", (event) => {
    event.preventDefault();
    ensuredConfigImportInput.value = "";
    ensuredConfigImportInput.click();
  });
  ensuredConfigImportInput.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void handleConfigFileImport(file);
    }
    input.value = "";
  });

  rulesController = buildRulesUI(ensuredRulesContainer);
  hydrateRulesFromStorage();

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

async function bootstrap(): Promise<void> {
  setupAuthUI();

  try {
    await auth.ensureAuthenticated();
    handleAuthenticated();
  } catch (error) {
    if (error instanceof auth.AuthError) {
      if (error.code === "NO_TOKEN") {
        showLogin();
      } else {
        showLogin(error.message);
      }
    } else if (error instanceof Error) {
      showLogin(error.message);
    } else {
      showLogin("Authentifizierung fehlgeschlagen.");
    }
  }
}

void bootstrap();
