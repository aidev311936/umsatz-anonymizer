<template>
  <Teleport to="body">
    <div
      v-if="open"
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
            <p class="text-sm text-slate-600">
              Nutzen Sie einen ausgewählten Originalwert, um eine Regex- oder Maskierungsregel anzulegen.
            </p>
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
            <div class="space-y-3 text-sm text-slate-700">
              <label class="block text-xs font-medium text-slate-600">Originalwert</label>
              <textarea
                v-model="originalValue"
                rows="3"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Markierter Text oder manuelle Eingabe"
              ></textarea>
              <p class="text-xs text-slate-500">Auswahl aus der Tabelle oder manuell eingeben.</p>
              <p v-if="selectionFieldLabel" class="text-xs text-slate-500">Feld: {{ selectionFieldLabel }}</p>
              <p v-if="selection?.bookingHash" class="text-xs text-slate-500">Hash: {{ selection.bookingHash }}</p>
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
            <div class="space-y-2">
              <label class="block text-xs font-medium text-slate-600">Regeltyp</label>
              <select
                v-model="ruleType"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="regex">Regex</option>
                <option value="mask">Maskierung</option>
              </select>
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
          </div>

          <div v-if="ruleType === 'regex'" class="grid gap-4 md:grid-cols-2">
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

          <div v-else class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="block text-xs font-medium text-slate-600">Maskierungsstrategie</label>
              <select
                v-model="maskStrategy"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="full">Komplett maskieren</option>
                <option value="keepFirstLast">Erstes/letztes Zeichen behalten</option>
                <option value="partialPercent">Prozentual maskieren</option>
              </select>
            </div>
            <div class="grid gap-3 md:grid-cols-2">
              <div>
                <label class="block text-xs font-medium text-slate-600">Maskierungszeichen</label>
                <input
                  v-model="maskChar"
                  type="text"
                  maxlength="1"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="•"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600">Minimale Länge</label>
                <input
                  v-model.number="minLen"
                  type="number"
                  min="0"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div class="md:col-span-2">
                <label class="block text-xs font-medium text-slate-600">Maskierungsanteil (0-1)</label>
                <input
                  v-model.number="maskPercent"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
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

const props = defineProps<{ open: boolean; selection?: RuleCreationSelection | null; defaultType?: "regex" | "mask" }>();
const emit = defineEmits<{ (e: "close"): void; (e: "created", value: AnonRule): void }>();

const rulesStore = useAnonymizationRulesStore();

const ruleId = ref("");
const ruleType = ref<"regex" | "mask">("regex");
const originalValue = ref("");
const pattern = ref("");
const replacement = ref("***");
const flags = ref("gi");
const selectedFields = ref<(keyof UnifiedTx)[]>([]);
const lastAutoPattern = ref("");
const maskStrategy = ref<"full" | "keepFirstLast" | "partialPercent">("partialPercent");
const maskChar = ref("•");
const minLen = ref(4);
const maskPercent = ref(0.5);
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

function createRuleIdWithFallback(): string {
  const prefix = ruleType.value === "mask" ? "mask" : "regex";
  return `${prefix}-${Date.now().toString(36)}`;
}

function updatePatternFromOriginal(): void {
  if (ruleType.value !== "regex") {
    return;
  }
  const escaped = escapeRegExp(originalValue.value);
  if (!pattern.value || pattern.value === lastAutoPattern.value) {
    pattern.value = escaped;
  }
  lastAutoPattern.value = escaped;
}

function createDefaultId(selection: RuleCreationSelection): string {
  const snippet = selection.selectedText.trim().slice(0, 24).replace(/\s+/g, "-");
  const sanitizedSnippet = snippet.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
  const suffix = sanitizedSnippet ? `-${sanitizedSnippet}` : "";
  return `rule-${selection.field}${suffix}`;
}

function resetForm(): void {
  const selection = props.selection;
  ruleType.value = props.defaultType ?? "regex";
  ruleId.value = selection ? createDefaultId(selection) : "";
  originalValue.value = selection?.selectedText ?? "";
  pattern.value = escapeRegExp(originalValue.value);
  lastAutoPattern.value = pattern.value;
  replacement.value = "***";
  flags.value = "gi";
  selectedFields.value = [selection?.field ?? "booking_text"];
  maskStrategy.value = "partialPercent";
  maskChar.value = "•";
  minLen.value = Math.max(selection?.selectedText.length ?? 0, 4);
  maskPercent.value = 0.5;
  saveError.value = null;
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      resetForm();
      nextTick(() => {
        dialogRef.value?.focus();
      }).catch(() => undefined);
    }
  },
);

watch(
  () => originalValue.value,
  () => {
    updatePatternFromOriginal();
  },
);

watch(
  () => ruleType.value,
  (type) => {
    if (type === "regex") {
      updatePatternFromOriginal();
    }
  },
);

async function onSubmit(): Promise<void> {
  if (selectedFields.value.length === 0) {
    saveError.value = "Bitte mindestens ein Feld auswählen.";
    return;
  }

  if (!originalValue.value.trim() && ruleType.value === "regex") {
    saveError.value = "Bitte einen Originalwert eingeben.";
    return;
  }

  if (ruleType.value === "regex" && !pattern.value.trim()) {
    saveError.value = "Bitte ein Pattern hinterlegen.";
    return;
  }

  if (ruleType.value === "mask" && !maskChar.value) {
    saveError.value = "Bitte ein Maskierungszeichen angeben.";
    return;
  }

  const newRule: AnonRule = {
    id:
      ruleId.value.trim() ||
      (props.selection ? createDefaultId(props.selection) : createRuleIdWithFallback()),
    fields: [...selectedFields.value],
    type: ruleType.value,
    ...(ruleType.value === "regex"
      ? {
          pattern: pattern.value,
          flags: flags.value.trim() || undefined,
          replacement: replacement.value,
        }
      : {
          maskStrategy: maskStrategy.value,
          maskChar: maskChar.value,
          minLen: minLen.value,
          maskPercent: maskPercent.value,
        }),
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
