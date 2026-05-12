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
| γ | γ-1 onto ingest core | not yet | — |
| γ | γ-2 static analysis edge inference (TS) | not yet | — |
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
prompts were never written. Phase γ may follow the same pattern or
return to the worktree-isolation convention — TBD when γ starts.

The `PHASE_BETA_3.md` prompt's brief had one stale assumption
(`outputs.files: { relativePath }[]`); the shipped implementation
adapted to the current `outputs.files: string[]` schema. See the β-3
commit message for the deviation note.
