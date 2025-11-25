<template>
  <Teleport to="body">
    <div
      v-if="open && selection"
      class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4 py-8"
      @click.self="onClose"
    >
      <div
        ref="dialogRef"
        class="w-full max-w-2xl rounded-xl bg-white shadow-xl outline-none"
        role="dialog"
        :aria-labelledby="titleId"
        aria-modal="true"
        tabindex="-1"
        @keydown.esc.prevent="onClose"
      >
        <div class="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 :id="titleId" class="text-lg font-semibold text-slate-900">Regel aus Auswahl erstellen</h2>
            <p class="text-sm text-slate-600">Nutzen Sie die Auswahl als Basis für eine neue Regex-Regel.</p>
          </div>
          <button
            type="button"
            class="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            @click="onClose"
          >
            <span class="sr-only">Dialog schließen</span>
            ✕
          </button>
        </div>
        <form class="space-y-6 px-6 py-5" @submit.prevent="onSubmit">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              <p class="font-semibold text-slate-900">Ausgewählter Text</p>
              <p class="break-words text-slate-700">{{ selection.selectedText }}</p>
              <p class="mt-3 text-xs text-slate-500">Feld: {{ selectionFieldLabel }}</p>
              <p v-if="selection.bookingHash" class="text-xs text-slate-500">Hash: {{ selection.bookingHash }}</p>
            </div>
            <div class="space-y-3 text-sm text-slate-700">
              <label class="block text-xs font-medium text-slate-600">Regel-ID</label>
              <input
                v-model="ruleId"
                type="text"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="z.B. booking-text-phrase"
              />
              <p class="text-xs text-slate-500">Wird automatisch generiert, falls leer.</p>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="block text-xs font-medium text-slate-600">Pattern</label>
              <input
                v-model="pattern"
                type="text"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p class="mt-1 text-xs text-slate-500">Das ausgewählte Fragment wird automatisch maskierungsbereit escaped.</p>
            </div>
            <div class="grid gap-3 md:grid-cols-2">
              <div>
                <label class="block text-xs font-medium text-slate-600">Flags</label>
                <input
                  v-model="flags"
                  type="text"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="z.B. gi"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600">Ersetzung</label>
                <input
                  v-model="replacement"
                  type="text"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="***"
                />
              </div>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-slate-600">Felder</label>
            <div class="mt-2 grid gap-2 sm:grid-cols-2">
              <label
                v-for="option in fieldOptions"
                :key="option.value"
                class="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                <input
                  v-model="selectedFields"
                  type="checkbox"
                  :value="option.value"
                  class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                {{ option.label }}
              </label>
            </div>
          </div>

          <p v-if="saveError" class="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ saveError }}</p>

          <div class="flex justify-end gap-3">
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              @click="onClose"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              class="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
              :disabled="saving"
            >
              {{ saving ? "Speichern..." : "Regel speichern" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useAnonymizationRulesStore } from "../stores/anonymizationRules";
import type { AnonRule, UnifiedTx } from "../types";

export interface RuleCreationSelection {
  selectedText: string;
  field: keyof UnifiedTx;
  bookingHash?: string;
}

const props = defineProps<{ open: boolean; selection: RuleCreationSelection | null }>();
const emit = defineEmits<{ (e: "close"): void; (e: "created", value: AnonRule): void }>();

const rulesStore = useAnonymizationRulesStore();

const ruleId = ref("");
const pattern = ref("");
const replacement = ref("***");
const flags = ref("gi");
const selectedFields = ref<(keyof UnifiedTx)[]>([]);
const saveError = ref<string | null>(null);
const saving = ref(false);
const dialogRef = ref<HTMLDivElement | null>(null);
const titleId = "rule-creation-title";

const fieldOptions: { value: keyof UnifiedTx; label: string }[] = [
  { value: "booking_text", label: "Buchungstext" },
  { value: "booking_type", label: "Vorgang" },
];

const selectionFieldLabel = computed(() => {
  if (!props.selection) {
    return "";
  }
  const matched = fieldOptions.find((option) => option.value === props.selection?.field);
  return matched?.label ?? props.selection.field;
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}

function createDefaultId(selection: RuleCreationSelection): string {
  const snippet = selection.selectedText.trim().slice(0, 24).replace(/\s+/g, "-");
  const sanitizedSnippet = snippet.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
  const suffix = sanitizedSnippet ? `-${sanitizedSnippet}` : "";
  return `rule-${selection.field}${suffix}`;
}

function resetForm(): void {
  if (!props.selection) {
    return;
  }
  ruleId.value = createDefaultId(props.selection);
  pattern.value = escapeRegExp(props.selection.selectedText);
  replacement.value = "***";
  flags.value = "gi";
  selectedFields.value = [props.selection.field];
  saveError.value = null;
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && props.selection) {
      resetForm();
      nextTick(() => {
        dialogRef.value?.focus();
      }).catch(() => undefined);
    }
  },
);

async function onSubmit(): Promise<void> {
  if (!props.selection) {
    return;
  }
  if (selectedFields.value.length === 0) {
    saveError.value = "Bitte mindestens ein Feld auswählen.";
    return;
  }

  const newRule: AnonRule = {
    id: ruleId.value.trim() || createDefaultId(props.selection),
    fields: [...selectedFields.value],
    type: "regex",
    pattern: pattern.value,
    flags: flags.value.trim() || undefined,
    replacement: replacement.value,
    enabled: true,
  };

  saving.value = true;
  saveError.value = null;
  try {
    await rulesStore.initialize();
    await rulesStore.save([...rulesStore.rules, newRule]);
    emit("created", newRule);
    onClose();
  } catch (error) {
    saveError.value =
      error instanceof Error ? error.message : "Regel konnte nicht gespeichert werden.";
  } finally {
    saving.value = false;
  }
}

function onClose(): void {
  emit("close");
}
</script>
