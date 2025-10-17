import { defineStore } from "pinia";
import {
  AuthError,
  ensureAuthenticated,
  logout as performLogout,
  requestNewToken,
  validateToken,
  type TokenValidationResult,
} from "../auth";

interface AuthState {
  token: string | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  lastValidation: TokenValidationResult | null;
}

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({
    token: null,
    loading: false,
    error: null,
    initialized: false,
    lastValidation: null,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
  },
  actions: {
    async initialize(): Promise<void> {
      if (this.initialized) {
        return;
      }
      this.loading = true;
      this.error = null;
      try {
        const token = await ensureAuthenticated();
        this.token = token;
        this.initialized = true;
      } catch (error) {
        if (!(error instanceof AuthError) || error.code !== "NO_TOKEN") {
          this.error =
            error instanceof Error ? error.message : "Unbekannter Authentifizierungsfehler";
        }
        this.token = null;
        this.initialized = true;
      } finally {
        this.loading = false;
      }
    },
    async login(token: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const validation = await validateToken(token);
        this.token = validation.token;
        this.lastValidation = validation;
      } catch (error) {
        this.token = null;
        if (error instanceof AuthError) {
          if (error.code === "INVALID_TOKEN") {
            this.error = "Ungültiges Token";
          } else if (error.code === "NETWORK_ERROR") {
            this.error = "Netzwerkfehler. Bitte erneut versuchen.";
          } else {
            this.error = error.message;
          }
        } else {
          this.error = error instanceof Error ? error.message : "Unbekannter Fehler";
        }
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async logout(): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        await performLogout();
      } finally {
        this.token = null;
        this.lastValidation = null;
        this.loading = false;
      }
    },
    async requestToken(): Promise<TokenValidationResult | null> {
      this.loading = true;
      this.error = null;
      try {
        const result = await requestNewToken();
        if (result.token) {
          this.token = result.token;
        }
        this.lastValidation = result;
        return result;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Token konnte nicht angefordert werden";
        return null;
      } finally {
        this.loading = false;
      }
    },
    clearError(): void {
      this.error = null;
    },
  },
});
