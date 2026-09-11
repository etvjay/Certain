import type { TranscriptEvidence } from "./certain/types";

const endpoint = "https://sync.assemblyai.com/transcribe";

export async function transcribeWithAssemblyAI(audio: Blob): Promise<TranscriptEvidence> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY is not configured");

  const body = new FormData();
  body.append("audio", audio, "certain.wav");

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
