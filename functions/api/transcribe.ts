import { transcribeWithAssemblyAI, voiceChallengeRecognitionContext } from "../../lib/assemblyai";

type PagesEnvironment = {
  ASSEMBLYAI_API_KEY?: string;
};

type PagesRequestContext = {
  request: Request;
  env: PagesEnvironment;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function onRequestPost(context: PagesRequestContext): Promise<Response> {
  try {
    const form = await context.request.formData();
    const audio = form.get("audio");

    if (!(audio instanceof File)) {
      return json({ error: "audio file is required" }, 400);
    }
    if (audio.size === 0) {
      return json({ error: "audio file is empty" }, 400);
    }

    const challengeContext = form.get("purpose") === "challenge"
      ? {
          stt_prompt: voiceChallengeRecognitionContext.stt_prompt,
          keyterms_prompt: [...voiceChallengeRecognitionContext.keyterms_prompt],
        }
      : undefined;
    const transcript = await transcribeWithAssemblyAI(
      audio,
      challengeContext,
      context.env.ASSEMBLYAI_API_KEY,
    );
    return json(transcript);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown transcription error";
    return json({ error: message }, 502);
  }
}
