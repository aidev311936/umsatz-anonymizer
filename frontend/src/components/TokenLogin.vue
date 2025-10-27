<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-16">
    <div class="w-full max-w-md rounded-2xl bg-white p-10 shadow-xl">
      <h1 class="text-2xl font-semibold text-slate-900">Umsatz Anonymizer</h1>
      <p class="mt-2 text-sm text-slate-600">
        Bitte geben Sie Ihr Zugriffstoken ein, um das Tool zu verwenden.
      </p>
      <form class="mt-8 space-y-8" @submit.prevent="onSubmit">
        <div class="space-y-6">
          <div class="rounded-xl border border-slate-200 bg-white/60 p-5 shadow-sm">
            <h2 class="text-sm font-semibold text-slate-700">Token manuell eingeben</h2>
            <label for="token" class="mt-3 block text-sm font-medium text-slate-700">Token</label>
            <input
              id="token"
              v-model="token"
              type="password"
              required
              autocomplete="off"
              class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div class="flex items-center gap-3 text-slate-400">
            <span class="h-px flex-1 bg-slate-200"></span>
            <span class="text-xs font-semibold uppercase tracking-wide">oder</span>
            <span class="h-px flex-1 bg-slate-200"></span>
          </div>
          <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-5">
            <h2 class="text-sm font-semibold text-slate-700">Token aus Datei laden</h2>
            <p class="mt-1 text-sm text-slate-500">
              Laden Sie eine Textdatei mit Ihrem Token hoch. Der Inhalt wird automatisch in das Feld übernommen.
            </p>
            <input
              type="file"
              accept=".txt,.token,text/plain"
              class="mt-4 block w-full cursor-pointer rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              @change="loadTokenFromFile"
            />
            <p v-if="fileError" class="mt-2 text-sm font-medium text-rose-600">{{ fileError }}</p>
          </div>
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
        <p v-if="downloadError" class="text-sm font-medium text-rose-600">{{ downloadError }}</p>
        <p v-if="auth.lastValidation?.message" class="text-sm text-slate-500">
          {{ auth.lastValidation.message }}
        </p>
      </form>
    </div>

    <div
      v-if="showTokenModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="modalTitleId"
      :aria-describedby="modalDescriptionId"
    >
      <div
        ref="modalRef"
        class="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl focus:outline-none"
        tabindex="-1"
        @keydown="onModalKeydown"
      >
        <div class="flex items-start justify-between">
          <div>
            <h2 :id="modalTitleId" class="text-xl font-semibold text-slate-900">
              Willkommen zurück!
            </h2>
            <p :id="modalDescriptionId" class="mt-2 text-sm text-slate-600">
              {{ auth.lastValidation?.message ?? "Ihr neues Token wurde erfolgreich erstellt." }}
            </p>
          </div>
        </div>
        <div class="mt-6 space-y-4 text-sm text-slate-600">
          <p>
            Ihr neues Zugriffstoken wurde heruntergeladen. Bitte bewahren Sie die Datei an einem sicheren Ort auf, da sie
            vertrauliche Informationen enthält.
          </p>
          <p>
            Sollten Sie den Download erneut benötigen, können Sie jederzeit ein weiteres Token anfordern. Das bisherige
            Token bleibt gültig, bis es ersetzt wird.
          </p>
        </div>
        <div class="mt-8 flex justify-end">
          <button
            ref="closeButtonRef"
            type="button"
            class="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            @click="closeModal"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useAuthStore } from "../stores/auth";

const TOKEN_DOWNLOAD_FILENAME = "token.txt";

const auth = useAuthStore();
const token = ref("");
const fileError = ref<string | null>(null);
const downloadError = ref<string | null>(null);
const showTokenModal = ref(false);
const modalRef = ref<HTMLDivElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
const previouslyFocusedElement = ref<HTMLElement | null>(null);

const modalTitleId = "token-modal-title";
const modalDescriptionId = "token-modal-description";

const errorMessage = computed(() => auth.error);

function openModal(): void {
  previouslyFocusedElement.value = document.activeElement as HTMLElement | null;
  showTokenModal.value = true;

  nextTick(() => {
    if (closeButtonRef.value) {
      closeButtonRef.value.focus();
    }
  });
}

function closeModal(): void {
  showTokenModal.value = false;

  nextTick(() => {
    previouslyFocusedElement.value?.focus();
    previouslyFocusedElement.value = null;
  });
}

function onModalKeydown(event: KeyboardEvent): void {
  if (!showTokenModal.value) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = modalRef.value?.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );

  if (!focusableElements || focusableElements.length === 0) {
    return;
  }

  const focusable = Array.from(focusableElements).filter((element) => !element.hasAttribute("disabled"));

  if (focusable.length === 0) {
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const isShiftPressed = event.shiftKey;
  const activeElement = document.activeElement as HTMLElement | null;

  if (!activeElement) {
    return;
  }

  if (!isShiftPressed && activeElement === last) {
    event.preventDefault();
    first.focus();
    return;
  }

  if (isShiftPressed && activeElement === first) {
    event.preventDefault();
    last.focus();
  }
}

async function onSubmit(): Promise<void> {
  downloadError.value = null;
  try {
    await auth.login(token.value.trim());
  } catch {
    // Fehler wird bereits im Store gesetzt.
  }
}

async function onRequestToken(): Promise<void> {
  downloadError.value = null;
  try {
    const result = await auth.requestToken();

    if (result?.token) {
      let url: string | null = null;
      const link = document.createElement("a");
      let downloadSucceeded = false;

      try {
        const blob = new Blob([result.token], { type: "text/plain" });
        url = URL.createObjectURL(blob);
        link.href = url;
        link.download = TOKEN_DOWNLOAD_FILENAME;
        document.body.appendChild(link);
        link.click();
        downloadSucceeded = true;
      } catch (error) {
        downloadError.value =
          error instanceof Error
            ? `Token konnte nicht als Datei gespeichert werden: ${error.message}`
            : "Token konnte nicht als Datei gespeichert werden.";
      } finally {
        if (link.parentNode) {
          link.remove();
        }
        if (url) {
          URL.revokeObjectURL(url);
        }
      }

      if (downloadSucceeded) {
        openModal();
      }
    }
  } catch (error) {
    downloadError.value =
      error instanceof Error
        ? `Token konnte nicht angefordert werden: ${error.message}`
        : "Token konnte nicht angefordert werden.";
  }
}

function loadTokenFromFile(event: Event): void {
  fileError.value = null;
  downloadError.value = null;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const content = typeof reader.result === "string" ? reader.result : "";
      const trimmed = content.trim();

      if (!trimmed) {
        fileError.value = "Die ausgewählte Datei enthält kein Token.";
        return;
      }

      token.value = trimmed;
      auth.clearError();
    } catch (error) {
      fileError.value =
        error instanceof Error
          ? `Token konnte nicht geladen werden: ${error.message}`
          : "Token konnte nicht aus der Datei geladen werden.";
    } finally {
      input.value = "";
    }
  };

  reader.onerror = () => {
    fileError.value = "Die Datei konnte nicht gelesen werden.";
    input.value = "";
  };

  reader.readAsText(file);
}
</script>
