import { AnonRule } from "./types.js";

type RuleInit = Partial<AnonRule> & { type?: AnonRule["type"] };

export interface AnonRulesUIController {
  setRules(rules: AnonRule[]): void;
  addRule(initial?: RuleInit): void;
  collectRules(): { rules: AnonRule[]; errors: string[] };
}

type MaskStrategy = Extract<AnonRule, { type: "mask" }>["maskStrategy"];

interface RuleRow {
  root: HTMLDivElement;
  idInput: HTMLInputElement;
  typeSelect: HTMLSelectElement;
  enabledInput: HTMLInputElement;
  regexFields: HTMLDivElement;
  patternInput: HTMLInputElement;
  replacementInput: HTMLInputElement;
  flagsInput: HTMLInputElement;
  maskFields: HTMLDivElement;
  maskStrategySelect: HTMLSelectElement;
  maskCharInput: HTMLInputElement;
  minLenInput: HTMLInputElement;
  maskPercentInput: HTMLInputElement;
}

interface InputOptions {
  type?: string;
  placeholder?: string;
  step?: string;
  min?: string;
  max?: string;
}

function createInput(
  labelText: string,
  options: InputOptions = {}
): { wrapper: HTMLLabelElement; input: HTMLInputElement } {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.textContent = labelText;
  const input = document.createElement("input");
  input.type = options.type ?? "text";
  if (options.placeholder) {
    input.placeholder = options.placeholder;
  }
  if (options.step) {
    input.step = options.step;
  }
  if (options.min) {
    input.min = options.min;
  }
  if (options.max) {
    input.max = options.max;
  }
  wrapper.appendChild(input);
  return { wrapper, input };
}

function toNumber(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRule(row: RuleRow): { rule: AnonRule | null; errors: string[] } {
  const errors: string[] = [];
  const id = row.idInput.value.trim();
  if (!id) {
    errors.push("Regel-ID darf nicht leer sein.");
  }
  const type = row.typeSelect.value as AnonRule["type"];
  const enabled = row.enabledInput.checked;

  if (type === "regex") {
    const pattern = row.patternInput.value;
    const replacement = row.replacementInput.value;
    const flags = row.flagsInput.value.trim();
    if (!pattern) {
      errors.push(`Regex-Muster für Regel "${id || "(ohne ID)"}" darf nicht leer sein.`);
    }
    if (errors.length > 0) {
      return { rule: null, errors };
    }
    const rule: AnonRule = {
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

  const maskStrategy = row.maskStrategySelect.value as MaskStrategy;
  const maskChar = row.maskCharInput.value || "•";
  const minLen = toNumber(row.minLenInput.value);
  const percentValue = toNumber(row.maskPercentInput.value);

  if (maskStrategy !== "full" && (percentValue === null || percentValue < 0 || percentValue > 100)) {
    errors.push(`Maskierungs-Prozentwert für Regel "${id || "(ohne ID)"}" muss zwischen 0 und 100 liegen.`);
  }
  if (minLen !== null && (minLen < 0 || !Number.isInteger(minLen))) {
    errors.push(`Minimale Länge für Regel "${id || "(ohne ID)"}" muss eine ganze Zahl >= 0 sein.`);
  }
  if (errors.length > 0) {
    return { rule: null, errors };
  }

  const maskPercent = percentValue !== null ? percentValue / 100 : undefined;
  const rule: AnonRule = {
    id,
    type: "mask",
    fields: ["booking_text"],
    maskStrategy,
    maskChar,
    enabled,
  };
  if (minLen !== null) {
    rule.minLen = minLen;
  }
  if (maskPercent !== undefined) {
    rule.maskPercent = maskPercent;
  }
  return { rule, errors: [] };
}

function setRuleType(row: RuleRow, type: AnonRule["type"]): void {
  row.typeSelect.value = type;
  row.regexFields.hidden = type !== "regex";
  row.maskFields.hidden = type !== "mask";
}

function createRuleRow(initial?: RuleInit): RuleRow {
  const row: RuleRow = {
    root: document.createElement("div"),
    idInput: document.createElement("input"),
    typeSelect: document.createElement("select"),
    enabledInput: document.createElement("input"),
    regexFields: document.createElement("div"),
    patternInput: document.createElement("input"),
    replacementInput: document.createElement("input"),
    flagsInput: document.createElement("input"),
    maskFields: document.createElement("div"),
    maskStrategySelect: document.createElement("select"),
    maskCharInput: document.createElement("input"),
    minLenInput: document.createElement("input"),
    maskPercentInput: document.createElement("input"),
  };
  row.root.className = "anon-rule";

  const header = document.createElement("div");
  header.className = "anon-rule-header";

  const typeWrapper = document.createElement("label");
  typeWrapper.className = "field";
  typeWrapper.textContent = "Typ";
  const typeSelect = row.typeSelect;
  const typeRegexOption = document.createElement("option");
  typeRegexOption.value = "regex";
  typeRegexOption.textContent = "Regex";
  typeSelect.appendChild(typeRegexOption);
  const typeMaskOption = document.createElement("option");
  typeMaskOption.value = "mask";
  typeMaskOption.textContent = "Maskierung";
  typeSelect.appendChild(typeMaskOption);
  typeWrapper.appendChild(typeSelect);
  header.appendChild(typeWrapper);

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
  header.appendChild(removeButton);

  row.root.appendChild(header);

  const { wrapper: idWrapper, input: idInput } = createInput("ID");
  idInput.value = initial?.id ?? "";
  row.idInput = idInput;
  row.root.appendChild(idWrapper);

  const regexFields = row.regexFields;
  regexFields.className = "anon-rule-fields";
  const { wrapper: patternWrapper, input: patternInput } = createInput("Regex-Muster", {
    placeholder: "z. B. \\d+",
  });
  patternInput.value = initial?.type === "regex" ? initial.pattern ?? "" : "";
  row.patternInput = patternInput;
  regexFields.appendChild(patternWrapper);

  const { wrapper: replacementWrapper, input: replacementInput } = createInput("Ersetzung");
  replacementInput.value = initial?.type === "regex" ? initial.replacement ?? "" : "";
  row.replacementInput = replacementInput;
  regexFields.appendChild(replacementWrapper);

  const { wrapper: flagsWrapper, input: flagsInput } = createInput("Flags", { placeholder: "z. B. gi" });
  if (initial?.type === "regex" && initial.flags) {
    flagsInput.value = initial.flags;
  }
  row.flagsInput = flagsInput;
  regexFields.appendChild(flagsWrapper);
  row.root.appendChild(regexFields);

  const maskFields = row.maskFields;
  maskFields.className = "anon-rule-fields";
  const maskStrategyLabel = document.createElement("label");
  maskStrategyLabel.className = "field";
  maskStrategyLabel.textContent = "Maskierungsstrategie";
  const maskStrategySelect = row.maskStrategySelect;
  ("full keepFirstLast partialPercent".split(" ") as MaskStrategy[]).forEach((strategy) => {
    const option = document.createElement("option");
    option.value = strategy;
    switch (strategy) {
      case "full":
        option.textContent = "Alles maskieren";
        break;
      case "keepFirstLast":
        option.textContent = "Anfang/Ende behalten";
        break;
      case "partialPercent":
        option.textContent = "Prozentual maskieren";
        break;
      default:
        option.textContent = strategy;
    }
    maskStrategySelect.appendChild(option);
  });
  maskStrategyLabel.appendChild(maskStrategySelect);
  maskFields.appendChild(maskStrategyLabel);

  const { wrapper: maskCharWrapper, input: maskCharInput } = createInput("Maskierungszeichen", {
    placeholder: "Standard: •",
  });
  maskCharInput.maxLength = 1;
  maskFields.appendChild(maskCharWrapper);
  row.maskCharInput = maskCharInput;

  const { wrapper: minLenWrapper, input: minLenInput } = createInput("Minimale Länge", {
    type: "number",
    min: "0",
    step: "1",
  });
  maskFields.appendChild(minLenWrapper);
  row.minLenInput = minLenInput;

  const { wrapper: percentWrapper, input: percentInput } = createInput("Maskierungs-Prozent", {
    type: "number",
    min: "0",
    max: "100",
    step: "0.1",
    placeholder: "0-100",
  });
  maskFields.appendChild(percentWrapper);
  row.maskPercentInput = percentInput;
  row.root.appendChild(maskFields);

  row.typeSelect.addEventListener("change", () => {
    setRuleType(row, row.typeSelect.value as AnonRule["type"]);
  });

  const initialType = initial?.type ?? "regex";
  setRuleType(row, initialType);

  if (initial?.type === "mask") {
    maskStrategySelect.value = initial.maskStrategy ?? "full";
    if (initial.maskChar) {
      maskCharInput.value = initial.maskChar;
    }
    if (typeof initial.minLen === "number") {
      minLenInput.value = initial.minLen.toString();
    }
    if (typeof initial.maskPercent === "number") {
      percentInput.value = Math.round(initial.maskPercent * 100).toString();
    }
  }

  return row;
}

export function buildAnonRulesUI(container: HTMLElement, rules: AnonRule[]): AnonRulesUIController {
  const list = document.createElement("div");
  list.className = "anon-rules-list";
  container.innerHTML = "";
  container.appendChild(list);

  const rows: RuleRow[] = [];

  function removeRow(target: RuleRow): void {
    const index = rows.indexOf(target);
    if (index >= 0) {
      rows.splice(index, 1);
    }
    target.root.remove();
  }

  function addRule(initial?: RuleInit): void {
    const row = createRuleRow(initial);
    const removeButton = row.root.querySelector("button.secondary");
    if (removeButton) {
      removeButton.addEventListener("click", () => removeRow(row));
    }
    rows.push(row);
    list.appendChild(row.root);
  }

  function setRules(nextRules: AnonRule[]): void {
    rows.splice(0, rows.length);
    list.innerHTML = ""; 
    nextRules.forEach((rule) => {
      addRule(rule);
    });
    if (nextRules.length === 0) {
      addRule({
        id: "digit_rule",
        type: "regex",
        pattern: "\\d+",
        replacement: "XXX",
        flags: "g",
        enabled: true,
      });
    }
  }

  function collectRules(): { rules: AnonRule[]; errors: string[] } {
    const errors: string[] = [];
    const rulesToSave: AnonRule[] = [];
    const seen = new Set<string>();

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
