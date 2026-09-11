export type VerificationRule = "none" | "required" | "repeat_match" | "on_uncertainty";
export type FieldStatus = "accepted" | "requires_verification" | "verified" | "blocked";
export type EvaluationStatus = "accepted" | "requires_verification" | "verified" | "blocked";

export interface TranscriptWord {
  text: string;
  confidence: number;
}

export interface TranscriptEvidence {
  text: string;
  confidence?: number;
  words?: TranscriptWord[];
  sessionId?: string;
  requestTimeMs?: number;
}

export interface PaymentInstruction {
  vendor?: string;
  amount?: { amount: number; currency: "USD" };
  invoiceId?: string;
  costCenter?: string;
  dueDate?: string;
}

export interface FieldEvaluation<T = unknown> {
  field: keyof PaymentInstruction;
  value?: T;
  status: FieldStatus;
  rule: VerificationRule;
  evidence: string[];
  violations: string[];
}

export interface ContractEvaluation {
  contractId: string;
  contractVersion: string;
  status: EvaluationStatus;
  transcript: TranscriptEvidence;
  fields: FieldEvaluation[];
  violations: string[];
}

export interface VerificationEvidence {
  field: keyof PaymentInstruction;
  method: "confirm" | "repeat_match";
  original: unknown;
  repeated?: unknown;
  matched: boolean;
  transcript?: TranscriptEvidence;
}

export interface VerificationReceipt {
  receiptVersion: "1";
  contractId: string;
  contractVersion: string;
  status: EvaluationStatus;
  issuedAt: string;
  transcript: TranscriptEvidence;
  fields: FieldEvaluation[];
  verification: VerificationEvidence[];
}
