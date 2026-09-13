export type TranscriptWord = {
  text: string;
  confidence: number;
};

export type WordSpan = {
  span: string[];
  confidence: number;
};

export type ScoredTarget = {
  ground_truth: string;
  target: string;
  observed_span: string | null;
  exact: boolean;
  normalized: boolean;
  normalized_correct: boolean;
  correct: boolean;
  identifier_exact: boolean | null;
  money_canonical: boolean | null;
  word_confidence: number | null;
  confidence_resolvable: boolean;
  wrong_high_confidence: boolean;
};

export function resolveWordSpan(target: string, words: TranscriptWord[]): WordSpan | null;
export function scoreTarget(target: string, targetClass: string, transcriptText: string, words: TranscriptWord[], options?: { highConfidenceThreshold?: number }): ScoredTarget;
