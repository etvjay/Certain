# Certain

**Verified voice input for consequential actions.**

## Start here

### In plain English

Certain is a checkpoint for spoken instructions that could have real consequences, such as a payment. It shows what the speech service heard, turns that statement into named fields, and makes a bounded decision before anyone treats the input as trustworthy. It does not send money or grant permission.

The page contains two separate tools:

1. **Verify a consequential action** checks whether a spoken payment instruction follows the application's rules, completes the required repeat and confirmation steps, and produces a `Verification Receipt`.
2. **Verify against a preaccepted specification** checks an independent spoken candidate against values accepted in advance, then reports `MATCH`, `MISMATCH`, or `INCOMPLETE`.

A clear `VERIFIED` result means the declared input rules and evidence steps were satisfied. It does not mean the statement is true, identify the speaker, prove liveness, or authorize a downstream action. A correctly heard `$50,000` instruction remains blocked by the `$25,000` application limit.

### Technical terms in this README

- **AssemblyAI Dictation** is the speech-recognition service. Its `text` field is the verbatim transcript, meaning the words returned as heard. Its optional `llm_response` field is clean dictation, meaning a separate readable rewrite that is never used as the authoritative contract input.
- **Typed fields** are the structured values Certain extracts from speech, such as `vendor`, `amount`, `invoiceId`, `costCenter`, and `dueDate`.
- **Application contract** is the fixed `payment_instruction/v1` rule set for allowed vendors, the USD amount ceiling, invoice format, cost center, date constraints, and required verification.
- **Preaccepted specification** is the fixed `payment-approval-001` set of expected typed values. Certain compares canonical values field by field rather than comparing sentences.
- **Canonical** means equivalent representations are put into one stable form. The specification's canonical representation is hashed with `SHA-256` so the same specification has the same `specHash`.
- **Fresh challenge** is a random, expiring, single-use phrase used as freshness evidence. It is not identity or liveness proof.
- **Verification Receipt** is the evidence record showing the contract result, transcript provenance, specification result, and required verification steps. It is not an authorization record.

Certain is a thin application-contract layer for voice input. AssemblyAI answers **what was heard**. Certain answers a different question: **does the resulting input satisfy the application's contract, and has every field that requires verification actually been verified?**

The project is intentionally small. It is not another transcription app, not a voice agent, and not an authorization system.

## Thesis

Voice systems often collapse distinct stages into one:

```text
SPEECH != VERBATIM TRANSCRIPT != CLEAN DICTATION != APPLICATION-VALID INPUT != SPECIFICATION MATCH != SPEAKER SIMILARITY != VERIFIED INPUT != AUTHORIZED ACTION
```

A transcript can be perfectly recognized and still be invalid for an application. An amount can exceed a limit. An invoice ID can violate a required pattern. A recipient can be outside an allowed set. A field can require explicit repeat verification even when recognition confidence is high.

Certain makes that boundary explicit.

## Capabilities on the demo page

The live demo presents two peer capability workspaces. They are parallel tools with separate inputs, separate state, and separate results. `Verify a consequential action` is the core payment-verification product. `Verify against a preaccepted specification` is the specification-bound comparison product. Each has its own dashboard sidebar and voice control. The Dictation adapter, typed mapper, canonicalizer, and receipt formats are shared implementation mechanics, not a shared product workflow. The negative `$50,000` mutation is a separate refusal test below both workspaces.

```text
capability 01: consequential action verification
  -> its own spoken candidate
  -> contract -> required verification -> receipt

capability 02: preaccepted specification verification
  -> its own spoken candidate
  -> typed fields -> canonical hash -> field comparison
  -> MATCH / MISMATCH / INCOMPLETE

shared implementation mechanics, not shared capability state
  -> Dictation adapter -> verbatim text + clean dictation
  -> bounded typed field mapper

separate boundary test
  -> correctly heard $50,000 -> contract BLOCKED + spec MISMATCH
```

Each workspace independently uses the bounded recognition and mapping mechanics:

```text
candidate speech
  -> AssemblyAI Dictation
  -> verbatim transcript + clean dictation
  -> typed field mapping
```

Capability 01 then applies the application contract, fresh challenge, repeat, confirmation, and receipt. Capability 02 compares its own candidate's typed fields against the preaccepted specification and hash. Neither capability authorizes payment execution.

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

AssemblyAI can transcribe `$50,000` perfectly. Capability 01 must still reject the candidate because its application contract caps the amount at `$25,000`. Capability 02 independently compares that candidate against the preaccepted `$15,000 USD` amount and returns `MISMATCH`. A matched fresh challenge or supplementary speaker-similarity result cannot override either failure.

```text
TRANSCRIPTION: CORRECT
APPLICATION CONTRACT: VIOLATED
STATUS: BLOCKED
```

That mutation is the core falsification test for the project. If Certain cannot distinguish recognition correctness from application validity, it has no reason to exist.

## Architecture

The two capabilities are parallel browser workspaces. They share adapters and typed primitives, but each starts from its own candidate input and maintains its own result state.

```text
Capability 01: Verify a consequential action
  microphone -> WAV -> /api/transcribe -> AssemblyAI Dictation
  -> verbatim text + clean dictation + word confidence
  -> Field Mapper -> payment_instruction/v1 fields
  -> Contract Engine
       |-- deterministic type checks
       |-- allowed sets, regex, bounds, temporal constraints
       `-- verification policy
  -> Fresh Challenge -> repeat / confirm -> Verification Receipt

Capability 02: Verify against a preaccepted specification
  microphone -> WAV -> /api/transcribe -> AssemblyAI Dictation
  -> verbatim text + clean dictation + word confidence
  -> Field Mapper -> payment_instruction/v1 fields
  -> Preaccepted Specification
       |-- canonical typed field comparison
       `-- SHA-256 specification hash
  -> Comparison Result: MATCH / MISMATCH / INCOMPLETE

Shared implementation mechanics do not share capability state.
```

## State models

Capability 01, consequential-action verification:

```text
CAPTURED -> TRANSCRIBED -> VALIDATED
  | contract violation -> BLOCKED
  | valid candidate -> FRESH_CHALLENGE
  | challenge mismatch / expired / replay -> unresolved
  | matched challenge -> REQUIRES_VERIFICATION
  | amount repeat + invoice confirmation -> VERIFIED
```

Capability 02, preaccepted-specification verification:

```text
CANDIDATE_INPUT -> TYPED_FIELDS ->
  MATCH / MISMATCH / INCOMPLETE
```

The two state machines accept separate candidate inputs and do not transition into each other. `VERIFIED` does not mean "true" and does not mean "authorized". It means the declared Certain contract and its required verification steps were satisfied.

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
research/
  certain/
    README.md
    IMPLEMENTATION_NOTES.md
  assemblyai/
    README.md
    FINAL_FOUNDRY_REPORT.md
    FEEDBACK_LEDGER.md
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
