import { describe, expect, it } from "vitest";
import {
  evaluateVoiceChallenge,
  generateVoiceChallenge,
  consumeVoiceChallenge,
} from "../lib/certain/challenge";
import { evaluatePaymentInstruction } from "../lib/certain/validate";
import { applyChallengeEvidence, applyVerification } from "../lib/certain/verify";
import { createVerificationReceipt } from "../lib/certain/receipt";

const createdAt = new Date("2026-09-13T12:00:00.000Z");

describe("fresh voice challenges", () => {
  it("generates an unpredictable expiring challenge with canonical expected tokens", () => {
    const first = generateVoiceChallenge(createdAt, 60_000);
    const second = generateVoiceChallenge(createdAt, 60_000);

    expect(first.id).toEqual(expect.any(String));
    expect(first.id).not.toBe(second.id);
    expect(first.createdAt).toBe(createdAt.toISOString());
    expect(first.expiresAt).toBe("2026-09-13T12:01:00.000Z");
    expect(first.expectedTokens.length).toBeGreaterThan(3);
    expect(first.prompt).toContain("Confirm");
    expect(first.usedAt).toBeUndefined();
  });

  it("uses a short but usable default expiry window", () => {
    const challenge = generateVoiceChallenge(createdAt);
    expect(challenge.expiresAt).toBe("2026-09-13T12:05:00.000Z");
  });

  it("matches the generated challenge phrase and consumes it once", () => {
    const challenge = generateVoiceChallenge(createdAt, 60_000);
    const transcript = { text: challenge.prompt };
    const consumed = consumeVoiceChallenge(challenge, transcript, new Date("2026-09-13T12:00:10.000Z"));

    expect(consumed.evidence.result).toBe("CHALLENGE_MATCH");
    expect(consumed.evidence.challengeId).toBe(challenge.id);
    expect(consumed.evidence.transcript).toBe(transcript);
    expect(consumed.challenge.usedAt).toBe("2026-09-13T12:00:10.000Z");

    const replay = evaluateVoiceChallenge(consumed.challenge, transcript, new Date("2026-09-13T12:00:11.000Z"));
    expect(replay.result).toBe("CHALLENGE_ALREADY_USED");
  });

  it("matches a numeric code when Dictation collapses spoken digits", () => {
    const challenge = generateVoiceChallenge(createdAt, 60_000);
    const match = challenge.prompt.match(/code (zero|one|two|three|four|five|six|seven|eight|nine) (zero|one|two|three|four|five|six|seven|eight|nine)/i);
    if (!match) throw new Error("Generated challenge did not contain a two-digit code");
    const values: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9" };
    const transcript = { text: challenge.prompt.replace(`${match[1]} ${match[2]}`, `${values[match[1].toLowerCase()]}${values[match[2].toLowerCase()]}`) };

    expect(evaluateVoiceChallenge(challenge, transcript, new Date("2026-09-13T12:00:10.000Z")).result).toBe("CHALLENGE_MATCH");
  });

  it("rejects wrong content and wrong numeric content", () => {
    const challenge = generateVoiceChallenge(createdAt, 60_000);
    const wrong = evaluateVoiceChallenge(challenge, { text: "Confirm a different vendor, code one two blue." }, createdAt);
    const wrongNumber = evaluateVoiceChallenge(challenge, {
      text: challenge.prompt.replace(/\b(one|two|three|four|five|six|seven|eight|nine|zero)\b/i, (token) => token.toLowerCase() === "nine" ? "one" : "nine"),
    }, createdAt);

    expect(wrong.result).toBe("CHALLENGE_MISMATCH");
    expect(wrongNumber.result).toBe("CHALLENGE_MISMATCH");
    expect(challenge.usedAt).toBeUndefined();
  });

  it("rejects an expired challenge before checking content", () => {
    const challenge = generateVoiceChallenge(createdAt, 60_000);
    const result = evaluateVoiceChallenge(challenge, { text: challenge.prompt }, new Date("2026-09-13T12:01:00.000Z"));

    expect(result.result).toBe("CHALLENGE_EXPIRED");
  });

  it("keeps challenge evidence required and cannot override a blocked contract", () => {
    const valid = evaluatePaymentInstruction(
      { text: "Pay Acme Labs $15,000 against invoice INV-14892 from Growth next Friday." },
      { referenceTime: createdAt, requireChallenge: true },
    );
    const amount = valid.fields.find((field) => field.field === "amount")?.value;
    let verifiedFields = applyVerification(valid, { field: "amount", method: "repeat_match", original: amount, repeated: "$15,000", matched: true });
    const invoice = verifiedFields.fields.find((field) => field.field === "invoiceId")?.value;
    verifiedFields = applyVerification(verifiedFields, { field: "invoiceId", method: "confirm", original: invoice, matched: true });
    expect(verifiedFields.status).toBe("requires_verification");

    const challenge = generateVoiceChallenge(createdAt, 60_000);
    const mismatch = evaluateVoiceChallenge(challenge, { text: "wrong challenge" }, new Date("2026-09-13T12:00:10.000Z"));
    expect(applyChallengeEvidence(verifiedFields, mismatch).status).toBe("requires_verification");

    const consumed = consumeVoiceChallenge(challenge, { text: challenge.prompt }, new Date("2026-09-13T12:00:11.000Z"));
    const complete = applyChallengeEvidence(verifiedFields, consumed.evidence);
    expect(complete.status).toBe("verified");
    expect(createVerificationReceipt(complete).challenge).toEqual(consumed.evidence);

    const blocked = evaluatePaymentInstruction(
      { text: "Pay Acme Labs $50,000 against invoice INV-14892 from Growth next Friday." },
      { referenceTime: createdAt, requireChallenge: true },
    );
    expect(applyChallengeEvidence(blocked, consumed.evidence).status).toBe("blocked");
  });
});
