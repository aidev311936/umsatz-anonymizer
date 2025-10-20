<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <div v-if="auth.loading && !auth.initialized" class="flex h-screen items-center justify-center">
      <span class="text-lg font-medium">Lade Anwendung …</span>
    </div>
    <TokenLogin v-else-if="!auth.isAuthenticated" />
    <MainLayout v-else @logout="handleLogout" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import TokenLogin from "./components/TokenLogin.vue";
import MainLayout from "./layouts/MainLayout.vue";
import { useAuthStore } from "./stores/auth";

const auth = useAuthStore();

onMounted(() => {
  void auth.initialize();
});

function handleLogout(): void {
  void auth.logout();
}
</script>
