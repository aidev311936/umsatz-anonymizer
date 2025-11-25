<template>
  <div class="space-y-8">
    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-slate-900">Anonymisierungsregeln</h2>
        <div class="flex gap-3">
          <input ref="importInput" type="file" accept="application/json" class="hidden" @change="onImportFile" />
          <button
            type="button"
            class="inline-flex items-center rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
            @click="openDialog('regex')"
          >
            Regex-Regel hinzufügen
          </button>
          <button
            type="button"
            class="inline-flex items-center rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
            @click="openDialog('mask')"
          >
            Maskierungsregel hinzufügen
          </button>
          <button
            type="button"
            class="inline-flex items-center rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
            @click="importInput?.click()"
          >
            Regeln importieren
          </button>
        </div>
      </div>
      <p class="mt-2 text-sm text-slate-600">
        Regeln werden in der angegebenen Reihenfolge ausgeführt. Aktivieren Sie nur die benötigten Einträge.
      </p>
      <div class="mt-6 space-y-4">
        <Disclosure v-for="rule in rules" :key="rule.id" v-slot="{ open }">
          <div class="rounded-xl border border-slate-200 bg-white shadow-sm">
            <DisclosureButton class="flex w-full items-center justify-between px-4 py-3 text-left">
              <div>
                <p class="text-sm font-semibold text-slate-900">{{ rule.id }}</p>
                <p class="text-xs text-slate-500">Typ: {{ rule.type }}</p>
              </div>
              <ChevronDownIcon :class="['h-4 w-4 transition-transform', open ? 'rotate-180' : '']" />
            </DisclosureButton>
            <DisclosurePanel class="border-t border-slate-200 px-4 py-4 text-sm">
              <div class="space-y-3">
                <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <input v-model="rule.enabled" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                  Aktiv
                </label>
                <div>
                  <label class="block text-xs font-medium text-slate-600">Regel-ID</label>
                  <input
                    v-model="rule.id"
                    type="text"
                    class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600">Felder</label>
                  <select
                    v-model="rule.fields"
                    multiple
                    class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="booking_text">Buchungstext</option>
                    <option value="booking_type">Buchungsart</option>
                  </select>
                </div>
                <div v-if="rule.type === 'regex'" class="grid gap-3 md:grid-cols-2">
                  <div>
                    <label class="block text-xs font-medium text-slate-600">Pattern</label>
                    <input
                      v-model="rule.pattern"
                      type="text"
                      class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-slate-600">Flags</label>
                    <input
                      v-model="rule.flags"
                      type="text"
                      class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div class="md:col-span-2">
                    <label class="block text-xs font-medium text-slate-600">Ersetzung</label>
                    <input
                      v-model="rule.replacement"
                      type="text"
                      class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div v-else class="grid gap-3 md:grid-cols-2">
                  <div>
                    <label class="block text-xs font-medium text-slate-600">Maskierungsstrategie</label>
                    <select
                      v-model="rule.maskStrategy"
                      class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="full">Komplett</option>
                      <option value="keepFirstLast">Erstes/letztes Zeichen behalten</option>
                      <option value="partialPercent">Prozentual</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-slate-600">Maskierungszeichen</label>
                    <input
                      v-model="rule.maskChar"
                      type="text"
                      maxlength="1"
                      class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-slate-600">Minimal-Länge</label>
                    <input
                      v-model.number="rule.minLen"
                      type="number"
                      min="0"
                      class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-slate-600">Maskierungsanteil</label>
                    <input
                      v-model.number="rule.maskPercent"
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div class="flex justify-between">
                  <button
                    type="button"
                    class="text-xs font-semibold text-rose-600 hover:text-rose-500"
                    @click="removeRule(rule.id)"
                  >
                    Löschen
                  </button>
                  <span class="text-xs text-slate-500">ID muss eindeutig sein.</span>
                </div>
              </div>
            </DisclosurePanel>
          </div>
        </Disclosure>
      </div>
      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          class="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          @click="reset"
        >
          Zurücksetzen
        </button>
        <button
          type="button"
          class="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
          @click="save"
        >
          Regeln speichern
        </button>
      </div>
      <p v-if="statusMessage" class="mt-4 text-sm text-slate-500">{{ statusMessage }}</p>
      <p v-if="rulesStore.error" class="mt-2 text-sm font-medium text-rose-600">{{ rulesStore.error }}</p>
    </section>
  </div>
  <RuleCreationDialog
    :open="ruleDialogOpen"
    :selection="dialogSelection"
    :default-type="dialogType"
    :current-rules="rules"
    @close="onDialogClose"
    @created="onRuleCreated"
  />
</template>

<script setup lang="ts">
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/vue";
import { ChevronDownIcon } from "@heroicons/vue/24/outline";
import { reactive, ref, watchEffect } from "vue";
import RuleCreationDialog, { type RuleCreationSelection } from "../components/RuleCreationDialog.vue";
import { useAnonymizationRulesStore } from "../stores/anonymizationRules";
import type { AnonRule } from "../services/storageService";

const rulesStore = useAnonymizationRulesStore();
const rules = reactive<AnonRule[]>([]);
const statusMessage = ref("");
const importInput = ref<HTMLInputElement | null>(null);
const ruleDialogOpen = ref(false);
const dialogSelection = ref<RuleCreationSelection | null>(null);
const dialogType = ref<"regex" | "mask">("regex");

function cloneRule(rule: AnonRule): AnonRule {
  return JSON.parse(JSON.stringify(rule)) as AnonRule;
}

watchEffect(() => {
  rules.splice(0, rules.length, ...rulesStore.rules.map((rule) => cloneRule(rule)));
});

void rulesStore.initialize();

function openDialog(type: "regex" | "mask"): void {
  dialogType.value = type;
  dialogSelection.value = { selectedText: "", field: "booking_text" };
  ruleDialogOpen.value = true;
}

function onDialogClose(): void {
  ruleDialogOpen.value = false;
  dialogSelection.value = null;
}

function onRuleCreated(rule: AnonRule): void {
  statusMessage.value = `Regel "${rule.id}" gespeichert.`;
  onDialogClose();
}

function removeRule(id: string): void {
  const index = rules.findIndex((rule) => rule.id === id);
  if (index >= 0) {
    rules.splice(index, 1);
  }
}

async function save(): Promise<void> {
  await rulesStore.save(rules.map((rule) => cloneRule(rule)));
  statusMessage.value = "Regeln gespeichert.";
}

function reset(): void {
  rules.splice(0, rules.length, ...rulesStore.rules.map((rule) => cloneRule(rule)));
  statusMessage.value = "Änderungen zurückgesetzt.";
}

async function onImportFile(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    return;
  }
  try {
    const raw = JSON.parse(await file.text());
    const result = await rulesStore.importRules(raw);
    if (result) {
      statusMessage.value = "Regeln importiert.";
      rules.splice(0, rules.length, ...result.map((rule) => cloneRule(rule)));
    } else {
      statusMessage.value = "Import fehlgeschlagen.";
    }
  } catch (error) {
    console.error("Import failed", error);
    statusMessage.value = "Datei konnte nicht gelesen werden.";
  } finally {
    if (target) {
      target.value = "";
    }
  }
}
</script>
