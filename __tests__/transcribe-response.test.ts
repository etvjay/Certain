import { describe, expect, it } from "vitest";
import { parseTranscriptionResponse } from "../lib/certain/transcribeResponse";

describe("transcription API response boundary", () => {
  it("reports a route mismatch instead of exposing a JSON parse error for HTML", async () => {
    const response = new Response("<!DOCTYPE html><html><body>Not found</body></html>", {
      status: 404,
      statusText: "Not Found",
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    await expect(parseTranscriptionResponse(response)).rejects.toThrow(
      "Transcription endpoint returned HTML instead of JSON (404 Not Found)",
    );
  });

  it("returns a successful transcript response", async () => {
    const body = { text: "hello", confidence: 0.9 };
    const response = new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    await expect(parseTranscriptionResponse(response)).resolves.toEqual(body);
  });

  it("surfaces a JSON API error without fabricating a transcript", async () => {
    const response = new Response(JSON.stringify({ error: "ASSEMBLYAI_API_KEY is not configured" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
    await expect(parseTranscriptionResponse(response)).rejects.toThrow("ASSEMBLYAI_API_KEY is not configured");
  });
});
