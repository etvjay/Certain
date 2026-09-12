#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runSyncExperiment } from "../sync/run-sync.mjs";

function parseArgs(argv) {
  const args = { keyterms: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
    if (key === "keyterm") args.keyterms.push(value);
    else args[key] = value;
    i += 1;
  }
  return args;
}

function safeLabel(input = "prompting") {
  return String(input).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "prompting";
}

const args = parseArgs(process.argv.slice(2));
if (!args.audio) throw new Error("--audio is required");
if (!args.prompt) throw new Error("--prompt is required");
if (!args.keyterms.length) throw new Error("At least one --keyterm is required");

const base = safeLabel(args.label ?? "prompting");
const common = {
  audio: args.audio,
  region: args.region,
  model: args.model,
  language: args.language,
};

const arms = [
  { id: "A0", label: `${base}-A0-baseline`, ...common },
  { id: "A1", label: `${base}-A1-prompt`, ...common, prompt: args.prompt },
  { id: "A2", label: `${base}-A2-keyterms`, ...common, keyterms: args.keyterms },
  { id: "A3", label: `${base}-A3-combined`, ...common, prompt: args.prompt, keyterms: args.keyterms },
];

const results = [];
for (const arm of arms) {
  const result = await runSyncExperiment(arm);
  results.push({
    arm: arm.id,
    label: arm.label,
    evidence_dir: result.root,
    text: result.response?.text ?? null,
    confidence: result.response?.confidence ?? null,
    session_id: result.response?.session_id ?? null,
    request_time_ms: result.response?.request_time_ms ?? null,
    wall_clock_ms: result.meta.wall_clock_ms,
    http_status: result.meta.http_status,
  });
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const summaryDir = resolve("research/assemblyai/evidence/runs", `${stamp}-${base}-comparison`);
await mkdir(summaryDir, { recursive: true });
await writeFile(
  resolve(summaryDir, "summary.json"),
  `${JSON.stringify({
    experiment: "AAI-PROMPT-001",
    created_at: new Date().toISOString(),
    audio: args.audio,
    prompt: args.prompt,
    keyterms: args.keyterms,
    arms: results,
    note: "Matched-pair outputs only. Human/fixture scoring is required before drawing quality conclusions."
  }, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify({ summary_dir: summaryDir, arms: results }, null, 2));
