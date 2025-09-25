// Parse CSV into array of objects
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(';');
  return lines.slice(1).map((line) => {
    const cols = line.split(';');
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i];
    });
    return obj;
  });
}

const DATE_KEYS = ['Buchungstag', 'Buchungsdatum', 'Datum', 'Wertstellung', 'Wertstellungsdatum'];

// Render table in the DOM
function renderTable(data) {
  if (typeof document === 'undefined') {
    throw new Error('renderTable requires a DOM environment');
  }

  const container = document.getElementById('tableContainer');
  if (!data.length) {
    container.innerHTML = '';
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  // Create table headers based on keys in the first row
  Object.keys(data[0]).forEach((key) => {
    const th = document.createElement('th');
    th.textContent = key;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  data.forEach((row) => {
    const tr = document.createElement('tr');
    Object.values(row).forEach((value) => {
      const td = document.createElement('td');
      // If the value is an array, join its elements for display
      td.textContent = Array.isArray(value) ? value.join(', ') : value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.innerHTML = '';
  container.appendChild(table);
}

function parseDateString(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const germanMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (germanMatch) {
    let year = Number(germanMatch[3]);
    if (year < 100) {
      year += year < 70 ? 2000 : 1900;
    }
    const month = Number(germanMatch[2]) - 1;
    const day = Number(germanMatch[1]);
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  return null;
}

function getDateValue(row) {
  for (const key of DATE_KEYS) {
    if (row[key]) {
      const parsed = parseDateString(row[key]);
      if (parsed) {
        return parsed.getTime();
      }
    }
  }
  return null;
}

function mergeTransactions(existing, incoming) {
  const combined = [...existing, ...incoming];
  const decorated = combined.map((row, index) => ({
    row,
    index,
    dateValue: getDateValue(row) ?? Number.NEGATIVE_INFINITY,
  }));

  decorated.sort((a, b) => {
    if (a.dateValue === b.dateValue) {
      return a.index - b.index;
    }
    return b.dateValue - a.dateValue;
  });

  return decorated.map((entry) => entry.row);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(reader.error || new Error('Unbekannter Lesefehler'));
    reader.readAsText(file, 'UTF-8');
  });
}

const TYPE_KEYS = ['Type', 'Typ', 'type', 'Umsatzart', 'Umsatztyp', 'Buchungstyp', 'Art'];
const COMPANY_SUFFIXES = [
  'gmbh',
  'mbh',
  'ag',
  'kg',
  'kgaa',
  'ug',
  'se',
  'oy',
  'oyj',
  'ab',
  'sarl',
  'srl',
  'spa',
  'bv',
  'nv',
  'inc',
  'llc',
  'ltd',
  'limited',
  'company',
  'co',
  'sas',
  'sa',
  'plc',
];
const PARTNER_KEYS = [
  'Zahlungspartner',
  'Beguenstigter/Zahlungspflichtiger',
  'Begünstigter/Zahlungspflichtiger',
  'Auftraggeber/Empfänger',
  'Auftraggeber',
  'Empfänger',
  'Name',
  'Partner',
];
const USAGE_KEYS = ['Verwendungszweck', 'Verwendung'];

function stripDiacritics(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getFirstMatchingKey(row, keys) {
  return keys.find((key) => Object.prototype.hasOwnProperty.call(row, key) && row[key]);
}

function getTransactionType(row) {
  const key = getFirstMatchingKey(row, TYPE_KEYS);
  if (!key) return '';
  return String(row[key] || '').trim();
}

function normalizeForComparison(value) {
  if (!value && value !== 0) return '';
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

function isLikelyPersonName(value) {
  if (!value && value !== 0) return false;
  const text = String(value).trim();
  if (!text) return false;
  if (/\d/.test(text)) return false;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) {
    return false;
  }

  const lastWord = words[words.length - 1];
  if (COMPANY_SUFFIXES.includes(lastWord.toLowerCase())) {
    return false;
  }

  const hasLowercase = words.some((word) => /[a-zäöüß]/.test(word));
  if (hasLowercase) {
    return words.every((word) => /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß'\-]+$/.test(word));
  }

  if (!words.every((word) => /^[A-ZÄÖÜß'\-]{2,}$/.test(word))) {
    return false;
  }

  if (lastWord.length <= 2) {
    return words.length >= 3;
  }

  return true;
}

function getLastName(value) {
  if (!value && value !== 0) return '';
  const words = String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) {
    return '';
  }
  return words[words.length - 1];
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskDigits(value) {
  if (!value && value !== 0) return value;
  return String(value).replace(/\d+/g, 'XXX');
}

function maskName(text, lastName) {
  if (!text && text !== 0) return text;
  if (!lastName) return text;
  const pattern = new RegExp(`\\b${escapeRegExp(String(lastName))}\\b`, 'gi');
  return String(text).replace(pattern, 'XXX');
}

function collectPrivateLastNames(data) {
  const lastNames = new Set();
  data.forEach((row) => {
    const type = stripDiacritics(getTransactionType(row).toLowerCase()).replace(/^ruck/, 'rueck');
    if (!['uberweisung', 'aufladung'].includes(type)) {
      return;
    }

    const partnerKey = getFirstMatchingKey(row, PARTNER_KEYS);
    if (!partnerKey) return;
    const partner = row[partnerKey];
    if (!partner || !isLikelyPersonName(partner)) {
      return;
    }

    const lastName = getLastName(partner);
    if (lastName) {
      lastNames.add(lastName);
    }
  });
  return lastNames;
}

function maskKnownLastNames(value, knownLastNames) {
  if ((!value && value !== 0) || !knownLastNames.size) {
    return value;
  }

  let result = String(value);
  knownLastNames.forEach((lastName) => {
    const pattern = new RegExp(`\\b${escapeRegExp(String(lastName))}\\b`, 'gi');
    result = result.replace(pattern, 'XXX');
  });
  return result;
}

// Remove sensitive information according to transaction rules
function anonymize(data) {
  const knownPrivateLastNames = collectPrivateLastNames(data);

  return data.map((row) => {
    const updated = { ...row };

    const usageKey = getFirstMatchingKey(row, USAGE_KEYS);
    const partnerKey = getFirstMatchingKey(row, PARTNER_KEYS);
    const usage = usageKey ? row[usageKey] : undefined;
    const partner = partnerKey ? row[partnerKey] : undefined;

    if (
      usageKey &&
      partnerKey &&
      usage &&
      partner &&
      normalizeForComparison(usage) === normalizeForComparison(partner) &&
      !isLikelyPersonName(partner)
    ) {
      return { ...row };
    }

    const type = stripDiacritics(getTransactionType(row).toLowerCase()).replace(/^ruck/, 'rueck');

    if (type === 'clearing') {
      const result = { ...row };
      if (usageKey && result[usageKey]) {
        result[usageKey] = maskKnownLastNames(result[usageKey], knownPrivateLastNames);
      }
      if (partnerKey && result[partnerKey]) {
        result[partnerKey] = maskKnownLastNames(result[partnerKey], knownPrivateLastNames);
      }
      return result;
    }

    if (type === 'lastschrift' || type === 'ruecklastschrift') {
      if (usageKey && usage) {
        updated[usageKey] = maskDigits(usage);
      }
      if (usageKey && updated[usageKey]) {
        updated[usageKey] = maskKnownLastNames(updated[usageKey], knownPrivateLastNames);
      }
      if (partnerKey && updated[partnerKey]) {
        updated[partnerKey] = maskKnownLastNames(updated[partnerKey], knownPrivateLastNames);
      }
      return updated;
    }

    if (type === 'uberweisung') {
      if (partnerKey && partner && isLikelyPersonName(partner)) {
        const lastName = getLastName(partner);
        if (lastName) {
          if (usageKey && usage) {
            updated[usageKey] = maskName(usage, lastName);
          }
          updated[partnerKey] = maskName(partner, lastName);
        }
      } else if (usageKey && usage) {
        updated[usageKey] = maskDigits(usage);
      }

      if (usageKey && updated[usageKey]) {
        updated[usageKey] = maskKnownLastNames(updated[usageKey], knownPrivateLastNames);
      }
      if (partnerKey && updated[partnerKey]) {
        updated[partnerKey] = maskKnownLastNames(updated[partnerKey], knownPrivateLastNames);
      }
      return updated;
    }

    if (type === 'aufladung') {
      if (partnerKey && partner && isLikelyPersonName(partner)) {
        const lastName = getLastName(partner);
        if (lastName) {
          if (usageKey && usage) {
            updated[usageKey] = maskName(usage, lastName);
          }
          updated[partnerKey] = maskName(partner, lastName);
        }
      }

      if (usageKey && updated[usageKey]) {
        updated[usageKey] = maskKnownLastNames(updated[usageKey], knownPrivateLastNames);
      }
      if (partnerKey && updated[partnerKey]) {
        updated[partnerKey] = maskKnownLastNames(updated[partnerKey], knownPrivateLastNames);
      }
      return updated;
    }

    if (usageKey && updated[usageKey]) {
      updated[usageKey] = maskKnownLastNames(updated[usageKey], knownPrivateLastNames);
    }
    if (partnerKey && updated[partnerKey]) {
      updated[partnerKey] = maskKnownLastNames(updated[partnerKey], knownPrivateLastNames);
    }

    return updated;
  });
}

let csvData = [];

if (typeof document !== 'undefined') {
  const fileInput = document.getElementById('csvFile');
  const anonymizeBtn = document.getElementById('anonymizeBtn');
  // Button to trigger categorization; may not exist if HTML hasn't been updated yet
  const categorizeBtn = document.getElementById('categorizeBtn');

  if (fileInput) {
    fileInput.addEventListener('change', (event) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;

      Promise.all(files.map((file) => readFileAsText(file)))
        .then((contents) => {
          const parsed = contents.flatMap((text) => parseCSV(text));
          csvData = mergeTransactions(csvData, parsed);
          renderTable(csvData);
          if (anonymizeBtn) anonymizeBtn.disabled = csvData.length === 0;
          // Disable categorize button until data has been anonymized
          if (categorizeBtn) categorizeBtn.disabled = true;
        })
        .catch((err) => {
          console.error('Fehler beim Lesen der Dateien:', err);
          alert('Fehler beim Lesen der Dateien: ' + err.message);
        })
        .finally(() => {
          // Allow selecting the same file again by resetting the input value
          event.target.value = '';
        });
    });
  }

  // Anonymize data only; enables categorize button after anonymization
  if (anonymizeBtn) {
    anonymizeBtn.addEventListener('click', () => {
      csvData = anonymize(csvData);
      renderTable(csvData);
      // Enable categorize button now that data is anonymized
      if (categorizeBtn) categorizeBtn.disabled = false;
    });
  }

  // Send anonymized data to backend for categorization when categorize button is clicked
  if (categorizeBtn) {
    categorizeBtn.addEventListener('click', () => {
      const transactions = csvData.map((row) => row['Verwendungszweck']);
      fetch('https://umsatz-api.onrender.com/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions }),
      })
        .then((resp) => {
          if (!resp.ok) {
            return resp.json().then((e) => {
              throw new Error(e.error || resp.statusText);
            });
          }
          return resp.json();
        })
        .then((data) => {
          let categories = data.categories || [];
          // If categories is not an array, attempt to parse or split it
          if (!Array.isArray(categories)) {
            try {
              categories = JSON.parse(categories);
            } catch {
              categories = String(categories)
                .replace(/^[\[{]*|[\]}]*$/g, '')
                .split(',')
                .map((s) => s.replace(/"/g, '').trim())
                .filter(Boolean);
            }
          }
          // If categories is an array with one string containing a JSON array, parse it
          if (Array.isArray(categories) && categories.length === 1 && typeof categories[0] === 'string') {
            const catStr = categories[0].trim();
            try {
              categories = JSON.parse(catStr);
            } catch {
              categories = catStr
                .replace(/^[\[{]*|[\]}]*$/g, '')
                .split(',')
                .map((s) => s.replace(/"/g, '').trim())
                .filter(Boolean);
            }
          }
          // Assign categories to each row
          csvData = csvData.map((row, idx) => ({
            ...row,
            Kategorie: categories[idx] || '',
          }));
          renderTable(csvData);
        })
        .catch((err) => {
          console.error('Fehler bei der Kategorisierung:', err);
          alert('Fehler bei der Kategorisierung: ' + err.message);
        });
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseCSV,
    renderTable,
    parseDateString,
    getDateValue,
    mergeTransactions,
    readFileAsText,
    anonymize,
  };
}
