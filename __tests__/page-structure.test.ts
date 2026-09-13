import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../components/CertainDemo.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("Certain capability dashboard structure", () => {
  it.each([
    ["consequential-action capability", "action-verification"],
    ["specification capability", "specification-verification"],
    ["action contract", "action-contract"],
    ["speech input", "speak"],
    ["verbatim Dictation evidence", "heard"],
    ["typed contract evidence", "fields"],
    ["specification evidence", "specification"],
    ["specification comparison result", "specification-result"],
    ["fresh challenge evidence", "challenge"],
    ["verification evidence", "verification"],
    ["receipt", "receipt"],
    ["boundary test", "negative"],
    ["feedback evidence", "foundry-feedback"],
  ])("exposes a stable %s anchor", (_label, id) => {
    expect(source).toContain(`id="${id}"`);
  });

  it("names the two product capabilities explicitly", () => {
    expect(source).toContain("Verify a consequential action");
    expect(source).toContain("Verify against a preaccepted specification");
  });

  it("introduces the page as a peer-capability dashboard", () => {
    expect(source).toContain("Bounded voice decisions for consequential inputs.");
    expect(source).toContain("Choose either peer capability");
    expect(source).not.toContain("VOICE TRUST LAYER</span>");
  });

  it("keeps shared evidence separate from the capability names", () => {
    expect(source).toContain("DICTATION / WHAT WAS HEARD");
    expect(source).toContain("TYPED INPUT / CONTRACT DECISION");
    expect(source).toContain("FRESH CHALLENGE / SUPPORTING EVIDENCE");
    expect(source).toContain("VERIFICATION RECEIPT");
  });

  it("makes capability 02 independently runnable", () => {
    const specPanel = source.slice(source.indexOf('id="specification-verification"'), source.indexOf('id="negative"'));
    expect(specPanel).toContain('id="specification-speak"');
    expect(specPanel).toContain("Compare this instruction");
    expect(specPanel).toContain("COMPARISON RESULT");
    expect(specPanel).toContain("specificationComparison");
    expect(specPanel).not.toContain("Run the first capability above");
    expect(specPanel).not.toContain("same typed fields will appear here");
    expect(specPanel).not.toContain("evaluation.specification");
  });

  it("keeps each sibling body inside its own grid track", () => {
    expect(styles).toContain(".capability-body>*{min-width:0}");
    expect(styles).toContain(".capability-body .section-head>div{min-width:0}");
    const desktopStyles = styles.slice(0, styles.indexOf("@media(max-width:900px)"));
    expect(desktopStyles).toContain(".specification-speak .section-head{flex-direction:column;align-items:stretch}");
  });

  it("keeps the negative test outside both capability panels", () => {
    const actionEnd = source.indexOf("</section>", source.indexOf('id="action-verification"'));
    const specStart = source.indexOf('id="specification-verification"');
    const negativeStart = source.indexOf('id="negative"');
    expect(actionEnd).toBeGreaterThan(-1);
    expect(specStart).toBeGreaterThan(actionEnd);
    expect(negativeStart).toBeGreaterThan(specStart);
  });

  it("keeps Foundry feedback bounded to substrate evidence and limits", () => {
    expect(source).toContain("AssemblyAI substrate behavior and evidence limits");
    expect(source).toContain("This is corpus-bounded quality evidence, not a general accuracy claim.");
    expect(source).toContain("not confirmed AssemblyAI bugs.");
    expect(source).toContain("speaker similarity is not shipped");
    expect(source).not.toContain("Certain fix");
  });
});
