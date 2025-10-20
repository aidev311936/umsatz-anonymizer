<template>
  <div class="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-slate-900">Anzeigeeinstellungen</h2>
      <p class="mt-2 text-sm text-slate-600">Steuern Sie das Datums- und Betragsformat für Tabellenansichten.</p>
      <form class="mt-6 space-y-4" @submit.prevent="onSave">
        <div>
          <label for="date-format" class="block text-sm font-medium text-slate-700">Datumsformat</label>
          <input
            id="date-format"
            v-model="form.booking_date_display_format"
            type="text"
            placeholder="z. B. dd.MM.yyyy"
            class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label for="amount-format" class="block text-sm font-medium text-slate-700">Betragsformat</label>
          <input
            id="amount-format"
            v-model="form.booking_amount_display_format"
            type="text"
            placeholder="z. B. #.##0,00"
            class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          class="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
        >
          Einstellungen speichern
        </button>
      </form>
      <p v-if="statusMessage" class="mt-4 text-sm text-slate-500">{{ statusMessage }}</p>
      <p v-if="displaySettingsStore.error" class="mt-2 text-sm font-medium text-rose-600">{{ displaySettingsStore.error }}</p>
    </section>
    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-slate-900">Live-Vorschau</h2>
      <p class="mt-2 text-sm text-slate-600">Es werden die ersten 5 Transaktionen anhand der aktuellen Einstellungen angezeigt.</p>
      <div class="mt-6 overflow-hidden rounded-xl border border-slate-200">
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
            <tr v-for="tx in previewTransactions" :key="tx.booking_date + tx.booking_text">
              <td class="px-4 py-3 font-medium">{{ tx.booking_date }}</td>
              <td class="px-4 py-3">{{ tx.booking_text }}</td>
              <td class="px-4 py-3">{{ tx.booking_type }}</td>
              <td class="px-4 py-3">{{ tx.booking_amount }}</td>
            </tr>
            <tr v-if="previewTransactions.length === 0">
              <td colspan="4" class="px-4 py-6 text-center text-sm text-slate-500">Noch keine Transaktionen vorhanden.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watchEffect } from "vue";
import { formatTransactions, sanitizeSettings } from "../services/displayService";
import { useDisplaySettingsStore } from "../stores/displaySettings";
import { useTransactionsStore } from "../stores/transactions";
import type { DisplaySettings } from "../services/storageService";

const displaySettingsStore = useDisplaySettingsStore();
const transactionsStore = useTransactionsStore();
const statusMessage = ref("");

const form = reactive<DisplaySettings>(sanitizeSettings(displaySettingsStore.settings));

watchEffect(() => {
  Object.assign(form, sanitizeSettings(displaySettingsStore.settings));
});

const previewTransactions = computed(() => {
  const source = transactionsStore.transactions.slice(0, 5);
  return formatTransactions(source, form);
});

async function onSave(): Promise<void> {
  await displaySettingsStore.save({ ...form });
  statusMessage.value = "Anzeigeeinstellungen gespeichert.";
}
</script>
