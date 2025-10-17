<template>
  <div class="space-y-6">
    <div v-for="field in fields" :key="field.key" class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-slate-900">{{ field.label }}</h3>
        <span class="text-xs text-slate-500">{{ selections[field.key].length }} Spalten</span>
      </div>
      <select
        :id="field.key"
        multiple
        class="mt-4 h-40 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        :value="selections[field.key]"
        @change="onSelectionChange(field.key, $event)"
      >
        <option v-for="header in headers" :key="header" :value="header">{{ header }}</option>
      </select>
      <p class="mt-2 text-xs text-slate-500">
        Mehrere Spalten auswählen, um sie zu kombinieren. Die Reihenfolge entspricht der Auswahlreihenfolge.
      </p>
    </div>
    <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label for="booking-date-parse" class="block text-sm font-semibold text-slate-900">
        Datumsformat (Import)
      </label>
      <input
        id="booking-date-parse"
        v-model="dateParseFormat"
        type="text"
        placeholder="z. B. dd.MM.yyyy"
        class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import type { MappingSelection } from "../services/importService";

type SelectionField = Exclude<keyof MappingSelection, "booking_date_parse_format">;

const props = defineProps<{
  headers: string[];
  modelValue: MappingSelection;
}>();

const emit = defineEmits<{
  "update:modelValue": [MappingSelection];
}>();

const fields = [
  { key: "booking_date" as const, label: "Buchungsdatum" },
  { key: "booking_text" as const, label: "Buchungstext" },
  { key: "booking_type" as const, label: "Buchungsart" },
  { key: "booking_amount" as const, label: "Betrag" },
];

const selections = reactive<Record<SelectionField, string[]>>({
  booking_date: [...props.modelValue.booking_date],
  booking_text: [...props.modelValue.booking_text],
  booking_type: [...props.modelValue.booking_type],
  booking_amount: [...props.modelValue.booking_amount],
});

const dateParseFormat = computed({
  get: () => props.modelValue.booking_date_parse_format,
  set: (value: string) => {
    emitUpdated({ booking_date_parse_format: value });
  },
});

watch(
  () => props.modelValue,
  (value) => {
    selections.booking_date = [...value.booking_date];
    selections.booking_text = [...value.booking_text];
    selections.booking_type = [...value.booking_type];
    selections.booking_amount = [...value.booking_amount];
  },
  { deep: true },
);

function emitUpdated(patch: Partial<MappingSelection>): void {
  const next: MappingSelection = {
    booking_date: [...selections.booking_date],
    booking_text: [...selections.booking_text],
    booking_type: [...selections.booking_type],
    booking_amount: [...selections.booking_amount],
    booking_date_parse_format: props.modelValue.booking_date_parse_format,
  };
  Object.assign(next, patch);
  emit("update:modelValue", next);
}

function onSelectionChange(field: SelectionField, event: Event): void {
  const target = event.target as HTMLSelectElement;
  const selected = Array.from(target.selectedOptions).map((option) => option.value);
  selections[field] = selected;
  emitUpdated({ [field]: selected } as Partial<MappingSelection>);
}
</script>
