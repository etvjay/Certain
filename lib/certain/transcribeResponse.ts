import type { TranscriptEvidence } from "./types";

function statusLabel(response: Response): string {
  return `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
}

/**
 * Parse the same-origin transcription boundary without assuming every failure
 * is JSON. A wrong/stale frontend origin commonly returns an HTML 404 page;
 * expose that routing problem directly instead of leaking `Unexpected token <`.
 */
export async function parseTranscriptionResponse(response: Response): Promise<TranscriptEvidence> {
  const raw = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const looksLikeHtml = contentType.includes("text/html") || raw.trimStart().startsWith("<!doctype html") || raw.trimStart().startsWith("<html");
    if (looksLikeHtml) {
      throw new Error(`Transcription endpoint returned HTML instead of JSON (${statusLabel(response)}). Check that this page and /api/transcribe are served by the same Certain server.`);
    }
    throw new Error(`Transcription endpoint returned invalid JSON (${statusLabel(response)}).`);
  }

  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `Transcription failed (${statusLabel(response)}).`;
    throw new Error(message);
  }

  if (!body || typeof body !== "object" || !("text" in body) || typeof body.text !== "string") {
    throw new Error("Transcription endpoint returned an invalid transcript response.");
  }
  return body as TranscriptEvidence;
}
