import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeWithAssemblyAI } from "../lib/assemblyai";
import { extractPaymentInstruction } from "../lib/certain/extract";
import { createVerificationReceipt } from "../lib/certain/receipt";
import { applyVerification, appendVerificationEvidence, repeatMatches } from "../lib/certain/verify";
import { evaluatePaymentInstruction } from "../lib/certain/validate";
import type { TranscriptEvidence } from "../lib/certain/types";

// Saturday 2026-09-12. Fixed so date expectations never depend on the run day.
const REF = "2026-09-12T12:00:00.000Z";
const NEXT_FRIDAY_ISO = "2026-09-18";

const validText = "Pay Acme Labs $15,000 against invoice INV-14892 from Growth next Friday.";

function transcript(text: string, extra: Partial<TranscriptEvidence> = {}): TranscriptEvidence {
  return { text, ...extra };
}

describe("Certain payment_instruction/v1", () => {
  it("requires verification for a valid consequential instruction", () => {
    const result = evaluatePaymentInstruction(transcript(validText, { confidence: 0.98 }), { referenceTime: REF });
    expect(result.fields.map((field) => [field.field, field.status, field.violations])).toEqual([
      ["vendor", "accepted", []],
      ["amount", "requires_verification", []],
      ["invoiceId", "requires_verification", []],
      ["costCenter", "accepted", []],
      ["dueDate", "accepted", []],
    ]);
    expect(result.status).toBe("requires_verification");
  });

  it("normalizes next Friday to a canonical typed date", () => {
    const result = evaluatePaymentInstruction(transcript(validText), { referenceTime: REF });
    const due = result.fields.find((field) => field.field === "dueDate")?.value as { raw: string; iso: string };
    expect(due).toEqual({ raw: "next Friday", iso: NEXT_FRIDAY_ISO });
  });

  it("resolves due dates deterministically from the reference time", () => {
    const first = extractPaymentInstruction(validText, { referenceTime: REF });
    const second = extractPaymentInstruction(validText, { referenceTime: REF });
    expect(first.dueDate).toEqual(second.dueDate);
    expect(first.dueDate?.iso).toBe(NEXT_FRIDAY_ISO);
    expect(extractPaymentInstruction("Pay Acme Labs $15,000 against invoice INV-14892 from Growth tomorrow morning.", { referenceTime: REF }).dueDate?.iso).toBe("2026-09-13");
  });

  it("blocks a non-future due date under futureOnly", () => {
    const result = evaluatePaymentInstruction(
      transcript("Pay Acme Labs $15,000 against invoice INV-14892 from Growth today."),
      { referenceTime: REF },
    );
    expect(result.status).toBe("blocked");
    expect(result.violations.join(" ")).toContain("not in the future");
  });

  it("requires an amount repeat even at 0.99 confidence", () => {
    const result = evaluatePaymentInstruction(transcript(validText, { confidence: 0.99 }), { referenceTime: REF });
    expect(result.fields.find((field) => field.field === "amount")?.status).toBe("requires_verification");
    expect(result.status).toBe("requires_verification");
  });

  it("requires explicit invoice confirmation even at 0.99 confidence", () => {
    const result = evaluatePaymentInstruction(transcript(validText, { confidence: 0.99 }), { referenceTime: REF });
    expect(result.fields.find((field) => field.field === "invoiceId")?.status).toBe("requires_verification");
  });

  it("blocks an amount above the application contract even when transcription is valid", () => {
    const result = evaluatePaymentInstruction(
      transcript("Pay Acme Labs $50,000 against invoice INV-14892 from Growth next Friday.", { confidence: 0.99 }),
      { referenceTime: REF },
    );
    expect(result.status).toBe("blocked");
    expect(result.violations.join(" ")).toContain("25000 USD");
  });

  it("blocks malformed invoice IDs", () => {
    const result = evaluatePaymentInstruction(
      transcript("Pay Acme Labs $15,000 against invoice INV-ABC from Growth next Friday."),
      { referenceTime: REF },
    );
    expect(result.status).toBe("blocked");
  });

  it("blocks unknown vendors", () => {
    const result = evaluatePaymentInstruction(
      transcript("Pay Unknown Co $15,000 against invoice INV-14892 from Growth next Friday."),
      { referenceTime: REF },
    );
    expect(result.status).toBe("blocked");
  });

  it("blocks unknown cost centers", () => {
    const result = evaluatePaymentInstruction(
      transcript("Pay Acme Labs $15,000 against invoice INV-14892 from Marketing next Friday."),
      { referenceTime: REF },
    );
    expect(result.status).toBe("blocked");
  });

  it("blocks a missing required field", () => {
    const result = evaluatePaymentInstruction(transcript("Pay Acme Labs against invoice INV-14892 from Growth next Friday."), {
      referenceTime: REF,
    });
    expect(result.status).toBe("blocked");
    expect(result.violations.join(" ")).toContain("Amount is missing");
  });

  it("normalizes spoken and numeric money for repeat matching", () => {
    const result = evaluatePaymentInstruction(transcript(validText), { referenceTime: REF });
    const amount = result.fields.find((field) => field.field === "amount")?.value;
    expect(repeatMatches("amount", amount, "fifteen thousand dollars")).toBe(true);
    expect(repeatMatches("amount", amount, "Fifteen thousand dollars.")).toBe(true);
    expect(repeatMatches("amount", amount, "$15,000")).toBe(true);
    expect(repeatMatches("amount", amount, "fifty thousand dollars")).toBe(false);
  });

  it("keeps a mismatched repeat unresolved", () => {
    const result = evaluatePaymentInstruction(transcript(validText), { referenceTime: REF });
    const amount = result.fields.find((field) => field.field === "amount")?.value;
    const next = applyVerification(result, { field: "amount", method: "repeat_match", original: amount, repeated: { amount: 50_000, currency: "USD" }, matched: false });
    expect(next.status).toBe("requires_verification");
    expect(next.fields.find((field) => field.field === "amount")?.status).toBe("requires_verification");
  });

  it("does not duplicate a successful verification evidence entry", () => {
    const evidence = { field: "amount" as const, method: "repeat_match" as const, original: { amount: 15000, currency: "USD" as const }, repeated: "Fifteen thousand dollars.", matched: true };
    const once = appendVerificationEvidence([], evidence);
    const twice = appendVerificationEvidence(once, { ...evidence });
    const differentlyPunctuated = appendVerificationEvidence(once, { ...evidence, repeated: "fifteen thousand dollars" });
    expect(once).toHaveLength(1);
    expect(twice).toHaveLength(1);
    expect(differentlyPunctuated).toHaveLength(1);
  });

  it("keeps a failed attempt and a later successful verification distinct", () => {
    const failed = { field: "amount" as const, method: "repeat_match" as const, original: { amount: 15000, currency: "USD" as const }, repeated: "Fifty thousand dollars.", matched: false };
    const passed = { field: "amount" as const, method: "repeat_match" as const, original: { amount: 15000, currency: "USD" as const }, repeated: "Fifteen thousand dollars.", matched: true };
    expect(appendVerificationEvidence([failed], passed)).toHaveLength(2);
  });

  it("transitions a matched repeated amount to verified while leaving other required fields explicit", () => {
    const result = evaluatePaymentInstruction(transcript(validText), { referenceTime: REF });
    const amount = result.fields.find((field) => field.field === "amount")?.value;
    const next = applyVerification(result, { field: "amount", method: "repeat_match", original: amount, repeated: amount, matched: true });
    expect(next.fields.find((field) => field.field === "amount")?.status).toBe("verified");
    expect(next.status).toBe("requires_verification");
  });

  it("marks a low-confidence vendor as requires_verification instead of auto-verifying", () => {
    const uncertain = transcript(validText, {
      confidence: 0.62,
      words: [
        { text: "Pay", confidence: 0.99 },
        { text: "Acme", confidence: 0.41 },
        { text: "Labs", confidence: 0.38 },
        { text: "fifteen", confidence: 0.99 },
      ],
    });
    const result = evaluatePaymentInstruction(uncertain, { referenceTime: REF });
    expect(result.fields.find((field) => field.field === "vendor")?.status).toBe("requires_verification");
    expect(result.status).toBe("requires_verification");
  });

  it("resolves vendor uncertainty through explicit confirmation", () => {
    const uncertain = transcript(validText, {
      words: [
        { text: "Acme", confidence: 0.41 },
        { text: "Labs", confidence: 0.38 },
      ],
    });
    const pending = evaluatePaymentInstruction(uncertain, { referenceTime: REF });
    expect(pending.fields.find((field) => field.field === "vendor")?.status).toBe("requires_verification");
    const vendor = pending.fields.find((field) => field.field === "vendor")?.value;
    const next = applyVerification(pending, { field: "vendor", method: "confirm", original: vendor, matched: true });
    expect(next.fields.find((field) => field.field === "vendor")?.status).toBe("verified");
  });

  it("never promotes a blocked field to verified through confirmation", () => {
    const blocked = evaluatePaymentInstruction(
      transcript("Pay Acme Labs $50,000 against invoice INV-14892 from Growth next Friday."),
      { referenceTime: REF },
    );
    expect(blocked.status).toBe("blocked");
    const amount = blocked.fields.find((field) => field.field === "amount")?.value;
    const next = applyVerification(blocked, { field: "amount", method: "repeat_match", original: amount, repeated: amount, matched: true });
    expect(next.status).toBe("blocked");
    expect(next.fields.find((field) => field.field === "amount")?.status).toBe("blocked");
  });

  it("reaches VERIFIED only after every required verification is satisfied", () => {
    let result = evaluatePaymentInstruction(transcript(validText), { referenceTime: REF });
    const amount = result.fields.find((field) => field.field === "amount")?.value;
    result = applyVerification(result, { field: "amount", method: "repeat_match", original: amount, repeated: amount, matched: true });
    expect(result.status).toBe("requires_verification");
    const invoice = result.fields.find((field) => field.field === "invoiceId")?.value;
    result = applyVerification(result, { field: "invoiceId", method: "confirm", original: invoice, matched: true });
    expect(result.status).toBe("verified");
    const receipt = createVerificationReceipt(result, [
      { field: "amount", method: "repeat_match", original: amount, repeated: amount, matched: true },
      { field: "invoiceId", method: "confirm", original: invoice, matched: true },
    ]);
    expect(receipt.status).toBe("verified");
  });

  it("emits a receipt with the contract identity and field evidence", () => {
    const result = evaluatePaymentInstruction(transcript(validText), { referenceTime: REF });
    const receipt = createVerificationReceipt(result);
    expect(receipt.contractId).toBe("payment_instruction");
    expect(receipt.contractVersion).toBe("1");
    expect(receipt.fields.length).toBe(5);
  });

  it("keeps raw transcript and session provenance in the receipt", () => {
    const heard = transcript(validText, { confidence: 0.98, sessionId: "session-123", requestTimeMs: 210.5 });
    const receipt = createVerificationReceipt(evaluatePaymentInstruction(heard, { referenceTime: REF }));
    expect(receipt.provenance.transcript).toBe(validText);
    expect(receipt.provenance.sessionId).toBe("session-123");
    expect(receipt.provenance.requestTimeMs).toBe(210.5);
  });

  it("keeps Dictation product and cleanup provenance in the receipt", () => {
    const heard = transcript(validText, {
      provider: "assemblyai",
      product: "dictation",
      cleanedText: "Pay Acme Labs $15,000 against invoice INV-14892 from Growth next Friday.",
      llmError: null,
      syncTimeMs: 120,
      audioDurationMs: 9216,
      sessionId: "dictation-session",
    });
    const receipt = createVerificationReceipt(evaluatePaymentInstruction(heard, { referenceTime: REF }));
    expect(receipt.provenance.provider).toBe("assemblyai");
    expect(receipt.provenance.product).toBe("dictation");
    expect(receipt.provenance.cleanedText).toContain("$15,000");
    expect(receipt.provenance.syncTimeMs).toBe(120);
    expect(receipt.provenance.audioDurationMs).toBe(9216);
  });

  it("keeps Dictation cleanup separate from the amount verification policy", () => {
    const heard = transcript("Send 10,000 sorry 15,000 dollars to Notstar", {
      provider: "assemblyai",
      product: "dictation",
      cleanedText: "Send 15,000 dollars to Notstar",
      llmError: null,
    });
    const result = evaluatePaymentInstruction(heard, { referenceTime: REF });
    const amount = result.fields.find((field) => field.field === "amount");
    expect(heard.text).toBe("Send 10,000 sorry 15,000 dollars to Notstar");
    expect(heard.cleanedText).toBe("Send 15,000 dollars to Notstar");
    expect(amount?.value).toEqual({ amount: 15_000, currency: "USD" });
    expect(amount?.status).toBe("requires_verification");
    expect(result.status).toBe("blocked");
  });

  it("keeps experimental speaker evidence supplementary to a blocked contract", () => {
    const blocked = evaluatePaymentInstruction(transcript("Pay Acme Labs $50,000 against invoice INV-14892 from Growth next Friday."), { referenceTime: REF });
    const speaker = {
      experimental: true as const,
      profileId: "local-profile-1",
      model: "deferred",
      modelVersion: "not-run",
      metric: "cosine_similarity",
      score: 0.99,
      threshold: null,
      decision: "match" as const,
      sampleCount: 3,
    };
    const receipt = createVerificationReceipt(blocked, [], { speaker });

    expect(receipt.status).toBe("blocked");
    expect(receipt.speaker).toEqual(speaker);
    expect(JSON.stringify(receipt)).not.toContain("audio");
    expect(JSON.stringify(receipt)).not.toContain("embedding");
  });

  it("never infers authorization from verification", () => {
    const result = evaluatePaymentInstruction(transcript(validText), { referenceTime: REF });
    const receipt = createVerificationReceipt(result);
    expect(JSON.stringify(receipt).toLowerCase()).not.toContain("authorized");
    expect(receipt.meaning.toLowerCase()).toContain("does not authorize");
    expect(["accepted", "requires_verification", "verified", "blocked"]).toContain(receipt.status);
  });

  it("produces no VERIFIED receipt while required verification is unresolved", () => {
    const result = evaluatePaymentInstruction(transcript(validText), { referenceTime: REF });
    const receipt = createVerificationReceipt(result);
    expect(receipt.status).toBe("requires_verification");
    expect(receipt.status).not.toBe("verified");
  });
});

describe("AssemblyAI boundary", () => {
  const savedKey = process.env.ASSEMBLYAI_API_KEY;
  const savedFetch = globalThis.fetch;

  afterEach(() => {
    if (savedKey === undefined) delete process.env.ASSEMBLYAI_API_KEY;
    else process.env.ASSEMBLYAI_API_KEY = savedKey;
    globalThis.fetch = savedFetch;
    vi.unstubAllGlobals();
  });

  it("throws without fabricating a transcript when the key is missing", async () => {
    delete process.env.ASSEMBLYAI_API_KEY;
    await expect(transcribeWithAssemblyAI(new Blob(["x"]))).rejects.toThrow("ASSEMBLYAI_API_KEY");
  });

  it("throws without fabricating a transcript when AssemblyAI errors", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key-that-is-never-a-real-secret";
    globalThis.fetch = (async () =>
      new Response("upstream unavailable", { status: 503 })) as typeof fetch;
    await expect(transcribeWithAssemblyAI(new Blob(["x"]))).rejects.toThrow("AssemblyAI Dictation failed (503)");
  });

  it("never emits a VERIFIED receipt from a failed transcription", () => {
    const failed = evaluatePaymentInstruction(transcript(""), { referenceTime: REF });
    expect(failed.status).toBe("blocked");
    expect(createVerificationReceipt(failed).status).toBe("blocked");
  });
});
