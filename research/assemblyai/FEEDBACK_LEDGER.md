# Feedback Ledger

Nothing in this file is automatically submission-ready.

Statuses:

`OBSERVED -> REPRODUCING -> VERIFIED_CANDIDATE -> INDEPENDENT_RERUN -> READY -> SUBMITTED -> RESOLVED`

## Candidate template

```yaml
id: AAI-FB-XXX
classification: BUG | DOC_GAP | DX_FRICTION | QUALITY_OBSERVATION | FEATURE_GAP | INCONSISTENCY | SECURITY_FINDING | UNSUPPORTED_CASE
status: OBSERVED
surface: sync | async | streaming | entity_detection | llm_gateway | sdk | cli | docs

claim:
  source: <primary URL or "none found">
  as_of: YYYY-MM-DD
  summary: <paraphrased documented/expected behavior>

expected:
  behavior: <specific, falsifiable expectation>

observed:
  behavior: <specific result>
  reproduced: 0
  attempts: 0

environment:
  runtime: <node/python/browser>
  interface: raw-http | js-sdk | python-sdk | cli
  endpoint: <endpoint>
  model: <model>
  region: <declared endpoint region>

impact:
  severity: low | medium | high
  workflow: <who/what is affected>

evidence:
  - <relative path>

interpretation:
  status: HYPOTHESIS | VERIFIED
  notes: <do not overclaim>

falsification:
  condition: <what evidence would invalidate this feedback item>
```

## Historical Sync candidates

These remain separate from the current Dictation findings and are not submission headlines for Dictation.

### AAI-FB-DOC-001

- Classification: `DOC_GAP` / `INCONSISTENCY` candidate.
- Status: `REPRODUCING`.
- Observation: current official Sync material is not uniform about whether the surface covers 18 or 19 languages.
- Do not submit yet.
- Next action: identify current API-reference source of truth and test supported language-code behavior if exposed.
- Falsification: a current canonical reference explains the difference (for example, a newly added language or different surface definition).

### AAI-FB-DOC-002

- Classification: `DX_FRICTION` / `DOC_GAP` candidate.
- Status: `REPRODUCING`.
- Observation: current official examples use both `universal-3-5-pro` and `u3-sync-pro` model names for Sync.
- Do not submit yet.
- Next action: run exact same fixture under both names and inspect current reference docs for alias semantics.
- Falsification: aliases are explicitly documented and behave equivalently.
- Live observation 2026-09-12 (run 34686061337, synthetic eSpeak domain clip, single utterance, NOT submission evidence): both aliases returned HTTP 200 with byte-identical transcript text (`Move the mandate into open rail and attach the Prism execution receipt.`), sessions `c617fe71-...` and `0536cca4-...`. Consistent with the falsification condition, not proof of it.

## Dictation candidates

### AAI-FB-DICT-001

- Classification: `QUALITY_OBSERVATION` / `DX_FRICTION` candidate.
- Status: `OBSERVED`; not a confirmed deterministic bug.
- Scope: 23 supported natural human fixtures from the fixed SHA-verified corpus, 50 consequential target tokens, Dictation default configuration, with verbatim `text` and cleaned `llm_response` scored separately.
- Result: verbatim and cleaned baselines were both 19/50 exact and 27/50 normalized; 0 wrong-plus-high-confidence findings. The cleaned surface changed two fixtures, including removal of an earlier amount during a self-correction and punctuation normalization.
- Representative quality observations: `INV-14892` was sometimes returned as `INV14892`; `Growth` as `Groot`; `OpenRails` as `open rows`; and `Prism` as `prison` in baseline conditions. Matched context improved some domain terms, but this remains corpus-bounded.
- Evidence: `evidence/runs/dictation-human-phase1-live-20260913/scorecard.json`, `evidence/runs/dictation-prompt-live-20260913/scorecard.json`, and `evidence/runs/dictation-payment-context-live-20260913/scorecard.json`.
- Decision boundary: do not submit as an AssemblyAI bug unless a documented deterministic behavior fails reproducibly.

### AAI-FB-DICT-002

- Classification: `INCONSISTENCY` / `DOC_GAP` candidate.
- Status: `REPRODUCING` on the current documented surface; not an API bug finding.
- Expected/documented split: the API reference and error-handling page require a `config` part before `audio`, while transcript-rewriting prose says omitting the whole `config` part runs default cleanup.
- Observed: D1 audio-only returned the same HTTP 400 error on 3/3 attempts; D2 audio-first/config-second returned the same HTTP 400 error on 3/3 attempts. The error says the `config` part must be sent before `audio`.
- Evidence: `evidence/runs/dictation-semantics-live-20260913/summary.json` and the primary pages linked in `SUBSTRATE_MAP.md`.
- Decision boundary: report the wording inconsistency accurately; do not claim the endpoint is broken.

### AAI-FB-DICT-003

- Classification: `FEATURE_GAP` candidate only if independently established.
- Status: `HYPOTHESIS`.
- Scope: Certain keeps Dictation's cleaned output separate from verbatim contract evidence; no AssemblyAI feature request follows from this boundary alone.

## Certain implementation findings

### CERTAIN-FB-001

- Classification: `BUG`.
- Status: `RESOLVED`.
- Observation: the first challenge matcher compared spoken digit words literally, while Dictation returned a compound numeric token such as `16`.
- Fix: challenge tokens now canonicalize digit words to digits and split compound numeric output; regression coverage is in `__tests__/challenge.test.ts`.
- Evidence: live challenge response in `evidence/candidates/certain-voice-final-20260913/browser-demo.json` and the focused challenge test.
- Boundary: this was a Certain comparison bug, not an AssemblyAI recognition bug.

### CERTAIN-FB-002

- Classification: `FEATURE_GAP` / `DX_FRICTION`.
- Status: `DEFERRED`.
- Observation: speaker embedding enrollment and threshold calibration are not part of the shipped path.
- Decision: no ML runtime, biometric profile, embedding, or threshold was added to the product. The authorization and contract boundaries remain deterministic.

## Quality-feedback rule

A transcription miss is not automatically a defect. Quality feedback must include:

- corpus size;
- corpus construction method;
- ground truth;
- exact model/config;
- target-class metric (e.g. identifier exact match), not only generic WER;
- matched baseline where relevant;
- representative failures;
- evidence that the tested case is within claimed support.

## Good feedback shape

Bad:

> Confidence seems unreliable for numbers.

Good:

> In a 40-utterance amount/identifier corpus using Sync + Universal-3.5 Pro on the global endpoint, 7 target-token errors occurred; 4 carried word confidence above the predeclared 0.90 review threshold. Attached are the fixture hashes, ground truth, response JSON, session IDs, and scoring script. This does not claim confidence is a calibrated probability; the DX concern is that applications may lack guidance for interpreting confidence on high-consequence token classes.
