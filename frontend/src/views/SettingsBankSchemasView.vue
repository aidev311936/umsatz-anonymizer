<template>
  <div class="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
    <aside class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-slate-900">Bank-Mappings</h2>
        <button
          type="button"
          class="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          @click="createNew"
        >
          Neu
        </button>
      </div>
      <p class="mt-2 text-sm text-slate-600">
        Wählen Sie eine Bank aus, um das vorhandene Mapping anzupassen.
      </p>
      <ul class="mt-4 space-y-2">
        <li v-for="mapping in bankMappingsStore.mappings" :key="mapping.bank_name">
          <button
            type="button"
            class="w-full rounded-lg px-3 py-2 text-left text-sm font-medium"
            :class="selectedBank === mapping.bank_name ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
            @click="selectMapping(mapping.bank_name)"
          >
            {{ mapping.bank_name }}
          </button>
        </li>
      </ul>
      <div class="mt-6">
        <input ref="importInput" type="file" accept="application/json" class="hidden" @change="onImportFile" />
        <button
          type="button"
          class="inline-flex items-center rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
          @click="importInput?.click()"
        >
          Mappings importieren
        </button>
      </div>
      <p v-if="statusMessage" class="mt-4 text-sm text-slate-500">{{ statusMessage }}</p>
      <p v-if="bankMappingsStore.error" class="mt-2 text-sm font-medium text-rose-600">
        {{ bankMappingsStore.error }}
      </p>
    </aside>
    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-slate-900">Mapping bearbeiten</h2>
      <div class="mt-4 space-y-4">
        <div>
          <label for="bank-name" class="block text-sm font-medium text-slate-700">Bankname</label>
          <input
            id="bank-name"
            v-model="selectedBank"
            type="text"
            class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <MappingEditor :headers="allHeaders" :model-value="formMapping" @update:modelValue="updateMapping" />
        <div class="flex justify-end">
          <button
            type="button"
            class="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
            :disabled="!selectedBank"
            @click="save"
          >
            Speichern
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watchEffect } from "vue";
import MappingEditor from "../components/MappingEditor.vue";
import { useBankMappingsStore } from "../stores/bankMappings";
import type { MappingSelection } from "../services/importService";

const bankMappingsStore = useBankMappingsStore();
const importInput = ref<HTMLInputElement | null>(null);
const statusMessage = ref("");

const selectedBank = ref("");
const formMapping = reactive<MappingSelection>({
  booking_date: [],
  booking_text: [],
  booking_type: [],
  booking_amount: [],
  booking_date_parse_format: "",
});

const selectableFields = ["booking_date", "booking_text", "booking_type", "booking_amount"] as const;

const allHeaders = computed(() => {
  const entries: string[] = [];

  const addUnique = (value: string) => {
    if (!entries.includes(value)) {
      entries.push(value);
    }
  };

  selectableFields.forEach((field) => {
    formMapping[field].forEach((header) => addUnique(header));
  });

  const mapping = selectedBank.value ? bankMappingsStore.mappingByBank(selectedBank.value) : undefined;
  if (mapping) {
    selectableFields.forEach((field) => {
      mapping[field].forEach((header) => addUnique(header));
    });
  }

  return entries;
});

function selectMapping(bank: string): void {
  const mapping = bankMappingsStore.mappingByBank(bank);
  if (mapping) {
    selectedBank.value = mapping.bank_name;
    formMapping.booking_date = [...mapping.booking_date];
    formMapping.booking_text = [...mapping.booking_text];
    formMapping.booking_type = [...mapping.booking_type];
    formMapping.booking_amount = [...mapping.booking_amount];
    formMapping.booking_date_parse_format = mapping.booking_date_parse_format;
  }
}

function createNew(): void {
  selectedBank.value = "";
  formMapping.booking_date = [];
  formMapping.booking_text = [];
  formMapping.booking_type = [];
  formMapping.booking_amount = [];
  formMapping.booking_date_parse_format = "";
}

async function save(): Promise<void> {
  if (!selectedBank.value) {
    return;
  }
  await bankMappingsStore.save({
    bank_name: selectedBank.value,
    booking_date: [...formMapping.booking_date],
    booking_text: [...formMapping.booking_text],
    booking_type: [...formMapping.booking_type],
    booking_amount: [...formMapping.booking_amount],
    booking_date_parse_format: formMapping.booking_date_parse_format,
  });
  statusMessage.value = `Mapping für ${selectedBank.value} gespeichert.`;
}

async function onImportFile(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    return;
  }
  const text = await file.text();
  try {
    const json = JSON.parse(text);
    const result = await bankMappingsStore.importMappings(json);
  statusMessage.value = result ? "Mappings importiert." : "Import fehlgeschlagen.";
  } catch (error) {
    console.error("Import failed", error);
    statusMessage.value = "Datei konnte nicht gelesen werden.";
  } finally {
    target.value = "";
  }
}

function updateMapping(value: MappingSelection): void {
  formMapping.booking_date = [...value.booking_date];
  formMapping.booking_text = [...value.booking_text];
  formMapping.booking_type = [...value.booking_type];
  formMapping.booking_amount = [...value.booking_amount];
  formMapping.booking_date_parse_format = value.booking_date_parse_format;
}

watchEffect(() => {
  if (bankMappingsStore.mappings.length > 0 && !selectedBank.value) {
    selectMapping(bankMappingsStore.mappings[0].bank_name);
  }
});
</script>
