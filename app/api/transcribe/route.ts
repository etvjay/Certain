import { NextResponse } from "next/server";
import { transcribeWithAssemblyAI, voiceChallengeRecognitionContext } from "@/lib/assemblyai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "audio file is required" }, { status: 400 });
    }

    if (audio.size === 0) {
      return NextResponse.json({ error: "audio file is empty" }, { status: 400 });
    }

    const challengeContext = form.get("purpose") === "challenge"
      ? { stt_prompt: voiceChallengeRecognitionContext.stt_prompt, keyterms_prompt: [...voiceChallengeRecognitionContext.keyterms_prompt] }
      : undefined;
    const transcript = await transcribeWithAssemblyAI(audio, challengeContext);
    return NextResponse.json(transcript);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown transcription error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
