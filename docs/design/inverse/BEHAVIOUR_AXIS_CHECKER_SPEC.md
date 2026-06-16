# Behaviour-axis checker — v0 specification

> *Design spec for the next-highest-value Phase ε checker. The
> cartography matrix in `verify-homeomorphism --matrix` currently
> fills only the `structural` axis across the 125-node perimeter;
> `behaviour` / `contract` / `intent` are `untested` /
> `not-measured` / `not-reviewed`. Per project memory
> `cartography-matrix-status`, **behaviour** is the highest-leverage
> next column to close because it is **orthogonal to AST grounding**
> and therefore immune to the §3.1 metric-circularity concern that
> complicated the Move 3α reading.*
>
> *This document is a SPEC, not an implementation. It exists so the
> next session can ship the v0 checker without re-deriving the design.
> No code lands with this PR.*

**Author:** automated, session 2026-05-24.
**Scope:** v0 only — a smoke runtime-equivalence check over the
compilable subset of the perimeter. Sufficient to lift the matrix from
**1 of 5** to **2 of 5** columns; not sufficient to claim full
behavioural fidelity.

> **Spelling note.** Prose in this spec (and the rest of the docs) uses
> British **`behaviour`** — the project convention. Code identifiers
> use American **`behavior`** to match what already shipped in
> `src/laws/matrix.ts`: `HONESTY_AXES` declares `behavior`
> and `MatrixCell.behavior` / `AxisHonesty.behavior` are American.
> When this spec names a code-level thing (CLI flag, type, function,
> matrix key, fixture directory) it uses the American form; in prose
> it uses British. An earlier draft was inconsistent — the false
> claim that `HONESTY_AXES` declares `behaviour` was a spelling drift,
> not a missing wiring. The axis is wired; it's spelled `behavior`.
**Companion docs:** `legend/calibrations/CALIBRATION_LOG.md` §1 for
the cartography history; `MATHEMATICAL_CLAIMS.md` §3.10 for the
adjoint claim that this checker contributes to lifting T4 → T2.

---

## 1. What it measures

For a node `N` with `outputs.files: ["foo.ts"]` and a regenerated
artefact `foo.ts.regen` from `verify-homeomorphism`, the behaviour
checker asks: **do these two artefacts compute the same function on
the same input?**

Operational form (v0): given a list of pre-registered call-sites
exercising the file's exported entry points, run each call-site
twice — once against the source artefact, once against the regen —
and compare the outputs.

| Outcome | Verdict |
|---|---|
| Both artefacts compile, all call-sites match | `pass` |
| Both artefacts compile, ≥ 1 call-site diverges | `fail` |
| At least one artefact fails to compile / load | `untested` |
| No registered call-sites for this node | `untested` |

The matrix axis `behavior` was already wired into the matrix
infrastructure (`src/laws/matrix.ts`); v0 just fills it with
real data instead of always reporting `untested`.

## 2. Why this, not contract / intent

Per `cartography-matrix-status`, three columns are open. Behaviour is
the right next column because:

- **Orthogonal to AST grounding.** The grounding intervention biases
  `structural` and `exportRecovery` (both measure declaration names);
  it does not bias whether the function *behaves the same*. A
  behaviour pass under grounding is a signal grounding doesn't
  manufacture, so it sidesteps the §3.1 circularity concern.
- **Mechanically cheap.** Reuses the existing `--runtime-check`
  infrastructure from `compile run` (`src/forward/compile/post/`); the
  hardest part is producing the call-site fixtures, not the runtime
  comparison.
- **Decisively diagnostic.** A `pass` / `fail` per node is binary and
  resists the "structural lift is partly mechanical" reading that
  haunts Move 3α. Either the regen does the same thing or it doesn't.

`contract` (pass-through of declared validators) and `intent` (human
review under three-valued Ω) are valuable but more expensive to
operationalise; defer to v1.

## 3. v0 design — minimum viable surface

### 3.1 Call-site fixtures

A new directory `tests/behavior-fixtures/` holds per-node call-site
manifests:

```
tests/behavior-fixtures/
  node_0001.fixture.ts   // exports: name + inputs + expected output OR oracle source
  node_0007.fixture.ts
  ...
```

Each fixture exports an array of cases:

```ts
export const cases: BehaviorCase[] = [
  {
    name: "writeArtifactPending — happy path",
    setup: () => ({ path: tmpPath(), content: "foo" }),
    invoke: (api, ctx) => api.writeArtifactPending(ctx),
    // Equality model: structural deep-equal on the returned value,
    // plus assertion on side-effect (file existence at staging path).
    assert: (result, ctx) => result.kind === "ok" && fs.existsSync(result.pendingPath),
  },
];
```

**Minimum coverage for v0**: a curated subset of ~20 nodes
(prioritise the high-Jaccard files from Arm A's report, since they're
most likely to compile cleanly under regen). NOT all 125 — v0's value
is the column, not the saturation.

> Postscript 2026-06-10: v0 landed and was later expanded —
> `tests/behavior-fixtures/` now holds 34 fixtures (the ~20 here was
> the pre-registered minimum, exceeded).

### 3.2 Runner — `verify-homeomorphism --behavior-check`

New flag on the existing CLI. Pseudocode:

```ts
for (const node of candidates) {
  const fixture = loadFixture(node.id);
  if (!fixture) { tagBehavior(node, "untested"); continue; }

  const srcMod   = await importIsolated(node.sourcePath);
  const regenMod = await importIsolated(regenPath(node));
  if (!srcMod.ok || !regenMod.ok) {
    tagBehavior(node, "untested");
    continue;
  }

  let allPass = true;
  for (const c of fixture.cases) {
    const ctxA = c.setup();
    const ctxB = c.setup();
    const ra = await safeInvoke(c.invoke, srcMod.api, ctxA);
    const rb = await safeInvoke(c.invoke, regenMod.api, ctxB);
    if (!c.assert(ra, ctxA) || !c.assert(rb, ctxB) || !deepEqual(ra, rb)) {
      allPass = false; break;
    }
  }
  tagBehavior(node, allPass ? "pass" : "fail");
}
```

`importIsolated` runs the artefact in a fresh `vm.Module` context with
a wall-clock + memory cap (same pattern as compile-side
`--runtime-check`). Stays in-process; no Docker.

### 3.3 Matrix axis wiring

`src/laws/matrix.ts:HONESTY_AXES` already declares
`behavior`. The checker just supplies values; the existing
`meanHonesty` computation folds them into the per-axis honesty
report. **One-line change** in `aggregateByAxis` to count
`pass` / `fail` / `untested` per arm.

Per-axis honesty formula (matches existing convention in the docs):
`behavior = pass→1, fail→0, untested→null` (excluded from mean).

## 4. Pre-registered v0 predictions (when shipped)

For Arm A (qwen-7b + grounding) over the v0 ~20-node subset:

| Metric | v0 prediction | Falsifier |
|---|---|---|
| Coverage (pass + fail) / total | **≥ 60 %** | < 40 % → too many regens fail to compile cleanly; v0 is non-diagnostic |
| Pass rate (pass / (pass + fail)) | **0.40 – 0.65** | > 0.80 → fixtures too lenient (likely missing edge cases); < 0.20 → grounding is structurally a hallucination factory (the structural Jaccard is misleading) |
| Behaviour-axis honesty mean | **0.40 – 0.65** | bounded by pass rate above |

The prediction is intentionally wide — v0 is a column-opening
experiment, not a precision measurement. A tight prediction here would
be over-claim.

Arm A0 (control without grounding) prediction: **pass rate within
±0.10 of Arm A**. This is the deciding test for the §3.1 follow-up:
if grounding lifts Jaccard 0.226 → 0.581 but behaviour pass rate is
flat, the publishable framing strengthens further — "grounding adds
names that survive textual comparison but does not change what the
code *does*". If the behaviour pass rate also lifts with grounding,
the intervention earns more credit than current Move 3α data shows.

## 5. What v0 does NOT measure

- **Generalisation.** The fixtures are curated, not generated; passing
  the fixture doesn't prove the regen handles inputs outside the
  fixture set. Honest v0 framing: "tested on registered cases."
- **Performance / complexity.** Two artefacts can be behaviourally
  equivalent and differ wildly in big-O. Out of scope.
- **Stateful interaction.** v0 fixtures should target pure-ish
  exports; stateful APIs (file system, network) are noisier and
  deferred to v1.
- **Per-line equivalence.** Behaviour is intentionally orthogonal to
  the structural axis; that's the point. Don't try to derive
  behaviour from structural metrics.

## 6. Implementation handles

| Module / file | Change |
|---|---|
| `src/laws/verify-homeomorphism.ts` | Add `BehaviourCheckResult` to per-node result shape; thread through `compareFiles`. |
| `src/surfaces/commands/verify/homeomorphism.ts` | Add `--behavior-check` flag; load fixtures from `tests/behavior-fixtures/`; invoke runner per candidate. |
| `src/laws/matrix.ts` | `aggregateByAxis` already counts `behavior`; ensure the new `pass` / `fail` / `untested` strings are accepted. |
| `tests/behavior-fixtures/` | New directory. v0 ships with ≥ 20 fixtures targeting Arm A's high-Jaccard cohort. |
| `tests/behavior-checker.test.ts` | New file. Tests: (a) fixture-less node → `untested`; (b) src + regen identity → `pass`; (c) deliberate behavioural divergence → `fail`; (d) compile failure on regen → `untested`. |

Estimated v0 effort: ~4–6 h (runner + matrix wiring + 20 fixtures +
tests).

## 7. Sequencing relative to Phase ε close

Per project memory `phase-e-close-status`:

- Recalibrate H1 against A0 in HYPOTHESIS doc (done 2026-05-24).
- **Behaviour-axis checker v0 ships** (this spec, future session).
- Arm C-cloud (`devstral-small-2:24b` on rented GPU).
- 5-arm synthesis (re-extend `scripts/run-3a-bakeoff-synthesis.ts` by
  one entry — same pattern as the 3 → 4 extension in `4697e4e`).
- Decide `MATHEMATICAL_CLAIMS.md` §3.10 T4 → T2 with the full matrix
  in hand. The §3.10 upgrade is **gated on at least 2 filled
  cartography columns** — see the recalibrated HYPOTHESIS decision
  tree.

Behaviour-axis v0 can ship before or after Arm C-cloud:

- **Before Arm C-cloud:** Arm C-cloud's report directly includes
  behaviour-axis data; the 5-arm synthesis is the publishable matrix.
- **After Arm C-cloud:** re-run the checker over all four (or five)
  arms' archived workspaces to backfill the column. Backfill is
  $0 because it's deterministic and runs against saved regens.

Either order works; backfill is the safer default if the next session
prefers to land the spend-bearing Arm C-cloud first.

---

*v0 spec. No code lands with this document. The intent is to make the
implementation work pickup-and-go for the next session by removing
all the up-front design questions.*
