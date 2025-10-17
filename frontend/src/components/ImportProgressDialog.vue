<template>
  <transition enter-active-class="transition duration-200" enter-from-class="opacity-0" leave-active-class="transition duration-150" leave-to-class="opacity-0">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 class="text-lg font-semibold text-slate-900">Import läuft</h3>
        <p class="mt-2 text-sm text-slate-600">{{ message }}</p>
        <div class="mt-6">
          <div class="h-2 rounded-full bg-slate-200">
            <div class="h-2 rounded-full bg-indigo-500 transition-all" :style="{ width: `${progress}%` }"></div>
          </div>
          <p class="mt-2 text-xs text-slate-500">{{ progress.toFixed(0) }} % abgeschlossen</p>
        </div>
        <slot />
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    visible: boolean;
    progress?: number;
    message?: string;
  }>(),
  {
    progress: 0,
    message: "Die CSV-Datei wird verarbeitet…",
  },
);
</script>
