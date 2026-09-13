import type { DictationRecognitionContext } from "./assemblyai/dictation";
import type { TranscriptEvidence } from "./certain/types";
import {
  dictationEndpoint,
  paymentInstructionRecognitionContext,
  transcribeWithDictation,
} from "./assemblyai/dictation";

export { dictationEndpoint, paymentInstructionRecognitionContext, transcribeWithDictation } from "./assemblyai/dictation";
export { syncEndpoint, transcribeWithSync } from "./assemblyai/sync";
export type { DictationRecognitionContext as RecognitionContext } from "./assemblyai/dictation";

type RecognitionContext = DictationRecognitionContext;

/**
 * Product entry point. Certain uses Dictation; Sync remains available through
 * its explicit historical adapter for evidence comparison.
 */
export async function transcribeWithAssemblyAI(
  audio: Blob,
  context: RecognitionContext = {
    ...paymentInstructionRecognitionContext,
    keyterms_prompt: [...paymentInstructionRecognitionContext.keyterms_prompt],
  },
): Promise<TranscriptEvidence> {
  return transcribeWithDictation(audio, context);
}
