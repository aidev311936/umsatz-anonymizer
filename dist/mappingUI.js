const TARGET_FIELDS = [
    "booking_date",
    "booking_text",
    "booking_type",
    "booking_amount",
];
function createFieldLabel(field) {
    switch (field) {
        case "booking_date":
            return "Buchungsdatum";
        case "booking_text":
            return "Buchungstext";
        case "booking_type":
            return "Buchungsart";
        case "booking_amount":
            return "Betrag";
        default:
            return field;
    }
}
function dedupe(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        if (!seen.has(value)) {
            seen.add(value);
            result.push(value);
        }
    }
    return result;
}
export function buildMappingUI(container, headers, initialMapping) {
    container.innerHTML = "";
    const state = {
        booking_date: [],
        booking_text: [],
        booking_type: [],
        booking_amount: [],
    };
    const entries = {};
    function updateSelectOptions(select, values) {
        Array.from(select.options).forEach((option) => {
            option.selected = values.includes(option.value);
        });
    }
    function updateOrderInput(orderInput, values) {
        orderInput.value = values.join(";");
    }
    function updateUI(field) {
        const entry = entries[field];
        if (!entry) {
            return;
        }
        updateSelectOptions(entry.select, state[field]);
        updateOrderInput(entry.orderInput, state[field]);
    }
    function syncDisabledOptions() {
        const used = new Set();
        TARGET_FIELDS.forEach((field) => {
            state[field].forEach((value) => used.add(value));
        });
        TARGET_FIELDS.forEach((field) => {
            const entry = entries[field];
            Array.from(entry.select.options).forEach((option) => {
                if (state[field].includes(option.value)) {
                    option.disabled = false;
                }
                else {
                    option.disabled = used.has(option.value);
                }
            });
        });
    }
    function setFieldValues(field, values) {
        const normalized = dedupe(values.filter((value) => headers.includes(value)));
        const affected = new Set();
        normalized.forEach((value) => {
            TARGET_FIELDS.forEach((other) => {
                if (other !== field) {
                    const index = state[other].indexOf(value);
                    if (index >= 0) {
                        state[other].splice(index, 1);
                        affected.add(other);
                    }
                }
            });
        });
        state[field] = normalized;
        affected.forEach((other) => updateUI(other));
        updateUI(field);
        syncDisabledOptions();
    }
    TARGET_FIELDS.forEach((field) => {
        const wrapper = document.createElement("div");
        wrapper.className = "mapping-field";
        const label = document.createElement("label");
        label.textContent = `${createFieldLabel(field)}:`;
        label.htmlFor = `${field}-select`;
        const select = document.createElement("select");
        select.id = `${field}-select`;
        select.multiple = true;
        select.size = Math.min(Math.max(headers.length, 3), 8);
        headers.forEach((header) => {
            const option = document.createElement("option");
            option.value = header;
            option.textContent = header;
            select.appendChild(option);
        });
        const orderInput = document.createElement("input");
        orderInput.type = "text";
        orderInput.placeholder = "Spaltenreihenfolge mit ; getrennt";
        orderInput.className = "mapping-order";
        select.addEventListener("change", () => {
            const selected = Array.from(select.selectedOptions).map((option) => option.value);
            const previous = state[field];
            const ordered = [];
            previous.forEach((value) => {
                if (selected.includes(value)) {
                    ordered.push(value);
                }
            });
            selected.forEach((value) => {
                if (!ordered.includes(value)) {
                    ordered.push(value);
                }
            });
            setFieldValues(field, ordered);
        });
        orderInput.addEventListener("change", () => {
            const values = orderInput.value
                .split(";")
                .map((value) => value.trim())
                .filter((value) => value.length > 0);
            setFieldValues(field, values);
        });
        wrapper.appendChild(label);
        wrapper.appendChild(select);
        wrapper.appendChild(orderInput);
        container.appendChild(wrapper);
        entries[field] = { field, select, orderInput };
    });
    syncDisabledOptions();
    if (initialMapping) {
        TARGET_FIELDS.forEach((field) => {
            const values = initialMapping[field];
            if (values && values.length > 0) {
                setFieldValues(field, values);
            }
        });
    }
    return {
        getMapping() {
            return {
                booking_date: [...state.booking_date],
                booking_text: [...state.booking_text],
                booking_type: [...state.booking_type],
                booking_amount: [...state.booking_amount],
            };
        },
        setMapping(mapping) {
            TARGET_FIELDS.forEach((field) => {
                const values = mapping[field];
                if (values) {
                    setFieldValues(field, values);
                }
                else {
                    setFieldValues(field, []);
                }
            });
        },
        validate() {
            const missing = TARGET_FIELDS.filter((field) => state[field].length === 0);
            return { valid: missing.length === 0, missing };
        },
        clear() {
            TARGET_FIELDS.forEach((field) => {
                state[field] = [];
                updateUI(field);
            });
            syncDisabledOptions();
        },
    };
}
