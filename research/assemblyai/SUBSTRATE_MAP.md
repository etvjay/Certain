# AssemblyAI Substrate Map

Truth freeze: **2026-09-12**.

This document records the substrate before we judge gaps. Primary sources are AssemblyAI documentation/product pages and current official technical articles. Performance numbers remain `VENDOR_CLAIM` until independently reproduced.

## Sync Speech-to-Text

### Verified documented surface

- Global endpoint: `https://sync.assemblyai.com/transcribe`.
- US residency endpoint: `https://sync.us.assemblyai.com/transcribe`.
- EU residency endpoint: `https://sync.eu.assemblyai.com/transcribe`.
- Request shape: multipart audio POST with API key in `Authorization` and model in `X-AAI-Model`.
- Intended workload: completed short utterances rather than continuous open-mic audio.
- Documented clip range: 80 ms through 120 seconds, up to 40 MB.
- Documented input: WAV or raw PCM; default raw PCM examples use 16 kHz/16-bit conventions.
- Response includes transcript text, `words`, overall confidence, audio duration, `session_id`, and `request_time_ms`.
- Sync supports contextual `prompt`, `keyterms_prompt`, and conversation context.
- Connection pre-warming is documented as a latency optimization; warm and transcribe must reuse the same client/connection pool and base URL.

### Vendor performance claims to reproduce, not repeat as fact

- Roughly 134 ms p50 on short clips in favorable US/EU conditions.
- Short-form WER figures published in official marketing/technical material.

### Feature boundary

Current official material says Sync does not expose the full async/streaming feature surface; examples specifically call out PII redaction, speaker diarization, Speech Understanding, and Medical Mode as reasons to use other paths.

Primary sources:

- https://www.assemblyai.com/blog/sync-speech-to-text-api-technical-walkthrough
- https://www.assemblyai.com/blog/build-push-to-talk-dictation-sync-api
- https://www.assemblyai.com/blog/the-voice-ai-stack-for-building-agents

## Universal-3.5 Pro

### Verified documented surface

- Current flagship across recent pre-recorded and real-time material.
- Contextual `prompt` steers recognition using a natural-language description of the audio/domain.
- `keyterms_prompt` biases recognition toward exact names, jargon, products, identifiers, and other vocabulary.
- Official guidance treats prompt and keyterms as complementary controls, not substitutes.
- Universal-3.5 Pro material documents native code-switching across 18 named languages: English, Spanish, French, German, Italian, Portuguese, Arabic, Danish, Dutch, Finnish, Hebrew, Hindi, Japanese, Mandarin, Norwegian, Swedish, Turkish, and Vietnamese.

Primary sources:

- https://www.assemblyai.com/blog/universal-3-5-pro-code-switching-contextual-prompting
- https://www.assemblyai.com/blog/speech-to-text-prompting-assemblyai-universal-3-pro
- https://www.assemblyai.com/blog/build-push-to-talk-dictation-sync-api

## Dictation API

### Verified documented surface

- Endpoint: `https://dictation.assemblyai.com/v1/transcribe/live`; US and EU hostnames are also documented.
- Request shape: multipart/form-data with `config` first and `audio` second. `config` is always present; `{}` selects defaults.
- Authentication: raw API key in `Authorization`, with no `Bearer` prefix. The documented invalid-key response is HTTP 404.
- WAV or raw 16-bit PCM input, up to 120 seconds. Compressed formats are rejected.
- `text` is the verbatim transcript and must never be replaced by the rewrite.
- `llm_response` is an optional cleaned dictation; `llm_error` reports rewrite failure while the request can still return 200 with usable `text`.
- Response includes `words`, overall `confidence`, `audio_duration_ms`, `session_id`, `request_time_ms`, and `sync_time_ms`.
- `stt_prompt` describes the audio context; `keyterms_prompt` biases exact terms. Certain uses canonical `stt_prompt` and does not rely on the older `prompt` alias.

### Certain boundary

Certain evaluates application fields from Dictation `text` only. `llm_response` is retained and displayed as non-authoritative cleanup metadata. Cleanup does not satisfy amount repeat verification, invoice confirmation, or any other Certain contract requirement.

Primary sources:

- https://www.assemblyai.com/docs/api-reference/dictation-api/transcribe-live
- https://www.assemblyai.com/docs/dictation/error-handling
- https://www.assemblyai.com/docs/dictation/transcript-rewriting

## Streaming

### Verified documented surface

- Current v3 WebSocket examples use `wss://streaming.assemblyai.com/v3/ws`.
- Regional US/EU streaming endpoints are also documented.
- Current Universal-3.5 Pro real-time material documents live configuration updates through `UpdateConfiguration`.
- Fields documented as dynamically updateable include `prompt`, `keyterms_prompt`, and turn-silence settings.
- Official guidance documents dynamic vocabulary changes as the conversation moves between stages.

Primary sources:

- https://www.assemblyai.com/docs/voice-agents/best-practices
- https://www.assemblyai.com/blog/real-time-transcription-python

## Entity Detection

### Verified documented surface

Entity Detection exposes a predefined entity taxonomy covering categories such as people, organizations, account numbers, dates, medical data, banking information, and others.

**Important boundary:** official documentation says custom entity types are not supported.

This is directly relevant to Certain: application-specific types such as `invoice_id`, an allowed vendor set, amount ceilings, and verification policy remain above the substrate.

Primary source:

- https://www.assemblyai.com/docs/speech-understanding/entity-detection

## LLM Gateway

### Current documented/product claims

- One AssemblyAI key can route to models from multiple providers.
- The interface is advertised as OpenAI-compatible.
- Current product page advertises streaming, tools, JSON/structured output on supported models, automatic fallbacks, multiple regions, and zero-data-retention options.
- Compatibility and fallback behavior remain claims to test against actual OpenAI client behavior.

Primary sources:

- https://www.assemblyai.com/products/llm-gateway
- https://www.assemblyai.com/blog/reintroducing-llm-gateway

## Historical documentation candidates (Sync / older cross-product pages)

These are retained for historical research and are **not current Dictation feedback**.

### DOC-CANDIDATE-001 — language-count wording

Older Sync/cross-product material varied between 18 and 19 language wording. The current Dictation language-selection page enumerates 19 codes, including Urdu. Retain the old question as historical documentation bookkeeping; do not present it as a current Dictation defect without a new conflicting primary source.

### DOC-CANDIDATE-002 — model alias naming

Current official Sync examples use both `universal-3-5-pro` and `u3-sync-pro` in `X-AAI-Model`. This is Sync-specific and remains historical, not a Dictation submission headline.

### DOC-CANDIDATE-003 — streaming guidance age

Some older official docs/examples refer to `u3-rt-pro` / Universal-3 Pro while newer material uses `universal-3-5-pro`. This remains a separate Streaming documentation question, not a Dictation claim.

## Current Dictation observations

The bounded live semantics run on 2026-09-13 used the existing `AAI-HUM-001.wav` and no retained credential values:

- `D0`: `config={}` first and `audio` second returned HTTP 200 JSON with `text`, `words`, `confidence`, `audio_duration_ms`, `session_id`, `request_time_ms`, `llm_response`, `llm_error`, and `sync_time_ms`.
- `D1`: audio-only returned HTTP 400 on 3/3 attempts.
- `D2`: audio-first/config-second returned HTTP 400 on 3/3 attempts.
- `D3`: the default rewrite returned alongside the verbatim text with `llm_error: null`.
- `D4`: a tiny `audio/mpeg` request returned HTTP 415.

The exact sanitized summary is retained at `evidence/runs/dictation-semantics-live-20260913/summary.json`; raw provider responses remain outside tracked source. D1/D2 support the documented request rule. The difference between the required-config wording and the transcript-rewriting prose is retained as a `DOC_GAP`/`INCONSISTENCY` candidate, not an API bug.

## Boundary for Certain

```text
AssemblyAI
  recognition / timing / confidence / prompting / supported understanding features

Certain
  application-defined schema
  deterministic constraints
  preaccepted typed specification + canonical SHA-256 hash
  fresh challenge generation and single-use freshness evidence
  verification requirements
  verification evidence
  trusted-input state transition
```

Speaker similarity is not part of the shipped path. Any future embedding result must remain experimental supplementary evidence and cannot override a contract or specification block.

Certain must not claim differentiation for behavior already native to AssemblyAI.
