import type { ContractEvaluation, VerificationEvidence, VerificationReceipt } from "./types";

/**
 * Build an inspectable Verification Receipt.
 *
 * The receipt is evidence, not authority: it records exactly which contract
 * was evaluated, what AssemblyAI heard (raw transcript plus session/timing
 * provenance when available), what each field resolved to, and which
 * verification steps were satisfied. It never implies truth about the world,
 * authorization to act, or permission to spend.
 */
export function createVerificationReceipt(
  evaluation: ContractEvaluation,
  verification: VerificationEvidence[] = [],
): VerificationReceipt {
  return {
    receiptVersion: "1",
    contractId: evaluation.contractId,
    contractVersion: evaluation.contractVersion,
    status: evaluation.status,
    issuedAt: new Date().toISOString(),
    provenance: {
      transcript: evaluation.transcript.text,
      confidence: evaluation.transcript.confidence,
      sessionId: evaluation.transcript.sessionId,
      requestTimeMs: evaluation.transcript.requestTimeMs,
    },
    transcript: evaluation.transcript,
    fields: evaluation.fields.map((field) => ({
      field: field.field,
      value: field.value,
      status: field.status,
      rule: field.rule,
      evidence: field.evidence,
      violations: field.violations,
    })),
    verification: verification.map((item) => ({
      field: item.field,
      method: item.method,
      original: item.original,
      repeated: item.repeated,
      matched: item.matched,
      sessionId: item.transcript?.sessionId,
      requestTimeMs: item.transcript?.requestTimeMs,
      transcript: item.transcript,
    })),
    meaning:
      "VERIFIED means the declared application contract and its required verification steps were satisfied. It does not mean the statement is true, and it does not authorize any downstream action.",
  };
}
