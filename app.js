// ------- Konfiguration -------
const API_URL = 'https://umsatz-api.onrender.com/categorize';

const fileInput      = document.getElementById('fileInput');
const anonymizeBtn   = document.getElementById('anonymizeBtn');
const categorizeBtn  = document.getElementById('categorizeBtn');
const statusEl       = document.getElementById('status');
const tableWrap      = document.getElementById('tableWrap');

let csvRows = [];                 // Array von Objekten (Zeilen)
let headers = [];                 // CSV-Header
let companyWhitelist = [];        // aus JSON geladen
let firstnamesWhitelist = [];        // aus JSON geladen

// ------- Utils -------
const setStatus = (msg) => (statusEl.textContent = msg || '');

function parseCSV(text) {
  // sehr einfacher CSV-Parser (Semikolon oder Komma). Für komplexe Felder ggf. PapaParse verwenden.
  const delim = text.includes(';') && !text.includes(',') ? ';' : ',';
  const lines = text.replace(/\r/g,'').split('\n').filter(l => l.trim() !== '');
  const hdr = lines[0].split(delim).map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const cells = line.split(delim);
    const obj = {};
    hdr.forEach((h,i)=> obj[h] = (cells[i] ?? '').trim());
    return obj;
  });
  return { headers: hdr, rows };
}

function renderTable(rows, hdrs) {
  if (!rows.length) { tableWrap.innerHTML = ''; return; }
  const columns = Array.from(new Set([...(hdrs||Object.keys(rows[0])), ...Object.keys(rows[0])]));
  const thead = `<thead><tr>${columns.map(h=>`<th>${h}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r=>`<tr>${
    columns.map(h=>`<td>${(r[h] ?? '')}</td>`).join('')
  }</tr>`).join('')}</tbody>`;
  tableWrap.innerHTML = `<table>${thead}${tbody}</table>`;
}

// ------- Firmen-/Personen-Erkennung -------
function loadWhitelist(filename) {
  return fetch(filename, { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error('Whitelist konnte nicht geladen werden');
      return r.json();
    })
    .then(arr => {
      whitelist = (arr || []).map(s => String(s).toLowerCase());
    })
    .catch(() => { whitelist = []; });
}

function loadCompanyWhitelist() {
  return loadWhitelist('company_whitelist.json');
}

function loadFirstnameWhitelist() {
  return loadWhitelist('firstname_whitelist.json');
}

function looksLikeCompany(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  // Whitelist-Schlagwörter
  if (companyWhitelist.some(w => t.includes(w))) return true;
  // Zahl/Bestellnummer/Hashtag/Slash etc. deuten meist auf Händler
  if (/[0-9#/*\\]/.test(t)) return true;
  // UPPERCASE > 70% Zeichen → oft Händler/Referenzen
  const letters = t.replace(/[^a-z]/g,'');
  if (letters && (letters.replace(/[^a-z]/g,'').length/letters.length) > 0.7 && t === t.toUpperCase()) return true;
  return false;
}

function tokenizeName(text) {
  // Wörter, die mit Großbuchstaben starten (Deutsch inkl. Umlaute), einfache Tokens
  return String(text||'')
    .trim()
    .split(/\s+/)
    .filter(w => /^[A-ZÄÖÜ][a-zäöüß\-]+$/.test(w));
}

function isLikelyPersonName(counterparty, purposeText) {
  // 1) Firmen-Whitelist/Heuristik: wenn Händler → nicht anonymisieren
  if (looksLikeCompany(counterparty)) return false;

  const tokens = tokenizeName(counterparty);
  if (tokens.length < 2) return false; // mind. Vor- + Nachname

  // 2) Vorname plausibel?
  const first = tokens[0].toLowerCase();
  const plausibleFirst = firstnamesWhitelist.has(first) || /^[A-ZÄÖÜ][a-zäöüß\-]+$/.test(tokens[0]);

  // 3) Zweck als Zusatzhinweis: enthält er dieselben Tokens?
  const p = String(purposeText||'');
  const purposeHasAny = tokens.some(t => new RegExp(`\\b${t}\\b`, 'i').test(p));

  // Person, wenn plausibler Vorname und (entweder Zweck-Hinweis oder eindeutige 2–3 Tokens)
  return plausibleFirst && (purposeHasAny || tokens.length <= 3);
}

function maskSurnameIfPerson(counterparty, purposeText) {
  if (!counterparty) return counterparty;
  if (!isLikelyPersonName(counterparty, purposeText)) return counterparty;

  const tokens = counterparty.trim().split(/\s+/);
  if (tokens.length < 2) return counterparty;

  // Erstes Token bleibt, alle folgenden werden XXX
  return [tokens[0], ...tokens.slice(1).map(() => 'XXX')].join(' ');
}

// ------- Anonymisierung: Verwendungszweck & Zahlungspartner -------
function anonymizeRows(rows) {
  return rows.map(row => {
    // Verwendungszweck: lange Zahlen, IBAN, E-Mail etc. unkenntlich machen
    let vz = row['Verwendungszweck'] || row['Verwendungs Zweck'] || row['VERWENDUNGSZWECK'] || row['Verwendungszweck '];
    if (vz) {
      // IBAN / lange Zahlenketten
      vz = vz.replace(/\b[0-9A-Z]{10,}\b/g, '***');
      vz = vz.replace(/\b\d{4,}\b/g, '***');
      // E-Mail
      vz = vz.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '***');
      // Namen im Zweck pauschal entfernen (nur kapitalisierte Einzelwörter), aber nicht Firmen
      // (wir lassen Feinheiten hier, da Zahlungspartner die gezielte Maskierung übernimmt)
      row['Verwendungszweck'] = vz;
    }

    // Zahlungspartner: nur Nachnamen maskieren, wenn es wie Person wirkt
    const cpKey = ['Zahlungspartner','Gegen Partei','Empfänger','Begünstigter'].find(k => k in row) || 'Zahlungspartner';
    const cp = row[cpKey];
    if (cp) {
      row[cpKey] = maskSurnameIfPerson(cp, vz);
    }
    return row;
  });
}

// ------- Kategorisierung -------
async function categorizeRows(rows) {
  const descriptions = rows.map(r => (r['Verwendungszweck'] || '')).slice(0, 1000); // Schutz gegen sehr große CSVs
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ transactions: descriptions })
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error(`Backend ${res.status}: ${txt || res.statusText}`);
  }
  const data = await res.json();
  // Backend kann ["[\"Essen\",\"...\"]"] liefern → robust parsen
  let categories = data.categories ?? [];
  if (Array.isArray(categories) && categories.length === 1 && typeof categories[0] === 'string') {
    try { categories = JSON.parse(categories[0]); } catch {}
  } else if (typeof categories === 'string') {
    try { categories = JSON.parse(categories); } catch {}
  }
  if (!Array.isArray(categories)) categories = [];

  // Kategorien eintragen
  return rows.map((r,i) => ({ ...r, Kategorie: categories[i] || '' }));
}

// ------- Events -------
fileInput.addEventListener('change', async (ev) => {
  setStatus('Lade Datei …');
  const file = ev.target.files?.[0];
  if (!file) { setStatus(''); return; }

  const txt = await file.text();
  const parsed = parseCSV(txt);
  headers = parsed.headers;
  csvRows = parsed.rows;
  renderTable(csvRows, headers);

  // Whitelist laden (einmalig pro Sitzung genügt)
  if (!companyWhitelist.length) await loadCompanyWhitelist();
  if (!firstnameWhitelist.length) await loadFirstnameWhitelist();

  anonymizeBtn.disabled  = false;
  categorizeBtn.disabled = true;
  setStatus('Datei geladen. Jetzt „Anonymisieren“ klicken.');
});

anonymizeBtn.addEventListener('click', () => {
  if (!csvRows.length) return;
  setStatus('Anonymisiere …');
  csvRows = anonymizeRows(csvRows);
  renderTable(csvRows, headers);
  categorizeBtn.disabled = false;
  setStatus('Anonymisiert. Optional: „Kategorisieren“.');
});

categorizeBtn.addEventListener('click', async () => {
  if (!csvRows.length) return;
  categorizeBtn.disabled = true;
  setStatus('Kategorisiere (Backend) …');
  try {
    const categorized = await categorizeRows(csvRows);
    csvRows = categorized;
    // Header „Kategorie“ anhängen, falls neu
    if (!headers.includes('Kategorie')) headers = [...headers, 'Kategorie'];
    renderTable(csvRows, headers);
    setStatus('Kategorien eingefügt.');
  } catch (e) {
    console.error(e);
    setStatus(`Fehler: ${e.message || 'Kategorisierung fehlgeschlagen'}`);
  } finally {
    categorizeBtn.disabled = false;
  }
});
