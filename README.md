# Certain

**Verified voice input for consequential actions.**

Certain is a thin application-contract layer for voice input. AssemblyAI answers **what was heard**. Certain answers a different question: **does the resulting input satisfy the application's contract, and has every field that requires verification actually been verified?**

The project is intentionally small. It is not another transcription app, not a voice agent, and not an authorization system.

## Thesis

Voice systems often collapse four different states into one:

```text
TRANSCRIBED != VALID != VERIFIED != AUTHORIZED
```

A transcript can be perfectly recognized and still be invalid for an application. An amount can exceed a limit. An invoice ID can violate a required pattern. A recipient can be outside an allowed set. A field can require explicit repeat verification even when recognition confidence is high.

Certain makes that boundary explicit.

```text
speech
  -> AssemblyAI Sync
  -> typed field mapping
  -> application contract
  -> verification requirements
  -> verification receipt
  -> trusted typed input
```

## What the substrate already does

Certain deliberately does **not** reimplement AssemblyAI capabilities.

AssemblyAI provides the recognition substrate:

- Sync Speech-to-Text for short push-to-talk clips;
- Universal-3.5 Pro;
- transcript and per-word confidence;
- contextual `prompt`;
- `keyterms_prompt` for domain vocabulary;
- language support and formatting.

Certain begins **after recognition**. Its responsibility is application-specific validity and verification policy.

AssemblyAI Sync docs and current dictation guide:

- https://www.assemblyai.com/blog/build-push-to-talk-dictation-sync-api
- https://www.assemblyai.com/blog/sync-speech-to-text-api-technical-walkthrough
- https://www.assemblyai.com/docs/faq/how-can-i-make-certain-words-more-likely-to-be-transcribed

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

## Negative mutation

The key demo is not the happy path.

Say instead:

> Pay Acme Labs fifty thousand dollars against invoice INV-14892 from Growth next Friday.

AssemblyAI can transcribe `$50,000` perfectly. Certain must still reject the payload because the application contract caps the amount at `$25,000`.

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
AssemblyAI Sync / Universal-3.5 Pro
  |
  | transcript + word confidence
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
   | \ contract violation
   |  -> BLOCKED
   |
   | verification required
   v
REQUIRES_VERIFICATION
   |
   | matching evidence
   v
VERIFIED
```

`VERIFIED` does not mean "true" and does not mean "authorized". It means the declared Certain contract and its required verification steps were satisfied.

## Repository layout

```text
app/
  api/transcribe/route.ts   # server-side AssemblyAI integration
  globals.css
  layout.tsx
  page.tsx                  # one-page demo
components/
  CertainDemo.tsx
hooks/
  useRecorder.ts            # microphone capture + WAV conversion
lib/
  assemblyai.ts
  certain/
    contract.ts             # payment_instruction/v1
    extract.ts              # bounded transcript -> typed fields
    normalize.ts            # repeat-comparison normalization
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
- AssemblyAI Sync transcription;
- one declarative application contract;
- bounded field mapping;
- deterministic contract evaluation;
- one repeat-match verification mechanism;
- `REQUIRES_VERIFICATION`, `VERIFIED`, and `BLOCKED` states;
- a machine-readable verification receipt.

### Necessary for the hackathon demo

- one polished payment-instruction flow;
- visible raw transcript vs Certain evaluation;
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
- generalized named-entity recognition.

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
8. verified receipt preserves contract version and field evidence.

## Security boundary

The AssemblyAI API key is server-only. Browser code sends audio to `/api/transcribe`; the server route calls AssemblyAI. Certain does not expose the API credential to the client.

This prototype also deliberately stops before downstream execution. A `VERIFIED` receipt is input evidence, **not authorization**. Any system that moves money, changes state, or calls a privileged tool must perform its own authority checks after Certain.

## Design invariant

> AssemblyAI hears the user. Certain determines when an application may trust the resulting input.

## Status

Early implementation for AssemblyAI Voice Hackathon Week, September 2026.
