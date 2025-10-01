import { AnonRule } from "./types.js";

export interface RulesUIController {
  getRules(): AnonRule[];
  setRules(rules: AnonRule[]): void;
}

function cloneRule(rule: AnonRule): AnonRule {
  if (rule.type === "regex") {
    return {
      id: rule.id,
      type: "regex",
      pattern: rule.pattern,
      flags: rule.flags,
      replacement: rule.replacement,
      fields: ["booking_text"],
      enabled: rule.enabled !== false,
    };
  }
  return {
    id: rule.id,
    type: "mask",
    maskStrategy: rule.maskStrategy,
    maskChar: rule.maskChar,
    minLen: rule.minLen,
    maskPercent: rule.maskPercent,
    fields: ["booking_text"],
    enabled: rule.enabled !== false,
  };
}

function createDefaultRule(): AnonRule {
  return {
    id: `rule_${Date.now()}`,
    type: "regex",
    pattern: "",
    flags: "g",
    replacement: "",
    fields: ["booking_text"],
    enabled: true,
  };
}

function createTextInput(labelText: string, value: string, onChange: (value: string) => void): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "rule-field";

  const label = document.createElement("label");
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));

  wrapper.appendChild(label);
  wrapper.appendChild(input);
  return wrapper;
}

function createNumberInput(
  labelText: string,
  value: number | undefined,
  onChange: (value: number) => void,
  options?: { min?: number; max?: number; step?: number }
): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "rule-field";

  const label = document.createElement("label");
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "number";
  if (typeof options?.min === "number") {
    input.min = String(options.min);
  }
  if (typeof options?.max === "number") {
    input.max = String(options.max);
  }
  if (typeof options?.step === "number") {
    input.step = String(options.step);
  }
  input.value = value != null ? String(value) : "";
  input.addEventListener("change", () => {
    const parsed = Number(input.value);
    onChange(Number.isNaN(parsed) ? 0 : parsed);
  });

  wrapper.appendChild(label);
  wrapper.appendChild(input);
  return wrapper;
}

function createMaskPercentInput(
  labelText: string,
  value: number | undefined,
  onChange: (value: number) => void
): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "rule-field";

  const label = document.createElement("label");
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "1";
  input.step = "0.1";
  input.value = value != null ? String(value) : "1";

  const valueLabel = document.createElement("span");
  valueLabel.className = "rule-range-value";
  valueLabel.textContent = `${Math.round((value != null ? value : 1) * 100)}%`;

  input.addEventListener("input", () => {
    const parsed = Number(input.value);
    valueLabel.textContent = `${Math.round(parsed * 100)}%`;
  });
  input.addEventListener("change", () => {
    const parsed = Number(input.value);
    onChange(Number.isNaN(parsed) ? 1 : parsed);
  });

  wrapper.appendChild(label);
  wrapper.appendChild(input);
  wrapper.appendChild(valueLabel);
  return wrapper;
}

export function buildRulesUI(container: HTMLElement): RulesUIController {
  container.innerHTML = "";

  const info = document.createElement("p");
  info.className = "rules-info";
  info.textContent = 'Die folgenden Regeln werden ausschließlich auf die Spalte "Buchungstext" angewendet.';

  const list = document.createElement("div");
  list.className = "rules-list";

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "rules-add-button";
  addButton.textContent = "Neue Regel hinzufügen";

  container.appendChild(info);
  container.appendChild(list);
  container.appendChild(addButton);

  const state: AnonRule[] = [];

  function notifyChange(): void {
    const event = new CustomEvent<AnonRule[]>("ruleschange", {
      detail: state.map((rule) => cloneRule(rule)),
    });
    container.dispatchEvent(event);
  }

  function updateRule(index: number, updater: (rule: AnonRule) => AnonRule): void {
    state[index] = cloneRule(updater(state[index]));
    render();
    notifyChange();
  }

  function removeRule(index: number): void {
    state.splice(index, 1);
    render();
    notifyChange();
  }

  function render(): void {
    list.innerHTML = "";

    if (state.length === 0) {
      const empty = document.createElement("p");
      empty.className = "rules-empty";
      empty.textContent = "Keine Regeln konfiguriert.";
      list.appendChild(empty);
      return;
    }

    state.forEach((rule, index) => {
      const card = document.createElement("div");
      card.className = "rule-card";

      const header = document.createElement("div");
      header.className = "rule-card-header";

      const idField = createTextInput("Name", rule.id, (value) => {
        updateRule(index, (current) => ({ ...current, id: value.trim() || current.id }));
      });
      idField.classList.add("rule-field-inline");

      const enabledWrapper = document.createElement("label");
      enabledWrapper.className = "rule-toggle";
      const enabledCheckbox = document.createElement("input");
      enabledCheckbox.type = "checkbox";
      enabledCheckbox.checked = rule.enabled !== false;
      enabledCheckbox.addEventListener("change", () => {
        updateRule(index, (current) => ({ ...current, enabled: enabledCheckbox.checked }));
      });
      const enabledText = document.createElement("span");
      enabledText.textContent = "Aktiv";
      enabledWrapper.appendChild(enabledCheckbox);
      enabledWrapper.appendChild(enabledText);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "rule-remove-button";
      removeButton.textContent = "Regel entfernen";
      removeButton.addEventListener("click", () => removeRule(index));

      header.appendChild(idField);
      header.appendChild(enabledWrapper);
      header.appendChild(removeButton);
      card.appendChild(header);

      const typeWrapper = document.createElement("div");
      typeWrapper.className = "rule-field";
      const typeLabel = document.createElement("label");
      typeLabel.textContent = "Art";
      const typeSelect = document.createElement("select");
      const optionRegex = document.createElement("option");
      optionRegex.value = "regex";
      optionRegex.textContent = "Regex";
      const optionMask = document.createElement("option");
      optionMask.value = "mask";
      optionMask.textContent = "Maskierung";
      typeSelect.appendChild(optionRegex);
      typeSelect.appendChild(optionMask);
      typeSelect.value = rule.type;
      typeSelect.addEventListener("change", () => {
        const nextType = typeSelect.value as AnonRule["type"];
        updateRule(index, (current) => {
          if (nextType === "regex") {
            return {
              id: current.id,
              type: "regex",
              pattern: current.type === "regex" ? current.pattern : "",
              flags: current.type === "regex" ? current.flags : "g",
              replacement: current.type === "regex" ? current.replacement : "",
              fields: ["booking_text"],
              enabled: current.enabled !== false,
            };
          }
          return {
            id: current.id,
            type: "mask",
            maskStrategy: current.type === "mask" ? current.maskStrategy : "full",
            maskChar: current.type === "mask" ? current.maskChar : "•",
            minLen: current.type === "mask" ? current.minLen : 0,
            maskPercent: current.type === "mask" ? current.maskPercent : 1,
            fields: ["booking_text"],
            enabled: current.enabled !== false,
          };
        });
      });
      typeWrapper.appendChild(typeLabel);
      typeWrapper.appendChild(typeSelect);
      card.appendChild(typeWrapper);

      if (rule.type === "regex") {
        card.appendChild(
          createTextInput("Regulärer Ausdruck", rule.pattern, (value) => {
            updateRule(index, (current) => ({ ...current, pattern: value }));
          })
        );
        card.appendChild(
          createTextInput("Ersetzung", rule.replacement, (value) => {
            updateRule(index, (current) => ({ ...current, replacement: value }));
          })
        );
        card.appendChild(
          createTextInput("Flags", rule.flags ?? "", (value) => {
            updateRule(index, (current) => ({ ...current, flags: value.trim() || undefined }));
          })
        );
      } else {
        const strategyWrapper = document.createElement("div");
        strategyWrapper.className = "rule-field";
        const strategyLabel = document.createElement("label");
        strategyLabel.textContent = "Maskierungsstrategie";
        const strategySelect = document.createElement("select");
        [
          { value: "full", label: "Alles maskieren" },
          { value: "keepFirstLast", label: "Erstes & letztes Zeichen behalten" },
          { value: "partialPercent", label: "Teilweise maskieren" },
        ].forEach((option) => {
          const opt = document.createElement("option");
          opt.value = option.value;
          opt.textContent = option.label;
          strategySelect.appendChild(opt);
        });
        strategySelect.value = rule.maskStrategy;
        strategySelect.addEventListener("change", () => {
          const nextStrategy = strategySelect.value as Extract<AnonRule, { type: "mask" }>["maskStrategy"];
          updateRule(index, (current) => {
            if (current.type !== "mask") {
              return current;
            }
            return { ...current, maskStrategy: nextStrategy };
          });
        });
        strategyWrapper.appendChild(strategyLabel);
        strategyWrapper.appendChild(strategySelect);
        card.appendChild(strategyWrapper);

        card.appendChild(
          createTextInput("Masken-Zeichen", rule.maskChar ?? "", (value) => {
            updateRule(index, (current) => ({ ...current, maskChar: value || undefined }));
          })
        );

        card.appendChild(
          createNumberInput("Mindestlänge", rule.minLen, (value) => {
            updateRule(index, (current) => ({ ...current, minLen: value }));
          }, { min: 0 })
        );

        card.appendChild(
          createMaskPercentInput("Maskierungsanteil", rule.maskPercent, (value) => {
            updateRule(index, (current) => ({ ...current, maskPercent: value }));
          })
        );
      }

      list.appendChild(card);
    });
  }

  addButton.addEventListener("click", () => {
    state.push(cloneRule(createDefaultRule()));
    render();
    notifyChange();
  });

  render();

  return {
    getRules(): AnonRule[] {
      return state.map((rule) => cloneRule(rule));
    },
    setRules(rules: AnonRule[]): void {
      state.splice(0, state.length, ...rules.map((rule) => cloneRule(rule)));
      render();
    },
  };
}
