# Umsatz Anonymizer

Dieses Repository beherbergt zwei voneinander getrennte Anwendungen:

- **`frontend/`** – eine Vue-3/Vite-Anwendung, die die Oberfläche des Umsatz Anonymizers darstellt.
- **`backend/`** – eine Express-API mit PostgreSQL-Anbindung, die Tokens, Einstellungen und Umsätze verwaltet.

Durch die Trennung in eigene Ordner können Frontend und Backend auf Render.com (oder anderen Plattformen) mit unterschiedlichen
Root-Directories betrieben werden.

## Lokale Entwicklung

> Voraussetzung: Node.js 18+ sowie eine PostgreSQL-Instanz für das Backend.

### Frontend (`frontend/`)

```bash
cd frontend
npm install
npm run dev          # startet Vite auf http://localhost:5173
npm run build        # erzeugt den Produktionsbuild in dist/
npm run serve        # startet den Produktionsserver (nutzt die PORT-Variable)
```

### Backend (`backend/`)

```bash
cd backend
npm install
npm run start        # startet die Express-API auf PORT (Standard: 8080)
npm run test         # führt die node:test-Suite aus
```

Zum Initialisieren der Datenbank werden die SQL-Skripte aus `backend/db/` benötigt:

```bash
psql "$DATABASE_URL" -f backend/db/001_init.sql
```

## Tests

Die automatisierten Tests liegen vollständig im Backend (`backend/__tests__/`). Sie lassen sich entweder direkt im Backend-Ordner
oder aus dem Repository-Wurzelverzeichnis ausführen:

```bash
npm run test --workspace backend
```

## Render.com Deployment

### 1. PostgreSQL-Datenbank anlegen

- Im Render-Dashboard eine „PostgreSQL“ Instanz erstellen.
- `DATABASE_URL` notieren und optional `PGSSLMODE=require` setzen.
- Migrationen einspielen:
  ```bash
  psql "$DATABASE_URL" -f backend/db/001_init.sql
  ```

### 2. Backend als Web Service deployen

- **Root Directory:** `backend`
- **Build Command:** `npm install --omit=dev`
- **Start Command:** `npm run start`
- **Environment Variables:**
  - `DATABASE_URL` – von Render bereitgestellte Verbindungs-URL
  - `PGSSLMODE=require` – empfohlen, damit TLS-Verbindungen akzeptiert werden
  - `TOKEN_COOKIE_NAME`, `AUTH_TOKEN_TTL`, `ALLOWED_ORIGINS`, `BACKEND_PUBLIC_ORIGIN`, `AUTH_COOKIE_SECURE`,
    `AUTH_COOKIE_SAMESITE` – optional gemäß Bedarf

Render leitet `PORT` automatisch ein; der Backend-Server liest diesen Wert und lauscht auf dem gewünschten Port.

### 3. Frontend bereitstellen

Das gebaute Frontend besteht aus statischen Dateien. Zwei Varianten haben sich bewährt:

#### Variante A: Render Static Site (empfohlen)

- **Root Directory:** `frontend`
- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `dist`
- Optional in den „Advanced Settings“ eine Umgebungsvariable `VITE_BACKEND_BASE_URL` (oder `BACKEND_BASE_URL` für die
  Laufzeit-Konfiguration) hinterlegen, falls das Backend unter einer anderen Domain erreichbar ist (siehe unten).

#### Variante B: Render Web Service

Falls ein dedizierter Web Service bevorzugt wird:

- **Root Directory:** `frontend`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm run serve`

Der Befehl `npm run serve` nutzt intern `vite preview` und respektiert die von Render gesetzte `PORT`-Variable (`0.0.0.0` als Host).

### 4. Frontend mit Backend verbinden

Damit das Frontend weiß, wo das Backend läuft, gibt es mehrere Optionen:

- Über eine Vite-Umgebungsvariable (`VITE_BACKEND_BASE_URL`) die URL bereits zur Build-Zeit setzen – wird automatisch in
  `index.html` eingetragen.
- Im HTML `<head>` optional eine Meta-Angabe setzen (z. B. über das Render Dashboard unter „Environment Variables" →
  `FRONTEND_META` und anschließende Template-Erweiterung):
  ```html
  <meta name="backend-base-url" content="https://<backend-service>.onrender.com">
  ```
- Alternativ `window.BACKEND_BASE_URL` oder `BACKEND_BASE_URL` (als Environment Variable) vor dem Laden des Bundles definieren.
- Für lokale Entwicklung kann auch ein Proxy in `vite.config.ts` eingerichtet werden.

## Repository-Root-Skripte

Im Projektwurzelverzeichnis existiert ein kleines Workspace-Setup, das häufige Aufgaben bündelt:

```bash
npm run dev            # alias für frontend/dev
npm run build          # alias für frontend/build
npm run test           # alias für backend/test
npm run start:backend  # alias für backend/start
```

Damit lassen sich Frontend und Backend weiterhin gemeinsam steuern, während die Deployment-Konfiguration getrennte Root-Directories
nutzen kann.
