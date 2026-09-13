"use client";

import { useMemo, useRef, useState } from "react";
import { useRecorder } from "@/hooks/useRecorder";
import { evaluatePaymentInstruction } from "@/lib/certain/validate";
import { applyChallengeEvidence, appendVerificationEvidence, applyVerification, repeatMatches } from "@/lib/certain/verify";
import { consumeVoiceChallenge, generateVoiceChallenge } from "@/lib/certain/challenge";
import { createVerificationReceipt } from "@/lib/certain/receipt";
import { parseTranscriptionResponse } from "@/lib/certain/transcribeResponse";
import { extractPaymentInstruction } from "@/lib/certain/extract";
import { PREACCEPTED_PAYMENT_SPEC, PREACCEPTED_PAYMENT_SPEC_HASH, comparePaymentSpecification, type SpecificationComparison } from "@/lib/certain/specification";
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

const preacceptedDisplayFields = [
  { field: "vendor", expected: PREACCEPTED_PAYMENT_SPEC.fields.vendor.value },
  { field: "amount", expected: { amount: PREACCEPTED_PAYMENT_SPEC.fields.amount.value, currency: PREACCEPTED_PAYMENT_SPEC.fields.amount.currency } },
  { field: "invoiceId", expected: PREACCEPTED_PAYMENT_SPEC.fields.invoiceId.value },
  { field: "costCenter", expected: PREACCEPTED_PAYMENT_SPEC.fields.costCenter.value },
] as const;

export function CertainDemo() {
  const recorder = useRecorder();
  const specificationRecorder = useRecorder();
  const [evaluation, setEvaluation] = useState<ContractEvaluation | null>(null);
  const [specificationTranscript, setSpecificationTranscript] = useState<TranscriptEvidence | null>(null);
  const [specificationComparison, setSpecificationComparison] = useState<SpecificationComparison | null>(null);
  const [specificationBusy, setSpecificationBusy] = useState(false);
  const [specificationError, setSpecificationError] = useState<string | null>(null);
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
  const specificationCaptureInFlightRef = useRef(false);

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

  function recordSpecificationResult(transcript: TranscriptEvidence) {
    setSpecificationTranscript(transcript);
    setSpecificationComparison(comparePaymentSpecification(
      PREACCEPTED_PAYMENT_SPEC,
      extractPaymentInstruction(transcript.text),
    ));
  }

  async function beginSpecificationCapture() {
    setSpecificationError(null);
    await specificationRecorder.start();
  }

  async function finishSpecificationCapture() {
    if (specificationCaptureInFlightRef.current) return;
    specificationCaptureInFlightRef.current = true;
    setSpecificationBusy(true);
    setSpecificationError(null);
    try {
      const audio = await specificationRecorder.stop();
      recordSpecificationResult(await transcribe(audio));
    } catch (cause) {
      setSpecificationError(cause instanceof Error ? cause.message : "Specification comparison failed");
    } finally {
      specificationCaptureInFlightRef.current = false;
      setSpecificationBusy(false);
    }
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

  const actionStatus = evaluation ? evaluation.status.toUpperCase() : "READY";
  const specificationStatus = specificationComparison?.status ?? "AWAITING INPUT";
  const specificationStatusClass = specificationComparison?.status === "MATCH" ? "verified" : specificationComparison?.status === "MISMATCH" ? "blocked" : "requires_verification";

  return (
    <main className="shell dashboard-shell">
      <header className="dashboard-header" aria-labelledby="hero-title">
        <div className="dashboard-header-row">
          <div className="hero-copy">
            <div className="eyebrow">CERTAIN / CAPABILITY DASHBOARD</div>
            <h1 id="hero-title">Bounded voice decisions for consequential inputs.</h1>
            <p>Choose either peer capability: verify a consequential action, or compare a candidate against a preaccepted specification. AssemblyAI supplies what was heard; each capability makes its own bounded decision.</p>
          </div>
          <div className="dashboard-badge" aria-label="Two independent capability workspaces">
            <span>CAPABILITY DASHBOARD</span>
            <strong>01 + 02</strong>
            <small>separate inputs, separate results</small>
          </div>
        </div>
        <p className="thesis">SPEECH &ne; VERBATIM TRANSCRIPT &ne; CLEAN DICTATION &ne; APPLICATION-VALID INPUT &ne; SPECIFICATION MATCH &ne; SPEAKER SIMILARITY &ne; VERIFIED INPUT &ne; AUTHORIZED ACTION</p>
      </header>

      <div className="capability-stack">
        <section id="action-verification" className="capability-panel" aria-labelledby="action-verification-title">
          <aside className="capability-sidebar">
            <div className="capability-index">01</div>
            <div className="eyebrow">CORE CAPABILITY</div>
            <h2 id="action-verification-title">Verify a consequential action</h2>
            <p>Check whether a spoken payment instruction satisfies the application contract and collects the evidence required to trust the input.</p>
            <div className="sidebar-facts">
              <div><span>Contract</span><strong>payment_instruction:v1</strong></div>
              <div><span>Success state</span><strong>VERIFIED</strong></div>
              <div><span>Failure state</span><strong>BLOCKED</strong></div>
            </div>
            <a className="sidebar-link" href="#speak">Run this capability <span aria-hidden="true">↗</span></a>
          </aside>

          <div className="capability-body">
            <section id="action-contract" className="card dashboard-card" aria-labelledby="action-contract-title">
              <div className="section-head stage-head">
                <div>
                  <div className="eyebrow">APPLICATION CONTRACT</div>
                  <h2 id="action-contract-title">Bounded payment input</h2>
                </div>
                <span className="stage-note">Read before speaking</span>
              </div>
              <div className="contract contract-flat">
                <div><span>Allowed vendors</span><strong>Acme Labs · Northstar · AssemblyAI</strong></div>
                <div><span>Amount ceiling</span><strong>$25,000 USD · repeat required</strong></div>
                <div><span>Invoice</span><strong>INV-##### · explicit confirmation</strong></div>
                <div><span>Cost center</span><strong>Engineering · Growth · Operations</strong></div>
              </div>
            </section>

            <section id="speak" className="capture card dashboard-card" aria-labelledby="speak-title">
              <div className="capture-copy">
                <div className="eyebrow">SPEAK</div>
                <h2 id="speak-title">{mode === "challenge" ? "Answer the fresh challenge" : mode === "repeat" ? "Repeat the amount only" : "Dictate a payment instruction"}</h2>
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
              <>
                <div className="surface-grid">
                  <article id="heard" className="card dashboard-card transcript" aria-labelledby="heard-title">
                    <div className="eyebrow">DICTATION / WHAT WAS HEARD</div>
                    <h2 id="heard-title" className="sr-only">AssemblyAI Dictation, what was heard</h2>
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

                  <article id="fields" className="card dashboard-card evaluation" aria-labelledby="fields-title">
                    <div className="section-head">
                      <div>
                        <div className="eyebrow">TYPED INPUT / CONTRACT DECISION</div>
                        <h2 id="fields-title"><span className="sr-only">Certain typed fields and contract status: </span>{statusLabel[evaluation.status]}</h2>
                      </div>
                      <span className={`status ${evaluation.status}`}>{actionStatus}</span>
                    </div>
                    <div className="fields">
                      {evaluation.fields.map((field) => (
                        <div id={`field-${field.field}`} className="field" key={field.field}>
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
                  </article>
                </div>

                {challenge && evaluation.status !== "blocked" && (
                  <section id="challenge" className="card dashboard-card challenge-card" aria-labelledby="challenge-title">
                    <div className="section-head">
                      <div>
                        <div className="eyebrow">FRESH CHALLENGE / SUPPORTING EVIDENCE</div>
                        <h2 id="challenge-title">Read this phrase aloud</h2>
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

                {pending.length > 0 && (
                  <section id="verification" className="card dashboard-card verify-card" aria-labelledby="verification-title">
                    <div className="eyebrow">REQUIRED VERIFICATION</div>
                    <h2 id="verification-title">Resolve the remaining evidence</h2>
                    <p>Every required item below must be resolved before this payload can become VERIFIED. Blocked fields cannot be resolved by confirmation.</p>
                    <ul>
                      {pending.map((field) => (
                        <li key={field.field}><strong>{field.field}</strong> — {field.rule === "repeat_match" ? "repeat the value" : field.rule === "required" ? "explicit confirmation" : "explicit confirmation (low recognition confidence)"}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {receipt && evaluation.status === "verified" && (
                  <section id="receipt" className="card dashboard-card receipt" aria-labelledby="receipt-title">
                    <div className="eyebrow">VERIFICATION RECEIPT</div>
                    <h2 id="receipt-title" className="sr-only">Verification receipt</h2>
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
              </>
            )}
          </div>
        </section>

        <section id="specification-verification" className="capability-panel" aria-labelledby="specification-verification-title">
          <aside className="capability-sidebar">
            <div className="capability-index">02</div>
            <div className="eyebrow">PARALLEL CAPABILITY</div>
            <h2 id="specification-verification-title">Verify against a preaccepted specification</h2>
            <p>Compare a candidate payment instruction with values accepted in advance. This capability has its own input and result; it does not verify permission to execute.</p>
            <div className="sidebar-facts">
              <div><span>Specification</span><strong>payment-approval-001 v1</strong></div>
              <div><span>Current result</span><strong>{specificationStatus}</strong></div>
              <div><span>Hash</span><code>{PREACCEPTED_PAYMENT_SPEC_HASH.slice(0, 12)}…</code></div>
            </div>
            <a className="sidebar-link" href="#specification-speak">Run this capability <span aria-hidden="true">↗</span></a>
          </aside>

          <div className="capability-body">
            <section id="specification-speak" className="card dashboard-card specification-speak" aria-labelledby="specification-speak-title">
              <div className="section-head">
                <div>
                  <div className="eyebrow">CANDIDATE INPUT</div>
                  <h2 id="specification-speak-title">Compare this instruction independently</h2>
                  <p className="specification-speak-note">Speak a payment instruction for this capability alone. Its Dictation result and specification comparison do not change capability 01.</p>
                </div>
                <button
                  className={specificationRecorder.recording ? "mic recording" : "mic"}
                  disabled={specificationBusy || busy || recorder.recording}
                  onPointerDown={beginSpecificationCapture}
                  onPointerUp={finishSpecificationCapture}
                  onPointerLeave={() => specificationRecorder.recording && finishSpecificationCapture()}
                >
                  {specificationBusy ? "Working…" : specificationRecorder.recording ? "Release" : "Hold to compare"}
                </button>
              </div>
              {specificationError && <p className="error">{specificationError}</p>}
              {specificationTranscript && (
                <div className="specification-transcript">
                  <div className="eyebrow">DICTATION / CANDIDATE HEARD</div>
                  <p className="quote">&ldquo;{specificationTranscript.text}&rdquo;</p>
                  <p className="heard-note">Raw candidate transcript, preserved verbatim. This result belongs only to capability 02.</p>
                  {specificationTranscript.cleanedText !== undefined && (
                    <p className="heard-note"><strong>Clean dictation (non-authoritative):</strong> &ldquo;{specificationTranscript.cleanedText ?? "unavailable"}&rdquo;</p>
                  )}
                </div>
              )}
            </section>

            <section id="specification" className="card dashboard-card specification-card" aria-labelledby="specification-title">
              <div className="section-head">
                <div>
                  <div className="eyebrow">PREACCEPTED SPECIFICATION / REFERENCE</div>
                  <h2 id="specification-title">payment-approval-001 <span>v1</span></h2>
                </div>
                <span className="field-status requires_verification">ACCEPTED VALUES</span>
              </div>
              <p className="evidence-line">spec hash: {PREACCEPTED_PAYMENT_SPEC_HASH}</p>
              <div className="spec-fields">
                {preacceptedDisplayFields.map((field) => (
                  <div className="spec-field" key={field.field}>
                    <div><span>{field.field}</span><strong>expected {specificationValue(field.expected)}</strong></div>
                    <span className="field-status requires_verification">REFERENCE</span>
                  </div>
                ))}
              </div>
              <p className="heard-note">This is the accepted reference. Certain compares canonical typed values, not sentence strings.</p>
            </section>

            <section id="specification-result" className="card dashboard-card specification-result" aria-labelledby="specification-result-title">
              <div className="section-head">
                <div>
                  <div className="eyebrow">COMPARISON RESULT</div>
                  <h2 id="specification-result-title">Candidate versus accepted values</h2>
                </div>
                <span className={`status ${specificationStatusClass}`}>{specificationStatus}</span>
              </div>
              {!specificationComparison ? (
                <p className="empty-state">No candidate has been compared in this workspace yet. Use the candidate input above to produce an independent result.</p>
              ) : (
                <div className="spec-fields">
                  {specificationComparison.fields.map((field) => (
                    <div className="spec-field" key={field.field}>
                      <div><span>{field.field}</span><strong>expected {specificationValue(field.expected)} · observed {specificationValue(field.observed)}</strong></div>
                      <span className={`field-status ${field.matched ? "verified" : field.observed === undefined ? "requires_verification" : "blocked"}`}>{field.matched ? "MATCHED" : field.observed === undefined ? "INCOMPLETE" : "MISMATCH"}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="heard-note">A specification match does not satisfy amount repeat or invoice confirmation, and it does not authorize a downstream action.</p>
              {specificationComparison && (
                <div className={`specification-callout ${specificationStatusClass}`} aria-label="Specification interpretation">
                  <strong>{specificationComparison.status === "MATCH" ? "The candidate typed input matches the accepted specification." : specificationComparison.status === "MISMATCH" ? "The candidate typed input does not match the accepted specification." : "The specification comparison is incomplete."}</strong>
                  <span>Specification comparison is evidence about expected values. It does not authorize a downstream action.</span>
                </div>
              )}
            </section>

          </div>
        </section>
      </div>

      <section id="negative" className="card boundary-panel" aria-labelledby="negative-title">
        <div>
          <div className="eyebrow">BOUNDARY TEST / SEPARATE FROM BOTH CAPABILITIES</div>
          <h2 id="negative-title">Correct hearing, invalid input</h2>
          <p>Say, or simulate: &ldquo;{NEGATIVE_TEXT}&rdquo; AssemblyAI may transcribe $50,000 perfectly. Certain must still answer BLOCKED because the contract caps amounts at $25,000. The specification must also answer MISMATCH. No confirmation can promote a blocked payload to VERIFIED.</p>
        </div>
        <button className="secondary danger" onClick={simulateNegative}>Simulate the $50k instruction</button>
      </section>

      <details id="foundry-feedback" className="card foundry-card">
        <summary>
          <span>
            <span className="eyebrow">FEEDBACK / FOUNDRY EVIDENCE</span>
            <strong>What was tested outside the product flow</strong>
          </span>
          <span className="foundry-status">BOUNDED</span>
        </summary>
        <div className="foundry-content">
          <p>These findings are kept separate from the two capabilities. They describe AssemblyAI substrate behavior and evidence limits, not additional product features.</p>
          <ul>
            <li><strong>Dictation semantics:</strong> request ordering, missing config, unsupported audio, cleanup output, and authentication behavior were exercised with retained response evidence.</li>
            <li><strong>Human corpus:</strong> 23 supported English fixtures were run with fixed audio hashes. Results were 19/50 exact and 27/50 normalized target matches. This is corpus-bounded quality evidence, not a general accuracy claim.</li>
            <li><strong>Context comparison:</strong> matched prompt and keyterm arms reused identical audio and retained separate scorecards. Observed improvements remain bounded quality/DX findings, not confirmed AssemblyAI bugs.</li>
            <li><strong>Limits:</strong> speaker similarity is not shipped, and the newly added challenge plus exact $50k sentence were not captured with a physical microphone in the agent environment.</li>
          </ul>
          <p className="heard-note">Full retained evidence: <code>research/assemblyai/FINAL_FOUNDRY_REPORT.md</code></p>
        </div>
      </details>
    </main>
  );
}
