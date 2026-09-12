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

## Seeded research candidates

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
