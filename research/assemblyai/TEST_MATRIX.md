# Test Matrix

## Reproduction thresholds

These are defaults, not statistical guarantees.

| Claim type | Minimum default evidence |
|---|---:|
| deterministic request/validation bug | 3 independent attempts |
| documentation/API mismatch | 3 attempts + primary-source citation |
| latency statement | 20+ runs; report distribution, not one number |
| recognition-quality claim | 20+ representative utterances |
| prompting benefit | matched pairs on same audio |
| confidence calibration | token-level corpus; stratify correct vs incorrect |
| regional comparison | same files/config, repeated per endpoint |

## P0 — hackathon-critical

| Experiment | Question | Method | Evidence | Falsification / decision |
|---|---|---|---|---|
| D0 | Does the Dictation endpoint accept the documented correct request? | Raw HTTP with `config={}` first and the existing WAV second. | request order, status/body, response fields, timings, session ID | Close when 200 JSON and fields are retained. |
| D1 | Is `config` actually required? | Raw HTTP audio-only request, one bounded attempt plus repeat if needed. | status/body and endpoint metadata | Classify against current docs; do not call it a bug without reproduction. |
| D2 | Does wrong multipart order fail closed? | Raw HTTP audio first, config second. | status/body and endpoint metadata | Expected request rejection; document actual status. |
| D3 | Does cleanup failure leave verbatim text usable? | Response fixture/live request with `llm_response:null` and `llm_error` set, or a naturally observed failure. | text, cleaned output, error, Certain decision | `text` remains usable; cleanup never satisfies verification. |
| D4 | Does the documented unsupported format rejection hold? | One tiny controlled non-WAV/PCM request if safe. | status/body | Expected 415; no high-volume testing. |
| AAI-DICT-CORPUS-001 | How does Dictation perform on the fixed human corpus? | Same SHA-verified 24-fixture corpus; 23 supported cases submitted, unsupported case held out. | per-fixture text/llm_response/words/confidence/timings + dual scorecard | Report corpus-bounded verbatim and cleaned metrics. |
| AAI-DICT-PROMPT-001 | What incremental value comes from Dictation `stt_prompt` vs keyterms? | A0/A1/A2/A3 matched pairs on same human clips. | four responses per fixture + verbatim/cleaned scoring | Report effect only on this corpus. |
| AAI-DICT-CORRECTION-001 | Does default cleanup resolve a spoken self-correction? | Existing self-correction fixture; compare verbatim `text` and cleaned `llm_response`. | both outputs + Certain candidate amount + verification state | Cleanup does not remove repeat requirement. |

### Dictation evidence result — 2026-09-13

- D0 passed: `config={}` first and WAV `audio` second returned HTTP 200 JSON with the documented response fields.
- D1 returned HTTP 400 on 3/3 audio-only attempts.
- D2 returned HTTP 400 on 3/3 audio-first/config-second attempts.
- D3 returned HTTP 200 with both verbatim `text` and default cleaned `llm_response`; `llm_error` was `null` in the observed success.
- D4 returned HTTP 415 for a tiny `audio/mpeg` payload.
- The D1/D2 behavior is consistent with the API reference. The transcript-rewriting prose that says omitting the whole `config` part runs default cleanup remains a documentation inconsistency candidate.
- Sanitized summary: `evidence/runs/dictation-semantics-live-20260913/summary.json`.

## Historical Sync evidence

The following experiments remain Sync-specific and must not be relabeled:

| AAI-SYNC-001 | What exactly does a successful Sync response expose? | Run known WAV through raw HTTP harness. | request metadata, response, timings, session ID | Close when actual response shape is recorded. |
| AAI-SYNC-002 | What happens below the 80 ms floor? | Generate/use sub-80 ms non-sensitive WAV and submit 3x. | HTTP status/body/session metadata | Do not label bug if error matches documented floor. Evaluate error clarity only. |
| AAI-SYNC-003 | What happens around 120 s ceiling / 40 MB? | Boundary fixtures: valid-near-limit and invalid-over-limit where practical. | response/error + fixture metadata | Focus on semantics/diagnostics, not defeating limits. |
| AAI-ID-001 | How accurately are consequential identifiers transcribed? | 20+ utterances: invoice IDs, hex-like strings, account-style strings, SKUs. | exact-match table + confidence | Quality observation only after corpus threshold. |
| AAI-MONEY-001 | How accurately are amounts represented? | Spoken amounts across magnitudes, currencies, corrections. | exact normalized amount vs transcript + confidence | Separate STT recognition error from formatting preference. |
| AAI-CONF-001 | Is word confidence useful for identifying consequential errors? | Label each target token correct/incorrect and retain confidence. | calibration table, false-high-confidence examples | Never claim confidence is a probability unless docs say so. |
| AAI-PROMPT-001 | What incremental value comes from prompt vs keyterms? | A0/A1/A2/A3 matched pairs on same clips. | four responses per fixture + target-term scoring | Report effect size on this corpus, not universal superiority. |
| AAI-DOC-001 | Is Sync language count currently 18 or 19? | Check current reference + supported-code behavior; compare official pages. | dated source ledger + API behavior if exposed | If docs distinguish surfaces/counting, close as explained. |
| AAI-DOC-002 | Are `universal-3-5-pro` and `u3-sync-pro` equivalent accepted aliases? | Same clip/config repeated under each model header. | status/result/session IDs | If both work and aliasing is documented, no feedback. |

## P1 — strong platform feedback candidates

| Experiment | Question | Method |
|---|---|---|
| AAI-LAT-001 | How do wall-clock latency and `request_time_ms` relate? | 20+ same-length clips; retain both; report p50/p95 locally. |
| AAI-SYNC-005 | Do global/US/EU endpoints behave consistently? | Same fixture/config against each endpoint where account access permits. Do not infer physical residency from latency. |
| AAI-ERROR-001 | Are common failures distinguishable and actionable? | Too short, malformed WAV, missing model, bad model alias, missing auth using non-secret test harness patterns. |
| AAI-OVERPROMPT-001 | Can excessive/common keyterms induce false insertions? | Clean matched corpus with absent keyterms; compare baseline vs overloaded list. |
| AAI-STREAM-001 | When does `UpdateConfiguration` take effect? | Same term before update, after keyterm update, and after clearing. Preserve turn timestamps/events. |
| AAI-MULTI-001 | How does native code-switching behave on our voices? | Matched clips from supported language pairs. Keep unsupported Pidgin observations separately labeled. |
| AAI-DX-001 | Are raw HTTP, JS examples, parameter names, and current docs aligned? | Build parity table from runnable minimal examples. |

## P2 — post-hackathon

| Experiment | Question |
|---|---|
| AAI-DIAR-001 | What happens when transcription is correct but speaker attribution is wrong? |
| AAI-ASYNC-001 | How do Sync and async outputs differ on the same short clip? |
| AAI-GATE-001 | What portion of OpenAI client behavior is actually drop-in compatible with LLM Gateway? |
| AAI-GATE-002 | Are fallback semantics observable and debuggable? |
| AAI-REGION-001 | Are region-selection semantics clear and consistent across products/SDKs? |

## Corpus design

The corpus should contain ordinary language and adversarial-but-natural speech. Avoid contrived tongue twisters unless testing a specific documented claim.

Target classes:

- proper names;
- protocol/product names;
- invoice/order IDs;
- mixed letters/numbers;
- money amounts;
- dates/times;
- URLs/emails;
- self-corrections;
- filler words;
- fast and slow delivery;
- background noise at realistic levels;
- Nigerian English;
- supported code-switched pairs;
- Pidgin as explicitly unsupported-case research, never as a claimed-support defect.
