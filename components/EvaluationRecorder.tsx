"use client";

import { useMemo, useRef, useState } from "react";
import { useRecorder } from "@/hooks/useRecorder";
import { humanEvaluationFixtures } from "@/lib/eval/fixtures";

type Recording = {
  blob: Blob;
  url: string;
  durationMs: number;
  capturedAt: string;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function EvaluationRecorder() {
  const recorder = useRecorder();
  const [index, setIndex] = useState(0);
  const [recordings, setRecordings] = useState<Record<string, Recording>>({});
  const [error, setError] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const fixture = humanEvaluationFixtures[index];
  const current = recordings[fixture.id];
  const recordedCount = Object.keys(recordings).length;
  const progress = useMemo(() => Math.round((recordedCount / humanEvaluationFixtures.length) * 100), [recordedCount]);

  async function start() {
    setError(null);
    try {
      startedAtRef.current = performance.now();
      await recorder.start();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not access the microphone.");
    }
  }

  async function stop() {
    if (!recorder.recording) return;
    setError(null);
    try {
      const blob = await recorder.stop();
      const durationMs = startedAtRef.current ? performance.now() - startedAtRef.current : 0;
      startedAtRef.current = null;
      setRecordings((existing) => {
        const previous = existing[fixture.id];
        if (previous) URL.revokeObjectURL(previous.url);
        return {
          ...existing,
          [fixture.id]: {
            blob,
            url: URL.createObjectURL(blob),
            durationMs,
            capturedAt: new Date().toISOString(),
          },
        };
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not finish the recording.");
    }
  }

  function downloadCurrent() {
    if (!current) return;
    downloadBlob(current.blob, `${fixture.id}.wav`);
  }

  async function exportManifest() {
    const entries = await Promise.all(
      humanEvaluationFixtures.map(async (item) => {
        const recording = recordings[item.id];
        return {
          id: item.id,
          file: recording ? `${item.id}.wav` : null,
          ground_truth: item.groundTruth,
          target_tokens: item.targetTokens,
          target_class: item.targetClass,
          languages: item.languages,
          support_status: item.supportStatus,
          recorded: Boolean(recording),
          audio_sha256: recording ? await sha256(recording.blob) : null,
          audio_bytes: recording?.blob.size ?? null,
          duration_ms: recording ? Math.round(recording.durationMs) : null,
          captured_at: recording?.capturedAt ?? null,
        };
      }),
    );

    const manifest = {
      corpus_id: "certain-aai-human-phase1-v1",
      generated_at: new Date().toISOString(),
      truth_freeze: "2026-09-12",
      recorded_count: recordedCount,
      fixture_count: humanEvaluationFixtures.length,
      privacy: "Raw WAV files remain local unless the user deliberately uploads them.",
      fixtures: entries,
    };

    downloadBlob(new Blob([`${JSON.stringify(manifest, null, 2)}\n`], { type: "application/json" }), "certain-aai-human-phase1-manifest.json");
  }

  return (
    <main className="shell eval-shell">
      <header className="hero eval-hero">
        <div className="eyebrow">CERTAIN / ASSEMBLYAI EVALUATION FOUNDRY</div>
        <h1>Human fixture recorder.</h1>
        <p>Record a controlled corpus in your natural voice. WAV files stay in this browser session until you explicitly download them.</p>
        <a className="text-link" href="/">← Back to Certain</a>
      </header>

      <section className="card eval-progress-card">
        <div>
          <span className="eval-kicker">Corpus progress</span>
          <strong>{recordedCount} / {humanEvaluationFixtures.length} recorded</strong>
        </div>
        <div className="progress-track" aria-label={`${progress}% complete`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <button className="secondary" onClick={exportManifest}>Export manifest</button>
      </section>

      <section className="eval-layout">
        <aside className="card fixture-list" aria-label="Evaluation fixtures">
          {humanEvaluationFixtures.map((item, itemIndex) => (
            <button
              key={item.id}
              className={`fixture-tab ${itemIndex === index ? "active" : ""}`}
              onClick={() => setIndex(itemIndex)}
            >
              <span>{item.id}</span>
              <small>{recordings[item.id] ? "Recorded" : item.targetClass.replaceAll("_", " ")}</small>
            </button>
          ))}
        </aside>

        <section className="card fixture-stage">
          <div className="fixture-head">
            <div>
              <div className="eyebrow">{fixture.id} / {fixture.targetClass.replaceAll("_", " ")}</div>
              <span className={`support-pill ${fixture.supportStatus}`}>{fixture.supportStatus.replace("_", " ")}</span>
            </div>
            <strong>{index + 1} / {humanEvaluationFixtures.length}</strong>
          </div>

          <blockquote className="fixture-script">“{fixture.groundTruth}”</blockquote>

          <div className="target-panel">
            <span>Target tokens</span>
            <div>{fixture.targetTokens.map((token) => <code key={token}>{token}</code>)}</div>
          </div>

          {fixture.deliveryHint && <p className="delivery-hint"><strong>Delivery:</strong> {fixture.deliveryHint}</p>}

          <div className="recording-controls">
            <button
              className={recorder.recording ? "mic recording" : "mic"}
              onPointerDown={start}
              onPointerUp={stop}
              onPointerCancel={stop}
              onPointerLeave={() => recorder.recording && stop()}
            >
              {recorder.recording ? "Release to save" : current ? "Hold to re-record" : "Hold to record"}
            </button>
            {current && (
              <>
                <audio controls src={current.url} />
                <button className="secondary" onClick={downloadCurrent}>Download {fixture.id}.wav</button>
              </>
            )}
          </div>

          {current && (
            <div className="record-meta">
              <span>{(current.blob.size / 1024).toFixed(1)} KB</span>
              <span>{(current.durationMs / 1000).toFixed(1)} s</span>
              <span>16-bit mono WAV</span>
            </div>
          )}

          {error && <p className="error">{error}</p>}

          <div className="fixture-nav">
            <button className="secondary" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>Previous</button>
            <button className="secondary" disabled={index === humanEvaluationFixtures.length - 1} onClick={() => setIndex((value) => Math.min(humanEvaluationFixtures.length - 1, value + 1))}>Next</button>
          </div>
        </section>
      </section>

      <section className="card privacy-card">
        <div className="eyebrow">EVIDENCE BOUNDARY</div>
        <p><strong>Raw voice is local-first.</strong> GitHub stores the fixture definitions and experiment code, not your recording, unless you deliberately add a WAV later. Exported manifests include SHA-256 hashes so a future result can be tied to the exact recording without publishing the audio itself.</p>
      </section>
    </main>
  );
}
