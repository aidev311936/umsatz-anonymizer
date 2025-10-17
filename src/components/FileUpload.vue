<template>
  <div>
    <label :for="id" class="block text-sm font-medium text-slate-700">{{ label }}</label>
    <div class="mt-2 flex items-center gap-4">
      <input
        :id="id"
        ref="inputRef"
        type="file"
        class="hidden"
        :accept="accept"
        @change="onFileChange"
      />
      <button
        type="button"
        class="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
        @click="inputRef?.click()"
      >
        Datei wählen
      </button>
      <span class="text-sm text-slate-600">{{ fileName || 'Keine Datei ausgewählt' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    label?: string;
    accept?: string;
    id?: string;
  }>(),
  {
    label: "CSV-Datei",
    accept: ".csv,text/csv",
    id: "file-upload",
  },
);

const emit = defineEmits<{
  "file-selected": [File];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const fileName = ref<string>("");

function onFileChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    fileName.value = file.name;
    emit("file-selected", file);
  }
}
</script>
