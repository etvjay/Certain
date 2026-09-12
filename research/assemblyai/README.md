# AssemblyAI Evaluation Foundry

This directory is an evidence-first audit of AssemblyAI as a platform. It is deliberately separate from the Certain product code.

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
│   └── prompting/compare-prompts.mjs
└── evidence/
    └── README.md
```

Generated runs are written below `research/assemblyai/evidence/runs/` and are gitignored by default because they may contain transcript content. Promote only deliberately scrubbed artifacts into Git.

## Phase I — hackathon window

Priority order:

1. Sync API response and failure semantics.
2. Universal-3.5 Pro contextual prompting.
3. `keyterms_prompt` matched-pair tests.
4. Numbers, amounts, names, IDs, URLs, and email addresses.
5. Word-confidence calibration, especially confidently wrong consequential tokens.
6. Raw HTTP vs JS integration/documentation parity.
7. Regional endpoint parity and latency observations.
8. One Streaming `UpdateConfiguration` experiment.
9. Certain as a downstream consumer of the same evidence.

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

Run a single Sync experiment:

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
