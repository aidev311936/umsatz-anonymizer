function createInput(labelText, type = "text") {
    const wrapper = document.createElement("label");
    wrapper.className = "field";
    wrapper.textContent = labelText;
    const input = document.createElement("input");
    input.type = type;
    wrapper.appendChild(input);
    return { wrapper, input };
}
function toRule(row) {
    const errors = [];
    const id = row.idInput.value.trim();
    const pattern = row.patternInput.value;
    const replacement = row.replacementInput.value;
    const flags = row.flagsInput.value.trim();
    const enabled = row.enabledInput.checked;
    if (!id) {
        errors.push("Regel-ID darf nicht leer sein.");
    }
    if (!pattern) {
        errors.push(`Regex-Muster für Regel "${id || "(ohne ID)"}" darf nicht leer sein.`);
    }
    if (errors.length > 0) {
        return { rule: null, errors };
    }
    const rule = {
        id,
        type: "regex",
        pattern,
        replacement,
        fields: ["booking_text"],
        enabled,
    };
    if (flags) {
        rule.flags = flags;
    }
    return { rule, errors: [] };
}
export function buildAnonRulesUI(container, rules) {
    const list = document.createElement("div");
    list.className = "anon-rules-list";
    container.innerHTML = "";
    container.appendChild(list);
    const rows = [];
    function removeRow(target) {
        const index = rows.indexOf(target);
        if (index >= 0) {
            rows.splice(index, 1);
        }
        target.root.remove();
    }
    function addRule(initial) {
        const row = {
            root: document.createElement("div"),
            idInput: document.createElement("input"),
            patternInput: document.createElement("input"),
            replacementInput: document.createElement("input"),
            flagsInput: document.createElement("input"),
            enabledInput: document.createElement("input"),
        };
        row.root.className = "anon-rule";
        const header = document.createElement("div");
        header.className = "anon-rule-header";
        const enabledLabel = document.createElement("label");
        enabledLabel.className = "toggle";
        row.enabledInput.type = "checkbox";
        row.enabledInput.checked = initial?.enabled !== false;
        enabledLabel.appendChild(row.enabledInput);
        const enabledText = document.createElement("span");
        enabledText.textContent = "Aktiv";
        enabledLabel.appendChild(enabledText);
        header.appendChild(enabledLabel);
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "secondary";
        removeButton.textContent = "Entfernen";
        removeButton.addEventListener("click", () => removeRow(row));
        header.appendChild(removeButton);
        row.root.appendChild(header);
        const { wrapper: idWrapper, input: idInput } = createInput("ID");
        idInput.value = initial?.id ?? "";
        row.idInput = idInput;
        row.root.appendChild(idWrapper);
        const { wrapper: patternWrapper, input: patternInput } = createInput("Regex-Muster");
        patternInput.placeholder = "z. B. \\d+";
        patternInput.value = initial?.pattern ?? "";
        row.patternInput = patternInput;
        row.root.appendChild(patternWrapper);
        const { wrapper: replacementWrapper, input: replacementInput } = createInput("Ersetzung");
        replacementInput.value = initial?.replacement ?? "";
        row.replacementInput = replacementInput;
        row.root.appendChild(replacementWrapper);
        const { wrapper: flagsWrapper, input: flagsInput } = createInput("Flags");
        flagsInput.placeholder = "z. B. gi";
        if (initial?.flags) {
            flagsInput.value = initial.flags;
        }
        row.flagsInput = flagsInput;
        row.root.appendChild(flagsWrapper);
        rows.push(row);
        list.appendChild(row.root);
    }
    function setRules(nextRules) {
        rows.splice(0, rows.length);
        list.innerHTML = "";
        nextRules.forEach((rule) => {
            if (rule.type === "regex") {
                addRule(rule);
            }
            else {
                addRule({ id: rule.id, enabled: rule.enabled });
            }
        });
        if (nextRules.length === 0) {
            addRule({
                id: "digit_rule",
                pattern: "\\d+",
                replacement: "XXX",
                flags: "g",
                enabled: true,
            });
        }
    }
    function collectRules() {
        const errors = [];
        const rulesToSave = [];
        const seen = new Set();
        rows.forEach((row) => {
            const { rule, errors: rowErrors } = toRule(row);
            if (rowErrors.length > 0) {
                errors.push(...rowErrors);
                return;
            }
            if (!rule) {
                return;
            }
            if (seen.has(rule.id)) {
                errors.push(`Regel-ID "${rule.id}" ist nicht eindeutig.`);
                return;
            }
            seen.add(rule.id);
            rulesToSave.push(rule);
        });
        return { rules: rulesToSave, errors };
    }
    setRules(rules);
    return {
        setRules,
        addRule,
        collectRules,
    };
}
