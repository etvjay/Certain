import { canonicalString } from "./normalize";
import type { PaymentInstruction } from "./types";

export type SpecificationStatus = "MATCH" | "MISMATCH" | "INCOMPLETE";
export type SpecificationField = "vendor" | "amount" | "invoiceId" | "costCenter";

type EqualsStringField = { mode: "equals"; value: string };
type EqualsAmountField = { mode: "equals"; value: number; currency: "USD" };

export interface PaymentSpecification {
  id: string;
  version: string;
  type: "payment_instruction/v1";
  fields: {
    vendor: EqualsStringField;
    amount: EqualsAmountField;
    invoiceId: EqualsStringField;
    costCenter: EqualsStringField;
  };
}

export interface SpecificationFieldEvidence {
  field: SpecificationField;
  expected: unknown;
  observed?: unknown;
  matched: boolean;
}

export interface SpecificationComparison {
  specificationId: string;
  specificationVersion: string;
  specificationType: PaymentSpecification["type"];
  specHash: string | null;
  status: SpecificationStatus;
  fields: SpecificationFieldEvidence[];
}

export const PREACCEPTED_PAYMENT_SPEC = {
  id: "payment-approval-001",
  version: "1",
  type: "payment_instruction/v1",
  fields: {
    vendor: { mode: "equals", value: "Acme Labs" },
    amount: { mode: "equals", value: 15_000, currency: "USD" },
    invoiceId: { mode: "equals", value: "INV-14892" },
    costCenter: { mode: "equals", value: "Growth" },
  },
} as const satisfies PaymentSpecification;

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const result = JSON.stringify(value);
    if (result === undefined) throw new Error("Specification contains an unsupported primitive.");
    return result;
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new Error("Specification contains an unsupported value.");
}

export function canonicalizePaymentSpecification(specification: PaymentSpecification): string {
  return canonicalize(specification);
}

export async function hashPaymentSpecification(specification: PaymentSpecification): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalizePaymentSpecification(specification)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const PREACCEPTED_CANONICAL = canonicalizePaymentSpecification(PREACCEPTED_PAYMENT_SPEC);

// Filled from PREACCEPTED_CANONICAL and checked by the specification tests.
export const PREACCEPTED_PAYMENT_SPEC_HASH = "b3f0d50ef7cc754ab11df7df007cda604ea115af4a422e50d8f2ce2f52747656";

function knownSpecificationHash(specification: PaymentSpecification): string | null {
  return canonicalizePaymentSpecification(specification) === PREACCEPTED_CANONICAL
    ? PREACCEPTED_PAYMENT_SPEC_HASH
    : null;
}

function canonicalTypedValue(field: SpecificationField, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (field === "amount") {
    if (!value || typeof value !== "object" || !("amount" in value) || !("currency" in value)) return value;
    const amount = value as { amount: number; currency: string };
    return { amount: amount.amount, currency: amount.currency.toUpperCase() };
  }
  return canonicalString(String(value));
}

function typedValuesMatch(field: SpecificationField, expected: unknown, observed: unknown): boolean {
  return JSON.stringify(canonicalTypedValue(field, expected)) === JSON.stringify(canonicalTypedValue(field, observed));
}

export function comparePaymentSpecification(
  specification: PaymentSpecification,
  observed: PaymentInstruction,
  specHash = knownSpecificationHash(specification),
): SpecificationComparison {
  const fields = (Object.keys(specification.fields) as SpecificationField[]).sort().map((field) => {
    const fieldSpecification = specification.fields[field];
    const expected = field === "amount"
      ? { amount: (fieldSpecification as EqualsAmountField).value, currency: (fieldSpecification as EqualsAmountField).currency }
      : fieldSpecification.value;
    const observedValue = observed[field];
    return {
      field,
      expected,
      observed: observedValue,
      matched: observedValue !== undefined && typedValuesMatch(field, expected, observedValue),
    } satisfies SpecificationFieldEvidence;
  });
  const status = fields.some((field) => field.observed === undefined)
    ? "INCOMPLETE"
    : fields.every((field) => field.matched)
      ? "MATCH"
      : "MISMATCH";

  return {
    specificationId: specification.id,
    specificationVersion: specification.version,
    specificationType: specification.type,
    specHash,
    status,
    fields,
  };
}
