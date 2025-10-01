function maskFull(value, maskChar) {
    return value.replace(/\S/g, maskChar);
}
function maskKeepFirstLast(value, maskChar, minLen, maskPercent) {
    const chars = Array.from(value);
    const indices = chars
        .map((char, index) => ({ char, index }))
        .filter((entry) => /\S/.test(entry.char));
    if (indices.length < Math.max(minLen, 2)) {
        return value;
    }
    const middle = indices.slice(1, -1);
    if (middle.length === 0) {
        return value;
    }
    const maskCount = Math.min(middle.length, Math.max(1, Math.round(middle.length * maskPercent)));
    for (let i = 0; i < maskCount; i += 1) {
        chars[middle[i].index] = maskChar;
    }
    return chars.join("");
}
function maskPartialPercent(value, maskChar, maskPercent) {
    const chars = Array.from(value);
    const indices = chars
        .map((char, index) => ({ char, index }))
        .filter((entry) => /\S/.test(entry.char));
    if (indices.length === 0) {
        return value;
    }
    const maskCount = Math.min(indices.length, Math.max(1, Math.round(indices.length * maskPercent)));
    const step = indices.length / maskCount;
    for (let i = 0; i < maskCount; i += 1) {
        const target = indices[Math.min(indices.length - 1, Math.floor(i * step))];
        chars[target.index] = maskChar;
    }
    return chars.join("");
}
function applyMask(value, rule) {
    const maskChar = rule.maskChar ?? "•";
    const minLen = rule.minLen ?? 0;
    const maskPercent = rule.maskPercent ?? 1;
    switch (rule.maskStrategy) {
        case "full":
            return maskFull(value, maskChar);
        case "keepFirstLast":
            return maskKeepFirstLast(value, maskChar, minLen, maskPercent);
        case "partialPercent":
            return maskPartialPercent(value, maskChar, maskPercent);
        default:
            return value;
    }
}
export function compileRules(rules) {
    const compiled = [];
    const warnings = [];
    rules.forEach((rule) => {
        if (rule.enabled === false) {
            return;
        }
        if (rule.type === "regex") {
            try {
                const regex = new RegExp(rule.pattern, rule.flags);
                compiled.push({
                    ...rule,
                    type: "regex",
                    regex,
                    replacement: rule.replacement,
                });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Unbekannter Fehler";
                warnings.push(`Regex-Regel "${rule.id}" konnte nicht geladen werden: ${message}`);
            }
        }
        else if (rule.type === "mask") {
            compiled.push(rule);
        }
    });
    return { compiled, warnings };
}
export function applyAnonymization(transactions, rules) {
    const { compiled, warnings } = compileRules(rules);
    const anonymized = transactions.map((tx) => ({ ...tx }));
    compiled.forEach((rule) => {
        anonymized.forEach((entry) => {
            rule.fields
                .filter((field) => field === "booking_text")
                .forEach((field) => {
                const current = entry[field];
                if (!current) {
                    return;
                }
                if (rule.type === "regex") {
                    entry[field] = current.replace(rule.regex, rule.replacement);
                }
                else if (rule.type === "mask") {
                    entry[field] = applyMask(current, rule);
                }
            });
        });
    });
    return { data: anonymized, warnings };
}
