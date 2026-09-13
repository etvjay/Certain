# Certain

**Verified voice input for consequential actions.**

Certain is a thin application-contract layer for voice input. AssemblyAI answers **what was heard**. Certain answers a different question: **does the resulting input satisfy the application's contract, and has every field that requires verification actually been verified?**

The project is intentionally small. It is not another transcription app, not a voice agent, and not an authorization system.

## Thesis

Voice systems often collapse distinct stages into one:

```text
SPEECH != VERBATIM TRANSCRIPT != CLEAN DICTATION != APPLICATION-VALID INPUT != SPECIFICATION MATCH != SPEAKER SIMILARITY != VERIFIED INPUT != AUTHORIZED ACTION
```

A transcript can be perfectly recognized and still be invalid for an application. An amount can exceed a limit. An invoice ID can violate a required pattern. A recipient can be outside an allowed set. A field can require explicit repeat verification even when recognition confidence is high.

Certain makes that boundary explicit.

```text
speech
  -> AssemblyAI Dictation
  -> verbatim transcript + clean dictation
  -> typed field mapping
  -> application contract
  -> preaccepted specification comparison + spec hash
  -> fresh challenge evidence (when configured)
  -> verification requirements
  -> verification receipt
  -> trusted typed input
```

## What the substrate already does

Certain deliberately does **not** reimplement AssemblyAI capabilities.

AssemblyAI provides the recognition substrate:

- Dictation API on Universal-3.5 Pro for short push-to-talk utterances;
- verbatim transcript in `text`;
- optional cleaned dictation in `llm_response`;
- transcript and per-word confidence;
- contextual `stt_prompt`;
- `keyterms_prompt` for domain vocabulary;
- language support and formatting.

Certain begins **after recognition**. Its responsibility is application-specific validity and verification policy. Certain evaluates the verbatim `text`; Dictation cleanup is displayed separately and never silently replaces the evidence.

AssemblyAI Dictation documentation:

- https://www.assemblyai.com/docs/api-reference/dictation-api/transcribe-live
- https://www.assemblyai.com/docs/dictation/error-handling
- https://www.assemblyai.com/docs/dictation/transcript-rewriting
- https://www.assemblyai.com/docs/dictation/prompting-and-keyterms

## Weekend proof

The first contract is intentionally bounded: `payment_instruction/v1`.

A user dictates:

> Pay Acme Labs fifteen thousand dollars against invoice INV-14892 from Growth next Friday.

AssemblyAI produces the transcript. Certain maps the utterance into typed fields and evaluates the contract:

```ts
const paymentInstruction = {
  vendor: {
    type: "vendor",
    allowed: ["Acme Labs", "Northstar", "AssemblyAI"],
    verification: "on_uncertainty",
  },
  amount: {
    type: "money",
    currency: "USD",
    max: 25_000,
    verification: "repeat_match",
  },
  invoiceId: {
    type: "invoice_id",
    pattern: /^INV-\d{5}$/,
    verification: "required",
  },
  costCenter: {
    type: "enum",
    allowed: ["Engineering", "Growth", "Operations"],
  },
  dueDate: {
    type: "date",
    futureOnly: true,
  },
};
```

Expected result:

```text
vendor      Acme Labs       VALID
amount      $15,000         REQUIRES_VERIFICATION
invoiceId   INV-14892       VALID
costCenter  Growth          VALID
dueDate     next Friday     VALID

STATUS: REQUIRES_VERIFICATION
```

The user repeats the amount. If the normalized second hearing matches the first, Certain transitions the field to `VERIFIED` and emits a verification receipt.

## Preaccepted specification

The demo also compares the typed fields against one bounded, preaccepted specification. It is not a generic policy language:

```json
{
  "id": "payment-approval-001",
  "version": "1",
  "type": "payment_instruction/v1",
  "fields": {
    "vendor": { "mode": "equals", "value": "Acme Labs" },
    "amount": { "mode": "equals", "value": 15000, "currency": "USD" },
    "invoiceId": { "mode": "equals", "value": "INV-14892" },
    "costCenter": { "mode": "equals", "value": "Growth" }
  }
}
```

Certain canonicalizes object keys before hashing with SHA-256. The published hash is `b3f0d50ef7cc754ab11df7df007cda604ea115af4a422e50d8f2ce2f52747656`. Comparison is field-by-field over typed values, not sentence strings, and returns `MATCH`, `MISMATCH`, or `INCOMPLETE`. A `MATCH` says the observed value equals the preaccepted value; it does not replace the amount repeat or invoice confirmation requirements.

## Fresh challenge evidence

After a payment instruction is captured, Certain generates a fresh phrase with a random vendor, two spoken digits, a color, a unique ID, and a five-minute expiry. The response is sent through the same dedicated Dictation API, then compared by canonical tokens. A matched challenge is consumed and a second use is rejected. This is freshness evidence only, not proof of liveness, identity, or authorization.

## Negative mutation

The key demo is not the happy path.

Say instead:

> Pay Acme Labs fifty thousand dollars against invoice INV-14892 from Growth next Friday.

AssemblyAI can transcribe `$50,000` perfectly. Certain must still reject the payload because the application contract caps the amount at `$25,000`. The same input also compares as a `MISMATCH` against the preaccepted `$15,000 USD` amount. A matched fresh challenge or supplementary speaker-similarity result cannot override either failure.

```text
TRANSCRIPTION: CORRECT
APPLICATION CONTRACT: VIOLATED
STATUS: BLOCKED
```

That mutation is the core falsification test for the project. If Certain cannot distinguish recognition correctness from application validity, it has no reason to exist.

## Architecture

```text
Browser
  |
  | microphone -> WAV
  v
/api/transcribe
  |
  v
AssemblyAI Dictation / Universal-3.5 Pro
  |
  | verbatim text + clean dictation + word confidence
  v
Field Mapper
  |
  | bounded payment_instruction/v1 fields
  v
Contract Engine
  |-- deterministic type checks
  |-- allowed sets
  |-- regex constraints
  |-- numeric bounds
  |-- temporal constraints
  `-- verification policy
  |
  v
Preaccepted Specification
  |-- canonical typed field comparison
  `-- SHA-256 specification hash
  |
  v
Fresh Challenge
  `-- dedicated Dictation response + single-use token match
  |
  v
Verification Engine
  |-- confirm
  `-- repeat_match
  |
  v
Verification Receipt
```

## State model

```text
CAPTURED
   |
   v
TRANSCRIBED
   |
   v
VALIDATED
   |\
   | \ contract/specification violation
   |  -> BLOCKED
   |
   | preaccepted specification MATCH
   v
FRESH_CHALLENGE
   |\
   | \ mismatch / expired / replay
   |  -> remains unresolved
   |
   | matched freshness evidence
   v
REQUIRES_VERIFICATION
   |
   | amount repeat + invoice confirmation
   v
VERIFIED
```

`VERIFIED` does not mean "true" and does not mean "authorized". It means the declared Certain contract and its required verification steps were satisfied.

## Repository layout

```text
app/
  api/transcribe/route.ts   # server-side AssemblyAI integration
  favicon.ico
  globals.css
  layout.tsx
  page.tsx                  # one-page demo
components/
  CertainDemo.tsx
hooks/
  useRecorder.ts            # microphone capture + WAV conversion
lib/
  assemblyai.ts                 # Dictation product entry point
  assemblyai/
    dictation.ts                # production Dictation adapter
    sync.ts                     # historical Sync adapter
  certain/
    contract.ts             # payment_instruction/v1
    extract.ts              # bounded transcript -> typed fields
    normalize.ts            # repeat-comparison normalization
    specification.ts        # preaccepted typed spec + canonical hash
    challenge.ts            # fresh expiring challenge evidence
    receipt.ts              # evidence artifact
    types.ts
    validate.ts             # deterministic contract engine
    verify.ts               # verification transitions
__tests__/
  certain.test.ts
```

## Scope

### Necessary for the primitive

- short push-to-talk capture;
- AssemblyAI Dictation transcription;
- one declarative application contract;
- bounded field mapping;
- deterministic contract evaluation;
- one preaccepted typed specification with a canonical hash;
- one expiring, single-use freshness challenge;
- one repeat-match verification mechanism;
- `REQUIRES_VERIFICATION`, `VERIFIED`, and `BLOCKED` states;
- a machine-readable verification receipt.

### Necessary for the hackathon demo

- one polished payment-instruction flow;
- visible raw transcript vs Certain evaluation;
- preaccepted specification match with field evidence;
- fresh challenge response through Dictation;
- successful repeat verification;
- one negative mutation (`$50k > $25k`);
- clear evidence of what AssemblyAI supplied and what Certain added.

### Explicit non-goals for this build

- generic voice agents;
- arbitrary schema generation;
- payment execution;
- authorization or wallet permissions;
- accounts or persistence;
- browser extensions;
- streaming transcription;
- cryptographic attestations;
- generalized named-entity recognition;
- speaker embeddings or biometric authentication;

## Local development

Requirements:

- Node.js 20+
- an AssemblyAI API key

```bash
git clone https://github.com/etvjay/Certain.git
cd Certain
npm install
cp .env.example .env.local
npm run dev
```

Set:

```bash
ASSEMBLYAI_API_KEY=your_key_here
```

Then open `http://localhost:3000`.

## Tests

```bash
npm test
npm run typecheck
npm run build
```

The minimum evidence suite covers:

1. valid payment instruction -> requires amount verification;
2. amount above contract maximum -> blocked even if transcription is otherwise valid;
3. malformed invoice ID -> blocked;
4. unknown vendor -> blocked;
5. valid cost center -> accepted;
6. repeat match -> verified;
7. repeat mismatch -> remains unresolved;
8. verified receipt preserves contract version and field evidence;
9. specification hash and field comparison are preserved in the receipt;
10. fresh challenges expire, match through Dictation output, and reject replay;
11. speaker evidence, if supplied, remains experimental and cannot override a block.

## Security boundary

The AssemblyAI API key is server-only. Browser code sends audio to `/api/transcribe`; the server route calls AssemblyAI. Certain does not expose the API credential to the client. Challenge state is bounded to the browser session; it is freshness evidence for this demo, not an identity or authorization primitive.

This prototype also deliberately stops before downstream execution. A `VERIFIED` receipt is input evidence, **not authorization**. Any system that moves money, changes state, or calls a privileged tool must perform its own authority checks after Certain. Speaker similarity is not shipped; if experimental evidence is supplied to the receipt API, it is supplementary and cannot override a contract or specification block.

## Design invariant

> AssemblyAI hears the user. Certain compares the typed claim to its application contract and, when configured, a preaccepted specification, then records the evidence required to trust the input. Neither voice similarity nor verification is authorization.

## Status

Ratified Dictation build plus specification-bound verification and fresh challenge evidence for AssemblyAI Voice Hackathon Week, September 2026. The optional speaker-similarity experiment is deliberately deferred; the current Quick Tunnel is a temporary review deployment, not durable hosting.
