/**
 * Target-token scoring for the Certain human corpus.
 *
 * We care disproportionately about consequential tokens, so scoring is
 * per-target rather than generic WER:
 * - exact: verbatim substring match in the transcript
 * - normalized: match after lowercase alphanumeric-only normalization
 *   (absorbs hyphen/space/punctuation variation such as INV-14892 vs INV14892)
 * - identifier_exact: normalization with separators removed AND uppercased,
 *   for invoice IDs, mixed alphanumerics, and technical identifiers
 * - money_canonical: expected numeric amount appears among the money values
 *   parsed from the transcript (digits or spoken number words)
 * - wrong_high_confidence: target missed while its best word span carries
 *   min confidence >= threshold (default 0.90). Confidence is treated as a
 *   vendor-supplied score, never as a calibrated probability.
 */

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

export function wordsToNumber(input) {
  const cleaned = String(input).replace(/[$,]/g, "").trim();
  if (cleaned !== "" && Number.isFinite(Number(cleaned))) return Number(cleaned);
  const tokens = cleaned
    .toLowerCase()
    .replace(/\b(?:dollars?|usd|and|cents?)\b|,/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  let total = 0;
  let current = 0;
  let sawNumber = false;
  for (const token of tokens) {
    if (token === "hundred") {
      current = Math.max(1, current) * 100;
      sawNumber = true;
      continue;
    }
    if (token === "thousand") {
      total += Math.max(1, current) * 1000;
      current = 0;
      sawNumber = true;
      continue;
    }
    const value = NUMBER_WORDS[token];
    if (value === undefined) return null;
    current += value;
    sawNumber = true;
  }
  return sawNumber ? total + current : null;
}

export function normalizeToken(input) {
  return String(input).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeIdentifier(input) {
  return String(input).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** All money values observable in free text: $15,000, "15000 dollars", "fifteen thousand dollars". */
export function extractMoneyValues(text) {
  const found = new Set();
  const source = String(text);
  for (const match of source.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)) {
    const value = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(value)) found.add(value);
  }
  for (const match of source.matchAll(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:dollars?|usd)\b/gi)) {
    const value = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(value)) found.add(value);
  }
  const spoken = source.match(
    /\b((?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and)[\s-]+)+)dollars?\b/gi,
  );
  for (const phrase of spoken ?? []) {
    const value = wordsToNumber(phrase);
    if (value !== null) found.add(value);
  }
  return [...found].sort((a, b) => a - b);
}

const IDENTIFIER_CLASSES = new Set([
  "mixed_alphanumeric_identifier",
  "near_neighbor_identifiers",
  "technical_identifiers",
]);

function isIdentifierTarget(target, targetClass) {
  if (IDENTIFIER_CLASSES.has(targetClass)) return true;
  if (targetClass !== "payment_instruction" && targetClass !== "identifier_money") return false;
  return /^(?:INV[-\s]?[A-Z0-9]+|[A-Z0-9]+(?:-[A-Z0-9]+)+|\d{6,})$/i.test(String(target).trim());
}

const MONEY_CLASSES = new Set([
  "payment_instruction",
  "identifier_money",
  "self_correction_money",
  "contrastive_money",
  "money_decimal",
  "multiple_money_values",
  "minimal_money_contrast",
  "decimal_contrast",
]);

/**
 * Resolve the transcript word span for a target: first contiguous run of
 * transcript words whose normalized forms cover the target's normalized
 * word sequence. Returns null when no span resolves.
 */
export function resolveWordSpan(target, words) {
  if (!Array.isArray(words) || words.length === 0) return null;
  const needle = String(target)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((part) => part.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  if (needle.length === 0) return null;
  const haystack = words.map((word) => String(word.text ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let covers = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      const expected = needle[offset];
      const actual = haystack[start + offset];
      // Identifier fragments (INV14892 vs INV-14892) may fuse or split across
      // word boundaries; accept containment in either direction for tokens
      // longer than 3 characters to keep confidence attribution honest.
      const fused = expected.length > 3 && actual.length > 3 && (actual.includes(expected) || expected.includes(actual));
      if (actual !== expected && !fused) {
        covers = false;
        break;
      }
    }
    if (covers) {
      const span = words.slice(start, start + needle.length);
      return {
        span: span.map((word) => word.text),
        confidence: Math.min(...span.map((word) => word.confidence)),
      };
    }
  }
  // Fused-identifier fallback: the target may be one transcript token
  // ("INV14892") while the ground truth splits ("INV-14892"). Compare the
  // concatenated normalized forms over short windows.
  const fusedNeedle = needle.join("");
  if (fusedNeedle.length >= 4) {
    for (let start = 0; start < haystack.length; start += 1) {
      for (let width = 1; width <= 3 && start + width <= haystack.length; width += 1) {
        if (haystack.slice(start, start + width).join("") === fusedNeedle) {
          const span = words.slice(start, start + width);
          return {
            span: span.map((word) => word.text),
            confidence: Math.min(...span.map((word) => word.confidence)),
          };
        }
      }
    }
  }
  return null;
}

export function scoreTarget(target, targetClass, transcriptText, words, options = {}) {
  const threshold = options.highConfidenceThreshold ?? 0.9;
  const text = String(transcriptText ?? "");
  const exact = text.includes(String(target));
  const normalized = normalizeToken(text).includes(normalizeToken(target));
  const result = {
    ground_truth: target,
    target,
    observed_span: exact ? String(target) : null,
    exact,
    normalized,
    normalized_correct: normalized,
    correct: normalized,
    identifier_exact: null,
    money_canonical: null,
    word_confidence: null,
    confidence_resolvable: false,
    wrong_high_confidence: false,
  };

  if (isIdentifierTarget(target, targetClass)) {
    const identifierHit = normalizeIdentifier(text).includes(normalizeIdentifier(target));
    result.identifier_exact = identifierHit;
    result.correct = identifierHit;
    if (identifierHit && !exact) result.observed_span = `normalized:${normalizeIdentifier(target)}`;
  }

  if (MONEY_CLASSES.has(targetClass)) {
    const expected = extractMoneyValues(target);
    const observed = extractMoneyValues(text);
    const hit = expected.length > 0 && expected.every((value) => observed.includes(value));
    result.money_canonical = expected.length > 0 ? hit : null;
    if (expected.length > 0) result.correct = hit;
  }

  const span = resolveWordSpan(target, words);
  if (span) {
    result.observed_span = span.span.join(" ");
    result.word_confidence = span.confidence;
    result.confidence_resolvable = true;
    if (!result.correct && span.confidence >= threshold) result.wrong_high_confidence = true;
  }
  return result;
}

export function scoreFixture(fixture, transcriptText, words, options = {}) {
  const targets = (fixture.target_tokens ?? []).map((target) =>
    scoreTarget(target, fixture.target_class, transcriptText, words, options),
  );
  return {
    fixture_id: fixture.id,
    target_class: fixture.target_class,
    support_status: fixture.support_status,
    transcript: transcriptText,
    targets,
    summary: {
      target_count: targets.length,
      exact_hits: targets.filter((target) => target.exact).length,
      normalized_hits: targets.filter((target) => target.normalized).length,
      correct: targets.filter((target) => target.correct).length,
      wrong_high_confidence: targets.filter((target) => target.wrong_high_confidence).length,
    },
  };
}
