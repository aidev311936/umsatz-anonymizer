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
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run start:backend`
   - Environment Variables:
     - `DATABASE_URL` – von Render bereitgestellte Verbindungs-URL
     - `PGSSLMODE` – `require`
     - `TOKEN_COOKIE_NAME` – optional (Default `umsatz_token`)
     - `AUTH_TOKEN_TTL` – optional Gültigkeitsdauer der Tokens in Sekunden (Default 86400)
     - `ALLOWED_ORIGINS` – Komma-separierte Liste der Frontend-URLs, die Cookies senden dürfen

3. **Migrationen einspielen**
   - Über Render „Shell“ oder lokal mit `psql` verbinden:
     ```bash
     psql "$DATABASE_URL" -f backend/db/001_init.sql
     ```
   - Alternativ kann eine Render „cron job“ oder ein separates Skript genutzt werden.

4. **Frontend deployen**
   - Statisches Hosting (z. B. Render Static Site) mit den Dateien aus `dist/` bzw. `index.html`.
   - Im HTML `<head>` eine Meta-Definition ergänzen, damit das Frontend weiß, wo das Backend läuft:
     ```html
     <meta name="backend-base-url" content="https://<your-backend-service>.onrender.com/api">
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
| `API_BASE_PATH`      | Optionaler Prefix (z. B. `/api`); Routen bleiben zusätzlich ohne Prefix erreichbar |
| `MAX_PAYLOAD`        | Optionales Limit für JSON-Bodies (z. B. `2mb`)           |

## Hinweis zu Storage-Initialisierung

Das Frontend ruft `initializeStorage()` nach erfolgreicher Authentifizierung auf. Die Funktion lädt Einstellungen, Bank-Mappings und Umsätze in einen In-Memory-Cache. Alle synchronen Storage-Methoden arbeiten gegen diesen Cache und senden Änderungen asynchron an das Backend (mit Fehler-Logging).
