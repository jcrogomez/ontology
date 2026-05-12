# Legend prompts

Self-contained agent prompts for the Project Legend implementation phases.
Each file is a complete brief that an agent can execute autonomously inside
a worktree without needing the surrounding conversation context.

## How to launch one

From your Claude Code session at the repo root:

```
Agent({
  description: "<short label>",
  subagent_type: "general-purpose",
  isolation: "worktree",
  prompt: <paste the content of the file here>,
})
```

The `isolation: "worktree"` flag creates a fresh git worktree on a new
branch so the agent's edits are physically isolated from your local
`main`. When the agent reports completion, you review the diff on its
branch and merge (or discard) at your leisure.

## Conventions every prompt in this directory follows

- **Bounded scope.** Each prompt lists the files it may touch and the
  files it must not touch.
- **Quality gates.** `tsc --noEmit` clean + the targeted test file green
  + full vitest suite green are non-negotiable.
- **Stop conditions.** Each prompt names the failure modes that should
  cause the agent to stop and report rather than push through.
- **Do not push.** Branches stay local for human review. The agent's
  job is to land a clean commit on a feature branch; merging is yours.
- **Report shape.** One paragraph at the end: what landed, test counts,
  any deviation from the brief and why.

## Current phase plan

| Phase | Stream | Status | File / Commit |
|---|---|---|---|
| β | β-1 multi-file compile + `--target` | **merged** (`a09e1d7`) | prompt not written — implemented directly on 2026-05-11 |
| β | β-2 `node.literal` escape hatch | **merged** (`04f730c`) | prompt not written — implemented directly on 2026-05-11 |
| β | β-3 path fibration helpers | **merged** (`881506a`) | [`PHASE_BETA_3.md`](PHASE_BETA_3.md) |
| — | post-β review blockers (atomic write, clobber gate, binary guard) | **merged** (`157d367`) | drove off the 2026-05-12 milestone review §4.1, §4.2, §4.6 |
| — | β-2 calibration on `hash.ts` (qwen2.5-coder:3b) | **done 2026-05-11** | 3/5 ε-equivalent; informed γ-0 (frontier provider) and γ-3 (rich payload) |
| — | two-phase commit safety property | **merged** (`2cbaa32`) | drove off the β-2 calibration §0 — failed validator must not clobber `--target` |
| γ | γ-0 Anthropic provider with prompt caching | **merged** (`aad0fed`) | implemented directly — system prompt `cache_control: ephemeral`, default model `claude-opus-4-7` |
| γ | γ-1 `onto ingest <file>` v0+ | **merged** (`b670ca3`) | implemented directly — single-file extraction with `--dry-run` |
| γ | γ-3 rich proposal payload | **merged** (`7d50c91`) | implemented directly — schema extension so apply produces complete node in one step |
| γ | γ-2 calibration on `hash.ts` (claude-opus-4-7) | **done 2026-05-12** | 5/5 ε-equivalent; full report [`docs/legend/calibrations/HASH_TS_2026-05-12.md`](../calibrations/HASH_TS_2026-05-12.md) |
| γ | γ-4 static analysis edge inference (TS) | **merged** (`62d8c86`) | implemented directly — TS compiler API, `inferEdgesFromDirectory()` + `onto graph infer-edges <dir>` preview |
| γ | γ-5 `onto ingest <directory>` multi-file | **merged** (`a25ade9`) | implemented directly — per-file dispatch over `collectSourceFiles`; stores source path in `outputs.files[0]` for γ-6 |
| γ | γ-6 `infer-edges --create-proposals` | **merged** (`9c16b9d`) | implemented directly — idempotent edge proposals against applied nodes; skips `from_node_missing` / `to_node_missing` / `cross_branch` / `edge_already_exists` |
| — | walker AI provider status indicator | **merged** (`69424af`) | `detectAiProvider(env)` discriminated union; bar rendered above the focal cell |
| — | `--include` flag + Vibe-Reasoning runbook | **merged** (`bc350ce`) | per-extension ingest list; calibration runbook at [`../calibrations/VIBE_REASONING_PROCEDURE.md`](../calibrations/VIBE_REASONING_PROCEDURE.md) |
| δ | δ-1 onto node inspect (Inspector / Lupa) | not yet | — |
| δ | δ-2 verify-homeomorphism + report | not yet | — |

When you launch a stream and the agent's output looks correct, mark its
status as `merged` in this README. When a stream blocks on a design
decision, mark it `paused` with a one-line note.

## Notes on the β phase

The original plan was to launch β-3 alone as a calibration data point,
then write `PHASE_BETA_1.md` / `PHASE_BETA_2.md` once the agent-quality
signal was known. In practice all three β phases landed in one night
implemented directly (no isolated agent for β-1 / β-2), so those two
prompts were never written.

The `PHASE_BETA_3.md` prompt's brief had one stale assumption
(`outputs.files: { relativePath }[]`); the shipped implementation
adapted to the current `outputs.files: string[]` schema. See the β-3
commit message for the deviation note.

## Notes on the γ phase

γ-0 / γ-1 / γ-3 also shipped directly without prompt files, because
the work was small enough to stay in the main session. The γ-2
calibration on `hash.ts` is documented in detail at
[`docs/legend/calibrations/HASH_TS_2026-05-12.md`](../calibrations/HASH_TS_2026-05-12.md).
The headline data point: with `claude-opus-4-7` as both extractor and
compiler, every function of `src/core/integrity/hash.ts` survives the
round-trip semantically equivalent (5/5), vs 3/5 with the smaller
`qwen2.5-coder:3b` baseline. The cost is ~$0.08 per single-file
round-trip; latency ~70s.

γ-4 (static-edge inference), γ-5 (multi-file ingest), and γ-6
(edge_create proposals) all shipped directly on 2026-05-12 — each was
small enough to keep in the main session. The walker AI provider
indicator (`69424af`) and the `--include` flag + Vibe-Reasoning runbook
(`bc350ce`) followed the same direct-implementation path.

The remaining Project Legend streams are Phase δ (Inspector +
verify-homeomorphism) and Phase ε (self-ingestion). δ-1 and δ-2 are the
next candidates for written prompt briefs since they touch new surface
area (node-schema field for the cached translator, a verification
command with structured JSON output) rather than incremental additions
to existing pipelines.
