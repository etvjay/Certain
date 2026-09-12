#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { performance } from "node:perf_hooks";

function parseArgs(argv) {
  const args = { keyterms: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (key === "keyterm") {
      if (!value || value.startsWith("--")) throw new Error("--keyterm requires a value");
      args.keyterms.push(value);
      i += 1;
      continue;
    }
    if (!value || value.startsWith("--")) {
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

function safeLabel(input = "sync") {
  return String(input).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "sync";
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function runSyncExperiment(options) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY is not set");
  if (!options.audio) throw new Error("--audio <path.wav> is required");

  const audioPath = resolve(options.audio);
  const audio = await readFile(audioPath);
  const audioHash = sha256(audio);
  const endpoint = endpointFor(options.region ?? "global");
  const model = options.model ?? "universal-3-5-pro";
  const label = safeLabel(options.label ?? "sync");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runId = `${stamp}-${label}`;
  const root = resolve("research/assemblyai/evidence/runs", runId);
  await mkdir(root, { recursive: true });

  const config = {};
  if (options.prompt) config.prompt = options.prompt;
  if (options.keyterms?.length) config.keyterms_prompt = options.keyterms;
  if (options.language) config.language_codes = String(options.language).split(",").map((value) => value.trim()).filter(Boolean);

  const requestEvidence = {
    run_id: runId,
    label,
    audio_file: basename(audioPath),
    audio_sha256: audioHash,
    audio_bytes: audio.byteLength,
    endpoint,
    model,
    config,
  };
  await writeJson(resolve(root, "request.json"), requestEvidence);

  const form = new FormData();
  form.append("audio", new Blob([audio], { type: "audio/wav" }), basename(audioPath));
  if (Object.keys(config).length) {
    form.append("config", new Blob([JSON.stringify(config)], { type: "application/json" }), "config.json");
  }

  const started = performance.now();
  let response;
  let body;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "X-AAI-Model": model,
      },
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
  const wallClockMs = performance.now() - started;

  await writeJson(resolve(root, "response.json"), body);
  const meta = {
    run_id: runId,
    created_at: new Date().toISOString(),
    success: Boolean(response?.ok),
    http_status: response?.status ?? null,
    wall_clock_ms: Number(wallClockMs.toFixed(3)),
    session_id: body?.session_id ?? null,
    request_time_ms: body?.request_time_ms ?? null,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  };
  await writeJson(resolve(root, "meta.json"), meta);

  console.log(JSON.stringify({ evidence_dir: root, request: requestEvidence, meta, response: body }, null, 2));
  if (response && !response.ok) process.exitCode = 2;
  return { root, request: requestEvidence, meta, response: body };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  runSyncExperiment(args).catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
