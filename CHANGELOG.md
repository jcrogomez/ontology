# Changelog

All notable releases of the Ontology semantic compiler. This file is
an index by version with the headline changes; `docs/RELEASE_NOTES.md`
carries the running detail (per-PR / per-commit notes), and
`docs/LEGEND.md` is the public-facing release write-up for the
Project Legend cycle (0.4.x line and forward).

Versions follow [SemVer](https://semver.org/spec/v2.0.0.html). Until
1.0.0, every minor bump may include schema or CLI surface changes;
patch bumps are bug-fix / doc-only.

## [Unreleased] — 0.4.0 promotion gate

Promote to **0.4.0** (final) when:

- Phase ε self-ingestion lands a calibration report at
  `docs/legend/calibrations/SELF_INGEST_<date>.md` with non-trivial
  n and measured ε on the Ontology codebase itself.
- `MATHEMATICAL_CLAIMS.md` §3.10 upgrades from T4 to T2 with a
  citation to that report.

Until then, the rc tag carries the same code; the version-final
promotion is purely a publishing event.

## [0.4.0-rc.1] — 2026-05-13

**Project Legend Phases β + γ + γ-7 + δ shipped — auto-digest cycle
+ Inspector + verification all operational, with cross-provider
per-task routing, advisory lock, and the Walker v2 PR-1 proposal
review pane.**

This release closes the inverse-functor cycle: a brownfield codebase
can now be lifted into a typed intent network (`onto ingest`),
inspected node-by-node with a cached one-LLM-call-per-node
translator (`onto node inspect`), and measured for round-trip
faithfulness with dual distances and a five-label verdict (`onto
verify-homeomorphism`). Two external empirical anchors validate
the round-trip claim; Phase ε on the Ontology codebase itself is
the next data point and gates promotion to 0.4.0 final.

### Headline surfaces

- `onto ingest <file|dir>` — single-file (γ-1) and multi-file
  (γ-5) intent extraction with `--include` for non-TS, `--dry-run`
  for prompt iteration, `--cost-estimate` for zero-API pre-flight
  (task-aware pricing, so `--provider anthropic` reports Sonnet
  rates for `semantic_parse` not Opus).
- `onto graph infer-edges <dir> --create-proposals` — TS compiler
  API + Python regex parser turn static `import` graphs into
  typed `edge_create` proposals (γ-4 + γ-6).
- `onto node inspect <id>` — Inspector / Lupa primitive. Cached
  on `node.translator` with automatic invalidation when the
  node's prompt / rules / contract / `literal` change.
- `onto verify-homeomorphism --all-artifacts` — the publishable
  measurement. Dual distances (LoC + structural Jaccard), five
  verdict labels, `--report <path.md>` writes a markdown summary.
- `onto compile run --provider anthropic` (no `--model`) — routes
  per task automatically: `inspect` → Haiku 4.5, `semantic_parse`
  → Sonnet 4.6, `code_sketch` → Opus 4.7. Cross-provider plans
  (some nodes Anthropic, some Ollama) work in the same compile
  run.
- `.ontology/.lock` advisory lock — exclusive lock for
  cross-process safety on `compile run` / `compile run-batch` /
  `verify-homeomorphism`. Stale-PID recovery on same host;
  cross-host refused. `--no-lock` opt-out for tests / debug.
- Walker `:proposals` — review pane with `j/k` navigation and
  `a / r / d` action keys. Phase ε's ~90-proposal apply loop
  runs from inside the TUI.

### Empirical data points

| Calibration | Corpus | Result |
|---|---|---|
| γ-2 | `src/core/integrity/hash.ts` (1 file) | 5 / 5 functions ε-equivalent with Opus 4.7 |
| γ-7 | Vibe-Reasoning (24 Python files, external) | 36% → 65% ε-equivalent across γ-7 re-ingest; `divergent_both` fully eliminated (4 → 0) |

### Categorical infrastructure (load-bearing)

- `LlmTask × LlmRoutingTier × provider` — three-axis routing
  table for cross-provider task-aware dispatch.
- `computeFiberBy(input, projection)` with `pathProjection` —
  generalised Grothendieck fibration (β-3).
- `homeomorphism_verified` and `node_inspected` events — δ-1 and
  δ-2 each append a single event per CLI invocation so the
  temporal log replays the calibration timeline.
- `withLock(repoRoot, fn)` — advisory-lock wrapper for any
  command that mutates `.ontology/`.

### Spec-only (0.5.0 work)

- `docs/OPEN_PROMPT.md` — Phase ζ protocol spec. `onto sign` /
  `onto verify-published` / `onto replay` define the third trust
  posture between fully open-source and self-attestation. No code
  in this release; v0 lands in the 0.5.0 line.

### Known limitations (carried into 0.4.0-rc.1)

- Phase ε self-ingestion publishable measurement not yet shipped
  (gated on API credit). MATHEMATICAL_CLAIMS.md §3.10 stays T4.
- Cross-host lock breaking disabled. Manual `rm .ontology/.lock`
  required after confirming the foreign host is gone.
- Cost-estimate is an upper bound (±30% of reality).
- Open-world validation degrades unsatisfied requirements to
  warnings, not errors. Closed-world available with
  `--no-open-world`.
- Phase ζ commands (`sign`, `verify-published`, `replay`) are
  spec-only.

### What to read

- [`docs/LEGEND.md`](docs/LEGEND.md) — release note for the
  Project Legend cycle.
- [`docs/RELEASE_NOTES.md`](docs/RELEASE_NOTES.md) — running
  detail per PR / commit.
- [`docs/legend/calibrations/`](docs/legend/calibrations/) — the
  two empirical reports.

---

## [0.3.0-alpha.0] — 2026-05-11 (post-Bootstrap-0.9 baseline)

The seven axioms of the canon all running concrete code, with the
**plasticity layer** in place: `node update`, `node remove`,
`edge update`, `edge remove`, `--requires` / `--provides` /
`--forbids` / `--rules` on `node create`, validator-gated
`compile run`. Plus the four additive categorical extensions
(Yoneda query, effect monad, branch fibration, topos predicate
algebra) and the `:graph view` walker action.

Detail: [`docs/RELEASE_NOTES.md`](docs/RELEASE_NOTES.md) §"Bootstrap
0.9 — Categorical Extensions" through §"post-0.9: hardening sweep +
plasticity layer + Project Legend foundation".

---

## [0.2.0-alpha.1] — 2026-04-?? (Bootstrap 0.7 + 0.8)

PromptAST (`parsePromptAST` lifts `@requires:` / `@provides:` /
`@expand:` markers); Bootstrap 0.8 Hello World compiler (`onto
compile run` walks the topological plan and produces real artifacts
at `.ontology/artifacts/generated/`).

Tag exists in the repo (`v0.2.0-alpha.1`). Detail in
`docs/RELEASE_NOTES.md`.

---

*This changelog is the index. The running detail is in
`docs/RELEASE_NOTES.md`; the public-facing Project Legend write-up is
in `docs/LEGEND.md`.*
