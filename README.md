# Umsatz Anonymizer

Dieses Projekt kombiniert das bestehende Frontend mit einem neuen Express-basierten Backend, um Einstellungen, Bank-Mappings und Umsätze sicher über ein Token-geschütztes API zu verwalten.

## Projektüberblick

- **Frontend**: Statisches TypeScript/JavaScript-Frontend (`src/`), das über `initializeStorage()` auf das Backend zugreift und alle Anfragen mit `credentials: "include"` ausführt.
- **Backend**: Express-Anwendung unter `backend/`, die Token generiert/validiert und folgende Routen bereitstellt:
  - `POST /auth/token`, `POST /auth/session`, `POST /auth/logout`
  - `GET/PUT /settings`
  - `GET/POST /transactions`
  - `GET/POST /transactions/masked`
  - `GET/POST /bank-mapping`
  - `DELETE /storage`
- **Datenbank**: PostgreSQL-Migrationen in `backend/db/001_init.sql` erzeugen Tabellen, Trigger und Funktionen (`touch_user_token`).

## Entwicklung

```bash
npm install   # Installiert Abhängigkeiten (Express, pg, supertest ...)
npm run build # Baut das Frontend
npm run test  # Führt TypeScript-Build und node:test-Suite aus
npm run start:backend # Startet das Backend auf PORT (Default 8080)
```

> **Hinweis:** In offline-Umgebungen schlägt `npm install` fehl. Die Tests verwenden `supertest`; ohne Installation schlägt `npm run test` entsprechend fehl.

## Render.com Deployment

1. **PostgreSQL-Instanz anlegen**
   - Über das Render Dashboard eine „PostgreSQL“ Datenbank erstellen.
   - `DATABASE_URL` (inkl. Passwort) notieren.
   - Für SSL-Verbindungen `PGSSLMODE=require` setzen.

2. **Backend-Service konfigurieren**
   - Neuen „Web Service“ auf Render anlegen, Repository verbinden.
  - Pre-Deploy Command: `npm install --include=dev`
    - Render führt Builds mit `NODE_ENV=production` aus und überspringt dadurch standardmäßig Dev-Dependencies wie `vite`. Der Pre-Deploy-Schritt installiert sie explizit, bevor der eigentliche Build startet.
  - Build Command: `npm run build`
   - Start Command: `npm run start:backend`
   - Environment Variables:
     - `DATABASE_URL` – von Render bereitgestellte Verbindungs-URL
     - `PGSSLMODE` – `require`
     - `TOKEN_COOKIE_NAME` – optional (Default `umsatz_token`)
     - `AUTH_TOKEN_TTL` – optional Gültigkeitsdauer der Tokens in Sekunden (Default 86400)
     - `ALLOWED_ORIGINS` – Komma-separierte Liste der Frontend-URLs, die Cookies senden dürfen
     - `BACKEND_PUBLIC_ORIGIN` – optional, falls die öffentliche Backend-URL nicht automatisch erkannt wird (Render setzt `RENDER_EXTERNAL_URL` bereits passend)
     - `AUTH_COOKIE_SECURE` / `AUTH_COOKIE_SAMESITE` – optionale Overrides für Spezialfälle (z. B. Staging ohne HTTPS)

   > **Hinweis:** Sobald eine fremde Origin hinterlegt ist, setzt das Backend Cookies automatisch mit `Secure` + `SameSite=None`. Render liefert über `RENDER_EXTERNAL_URL` die eigene Service-URL, wodurch die Erkennung ohne weitere Konfiguration funktioniert.

3. **Migrationen einspielen**
   - Über Render „Shell“ oder lokal mit `psql` verbinden:
     ```bash
     psql "$DATABASE_URL" -f backend/db/001_init.sql
     ```
   - Alternativ kann eine Render „cron job“ oder ein separates Skript genutzt werden.

4. **Frontend deployen**
   - **Branch:** Wähle beim Render-Webservice den Branch `codex/set-up-vite-with-vue-and-tailwind-css` (bzw. den für den Vue-Umstieg verwendeten Feature-Branch). Die Anwendung lebt vollständig im Repository-Wurzelverzeichnis, daher bleibt das Feld **Root Directory** leer.
   - **Build Command:** `npm install --include=dev && npm run build` – so installiert Render auch Dev-Dependencies (Vite) bevor der Produktionsbuild startet. Setze zusätzlich `NPM_CONFIG_PRODUCTION=false` in den Environment Variables, damit zukünftige Builds nicht erneut scheitern.
   - **Start Command:** `npm run start:auth` – der Auth-Service dient gleichzeitig die Dateien aus `dist/` aus. Stelle sicher, dass der Build-Schritt (`npm run build`) vor dem Start erfolgreich war.
   - Falls du das Frontend getrennt hosten möchtest (z. B. Render Static Site), kannst du weiterhin die Dateien aus `dist/` verwenden. Ergänze in diesem Fall im HTML `<head>` eine Meta-Definition, damit das Frontend weiß, wo das Backend läuft:
     ```html
     <meta name="backend-base-url" content="https://<your-backend-service>.onrender.com">
     ```
   - Alternativ `window.BACKEND_BASE_URL` vor Laden des Bundles setzen.

5. **Smoke-Test**
   - Token über `/auth/token` generieren (Render Dashboard oder Postman).
   - Frontend aufrufen, `initializeStorage()` lädt Einstellungen und Umsätze aus dem Backend.

## Tests

`backend/__tests__/app.test.js` enthält node:test-basierte Supertest-Suites, die u. a. prüfen:

- Token-Generierung und Cookie-Handling
- Authentifizierungs-Pflicht für `/settings`
- Validierung der `/transactions`-Payloads

Zum Ausführen: `npm run test` (nach erfolgreichem `npm install`).

## Backend-Umgebungsvariablen

| Variable             | Beschreibung                                             |
| -------------------- | -------------------------------------------------------- |
| `PORT`               | Port für das Express-Backend (Default 8080)              |
| `DATABASE_URL`       | PostgreSQL-Verbindungszeichenkette                       |
| `PGSSLMODE`          | Für Render `require`, aktiviert SSL                      |
| `TOKEN_COOKIE_NAME`  | Name des Auth-Cookies (Default `umsatz_token`)           |
| `AUTH_TOKEN_TTL`     | Token-Gültigkeit in Sekunden (min. 60, Default 86400)    |
| `ALLOWED_ORIGINS`    | Komma-separierte Liste erlaubter Origins für CORS        |
| `BACKEND_PUBLIC_ORIGIN` | Optional: Öffentliche Origin des Backends (falls automatische Erkennung über `RENDER_EXTERNAL_URL`/Host-Header nicht möglich) |
| `API_BASE_PATH`      | Optionaler Prefix (z. B. `/api`); Routen bleiben zusätzlich ohne Prefix erreichbar |
| `MAX_PAYLOAD`        | Optionales Limit für JSON-Bodies (z. B. `2mb`)           |
| `AUTH_COOKIE_SECURE` | Optionaler Override (`true`/`false`) für das `Secure`-Flag des Auth-Cookies |
| `AUTH_COOKIE_SAMESITE` | Optionaler Override (`lax`/`strict`/`none`) für `SameSite` des Auth-Cookies |

## Hinweis zu Storage-Initialisierung

Das Frontend ruft `initializeStorage()` nach erfolgreicher Authentifizierung auf. Die Funktion lädt Einstellungen, Bank-Mappings und Umsätze in einen In-Memory-Cache. Alle synchronen Storage-Methoden arbeiten gegen diesen Cache und senden Änderungen asynchron an das Backend (mit Fehler-Logging).
