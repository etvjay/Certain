import type { TranscriptEvidence } from "./certain/types";

const endpoint = "https://sync.assemblyai.com/transcribe";

/**
 * Bounded recognition context for the payment_instruction/v1 demo.
 *
 * This is substrate vocabulary, not transcript repair: it tells AssemblyAI
 * which domain terms to expect. The raw transcript is always preserved
 * verbatim so recognition errors stay visible to Certain instead of being
 * hidden downstream.
 */
export const paymentInstructionRecognitionContext = {
  prompt:
    "A payment instruction naming a vendor, a dollar amount, an invoice ID like INV-14892, a cost center, and a due date.",
  keyterms_prompt: ["Acme Labs", "Northstar", "AssemblyAI", "Engineering", "Growth", "Operations"],
} as const;

export type RecognitionContext = {
  prompt?: string;
  keyterms_prompt?: string[];
};

export async function transcribeWithAssemblyAI(
  audio: Blob,
  context: RecognitionContext = { ...paymentInstructionRecognitionContext, keyterms_prompt: [...paymentInstructionRecognitionContext.keyterms_prompt] },
): Promise<TranscriptEvidence> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY is not configured");

  const body = new FormData();
  body.append("audio", audio, "certain.wav");

  const config: Record<string, unknown> = {};
  if (context.prompt) config.prompt = context.prompt;
  if (context.keyterms_prompt?.length) config.keyterms_prompt = context.keyterms_prompt;
  if (Object.keys(config).length > 0) {
    body.append("config", new Blob([JSON.stringify(config)], { type: "application/json" }), "config.json");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "X-AAI-Model": "universal-3-5-pro",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AssemblyAI Sync failed (${response.status}): ${detail}`);
  }

  const result = (await response.json()) as {
    text: string;
    confidence?: number;
    words?: Array<{ text: string; confidence: number }>;
    session_id?: string;
    request_time_ms?: number;
  };

  return {
    text: result.text,
    confidence: result.confidence,
    words: result.words,
    sessionId: result.session_id,
    requestTimeMs: result.request_time_ms,
  };
}
