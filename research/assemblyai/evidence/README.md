# Evidence

`evidence/runs/` is generated and gitignored by default.

Each raw Sync run should contain:

```text
<run-id>/
├── request.json
├── response.json
└── meta.json
```

Prompting comparisons add a `summary.json` that points at the four arm directories.

## Human corpus runs

`npm run eval:aai:human` writes one directory per run:

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

For `--compare-prompts`, the fixture directory contains `A0`/`A1`/`A2`/`A3`
subdirectories with those four files instead. Matched prompting comparisons use
the same audio SHA for every arm. Unsupported cases are recorded in the
scorecard only; no request is made for them.

## `request.json`

Contains only sanitized request metadata:

- audio filename;
- audio SHA-256;
- endpoint;
- model;
- prompt/keyterms/config;
- experiment label.

It must never contain the API key or Authorization header.

## `response.json`

Preserves the response body exactly as returned when it is valid JSON; otherwise preserves the text body in a wrapper.

## `meta.json`

Records:

- run ID/time;
- HTTP status;
- wall-clock duration;
- Node/runtime platform;
- AssemblyAI `session_id` when returned;
- AssemblyAI `request_time_ms` when returned;
- success/failure.

## Promotion

When a finding is ready for review, copy only the smallest sanitized evidence bundle required to reproduce it into a tracked `evidence/candidates/<feedback-id>/` path. Keep source audio out unless it is synthetic/non-sensitive and explicitly intended for publication.
