<template>
  <transition enter-active-class="transition duration-200" enter-from-class="opacity-0" leave-active-class="transition duration-150" leave-to-class="opacity-0">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4"
      @click.self="closable && emit('close')"
    >
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 class="text-lg font-semibold text-slate-900">{{ title }}</h3>
        <p v-if="message" class="mt-2 text-sm text-slate-600">{{ message }}</p>
        <p v-if="bankName" class="mt-2 text-sm text-slate-500">
          Bank: <span class="font-medium text-slate-700">{{ bankName }}</span>
        </p>
        <div class="mt-6">
          <div class="h-2 rounded-full bg-slate-200">
            <div class="h-2 rounded-full bg-indigo-500 transition-all" :style="{ width: `${progress}%` }"></div>
          </div>
          <p class="mt-2 text-xs text-slate-500">{{ progress.toFixed(0) }} % abgeschlossen</p>
        </div>
        <slot />
        <div v-if="closable" class="mt-4 flex justify-end">
          <button
            type="button"
            class="inline-flex items-center rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300"
            @click="emit('close')"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
const emit = defineEmits<{ (event: "close"): void }>();

withDefaults(
  defineProps<{
    visible: boolean;
    title?: string;
    progress?: number;
    message?: string;
    bankName?: string;
    closable?: boolean;
  }>(),
  {
    title: "Importstatus",
    progress: 0,
    message: "Die CSV-Datei wird verarbeitet…",
    bankName: "",
    closable: false,
  },
);
</script>
