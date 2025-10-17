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
              <label for="bank" class="block text-sm font-medium text-slate-700">Bankname</label>
              <input
                id="bank"
                v-model="importStore.bankName"
                list="knownBanks"
                type="text"
                placeholder="z. B. comdirect"
                class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <datalist id="knownBanks">
                <option v-for="bank in bankMappingsStore.knownBanks" :key="bank" :value="bank" />
              </datalist>
            </div>
            <div>
              <label for="booking-account" class="block text-sm font-medium text-slate-700">Buchungskonto</label>
              <input
                id="booking-account"
                v-model="importStore.bookingAccount"
                type="text"
                placeholder="z. B. Girokonto"
                class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
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
    <ImportProgressDialog :visible="showProgress" :progress="progress" />
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
import type { MappingSelection } from "../services/importService";

const importStore = useImportStore();
const bankMappingsStore = useBankMappingsStore();
const displaySettingsStore = useDisplaySettingsStore();
const transactionsStore = useTransactionsStore();

const showProgress = ref(false);
const progress = ref(0);
const importSummary = ref("");

const mapping = reactive<{ value: MappingSelection | null }>({ value: importStore.mapping });

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
    };
    return mapping.value;
  }
  mapping.value = {
    booking_date: [],
    booking_text: [],
    booking_type: [],
    booking_amount: [],
    booking_date_parse_format: "",
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
      importStore.setMapping({ ...existing, booking_date_parse_format: existing.booking_date_parse_format });
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
  await bankMappingsStore.save({
    bank_name: importStore.bankName,
    ...mapping.value,
  });
}

async function startImport(): Promise<void> {
  if (!canImport.value || !mapping.value) {
    return;
  }
  showProgress.value = true;
  progress.value = 20;
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
  } finally {
    setTimeout(() => {
      showProgress.value = false;
      progress.value = 0;
    }, 400);
  }
}
</script>
