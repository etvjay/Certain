"use client";

import { useMemo, useState } from "react";
import { useRecorder } from "@/hooks/useRecorder";
import { evaluatePaymentInstruction } from "@/lib/certain/validate";
import { applyVerification, repeatMatches } from "@/lib/certain/verify";
import { createVerificationReceipt } from "@/lib/certain/receipt";
import type { ContractEvaluation, TranscriptEvidence, VerificationEvidence } from "@/lib/certain/types";

async function transcribe(audio: Blob): Promise<TranscriptEvidence> {
  const form = new FormData();
  form.append("audio", audio, "certain.wav");
  const response = await fetch("/api/transcribe", { method: "POST", body: form });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Transcription failed");
  return body;
}

const statusLabel: Record<string, string> = {
  accepted: "Accepted",
  requires_verification: "Needs verification",
  verified: "Verified",
  blocked: "Blocked",
};

export function CertainDemo() {
  const recorder = useRecorder();
  const [evaluation, setEvaluation] = useState<ContractEvaluation | null>(null);
  const [verifications, setVerifications] = useState<VerificationEvidence[]>([]);
  const [mode, setMode] = useState<"capture" | "repeat">("capture");
  const [repeatField, setRepeatField] = useState<"amount" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receipt = useMemo(() => evaluation ? createVerificationReceipt(evaluation, verifications) : null, [evaluation, verifications]);

  async function beginCapture() {
    setError(null);
    await recorder.start();
  }

  async function finishCapture() {
    setBusy(true);
    setError(null);
    try {
      const audio = await recorder.stop();
      const transcript = await transcribe(audio);

      if (mode === "capture") {
        setEvaluation(evaluatePaymentInstruction(transcript));
        setVerifications([]);
        return;
      }

      if (!evaluation || repeatField !== "amount") return;
      const amountField = evaluation.fields.find((field) => field.field === "amount");
      const matched = repeatMatches("amount", amountField?.value, transcript.text);
      const evidence: VerificationEvidence = {
        field: "amount",
        method: "repeat_match",
        original: amountField?.value,
        repeated: transcript.text,
        matched,
        transcript,
      };
      setVerifications((items) => [...items, evidence]);
      setEvaluation(applyVerification(evaluation, evidence));
      if (matched) {
        setMode("capture");
        setRepeatField(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Capture failed");
    } finally {
      setBusy(false);
    }
  }

  function armAmountRepeat() {
    setMode("repeat");
    setRepeatField("amount");
    setError(null);
  }

  function confirmInvoice() {
    if (!evaluation) return;
    const field = evaluation.fields.find((item) => item.field === "invoiceId");
    if (!field) return;
    const evidence: VerificationEvidence = { field: "invoiceId", method: "confirm", original: field.value, matched: true };
    setVerifications((items) => [...items, evidence]);
    setEvaluation(applyVerification(evaluation, evidence));
  }

  return (
    <main className="shell">
      <header className="hero">
        <div className="eyebrow">CERTAIN / payment_instruction:v1</div>
        <h1>Verified voice input for consequential actions.</h1>
        <p>AssemblyAI tells us what was heard. Certain decides whether the resulting input satisfies this application's contract.</p>
      </header>

      <section className="contract card">
        <div><span>Allowed vendors</span><strong>Acme Labs · Northstar · AssemblyAI</strong></div>
        <div><span>Amount ceiling</span><strong>$25,000 USD · repeat required</strong></div>
        <div><span>Invoice</span><strong>INV-##### · explicit confirmation</strong></div>
        <div><span>Cost center</span><strong>Engineering · Growth · Operations</strong></div>
      </section>

      <section className="capture card">
        <div className="capture-copy">
          <span>{mode === "repeat" ? "Repeat the amount only" : "Dictate a payment instruction"}</span>
          <p>{mode === "repeat" ? "Hold the button and say only the amount, for example: fifteen thousand dollars." : "Example: Pay Acme Labs fifteen thousand dollars against invoice INV-14892 from Growth next Friday."}</p>
        </div>
        <button
          className={recorder.recording ? "mic recording" : "mic"}
          disabled={busy}
          onPointerDown={beginCapture}
          onPointerUp={finishCapture}
          onPointerLeave={() => recorder.recording && finishCapture()}
        >
          {busy ? "Working…" : recorder.recording ? "Release" : mode === "repeat" ? "Hold to verify" : "Hold to speak"}
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      {evaluation && (
        <section className="result-grid">
          <article className="card transcript">
            <div className="eyebrow">ASSEMBLYAI / RECOGNITION</div>
            <p className="quote">“{evaluation.transcript.text}”</p>
            <div className="meta">Confidence {evaluation.transcript.confidence?.toFixed(3) ?? "—"} · {evaluation.transcript.requestTimeMs ? `${Math.round(evaluation.transcript.requestTimeMs)}ms` : "latency unavailable"}</div>
          </article>

          <article className="card evaluation">
            <div className="section-head">
              <div>
                <div className="eyebrow">CERTAIN / CONTRACT EVALUATION</div>
                <h2>{statusLabel[evaluation.status]}</h2>
              </div>
              <span className={`status ${evaluation.status}`}>{evaluation.status.toUpperCase()}</span>
            </div>

            <div className="fields">
              {evaluation.fields.map((field) => (
                <div className="field" key={field.field}>
                  <div><span>{field.field}</span><strong>{typeof field.value === "object" ? JSON.stringify(field.value) : String(field.value ?? "missing")}</strong></div>
                  <span className={`field-status ${field.status}`}>{statusLabel[field.status]}</span>
                  {field.violations.map((violation) => <p className="violation" key={violation}>{violation}</p>)}
                  {field.field === "amount" && field.status === "requires_verification" && (
                    <button className="secondary" onClick={armAmountRepeat}>Verify by repeating amount</button>
                  )}
                  {field.field === "invoiceId" && field.status === "requires_verification" && (
                    <button className="secondary" onClick={confirmInvoice}>Confirm invoice</button>
                  )}
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {receipt && evaluation?.status === "verified" && (
        <section className="card receipt">
          <div className="eyebrow">VERIFICATION RECEIPT</div>
          <pre>{JSON.stringify(receipt, null, 2)}</pre>
          <p className="boundary">VERIFIED means the declared input contract was satisfied. It does not mean the downstream action is authorized.</p>
        </section>
      )}
    </main>
  );
}
