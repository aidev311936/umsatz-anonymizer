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
              <td class="px-4 py-3">
                <span
                  class="block focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white"
                  tabindex="0"
                  @contextmenu="onCellContextMenu($event, tx, 'booking_text')"
                  @keydown="onCellKeydown($event, tx, 'booking_text')"
                >
                  {{ tx.booking_text }}
                </span>
              </td>
              <td class="px-4 py-3">
                <span
                  class="block focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white"
                  tabindex="0"
                  @contextmenu="onCellContextMenu($event, tx, 'booking_type')"
                  @keydown="onCellKeydown($event, tx, 'booking_type')"
                >
                  {{ tx.booking_type }}
                </span>
              </td>
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
  <Teleport to="body">
    <div
      v-if="contextMenu"
      ref="contextMenuRef"
      class="fixed z-30 w-64 rounded-lg border border-slate-200 bg-white shadow-xl focus:outline-none"
      :style="{ top: `${contextMenu.position.y}px`, left: `${contextMenu.position.x}px` }"
      role="menu"
      @keydown.esc.prevent="closeContextMenu()"
    >
      <button
        type="button"
        class="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        @click="startRuleDialogFromMenu"
      >
        Regel aus Auswahl erstellen
      </button>
    </div>
  </Teleport>
  <RuleCreationDialog
    :open="ruleDialogOpen"
    :selection="dialogSelection"
    @close="onDialogClose"
    @created="onRuleCreated"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import TransactionImportsPanel from "../components/TransactionImportsPanel.vue";
import RuleCreationDialog, { type RuleCreationSelection } from "../components/RuleCreationDialog.vue";
import { formatTransactions } from "../services/displayService";
import { useAnonymizationRulesStore } from "../stores/anonymizationRules";
import { useDisplaySettingsStore } from "../stores/displaySettings";
import { useTransactionsStore } from "../stores/transactions";
import type { UnifiedTx } from "../types";

const transactionsStore = useTransactionsStore();
const rulesStore = useAnonymizationRulesStore();
const displaySettingsStore = useDisplaySettingsStore();

interface ContextMenuState {
  position: { x: number; y: number };
  selectedText: string;
  field: keyof UnifiedTx;
  bookingHash?: string;
  trigger: HTMLElement | null;
}

const tableTransactions = computed<UnifiedTx[]>(() => {
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

const contextMenu = ref<ContextMenuState | null>(null);
const contextMenuRef = ref<HTMLElement | null>(null);
const ruleDialogOpen = ref(false);
const dialogSelection = ref<RuleCreationSelection | null>(null);
const lastTrigger = ref<HTMLElement | null>(null);

function getSelectionText(target: EventTarget | null): string {
  const selection = window.getSelection();
  if (!selection) {
    return "";
  }
  const text = selection.toString().trim();
  if (!text) {
    return "";
  }
  if (!(target instanceof Node)) {
    return text;
  }
  const { anchorNode, focusNode } = selection;
  if ((anchorNode && !target.contains(anchorNode)) || (focusNode && !target.contains(focusNode))) {
    return "";
  }
  return text;
}

function openContextMenu(
  trigger: HTMLElement | null,
  position: { x: number; y: number },
  selectedText: string,
  field: keyof UnifiedTx,
  bookingHash?: string,
): void {
  contextMenu.value = {
    position,
    selectedText,
    field,
    bookingHash,
    trigger,
  };
  nextTick(() => {
    contextMenuRef.value?.querySelector<HTMLElement>("button")?.focus();
  }).catch(() => undefined);
}

function closeContextMenu(restoreFocus = true): void {
  const trigger = contextMenu.value?.trigger ?? null;
  contextMenu.value = null;
  if (restoreFocus && trigger) {
    trigger.focus();
  }
}

function onCellContextMenu(event: MouseEvent, tx: UnifiedTx, field: keyof UnifiedTx): void {
  const selectedText = getSelectionText(event.currentTarget);
  if (!selectedText) {
    return;
  }
  event.preventDefault();
  openContextMenu(
    event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
    { x: event.clientX, y: event.clientY },
    selectedText,
    field,
    tx.booking_hash,
  );
}

function onCellKeydown(event: KeyboardEvent, tx: UnifiedTx, field: keyof UnifiedTx): void {
  const isContextKey = event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
  if (!isContextKey) {
    return;
  }
  const selectedText = getSelectionText(event.currentTarget);
  if (!selectedText) {
    return;
  }
  event.preventDefault();
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  const rect = target?.getBoundingClientRect();
  const position = rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height }
    : { x: 0, y: 0 };
  openContextMenu(target, position, selectedText, field, tx.booking_hash);
}

function startRuleDialogFromMenu(): void {
  if (!contextMenu.value) {
    return;
  }
  lastTrigger.value = contextMenu.value.trigger;
  dialogSelection.value = {
    selectedText: contextMenu.value.selectedText,
    field: contextMenu.value.field,
    bookingHash: contextMenu.value.bookingHash,
  };
  ruleDialogOpen.value = true;
  closeContextMenu(false);
}

function onDialogClose(): void {
  ruleDialogOpen.value = false;
  dialogSelection.value = null;
  nextTick(() => {
    lastTrigger.value?.focus();
  }).catch(() => undefined);
}

function onRuleCreated(): void {
  transactionsStore.refreshHistory();
}

function handleGlobalClick(event: MouseEvent): void {
  if (!contextMenu.value || !contextMenuRef.value) {
    return;
  }
  if (!contextMenuRef.value.contains(event.target as Node)) {
    closeContextMenu();
  }
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && contextMenu.value) {
    event.preventDefault();
    closeContextMenu();
  }
}

onMounted(() => {
  document.addEventListener("click", handleGlobalClick);
  document.addEventListener("keydown", handleGlobalKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleGlobalClick);
  document.removeEventListener("keydown", handleGlobalKeydown);
});
</script>
