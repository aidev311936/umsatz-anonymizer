<template>
  <div class="flex min-h-screen">
    <aside class="hidden w-72 flex-col bg-slate-900 text-slate-100 lg:flex">
      <div class="flex items-center justify-between px-6 py-6">
        <h2 class="text-lg font-semibold">Umsatz Anonymizer</h2>
      </div>
      <nav class="flex-1 space-y-1 px-4 py-4">
        <RouterLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-slate-800"
          :class="{ 'bg-indigo-600 text-white hover:bg-indigo-500': route.path.startsWith(item.to) }"
        >
          <component :is="item.icon" class="mr-3 h-5 w-5" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>
    <div class="flex min-h-screen flex-1 flex-col">
      <header class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 shadow-sm">
        <button class="lg:hidden inline-flex items-center rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
          Menü
        </button>
        <div class="flex flex-col">
          <span class="text-base font-semibold text-slate-900">Dashboard</span>
          <RouterView name="breadcrumbs" />
        </div>
        <button
          class="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-700"
          @click="$emit('logout')"
        >
          Abmelden
        </button>
      </header>
      <main class="flex-1 bg-slate-50 px-4 py-6 lg:px-10">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, RouterLink, RouterView } from "vue-router";
import { Bars3Icon, ArrowDownTrayIcon, Cog6ToothIcon, BanknotesIcon } from "@heroicons/vue/24/outline";
import { useAnonymizationRulesStore } from "../stores/anonymizationRules";
import { useBankMappingsStore } from "../stores/bankMappings";
import { useDisplaySettingsStore } from "../stores/displaySettings";
import { useTransactionsStore } from "../stores/transactions";

defineEmits<{
  logout: [];
}>();

const route = useRoute();

const navigation = computed(() => [
  { to: "/import", label: "CSV-Import", icon: ArrowDownTrayIcon },
  { to: "/transactions", label: "Transaktionen", icon: BanknotesIcon },
  { to: "/settings/bank-schemas", label: "Bank-Mappings", icon: Bars3Icon },
  { to: "/settings/anonymization", label: "Anonymisierung", icon: Cog6ToothIcon },
  { to: "/settings/display", label: "Anzeige", icon: Cog6ToothIcon },
]);

const displaySettingsStore = useDisplaySettingsStore();
const transactionsStore = useTransactionsStore();
const bankMappingsStore = useBankMappingsStore();
const rulesStore = useAnonymizationRulesStore();

onMounted(() => {
  void Promise.all([
    displaySettingsStore.initialize(),
    transactionsStore.initialize(),
    bankMappingsStore.initialize(),
    rulesStore.initialize(),
  ]);
});
</script>
