# SYNC_LOOP_SPEC — the governed intent→code loop

**Status:** spec / pre-build (2026-06-14). Defines what "usable" means
for `onto sync` *before* any code is wired, so scope can't creep.
**Owner doc:** this is the acceptance contract for the sync-loop work.
Update it in the same change if the loop's behaviour changes.

## 1. Why this exists

Today the pieces of a closed intent→code loop exist but are *four loose
commands plus manual steps*: `regenerate`, the three verification gates,
`drift --update`, `ficha audit`. You can close the loop by hand, but it
doesn't feel like a tool, and you can't *see* or *understand* a single
sync in one place.

The goal is **one governed loop you can run, observe, and understand** —
not more model editing. After this lands we stop expanding and evaluate.

## 2. What "usable" means (the destination)

Three commands:

- **`onto sync <node>`** — edit a node's intent, run one command, the
  loop closes: regenerate → verify (all gates) → **write or refuse with
  the precise reason**, then re-anchor drift on success.
- **`onto sync <node> --explain`** — the loop *shows its reasoning*:
  the draws, the consensus, each gate's verdict, and why it wrote or
  refused. Human-readable + `--json`.
- **`onto status`** — read-only health of the graph at a glance: how
  many nodes are core (safely syncable), how many drifted, how many
  have fixtures, ficha-quality summary.

"Usable" = a person edits intent on a core node, runs `sync`, watches
verified code land (or watches it refuse and understands *why*), without
reading source code to follow the decision.

## 3. The loop, step by step (what `onto sync <node>` does)

This is a **thin orchestration** over primitives that already exist and
are tested. It does not introduce new verification logic.

1. **Load** the node from `.ontology/nodes/<node>.json`.
2. **Regenerate** with consensus on by default:
   `regenerate <node> --draws 3 --consensus 2`. Drafts are staged to
   `.ontology/verify/<node>.d{i}.txt` (existing behaviour).
3. **Gate** the consensus candidate through all three, gates ON by
   default (this is the key difference from raw `regenerate`):
   - **Structural** — `verify-homeomorphism`. Write-safe verdicts are
     `{epsilon_equivalent, divergent_loc}` (LoC may grow if structure
     holds); `divergent_structural`, `divergent_both`, `unrecoverable`
     block. Default thresholds: LoC 0.3, Jaccard 0.5 (overridable via
     `--loc-threshold`, `--jaccard-threshold`).
   - **Behavioural** — `behavior-checker`, if a fixture exists at
     `tests/behavior-fixtures/<node>.fixture.ts`. Verdict `pass`
     required; `fail` blocks; `untested` (no fixture) is allowed but
     **reported as reduced confidence**, never silently treated as pass.
   - **Rules** — `rule-checker` static checks (`FORBID`/`REQUIRE`
     symbol). Any `fail` blocks. `behavioural`/`prose`/`meta`/
     `unparseable` rules are reported, not enforced.
4. **Decide:**
   - **All applicable gates pass** → write the shadow (`--write`) and
     **re-anchor only this node's artifact path**, leaving every other
     node's drift status untouched. NB: `drift --update` rewrites the
     *whole-graph* snapshot and would silently re-anchor unrelated
     drifted nodes — so the loop needs a **path-scoped re-anchor**
     (new; see §4), not a bare `drift --update`.
   - **Any gate blocks** → write nothing, exit non-zero, report the
     single precise blocking reason (which gate, which verdict).
5. **Report** the decision (`--explain` expands it; see §5).

### Flag surface (inherited from `regenerate`, defaults flipped)

| Flag | Default in `sync` | Notes |
|---|---|---|
| `--draws` | 3 | consensus sampling |
| `--consensus` | `floor(N/2)+1` = 2 | agreement floor |
| behavioural gate | **on if fixture exists** | raw regenerate needs `--behavior-check` |
| rules gate | **on** | raw regenerate needs `--check-rules` |
| re-anchor | **on, post-write, path-scoped** | per-node, not whole-graph `drift --update` |
| `--explain` | off | §5 |
| `--json` | off | machine output |
| `--dry-run` | — | run gates, never write (alias for "show me, don't touch") |

## 4. What is genuinely NEW build vs wiring (honest scope)

| Piece | Build kind |
|---|---|
| `onto sync <node>` | **wiring** — orchestrate regenerate + gates |
| Path-scoped re-anchor | **NEW** — per-node drift re-anchor (whole-graph `drift --update` would mask others' drift) |
| `--explain` report | **wiring + small new** — render existing verdicts |
| `onto status` | **NEW** read-only command (aggregates ficha audit + drift + fixture coverage) |
| Core / "syncable" candidate scan | **NEW** read-only pre-flight (feeds `onto status`) |

Three NEW pieces. `onto status` and the candidate scan are read-only
compositions over existing primitives (no new verification semantics).
The path-scoped re-anchor is a small write primitive — it persists a
drift anchor for one node's paths without rewriting the whole snapshot.
None introduce new verification logic; the gates are untouched.

### Core-candidate criteria (what `onto status` counts as "safely syncable")

A node is **core / syncable-with-confidence** when:
- it has a code shadow (`outputs.files[0]` exists on disk), **and**
- it has a behaviour fixture (`tests/behavior-fixtures/<id>.fixture.ts`
  is present), **and**
- it has no statically-decidable declared-rule violation against its
  current source.

This is a **presence-based** estimate, computed read-only and fast:
`onto status` does *not* execute fixture code (a health check must not
run arbitrary source). The fixture's actual green-against-source is
confirmed at **sync time** by the behaviour gate — so "core" means
"structurally ready to sync with a behavioural net," not "fixture
proven green right now."

Tiers `onto status` reports:
- **core** — the three conditions above.
- **lower confidence** — has a shadow + clean rules but *no* fixture
  (syncable, but no behavioural safety net). Counted separately, never
  folded into core.
- **blocked** — has a shadow but a static rule violation to resolve
  first.
- **no-shadow** — no `outputs.files[0]` on disk; not syncable.

## 5. `--explain` output contract

Must surface, in order, without the reader opening source:

1. The N draws and which reached consensus (K of N).
2. Structural verdict + the LoC / Jaccard distances behind it.
3. Behavioural: `pass` / `fail` / `untested`, with case counts.
4. Rules: per-rule class + verdict; which (if any) blocked.
5. **The decision line**: `WROTE <file>` or
   `REFUSED — <gate>: <verdict>`.

`--json` emits the same as a structured object (one decision record).

## 6. Acceptance criteria (Step 5 measures these)

Run on a hand-picked set of core nodes (must include **node_0225**,
which has a 15-case fixture). Backup the graph first.

- **AC1 — closes in one command.** `onto sync node_0225` runs the whole
  loop (regen → 3 gates → write/refuse → re-anchor) with no manual step.
- **AC2 — refuses honestly.** Editing a node's intent to something the
  gates must reject produces a write-nothing refusal naming the gate and
  verdict — verified by inspecting that no shadow changed.
- **AC3 — explains.** `--explain` output lets a reader reconstruct the
  decision without reading code (checked by a human read-through).
- **AC4 — status is true.** `onto status` core/drift/fixture counts
  match what the underlying commands (`ficha audit`, `drift`, fixture
  presence) report independently.
- **AC5 — the honest number.** Report **what fraction of the tested
  core set syncs clean** on an unchanged intent (the round-trip floor).
  This is a *measurement*, not a target to hit — record it as-is, even
  if low. Tier it (T1/T2) per `MATHEMATICAL_CLAIMS.md`.

**Success = AC1–AC4 pass and AC5 produces an honest, recorded number.**
A low clean-sync rate is a *finding*, not a failure of the loop.

## 7. Out of scope (the checkpoint after this)

Explicitly NOT in this work — they are the post-checkpoint decision:
- Raising the core set (better fichas/fixtures to make more nodes sync).
- The dynamic loop (agents driving sync).
- Any further intent/model editing.

After this lands: stop, use it, evaluate whether it's worth continuing.

## 8. Acceptance run — 2026-06-14 (dated record, do not rewrite)

First end-to-end acceptance of the loop. Tier **T2** (operational: real
local model, real nodes, real gates; not a categorical-law claim).
Reproduce with `scripts/sync-acceptance.mjs` (dry-run only — no writes).

**Setup.** 6 hand-picked core nodes spanning shadow sizes (3 → 292 LoC),
incl. the fixture-rich `node_0225`. Model `qwen2.5-coder:7b` on the 8 GB
Mac (local, $0). Measured the round-trip floor F∘G on UNCHANGED intent —
"would `sync` write clean?" — under two postures.

**The honest number: 1/6 ≈ 17% clean — and it is robust to draw count.**

| posture | clean | result file |
|---|---|---|
| 3-draw consensus (the `sync` default) | 1/6 (17%) | `outputs/sync-acceptance.json` |
| single draw (`--draws 1`) | 1/6 (17%) | `outputs/sync-acceptance-draws1.json` |

**What the confirmation run REFUTED.** After the 3-draw run, an earlier
read of this data claimed "consensus is the bottleneck; F itself is fine
(~56% of individual draws were write-safe)." The `--draws 1` run refutes
that: a single draw also lands at 1/6, and the per-node verdicts are
**highly unstable across runs** — e.g. `node_0029` produced 3 write-safe
drafts in the 3-draw run but a `divergent_structural` draft when drawn
once; even `node_0011` (clean both times) shifted `epsilon_equivalent` →
`divergent_loc`. The "56%" was sampling noise from one lucky draw set,
not a stable property. Honest correction: **7B-local F is both low-yield
AND high-variance on these nodes; consensus cannot help because there is
little stable structure to agree on.**

**What held up.**
- Only `node_0011` (errors.ts, 15 LoC — small, self-contained)
  regenerates cleanly and repeatably.
- The **behaviour gate earns its place**: `node_0017` and `node_0022`
  drew structurally write-safe (`divergent_loc`) regens that the fixture
  caught as `fail` — structural equivalence alone would have written a
  behavioural regression.
- Cost is real: ~39 min wall-clock for the 6-node 3-draw run on 8 GB.

**Caveat.** n = 6 is small; 17% is indicative, not precise. Compare the
single-draw bilateral prior (~40%, 19/48, [[project_roundtrip_bilateral_result]]):
that measured *any* structure-preserving draw on a different/larger node
set; this measures clean-through-all-gates on a small core sample, so
the two are not directly comparable — but both point at "a minority of
the core round-trips cleanly through local F today."

**For the checkpoint.** The lever to raise this number is model quality
and/or ficha determinacy (does the ficha pin enough structure to make
draws agree), NOT the consensus knob. A frontier-model arm on the same
6 nodes is the cheapest next measurement.

## 8.1 Determinacy probe — 2026-06-14/15 (dated; honest null)

Tested the "ficha determinacy" lever from §8 before reaching for a
frontier model. Tier **T2** (operational, same setup as §8).

**Diagnosis (real).** 76 of 221 code nodes (34%) **over-declare**: their
`provides` list keys the source does NOT export — imported helpers or
private symbols the 3B extractor mislabelled (e.g. `node_0029` lists
`ensureDir, writeJson, readState, writeState`, all imports). This makes
compile-back drafts each invent their own local definitions of those
symbols → drafts disagree on the module surface → consensus never forms.
This is a deterministic, $0-detectable defect (the AST knows the real
export surface). Shipped the fix: `onto ficha cleanup --prune` (the dual
of contract completion) + `ficha audit` now measures over-declaration.

**Single-node confirmation (positive).** Reconciling `node_0029`'s ficha
(prune 4 phantom provides + real TS signatures) moved it from consensus
1/3 (clusters [1,1,1], all draws disagree) to 3/3 (clusters [3]).
Provides-prune ALONE (prompt.raw untouched) also crossed the floor (2/3).
The lever is real on the nodes it touches.

**Aggregate re-measurement (NULL).** Applied `--prune` to the 6-node core
sample and re-ran acceptance: **1/6 → 1/6. The number did not move.**
Why, honestly:
- Only **2 of the 6** nodes had phantom provides (0026, 0029); the other
  four fail for unrelated reasons (LoC variance, behaviour, signature
  notation), so prune cannot touch them.
- Both pruned nodes sit **exactly at the consensus floor** (2/3). Across
  isolated re-runs each reaches consensus, but run-to-run **variance flips
  them above/below** the floor. The batch caught 0026 on a transient
  Ollama error and 0029 on a low sample; even `node_0022` (no phantom,
  prune = no-op) drifted 1/3 → 0/3 by pure chance.

**Conclusion.** At 7B-local with n=3 draws, **run-to-run variance (±1-2
nodes) exceeds the effect size of the determinacy fix** — you cannot
detect a 1-2-node improvement against that noise on a 6-node sample. The
prune is correct and makes fichas honest (an import is not something the
module *provides*), and it plausibly helps under a stronger model, but on
7B-local it does not move the headline number. This **reinforces** §8:
the dominant phenomenon is variance, so the next real lever is a
**less-variable / stronger model**, not more determinacy edits. Order:
model first, determinacy second. The `--prune` tool shipped; the live
graph was NOT mutated (the 6 experiment nodes were restored).
