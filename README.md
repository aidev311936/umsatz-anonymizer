# Umsatz Anonymizer

Ein webbasiertes Werkzeug zum Einlesen, Zuordnen und Normalisieren von Konto-Umsatz CSV-Dateien unterschiedlicher Banken.

## Features

- Upload von `.csv` Dateien mit automatischer Erkennung von Kodierung (UTF-8/Windows-1252) und Trennzeichen (`;`, `,`, `\t`).
- Spezielle Behandlung von comdirect Dateien inklusive Überspringen des zweispaltigen Vorspanns.
- Vorschau der ersten 200 Zeilen der Rohdaten.
- Interaktive Feldzuordnung per Mausklick mit Mehrfachauswahl und Sortierung für den Buchungstext.
- Normalisierung der Werte zu den vier Pflichtspalten `booking_date`, `booking_text`, `booking_type`, `booking_amount` inkl. Fehlerzähler.
- Export der normalisierten Daten als `normalized_transactions.csv` (UTF-8, Komma getrennt).
- Unit-Tests für Parser und Normalisierung (Vitest).

## Installation & Entwicklung

```bash
npm install
npm run dev
```

Der Entwicklungsserver startet standardmäßig unter <http://localhost:5173>.

## Produktion & Deployment

```bash
npm run build
```

Der Befehl erzeugt ein statisches Produktions-Bundle im Ordner `dist/`, das von jedem beliebigen Static-File-Host (z. B. GitHub Pages) bedient werden kann. Der bereitgestellte GitHub-Actions-Workflow `Deploy to GitHub Pages` baut das Projekt bei jedem Push auf den `main`-Branch, lädt das `dist/`-Artefakt hoch und veröffentlicht es über GitHub Pages.

Nach erfolgreicher Bereitstellung lädt die ausgelieferte Seite die kompilierten Assets aus `dist/assets/…` – ein direkter Verweis auf `/src/main.tsx` wird nicht mehr benötigt.

## Tests

```bash
npm test
```

## Projektstruktur (Auszug)

- `src/lib/csv/parse.ts` – CSV-Parsing inkl. Kodierungs- und Delimiter-Erkennung.
- `src/lib/normalize.ts` – Normalisierung der Datensätze und CSV-Export.
- `src/components` – React-Komponenten für Upload, Vorschau und Mapping.
- `fixtures/` – Beispiel-CSV-Dateien für Tests.
- `tests/` – Vitest-Spezifikationen für Parser und Normalisierung.

## Health-Endpunkt

Eine minimale Health-Check-Implementierung befindet sich in `src/server/health.ts` und kann bei Bedarf in eine Node-Umgebung eingebunden werden.
