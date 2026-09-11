import type { ContractEvaluation, VerificationEvidence, VerificationReceipt } from "./types";

export function createVerificationReceipt(evaluation: ContractEvaluation, verification: VerificationEvidence[] = []): VerificationReceipt {
  return {
    receiptVersion: "1",
    contractId: evaluation.contractId,
    contractVersion: evaluation.contractVersion,
    status: evaluation.status,
    issuedAt: new Date().toISOString(),
    transcript: evaluation.transcript,
    fields: evaluation.fields,
    verification,
  };
}
