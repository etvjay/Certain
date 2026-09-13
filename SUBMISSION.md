# Certain submission handoff

Certain is a voice trust layer for consequential inputs. AssemblyAI Dictation provides the verbatim transcript and optional cleaned dictation; Certain converts the verbatim claim into typed payment fields, checks the application contract and the preaccepted `payment-approval-001` specification, requests explicit verification, and emits a Verification Receipt. A fresh challenge adds bounded freshness evidence, while speaker similarity is deliberately not shipped. Verification never implies authorization.

## Final flow

1. Dictate the payment instruction.
2. Preserve Dictation `text` and `llm_response` separately.
3. Compare canonical typed fields against the specification hash `b3f0d50ef7cc754ab11df7df007cda604ea115af4a422e50d8f2ce2f52747656`.
4. Answer the generated five-minute, single-use challenge through Dictation.
5. Repeat the amount and confirm the invoice.
6. Read the receipt. `VERIFIED` means the declared input contract and required evidence were satisfied. It does not authorize a downstream action.

## Evidence index

- Human Dictation corpus: `research/assemblyai/evidence/runs/dictation-human-phase1-live-20260913/` (local generated evidence; 23 supported English fixtures, Pidgin held out).
- Matched context: `research/assemblyai/evidence/runs/dictation-prompt-live-20260913/`.
- Payment context: `research/assemblyai/evidence/runs/dictation-payment-context-live-20260913/`.
- Physical happy path, amount repeat, and invoice confirmation: operator-supplied acceptance in the closeout handoff; no raw recording is committed.
- Specification and fresh challenge browser/API replay: `research/assemblyai/evidence/candidates/certain-voice-final-20260913/browser-demo.json`.
- Negative `$50,000` mutation: `research/assemblyai/evidence/candidates/certain-voice-final-20260913/negative-demo.json`.
- Deterministic pressure cases and receipt boundary checks: `research/assemblyai/evidence/candidates/certain-voice-final-20260913/foundry-results.json`.
- Responsive/hydration checks: `research/assemblyai/evidence/candidates/certain-voice-final-20260913/runtime-qa.json`.
- Full Foundry classification: `research/assemblyai/FINAL_FOUNDRY_REPORT.md`.

## Evidence limits

The browser challenge artifact is controlled getUserMedia replay: the initial and repeat clips use the existing human WAV replay, and the challenge uses synthetic TTS audio. It is not physical-microphone evidence. The exact `$50,000` negative result is a UI simulation backed by deterministic tests and live Dictation human corpus behavior; a separate physical-microphone recording of that exact sentence was not available in the agent environment. The Quick Tunnel used for review is ephemeral. Speaker similarity and durable hosting are deferred.

## Submission boundary

The production path is `https://dictation.assemblyai.com/v1/transcribe/live`, with `config` before `audio`, raw API-key authentication on the server, and `audio/wav` input. Historical Sync adapters and evidence remain available but are not relabeled. Certain performs no payment execution and makes no identity, liveness, biometric-authentication, or authorization claim.
