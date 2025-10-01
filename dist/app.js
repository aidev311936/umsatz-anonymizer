import { parseCsv } from "./csv.js";
import { detectHeader } from "./headerDetect.js";
import { buildMappingUI } from "./mappingUI.js";
import { buildAnonRulesUI } from "./anonRulesUI.js";
import { applyMapping } from "./transform.js";
import { renderTable } from "./render.js";
import { appendTransactions, loadAnonymizationRules, loadBankMappings, loadMaskedTransactions, loadTransactions, saveBankMapping, saveMaskedTransactions, saveAnonymizationRules, } from "./storage.js";
import { applyAnonymization } from "./anonymize.js";
const fileInput = document.getElementById("csvInput");
const bankNameInput = document.getElementById("bankName");
const mappingContainer = document.getElementById("mappingContainer");
const anonRulesContainer = document.getElementById("anonRulesContainer");
const saveMappingButton = document.getElementById("saveMappingButton");
const importButton = document.getElementById("importButton");
const addAnonRuleButton = document.getElementById("addAnonRuleButton");
const saveAnonRulesButton = document.getElementById("saveAnonRulesButton");
const statusArea = document.getElementById("statusArea");
const tableBody = document.getElementById("transactionsBody");
const anonymizeButton = document.getElementById("anonymizeButton");
const saveMaskedButton = document.getElementById("saveMaskedButton");
let mappingController = null;
let anonRulesController = null;
let detectedHeader = null;
let transactions = [];
let anonymizedActive = false;
let anonymizedCache = [];
let lastAnonymizationWarnings = [];
let anonymizationRulesVersion = 2;
function assertElement(value, message) {
    if (!value) {
        throw new Error(message);
    }
    return value;
}
const ensuredFileInput = assertElement(fileInput, "CSV Eingabefeld nicht gefunden");
const ensuredBankNameInput = assertElement(bankNameInput, "Banknamenfeld nicht gefunden");
const ensuredMappingContainer = assertElement(mappingContainer, "Mapping-Container nicht gefunden");
const ensuredAnonRulesContainer = assertElement(anonRulesContainer, "Anonymisierungsregel-Container nicht gefunden");
const ensuredSaveMappingButton = assertElement(saveMappingButton, "Mapping speichern Button fehlt");
const ensuredImportButton = assertElement(importButton, "Import Button fehlt");
const ensuredAddAnonRuleButton = assertElement(addAnonRuleButton, "Button zum Hinzufügen von Regeln fehlt");
const ensuredSaveAnonRulesButton = assertElement(saveAnonRulesButton, "Button zum Speichern der Regeln fehlt");
const ensuredStatusArea = assertElement(statusArea, "Statusbereich fehlt");
const ensuredTableBody = assertElement(tableBody, "Tabellenkörper fehlt");
const ensuredAnonymizeButton = assertElement(anonymizeButton, "Anonymisieren Button fehlt");
const ensuredSaveMaskedButton = assertElement(saveMaskedButton, "Speichern Button fehlt");
function setStatus(message, type = "info") {
    ensuredStatusArea.textContent = message;
    ensuredStatusArea.setAttribute("data-status", type);
}
function resetAnonymizationState() {
    anonymizedActive = false;
    anonymizedCache = [];
    lastAnonymizationWarnings = [];
    ensuredAnonymizeButton.textContent = "Anonymisieren";
    ensuredSaveMaskedButton.disabled = true;
}
function renderTransactions(view) {
    renderTable(view, ensuredTableBody);
    if (view.length === 0) {
        setStatus("Keine Umsätze gespeichert.", "info");
    }
}
function loadMapping(bankName) {
    const mappings = loadBankMappings();
    const found = mappings.find((entry) => entry.bank_name.toLowerCase() === bankName.toLowerCase());
    if (!found) {
        return null;
    }
    const { bank_name: _ignored, ...rest } = found;
    return rest;
}
function ensureMappingController(headers, initial) {
    mappingController = buildMappingUI(ensuredMappingContainer, headers, initial ?? undefined);
}
function ensureAnonRulesUI() {
    const payload = loadAnonymizationRules();
    anonymizationRulesVersion = Math.max(payload.version, 2);
    anonRulesController = buildAnonRulesUI(ensuredAnonRulesContainer, payload.rules);
}
function handleFileSelection(file) {
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
        }
        else {
            setStatus(`Header erkannt (${headers.join(", ")}). ${detectedHeader.detectedBank ? `Bank: ${detectedHeader.detectedBank}` : ""}`.trim(), "info");
        }
    })
        .catch((error) => {
        console.error(error);
        setStatus(error instanceof Error ? error.message : "Fehler beim Einlesen der Datei", "error");
    });
}
function getCurrentMapping(bankName) {
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
    };
}
function validateMapping(mapping) {
    const missing = [];
    Object.keys(mapping).forEach((key) => {
        if (key === "bank_name") {
            return;
        }
        const value = mapping[key];
        if (!Array.isArray(value) || value.length === 0) {
            missing.push(key);
        }
    });
    return { valid: missing.length === 0, missing };
}
function handleSaveMapping() {
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
        setStatus(`Folgende Zuordnungen fehlen: ${validation.missing.join(", ")}`, "warning");
        return;
    }
    saveBankMapping(mapping);
    setStatus("Mapping gespeichert.", "info");
}
function handleAddAnonRule() {
    if (!anonRulesController) {
        ensureAnonRulesUI();
    }
    if (!anonRulesController) {
        setStatus("Regelverwaltung konnte nicht initialisiert werden.", "error");
        return;
    }
    const newId = `rule_${Date.now().toString(36)}`;
    anonRulesController.addRule({
        id: newId,
        type: "regex",
        pattern: "",
        replacement: "",
        fields: ["booking_text"],
        enabled: true,
    });
}
function handleSaveAnonRules() {
    if (!anonRulesController) {
        ensureAnonRulesUI();
    }
    if (!anonRulesController) {
        setStatus("Regelverwaltung konnte nicht initialisiert werden.", "error");
        return;
    }
    const { rules, errors } = anonRulesController.collectRules();
    if (errors.length > 0) {
        setStatus(errors.join(" "), "warning");
        return;
    }
    if (rules.length === 0) {
        setStatus("Bitte mindestens eine Regel definieren.", "warning");
        return;
    }
    saveAnonymizationRules({ rules, version: anonymizationRulesVersion });
    ensureAnonRulesUI();
    resetAnonymizationState();
    renderTransactions(transactions);
    setStatus("Anonymisierungsregeln gespeichert. Ansicht zeigt Originaldaten.", "info");
}
function handleImport() {
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
        setStatus(`Folgende Zuordnungen fehlen: ${validation.missing.join(", ")}`, "warning");
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
function handleBankNameChange() {
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
    }
    else {
        mappingController.clear();
    }
}
function handleToggleAnonymization() {
    if (transactions.length === 0) {
        setStatus("Keine Daten zum Anonymisieren.", "warning");
        return;
    }
    if (!anonymizedActive) {
        const { rules } = loadAnonymizationRules();
        const activeRules = rules.filter((rule) => rule.enabled !== false);
        if (activeRules.length === 0) {
            setStatus("Keine aktiven Regeln vorhanden.", "warning");
            return;
        }
        const result = applyAnonymization(transactions, activeRules);
        anonymizedCache = result.data;
        lastAnonymizationWarnings = result.warnings;
        anonymizedActive = true;
        ensuredAnonymizeButton.textContent = "Original anzeigen";
        ensuredSaveMaskedButton.disabled = false;
        renderTransactions(anonymizedCache);
        if (lastAnonymizationWarnings.length > 0) {
            setStatus(lastAnonymizationWarnings.join(" "), "warning");
        }
        else {
            setStatus("Anonymisierte Ansicht aktiviert.", "info");
        }
    }
    else {
        anonymizedActive = false;
        ensuredAnonymizeButton.textContent = "Anonymisieren";
        ensuredSaveMaskedButton.disabled = true;
        renderTransactions(transactions);
        if (lastAnonymizationWarnings.length > 0) {
            setStatus("Originaldaten angezeigt. Prüfen Sie zuvor gemeldete Warnungen.", "warning");
        }
        else {
            setStatus("Originaldaten angezeigt.", "info");
        }
    }
}
function handleSaveMaskedCopy() {
    if (!anonymizedActive || anonymizedCache.length === 0) {
        setStatus("Keine anonymisierten Daten zum Speichern vorhanden.", "warning");
        return;
    }
    saveMaskedTransactions(anonymizedCache);
    setStatus("Anonymisierte Kopie gespeichert.", "info");
}
function init() {
    transactions = loadTransactions();
    renderTransactions(transactions);
    const masked = loadMaskedTransactions();
    if (masked.length > 0) {
        setStatus("Es sind bereits anonymisierte Daten gespeichert.", "info");
    }
    ensureAnonRulesUI();
    ensuredFileInput.addEventListener("change", (event) => {
        const input = event.currentTarget;
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
    ensuredAddAnonRuleButton.addEventListener("click", (event) => {
        event.preventDefault();
        handleAddAnonRule();
    });
    ensuredSaveAnonRulesButton.addEventListener("click", (event) => {
        event.preventDefault();
        handleSaveAnonRules();
    });
    ensuredAnonymizeButton.addEventListener("click", (event) => {
        event.preventDefault();
        handleToggleAnonymization();
    });
    ensuredSaveMaskedButton.addEventListener("click", (event) => {
        event.preventDefault();
        handleSaveMaskedCopy();
    });
}
init();
