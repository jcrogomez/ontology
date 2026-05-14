# legend-fixture

Deterministic 6-file fixture for SELF_INGEST_HYPOTHESIS_2026-05-13 §8.
Mirrors Ontology's `src/<area>/` layout so the existing
`frontier-tagger` rules fire on the fixture paths.

Each file is a 1:1 sanity check against the Phase ε hypothesis's
faithful/resistant prediction: tagging the file with the path/content
rules should yield exactly the predicted multi-label set. If a fixture
file lands outside its predicted bucket, either the matrix, the
hypothesis, or the fixture is wrong — a useful failure that promotes
§3.10 from T2 empirical toward a reproducible T1 claim.

## Files and predictions

| Path | Predicted attributes | Rationale |
|---|---|---|
| `src/core/integrity/hash.ts` | `pure-transform` | Hashing primitives — canonical pure-transform region. |
| `src/runtime/effects/result.ts` | `algebraic-lawful`, `pure-transform` | Result monad surface — algebraic-law region. |
| `src/schemas/user.ts` | `schema-driven` | Pure Zod schema declaration. |
| `src/commands/greet/index.ts` | `cli-parsing`, `operational-glue` | CLI command entry point. |
| `src/core/fs/cache.ts` | `io-bound`, `operational-glue` | Filesystem cache helper. |
| `src/runtime/prompt/literal-template.ts` | `schema-driven`, `literal-required`, `prompt-sensitive` | Prompt region (path) + `literal: true` flag (content) + 256+ char template body (content). |

## What this fixture is not

It is **not** the full deterministic test:
`ingest → apply → infer-edges → verify-homeomorphism → expected matrix`.
That test requires the canonical pipeline (Ollama or Anthropic) and
lands after the Phase ε pilot. The current fixture validates the $0
half — that the tagger's prediction model agrees with the
hypothesis-pre-registered prediction.

The deterministic ingest test will append here when step 8 of the
short path runs.
