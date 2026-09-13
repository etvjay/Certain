import type { TranscriptEvidence } from "../certain/types";

export const dictationEndpoint = "https://dictation.assemblyai.com/v1/transcribe/live";

/**
 * Bounded recognition context for Certain's payment_instruction/v1 demo.
 * This is substrate context, not transcript repair.
 */
export const paymentInstructionRecognitionContext = {
  stt_prompt:
    "A payment instruction naming a vendor, a dollar amount, an invoice ID like INV-14892, a cost center, and a due date.",
  keyterms_prompt: ["Acme Labs", "Northstar", "AssemblyAI", "Engineering", "Growth", "Operations"],
} as const;

export const voiceChallengeRecognitionContext = {
  stt_prompt: "A short spoken confirmation challenge containing a vendor name, spoken digits, and a color.",
  keyterms_prompt: ["Acme Labs", "Northstar", "AssemblyAI", "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "amber", "blue", "green", "orange", "purple", "violet"],
} as const;

export type DictationRecognitionContext = {
  stt_prompt?: string;
  keyterms_prompt?: string[];
  llm_instruction?: string;
};

type DictationResponse = {
  text: string;
  confidence?: number;
  words?: Array<{ text: string; confidence: number }>;
  audio_duration_ms?: number;
  session_id?: string;
  request_time_ms?: number;
  sync_time_ms?: number;
  llm_response?: string | null;
  llm_error?: string | null;
};

function providerErrorDetail(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      if ("error" in parsed && typeof parsed.error === "string") return parsed.error;
      if ("detail" in parsed && typeof parsed.detail === "string") return parsed.detail;
      return JSON.stringify(parsed);
    }
  } catch {
    // Use a bounded raw-text fallback below.
  }
  return raw.trim().slice(0, 500) || "request failed";
}

export async function transcribeWithDictation(
  audio: Blob,
  context: DictationRecognitionContext = {
    ...paymentInstructionRecognitionContext,
    keyterms_prompt: [...paymentInstructionRecognitionContext.keyterms_prompt],
  },
): Promise<TranscriptEvidence> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY is not configured");

  const config: Record<string, unknown> = {};
  if (context.stt_prompt) config.stt_prompt = context.stt_prompt;
  if (context.keyterms_prompt?.length) config.keyterms_prompt = context.keyterms_prompt;
  if (context.llm_instruction) config.llm_instruction = context.llm_instruction;

  const body = new FormData();
  // Dictation requires config first, including an explicit {} for defaults.
  body.append("config", new Blob([JSON.stringify(config)], { type: "application/json" }), "config.json");
  body.append("audio", new Blob([audio], { type: "audio/wav" }), "certain.wav");

  const response = await fetch(dictationEndpoint, {
    method: "POST",
    headers: { Authorization: apiKey },
    body,
    cache: "no-store",
  });
  const raw = await response.text();

  let result: DictationResponse;
  try {
    result = JSON.parse(raw) as DictationResponse;
  } catch {
    if (!response.ok) {
      throw new Error(`AssemblyAI Dictation failed (${response.status}): non-JSON response`);
    }
    throw new Error(`AssemblyAI Dictation returned invalid JSON (${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(`AssemblyAI Dictation failed (${response.status}): ${providerErrorDetail(raw)}`);
  }
  if (!result || typeof result.text !== "string") {
    throw new Error("AssemblyAI Dictation returned no verbatim transcript.");
  }

  return {
    text: result.text,
    cleanedText: result.llm_response ?? null,
    llmError: result.llm_error ?? null,
    confidence: result.confidence,
    words: result.words,
    sessionId: result.session_id,
    requestTimeMs: result.request_time_ms,
    syncTimeMs: result.sync_time_ms,
    audioDurationMs: result.audio_duration_ms,
    provider: "assemblyai",
    product: "dictation",
  };
}
