# Claim Ledger

Status vocabulary:

- `DOC_VERIFIED` — supported by current primary documentation.
- `VENDOR_CLAIM` — vendor performance/quality claim awaiting our reproduction.
- `OBSERVED` — directly measured by our experiment.
- `CONFLICT` — current official sources appear inconsistent; root cause unresolved.
- `FALSIFIED` — our reproducible evidence contradicts the tested claim under the stated conditions.
- `RETIRED` — no longer relevant/current.

| ID | Surface | Claim | Status | Primary source | Required experiment |
|---|---|---|---|---|---|
| AAI-C-SYNC-001 | Sync | Short audio can be transcribed with one HTTP POST and no polling. | DOC_VERIFIED | Sync technical walkthrough | AAI-SYNC-001 |
| AAI-C-SYNC-002 | Sync | Documented clip range is 80 ms to 120 s, up to 40 MB. | DOC_VERIFIED | Sync technical walkthrough / dictation guide | AAI-SYNC-002/003 |
| AAI-C-SYNC-003 | Sync | Response exposes text, word data/confidence, overall confidence, `session_id`, and `request_time_ms`. | DOC_VERIFIED | Sync dictation guide | AAI-SYNC-001 |
| AAI-C-SYNC-004 | Sync | Global, US, and EU endpoints share the request shape. | DOC_VERIFIED | Sync technical walkthrough | AAI-SYNC-005 |
| AAI-C-SYNC-005 | Sync | `prompt` and `keyterms_prompt` are supported and serve distinct roles. | DOC_VERIFIED | Dictation/prompting guides | AAI-PROMPT-001 |
| AAI-C-SYNC-006 | Sync | Short-clip p50 can be around 134 ms under favorable conditions. | VENDOR_CLAIM | Sync technical walkthrough | AAI-LAT-001 |
| AAI-C-DICT-001 | Dictation | Dictation uses `/v1/transcribe/live` with `config` first and `audio` second; `config={}` is valid. | DOC_VERIFIED | Dictation API reference | D0/D1/D2 |
| AAI-C-DICT-002 | Dictation | Dictation returns verbatim `text` alongside optional cleaned `llm_response`; cleanup failure can still return usable `text`. | DOC_VERIFIED | Dictation API reference / rewrite / errors | D3 |
| AAI-C-DICT-003 | Dictation | Dictation returns word evidence, confidence, audio duration, session ID, request timing, and sync timing. | DOC_VERIFIED | Dictation API reference | D0 |
| AAI-C-DICT-004 | Dictation | 429, 502, 503, and 504 are transient retry candidates; 401 and 404 are credential failures. | DOC_VERIFIED | Dictation error handling | D0/D4 |
| AAI-C-DICT-005 | Dictation | Dictation supports `stt_prompt` and `keyterms_prompt` as complementary recognition controls. | DOC_VERIFIED | Dictation API reference / language selection | AAI-DICT-PROMPT-001 |
| AAI-C-U35-001 | U3.5 Pro | Native code-switching is supported across 18 named languages. | DOC_VERIFIED | U3.5 Pro code-switching article | AAI-MULTI-001 |
| AAI-C-STREAM-001 | Streaming | `UpdateConfiguration` can change prompt/keyterms without reconnecting. | DOC_VERIFIED | Voice-agent best practices | AAI-STREAM-001 |
| AAI-C-ENTITY-001 | Entity Detection | Custom entity types are not supported. | DOC_VERIFIED | Entity Detection docs | substrate boundary only |
| AAI-C-GATE-001 | LLM Gateway | Existing OpenAI clients can use the gateway by changing endpoint/key/model. | VENDOR_CLAIM | LLM Gateway product page | AAI-GATE-001 |
| AAI-C-DOC-001 | Sync docs | Current official pages vary between 18 and 19 language wording. | CONFLICT | multiple official 2026 pages | AAI-DOC-001 |
| AAI-C-DOC-002 | Sync docs | Official examples use both `universal-3-5-pro` and `u3-sync-pro`. | CONFLICT | multiple official Sync examples | AAI-DOC-002 |

## Current Dictation evidence

The 2026-09-13 live evidence is kept separate from historical Sync evidence:

- `AAI-DICT-CORPUS-001`: 23 supported human fixtures, 0 HTTP failures, 0 SHA refusals, and `AAI-HUM-024` held out as unsupported Pidgin.
- Verbatim baseline: 19/50 exact target-token matches, 27/50 normalized matches, 0 wrong-plus-high-confidence findings.
- Cleaned baseline: 23/23 fixtures returned `llm_response`; 19/50 exact and 27/50 normalized matches on the same target set.
- `AAI-DICT-PROMPT-001`: matched Dictation arms used the same audio SHA for each fixture. Verbatim aggregate exact scores were A0 4/8, A1 8/8, A2 7/8, and A3 7/8.
- Payment-context comparison on `AAI-HUM-001`: A0 2/5, A1 3/5, A2 3/5, A3 4/5 exact verbatim matches.
- Semantic checks: D0 200; D1 400 on 3/3; D2 400 on 3/3; D3 200 with cleanup output; D4 415.

These are observations over the fixed corpus and bounded probes, not population-level quality claims. Evidence roots are under `research/assemblyai/evidence/runs/` locally and are gitignored because they contain provider response text.

## Rules

1. Do not mark `OBSERVED` without a durable evidence run.
2. Do not mark a probabilistic quality claim `FALSIFIED` from one utterance.
3. A documentation contradiction can be `CONFLICT` without implying the API is broken.
4. Preserve environment, date, endpoint, model, and relevant account tier with every observation.
5. If a vendor changes docs after our truth freeze, add a new dated row or note; do not rewrite history silently.
