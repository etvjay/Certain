# Certain voice final evidence

Evidence date: 2026-09-13.

This candidate bundle is sanitized metadata and deterministic result evidence. It contains no raw WAV bytes, API key, authorization header, voice embedding, biometric profile, or downstream authorization receipt.

## Artifacts

- `browser-demo.json` — controlled Chromium replay on the experiment build. The initial payment and amount-repeat audio use the existing human WAV replay; the generated challenge uses synthetic TTS replay through controlled `getUserMedia`. All three calls reached the dedicated Dictation API and the UI reached `VERIFIED`.
- `negative-demo.json` — live UI simulation of the exact `$50,000` mutation. The rendered result was `BLOCKED`, the specification was `MISMATCH`, the amount ceiling violation was visible, and no receipt section was emitted. This is not a physical-microphone capture.
- `runtime-qa.json` — hydrated desktop/mobile route checks at 1440px and 390px widths; both had equal document/client widths and the recorder control was present.
- `foundry-results.json` — deterministic pressure results for specification hashes, typed field comparisons, challenge outcomes, receipt integrity, and the speaker boundary.
- `ci.json` — final exact-head local test, typecheck, build, syntax, diff, and privacy-scan receipt.
- `pages-deployment.json` — sanitized Cloudflare Pages production deployment, route checks, hydration check, and live Dictation Function smoke result.

The Pages Function smoke request used the existing `AAI-HUM-001` WAV fixture and returned HTTP 200 JSON with `provider=assemblyai` and `product=dictation`. The deployed endpoint is same-origin and keeps the AssemblyAI secret server-side.

## External operator evidence

The prior operator microphone acceptance established the valid first utterance, amount repeat, invoice confirmation, and final receipt. Its provenance is user-supplied in the closeout handoff and is not independently reconstructible from this repository artifact.

A separate physical-microphone challenge response and a separate physical-microphone capture of the exact `$50,000` sentence were not available in the agent environment. They must not be represented by the controlled replay or UI simulation artifacts above.

## Claims permitted

Certain verifies typed application input and preserves the evidence required by the declared contract. A specification match is not speaker confirmation. Challenge matching is freshness evidence only, not proof of liveness or identity. Speaker similarity is deferred and is not required for `VERIFIED`. `VERIFIED` does not authorize any downstream action.
