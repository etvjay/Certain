# AssemblyAI Evaluation Foundry

This directory is an evidence-first audit of AssemblyAI as a platform. It is deliberately separate from the Certain product code and from Certain's application-owned implementation notes in `../certain/`.

The goal is not to collect opinions. The goal is to produce feedback AssemblyAI can independently reproduce.

## Research invariant

```text
CLAIM -> EXPERIMENT -> OBSERVATION -> REPRODUCTION -> INTERPRETATION -> FEEDBACK
```

A feedback item is not submission-ready unless that chain exists.

## Evidence taxonomy

Use these labels precisely:

- `FACT` — directly supported by current primary documentation or API schema.
- `VENDOR_CLAIM` — a performance/quality statement made by AssemblyAI that we have not independently reproduced.
- `OBSERVATION` — behavior we directly measured.
- `INFERENCE` — explanation consistent with observations but not directly established.
- `HYPOTHESIS` — testable proposed explanation or gap.
- `DECISION` — an explicit project/research choice.
- `IMPLEMENTATION` — code or configuration we created.
- `DEPLOYMENT` — behavior verified in a deployed environment.
- `EVIDENCE` — durable artifact supporting a claim or observation.

Never silently promote one category into another.

## Feedback classifications

- `BUG` — documented or contractually expected deterministic behavior fails reproducibly.
- `DOC_GAP` — implementation behaves consistently, but documentation is absent, stale, ambiguous, or contradictory.
- `DX_FRICTION` — feature works, but API/SDK/errors/naming create unnecessary integration cost.
- `QUALITY_OBSERVATION` — probabilistic model weakness supported by a sufficient sample.
- `FEATURE_GAP` — a capability is genuinely absent after substrate audit.
- `INCONSISTENCY` — official surfaces expose materially different semantics without a clear reason.
- `SECURITY_FINDING` — a security property is violated with reproducible evidence. Keep private until appropriately disclosed.
- `UNSUPPORTED_CASE` — useful observation outside the product's claimed support. Never report this as a bug.

## Directory map

```text
research/assemblyai/
├── README.md
├── SUBSTRATE_MAP.md
├── CLAIM_LEDGER.md
├── TEST_MATRIX.md
├── FEEDBACK_LEDGER.md
├── SECURITY_NOTES.md
├── fixtures/
│   ├── README.md
│   └── manifest.example.json
├── experiments/
│   ├── sync/run-sync.mjs
│   ├── prompting/compare-prompts.mjs
│   ├── human/run-corpus.mjs        # --api dictation (default) or --api sync
│   └── speaker/README.md            # deliberate optional deferral
└── evidence/
    ├── candidates/certain-voice-final-20260913/
    └── README.md
```

Generated runs are written below `research/assemblyai/evidence/runs/` and are gitignored by default because they may contain transcript content. Promote only deliberately scrubbed artifacts into Git.

## Phase I — hackathon window

Priority order:

1. Dictation API response and failure semantics.
2. Universal-3.5 Pro contextual prompting.
3. `keyterms_prompt` matched-pair tests.
4. Numbers, amounts, names, IDs, URLs, and email addresses.
5. Verbatim versus cleaned dictation scoring.
6. Word-confidence review, especially confidently wrong consequential tokens.
7. Raw HTTP vs JS integration/documentation parity.
8. Preserve historical Sync evidence and compare only with explicit labels.
9. Certain as a downstream consumer of the same evidence.
10. Preaccepted typed specification and fresh challenge evidence as Certain-owned controls.

## Phase II

- multilingual and code-switching corpus;
- diarization / speaker attribution;
- async transcription parity;
- broader regional behavior;
- error taxonomy.

## Phase III

- LLM Gateway OpenAI-compatibility;
- fallback behavior;
- structured output and streaming parity;
- SDK/CLI parity;
- privacy/retention developer experience.

## Running experiments

Set the key only in your shell or `.env.local`; never place it in a command committed to history or source control.

```bash
export ASSEMBLYAI_API_KEY='...'
```

The human runner uses the dedicated Dictation API by default. Every Dictation request writes `config` first, then `audio`, and preserves both the verbatim `text` and cleaned `llm_response` separately.

```bash
npm run eval:aai:human -- \
  --api dictation \
  --manifest ./path/to/manifest.json \
  --audio-dir ./path/to/audio
```

Use `--compare-prompts` with `--only` for a matched Dictation comparison. The runner scores verbatim and cleaned output separately. It accepts `--api sync` to reproduce the historical Sync path; do not mix those scorecards without explicit product labels.

Run a single historical Sync experiment:

```bash
npm run eval:aai:sync -- --audio ./research/assemblyai/fixtures/audio/sample.wav --label baseline
```

Run a four-arm prompting comparison:

```bash
npm run eval:aai:prompt -- \
  --audio ./research/assemblyai/fixtures/audio/domain.wav \
  --label openrails-domain \
  --prompt "A protocol engineering discussion about OpenRails and Prism." \
  --keyterm OpenRails \
  --keyterm Prism
```

The prompting experiment executes the same audio as:

```text
A0  no prompt, no keyterms
A1  prompt only
A2  keyterms only
A3  prompt + keyterms
```

This is a matched-pair design. Do not substitute different recordings between arms.

Run the human corpus (SHA-verified, scoring consequential target tokens):

```bash
npm run eval:aai:human -- \
  --api dictation \
  --manifest ./path/to/manifest.json \
  --audio-dir ./path/to/audio
```

Validate an export without spending API calls with `--dry-run`. Run a bounded
matched prompting comparison on fixed fixtures with `--compare-prompts --only
AAI-HUM-003,AAI-HUM-015,AAI-HUM-023 --prompt "..." --keyterm OpenRails
--keyterm Prism`. Unsupported fixtures are separated from supported scoring
and never submitted.

## Dictation semantic checks

The bounded Dictation request matrix is:

- `D0` correct request: `config={}` first, WAV second, expect 200 JSON.
- `D1` missing config: audio-only request, record the documented endpoint response.
- `D2` wrong order: audio first, config second, record the documented endpoint response.
- `D3` default cleanup: preserve `text`, `llm_response`, and `llm_error` independently.
- `D4` unsupported format: use one tiny controlled non-WAV/PCM sample only if needed; expect the documented 415 behavior.

A cleanup failure is not a transcription failure when `text` is present. Certain's contract input remains the verbatim `text`; cleaned output is an additional, non-authoritative surface. The human runner stores both scoring surfaces without mixing them.

### Observed Dictation evidence — 2026-09-13

- Full baseline: 23 supported human fixtures, 0 HTTP failures, 0 SHA refusals, and `AAI-HUM-024` separated as unsupported Pidgin.
- Verbatim baseline: 19/50 exact target-token matches and 27/50 normalized matches.
- Cleaned baseline: 23/23 fixtures returned `llm_response`; 19/50 exact and 27/50 normalized matches.
- Matched contextual run on `AAI-HUM-003`, `AAI-HUM-015`, and `AAI-HUM-023`: A0 4/8, A1 8/8, A2 7/8, A3 7/8 exact verbatim target matches. Every fixture used the same audio SHA in all four arms.
- Payment-context run on `AAI-HUM-001`: A0 2/5, A1 3/5, A2 3/5, A3 4/5 exact verbatim target matches.
- Self-correction fixture `AAI-HUM-004`: verbatim was `Send 10,000 sorry 15,000 dollars to Notstar`; cleaned output was `Send 15,000 dollars to Notstar`. Certain still keeps the parsed `$15,000 USD` amount at `repeat_match`; the overall input is blocked because the vendor and other required fields are not valid.

## Certain final closeout evidence

The product-owned final path adds two bounded controls above Dictation:

- `payment-approval-001` is compared against canonical typed fields and pinned by SHA-256 `b3f0d50ef7cc754ab11df7df007cda604ea115af4a422e50d8f2ce2f52747656`.
- A generated five-minute challenge uses canonical expected/observed tokens, is consumed only on `CHALLENGE_MATCH`, and returns explicit mismatch, expiry, and replay results.
- The live browser replay reached `VERIFIED` with Dictation `text`, `llm_response`, spec `MATCH`, challenge `CHALLENGE_MATCH`, amount `repeat_match`, and invoice `confirm` evidence. It used controlled getUserMedia audio for the challenge and is not physical-microphone evidence.
- Speaker similarity is explicitly deferred. No speaker model, threshold, embedding, or biometric profile is shipped.

The sanitized candidate bundle is `research/assemblyai/evidence/candidates/certain-voice-final-20260913/`. Historical Sync runs remain under their original IDs and are not relabeled.

The run roots are local generated evidence under `research/assemblyai/evidence/runs/`; they are gitignored because provider responses contain transcript text. These figures are corpus-bounded observations, not general accuracy claims.

## Submission gate

A feedback candidate must have:

1. an exact claim or expected behavior;
2. a primary source or explicit statement that the behavior is undocumented;
3. minimal reproduction steps;
4. exact endpoint/model/configuration;
5. sanitized request metadata;
6. raw response/error evidence;
7. `session_id` when available;
8. repeated reproduction appropriate to the claim type;
9. impact statement;
10. falsification condition;
11. independent clean-environment rerun.

No manufactured bugs. No unsupported-case result is upgraded into a defect merely because the result is poor.
