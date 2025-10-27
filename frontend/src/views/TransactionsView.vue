<template>
  <div class="space-y-8">
    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
          @click="onAnonymize"
        >
          Anonymisieren
        </button>
        <button
          type="button"
          class="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          :disabled="transactionsStore.anonymized.length === 0"
          @click="onSaveMasked"
        >
          Anonymisierte Kopie speichern
        </button>
        <button
          type="button"
          class="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          :disabled="transactionsStore.maskedTransactions.length === 0 && transactionsStore.anonymized.length === 0"
          @click="onPersist"
        >
          Anonymisierte Kopie an Backend senden
        </button>
        <button
          type="button"
          class="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          :disabled="downloadData.length === 0"
          @click="onDownload"
        >
          Anonymisierte Umsätze herunterladen
        </button>
      </div>
      <p v-if="transactionsStore.anonymizationWarnings.length" class="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
        {{ transactionsStore.anonymizationWarnings.join(" ") }}
      </p>
      <div class="mt-6 overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead class="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" class="px-4 py-3">Buchungstag</th>
              <th scope="col" class="px-4 py-3">Buchungstext</th>
              <th scope="col" class="px-4 py-3">Vorgang</th>
              <th scope="col" class="px-4 py-3">Betrag</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white text-slate-700">
            <tr v-for="tx in tableTransactions" :key="tx.booking_date + tx.booking_text + tx.booking_amount">
              <td class="px-4 py-3 font-medium">{{ tx.booking_date }}</td>
              <td class="px-4 py-3">{{ tx.booking_text }}</td>
              <td class="px-4 py-3">{{ tx.booking_type }}</td>
              <td class="px-4 py-3">{{ tx.booking_amount }}</td>
            </tr>
            <tr v-if="tableTransactions.length === 0">
              <td colspan="4" class="px-4 py-6 text-center text-sm text-slate-500">Keine Transaktionen vorhanden.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <TransactionImportsPanel :history="transactionsStore.history" @refresh="transactionsStore.refreshHistory" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import TransactionImportsPanel from "../components/TransactionImportsPanel.vue";
import { formatTransactions } from "../services/displayService";
import { useAnonymizationRulesStore } from "../stores/anonymizationRules";
import { useDisplaySettingsStore } from "../stores/displaySettings";
import { useTransactionsStore } from "../stores/transactions";

const transactionsStore = useTransactionsStore();
const rulesStore = useAnonymizationRulesStore();
const displaySettingsStore = useDisplaySettingsStore();

const tableTransactions = computed(() => {
  const base = transactionsStore.anonymized.length > 0
    ? transactionsStore.anonymized
    : transactionsStore.maskedTransactions.length > 0
      ? transactionsStore.maskedTransactions
      : transactionsStore.transactions;
  return formatTransactions(base, displaySettingsStore.resolvedSettings);
});

const downloadData = computed(() => {
  if (transactionsStore.anonymized.length > 0) {
    return transactionsStore.anonymized;
  }
  if (transactionsStore.maskedTransactions.length > 0) {
    return transactionsStore.maskedTransactions;
  }
  return [];
});

async function onAnonymize(): Promise<void> {
  await transactionsStore.anonymize(rulesStore.rules);
  transactionsStore.setMaskedTransactions([...transactionsStore.anonymized]);
}

async function onSaveMasked(): Promise<void> {
  if (downloadData.value.length === 0) {
    return;
  }
  await transactionsStore.saveMasked(downloadData.value);
}

async function onPersist(): Promise<void> {
  if (downloadData.value.length === 0) {
    return;
  }
  await transactionsStore.persistMasked();
}

function onDownload(): void {
  if (downloadData.value.length === 0) {
    return;
  }
  const header = [
    "bank_name",
    "booking_account",
    "booking_date",
    "booking_text",
    "booking_type",
    "booking_amount",
  ];
  const rows = downloadData.value.map((tx) =>
    header.map((key) => {
      const value = tx[key as keyof typeof tx];
      return typeof value === "string" ? value.replace(/"/g, '""') : String(value ?? "");
    }),
  );
  const csv = [header.join(";"), ...rows.map((row) => row.join(";"))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "anonymisierte-umsaetze.csv";
  link.click();
  URL.revokeObjectURL(url);
}
</script>
