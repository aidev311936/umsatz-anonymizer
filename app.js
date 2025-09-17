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

// Render table in the DOM
function renderTable(data) {
  const container = document.getElementById('tableContainer');
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

// Remove sensitive information from Verwendungszweck
function anonymize(data) {
  return data.map((row) => {
    if (row['Verwendungszweck']) {
      let text = row['Verwendungszweck'];
      // Replace long numbers (4+ digits) with ***
      text = text.replace(/\b\d{4,}\b/g, '***');
      // Replace names (simple heuristic: words starting with a capital letter)
      text = text.replace(/\b[A-ZÄÖÜ][a-zäöüß]+/g, 'XXX');
      row['Verwendungszweck'] = text;
    }
    return row;
  });
}

const fileInput = document.getElementById('csvFile');
const anonymizeBtn = document.getElementById('anonymizeBtn');
// Button to trigger categorization; may not exist if HTML hasn't been updated yet
const categorizeBtn = document.getElementById('categorizeBtn');
let csvData = [];

fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    csvData = parseCSV(e.target.result);
    renderTable(csvData);
    anonymizeBtn.disabled = false;
    // Disable categorize button until data has been anonymized
    if (categorizeBtn) categorizeBtn.disabled = true;
  };
  reader.readAsText(file, 'UTF-8');
});

// Anonymize data only; enables categorize button after anonymization
anonymizeBtn.addEventListener('click', () => {
  csvData = anonymize(csvData);
  renderTable(csvData);
  // Enable categorize button now that data is anonymized
  if (categorizeBtn) categorizeBtn.disabled = false;
});

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
