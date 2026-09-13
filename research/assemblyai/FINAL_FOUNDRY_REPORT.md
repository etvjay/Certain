# Certain Final Foundry Report

Date: 2026-09-13

This report is the bounded pressure pass for `experiment/spec-bound-voice`, based on the ratified Dictation baseline `8a35183d58f3bef9a4f3f71100d0da7add2724cd` and the implementation commits that add specification comparison, fresh challenge evidence, receipt fields, UI presentation, and the favicon.

## Claim discipline

```text
SPEECH
≠ VERBATIM TRANSCRIPT
≠ CLEAN DICTATION
≠ APPLICATION-VALID INPUT
≠ SPECIFICATION MATCH
≠ SPEAKER SIMILARITY
≠ VERIFIED INPUT
≠ AUTHORIZED ACTION
```

A `VERIFIED` result means that Certain's declared input contract and required evidence steps were satisfied. It never authorizes a downstream action. The optional speaker experiment was not run.

Preaccepted specification: `payment-approval-001`, version `1`, type `payment_instruction/v1`, SHA-256 `b3f0d50ef7cc754ab11df7df007cda604ea115af4a422e50d8f2ce2f52747656`.

## Pressure results

| Experiment ID | Claim tested | Evidence reference | Observation | Reproduction | Classification | Submission relevance |
|---|---|---|---|---|---|---|
| AAI-DICT-SEMANTICS-20260913 | Dictation request shape and response semantics remain stable. | `evidence/runs/dictation-semantics-live-20260913/summary.json` | Correct `config={}` first plus WAV returned 200; missing config and audio-first returned 400 on 3/3; unsupported MPEG returned 415; cleanup metadata was retained separately. | Reproduced in the retained semantic run and adapter tests. | `DOC_GAP` / `INCONSISTENCY` candidate for the documented config wording; not an API bug. | Dictation remains the production substrate. |
| AAI-DICT-CORPUS-20260913 | The migrated product can rerun the fixed human corpus without changing audio. | `evidence/runs/dictation-human-phase1-live-20260913/` | 23 supported English fixtures submitted, 0 HTTP failures, 0 SHA refusals; Pidgin fixture held out; verbatim 19/50 exact and 27/50 normalized; wrong-plus-high-confidence 0. | Retained live run with manifest SHA checks. | `QUALITY_OBSERVATION` | Bounded provider evidence only, not a population accuracy claim. |
| AAI-DICT-PROMPT-20260913 | Prompt and keyterm effects can be compared without changing audio. | `evidence/runs/dictation-prompt-live-20260913/` | Same audio SHA across arms; A0 4/8, A1 8/8, A2 7/8, A3 7/8 exact verbatim target matches. | Retained matched four-arm run. | `QUALITY_OBSERVATION` | Historical and current substrate findings stay separate from Certain semantics. |
| AAI-DICT-CHALLENGE-20260913 | A challenge response reaches the dedicated Dictation API. | `evidence/candidates/certain-voice-final-20260913/browser-demo.json` | The challenge request returned 200 Dictation JSON with verbatim `text`, clean output, confidence, session ID, request time, sync time, and audio duration. | Reproduced in final-build Chromium with controlled getUserMedia audio. | `OBSERVED` | Browser/API integration is proven; physical microphone provenance is not claimed. |
| CERTAIN-SPEC-PRESSURE-001 | Typed specification comparison matches equivalents and rejects mutations. | `evidence/candidates/certain-voice-final-20260913/foundry-results.json`; `__tests__/specification.test.ts` | Canonical field reordering kept the hash stable; a value mutation changed it; `$15,000`, `fifteen thousand dollars`, and `15000 USD` matched; missing invoice was `INCOMPLETE`; wrong cost center and invoice were `MISMATCH`; `$50,000` was `MISMATCH` and contract-blocked. | Deterministic tests and runner passed. | `OBSERVED` | Required spec gate passed. |
| CERTAIN-CHALLENGE-PRESSURE-001 | Fresh challenge evidence is exact, expiring, and single-use. | `evidence/candidates/certain-voice-final-20260913/foundry-results.json`; `__tests__/challenge.test.ts` | Exact match, wrong content, expiry, and replay returned `CHALLENGE_MATCH`, `CHALLENGE_MISMATCH`, `CHALLENGE_EXPIRED`, and `CHALLENGE_ALREADY_USED`. Matching did not remove amount repeat or invoice confirmation. | Deterministic tests plus final-build Dictation browser replay passed. | `OBSERVED` | Required freshness evidence gate passed within the documented session-boundary limitation. |
| CERTAIN-RECEIPT-001 | Receipts preserve provenance and cannot turn a blocked input into a successful receipt. | `browser-demo.json`; `foundry-results.json`; `__tests__/certain.test.ts`, `__tests__/challenge.test.ts` | Valid receipt contains Dictation provenance, spec hash and fields, challenge result, one amount repeat, one invoice confirmation, and the authorization disclaimer. A blocked `$50,000` result stayed `blocked` even with a constructed supplementary speaker match. | Deterministic receipt tests passed; final browser receipt was read back. | `OBSERVED` | Required receipt-integrity gate passed. |
| CERTAIN-BROWSER-001 | The exact hydrated UI presents and executes the full causal flow. | `evidence/candidates/certain-voice-final-20260913/browser-demo.json` | Payment Dictation, specification `MATCH`, generated challenge `CHALLENGE_MATCH`, amount `repeat_match`, invoice `confirm`, and final `VERIFIED` were observed. | Final-build Chromium replay on port 3317; three Dictation responses were read back. | `DEPLOYMENT` / `OBSERVED` | Browser integration passed; audio provenance is controlled replay. |
| CERTAIN-NEGATIVE-001 | Correctly heard `$50,000` cannot pass the preaccepted spec or contract. | `evidence/candidates/certain-voice-final-20260913/negative-demo.json`; `__tests__/specification.test.ts` | Rendered amount was `$50,000`, spec was `MISMATCH`, amount ceiling violation was visible, status was `BLOCKED`, and no receipt section was emitted. | Live UI simulation and deterministic negative test passed. | `OBSERVED` | Required negative semantics passed; exact physical-microphone sentence remains external. |
| CERTAIN-RUNTIME-001 | Final route remains hydrated and usable across desktop/mobile widths. | `evidence/candidates/certain-voice-final-20260913/runtime-qa.json` | React hydration markers and recorder control were present; document/client widths matched at 1440px and 390px; all referenced final-build CSS/JS assets returned 200. | Final-build CDP runtime checks passed. | `OBSERVED` | Narrow UI repair was bounded and non-breaking. |
| CERTAIN-SPEAKER-001 | Speaker similarity could be used as supplementary evidence without overriding semantics. | `experiments/speaker/README.md`; `foundry-results.json` | No model, enrollment samples, calibration set, threshold, embedding, or biometric profile was run. A constructed boundary object with `decision=match` left the blocked receipt `blocked`. | Boundary test only; no ML experiment. | `FEATURE_GAP` / `DEFERRED` | Optional feature consciously excluded from the submission path. |
| CERTAIN-AUTHORITY-001 | A client cannot be mistaken for a server-authoritative authorization boundary. | `SUBMISSION.md`; source inspection | Certain's current demo evaluates and renders the receipt in the browser. It does not claim downstream authorization or secure biometric authentication. | No exploit path was expanded; the limitation is explicit. | `FEATURE_GAP` | Post-hackathon hardening item, not a submission blocker for this input-evidence demo. |

## Security and privacy pressure

- Tracked-source secret scan: no credential value, raw authorization header, or API key was found.
- Tracked WAV inventory: none.
- Tracked embedding/biometric inventory: none.
- Candidate evidence contains no raw audio, audio bytes, embeddings, API key, or authorization header.
- The API key is read only by the server route; the browser calls `/api/transcribe`.
- Challenge replay is rejected after a match in the active session. Refreshing the demo starts a new session and new challenge; this is a session-bound freshness control, not durable authorization.
- No `SECURITY_FINDING` was identified. The absence of a server-authoritative receipt store is recorded as a product feature gap because the product makes no authorization claim.

## Hygiene and deployment

- `/favicon.ico` returned HTTP 200 with `image/x-icon` from the final build.
- `ScriptProcessorNode` still emits a browser deprecation warning. AudioWorklet migration was deferred because it requires a separate worklet asset and could destabilize the already verified recorder.
- Durable Pages deployment: source revision `0364207cdf8d7d90285e8d118f339bf32152f309` produced production deployment `b3b0e238-cb34-42de-9242-7572e682aa91` and served the stable alias `https://certain-338.pages.dev/`; root, `/eval/record`, CSS, and favicon returned HTTP 200.
- Same-origin `/api/transcribe` Pages Function: a live `AAI-HUM-001` WAV smoke request returned HTTP 200 JSON with `provider=assemblyai`, `product=dictation`, verbatim `text`, cleaned `llm_response`, word evidence, and timing fields. The encrypted `ASSEMBLYAI_API_KEY` remains server-side.
- The earlier Quick Tunnel remains ephemeral and is not the durable judge URL.

## Foundry stop gate

```text
unresolved critical contract bug       NO
unresolved receipt-integrity bug       NO
unresolved challenge replay bug        NO
secret/privacy leak                    NO
spec mismatch promotable to VERIFIED  NO
speaker evidence overrides BLOCKED     NO
```

`FINAL FOUNDRY PASS: YES` for the implemented and tested submission surfaces.

## Evidence ceiling

The retained human corpus and user-supplied operator evidence support the stated bounded demo claims. The final browser challenge and negative artifacts are controlled replay/UI-simulation evidence, not physical microphone evidence. The Pages route and live Dictation Function smoke establish deployment availability and one provider integration path, not production authorization, secure identity, liveness, biometric authentication, payment execution, or a general AssemblyAI accuracy rate.

## Final classification

`PASS_WITH_LIMITATIONS`.

The required implementation, deterministic tests, Dictation route, specification comparison, challenge lifecycle, receipt integrity, UI, negative semantics, and durable Pages route passed. The remaining limitations are external or consciously deferred: physical microphone capture of the newly added challenge, physical microphone capture of the exact `$50,000` sentence, ScriptProcessor deprecation, and optional speaker similarity.
