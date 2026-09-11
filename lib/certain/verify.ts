import { canonicalString, normalizeMoney } from "./normalize";
import type { ContractEvaluation, VerificationEvidence } from "./types";

export function repeatMatches(field: string, original: unknown, repeatedText: string): boolean {
  if (field === "amount" && original && typeof original === "object" && "amount" in original) {
    const repeated = normalizeMoney(repeatedText);
    return repeated?.amount === (original as { amount: number }).amount;
  }
  return canonicalString(String(original ?? "")) === canonicalString(repeatedText);
}

export function applyVerification(evaluation: ContractEvaluation, evidence: VerificationEvidence): ContractEvaluation {
  if (!evidence.matched) return evaluation;

  const fields = evaluation.fields.map((field) =>
    field.field === evidence.field && field.status === "requires_verification"
      ? { ...field, status: "verified" as const, evidence: [...field.evidence, `verification:${evidence.method}`] }
      : field,
  );

  const status = fields.some((field) => field.status === "blocked")
    ? "blocked"
    : fields.some((field) => field.status === "requires_verification")
      ? "requires_verification"
      : "verified";

  return { ...evaluation, fields, status };
}
