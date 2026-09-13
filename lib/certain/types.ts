export type VerificationRule = "none" | "required" | "repeat_match" | "on_uncertainty";
export type FieldStatus = "accepted" | "requires_verification" | "verified" | "blocked";
export type EvaluationStatus = "accepted" | "requires_verification" | "verified" | "blocked";

import type { DueDate } from "./dates";
export type { DueDate } from "./dates";

export interface TranscriptWord {
  text: string;
  confidence: number;
}

export interface TranscriptEvidence {
  text: string;
  cleanedText?: string | null;
  llmError?: string | null;
  confidence?: number;
  words?: TranscriptWord[];
  sessionId?: string;
  requestTimeMs?: number;
  syncTimeMs?: number;
  audioDurationMs?: number;
  provider?: "assemblyai";
  product?: "sync" | "dictation";
}

export interface PaymentInstruction {
  vendor?: string;
  amount?: { amount: number; currency: "USD" };
  invoiceId?: string;
  costCenter?: string;
  dueDate?: DueDate;
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
  provenance: {
    provider?: "assemblyai";
    product?: "sync" | "dictation";
    transcript: string;
    cleanedText?: string | null;
    llmError?: string | null;
    confidence?: number;
    sessionId?: string;
    requestTimeMs?: number;
    syncTimeMs?: number;
    audioDurationMs?: number;
  };
  transcript: TranscriptEvidence;
  fields: FieldEvaluation[];
  verification: Array<
    VerificationEvidence & {
      sessionId?: string;
      requestTimeMs?: number;
    }
  >;
  meaning: string;
}
