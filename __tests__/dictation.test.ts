import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeWithAssemblyAI, transcribeWithSync } from "../lib/assemblyai";

const originalKey = process.env.ASSEMBLYAI_API_KEY;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalKey === undefined) delete process.env.ASSEMBLYAI_API_KEY;
  else process.env.ASSEMBLYAI_API_KEY = originalKey;
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("AssemblyAI Dictation adapter", () => {
  it("uses Dictation with config first and preserves verbatim and rewrite fields", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(
        JSON.stringify({
          text: "Pay Acme Labs $15,000",
          words: [{ text: "Pay", confidence: 0.99 }],
          confidence: 0.94,
          llm_response: "Pay Acme Labs $15,000",
          llm_error: null,
          audio_duration_ms: 1200,
          session_id: "session-1",
          request_time_ms: 800,
          sync_time_ms: 400,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await transcribeWithAssemblyAI(new Blob(["wav"]));
    const form = requestInit?.body as FormData;
    const entries = [...form.entries()];
    const config = JSON.parse(await (entries[0][1] as Blob).text());

    expect(requestUrl).toBe("https://dictation.assemblyai.com/v1/transcribe/live");
    expect(entries.map(([name]) => name)).toEqual(["config", "audio"]);
    expect((entries[1][1] as Blob).type).toBe("audio/wav");
    expect(config).toEqual({
      stt_prompt: "A payment instruction naming a vendor, a dollar amount, an invoice ID like INV-14892, a cost center, and a due date.",
      keyterms_prompt: ["Acme Labs", "Northstar", "AssemblyAI", "Engineering", "Growth", "Operations"],
    });
    expect((requestInit?.headers as Record<string, string>).Authorization).toBe("test-key");
    expect((requestInit?.headers as Record<string, string>)["X-AAI-Model"]).toBeUndefined();
    expect(result).toMatchObject({
      text: "Pay Acme Labs $15,000",
      cleanedText: "Pay Acme Labs $15,000",
      llmError: null,
      audioDurationMs: 1200,
      sessionId: "session-1",
      requestTimeMs: 800,
      syncTimeMs: 400,
    });
  });

  it("always sends an empty config before audio when context is empty", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestInit = init;
      return new Response(JSON.stringify({ text: "hello", words: [], confidence: 1 }), { status: 200 });
    }) as typeof fetch;

    await transcribeWithAssemblyAI(new Blob(["wav"]), {});
    const entries = [...(requestInit?.body as FormData).entries()];
    expect(entries.map(([name]) => name)).toEqual(["config", "audio"]);
    expect(await (entries[0][1] as Blob).text()).toBe("{}");
  });

  it("keeps the verbatim transcript usable when the cleanup rewrite times out", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ text: "um fifteen thousand", words: [], confidence: 0.8, llm_response: null, llm_error: "timeout" }), { status: 200 })) as typeof fetch;

    const result = await transcribeWithAssemblyAI(new Blob(["wav"]));
    expect(result.text).toBe("um fifteen thousand");
    expect(result.cleanedText).toBeNull();
    expect(result.llmError).toBe("timeout");
    expect(result.product).toBe("dictation");
  });

  it("surfaces Dictation's structured invalid-key error without fabricating text", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: 404, title: "Not Found", detail: "Invalid API key" }), { status: 404 })) as typeof fetch;

    await expect(transcribeWithAssemblyAI(new Blob(["wav"]))).rejects.toThrow("AssemblyAI Dictation failed (404): Invalid API key");
  });

  it("keeps the historical Sync adapter explicit and separate", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    let requestUrl = "";
    let requestHeaders: Record<string, string> | undefined;
    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      requestHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ text: "sync text", words: [], confidence: 0.7 }), { status: 200 });
    }) as typeof fetch;

    const result = await transcribeWithSync(new Blob(["wav"]));
    expect(requestUrl).toBe("https://sync.assemblyai.com/transcribe");
    expect(requestHeaders?.["X-AAI-Model"]).toBe("universal-3-5-pro");
    expect(result.product).toBe("sync");
    expect(result.text).toBe("sync text");
  });
});
