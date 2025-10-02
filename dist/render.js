import { formatBookingAmount } from "./displaySettings.js";
export function renderTable(transactions, tbody, displaySettings) {
    tbody.innerHTML = "";
    transactions.forEach((tx) => {
        const row = document.createElement("tr");
        const bookingDate = document.createElement("td");
        bookingDate.textContent = tx.booking_date;
        row.appendChild(bookingDate);
        const bookingText = document.createElement("td");
        bookingText.textContent = tx.booking_text;
        row.appendChild(bookingText);
        const bookingType = document.createElement("td");
        bookingType.textContent = tx.booking_type;
        row.appendChild(bookingType);
        const bookingAmount = document.createElement("td");
        bookingAmount.textContent = formatBookingAmount(tx.booking_amount, displaySettings);
        bookingAmount.className = "amount";
        row.appendChild(bookingAmount);
        tbody.appendChild(row);
    });
}
