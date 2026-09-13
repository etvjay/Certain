import { canonicalString, normalizeMoney } from "./normalize";
import type { ChallengeEvidence } from "./challenge";
import type { ContractEvaluation, VerificationEvidence } from "./types";

function statusAfter(evaluation: ContractEvaluation, fields: ContractEvaluation["fields"]): ContractEvaluation["status"] {
  if (evaluation.violations.length > 0 || fields.some((field) => field.status === "blocked")) return "blocked";
  if (fields.some((field) => field.status === "requires_verification")) return "requires_verification";
  if (evaluation.challengeRequired && evaluation.challenge?.result !== "CHALLENGE_MATCH") return "requires_verification";
  return "verified";
}

export function repeatMatches(field: string, original: unknown, repeatedText: string): boolean {
  if (field === "amount" && original && typeof original === "object" && "amount" in original) {
    const repeated = normalizeMoney(repeatedText);
    return repeated?.amount === (original as { amount: number }).amount;
  }
  return canonicalString(String(original ?? "")) === canonicalString(repeatedText);
}

export function appendVerificationEvidence(items: VerificationEvidence[], evidence: VerificationEvidence): VerificationEvidence[] {
  if (!evidence.matched) return [...items, evidence];
  const duplicate = items.some(
    (item) => item.matched && item.field === evidence.field && item.method === evidence.method && JSON.stringify(item.original) === JSON.stringify(evidence.original),
  );
  return duplicate ? items : [...items, evidence];
}

export function applyVerification(evaluation: ContractEvaluation, evidence: VerificationEvidence): ContractEvaluation {
  if (!evidence.matched) return evaluation;

  const fields = evaluation.fields.map((field) =>
    field.field === evidence.field && field.status === "requires_verification"
      ? { ...field, status: "verified" as const, evidence: [...field.evidence, `verification:${evidence.method}`] }
      : field,
  );

  return { ...evaluation, fields, status: statusAfter(evaluation, fields) };
}

export function applyChallengeEvidence(evaluation: ContractEvaluation, evidence: ChallengeEvidence): ContractEvaluation {
  const next = { ...evaluation, challenge: evidence };
  return { ...next, status: statusAfter(next, next.fields) };
}
