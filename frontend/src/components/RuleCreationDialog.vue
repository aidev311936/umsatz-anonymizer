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
          <div class="space-y-4">
            <div class="space-y-3 text-sm text-slate-700">
              <label class="block text-xs font-medium text-slate-600">Originalwert</label>
              <textarea
                v-model="originalValue"
                rows="3"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Markierter Text oder manuelle Eingabe"
              ></textarea>
            </div>

            <div class="space-y-3 text-sm text-slate-700">
              <label class="block text-xs font-medium text-slate-600">Ersetzung</label>
              <input
                v-model="replacement"
                type="text"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="***"
              />
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

const props = defineProps<{
  open: boolean;
  selection?: RuleCreationSelection | null;
  currentRules?: AnonRule[];
}>();
const emit = defineEmits<{ (e: "close"): void; (e: "created", value: AnonRule): void }>();

const rulesStore = useAnonymizationRulesStore();

const ruleId = ref("");
const originalValue = ref("");
const pattern = ref("");
const replacement = ref("***");
const flags = ref("gi");
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

function createRuleIdWithFallback(): string {
  return `regex-${Date.now().toString(36)}`;
}

function createDefaultId(selection: RuleCreationSelection): string {
  const snippet = selection.selectedText.trim().slice(0, 24).replace(/\s+/g, "-");
  const sanitizedSnippet = snippet.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
  const suffix = sanitizedSnippet ? `-${sanitizedSnippet}` : "";
  return `rule-${selection.field}${suffix}`;
}

function generateUniqueRuleId(baseId: string, existingRules: AnonRule[]): string {
  const existingIds = new Set(existingRules.map((rule) => rule.id));
  if (!existingIds.has(baseId)) {
    return baseId;
  }
  let counter = 1;
  let candidate = `${baseId}-${counter}`;
  while (existingIds.has(candidate)) {
    counter += 1;
    candidate = `${baseId}-${counter}`;
  }
  return candidate;
}

function resetForm(): void {
  const selection = props.selection;
  ruleId.value = selection ? createDefaultId(selection) : createRuleIdWithFallback();
  originalValue.value = selection?.selectedText ?? "";
  pattern.value = originalValue.value;
  replacement.value = "***";
  flags.value = "gi";
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
  (value) => {
    pattern.value = value;
  },
);

async function onSubmit(): Promise<void> {
  if (!originalValue.value.trim()) {
    saveError.value = "Bitte einen Originalwert eingeben.";
    return;
  }

  if (!replacement.value.trim()) {
    saveError.value = "Bitte eine Ersetzung eingeben.";
    return;
  }

  const targetField = props.selection?.field ?? "booking_text";

  const baseId = ruleId.value.trim() || (props.selection ? createDefaultId(props.selection) : createRuleIdWithFallback());

  saving.value = true;
  saveError.value = null;
  try {
    await rulesStore.initialize();
    const baseRules = props.currentRules ?? rulesStore.rules;
    const newRule: AnonRule = {
      id: generateUniqueRuleId(baseId, baseRules),
      fields: [targetField],
      type: "regex",
      pattern: pattern.value,
      flags: flags.value,
      replacement: replacement.value,
      enabled: true,
    };
    await rulesStore.save([...baseRules, newRule]);
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
