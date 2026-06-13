# KERNEL_BEHAVIOURAL_LIFT_2026-06-13 — RESULT

> **Dated record.** Follow-on to
> [`ROUNDTRIP_BILATERAL_2026-06-12`](ROUNDTRIP_BILATERAL_2026-06-12_REPORT.md):
> lift the 19-node kernel-of-equivalence cohort from *structurally*
> regenerable (T2) toward *behaviourally* regenerable (T2) by generating
> a self-validated behavioural fixture per node via `onto probe`. Cost:
> **$0** (frontier cold-subagent generation; local self-validation).

## Result

**11 of 19 kernel nodes lifted to behavioural-T2**, carrying **119
self-validated behavioural cases** (each matched the real source under
the behaviour-checker at generation; a case that threw, timed out, was
non-deterministic, or asserted something false about the source was
dropped before persistence — honest by construction).

| Outcome | n | Nodes |
|---|---|---|
| **Lifted (fixture persisted)** | 11 | 0017(6) 0022(8) 0109(14) 0131(9) 0146(16) 0176(6) 0186(7) 0217(8) 0223(8) 0225(15) 0227(22) |
| Not characterizable (empty fixture) | 4 | 0009 (edge I/O), 0058 (CLI glue), 0156 (types-only), 0181 (walker action) |
| Excluded by category (pre-gen) | 4 | 0026 (hand-fixture collision), 0196 / 0202 (.tsx React), 0221 (cli.ts, contract-empty) |

The 11 fixtures live in `tests/behavior-fixtures/<nodeId>.fixture.ts`,
are registered in the smoke-test completeness guard, and **all pass the
identity check** (47/47 in `behavior-checker-smoke.test.ts`) — i.e. they
load the real source, run their cases, and agree. `tsc` is green over
all 11 frontier-written modules.

## What this changes

`onto regenerate <kernelNode> --behavior-check --write` now has a real
behavioural net for these 11 nodes: a regeneration that diverges from
the locked behaviour on any case — **including a structurally-identical
off-by-one** (jaccard 1.0, verdict `epsilon_equivalent`, which the
structural gate alone would write) — fails the check and blocks the
write. Demonstrated on node_0017 (`nodeCount + 1` regen: structure
allows, behaviour blocks).

## Honest scope

- **Self-validation proves consistency with the current source, not
  discriminating power.** A case characterizes "regen must match source
  here"; it does not prove the case would catch *every* bug class (no
  mutation testing). Kept cases are true statements about today's code;
  their bug-catching strength is unmeasured. v1 could add a mutation
  pass to score discrimination.
- **Local models cannot generate these.** A prior run with
  qwen2.5-coder:7b anchored on stale prose intent and self-validation
  refused all cases (wrote nothing). The frontier ceiling produced
  correct asserts — the same extraction-quality bottleneck the bilateral
  round-trip measured, now in probe generation.
- **Two id-spaces coexist in the fixtures dir.** The May-era hand
  fixtures use the calibration graph's node ids; these use the live
  2026-06-11 graph's. They share the `node_XXXX` namespace but key
  different source files (e.g. live node_0026 = `style.ts` vs registered
  May node_0026 = `poset.ts`). No collision occurred (node_0026 was
  excluded); recorded so a future graph re-population accounts for it.

## Artifacts

`.ontology.scratch-kernel-probe-2026-06-13/` (gitignored): per-node
prompts, frontier candidates, `coverage-report.json`. Drivers:
`onto probe` (`src/commands/probe.ts`) + the batch persist replicating
its post-dispatch self-validation.
