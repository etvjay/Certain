# Certain submission handoff

## In plain English

Certain gives a judge two separate ways to check spoken payment input. One tool checks whether an action follows its rules and has enough verification evidence. The other checks whether an independent candidate matches values accepted in advance. Both show what was heard. Neither sends money or authorizes an action.

Certain is a voice trust layer for consequential inputs with two peer capabilities. AssemblyAI Dictation provides each candidate's verbatim transcript and optional cleaned dictation. Capability 01 evaluates a payment action against the application contract and required verification evidence. Capability 02 compares an independent candidate against the preaccepted `payment-approval-001` specification. A fresh challenge supports capability 01 with bounded freshness evidence, while speaker similarity is deliberately not shipped. Verification never implies authorization.

## Capability 01, consequential-action verification

1. Use capability 01's own voice control to dictate the payment instruction.
2. Preserve Dictation `text` and `llm_response` separately.
3. Apply the `payment_instruction:v1` contract.
4. Answer the generated five-minute, single-use challenge through Dictation.
5. Repeat the amount and confirm the invoice.
6. Read capability 01's receipt. `VERIFIED` means the declared input contract and required evidence were satisfied. It does not authorize a downstream action.

## Capability 02, preaccepted-specification verification

1. Use capability 02's own voice control to submit an independent candidate instruction.
2. Preserve that candidate's Dictation `text` and `llm_response` separately.
3. Map the candidate to the existing typed payment fields.
4. Compare those fields against `payment-approval-001` and its canonical hash.
5. Read the independent `COMPARISON RESULT`: `MATCH`, `MISMATCH`, or `INCOMPLETE`.
6. A match describes equality with accepted values. It does not verify amount repeat, invoice confirmation, payment authorization, or execution permission.

## Capability dashboard

The demo is structured as two peer capability workspaces, each with its own sidebar, voice control, state, and result area.

- `Verify a consequential action` owns the payment contract, required amount and invoice verification, fresh challenge, final status, and receipt.
- `Verify against a preaccepted specification` owns its own candidate voice input, accepted typed values, canonical hash, and field comparison result.

Dictation, typed mapping, and canonicalization are shared implementation mechanics. They do not share a run or silently pass state from one capability to the other. The `$50,000` case is a separate refusal test below both workspaces.

The shortest judge run is:

1. Choose either capability from its sidebar.
2. Run its own voice control with the valid example.
3. Inspect that workspace's transcript and result.
4. In capability 01, continue with the challenge, amount repeat, invoice confirmation, and receipt.
5. In capability 02, inspect the independent `COMPARISON RESULT` and field-level `MATCH` values.
6. Run the separate `$50,000` refusal test.

The `FEEDBACK / FOUNDRY EVIDENCE` disclosure is intentionally separate from both capabilities. It summarizes AssemblyAI substrate evidence and limitations only.

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
