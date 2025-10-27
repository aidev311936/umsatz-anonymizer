import { AnonRule, UnifiedTx } from "./types";
import { computeUnifiedTxHash } from "./transactionHash";

type CompiledRule =
  | ({ type: "regex"; regex: RegExp; replacement: string } & Omit<Extract<AnonRule, { type: "regex" }>, "pattern" | "flags" | "replacement">)
  | ({ type: "mask" } & Extract<AnonRule, { type: "mask" }>);

export interface AnonymizationResult {
  data: UnifiedTx[];
  warnings: string[];
}

function maskFull(value: string, maskChar: string): string {
  return value.replace(/\S/g, maskChar);
}

function maskKeepFirstLast(value: string, maskChar: string, minLen: number, maskPercent: number): string {
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

function maskPartialPercent(value: string, maskChar: string, maskPercent: number): string {
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

function applyMask(value: string, rule: Extract<AnonRule, { type: "mask" }>): string {
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

export function compileRules(rules: AnonRule[]): { compiled: CompiledRule[]; warnings: string[] } {
  const compiled: CompiledRule[] = [];
  const warnings: string[] = [];

  rules.forEach((rule) => {
    if (rule.enabled === false) {
      return;
    }
    const fields = rule.fields.filter((field) => field === "booking_text");
    if (fields.length === 0) {
      return;
    }
    if (rule.type === "regex") {
      try {
        const regex = new RegExp(rule.pattern, rule.flags);
        compiled.push({
          id: rule.id,
          type: "regex",
          fields,
          regex,
          replacement: rule.replacement,
          enabled: rule.enabled,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unbekannter Fehler";
        warnings.push(`Regex-Regel "${rule.id}" konnte nicht geladen werden: ${message}`);
      }
    } else if (rule.type === "mask") {
      compiled.push({
        id: rule.id,
        type: "mask",
        fields,
        maskStrategy: rule.maskStrategy,
        maskChar: rule.maskChar,
        minLen: rule.minLen,
        maskPercent: rule.maskPercent,
        enabled: rule.enabled,
      });
    }
  });

  return { compiled, warnings };
}

export async function applyAnonymization(
  transactions: UnifiedTx[],
  rules: AnonRule[],
): Promise<AnonymizationResult> {
  const { compiled, warnings } = compileRules(rules);
  const anonymized = await Promise.all(
    transactions.map(async (tx) => {
      const clone: UnifiedTx = { ...tx };
      if (typeof clone.booking_hash !== "string" || clone.booking_hash.length === 0) {
        clone.booking_hash = await computeUnifiedTxHash(clone);
      }
      return clone;
    }),
  );

  compiled.forEach((rule) => {
    anonymized.forEach((entry) => {
      rule.fields.forEach((field) => {
        const current = entry[field];
        if (!current) {
          return;
        }
        if (rule.type === "regex") {
          entry[field] = current.replace(rule.regex, rule.replacement);
        } else if (rule.type === "mask") {
          entry[field] = applyMask(current, rule);
        }
      });
    });
  });

  return { data: anonymized, warnings };
}
