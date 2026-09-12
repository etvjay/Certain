import { describe, expect, it } from "vitest";
import { evaluatePaymentInstruction } from "../lib/certain/validate";
import { applyVerification, repeatMatches } from "../lib/certain/verify";
import { createVerificationReceipt } from "../lib/certain/receipt";

const validText = "Pay Acme Labs $15,000 against invoice INV-14892 from Growth next Friday.";

describe("Certain payment_instruction/v1", () => {
  it("requires verification for a valid consequential instruction", () => {
    const result = evaluatePaymentInstruction({ text: validText, confidence: 0.98 });
    expect(result.fields.map((field) => [field.field, field.status, field.violations])).toEqual([
      ["vendor", "accepted", []],
      ["amount", "requires_verification", []],
      ["invoiceId", "requires_verification", []],
      ["costCenter", "accepted", []],
      ["dueDate", "accepted", []],
    ]);
    expect(result.status).toBe("requires_verification");
  });

  it("blocks an amount above the application contract even when transcription is valid", () => {
    const result = evaluatePaymentInstruction({ text: "Pay Acme Labs $50,000 against invoice INV-14892 from Growth next Friday.", confidence: 0.99 });
    expect(result.status).toBe("blocked");
    expect(result.violations.join(" ")).toContain("25000 USD");
  });

  it("blocks malformed invoice IDs", () => {
    const result = evaluatePaymentInstruction({ text: "Pay Acme Labs $15,000 against invoice INV-ABC from Growth next Friday." });
    expect(result.status).toBe("blocked");
  });

  it("blocks unknown vendors", () => {
    const result = evaluatePaymentInstruction({ text: "Pay Unknown Co $15,000 against invoice INV-14892 from Growth next Friday." });
    expect(result.status).toBe("blocked");
  });

  it("normalizes spoken and numeric money for repeat matching", () => {
    const result = evaluatePaymentInstruction({ text: validText });
    const amount = result.fields.find((field) => field.field === "amount")?.value;
    expect(repeatMatches("amount", amount, "fifteen thousand dollars")).toBe(true);
    expect(repeatMatches("amount", amount, "fifty thousand dollars")).toBe(false);
  });

  it("keeps a mismatched repeat unresolved", () => {
    const result = evaluatePaymentInstruction({ text: validText });
    const amount = result.fields.find((field) => field.field === "amount")?.value;
    const next = applyVerification(result, { field: "amount", method: "repeat_match", original: amount, repeated: { amount: 50_000, currency: "USD" }, matched: false });
    expect(next.status).toBe("requires_verification");
  });

  it("transitions a matched repeated amount to verified while leaving other required fields explicit", () => {
    const result = evaluatePaymentInstruction({ text: validText });
    const amount = result.fields.find((field) => field.field === "amount")?.value;
    const next = applyVerification(result, { field: "amount", method: "repeat_match", original: amount, repeated: amount, matched: true });
    expect(next.fields.find((field) => field.field === "amount")?.status).toBe("verified");
    expect(next.status).toBe("requires_verification");
  });

  it("emits a receipt with the contract identity and field evidence", () => {
    const result = evaluatePaymentInstruction({ text: validText });
    const receipt = createVerificationReceipt(result);
    expect(receipt.contractId).toBe("payment_instruction");
    expect(receipt.contractVersion).toBe("1");
    expect(receipt.fields.length).toBe(5);
  });
});
