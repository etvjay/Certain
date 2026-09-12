# Evaluation Fixtures

Audio under `fixtures/audio/` is local-only by default and gitignored. Keep reproducible metadata and ground truth in a manifest; do not commit sensitive recordings casually.

## Fixture principles

Each fixture should have:

- stable ID;
- local filename;
- SHA-256 recorded by the experiment harness;
- exact human ground truth;
- target token(s);
- target class;
- language(s);
- support status (`supported` or `unsupported_case`);
- speaker/accent notes only when analytically relevant;
- recording conditions;
- consent/source provenance.

## Recommended first corpus

At least 20 natural utterances spanning:

- ordinary dictation;
- `OpenRails`, `Prism`, `AssemblyAI`, `Universal-3.5 Pro` and similar domain vocabulary;
- amounts from tens through tens of thousands;
- invoice IDs such as `INV-14892`;
- mixed alphanumeric IDs;
- dates and times;
- URLs and email addresses;
- self-correction: "twelve—sorry—fifteen thousand dollars";
- Nigerian English at natural speed;
- one or more code-switched pairs within the documented 18-language set.

Pidgin can be included as `unsupported_case`; keep it out of supported-language defect statistics unless AssemblyAI explicitly adds it to claimed support.
