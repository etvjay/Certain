"use client";

import { useMemo, useRef, useState } from "react";
import { useRecorder } from "@/hooks/useRecorder";
import { evaluatePaymentInstruction } from "@/lib/certain/validate";
import { applyChallengeEvidence, appendVerificationEvidence, applyVerification, repeatMatches } from "@/lib/certain/verify";
import { consumeVoiceChallenge, generateVoiceChallenge } from "@/lib/certain/challenge";
import { createVerificationReceipt } from "@/lib/certain/receipt";
import { parseTranscriptionResponse } from "@/lib/certain/transcribeResponse";
import type { ChallengeEvidence, VoiceChallenge } from "@/lib/certain/challenge";
import type { ContractEvaluation, PaymentInstruction, TranscriptEvidence, VerificationEvidence } from "@/lib/certain/types";

async function transcribe(audio: Blob, purpose: "payment" | "challenge" = "payment"): Promise<TranscriptEvidence> {
  const form = new FormData();
  form.append("audio", audio, "certain.wav");
  if (purpose === "challenge") form.append("purpose", "challenge");
  const response = await fetch("/api/transcribe", { method: "POST", body: form });
  return parseTranscriptionResponse(response);
}

const NEGATIVE_TEXT = "Pay Acme Labs $50,000 against invoice INV-14892 from Growth next Friday.";

const statusLabel: Record<string, string> = {
  accepted: "Accepted",
  requires_verification: "Needs verification",
  verified: "Verified",
  blocked: "Blocked",
};

type CaptureMode = "capture" | "challenge" | "repeat";
type RetryableCapture = {
  audio: Blob;
  mode: CaptureMode;
  repeatField: "amount" | null;
};

function canonicalValue(field: keyof PaymentInstruction, value: unknown): string {
  if (value === undefined || value === null) return "missing";
  if (field === "amount" && typeof value === "object" && value !== null && "amount" in value) {
    const money = value as { amount: number; currency: string };
    return `$${money.amount.toLocaleString("en-US")} ${money.currency}`;
  }
  if (field === "dueDate" && typeof value === "object" && value !== null && "iso" in value) {
    const date = value as { raw: string; iso: string };
    return `${date.iso} (heard as \u201c${date.raw}\u201d)`;
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function specificationValue(value: unknown): string {
  if (value === undefined || value === null) return "missing";
  if (typeof value === "object" && "amount" in value && "currency" in value) {
    const money = value as { amount: number; currency: string };
    return `$${money.amount.toLocaleString("en-US")} ${money.currency}`;
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function CertainDemo() {
  const recorder = useRecorder();
  const [evaluation, setEvaluation] = useState<ContractEvaluation | null>(null);
  const [verifications, setVerifications] = useState<VerificationEvidence[]>([]);
  const [mode, setMode] = useState<CaptureMode>("capture");
  const [repeatField, setRepeatField] = useState<"amount" | null>(null);
  const [challenge, setChallenge] = useState<VoiceChallenge | null>(null);
  const [challengeEvidence, setChallengeEvidence] = useState<ChallengeEvidence | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryableCapture, setRetryableCapture] = useState<RetryableCapture | null>(null);
  const captureInFlightRef = useRef(false);

  const receipt = useMemo(() => evaluation ? createVerificationReceipt(evaluation, verifications, { challenge: challengeEvidence ?? undefined }) : null, [evaluation, verifications, challengeEvidence]);
  const pending = useMemo(() => evaluation?.fields.filter((field) => field.status === "requires_verification") ?? [], [evaluation]);

  function ingest(transcript: TranscriptEvidence, wasSimulated: boolean) {
    setEvaluation(evaluatePaymentInstruction(transcript, { requireChallenge: true }));
    setVerifications([]);
    setChallenge(generateVoiceChallenge());
    setChallengeEvidence(null);
    setMode("capture");
    setRepeatField(null);
    setSimulated(wasSimulated);
  }

  async function beginCapture() {
    setError(null);
    setRetryableCapture(null);
    await recorder.start();
  }

  function applyAmountRepeat(transcript: TranscriptEvidence, currentEvaluation: ContractEvaluation, currentRepeatField: "amount" | null) {
    if (currentRepeatField !== "amount") return;
    const amountField = currentEvaluation.fields.find((field) => field.field === "amount");
    const matched = repeatMatches("amount", amountField?.value, transcript.text);
    const evidence: VerificationEvidence = {
      field: "amount",
      method: "repeat_match",
      original: amountField?.value,
      repeated: transcript.text,
      matched,
      transcript,
    };
    setVerifications((items) => appendVerificationEvidence(items, evidence));
    setEvaluation(applyVerification(currentEvaluation, evidence));
    if (matched) {
      setMode("capture");
      setRepeatField(null);
    }
  }

  function applyChallenge(transcript: TranscriptEvidence, currentChallenge: VoiceChallenge | null) {
    if (!currentChallenge) return;
    const consumed = consumeVoiceChallenge(currentChallenge, transcript);
    setChallenge(consumed.challenge);
    setChallengeEvidence(consumed.evidence);
    setEvaluation((current) => current ? applyChallengeEvidence(current, consumed.evidence) : current);
    if (consumed.evidence.result === "CHALLENGE_MATCH") {
      setMode("capture");
    }
  }

  async function submitAudio(audio: Blob, captureMode: CaptureMode, captureRepeatField: "amount" | null) {
    const transcript = await transcribe(audio, captureMode === "challenge" ? "challenge" : "payment");
    if (captureMode === "capture") {
      ingest(transcript, false);
      return;
    }
    if (captureMode === "challenge") {
      applyChallenge(transcript, challenge);
      return;
    }
    if (evaluation) applyAmountRepeat(transcript, evaluation, captureRepeatField);
  }

  async function finishCapture() {
    if (captureInFlightRef.current) return;
    captureInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const audio = await recorder.stop();
      const capture = { audio, mode, repeatField } satisfies RetryableCapture;
      setRetryableCapture(capture);
      await submitAudio(audio, mode, repeatField);
      setRetryableCapture(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Capture failed");
    } finally {
      captureInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function retryLastCapture() {
    if (!retryableCapture || captureInFlightRef.current) return;
    captureInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await submitAudio(retryableCapture.audio, retryableCapture.mode, retryableCapture.repeatField);
      setRetryableCapture(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Transcription retry failed");
    } finally {
      captureInFlightRef.current = false;
      setBusy(false);
    }
  }

  function armAmountRepeat() {
    setMode("repeat");
    setRepeatField("amount");
    setError(null);
  }

  function armChallenge() {
    setMode("challenge");
    setRepeatField(null);
    setError(null);
  }

  function renewChallenge() {
    setChallenge(generateVoiceChallenge());
    setChallengeEvidence(null);
    setMode("capture");
    setError(null);
  }

  function confirmField(fieldName: "invoiceId" | "vendor") {
    if (!evaluation) return;
    const field = evaluation.fields.find((item) => item.field === fieldName);
    if (!field || field.status !== "requires_verification") return;
    const evidence: VerificationEvidence = { field: fieldName, method: "confirm", original: field.value, matched: true };
    setVerifications((items) => appendVerificationEvidence(items, evidence));
    setEvaluation(applyVerification(evaluation, evidence));
  }

  function simulateNegative() {
    setError(null);
    setMode("capture");
    setRepeatField(null);
    ingest({ text: NEGATIVE_TEXT }, true);
  }

  return (
    <main className="shell">
      <header className="hero">
        <div className="eyebrow">CERTAIN / payment_instruction:v1</div>
        <h1>Verified voice input for consequential actions.</h1>
        <p>AssemblyAI tells us what was heard. Certain decides whether the resulting input satisfies this application&rsquo;s contract.</p>
        <p className="thesis">SPEECH &ne; VERBATIM TRANSCRIPT &ne; CLEAN DICTATION &ne; APPLICATION-VALID INPUT &ne; SPECIFICATION MATCH &ne; SPEAKER SIMILARITY &ne; VERIFIED INPUT &ne; AUTHORIZED ACTION</p>
      </header>

      <section className="card">
        <div className="eyebrow">1 / APPLICATION CONTRACT</div>
        <div className="contract contract-flat">
          <div><span>Allowed vendors</span><strong>Acme Labs · Northstar · AssemblyAI</strong></div>
          <div><span>Amount ceiling</span><strong>$25,000 USD · repeat required</strong></div>
          <div><span>Invoice</span><strong>INV-##### · explicit confirmation</strong></div>
          <div><span>Cost center</span><strong>Engineering · Growth · Operations</strong></div>
        </div>
      </section>

      <section className="capture card">
        <div className="capture-copy">
          <div className="eyebrow">2 / SPEAK</div>
          <span>{mode === "challenge" ? "Answer the fresh challenge" : mode === "repeat" ? "Repeat the amount only" : "Dictate a payment instruction"}</span>
          <p>{mode === "challenge" ? "Hold the button and read the fresh phrase below. This is freshness evidence only, not proof of liveness or identity." : mode === "repeat" ? "Hold the button and say only the amount, for example: fifteen thousand dollars." : "Example: Pay Acme Labs fifteen thousand dollars against invoice INV-14892 from Growth next Friday."}</p>
        </div>
        <button
          className={recorder.recording ? "mic recording" : "mic"}
          disabled={busy}
          onPointerDown={beginCapture}
          onPointerUp={finishCapture}
          onPointerLeave={() => recorder.recording && finishCapture()}
        >
          {busy ? "Working…" : recorder.recording ? "Release" : mode === "challenge" ? "Hold to answer" : mode === "repeat" ? "Hold to verify" : "Hold to speak"}
        </button>
        {error && <p className="error">{error}</p>}
        {error && retryableCapture && (
          <button className="secondary" disabled={busy} onClick={retryLastCapture}>
            Retry last recording
          </button>
        )}
      </section>

      {evaluation && (
        <section className="result-grid">
          <article className="card transcript">
            <div className="eyebrow">3 / ASSEMBLYAI DICTATION — WHAT WAS HEARD</div>
            <p className="quote">&ldquo;{evaluation.transcript.text}&rdquo;</p>
            <div className="meta">
              Confidence {evaluation.transcript.confidence?.toFixed(3) ?? "—"}
              {" · "}{evaluation.transcript.requestTimeMs ? `${Math.round(evaluation.transcript.requestTimeMs)}ms request` : "latency unavailable"}
              {evaluation.transcript.sessionId ? ` · session ${evaluation.transcript.sessionId.slice(0, 8)}…` : ""}
              {evaluation.transcript.audioDurationMs ? ` · ${evaluation.transcript.audioDurationMs}ms audio` : ""}
              {simulated ? " · typed simulation, not a live transcription" : ""}
            </div>
            <p className="heard-note">Raw transcript, preserved verbatim. Certain never rewrites what AssemblyAI heard.</p>
            {evaluation.transcript.cleanedText !== undefined && (
              <p className="heard-note"><strong>Clean dictation (non-authoritative):</strong> &ldquo;{evaluation.transcript.cleanedText ?? "unavailable"}&rdquo;</p>
            )}
            {evaluation.transcript.llmError && (
              <p className="heard-note">Dictation cleanup reported <strong>{evaluation.transcript.llmError}</strong>; Certain continues from the verbatim transcript.</p>
            )}
          </article>

          <article className="card evaluation">
            <div className="section-head">
              <div>
                <div className="eyebrow">4–5 / CERTAIN — TYPED FIELDS + CONTRACT DECISIONS</div>
                <h2>{statusLabel[evaluation.status]}</h2>
              </div>
              <span className={`status ${evaluation.status}`}>{evaluation.status.toUpperCase()}</span>
            </div>

            <div className="fields">
              {evaluation.fields.map((field) => (
                <div className="field" key={field.field}>
                  <div><span>{field.field}</span><strong>{canonicalValue(field.field, field.value)}</strong></div>
                  <span className={`field-status ${field.status}`}>{statusLabel[field.status]}</span>
                  {field.evidence.length > 0 && <p className="evidence-line">{field.evidence.join(" · ")}</p>}
                  {field.violations.map((violation) => <p className="violation" key={violation}>{violation}</p>)}
                  {field.field === "amount" && field.status === "requires_verification" && (
                    <button className="secondary" onClick={armAmountRepeat}>Verify by repeating amount</button>
                  )}
                  {field.field === "invoiceId" && field.status === "requires_verification" && (
                    <button className="secondary" onClick={() => confirmField("invoiceId")}>Confirm invoice</button>
                  )}
                  {field.field === "vendor" && field.status === "requires_verification" && (
                    <button className="secondary" onClick={() => confirmField("vendor")}>Confirm vendor</button>
                  )}
                </div>
              ))}
            </div>
            <div className="specification">
              <div className="section-head">
                <div>
                  <div className="eyebrow">6 / PREACCEPTED SPECIFICATION</div>
                  <strong>{evaluation.specification.specificationId} v{evaluation.specification.specificationVersion}</strong>
                </div>
                <span className={`status ${evaluation.specification.status === "MATCH" ? "verified" : evaluation.specification.status === "MISMATCH" ? "blocked" : "requires_verification"}`}>{evaluation.specification.status}</span>
              </div>
              <p className="evidence-line">spec hash: {evaluation.specification.specHash ?? "unavailable"}</p>
              <div className="spec-fields">
                {evaluation.specification.fields.map((field) => (
                  <div className="spec-field" key={field.field}>
                    <div><span>{field.field}</span><strong>expected {specificationValue(field.expected)} · observed {specificationValue(field.observed)}</strong></div>
                    <span className={`field-status ${field.matched ? "verified" : field.observed === undefined ? "requires_verification" : "blocked"}`}>{field.matched ? "MATCHED" : field.observed === undefined ? "INCOMPLETE" : "MISMATCH"}</span>
                  </div>
                ))}
              </div>
              <p className="heard-note">Certain compares canonical typed values. A specification match does not satisfy amount repeat or invoice confirmation.</p>
            </div>
          </article>
        </section>
      )}

      {evaluation && challenge && evaluation.status !== "blocked" && (
        <section className="card challenge-card">
          <div className="section-head">
            <div>
              <div className="eyebrow">7 / FRESH CHALLENGE</div>
              <h2>Read this phrase aloud</h2>
            </div>
            <span className={`field-status ${challengeEvidence?.result === "CHALLENGE_MATCH" ? "verified" : challengeEvidence ? "blocked" : "requires_verification"}`}>{challengeEvidence?.result ?? "NOT ANSWERED"}</span>
          </div>
          <blockquote className="challenge-prompt">{challenge.prompt}</blockquote>
          <p className="evidence-line">expires: {challenge.expiresAt}</p>
          {challengeEvidence?.result === "CHALLENGE_EXPIRED" ? (
            <button className="secondary" onClick={renewChallenge}>Generate new challenge</button>
          ) : challengeEvidence?.result !== "CHALLENGE_MATCH" ? (
            <button className="secondary" onClick={armChallenge}>{challengeEvidence ? "Try challenge again" : "Answer with voice"}</button>
          ) : null}
          <p className="heard-note">Freshness evidence only. This is not proof of liveness, identity, or authorization.</p>
        </section>
      )}

      {evaluation && pending.length > 0 && (
        <section className="card verify-card">
          <div className="eyebrow">8 / VERIFICATION REQUIRED</div>
          <p>Every field below must be resolved before this payload can become VERIFIED. Blocked fields cannot be resolved by confirmation.</p>
          <ul>
            {pending.map((field) => (
              <li key={field.field}><strong>{field.field}</strong> — {field.rule === "repeat_match" ? "repeat the value" : field.rule === "required" ? "explicit confirmation" : "explicit confirmation (low recognition confidence)"}</li>
            ))}
          </ul>
        </section>
      )}

      {receipt && evaluation?.status === "verified" && (
        <section className="card receipt">
          <div className="eyebrow">9 / VERIFICATION RECEIPT</div>
          <dl className="receipt-grid">
            <div><dt>Contract</dt><dd>{receipt.contractId} v{receipt.contractVersion}</dd></div>
            <div><dt>Status</dt><dd>VERIFIED</dd></div>
            <div><dt>Specification</dt><dd>{receipt.specification.status} · {receipt.specification.specHash ?? "hash unavailable"}</dd></div>
            <div><dt>Challenge</dt><dd>{receipt.challenge?.result ?? "not required"}</dd></div>
            <div><dt>Heard</dt><dd>&ldquo;{receipt.provenance.transcript}&rdquo;</dd></div>
            <div><dt>Session</dt><dd>{receipt.provenance.sessionId ?? "unavailable"}</dd></div>
            <div><dt>Verified fields</dt><dd>{receipt.verification.map((item) => `${item.field} (${item.method})`).join(" · ")}</dd></div>
          </dl>
          <details>
            <summary>Full receipt JSON</summary>
            <pre>{JSON.stringify(receipt, null, 2)}</pre>
          </details>
          <p className="boundary">VERIFIED means the declared input contract was satisfied. It does not mean the downstream action is authorized.</p>
        </section>
      )}

      <section className="card negative-card">
        <div className="eyebrow">NEGATIVE MUTATION — CORRECT HEARING, INVALID INPUT</div>
        <p>Say, or simulate: &ldquo;{NEGATIVE_TEXT}&rdquo; AssemblyAI may transcribe $50,000 perfectly. Certain must still answer BLOCKED, because the contract caps amounts at $25,000. No confirmation can promote a blocked payload to VERIFIED.</p>
        <button className="secondary" onClick={simulateNegative}>Simulate the $50k instruction</button>
      </section>
    </main>
  );
}
