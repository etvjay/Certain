import type { TranscriptEvidence } from "./types";

export type ChallengeResult =
  | "CHALLENGE_MATCH"
  | "CHALLENGE_MISMATCH"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_ALREADY_USED";

export interface VoiceChallenge {
  id: string;
  createdAt: string;
  expiresAt: string;
  prompt: string;
  expectedTokens: string[];
  usedAt?: string;
}

export interface ChallengeEvidence {
  challengeId: string;
  result: ChallengeResult;
  createdAt: string;
  expiresAt: string;
  checkedAt: string;
  expectedTokens: string[];
  observedTokens: string[];
  transcript: TranscriptEvidence;
}

const vendors = ["Acme Labs", "Northstar", "AssemblyAI"] as const;
const colors = ["amber", "blue", "green", "orange", "purple", "violet"] as const;
const digits = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"] as const;

function randomIndex(length: number): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0] % length;
}

const digitValues: Record<string, string> = Object.fromEntries(digits.map((digit, index) => [digit, String(index)]));

function challengeTokens(value: string): string[] {
  const tokens = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return tokens.flatMap((token) => {
    if (token in digitValues) return [digitValues[token]];
    if (/^\d+$/.test(token) && token.length > 1) return token.split("");
    return [token];
  });
}

export function generateVoiceChallenge(createdAt = new Date(), ttlMs = 5 * 60_000): VoiceChallenge {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("Challenge TTL must be positive.");
  const vendor = vendors[randomIndex(vendors.length)];
  const firstDigit = digits[randomIndex(digits.length)];
  const secondDigit = digits[randomIndex(digits.length)];
  const color = colors[randomIndex(colors.length)];
  const prompt = `Confirm ${vendor}, code ${firstDigit} ${secondDigit} ${color}.`;

  return {
    id: globalThis.crypto.randomUUID(),
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + ttlMs).toISOString(),
    prompt,
    expectedTokens: challengeTokens(prompt),
  };
}

export function evaluateVoiceChallenge(
  challenge: VoiceChallenge,
  transcript: TranscriptEvidence,
  checkedAt = new Date(),
): ChallengeEvidence {
  const expiresAt = Date.parse(challenge.expiresAt);
  const now = checkedAt.getTime();
  const expectedTokens = challenge.expectedTokens.map((token) => token.toLowerCase());
  const observedTokens = challengeTokens(transcript.text);
  let result: ChallengeResult;

  if (challenge.usedAt) result = "CHALLENGE_ALREADY_USED";
  else if (!Number.isFinite(expiresAt) || now >= expiresAt) result = "CHALLENGE_EXPIRED";
  else if (expectedTokens.length === observedTokens.length && expectedTokens.every((token, index) => token === observedTokens[index])) result = "CHALLENGE_MATCH";
  else result = "CHALLENGE_MISMATCH";

  return {
    challengeId: challenge.id,
    result,
    createdAt: challenge.createdAt,
    expiresAt: challenge.expiresAt,
    checkedAt: checkedAt.toISOString(),
    expectedTokens,
    observedTokens,
    transcript,
  };
}

export function consumeVoiceChallenge(
  challenge: VoiceChallenge,
  transcript: TranscriptEvidence,
  checkedAt = new Date(),
): { challenge: VoiceChallenge; evidence: ChallengeEvidence } {
  const evidence = evaluateVoiceChallenge(challenge, transcript, checkedAt);
  if (evidence.result !== "CHALLENGE_MATCH") return { challenge, evidence };
  return { challenge: { ...challenge, usedAt: evidence.checkedAt }, evidence };
}
