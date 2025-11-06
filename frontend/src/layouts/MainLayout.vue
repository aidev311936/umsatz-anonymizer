<template>
  <div class="flex min-h-screen">
    <aside class="app-sidebar hidden lg:flex" aria-label="Hauptnavigation">
      <div class="app-sidebar__header">
        <RouterLink to="/" aria-label="Startseite" class="app-logo">
          <img src="/logo.svg" alt="" />
        </RouterLink>
      </div>
      <nav class="app-sidebar__nav">
        <RouterLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="app-nav-link"
          :class="{ 'is-active': route.path.startsWith(item.to) }"
        >
          <component :is="item.icon" class="mr-3 h-5 w-5" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>
    <div class="flex min-h-screen flex-1 flex-col">
      <header class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 shadow-sm">
        <button class="menu-trigger lg:hidden">
          Menü
        </button>
        <div class="flex items-center gap-4">
          <RouterLink to="/" aria-label="Startseite" class="app-logo">
            <img src="/logo.svg" alt="" />
          </RouterLink>
          <div class="flex flex-col">
            <span class="text-base font-semibold text-slate-900">Dashboard</span>
            <div class="text-muted">
              <RouterView name="breadcrumbs" />
            </div>
          </div>
        </div>
        <button class="btn-primary" @click="$emit('logout')">
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
