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
| AAI-C-U35-001 | U3.5 Pro | Native code-switching is supported across 18 named languages. | DOC_VERIFIED | U3.5 Pro code-switching article | AAI-MULTI-001 |
| AAI-C-STREAM-001 | Streaming | `UpdateConfiguration` can change prompt/keyterms without reconnecting. | DOC_VERIFIED | Voice-agent best practices | AAI-STREAM-001 |
| AAI-C-ENTITY-001 | Entity Detection | Custom entity types are not supported. | DOC_VERIFIED | Entity Detection docs | substrate boundary only |
| AAI-C-GATE-001 | LLM Gateway | Existing OpenAI clients can use the gateway by changing endpoint/key/model. | VENDOR_CLAIM | LLM Gateway product page | AAI-GATE-001 |
| AAI-C-DOC-001 | Sync docs | Current official pages vary between 18 and 19 language wording. | CONFLICT | multiple official 2026 pages | AAI-DOC-001 |
| AAI-C-DOC-002 | Sync docs | Official examples use both `universal-3-5-pro` and `u3-sync-pro`. | CONFLICT | multiple official Sync examples | AAI-DOC-002 |

## Rules

1. Do not mark `OBSERVED` without a durable evidence run.
2. Do not mark a probabilistic quality claim `FALSIFIED` from one utterance.
3. A documentation contradiction can be `CONFLICT` without implying the API is broken.
4. Preserve environment, date, endpoint, model, and relevant account tier with every observation.
5. If a vendor changes docs after our truth freeze, add a new dated row or note; do not rewrite history silently.
