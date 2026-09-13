# Experimental speaker similarity

Status: `DEFERRED`.

Certain does not ship a speaker-embedding model or biometric profile in the hackathon build. No raw enrollment audio, embeddings, threshold, or speaker decision is part of the production request path.

The receipt schema can carry optional `SpeakerEvidence` only when an isolated experiment supplies it. Such evidence must remain marked `experimental: true`, use an explicit model/version and metric, and must never override a specification mismatch, contract violation, challenge failure, or `BLOCKED` state.

No claim of identity, liveness, authentication, deepfake resistance, or authorization is permitted from the deferred experiment.
