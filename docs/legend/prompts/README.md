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

| Phase | Stream | Status | File |
|---|---|---|---|
| β | β-1 multi-file compile + `--target` | unstaged | `PHASE_BETA_1.md` (not written) |
| β | β-2 `node.literal` escape hatch | unstaged | `PHASE_BETA_2.md` (not written) |
| β | β-3 path fibration helpers | **ready** | [`PHASE_BETA_3.md`](PHASE_BETA_3.md) |
| γ | γ-1 onto ingest core | not yet | — |
| γ | γ-2 static analysis edge inference (TS) | not yet | — |
| δ | δ-1 onto node inspect (Inspector / Lupa) | not yet | — |
| δ | δ-2 verify-homeomorphism + report | not yet | — |

When you launch a stream and the agent's output looks correct, mark its
status as `merged` in this README. When a stream blocks on a design
decision, mark it `paused` with a one-line note.

## Tonight (2026-05-11)

Plan: launch `PHASE_BETA_3.md` only. β-1 and β-2 stay unstaged until
β-3's output gives us a calibration data point on agent quality.
