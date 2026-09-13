#!/usr/bin/env node
/**
 * Human-corpus Foundry runner.
 *
 * Reads a recorder-exported corpus bundle (manifest.json + audio WAVs),
 * verifies every WAV SHA-256 before use, submits supported fixtures to
 * AssemblyAI Sync, and scores consequential target tokens.
 *
 * Usage:
 *   npm run eval:aai:human -- \
 *     --manifest ./path/to/manifest.json \
 *     --audio-dir ./path/to/audio
 *
 * Matched prompting comparison on fixed fixtures (same audio SHA, all arms):
 *   npm run eval:aai:human -- \
 *     --manifest ./manifest.json --audio-dir ./audio \
 *     --compare-prompts --only AAI-HUM-003,AAI-HUM-015,AAI-HUM-023 \
 *     --prompt "A protocol engineering discussion involving OpenRails, Prism, execution mandates and verification receipts." \
 *     --keyterm OpenRails --keyterm Prism
 *
 * Validation without spending API calls:
 *   npm run eval:aai:human -- --manifest ./manifest.json --audio-dir ./audio --dry-run
 *
 * The API key comes only from ASSEMBLYAI_API_KEY and is never written to evidence.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { scoreFixture } from "./score.mjs";

function parseArgs(argv) {
  const args = { keyterms: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "keyterm") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--keyterm requires a value");
      args.keyterms.push(value);
      i += 1;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function endpointFor(region = "global") {
  if (region === "global") return "https://sync.assemblyai.com/transcribe";
  if (region === "us") return "https://sync.us.assemblyai.com/transcribe";
  if (region === "eu") return "https://sync.eu.assemblyai.com/transcribe";
  if (region.startsWith("https://")) return region;
  throw new Error(`Unsupported region/endpoint: ${region}`);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function postSync({ audio, filename, endpoint, model, config }) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY is not set");
  const form = new FormData();
  form.append("audio", new Blob([audio], { type: "audio/wav" }), filename);
  if (Object.keys(config).length > 0) {
    form.append("config", new Blob([JSON.stringify(config)], { type: "application/json" }), "config.json");
  }
  const started = performance.now();
  let response;
  let body;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: apiKey, "X-AAI-Model": model },
      body: form,
    });
    const text = await response.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw_text: text };
    }
  } catch (error) {
    body = { transport_error: error instanceof Error ? error.message : String(error) };
  }
  return { response, body, wallClockMs: Number((performance.now() - started).toFixed(3)) };
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") throw new Error("Manifest is not a JSON object.");
  if (!Array.isArray(manifest.fixtures)) throw new Error("Manifest is missing fixtures[].");
  for (const fixture of manifest.fixtures) {
    for (const field of ["id", "ground_truth", "target_tokens", "target_class", "languages", "support_status"]) {
      if (fixture[field] === undefined) throw new Error(`Fixture ${fixture.id ?? "?"} is missing ${field}.`);
    }
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.manifest) throw new Error("--manifest <path> is required");
if (!args["audio-dir"]) throw new Error("--audio-dir <path> is required");

const comparePrompts = Boolean(args["compare-prompts"]);
if (comparePrompts && !args.only) throw new Error("--compare-prompts requires --only <id,id> so arms stay bounded.");
if (comparePrompts && (!args.prompt || args.keyterms.length === 0)) {
  throw new Error("--compare-prompts requires --prompt <text> and at least one --keyterm.");
}

const manifestPath = resolve(args.manifest);
const audioDir = resolve(args["audio-dir"]);
const model = args.model ?? "universal-3-5-pro";
const endpoint = endpointFor(args.region ?? "global");
const onlyIds = args.only ? String(args.only).split(",").map((id) => id.trim()).filter(Boolean) : null;
const dryRun = Boolean(args["dry-run"]);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
validateManifest(manifest);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const label = String(args.label ?? "human-corpus").replace(/[^a-zA-Z0-9._-]+/g, "-") || "human-corpus";
const runRoot = resolve(args.out ?? join("research/assemblyai/evidence/runs", `${stamp}-${label}`));
await mkdir(runRoot, { recursive: true });

const arms = comparePrompts
  ? [
      { id: "A0", name: "baseline", config: {} },
      { id: "A1", name: "prompt-only", config: { prompt: args.prompt } },
      { id: "A2", name: "keyterms-only", config: { keyterms_prompt: args.keyterms } },
      { id: "A3", name: "prompt-plus-keyterms", config: { prompt: args.prompt, keyterms_prompt: args.keyterms } },
    ]
  : [{ id: "A0", name: "baseline", config: {} }];

const observations = [];
const scoringByFixture = {};
const unsupported = [];
const refused = [];
let httpFailures = 0;

for (const fixture of manifest.fixtures) {
  if (onlyIds && !onlyIds.includes(fixture.id)) continue;
  if (!fixture.recorded) {
    observations.push({ fixture_id: fixture.id, status: "not_recorded" });
    continue;
  }
  const audioPath = join(audioDir, basename(fixture.file ?? `${fixture.id}.wav`));
  let audio;
  try {
    audio = await readFile(audioPath);
  } catch {
    const missing = { fixture_id: fixture.id, reason: `Audio file not found: ${audioPath}` };
    refused.push(missing);
    if (fixture.support_status === "unsupported_case") {
      unsupported.push({
        fixture_id: fixture.id,
        target_class: fixture.target_class,
        languages: fixture.languages,
        reason: "Unsupported case could not be hash-verified because its audio file is missing.",
      });
    }
    continue;
  }
  const actualHash = sha256(audio);
  if (actualHash !== fixture.audio_sha256) {
    const refusal = {
      fixture_id: fixture.id,
      reason: "SHA-256 mismatch: exported audio does not match the manifest. Evidence refused.",
      manifest_sha256: fixture.audio_sha256,
      actual_sha256: actualHash,
    };
    refused.push(refusal);
    if (fixture.support_status === "unsupported_case") {
      unsupported.push({
        fixture_id: fixture.id,
        target_class: fixture.target_class,
        languages: fixture.languages,
        reason: "Unsupported case failed SHA-256 verification and was not submitted.",
      });
    }
    continue;
  }
  if (fixture.support_status === "unsupported_case") {
    unsupported.push({
      fixture_id: fixture.id,
      target_class: fixture.target_class,
      languages: fixture.languages,
      audio_sha256: actualHash,
      reason: "Deliberately outside the documented language set; hash verified and held out of supported-language scoring.",
    });
    observations.push({ fixture_id: fixture.id, status: "unsupported_case_separated", audio_sha256: actualHash });
    continue;
  }

  const fixtureDir = join(runRoot, "fixtures", fixture.id);
  await mkdir(fixtureDir, { recursive: true });
  const armResults = [];

  for (const arm of arms) {
    const armDir = comparePrompts ? join(fixtureDir, arm.id) : fixtureDir;
    await mkdir(armDir, { recursive: true });
    const requestEvidence = {
      run_id: `${stamp}-${label}`,
      experiment: "AAI-HUM-CORPUS-001",
      arm: arm.id,
      arm_name: arm.name,
      fixture_id: fixture.id,
      audio_file: basename(audioPath),
      audio_sha256: actualHash,
      audio_bytes: audio.byteLength,
      endpoint,
      model,
      config: arm.config,
    };
    await writeJson(join(armDir, "request.json"), requestEvidence);

    if (dryRun) {
      await writeJson(join(armDir, "response.json"), { dry_run: true });
      await writeJson(join(armDir, "meta.json"), { dry_run: true });
      await writeJson(join(armDir, "scoring.json"), { dry_run: true });
      armResults.push({ arm: arm.id, dry_run: true });
      continue;
    }

    const { response, body, wallClockMs } = await postSync({
      audio,
      filename: basename(audioPath),
      endpoint,
      model,
      config: arm.config,
    });
    await writeJson(join(armDir, "response.json"), body);
    const meta = {
      run_id: `${stamp}-${label}`,
      created_at: new Date().toISOString(),
      success: Boolean(response?.ok),
      http_status: response?.status ?? null,
      wall_clock_ms: wallClockMs,
      session_id: body?.session_id ?? null,
      request_time_ms: body?.request_time_ms ?? null,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    };
    await writeJson(join(armDir, "meta.json"), meta);

    if (!response?.ok) httpFailures += 1;
    const scoring = response?.ok
      ? scoreFixture(
          { id: fixture.id, target_tokens: fixture.target_tokens, target_class: fixture.target_class, support_status: fixture.support_status },
          body?.text ?? "",
          body?.words,
        )
      : { fixture_id: fixture.id, error: "request_failed", http_status: response?.status ?? null };
    await writeJson(join(armDir, "scoring.json"), scoring);
    armResults.push({
      arm: arm.id,
      http_status: response?.status ?? null,
      text: body?.text ?? null,
      confidence: body?.confidence ?? null,
      session_id: body?.session_id ?? null,
      request_time_ms: body?.request_time_ms ?? null,
      wall_clock_ms: wallClockMs,
      scoring_summary: scoring.summary ?? null,
    });
  }

  scoringByFixture[fixture.id] = armResults;
  observations.push({ fixture_id: fixture.id, status: dryRun ? "verified_dry_run" : "transcribed", arms: armResults });
}

const baselineSummaries = Object.entries(scoringByFixture)
  .map(([fixtureId, armResults]) => ({ fixtureId, baseline: armResults.find((arm) => arm.arm === "A0")?.scoring_summary }))
  .filter((entry) => entry.baseline);

function rate(part, whole) {
  return whole === 0 ? null : Number((part / whole).toFixed(4));
}

const targetDetails = [];
for (const [fixtureId, armResults] of Object.entries(scoringByFixture)) {
  const scoringPath = join(
    runRoot,
    "fixtures",
    fixtureId,
    comparePrompts ? "A0" : "scoring.json",
    ...(comparePrompts ? ["scoring.json"] : []),
  );
  try {
    const scoring = JSON.parse(await readFile(scoringPath, "utf8"));
    for (const target of scoring.targets ?? []) targetDetails.push({ fixture_id: fixtureId, ...target });
  } catch {
    // dry-run or failed requests carry no per-target detail.
  }
}

const supportedTargets = targetDetails.length;
const scorecard = {
  run_id: `${stamp}-${label}`,
  created_at: new Date().toISOString(),
  corpus_id: manifest.corpus_id ?? null,
  truth_freeze: manifest.truth_freeze ?? null,
  model,
  endpoint,
  arms: arms.map((arm) => arm.id),
  supported: {
    fixtures_transcribed: baselineSummaries.length,
    fixtures_not_recorded: observations.filter((entry) => entry.status === "not_recorded").length,
    targets_scored: supportedTargets,
    exact_hits: targetDetails.filter((target) => target.exact).length,
    normalized_hits: targetDetails.filter((target) => target.normalized).length,
    exact_rate: rate(targetDetails.filter((target) => target.exact).length, supportedTargets),
    normalized_rate: rate(targetDetails.filter((target) => target.normalized).length, supportedTargets),
    wrong_high_confidence: targetDetails.filter((target) => target.wrong_high_confidence),
  },
  unsupported_separated: unsupported,
  refused,
  http_failures: httpFailures,
  note: "Rates are corpus-bounded observations over these human fixtures only. Unsupported cases are never mixed into supported rates.",
};

await writeJson(join(runRoot, "corpus.json"), {
  run_id: `${stamp}-${label}`,
  manifest_file: basename(manifestPath),
  corpus_id: manifest.corpus_id ?? null,
  recorded_count: manifest.recorded_count ?? null,
  fixture_count: manifest.fixture_count ?? null,
  model,
  endpoint,
  arms: arms.map((arm) => ({ id: arm.id, name: arm.name, config: arm.config })),
  only: onlyIds,
  dry_run: dryRun,
});
await writeJson(join(runRoot, "observations.json"), observations);
await writeJson(join(runRoot, "scorecard.json"), scorecard);

const lines = [
  `# Human corpus run ${stamp}-${label}`,
  "",
  `- Model: \`${model}\` on \`${endpoint}\``,
  `- Fixtures transcribed (supported): ${scorecard.supported.fixtures_transcribed}`,
  `- Targets scored: ${scorecard.supported.targets_scored}`,
  `- Exact target-token rate: ${scorecard.supported.exact_rate ?? "n/a"}`,
  `- Normalized target-token rate: ${scorecard.supported.normalized_rate ?? "n/a"}`,
  `- Wrong + high-confidence targets: ${scorecard.supported.wrong_high_confidence.length}`,
  `- Unsupported cases separated: ${unsupported.length} (${unsupported.map((entry) => entry.fixture_id).join(", ") || "none"})`,
  `- Refused (SHA mismatch / missing audio): ${refused.length}`,
  `- HTTP failures: ${httpFailures}`,
  "",
  "## Per-fixture baseline (A0)",
  "",
  "| Fixture | Transcript | Exact | Normalized |",
  "|---|---|---:|---:|",
];
for (const [fixtureId, armResults] of Object.entries(scoringByFixture)) {
  const baseline = armResults.find((arm) => arm.arm === "A0");
  const summary = baseline?.scoring_summary;
  lines.push(
    `| ${fixtureId} | ${(baseline?.text ?? "").replaceAll("|", "/").slice(0, 80)} | ${summary ? `${summary.exact_hits}/${summary.target_count}` : "n/a"} | ${summary ? `${summary.normalized_hits}/${summary.target_count}` : "n/a"} |`,
  );
}
if (comparePrompts) {
  lines.push("", "## Matched prompting comparison (same audio SHA per fixture)", "");
  lines.push("| Fixture | A0 baseline | A1 prompt | A2 keyterms | A3 combined |");
  lines.push("|---|---|---|---|---|");
  for (const [fixtureId, armResults] of Object.entries(scoringByFixture)) {
    const cell = (id) => {
      const summary = armResults.find((arm) => arm.arm === id)?.scoring_summary;
      return summary ? `${summary.exact_hits}/${summary.target_count}` : "n/a";
    };
    lines.push(`| ${fixtureId} | ${cell("A0")} | ${cell("A1")} | ${cell("A2")} | ${cell("A3")} |`);
  }
  lines.push("", "Conclusions must stay corpus-bounded, e.g. \u201cOn these N human fixtures, keyterms changed exact target-term recognition from X to Y.\u201d");
}
if (scorecard.supported.wrong_high_confidence.length > 0) {
  lines.push("", "## Wrong + high-confidence targets", "");
  for (const target of scorecard.supported.wrong_high_confidence) {
    lines.push(`- ${target.fixture_id}: \u201c${target.target}\u201d (confidence ${target.word_confidence})`);
  }
  lines.push("", "Confidence is reported as a vendor-supplied score, not a calibrated probability.");
}
if (refused.length > 0) {
  lines.push("", "## Refused evidence", "");
  for (const entry of refused) lines.push(`- ${entry.fixture_id}: ${entry.reason}`);
}
lines.push("", "Raw transcripts, session IDs, and timings are preserved per fixture under `fixtures/<id>/<arm>/`.");
await writeFile(join(runRoot, "report.md"), `${lines.join("\n")}\n`, "utf8");

console.log(JSON.stringify({ evidence_dir: runRoot, scorecard }, null, 2));
if (refused.length > 0 || httpFailures > 0) process.exitCode = 2;
