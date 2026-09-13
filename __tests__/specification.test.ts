import { describe, expect, it } from "vitest";
import {
  PREACCEPTED_PAYMENT_SPEC,
  comparePaymentSpecification,
  hashPaymentSpecification,
  type PaymentSpecification,
} from "../lib/certain/specification";
import { extractPaymentInstruction } from "../lib/certain/extract";
import { evaluatePaymentInstruction } from "../lib/certain/validate";
import { applyVerification } from "../lib/certain/verify";
import { createVerificationReceipt } from "../lib/certain/receipt";
import type { PaymentInstruction } from "../lib/certain/types";

const REF = "2026-09-12T12:00:00.000Z";
const validText = "Pay Acme Labs $15,000 against invoice INV-14892 from Growth next Friday.";

function observed(overrides: Partial<PaymentInstruction> = {}): PaymentInstruction {
  return {
    vendor: "Acme Labs",
    amount: { amount: 15_000, currency: "USD" },
    invoiceId: "INV-14892",
    costCenter: "Growth",
    ...overrides,
  };
}

describe("preaccepted payment specification", () => {
  it("uses the bounded payment specification shape", () => {
    expect(PREACCEPTED_PAYMENT_SPEC.fields.amount).toEqual({ mode: "equals", value: 15000, currency: "USD" });
  });

  it("hashes the same semantic specification identically when field order changes", async () => {
    const reordered: PaymentSpecification = {
      type: "payment_instruction/v1",
      fields: {
        costCenter: { mode: "equals", value: "Growth" },
        invoiceId: { mode: "equals", value: "INV-14892" },
        amount: { mode: "equals", value: 15_000, currency: "USD" },
        vendor: { mode: "equals", value: "Acme Labs" },
      },
      version: "1",
      id: "payment-approval-001",
    };

    expect(await hashPaymentSpecification(PREACCEPTED_PAYMENT_SPEC)).toBe(await hashPaymentSpecification(reordered));
  });

  it("keeps the published preaccepted specification hash pinned", async () => {
    expect(await hashPaymentSpecification(PREACCEPTED_PAYMENT_SPEC)).toBe("b3f0d50ef7cc754ab11df7df007cda604ea115af4a422e50d8f2ce2f52747656");
  });

  it("changes the hash when one specification value changes", async () => {
    const mutated: PaymentSpecification = {
      ...PREACCEPTED_PAYMENT_SPEC,
      fields: {
        ...PREACCEPTED_PAYMENT_SPEC.fields,
        amount: { mode: "equals", value: 15_001, currency: "USD" },
      },
    };

    expect(await hashPaymentSpecification(PREACCEPTED_PAYMENT_SPEC)).not.toBe(await hashPaymentSpecification(mutated));
  });

  it("normalizes equivalent money speech without collapsing consequential neighbors", () => {
    const spoken = ["$15,000", "fifteen thousand dollars", "15000 USD"].map((amount) =>
      extractPaymentInstruction(`Pay Acme Labs ${amount} against invoice INV-14892 from Growth next Friday.`, { referenceTime: REF }),
    );
    expect(spoken.map((value) => comparePaymentSpecification(PREACCEPTED_PAYMENT_SPEC, value).status)).toEqual(["MATCH", "MATCH", "MATCH"]);

    const fifty = extractPaymentInstruction("Pay Acme Labs fifty thousand dollars against invoice INV-14892 from Growth next Friday.", { referenceTime: REF });
    const neighboringInvoice = extractPaymentInstruction("Pay Acme Labs $15,000 against invoice INV-14829 from Growth next Friday.", { referenceTime: REF });
    expect(fifty.amount).toEqual({ amount: 50_000, currency: "USD" });
    expect(comparePaymentSpecification(PREACCEPTED_PAYMENT_SPEC, fifty).status).toBe("MISMATCH");
    expect(neighboringInvoice.invoiceId).toBe("INV-14829");
    expect(comparePaymentSpecification(PREACCEPTED_PAYMENT_SPEC, neighboringInvoice).status).toBe("MISMATCH");
  });

  it("compares canonical typed values and exposes field evidence", () => {
    const extracted = extractPaymentInstruction("Pay Acme Labs fifteen thousand dollars against invoice INV-14892 from Growth next Friday.", { referenceTime: REF });
    const result = comparePaymentSpecification(PREACCEPTED_PAYMENT_SPEC, extracted);

    expect(result.status).toBe("MATCH");
    expect(result.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "vendor",
        expected: "Acme Labs",
        observed: "Acme Labs",
        matched: true,
      }),
      expect.objectContaining({
        field: "amount",
        expected: { amount: 15_000, currency: "USD" },
        observed: { amount: 15_000, currency: "USD" },
        matched: true,
      }),
      expect.objectContaining({ field: "invoiceId", expected: "INV-14892", observed: "INV-14892", matched: true }),
    ]));
  });

  it("returns MISMATCH for a wrong amount or cost center", () => {
    const amountResult = comparePaymentSpecification(PREACCEPTED_PAYMENT_SPEC, observed({ amount: { amount: 50_000, currency: "USD" } }));
    const costCenterResult = comparePaymentSpecification(PREACCEPTED_PAYMENT_SPEC, observed({ costCenter: "Engineering" }));

    expect(amountResult.status).toBe("MISMATCH");
    expect(amountResult.fields.find((field) => field.field === "amount")).toMatchObject({ matched: false, observed: { amount: 50_000, currency: "USD" } });
    expect(costCenterResult.status).toBe("MISMATCH");
    expect(costCenterResult.fields.find((field) => field.field === "costCenter")).toMatchObject({ matched: false, observed: "Engineering" });
  });

  it("returns INCOMPLETE when a specified field is absent", () => {
    const result = comparePaymentSpecification(PREACCEPTED_PAYMENT_SPEC, observed({ invoiceId: undefined }));
    expect(result.status).toBe("INCOMPLETE");
    expect(result.fields.find((field) => field.field === "invoiceId")).toMatchObject({ matched: false, observed: undefined });
  });

  it("keeps amount repeat verification required after a specification match", () => {
    const result = evaluatePaymentInstruction({ text: validText }, { referenceTime: REF });
    expect(result.specification?.status).toBe("MATCH");
    expect(result.fields.find((field) => field.field === "amount")?.status).toBe("requires_verification");
  });

  it("records the canonical specification comparison in a receipt", () => {
    const result = evaluatePaymentInstruction({ text: validText }, { referenceTime: REF });
    const receipt = createVerificationReceipt(result);
    expect(receipt.specification).toMatchObject({
      specificationId: "payment-approval-001",
      specificationVersion: "1",
      specHash: "b3f0d50ef7cc754ab11df7df007cda604ea115af4a422e50d8f2ce2f52747656",
      status: "MATCH",
    });
    expect(receipt.specification.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "amount", expected: { amount: 15_000, currency: "USD" }, matched: true }),
    ]));
  });

  it("cannot promote a specification mismatch or contract violation", () => {
    const blocked = evaluatePaymentInstruction({ text: "Pay Acme Labs $50,000 against invoice INV-14892 from Growth next Friday." }, { referenceTime: REF });
    const amount = blocked.fields.find((field) => field.field === "amount")?.value;
    const afterAttemptedRepeat = applyVerification(blocked, { field: "amount", method: "repeat_match", original: amount, repeated: "$50,000", matched: true });

    expect(blocked.specification.status).toBe("MISMATCH");
    expect(blocked.fields.find((field) => field.field === "amount")).toMatchObject({ status: "blocked", value: { amount: 50_000, currency: "USD" } });
    expect(blocked.status).toBe("blocked");
    expect(afterAttemptedRepeat.status).toBe("blocked");
    expect(afterAttemptedRepeat.fields.find((field) => field.field === "amount")?.status).toBe("blocked");
  });
});
