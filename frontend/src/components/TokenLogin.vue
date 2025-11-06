<template>
  <div class="login-page">
    <div class="login-card">
      <a href="/" class="login-logo focus-brand" aria-label="Zur Startseite">
        <img src="/logo.svg" alt="Umsatz Anonymizer" />
      </a>
      <h1 class="text-2xl font-semibold">Umsatz Anonymizer</h1>
      <p class="mt-2 text-sm text-muted">
        Bitte geben Sie Ihr Zugriffstoken ein, um das Tool zu verwenden.
      </p>
      <form class="mt-8 space-y-8" @submit.prevent="onSubmit">
        <div class="space-y-6">
          <div class="login-section space-y-3">
            <h2 class="text-sm font-semibold">Token manuell eingeben</h2>
            <div class="form-field">
              <label for="token" class="block text-sm font-medium">Token</label>
              <input
                id="token"
                v-model="token"
                type="password"
                required
                autocomplete="off"
                class="w-full focus-brand"
              />
            </div>
          </div>
          <div class="flex items-center gap-3 text-muted">
            <span class="divider-line"></span>
            <span class="text-xs font-semibold uppercase tracking-wide">oder</span>
            <span class="divider-line"></span>
          </div>
          <div class="login-section upload-area">
            <h2 class="text-sm font-semibold">Token aus Datei laden</h2>
            <p class="mt-1 text-sm text-muted">
              Laden Sie eine Textdatei mit Ihrem Token hoch. Der Inhalt wird automatisch in das Feld übernommen.
            </p>
            <input
              type="file"
              accept=".txt,.token,text/plain"
              class="mt-4 block w-full cursor-pointer focus-brand"
              @change="loadTokenFromFile"
            />
            <p v-if="fileError" class="mt-2 text-sm font-medium text-rose-600">{{ fileError }}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3 sm:justify-between">
          <button
            type="submit"
            class="btn-primary focus-brand"
          >
            <span v-if="auth.loading" class="mr-2 inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
            Anmelden
          </button>
          <button
            type="button"
            class="btn-accent focus-brand"
            @click="onRequestToken"
          >
            Neues Token anfordern
          </button>
        </div>
        <p v-if="errorMessage" class="text-sm font-medium text-rose-600">{{ errorMessage }}</p>
        <p v-if="downloadError" class="text-sm font-medium text-rose-600">{{ downloadError }}</p>
        <p v-if="auth.lastValidation?.message" class="text-sm text-muted">
          {{ auth.lastValidation.message }}
        </p>
      </form>
    </div>

    <div
      v-if="showTokenModal"
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="modalTitleId"
      :aria-describedby="modalDescriptionId"
    >
      <div
        ref="modalRef"
        class="modal-card focus-brand"
        tabindex="-1"
        @keydown="onModalKeydown"
      >
        <div class="flex items-start justify-between">
          <div>
            <h2 :id="modalTitleId" class="text-xl font-semibold">
              {{ modalContext === "login" ? "Willkommen zurück!" : "Neues Token erstellt" }}
            </h2>
            <p :id="modalDescriptionId" class="mt-2 text-sm text-muted">
              {{
                modalContext === "login"
                  ? auth.lastValidation?.message ?? "Sie haben sich erfolgreich angemeldet."
                  : auth.lastValidation?.message ??
                      "Ihr neues Token steht bereit. Folgen Sie den nächsten Schritten, um es sicher zu speichern."
              }}
            </p>
          </div>
        </div>
        <div v-if="modalContext === 'login'" class="mt-6 space-y-4 text-sm text-muted">
          <p>Schön, dass Sie wieder da sind! Sie können die Anwendung jetzt wie gewohnt verwenden.</p>
        </div>
        <div v-else class="mt-6 space-y-4 text-sm text-muted">
          <p>
            Laden Sie Ihr neues Zugriffstoken als Datei herunter und bewahren Sie es an einem sicheren Ort auf. Das Token
            wird benötigt, um sich künftig anzumelden.
          </p>
          <p>
            Sollten Sie das Token verlieren, können Sie jederzeit ein neues anfordern. Beachten Sie, dass das bisherige
            Token gültig bleibt, bis es durch ein neues ersetzt wird.
          </p>
          <div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              class="btn-accent focus-brand"
              :disabled="!requestedToken"
              @click="downloadRequestedToken"
            >
              Token herunterladen
            </button>
            <p v-if="downloadError" class="text-sm font-medium text-rose-600">{{ downloadError }}</p>
          </div>
        </div>
        <div class="mt-8 flex justify-end">
          <button
            ref="closeButtonRef"
            type="button"
            class="btn-primary focus-brand"
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
const modalContext = ref<"login" | "token">("login");
const requestedToken = ref<string | null>(null);
const modalRef = ref<HTMLDivElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
const previouslyFocusedElement = ref<HTMLElement | null>(null);

const modalTitleId = "token-modal-title";
const modalDescriptionId = "token-modal-description";

const errorMessage = computed(() => auth.error);

function openModal(context: "login" | "token" = "login"): void {
  modalContext.value = context;
  previouslyFocusedElement.value = document.activeElement as HTMLElement | null;
  showTokenModal.value = true;

  nextTick(() => {
    if (closeButtonRef.value) {
      closeButtonRef.value.focus();
    }
  });
}

function closeModal(): void {
  const tokenToApply = modalContext.value === "token" ? requestedToken.value : null;

  showTokenModal.value = false;

  if (tokenToApply) {
    auth.applyToken(tokenToApply);
  }

  if (modalContext.value === "token") {
    requestedToken.value = null;
  }

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
    openModal("login");
  } catch {
    // Fehler wird bereits im Store gesetzt.
  }
}

async function onRequestToken(): Promise<void> {
  downloadError.value = null;
  try {
    const result = await auth.requestToken({ autoAuthenticate: false });

    if (result?.token) {
      requestedToken.value = result.token;
      openModal("token");
    }
  } catch (error) {
    downloadError.value =
      error instanceof Error
        ? `Token konnte nicht angefordert werden: ${error.message}`
        : "Token konnte nicht angefordert werden.";
  }
}

function downloadRequestedToken(): void {
  downloadError.value = null;

  if (!requestedToken.value) {
    downloadError.value = "Es ist kein Token zum Herunterladen vorhanden.";
    return;
  }

  let url: string | null = null;
  const link = document.createElement("a");

  try {
    const blob = new Blob([requestedToken.value], { type: "text/plain" });
    url = URL.createObjectURL(blob);
    link.href = url;
    link.download = TOKEN_DOWNLOAD_FILENAME;
    document.body.appendChild(link);
    link.click();
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
