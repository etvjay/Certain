import type { TranscriptEvidence } from "../certain/types";

export const syncEndpoint = "https://sync.assemblyai.com/transcribe";

export type SyncRecognitionContext = {
  prompt?: string;
  keyterms_prompt?: string[];
};

type SyncResponse = {
  text: string;
  confidence?: number;
  words?: Array<{ text: string; confidence: number }>;
  session_id?: string;
  request_time_ms?: number;
};

/** Historical Sync adapter retained for comparison and existing evidence. */
export async function transcribeWithSync(
  audio: Blob,
  context: SyncRecognitionContext = {},
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

  const response = await fetch(syncEndpoint, {
    method: "POST",
    headers: { Authorization: apiKey, "X-AAI-Model": "universal-3-5-pro" },
    body,
    cache: "no-store",
  });
  const raw = await response.text();
  let result: SyncResponse;
  try {
    result = JSON.parse(raw) as SyncResponse;
  } catch {
    throw new Error(`AssemblyAI Sync returned invalid JSON (${response.status}).`);
  }
  if (!response.ok) throw new Error(`AssemblyAI Sync failed (${response.status}): ${raw.slice(0, 500)}`);
  if (!result || typeof result.text !== "string") throw new Error("AssemblyAI Sync returned no transcript.");

  return {
    text: result.text,
    confidence: result.confidence,
    words: result.words,
    sessionId: result.session_id,
    requestTimeMs: result.request_time_ms,
    provider: "assemblyai",
    product: "sync",
  };
}
