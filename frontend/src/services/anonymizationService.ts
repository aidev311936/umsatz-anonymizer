import { applyAnonymization } from "../anonymize";
import type { AnonRule, UnifiedTx } from "../types";

export interface AnonymizationSummary {
  warnings: string[];
  data: UnifiedTx[];
}

export function anonymizeTransactions(
  transactions: UnifiedTx[],
  rules: AnonRule[],
): AnonymizationSummary {
  const result = applyAnonymization(transactions, rules);
  return {
    warnings: result.warnings,
    data: result.data,
  };
}
