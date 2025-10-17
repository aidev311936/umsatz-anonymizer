<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-16">
    <div class="w-full max-w-md rounded-2xl bg-white p-10 shadow-xl">
      <h1 class="text-2xl font-semibold text-slate-900">Umsatz Anonymizer</h1>
      <p class="mt-2 text-sm text-slate-600">
        Bitte geben Sie Ihr Zugriffstoken ein, um das Tool zu verwenden.
      </p>
      <form class="mt-8 space-y-6" @submit.prevent="onSubmit">
        <div>
          <label for="token" class="block text-sm font-medium text-slate-700">Token</label>
          <input
            id="token"
            v-model="token"
            type="password"
            required
            autocomplete="off"
            class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div class="flex items-center justify-between">
          <button
            type="submit"
            class="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <span v-if="auth.loading" class="mr-2 inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
            Anmelden
          </button>
          <button
            type="button"
            class="text-sm font-medium text-indigo-600 hover:text-indigo-500"
            @click="onRequestToken"
          >
            Neues Token anfordern
          </button>
        </div>
        <p v-if="errorMessage" class="text-sm font-medium text-rose-600">{{ errorMessage }}</p>
        <p v-if="auth.lastValidation?.message" class="text-sm text-slate-500">
          {{ auth.lastValidation.message }}
        </p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const token = ref("");

const errorMessage = computed(() => auth.error);

async function onSubmit(): Promise<void> {
  try {
    await auth.login(token.value.trim());
  } catch {
    // Fehler wird bereits im Store gesetzt.
  }
}

async function onRequestToken(): Promise<void> {
  await auth.requestToken();
}
</script>
