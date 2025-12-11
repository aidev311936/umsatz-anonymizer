<template>
  <div>
    <label :for="id" class="block text-sm font-medium text-slate-700">{{ label }}</label>
    <div
      class="mt-2 rounded-lg border-2 border-dashed p-6 transition-colors"
      :class="dropZoneClass"
      @drop.prevent="handleDrop"
      @dragover.prevent="isDragOver = true"
      @dragleave="isDragOver = false"
    >
      <div class="flex flex-col items-center gap-4">
        <input
          :id="id"
          ref="inputRef"
          type="file"
          class="hidden"
          :accept="accept"
          @change="onFileChange"
        />
        <div class="flex items-center gap-4">
          <button
            type="button"
            class="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
            @click="inputRef?.click()"
          >
            Datei wählen
          </button>
          <span class="text-sm text-slate-600">{{ fileName || 'Keine Datei ausgewählt' }}</span>
        </div>
        <p class="text-xs text-slate-500 text-center">
          oder ziehen Sie eine CSV-Datei hierher
        </p>
        <p v-if="errorMessage" class="text-sm font-medium text-rose-600">{{ errorMessage }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

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
const isDragOver = ref<boolean>(false);
const errorMessage = ref<string>("");

const dropZoneClass = computed(() => ({
  "border-indigo-400 bg-indigo-50": isDragOver.value,
  "border-slate-300 bg-white": !isDragOver.value,
}));

function validateFile(file: File): boolean {
  errorMessage.value = "";
  
  // Check file type
  const validTypes = [".csv", "text/csv", "application/csv"];
  const fileType = file.type;
  const fileExtension = file.name.split(".").pop()?.toLowerCase();
  
  if (fileType !== "text/csv" && fileType !== "application/csv" && fileExtension !== "csv") {
    errorMessage.value = "Bitte wählen Sie eine CSV-Datei aus.";
    return false;
  }
  
  return true;
}

function processFile(file: File): void {
  if (validateFile(file)) {
    fileName.value = file.name;
    emit("file-selected", file);
  }
}

function onFileChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    processFile(file);
  }
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    processFile(file);
    // Reset the file input to allow re-selecting the same file
    if (inputRef.value) {
      inputRef.value.value = "";
    }
  }
}
</script>
