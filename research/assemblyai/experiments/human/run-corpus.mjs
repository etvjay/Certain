#!/usr/bin/env node
/**
 * Human-corpus Foundry runner.
 *
 * Reads a recorder-exported corpus bundle, verifies every WAV SHA-256 before
 * use, submits supported fixtures to AssemblyAI Dictation by default, and
 * scores verbatim and cleaned output separately. Historical Sync runs remain
 * reproducible with --api sync.
 *
 * Usage:
 *   npm run eval:aai:human -- \
 *     --manifest ./path/to/manifest.json \
 *     --audio-dir ./path/to/audio
 *
 * Matched prompting comparison on fixed fixtures (same audio SHA, all arms):
 *   npm run eval:aai:human -- \
 *     --api dictation --manifest ./manifest.json --audio-dir ./audio \
 *     --compare-prompts --only AAI-HUM-003,AAI-HUM-015,AAI-HUM-023 \
 *     --prompt "A protocol engineering discussion involving OpenRails, Prism, execution mandates and verification receipts." \
 *     --keyterm OpenRails --keyterm Prism
 *
 * Historical Sync comparison:
 *   npm run eval:aai:human -- --api sync --manifest ... --audio-dir ...
 *
 * Validation without spending API calls:
 *   npm run eval:aai:human -- --api dictation --manifest ./manifest.json --audio-dir ./audio --dry-run
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

function endpointFor(api, region = "global") {
  if (api === "dictation") {
    if (region === "global") return "https://dictation.assemblyai.com/v1/transcribe/live";
    if (region === "us") return "https://dictation.us.assemblyai.com/v1/transcribe/live";
    if (region === "eu") return "https://dictation.eu.assemblyai.com/v1/transcribe/live";
  } else {
    if (region === "global") return "https://sync.assemblyai.com/transcribe";
    if (region === "us") return "https://sync.us.assemblyai.com/transcribe";
    if (region === "eu") return "https://sync.eu.assemblyai.com/transcribe";
  }
  if (region.startsWith("https://")) return region;
  throw new Error(`Unsupported API/region: ${api}/${region}`);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function configForArm(api, arm, prompt, keyterms) {
  if (api === "dictation") {
    if (arm === "A1") return { stt_prompt: prompt };
    if (arm === "A2") return { keyterms_prompt: keyterms };
    if (arm === "A3") return { stt_prompt: prompt, keyterms_prompt: keyterms };
    return {};
  }
  if (arm === "A1") return { prompt };
  if (arm === "A2") return { keyterms_prompt: keyterms };
  if (arm === "A3") return { prompt, keyterms_prompt: keyterms };
  return {};
}

async function postAssemblyAI({ api, audio, filename, endpoint, model, config }) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY is not set");

  const form = new FormData();
  if (api === "dictation") {
    // Dictation requires config first, including an explicit {} for defaults.
    form.append("config", new Blob([JSON.stringify(config)], { type: "application/json" }), "config.json");
    form.append("audio", new Blob([audio], { type: "audio/wav" }), filename);
  } else {
    form.append("audio", new Blob([audio], { type: "audio/wav" }), filename);
    if (Object.keys(config).length > 0) {
      form.append("config", new Blob([JSON.stringify(config)], { type: "application/json" }), "config.json");
    }
  }

  const started = performance.now();
  let response;
  let body;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: api === "dictation" ? { Authorization: apiKey } : { Authorization: apiKey, "X-AAI-Model": model },
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

function scoreResponse(fixture, body, api) {
  const base = { id: fixture.id, target_tokens: fixture.target_tokens, target_class: fixture.target_class, support_status: fixture.support_status };
  const verbatim = scoreFixture(base, body?.text ?? "", body?.words);
  const cleanedText = typeof body?.llm_response === "string" ? body.llm_response : null;
  const cleaned = cleanedText === null ? null : scoreFixture(base, cleanedText, undefined);
  return {
    fixture_id: fixture.id,
    provider: "assemblyai",
    product: api,
    text: body?.text ?? null,
    cleaned_text: cleanedText,
    llm_error: body?.llm_error ?? null,
    verbatim,
    cleaned,
    summary: verbatim.summary,
    note: "Verbatim scoring uses provider word evidence. Cleaned scoring uses text-only matching because rewrite text is not word-timestamp aligned.",
  };
}

function surfaceSummary(targets) {
  const targetCount = targets.length;
  const exactHits = targets.filter((target) => target.exact).length;
  const normalizedHits = targets.filter((target) => target.normalized).length;
  return {
    targets_scored: targetCount,
    exact_hits: exactHits,
    normalized_hits: normalizedHits,
    exact_rate: targetCount === 0 ? null : Number((exactHits / targetCount).toFixed(4)),
    normalized_rate: targetCount === 0 ? null : Number((normalizedHits / targetCount).toFixed(4)),
    wrong_high_confidence: targets.filter((target) => target.wrong_high_confidence),
  };
}

const args = parseArgs(process.argv.slice(2));
if (!args.manifest) throw new Error("--manifest <path> is required");
if (!args["audio-dir"]) throw new Error("--audio-dir <path> is required");

const api = String(args.api ?? args.provider ?? "dictation").toLowerCase();
if (!["dictation", "sync"].includes(api)) throw new Error("--api must be dictation or sync");
const comparePrompts = Boolean(args["compare-prompts"]);
if (comparePrompts && !args.only) throw new Error("--compare-prompts requires --only <id,id> so arms stay bounded.");
if (comparePrompts && (!args.prompt || args.keyterms.length === 0)) {
  throw new Error("--compare-prompts requires --prompt <text> and at least one --keyterm.");
}

const manifestPath = resolve(args.manifest);
const audioDir = resolve(args["audio-dir"]);
const model = args.model ?? "universal-3-5-pro";
const endpoint = endpointFor(api, args.region ?? "global");
const onlyIds = args.only ? String(args.only).split(",").map((id) => id.trim()).filter(Boolean) : null;
const dryRun = Boolean(args["dry-run"]);
const prompt = String(args.prompt ?? "");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
validateManifest(manifest);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const label = String(args.label ?? `${api}-human-corpus`).replace(/[^a-zA-Z0-9._-]+/g, "-") || `${api}-human-corpus`;
const runRoot = resolve(args.out ?? join("research/assemblyai/evidence/runs", `${stamp}-${label}`));
await mkdir(runRoot, { recursive: true });

const arms = comparePrompts
  ? ["A0", "A1", "A2", "A3"].map((id) => ({ id, name: { A0: "baseline", A1: "prompt-only", A2: "keyterms-only", A3: "prompt-plus-keyterms" }[id], config: configForArm(api, id, prompt, args.keyterms) }))
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
    continue;
  }
  const actualHash = sha256(audio);
  if (actualHash !== fixture.audio_sha256) {
    refused.push({
      fixture_id: fixture.id,
      reason: "SHA-256 mismatch: exported audio does not match the manifest. Evidence refused.",
      manifest_sha256: fixture.audio_sha256,
      actual_sha256: actualHash,
    });
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
      provider: "assemblyai",
      product: api,
      arm: arm.id,
      arm_name: arm.name,
      fixture_id: fixture.id,
      audio_file: basename(audioPath),
      audio_sha256: actualHash,
      audio_bytes: audio.byteLength,
      endpoint,
      model: api === "dictation" ? "universal-3-5-pro (Dictation default)" : model,
      config: arm.config,
    };
    await writeJson(join(armDir, "request.json"), requestEvidence);

    if (dryRun) {
      await writeJson(join(armDir, "response.json"), { dry_run: true });
      await writeJson(join(armDir, "meta.json"), { dry_run: true, provider: "assemblyai", product: api });
      await writeJson(join(armDir, "scoring.json"), { dry_run: true });
      armResults.push({ arm: arm.id, dry_run: true });
      continue;
    }

    const { response, body, wallClockMs } = await postAssemblyAI({ api, audio, filename: basename(audioPath), endpoint, model, config: arm.config });
    await writeJson(join(armDir, "response.json"), body);
    const meta = {
      run_id: `${stamp}-${label}`,
      created_at: new Date().toISOString(),
      provider: "assemblyai",
      product: api,
      success: Boolean(response?.ok),
      http_status: response?.status ?? null,
      wall_clock_ms: wallClockMs,
      session_id: body?.session_id ?? null,
      request_time_ms: body?.request_time_ms ?? null,
      sync_time_ms: body?.sync_time_ms ?? null,
      audio_duration_ms: body?.audio_duration_ms ?? null,
      llm_error: body?.llm_error ?? null,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    };
    await writeJson(join(armDir, "meta.json"), meta);

    if (!response?.ok) httpFailures += 1;
    const scoring = response?.ok ? scoreResponse(fixture, body, api) : { fixture_id: fixture.id, provider: "assemblyai", product: api, error: "request_failed", http_status: response?.status ?? null };
    await writeJson(join(armDir, "scoring.json"), scoring);
    armResults.push({
      arm: arm.id,
      http_status: response?.status ?? null,
      text: body?.text ?? null,
      cleaned_text: body?.llm_response ?? null,
      llm_error: body?.llm_error ?? null,
      confidence: body?.confidence ?? null,
      session_id: body?.session_id ?? null,
      request_time_ms: body?.request_time_ms ?? null,
      sync_time_ms: body?.sync_time_ms ?? null,
      audio_duration_ms: body?.audio_duration_ms ?? null,
      wall_clock_ms: wallClockMs,
      scoring_summary: scoring.summary ?? null,
      cleaned_scoring_summary: scoring.cleaned?.summary ?? null,
    });
  }
  scoringByFixture[fixture.id] = armResults;
  observations.push({ fixture_id: fixture.id, status: dryRun ? "verified_dry_run" : "transcribed", arms: armResults });
}

const baselineVerbatimTargets = [];
const baselineCleanedTargets = [];
for (const [fixtureId] of Object.entries(scoringByFixture)) {
  let scoringPath = join(runRoot, "fixtures", fixtureId, comparePrompts ? "A0" : "scoring.json");
  if (comparePrompts) scoringPath = join(scoringPath, "scoring.json");
  try {
    const scoring = JSON.parse(await readFile(scoringPath, "utf8"));
    baselineVerbatimTargets.push(...(scoring.verbatim?.targets ?? []));
    baselineCleanedTargets.push(...(scoring.cleaned?.targets ?? []));
  } catch {
    // dry-run or failed requests carry no per-target detail.
  }
}
const verbatim = surfaceSummary(baselineVerbatimTargets);
const cleaned = surfaceSummary(baselineCleanedTargets);
const cleanedFixtureCount = Object.values(scoringByFixture).filter((armsForFixture) => armsForFixture.some((arm) => arm.cleaned_text !== null && arm.cleaned_text !== undefined)).length;
const baselineSummaries = Object.values(scoringByFixture).filter((armResults) => armResults.some((arm) => arm.arm === "A0" && arm.http_status === 200));

const scorecard = {
  run_id: `${stamp}-${label}`,
  created_at: new Date().toISOString(),
  provider: "assemblyai",
  product: api,
  corpus_id: manifest.corpus_id ?? null,
  truth_freeze: manifest.truth_freeze ?? null,
  model: api === "dictation" ? "universal-3-5-pro (Dictation default)" : model,
  endpoint,
  arms: arms.map((arm) => arm.id),
  supported: {
    fixtures_transcribed: baselineSummaries.length,
    fixtures_not_recorded: observations.filter((entry) => entry.status === "not_recorded").length,
    targets_scored: verbatim.targets_scored,
    exact_hits: verbatim.exact_hits,
    normalized_hits: verbatim.normalized_hits,
    exact_rate: verbatim.exact_rate,
    normalized_rate: verbatim.normalized_rate,
    wrong_high_confidence: verbatim.wrong_high_confidence,
    verbatim,
    cleaned: { ...cleaned, fixtures_with_output: cleanedFixtureCount },
  },
  unsupported_separated: unsupported,
  refused,
  http_failures: httpFailures,
  note: "Verbatim and cleaned surfaces are reported separately. Rates are corpus-bounded observations over these human fixtures only. Unsupported cases are never mixed into supported rates.",
};

await writeJson(join(runRoot, "corpus.json"), {
  run_id: `${stamp}-${label}`,
  manifest_file: basename(manifestPath),
  corpus_id: manifest.corpus_id ?? null,
  recorded_count: manifest.recorded_count ?? null,
  fixture_count: manifest.fixture_count ?? null,
  provider: "assemblyai",
  product: api,
  model: scorecard.model,
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
  `- Provider: \`${scorecard.provider}\``,
  `- Product: \`${scorecard.product}\``,
  `- Model: \`${scorecard.model}\` on \`${endpoint}\``,
  `- Fixtures transcribed (supported): ${scorecard.supported.fixtures_transcribed}`,
  `- Unsupported cases separated: ${unsupported.length} (${unsupported.map((entry) => entry.fixture_id).join(", ") || "none"})`,
  `- Refused (SHA mismatch / missing audio): ${refused.length}`,
  `- HTTP failures: ${httpFailures}`,
  "",
  "## Verbatim score (text)",
  "",
  `- Targets scored: ${verbatim.targets_scored}`,
  `- Exact target-token rate: ${verbatim.exact_rate ?? "n/a"}`,
  `- Normalized target-token rate: ${verbatim.normalized_rate ?? "n/a"}`,
  `- Wrong + high-confidence targets: ${verbatim.wrong_high_confidence.length}`,
  "",
  "## Cleaned score (llm_response)",
  "",
  `- Fixtures with cleaned output: ${cleanedFixtureCount}`,
  `- Targets scored: ${cleaned.targets_scored}`,
  `- Exact target-token rate: ${cleaned.exact_rate ?? "n/a"}`,
  `- Normalized target-token rate: ${cleaned.normalized_rate ?? "n/a"}`,
  "",
  "## Per-fixture baseline (A0)",
  "",
  "| Fixture | Verbatim transcript | Verbatim exact | Verbatim normalized | Cleaned exact | Cleaned normalized |",
  "|---|---|---:|---:|---:|---:|",
];
for (const [fixtureId, armResults] of Object.entries(scoringByFixture)) {
  const baseline = armResults.find((arm) => arm.arm === "A0");
  let scoringPath = join(runRoot, "fixtures", fixtureId, comparePrompts ? "A0" : "scoring.json");
  if (comparePrompts) scoringPath = join(scoringPath, "scoring.json");
  let scoring = null;
  try { scoring = JSON.parse(await readFile(scoringPath, "utf8")); } catch { /* no-op */ }
  const v = scoring?.verbatim?.summary;
  const c = scoring?.cleaned?.summary;
  lines.push(`| ${fixtureId} | ${(baseline?.text ?? "").replaceAll("|", "/").slice(0, 80)} | ${v ? `${v.exact_hits}/${v.target_count}` : "n/a"} | ${v ? `${v.normalized_hits}/${v.target_count}` : "n/a"} | ${c ? `${c.exact_hits}/${c.target_count}` : "n/a"} | ${c ? `${c.normalized_hits}/${c.target_count}` : "n/a"} |`);
}
if (comparePrompts) {
  lines.push("", "## Matched prompting comparison (verbatim text, same audio SHA per fixture)", "", "| Fixture | A0 baseline | A1 prompt | A2 keyterms | A3 combined |", "|---|---|---|---|---|");
  for (const [fixtureId, armResults] of Object.entries(scoringByFixture)) {
    const cell = (id) => { const summary = armResults.find((arm) => arm.arm === id)?.scoring_summary; return summary ? `${summary.exact_hits}/${summary.target_count}` : "n/a"; };
    lines.push(`| ${fixtureId} | ${cell("A0")} | ${cell("A1")} | ${cell("A2")} | ${cell("A3")} |`);
  }
  lines.push("", "Conclusions must stay corpus-bounded. Cleaned output is retained separately and is not substituted for verbatim contract evidence.");
}
if (verbatim.wrong_high_confidence.length > 0) {
  lines.push("", "## Wrong + high-confidence verbatim targets", "");
  for (const target of verbatim.wrong_high_confidence) lines.push(`- ${target.fixture_id}: “${target.target}” (confidence ${target.word_confidence})`);
  lines.push("", "Confidence is reported as a vendor-supplied score, not a calibrated probability.");
}
if (refused.length > 0) {
  lines.push("", "## Refused evidence", "");
  for (const entry of refused) lines.push(`- ${entry.fixture_id}: ${entry.reason}`);
}
lines.push("", "Raw provider responses, session IDs, timings, and both scoring surfaces are preserved per fixture under `fixtures/<id>/<arm>/`.");
await writeFile(join(runRoot, "report.md"), `${lines.join("\n")}\n`, "utf8");

console.log(JSON.stringify({ evidence_dir: runRoot, scorecard }, null, 2));
if (refused.length > 0 || httpFailures > 0) process.exitCode = 2;
