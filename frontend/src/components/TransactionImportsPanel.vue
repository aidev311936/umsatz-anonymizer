<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-slate-900">Bisherige anonymisierte Importe</h2>
      <button
        type="button"
        class="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        @click="$emit('refresh')"
      >
        Aktualisieren
      </button>
    </div>
    <p v-if="history.length === 0" class="mt-4 text-sm text-slate-500">
      Noch wurden keine anonymisierten Buchungen an den Server übertragen.
    </p>
    <div v-else class="mt-4 overflow-hidden rounded-xl border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead class="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" class="px-4 py-3">Bank</th>
            <th scope="col" class="px-4 py-3">Buchungskonto</th>
            <th scope="col" class="px-4 py-3">Importiert am</th>
            <th scope="col" class="px-4 py-3">Erste Buchung</th>
            <th scope="col" class="px-4 py-3">Letzte Buchung</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white text-slate-700">
          <tr v-for="entry in history" :key="`${entry.bank_name}-${entry.booking_account}-${entry.created_on}`">
            <td class="px-4 py-3 font-medium">{{ entry.bank_name }}</td>
            <td class="px-4 py-3">{{ entry.booking_account }}</td>
            <td class="px-4 py-3">{{ entry.created_on || '–' }}</td>
            <td class="px-4 py-3">{{ entry.first_booking_date }}</td>
            <td class="px-4 py-3">{{ entry.last_booking_date }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { TransactionImportSummary } from "../services/storageService";

defineProps<{
  history: TransactionImportSummary[];
}>();

defineEmits<{ refresh: [] }>();
</script>
