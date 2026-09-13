import { describe, expect, it } from "vitest";
import { resolveWordSpan, scoreTarget } from "../research/assemblyai/experiments/human/score.mjs";

describe("human corpus confidence attribution", () => {
  it("does not attribute a one-letter transcript word to a longer missed target", () => {
    const words = [
      { text: "I", confidence: 0.9949 },
      { text: "said", confidence: 0.98 },
      { text: "15", confidence: 0.9976 },
    ];
    expect(resolveWordSpan("fifteen", words)).toBeNull();
    const scored = scoreTarget("fifteen", "minimal_money_contrast", "I said 15", words);
    expect(scored.confidence_resolvable).toBe(false);
    expect(scored.observed_span).toBeNull();
    expect(scored.wrong_high_confidence).toBe(false);
  });

  it("still resolves a genuinely fused longer identifier span", () => {
    const words = [{ text: "INV14892", confidence: 0.61 }];
    expect(resolveWordSpan("INV-14892", words)).toEqual({ span: ["INV14892"], confidence: 0.61 });
  });
});
