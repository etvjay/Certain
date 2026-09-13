# Certain implementation notes

This file records application-owned engineering decisions. It is separate from `research/assemblyai/FEEDBACK_LEDGER.md` and `research/assemblyai/FINAL_FOUNDRY_REPORT.md`, which are reserved for AssemblyAI substrate observations and provider-facing evidence.

## Plain-language purpose

These notes explain fixes or deliberate exclusions inside Certain itself. They are not claims about AssemblyAI behavior.

## CERTAIN-INT-001, challenge token handling

- **Status:** resolved.
- **Technical issue:** the challenge comparator initially treated spoken digit words as literal tokens, while a Dictation response could return a compound numeric token such as `16`.
- **Implementation decision:** challenge matching canonicalizes digit words to digits and splits compound numeric output before comparison.
- **Regression evidence:** `__tests__/challenge.test.ts` covers numeric rendering, wrong content, expiry, and replay.

## CERTAIN-INT-002, speaker similarity

- **Status:** deferred.
- **Technical boundary:** no embedding model, enrollment samples, calibration set, threshold, or biometric profile is part of the shipped path.
- **Product decision:** no speaker model was added. Challenge evidence remains freshness evidence only, and no supplementary signal can override a blocked contract.
- **Evidence boundary:** this is an explicit scope decision, not AssemblyAI feedback and not an identity or authorization claim.
