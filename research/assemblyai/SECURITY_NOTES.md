# Security Research Boundary

The hackathon form accepts security feedback, but this repository does not authorize invasive security testing.

## Allowed research posture

Test only:

- our own AssemblyAI account/project;
- our own API credentials;
- our own audio and generated fixtures;
- documented public endpoints;
- non-destructive malformed inputs;
- authentication/authorization behavior that can be exercised without accessing another user's data;
- region/configuration/error behavior visible to our own requests.

## Do not

- attempt credential theft or token guessing;
- access another user's transcripts, projects, billing data, or metadata;
- perform denial-of-service/load testing;
- bypass rate/usage controls;
- exploit infrastructure beyond the minimum needed to verify an issue;
- publish sensitive security details before responsible disclosure;
- commit secrets, raw authorization headers, or private account metadata.

## Evidence handling

Generated evidence must redact:

- API keys;
- authorization headers;
- account identifiers not required for reproduction;
- unrelated personal data.

Prefer synthetic audio for security/error experiments.

If a genuine security issue appears, stop expanding the exploit path once the issue is minimally demonstrated on our own resources. Move the detailed report out of the public feedback ledger and disclose through AssemblyAI's designated security channel / hackathon security-report path.
