// Helfer: CSV in Array von Objekten umwandeln
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(";");
  return lines.slice(1).map(line => {
    const cols = line.split(";");
    const obj = {};
    headers.forEach((h, i) => obj[h] = cols[i]);
    return obj;
  });
}

// Tabelle im DOM darstellen
function renderTable(data) {
  const container = document.getElementById("tableContainer");
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  Object.keys(data[0]).forEach(key => {
    const th = document.createElement("th");
    th.textContent = key;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  data.forEach(row => {
    const tr = document.createElement("tr");
    Object.values(row).forEach(value => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.innerHTML = "";
  container.appendChild(table);
}

// Persönliche Daten im Verwendungszweck entfernen
function anonymize(data) {
  return data.map(row => {
    if (row["Verwendungszweck"]) {
      let text = row["Verwendungszweck"];
      // Zahlenfolgen verschleiern
      text = text.replace(/\b\d{4,}\b/g, "***");
      // Namen (vereinfachtes Beispiel)
      text = text.replace(/\b[A-ZÄÖÜ][a-zäöüß]+/g, "XXX");
      row["Verwendungszweck"] = text;
    }
    return row;
  });
}

const fileInput = document.getElementById("csvFile");
const anonymizeBtn = document.getElementById("anonymizeBtn");
let csvData = [];

fileInput.addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    csvData = parseCSV(e.target.result);
    renderTable(csvData);
    anonymizeBtn.disabled = false;
  };
  reader.readAsText(file, "UTF-8");
});

anonymizeBtn.addEventListener("click", () => {
  csvData = anonymize(csvData);
  renderTable(csvData);
});
