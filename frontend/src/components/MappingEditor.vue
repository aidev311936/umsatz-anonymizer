<template>
  <div class="space-y-6">
    <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label class="flex items-center gap-3">
        <input
          v-model="withoutHeader"
          type="checkbox"
          class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span class="text-sm font-semibold text-slate-900">CSV ohne Kopfzeile</span>
      </label>
      <p class="mt-2 text-xs text-slate-500">
        Wenn keine Kopfzeile vorhanden ist, wählen Sie stattdessen die Spaltennummern (z. B. $1, $2, ...).
      </p>
    </div>
    <div v-for="field in fields" :key="field.key" class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-slate-900">{{ field.label }}</h3>
        <span class="text-xs text-slate-500">{{ selections[field.key].length }} Spalten</span>
      </div>
      <select
        :id="field.key"
        multiple
        class="mt-4 h-40 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        @change="onSelectionChange(field.key, $event)"
      >
        <option
          v-for="header in headerOptions"
          :key="header"
          :value="header"
          :selected="selections[field.key].includes(header)"
        >
          {{ header }}
        </option>
      </select>
      <div class="mt-2 text-xs text-slate-500">
        <template v-if="selections[field.key].length === 0">
          Mehrere Spalten auswählen, um sie zu kombinieren.
        </template>
        <template v-else>
          <span class="font-medium text-slate-600">Auswahlreihenfolge:</span>
          <ul class="mt-1 flex flex-wrap gap-1">
            <li
              v-for="(value, index) in selections[field.key]"
              :key="`${value}-${index}`"
              class="inline-flex items-center rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700"
            >
              {{ index + 1 }}. {{ value }}
            </li>
          </ul>
        </template>
      </div>
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
import type { MappingSelection } from "../types";

type SelectionField = Exclude<keyof MappingSelection, "booking_date_parse_format" | "without_header">;

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

const withoutHeader = computed({
  get: () => props.modelValue.without_header,
  set: (value: boolean) => {
    emitUpdated({ without_header: value });
  },
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

const headerOptions = computed(() => {
  if (!withoutHeader.value) {
    return [...props.headers];
  }

  const placeholderPattern = /^\$(\d+)$/;
  const selectedValues = new Set<string>();
  const usedPlaceholderIndices = new Set<number>();

  const registerValue = (value: string) => {
    selectedValues.add(value);
    const match = placeholderPattern.exec(value);
    if (!match) {
      return;
    }
    const index = Number.parseInt(match[1], 10);
    if (!Number.isNaN(index) && index > 0) {
      usedPlaceholderIndices.add(index);
    }
  };

  fields.forEach((field) => {
    selections[field.key].forEach(registerValue);
    props.modelValue[field.key].forEach(registerValue);
  });

  const maxSelectedPlaceholder =
    usedPlaceholderIndices.size > 0 ? Math.max(...usedPlaceholderIndices) : 0;
  const placeholderCount = Math.max(maxSelectedPlaceholder, props.headers.length, 5);
  const placeholders = Array.from({ length: placeholderCount }, (_value, idx) => `$${idx + 1}`);

  return Array.from(new Set<string>([...placeholders, ...selectedValues]));
});

function emitUpdated(patch: Partial<MappingSelection>): void {
  const next: MappingSelection = {
    booking_date: [...selections.booking_date],
    booking_text: [...selections.booking_text],
    booking_type: [...selections.booking_type],
    booking_amount: [...selections.booking_amount],
    booking_date_parse_format: props.modelValue.booking_date_parse_format,
    without_header: props.modelValue.without_header,
  };
  Object.assign(next, patch);
  emit("update:modelValue", next);
}

function onSelectionChange(field: SelectionField, event: Event): void {
  const target = event.target as HTMLSelectElement;
  const selected = Array.from(target.selectedOptions).map((option) => option.value);
  const preserved = selections[field].filter((value) => selected.includes(value));
  const newlySelected = selected.filter((value) => !preserved.includes(value));
  const ordered = [...preserved, ...newlySelected];
  selections[field] = ordered;
  emitUpdated({ [field]: ordered } as Partial<MappingSelection>);
}
</script>
