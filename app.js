// Parse CSV into array of objects
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(";");
  return lines.slice(1).map(line => {
    const cols = line.split(";");
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i];
    });
    return obj;
  });
}

// Render table in the DOM
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

// Remove sensitive information from Verwendungszweck
function anonymize(data) {
  return data.map(row => {
    if (row["Verwendungszweck"]) {
      let text = row["Verwendungszweck"];
      // Replace long numbers (4+ digits) with ***
      text = text.replace(/\b\d{4,}\b/g, "***");
      // Replace names (simple heuristic: words starting with a capital letter)
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
  // anonymize locally
  csvData = anonymize(csvData);
  renderTable(csvData);

  // Send anonymized Verwendungszwecke to backend for categorization
  const transactions = csvData.map(row => row["Verwendungszweck"]);
  fetch("https://umsatz-api.onrender.com/categorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactions })
  })
    .then(resp => resp.json())
    .then(data => {
      // Append categories to rows
      const categories = data.categories || [];
      csvData = csvData.map((row, idx) => {
        return { ...row, Kategorie: categories[idx] || "" };
      });
      renderTable(csvData);
    })
    .catch(err => {
      console.error("Fehler bei der Kategorisierung:", err);
    });
});
