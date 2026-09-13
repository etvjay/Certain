import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const submission = readFileSync(new URL("../SUBMISSION.md", import.meta.url), "utf8");
const feedback = readFileSync(new URL("../research/assemblyai/FEEDBACK_LEDGER.md", import.meta.url), "utf8");
const foundry = readFileSync(new URL("../research/assemblyai/FINAL_FOUNDRY_REPORT.md", import.meta.url), "utf8");

describe("Certain closeout documentation", () => {
  it("leads with a plain-language explanation without removing technical vocabulary", () => {
    expect(readme.indexOf("## Start here")).toBeGreaterThan(-1);
    expect(readme.indexOf("## Start here")).toBeLessThan(readme.indexOf("## Thesis"));
    expect(readme).toContain("payment_instruction/v1");
    expect(readme).toContain("llm_response");
    expect(readme).toContain("SHA-256");
    expect(readme).toContain("VERIFIED");
    expect(submission.indexOf("## In plain English")).toBeGreaterThan(-1);
  });

  it("keeps Certain implementation notes outside AssemblyAI feedback", () => {
    expect(feedback).toContain("AssemblyAI substrate feedback only");
    expect(feedback).not.toContain("CERTAIN-FB-001");
    expect(feedback).not.toContain("Certain implementation findings");
    expect(foundry).not.toContain("CERTAIN-FB-001");
  });
});
