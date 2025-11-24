<template>
  <div class="space-y-8">
    <section class="grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2 space-y-6">
        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-slate-900">CSV-Import</h2>
          <p class="mt-2 text-sm text-slate-600">Wählen Sie eine CSV-Datei. Bank-Mappings werden automatisch angewendet.</p>
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
              <select
                v-if="importStore.detectedBanks.length > 0"
                id="bank"
                v-model="selectedDetectedBankOption"
                class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-describedby="bank-name-hint"
              >
                <option value="" disabled>Bitte Bank auswählen</option>
                <option v-for="(candidate, index) in importStore.detectedBanks" :key="`${candidate.mapping.bank_name}-${index}`" :value="`${index}`">
                  {{ candidate.mapping.bank_name }}
                </option>
              </select>
              <input
                v-else
                id="bank"
                v-model="bankNameInput"
                type="text"
                placeholder="z. B. comdirect"
                class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-describedby="bank-name-hint"
                list="knownBanks"
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
            <div class="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                class="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:opacity-50"
                :disabled="!canImport"
                @click="startImport"
              >
                Import starten
              </button>
              <span v-if="importSummary" class="text-sm text-slate-600">
                {{ importSummary }}
              </span>
            </div>
          </div>
        </div>
      </div>
      <TransactionImportsPanel
        class="lg:col-span-1"
        :history="transactionsStore.history"
        @refresh="transactionsStore.refreshHistory"
      />
    </section>
    <ImportProgressDialog
      :visible="showProgress"
      :progress="progress"
      :title="dialogTitle"
      :message="dialogMessage"
      :bank-name="detectedBankName"
      :closable="dialogClosable"
      @close="handleProgressClose"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import FileUpload from "../components/FileUpload.vue";
import ImportProgressDialog from "../components/ImportProgressDialog.vue";
import TransactionImportsPanel from "../components/TransactionImportsPanel.vue";
import { useBankMappingsStore } from "../stores/bankMappings";
import { useDisplaySettingsStore } from "../stores/displaySettings";
import { useImportStore } from "../stores/import";
import { useTransactionsStore } from "../stores/transactions";
import type { MappingSelection } from "../types";

const importStore = useImportStore();
const bankMappingsStore = useBankMappingsStore();
const displaySettingsStore = useDisplaySettingsStore();
const transactionsStore = useTransactionsStore();

const showProgress = ref(false);
const progress = ref(0);
const importSummary = ref("");
const dialogClosable = ref(false);
const importStatus = ref<"idle" | "running" | "success" | "error">("idle");

const detectedBankName = computed(() => importStore.detectedBank ?? importStore.bankName);
const dialogTitle = computed(() => {
  if (importStatus.value === "running") {
    return "Import läuft";
  }
  if (importStatus.value === "success") {
    return "Import abgeschlossen";
  }
  if (importStatus.value === "error") {
    return "Import fehlgeschlagen";
  }
  return "Importstatus";
});
const dialogMessage = computed(() => {
  if (importStatus.value === "running") {
    if (detectedBankName.value) {
      return `Der Import für ${detectedBankName.value} wird durchgeführt.`;
    }
    return "Die CSV-Datei wird verarbeitet…";
  }
  if (importStatus.value === "success") {
    return importSummary.value || "Import abgeschlossen.";
  }
  if (importStatus.value === "error") {
    return importSummary.value || "Import fehlgeschlagen. Bitte prüfen Sie die Konsole für Details.";
  }
  return "";
});

const mapping = reactive<{ value: MappingSelection | null }>({ value: importStore.mapping });

const selectedDetectedBankOption = computed({
  get: () => (importStore.selectedDetectedBankIndex === null ? "" : `${importStore.selectedDetectedBankIndex}`),
  set: (value: string) => {
    if (value === "") {
      importStore.selectDetectedBank(null);
    } else {
      importStore.selectDetectedBank(Number.parseInt(value, 10));
    }
  },
});

const bankNameInput = computed({
  get: () => importStore.bankName,
  set: (value: string) => {
    importStore.setBankName(value);
  },
});

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
  mapping.value = importStore.mapping;
}

async function startImport(): Promise<void> {
  if (!canImport.value || !mapping.value) {
    return;
  }
  showProgress.value = true;
  dialogClosable.value = false;
  importStatus.value = "running";
  progress.value = 20;
  importSummary.value = "";
  try {
    importStore.error = null;
    const transactions = importStore.importTransactions(displaySettingsStore.resolvedSettings);
    if (importStore.error) {
      throw new Error(importStore.error);
    }
    if (transactions.length === 0) {
      throw new Error("Es wurden keine Transaktionen importiert. Bitte CSV-Format und Mapping prüfen.");
    }
    progress.value = 60;
    if (importStore.error) {
      throw new Error(importStore.error);
    }
    if (!transactions || transactions.length === 0) {
      throw new Error("Es wurden keine Transaktionen erkannt. Bitte prüfen Sie CSV-Datei und Mapping.");
    }
    const result = await transactionsStore.appendImported(transactions, {
      bankName: importStore.bankName,
      bookingAccount: importStore.bookingAccount,
    });
    progress.value = 100;
    const importedText =
      result.addedCount === 1
        ? "1 Umsatz importiert"
        : `${result.addedCount} Umsätze importiert`;
    const duplicatesText =
      result.skippedDuplicates === 1
        ? "1 Doppelgänger erkannt"
        : `${result.skippedDuplicates} Doppelgänger erkannt`;
    if (result.skippedDuplicates > 0) {
      importSummary.value = `${duplicatesText}, ${importedText}.`;
    } else {
      importSummary.value = `${importedText}.`;
    }
    importStatus.value = "success";
  } catch (error) {
    console.error("Import failed", error);
    progress.value = 100;
    importSummary.value =
      importStore.error ||
      (error instanceof Error
        ? `Import fehlgeschlagen: ${error.message}`
        : "Import fehlgeschlagen. Bitte prüfen Sie die Konsole für Details.");
    importStatus.value = "error";
  } finally {
    dialogClosable.value = true;
  }
}

function handleProgressClose(): void {
  showProgress.value = false;
  progress.value = 0;
  importStatus.value = "idle";
  dialogClosable.value = false;
}
</script>
