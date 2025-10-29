<template>
  <div class="space-y-8">
    <section class="grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2 space-y-6">
        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-slate-900">CSV-Import</h2>
          <p class="mt-2 text-sm text-slate-600">Wählen Sie eine CSV-Datei und ordnen Sie die Spalten dem Zielschema zu.</p>
          <div class="mt-6 space-y-4">
            <FileUpload @file-selected="handleFileSelected" />
            <div>
              <div class="flex items-center gap-2">
                <label for="bank" class="block text-sm font-medium text-slate-700">Bankname</label>
                <span
                  class="inline-flex h-5 w-5 items-center justify-center text-slate-400 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                  role="img"
                  tabindex="0"
                  aria-label="Der Bankname dient sowohl dem automatischen Mapping gespeicherter Einstellungen als auch als Erinnerung für spätere Importe."
                  title="Der Bankname dient sowohl dem automatischen Mapping gespeicherter Einstellungen als auch als Erinnerung für spätere Importe."
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a1 1 0 0 0-.867.5.996.996 0 0 0-.011.008.996.996 0 0 0 .018 0 1 1 0 0 0-.01 1.993h.01A1 1 0 0 0 10 5Zm-1 4a1 1 0 0 1 1-1c.89 0 1.55.757 1.719 1.456.2.84-.12 1.68-.688 2.102-.27.199-.53.38-.719.563a1 1 0 0 0-.312.727V13a1 1 0 1 1-2 0v-.153c0-.873.389-1.559.916-2.01.225-.198.509-.4.782-.6.195-.145.312-.355.25-.617C10.6 9.498 10.37 9 10 9a1 1 0 0 1-1-1Zm1 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <span class="sr-only">Information zum Feld Bankname</span>
                </span>
              </div>
              <input
                id="bank"
                v-model="importStore.bankName"
                list="knownBanks"
                type="text"
                placeholder="z. B. comdirect"
                class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-describedby="bank-name-hint"
              />
              <datalist id="knownBanks">
                <option v-for="bank in bankMappingsStore.knownBanks" :key="bank" :value="bank" />
              </datalist>
              <p id="bank-name-hint" class="mt-2 text-xs text-slate-500">
                Verwenden Sie den Banknamen, um gespeicherte Mappings automatisch zu laden und sich bei künftigen Importen zu orientieren.
              </p>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <label for="booking-account" class="block text-sm font-medium text-slate-700">Buchungskonto</label>
                <span
                  class="inline-flex h-5 w-5 items-center justify-center text-slate-400 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                  role="img"
                  tabindex="0"
                  aria-label="Dieses Feld erwartet keinen offiziellen IBAN-Eintrag, sondern einen frei wählbaren Alias zur späteren Zuordnung."
                  title="Dieses Feld erwartet keinen offiziellen IBAN-Eintrag, sondern einen frei wählbaren Alias zur späteren Zuordnung."
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a1 1 0 0 0-.867.5.996.996 0 0 0-.011.008.996.996 0 0 0 .018 0 1 1 0 0 0-.01 1.993h.01A1 1 0 0 0 10 5Zm-1 4a1 1 0 0 1 1-1c.89 0 1.55.757 1.719 1.456.2.84-.12 1.68-.688 2.102-.27.199-.53.38-.719.563a1 1 0 0 0-.312.727V13a1 1 0 1 1-2 0v-.153c0-.873.389-1.559.916-2.01.225-.198.509-.4.782-.6.195-.145.312-.355.25-.617C10.6 9.498 10.37 9 10 9a1 1 0 0 1-1-1Zm1 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <span class="sr-only">Information zum Feld Buchungskonto</span>
                </span>
              </div>
              <input
                id="booking-account"
                v-model="importStore.bookingAccount"
                type="text"
                placeholder="z. B. Girokonto"
                class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-describedby="booking-account-hint"
              />
              <p id="booking-account-hint" class="mt-2 text-xs text-slate-500">
                Geben Sie hier einen Alias ein, damit Sie die Buchungen später leichter zuordnen können.
              </p>
            </div>
            <p v-if="importStore.detectedBank" class="text-sm text-slate-500">
              Erkannte Bank: <span class="font-medium">{{ importStore.detectedBank }}</span>
            </p>
            <p v-if="importStore.warning" class="text-sm font-medium text-amber-600">{{ importStore.warning }}</p>
            <p v-if="importStore.error" class="text-sm font-medium text-rose-600">{{ importStore.error }}</p>
          </div>
        </div>
        <div v-if="importStore.header.length > 0" class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-slate-900">Mapping auf Zielschema</h2>
            <button
              type="button"
              class="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
              @click="saveMapping"
            >
              Mapping speichern
            </button>
          </div>
          <p class="mt-2 text-sm text-slate-600">
            Ordnen Sie die CSV-Spalten den Zielspalten zu. Bereits gespeicherte Mappings werden beim erneuten Import automatisch geladen.
          </p>
          <div class="mt-6">
            <MappingEditor :headers="importStore.header" v-model="mappingValue" />
          </div>
        </div>
      </div>
      <TransactionImportsPanel
        class="lg:col-span-1"
        :history="transactionsStore.history"
        @refresh="transactionsStore.refreshHistory"
      />
    </section>
    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex flex-wrap items-center gap-4">
        <button
          type="button"
          class="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
          :disabled="!canImport"
          @click="startImport"
        >
          Import starten
        </button>
        <span v-if="importSummary" class="text-sm text-slate-600">
          {{ importSummary }}
        </span>
      </div>
    </section>
    <ImportProgressDialog
      :visible="showProgress"
      :progress="progress"
      :closable="dialogClosable"
      @close="handleProgressClose"
    >
      <p v-if="importSummary" class="mt-4 text-sm text-slate-600">
        {{ importSummary }}
      </p>
    </ImportProgressDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import FileUpload from "../components/FileUpload.vue";
import ImportProgressDialog from "../components/ImportProgressDialog.vue";
import MappingEditor from "../components/MappingEditor.vue";
import TransactionImportsPanel from "../components/TransactionImportsPanel.vue";
import { useBankMappingsStore } from "../stores/bankMappings";
import { useDisplaySettingsStore } from "../stores/displaySettings";
import { useImportStore } from "../stores/import";
import { useTransactionsStore } from "../stores/transactions";
import type { BankMappingDetection, MappingSelection } from "../types";

const importStore = useImportStore();
const bankMappingsStore = useBankMappingsStore();
const displaySettingsStore = useDisplaySettingsStore();
const transactionsStore = useTransactionsStore();

const showProgress = ref(false);
const progress = ref(0);
const importSummary = ref("");
const dialogClosable = ref(false);

const mapping = reactive<{ value: MappingSelection | null }>({ value: importStore.mapping });

function isProbablyNumber(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  const normalized = trimmed
    .replace(/[\s\u00a0]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(/,/g, ".");
  if (normalized === "" || normalized === "." || normalized === "+" || normalized === "-") {
    return false;
  }
  if (!/^[-+]?\d*(?:\.\d+)?$/.test(normalized)) {
    return false;
  }
  return !Number.isNaN(Number.parseFloat(normalized));
}

function isProbablyDate(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (!/[0-9]/.test(trimmed)) {
    return false;
  }
  if (/^\d{1,4}$/.test(trimmed)) {
    return false;
  }

  const candidates: string[] = [];
  const dotted = /^([0-9]{1,2})[.\/-]([0-9]{1,2})[.\/-]([0-9]{2,4})$/;
  const iso = /^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})/;

  const dottedMatch = dotted.exec(trimmed);
  if (dottedMatch) {
    const year = dottedMatch[3].padStart(4, "0");
    const month = dottedMatch[2].padStart(2, "0");
    const day = dottedMatch[1].padStart(2, "0");
    candidates.push(`${year}-${month}-${day}`);
  }

  if (iso.test(trimmed)) {
    candidates.push(trimmed);
  }

  candidates.push(trimmed.replace(/\//g, "-").replace(/\./g, "-"));

  return candidates.some((candidate) => !Number.isNaN(Date.parse(candidate)));
}

function buildColumnMarkers(rows: string[][], columnCount: number): string[] {
  const markers: string[] = [];
  for (let index = 0; index < columnCount; index += 1) {
    const values = rows
      .map((row) => (row[index] ?? "").toString().trim())
      .filter((value) => value.length > 0);
    if (values.length === 0) {
      markers.push("empty");
      continue;
    }
    if (values.every(isProbablyDate)) {
      markers.push("date");
      continue;
    }
    if (values.every(isProbablyNumber)) {
      markers.push("number");
      continue;
    }
    markers.push("text");
  }
  return markers;
}

function buildDetectionHints(selection: MappingSelection): BankMappingDetection | null {
  const headerSignature = importStore.header
    .map((entry) => entry?.toString?.() ?? "")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const detection: BankMappingDetection = {};
  if (headerSignature.length > 0) {
    detection.header_signature = headerSignature;
  }

  if (selection.without_header) {
    const columnCount = importStore.dataRows.reduce(
      (max, row) => Math.max(max, row.length),
      Math.max(headerSignature.length, 0),
    );
    if (columnCount > 0) {
      const sampleRows = [importStore.header, ...importStore.dataRows];
      const markers = buildColumnMarkers(sampleRows, columnCount);
      detection.without_header = {
        column_count: columnCount,
        column_markers: markers,
      };
    }
  }

  return Object.keys(detection).length > 0 ? detection : null;
}

function ensureMapping(): MappingSelection {
  if (mapping.value) {
    return mapping.value;
  }
  if (importStore.mapping) {
    mapping.value = { ...importStore.mapping };
    return mapping.value;
  }
  const existing = bankMappingsStore.mappingByBank(importStore.bankName);
  if (existing) {
    mapping.value = {
      booking_date: [...existing.booking_date],
      booking_text: [...existing.booking_text],
      booking_type: [...existing.booking_type],
      booking_amount: [...existing.booking_amount],
      booking_date_parse_format: existing.booking_date_parse_format,
      without_header: existing.without_header,
    };
    return mapping.value;
  }
  mapping.value = {
    booking_date: [],
    booking_text: [],
    booking_type: [],
    booking_amount: [],
    booking_date_parse_format: "",
    without_header: false,
  };
  return mapping.value;
}

const mappingValue = computed({
  get: () => ensureMapping(),
  set: (value: MappingSelection) => {
    mapping.value = value;
    importStore.setMapping(value);
  },
});

const canImport = computed(
  () =>
    importStore.bankName.trim().length > 0 &&
    importStore.bookingAccount.trim().length > 0 &&
    importStore.header.length > 0 &&
    mappingValue.value.booking_date.length > 0 &&
    mappingValue.value.booking_amount.length > 0,
);

watch(
  () => importStore.bankName,
  (bank) => {
    const existing = bankMappingsStore.mappingByBank(bank);
    if (existing) {
      importStore.setMapping({
        booking_date: [...existing.booking_date],
        booking_text: [...existing.booking_text],
        booking_type: [...existing.booking_type],
        booking_amount: [...existing.booking_amount],
        booking_date_parse_format: existing.booking_date_parse_format,
        without_header: existing.without_header,
      });
      mapping.value = importStore.mapping;
    }
  },
);

watch(
  () => importStore.mapping,
  (next) => {
    if (next) {
      mapping.value = { ...next };
    }
  },
);

async function handleFileSelected(file: File): Promise<void> {
  await importStore.loadFile(file);
  if (!importStore.bankName && importStore.detectedBank) {
    importStore.setBankName(importStore.detectedBank);
  }
  mapping.value = importStore.mapping;
}

async function saveMapping(): Promise<void> {
  if (!mapping.value || !importStore.bankName) {
    return;
  }
  const detection = buildDetectionHints(mapping.value);
  await bankMappingsStore.save({
    bank_name: importStore.bankName,
    ...mapping.value,
    detection,
  });
}

async function startImport(): Promise<void> {
  if (!canImport.value || !mapping.value) {
    return;
  }
  showProgress.value = true;
  dialogClosable.value = false;
  progress.value = 20;
  importSummary.value = "";
  try {
    const transactions = importStore.importTransactions(displaySettingsStore.resolvedSettings);
    progress.value = 60;
    await transactionsStore.appendImported(transactions, {
      bankName: importStore.bankName,
      bookingAccount: importStore.bookingAccount,
    });
    progress.value = 100;
    importSummary.value = `${transactions.length} Transaktionen importiert.`;
  } catch (error) {
    console.error("Import failed", error);
    progress.value = 100;
    importSummary.value = "Import fehlgeschlagen. Bitte prüfen Sie die Konsole für Details.";
  } finally {
    dialogClosable.value = true;
  }
}

function handleProgressClose(): void {
  showProgress.value = false;
  progress.value = 0;
  dialogClosable.value = false;
}
</script>
