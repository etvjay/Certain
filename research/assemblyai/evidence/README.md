# Evidence

`evidence/runs/` is generated and gitignored by default.

## Historical Sync runs

Existing Sync runs remain preserved under their original run IDs. They are historical and must not be relabeled as Dictation evidence.

Each raw Sync run contains:

```text
<run-id>/
├── request.json
├── response.json
└── meta.json
```

## Human corpus runs

`npm run eval:aai:human` uses the dedicated Dictation API by default. Pass `--api sync` only to reproduce the historical Sync surface.

```text
<run-id>/
├── corpus.json
├── observations.json
├── scorecard.json
├── report.md
└── fixtures/
    └── AAI-HUM-001/
        ├── request.json
        ├── response.json
        ├── meta.json
        └── scoring.json
```

For `--compare-prompts`, the fixture directory contains `A0`/`A1`/`A2`/`A3` subdirectories with those four files instead. Matched prompting comparisons use the same audio SHA for every arm. Unsupported cases are recorded in the scorecard only; no request is made for them.

## `corpus.json`

Identifies the evidence substrate explicitly:

- `provider: assemblyai`;
- `product: dictation` or `sync`;
- endpoint;
- model label;
- arm configuration and selected fixture IDs.

## `request.json`

Contains only sanitized request metadata:

- provider and product;
- audio filename;
- audio SHA-256 and bytes;
- endpoint;
- model label;
- config;
- experiment and arm label.

Dictation request config is always recorded, including `{}`. It must never contain the API key or Authorization header.

## `response.json`

Preserves the provider response body exactly as returned when it is valid JSON; otherwise preserves the text body in a wrapper. Dictation responses retain `text`, `words`, `confidence`, `llm_response`, `llm_error`, `audio_duration_ms`, `session_id`, `request_time_ms`, and `sync_time_ms` when supplied.

## `meta.json`

Records:

- run ID/time;
- provider and product;
- HTTP status;
- wall-clock duration;
- session ID;
- request timing;
- sync timing;
- audio duration;
- cleanup error;
- success/failure;
- Node/runtime platform.

## `scoring.json`

Dictation scoring keeps the two output surfaces separate:

```text
verbatim = provider text, with provider word evidence for confidence attribution
cleaned  = provider llm_response, text-only target matching because rewrite text is not word-aligned
```

Certain uses only the verbatim `text` for contract evaluation. Cleaned output is informative metadata and cannot satisfy application verification.

## Promotion

When a finding is ready for review, copy only the smallest sanitized evidence bundle required to reproduce it into a tracked `evidence/candidates/<feedback-id>/` path. Keep source audio out unless it is synthetic/non-sensitive and explicitly intended for publication.
