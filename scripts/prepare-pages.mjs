import { access, cp, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(root, ".pages-build");
const functionsBuildDir = resolve(root, ".pages-functions-build");
const nextDir = resolve(root, ".next");

await rm(outputDir, { recursive: true, force: true });
await rm(functionsBuildDir, { recursive: true, force: true });
await mkdir(join(outputDir, "_next"), { recursive: true });
await cp(join(nextDir, "static"), join(outputDir, "_next", "static"), { recursive: true });
await cp(join(nextDir, "server", "app", "index.html"), join(outputDir, "index.html"));
await mkdir(join(outputDir, "eval", "record"), { recursive: true });
await cp(join(nextDir, "server", "app", "eval", "record.html"), join(outputDir, "eval", "record.html"));
await cp(join(nextDir, "server", "app", "eval", "record.html"), join(outputDir, "eval", "record", "index.html"));
await cp(join(nextDir, "server", "pages", "404.html"), join(outputDir, "404.html"));

const publicDir = resolve(root, "public");
try {
  await access(publicDir);
  await cp(publicDir, outputDir, { recursive: true });
} catch {
  // This project does not require a public/ directory.
}

const favicon = resolve(root, "app", "favicon.ico");
try {
  await cp(favicon, join(outputDir, "favicon.ico"));
} catch {
  // The build remains valid if a future app removes the favicon route.
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npx, [
  "wrangler",
  "pages",
  "functions",
  "build",
  "functions",
  "--outdir",
  functionsBuildDir,
  "--project-directory",
  root,
  "--build-output-directory",
  outputDir,
  "--sourcemap",
], { cwd: root, stdio: "inherit" });

if (result.status !== 0) {
  throw new Error(`Pages Function build failed with exit code ${result.status ?? "unknown"}`);
}

await cp(join(functionsBuildDir, "index.js"), join(outputDir, "_worker.js"));
await cp(join(functionsBuildDir, "index.js.map"), join(outputDir, "_worker.js.map"));

console.log(`Prepared ${outputDir}`);
