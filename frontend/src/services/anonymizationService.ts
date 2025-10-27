import { applyAnonymization } from "../anonymize";
import type { AnonRule, UnifiedTx } from "../types";

export interface AnonymizationSummary {
  warnings: string[];
  data: UnifiedTx[];
}

export async function anonymizeTransactions(
  transactions: UnifiedTx[],
  rules: AnonRule[],
): Promise<AnonymizationSummary> {
  const result = await applyAnonymization(transactions, rules);
  return {
    warnings: result.warnings,
    data: result.data,
  };
}
