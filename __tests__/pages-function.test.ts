import { afterEach, describe, expect, it } from "vitest";
import { onRequestPost } from "../functions/api/transcribe";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Pages transcription function", () => {
  it("keeps the Pages secret server-side and returns Dictation JSON", async () => {
    let providerHeaders: HeadersInit | undefined;
    let providerEntries: string[] = [];
    globalThis.fetch = (async (_input, init) => {
      providerHeaders = init?.headers;
      providerEntries = [...(init?.body as FormData).keys()];
      return new Response(JSON.stringify({
        text: "Pay Acme Labs $15,000",
        words: [],
        confidence: 0.99,
        llm_response: "Pay Acme Labs $15,000",
        llm_error: null,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const incoming = new FormData();
    incoming.append("audio", new Blob(["wav"], { type: "audio/wav" }), "certain.wav");
    const response = await onRequestPost({
      request: new Request("https://certain.example/api/transcribe", { method: "POST", body: incoming }),
      env: { ASSEMBLYAI_API_KEY: "pages-test-key" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ text: "Pay Acme Labs $15,000", provider: "assemblyai", product: "dictation" });
    expect(providerHeaders).toMatchObject({ Authorization: "pages-test-key" });
    expect(providerEntries).toEqual(["config", "audio"]);
  });

  it("returns a JSON error when the Pages secret is unavailable", async () => {
    const incoming = new FormData();
    incoming.append("audio", new Blob(["wav"], { type: "audio/wav" }), "certain.wav");
    const response = await onRequestPost({
      request: new Request("https://certain.example/api/transcribe", { method: "POST", body: incoming }),
      env: {},
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "ASSEMBLYAI_API_KEY is not configured" });
  });
});
