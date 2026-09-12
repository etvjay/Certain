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

## Documentation consistency candidates

These are **observations, not bugs**.

### DOC-CANDIDATE-001 — language-count wording

Several current Sync/dictation pages describe 18 supported languages, while at least one current official voice-stack article says Sync runs across 19 languages. Before feedback, determine whether this reflects a real product change, different counting semantics, or stale prose.

### DOC-CANDIDATE-002 — model alias naming

Current official Sync examples use both `universal-3-5-pro` and `u3-sync-pro` in `X-AAI-Model`. Determine whether both are supported aliases and whether the API reference documents that equivalence clearly.

### DOC-CANDIDATE-003 — streaming guidance age

Some older official docs/examples refer to `u3-rt-pro` / Universal-3 Pro while newer material uses `universal-3-5-pro`. Do not call this stale until the currently linked documentation path and SDK behavior are checked.

## Boundary for Certain

```text
AssemblyAI
  recognition / timing / confidence / prompting / supported understanding features

Certain
  application-defined schema
  deterministic constraints
  verification requirements
  verification evidence
  trusted-input state transition
```

Certain must not claim differentiation for behavior already native to AssemblyAI.
