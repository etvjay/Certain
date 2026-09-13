"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRecorder } from "@/hooks/useRecorder";
import { HUMAN_CORPUS_ID, HUMAN_CORPUS_TRUTH_FREEZE, humanEvaluationFixtures } from "@/lib/eval/fixtures";
import { clearCorpusRecordings, groundTruthHash, loadCorpusRecordings, saveRecording } from "@/lib/eval/corpusStore";
import { createZip } from "@/lib/eval/zip";

type Recording = {
  blob: Blob;
  url: string;
  durationMs: number;
  capturedAt: string;
  staleFixture: boolean;
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

async function sha256Hex(data: Blob | ArrayBuffer | string): Promise<string> {
  const buffer =
    typeof data === "string" ? new TextEncoder().encode(data) : data instanceof Blob ? await data.arrayBuffer() : data;
  const digest = await crypto.subtle.digest("SHA-256", buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function EvaluationRecorder() {
  const recorder = useRecorder();
  const [index, setIndex] = useState(0);
  const [recordings, setRecordings] = useState<Record<string, Recording>>({});
  const [restoredCount, setRestoredCount] = useState<number | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const startedAtRef = useRef<number | null>(null);

  const fixture = humanEvaluationFixtures[index];
  const current = recordings[fixture.id];
  const recordedCount = Object.keys(recordings).length;
  const progress = useMemo(() => Math.round((recordedCount / humanEvaluationFixtures.length) * 100), [recordedCount]);

  // Restore locally persisted recordings so a refresh cannot wipe a session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await loadCorpusRecordings(HUMAN_CORPUS_ID);
        if (cancelled) return;
        const next: Record<string, Recording> = {};
        for (const item of stored) {
          const definition = humanEvaluationFixtures.find((entry) => entry.id === item.fixtureId);
          if (!definition) continue;
          next[item.fixtureId] = {
            blob: item.blob,
            url: URL.createObjectURL(item.blob),
            durationMs: item.durationMs,
            capturedAt: item.capturedAt,
            staleFixture: item.groundTruthHash !== (await groundTruthHash(definition.groundTruth)),
          };
        }
        if (!cancelled) {
          setRecordings(next);
          setRestoredCount(Object.keys(next).length);
        }
      } catch (cause) {
        if (!cancelled) setStoreError(cause instanceof Error ? cause.message : "Local corpus storage is unavailable.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (current && !window.confirm(`Replace the existing take for ${fixture.id}? The previous recording will be discarded.`)) {
      try {
        await recorder.stop();
      } catch {
        // Recorder was already released by the gesture; nothing to keep.
      }
      return;
    }
    setError(null);
    try {
      const blob = await recorder.stop();
      const durationMs = startedAtRef.current ? performance.now() - startedAtRef.current : 0;
      startedAtRef.current = null;
      const capturedAt = new Date().toISOString();
      const hash = await groundTruthHash(fixture.groundTruth);
      try {
        await saveRecording({ corpusId: HUMAN_CORPUS_ID, fixtureId: fixture.id, blob, capturedAt, durationMs, groundTruthHash: hash });
      } catch (cause) {
        setStoreError(cause instanceof Error ? cause.message : "Could not persist the recording locally.");
      }
      setRecordings((existing) => {
        const previous = existing[fixture.id];
        if (previous) URL.revokeObjectURL(previous.url);
        return {
          ...existing,
          [fixture.id]: { blob, url: URL.createObjectURL(blob), durationMs, capturedAt, staleFixture: false },
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

  async function buildManifest() {
    return {
      corpus_id: HUMAN_CORPUS_ID,
      generated_at: new Date().toISOString(),
      truth_freeze: HUMAN_CORPUS_TRUTH_FREEZE,
      recorded_count: recordedCount,
      fixture_count: humanEvaluationFixtures.length,
      privacy: "Raw WAV files remain local unless the user deliberately moves the exported bundle.",
      fixtures: await Promise.all(
        humanEvaluationFixtures.map(async (item) => {
          const recording = recordings[item.id];
          return {
            id: item.id,
            file: recording ? `audio/${item.id}.wav` : null,
            ground_truth: item.groundTruth,
            target_tokens: item.targetTokens,
            target_class: item.targetClass,
            languages: item.languages,
            support_status: item.supportStatus,
            recorded: Boolean(recording),
            audio_sha256: recording ? await sha256Hex(recording.blob) : null,
            audio_bytes: recording?.blob.size ?? null,
            duration_ms: recording ? Math.round(recording.durationMs) : null,
            captured_at: recording?.capturedAt ?? null,
          };
        }),
      ),
    };
  }

  async function exportManifest() {
    downloadBlob(new Blob([`${JSON.stringify(await buildManifest(), null, 2)}\n`], { type: "application/json" }), "certain-aai-human-phase1-manifest.json");
  }

  async function exportCorpus() {
    if (recordedCount === 0) {
      setError("Record at least one fixture before exporting the corpus.");
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const manifest = await buildManifest();
      const entries: Array<{ name: string; data: Uint8Array }> = [];
      for (const item of humanEvaluationFixtures) {
        const recording = recordings[item.id];
        if (!recording) continue;
        const bytes = new Uint8Array(await recording.blob.arrayBuffer());
        const hash = await sha256Hex(bytes.buffer as ArrayBuffer);
        const manifestEntry = manifest.fixtures.find((entry) => entry.id === item.id);
        if (!manifestEntry || manifestEntry.audio_sha256 !== hash) {
          throw new Error(`SHA-256 mismatch for ${item.id}; export refused. Re-record the fixture and try again.`);
        }
        entries.push({ name: `audio/${item.id}.wav`, data: bytes });
      }
      entries.unshift({ name: "manifest.json", data: new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`) });
      downloadBlob(new Blob([createZip(entries) as unknown as BlobPart], { type: "application/zip" }), "certain-aai-human-phase1-corpus.zip");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export the corpus.");
    } finally {
      setExporting(false);
    }
  }

  async function clearLocal() {
    if (!window.confirm(`Delete all ${recordedCount} locally stored recording(s)? This cannot be undone. Export first if you need them.`)) return;
    try {
      await clearCorpusRecordings(HUMAN_CORPUS_ID);
      setRecordings((existing) => {
        for (const recording of Object.values(existing)) URL.revokeObjectURL(recording.url);
        return {};
      });
      setRestoredCount(0);
    } catch (cause) {
      setStoreError(cause instanceof Error ? cause.message : "Could not clear local recordings.");
    }
  }

  return (
    <main className="shell eval-shell">
      <header className="hero eval-hero">
        <div className="eyebrow">CERTAIN / ASSEMBLYAI EVALUATION FOUNDRY</div>
        <h1>Human fixture recorder.</h1>
        <p>Record a controlled corpus in your natural voice. WAV files stay in this browser (IndexedDB) until you explicitly export them.</p>
        <a className="text-link" href="/">← Back to Certain</a>
      </header>

      <section className="card eval-progress-card">
        <div>
          <span className="eval-kicker">Corpus progress</span>
          <strong>{recordedCount} / {humanEvaluationFixtures.length} recorded</strong>
          {restoredCount !== null && restoredCount > 0 && <small>Restored {restoredCount} local take(s) after load.</small>}
        </div>
        <div className="progress-track" aria-label={`${progress}% complete`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="eval-actions">
          <button className="secondary" onClick={exportManifest}>Export manifest</button>
          <button className="secondary" onClick={exportCorpus} disabled={exporting || recordedCount === 0}>
            {exporting ? "Exporting…" : "Export corpus (.zip)"}
          </button>
          <button className="secondary danger" onClick={clearLocal} disabled={recordedCount === 0}>Clear local corpus</button>
        </div>
      </section>
      {storeError && <p className="error" role="alert">{storeError}</p>}

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

          <blockquote className="fixture-script">&ldquo;{fixture.groundTruth}&rdquo;</blockquote>

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
              <span>saved locally</span>
              {current.staleFixture && <span className="stale">fixture text changed — re-record</span>}
            </div>
          )}
          {current && <p className="replace-note">Re-recording asks first, then replaces this take.</p>}

          {error && <p className="error">{error}</p>}

          <div className="fixture-nav">
            <button className="secondary" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>Previous</button>
            <button className="secondary" disabled={index === humanEvaluationFixtures.length - 1} onClick={() => setIndex((value) => Math.min(humanEvaluationFixtures.length - 1, value + 1))}>Next</button>
          </div>
        </section>
      </section>

      <section className="card privacy-card">
        <div className="eyebrow">EVIDENCE BOUNDARY</div>
        <p><strong>Raw voice is local-first.</strong> GitHub stores the fixture definitions and experiment code, not your recording, unless you deliberately move the exported bundle. The corpus ZIP embeds a manifest whose SHA-256 hashes match the exact exported WAV bytes, so a future result can be tied to the exact recording without publishing the audio itself.</p>
      </section>
    </main>
  );
}
