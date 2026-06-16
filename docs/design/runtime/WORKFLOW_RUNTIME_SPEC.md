# Workflow runtime — v0 specification (Phase ζ)

> *Design spec for an Ontology-native workflow runtime: a small state-
> machine executor that walks a graph of typed nodes, evaluates
> branching conditions against structured verifier output, and folds
> into an accept / reject terminal. The motivating use case is the
> verify-refine pattern from Huang & Yang 2025 (arXiv:2507.15855v4)
> for IMO 2025 — but the design is intentionally generic: any
> generate → verify → branch → loop pattern with a stopping criterion
> fits.*
>
> *This document is a SPEC, not an implementation. It exists so the
> next session can ship the v0 runtime without re-deriving the design.
> No code lands with this document.*

**Author:** automated, session 2026-05-26.
**Scope:** v0 only — a single-graph executor with the smallest set of
new node-kinds + edge-types + commands that demonstrates the pattern.
Sufficient to run the IMO verify-refine flow end-to-end on a small
input set; not sufficient to claim a general-purpose orchestration
runtime (no parallel branches, no human-in-the-loop, no persistence
beyond the trace file).

**Companion docs:**
- `MATHEMATICAL_CLAIMS.md` §3.10 (Phase ζ named as the Path to T1 for
  the compile adjoint via verdict-map determinism). The workflow
  runtime shares the Phase ζ label but is *scope-parallel*, not
  sequenced — both can ship under Phase ζ without one blocking the
  other.
- `docs/legend/calibrations/CALIBRATION_LOG.md` (where the eventual
  v0 run report lands).
- The behaviour-axis checker v0 spec
  (`BEHAVIOUR_AXIS_CHECKER_SPEC.md`) is the structural precedent for
  this doc — same pickup-and-go discipline.

> **Naming note.** Code identifiers use the workflow vocabulary
> (`generator`, `verifier`, `terminal`, `branches_on`) directly; the
> prose uses the same terms in italics where it helps. The Spanish
> chat that prompted this spec used "verificador", "generador",
> "terminal" — same nouns translated.

---

## 1. What it executes

Given:
1. A **workflow graph** — a directed graph whose nodes are typed
   ontology nodes with one of three new `kind` labels (`generator`,
   `verifier`, `terminal`) and whose edges carry either a plain
   `feeds` relation or a conditional `branches_on(predicate)`
   relation.
2. An **initial input** — a string or structured payload that becomes
   the input of the workflow's entry node.
3. A **step budget** — the maximum number of node visits (default
   100; hard cap on infinite loops).

…the runtime returns:
- A **terminal verdict** — `accept` (with the accumulated output) or
  `reject` (with the reason).
- A **trace** — the ordered list of node visits with their inputs,
  outputs, and (for verifiers) structured verdicts. JSON-serialisable.

The verify-refine motif from the README image (Huang & Yang 2025
Figure 1) is the canonical example: *generate → improve → verify →
{loop back through correction OR accept after 5 consecutive passes OR
reject after 10 consecutive major-issue steps}*.

## 2. Why this, not the existing compile-plan

The existing `compile-plan` shipped at γ-2 (`src/kernel/graph/compile-plan.ts`)
walks a DAG in topological order and dispatches each node exactly
once. That's the right primitive for "compile this graph of code
nodes into artifacts." It is not the right primitive for verify-refine
because:

- **Loops are illegal in a DAG.** The IMO flow loops Step 5 → Step 3
  unboundedly until the stopping criterion fires.
- **Branches are unconditional in compile-plan.** All outgoing edges
  fire when the source completes. Workflow branches need to evaluate
  a predicate on the source's output and fire exactly one edge.
- **No state across visits.** Counters like "5 consecutive passes"
  require state that survives between visits to the same node.
- **No structured verifier output.** Compile-plan nodes produce
  free-form text artefacts; workflow verifiers must emit a Zod-
  validated verdict so branch predicates can read it.

The workflow runtime is a sibling of `compile-plan`, not a
replacement. The two share the underlying node + edge schemas and the
LLM dispatcher; they differ in execution semantics.

## 3. v0 design — minimum viable surface

### 3.1 New node kinds

Each node carries a new `coordinates.kind` field with one of:

| Kind | Inputs | Output | Outgoing edges |
|---|---|---|---|
| `generator` | text (from previous node's output) | text (free-form, fed to next node) | exactly one `feeds` |
| `verifier` | text (the artefact under review) | structured verdict (Zod-validated against the verifier's declared output schema) | one or more `branches_on` |
| `terminal` | text (the final artefact OR the rejection reason) | none — the runtime stops here | none |

The `kind` field is additive: existing `code` / `prose` /
`structured-data` nodes continue to work for compile-plan dispatches.
Workflow execution ignores nodes whose `kind` is none of the three
above (or rejects the workflow if a non-workflow node sits on a
reachable path — surface as a CLI error so misconfiguration fails
fast).

### 3.2 New edge type: `branches_on`

A `branches_on` edge carries an inline **predicate expression**
evaluated against the source verifier's structured verdict and the
running trace. v0 supports a tiny expression language (string DSL,
not a full lambda language):

| Form | Example | Meaning |
|---|---|---|
| `verdict == "X"` | `verdict == "pass"` | source's latest verdict matches `X` |
| `severity == "X"` | `severity == "major"` | source's latest severity field matches `X` |
| `consecutive(<pred>, <n>)` | `consecutive(verdict == "pass", 5)` | the source has emitted `pred`-true verdicts on its last `n` visits |
| `since_last(<pred>) >= <n>` | `since_last(verdict == "pass") >= 10` | source has been non-pass on its last `n` visits |
| `step_count >= <n>` | `step_count >= 100` | total node visits across the workflow has hit `n` |

Predicates compose via `&&` and `||`. Parsing is a hand-written
recursive descent (no need for a parser generator at v0 — the grammar
is small and stable).

**Edge resolution rule.** When a verifier completes, the runtime
evaluates outgoing `branches_on` predicates in **edge-declaration
order** (the order edges appear in the graph file). The first match
fires. If none match, the workflow rejects with reason
`no_matching_branch`. To keep that from being a silent stall, the
graph loader runs a **static branch-coverage lint**: for each verifier
it enumerates the verdict points its schema can emit
(`verifierSchemaPoints`) and checks each is matched by at least one
outgoing predicate (`predicateCanMatchPoint`, which treats
history/step operators optimistically). Uncovered points surface as
non-fatal `LoadedGraph.warnings` (printed by `onto workflow run`,
included in `--json`) — loud, but not blocking, since a graph may
legitimately never emit some points in practice.

### 3.3 Verifier output schema

Each verifier declares its output schema via a new node field
`coordinates.verifierSchema`, one of:

- `"simple-pass-fail"` — `{verdict: "pass" | "fail", reason?: string}`
- `"with-severity"` — `{verdict: "pass" | "fail", severity?: "minor" | "major", issues?: string[]}`. `severity` is optional (meaningful only on a `fail`) and `issues` defaults to `[]`, so a bare `{"verdict":"pass"}` is valid — a strict schema here silently flipped clean passes to `fail/major` via the parse-retry fallback (§4.2).
- A user-defined Zod schema named in a registry (deferred to v1)

The schema is *load-bearing* for the predicate expression — a
predicate that references a field absent from the schema is a graph-
validation error caught at workflow load time, not a runtime
exception.

The LLM dispatch for a verifier wraps the model output in a parser
that:
1. Tries to parse the response as JSON matching the schema.
2. On parse failure, retries with a "your last response did not match
   this schema, here it is again: ..." follow-up (one retry only).
3. On retry failure, treats the verifier as having emitted
   `verdict: "fail", reason: "schema_parse_failed"` so the workflow
   has a defined branch to take rather than crashing.

### 3.4 Runtime semantics

Pseudocode for the executor (`src/runtime/workflow/run.ts` — name TBD):

```ts
type State = {
  trace: Visit[];           // ordered history of node visits
  perNode: Map<NodeId, Visit[]>; // per-node sub-trace, for consecutive() predicates
  stepCount: number;
};

async function runWorkflow(graph, initialInput, options): Result {
  let current = graph.entryNode;
  let input = initialInput;
  const state: State = { trace: [], perNode: new Map(), stepCount: 0 };

  while (state.stepCount < options.maxSteps) {
    const visit = await visitNode(current, input, state);
    state.trace.push(visit);
    appendToPerNode(state.perNode, current.id, visit);
    state.stepCount += 1;

    if (current.kind === "terminal") {
      return { verdict: current.terminalVerdict, output: input, trace: state.trace };
    }

    const next = pickNextEdge(current, visit, state);
    if (!next) {
      return { verdict: "reject", reason: "no_matching_branch", trace: state.trace };
    }
    current = next.target;
    input = visit.output;
  }
  return { verdict: "reject", reason: "step_budget_exhausted", trace: state.trace };
}
```

The `visitNode` helper dispatches the node's prompt against the LLM
(reusing `runtime/llm/dispatcher.ts` so the workflow is **model-
agnostic** by construction: any provider already registered in the
dispatcher works). For `generator` nodes the output is the raw
response text; for `verifier` nodes the output is the Zod-validated
verdict object; for `terminal` nodes no LLM call is made — the node
just emits its accept/reject label.

### 3.4.1 Dataflow: artefact slot + prompt variables

The pseudocode above threads a single `input` (the predecessor's
output). That is not enough for a verify-refine loop: the corrector
needs the *solution* it must fix, and the verifier must re-check the
*solution* — not its own just-emitted verdict. So the executor threads
three values and exposes each to a node's prompt via a template
variable:

| Variable | Resolves to | Updated by |
|---|---|---|
| `${INPUT}` | the immediate predecessor's output | every visit |
| `${ARTIFACT}` | the evolving work product (the solution under refinement) | a generator's output, unless the node is `passThrough` or sets `emitsArtifact: false` |
| `${CRITIQUE}` | the most recent verifier's verbatim output | every verifier visit |

Rules:

- **Verifiers read `${ARTIFACT}`**, never the previous verdict. This
  is what lets the pass-loop re-verify the SAME solution and lets a
  corrector see the solution it must fix.
- **`emitsArtifact: false`** marks a generator whose output is an
  intermediate scratch product (e.g. a bug report) — it is forwarded
  as `${INPUT}` to the next node but does NOT replace `${ARTIFACT}`.
- **Pass-through nodes** (`passThrough: true`) never touch the
  artefact; they exist only to loop a branch back.
- A prompt that references **no** `${…}` variable falls back to legacy
  composition: the predecessor's output is appended under an `INPUT:`
  heading. Existing single-pass graphs keep working unchanged.
- The workflow **result `output`** is the final artefact (the accepted
  or last-refined solution), not the text on the edge into the
  terminal.

This subsumes the v0 "pass-through hack": the artefact is preserved by
the slot, so a pass-through node carries no state — it is just a
loop-back target. The earlier `output: input` in the pseudocode is
therefore `output: artefact` in the implementation.

> **Note (2026-06-09, commit `ba66010`, PR #140).** When the graph's
> `artefactLanguage` is a code language, the final artefact is
> FENCE-STRIPPED via `projectWorkflowArtefact`
> (`src/surfaces/commands/workflow/run.ts`) before BOTH the §3.6 contract
> measurement and the proposal payload — the same projection
> `compile-node` applies before writing artifacts (compiler parity).
> Without it, a fenced-but-correct artefact measures as an EMPTY
> contract. Bug caught in the first real-LLM verify-refine run.

### 3.5 CLI command

```
onto workflow run <graph-file> --input <input-file> [options]
```

Options:
- `--max-steps <n>` (default 100, hard cap; the workflow rejects if
  hit).
- `--trace <path>` (default: stdout when `--json`, else suppressed).
  Writes the JSON trace.
- `--provider <p>` / `--model <m>` — global overrides for every
  LLM dispatch in the workflow. Per-node overrides via the node's
  `model.ref` field still apply unless this flag is set.
- `--ollama-host <h>` — same as compile run.
- `--dry-run` — load + validate the graph and the input; report
  what would run; do not dispatch. Useful for testing graphs before
  paying for tokens.
- `--seed <n>` — passed to the dispatcher for providers that respect
  it (Ollama); supports reproducible verifier replay.

Output (human mode): a short summary of `{verdict, stepCount,
durationMs}` plus the trace path. Output (`--json`): the full Result
record above.

### 3.6 Closing the loop — proposing back into the intent graph (v0.1)

> *Added 2026-06-09 (post-v0; O3/O4 of `CONTEXT_GLUING_REGIMES.md`
> shipped the create half on 2026-06-09, this section adds the
> update/reconnect half). The workflow runtime is otherwise standalone;
> everything in this section requires an initialised `.ontology/`
> project and is opt-in via `--as-proposal`.*

An ACCEPTED workflow run can propose mutations of the intention graph.
Nothing here mutates directly: every path goes through the existing
proposal substrate (`pending` → human-gated `onto proposal apply`).
`--as-proposal` is incompatible with `--dry-run` (a dry run produces
placeholder output, which must never enter the proposal sequence).

**Mode 1 — grow (`node_create`, O3/O4, shipped).** The final artefact
becomes a pending `node_create` proposal under `--proposal-parent`
(default: root), with `--proposal-level/--proposal-kind` required. When
the graph declares an output contract (top-level `provides:
[{key, signature?}]`) and `artefactLanguage` is code, the artefact is
measured (G) against the declaration and the proposed node is born with
the measured `provides` + `provideSignatures` (declared ≠ produced is
surfaced as a defect note, not a block).

> **Note (2026-06-09, commit `ba66010`, PR #140).** For code
> `artefactLanguage`, the artefact is fence-stripped via
> `projectWorkflowArtefact` (`src/surfaces/commands/workflow/run.ts`) before
> BOTH the contract measurement above and the proposal payload (both
> modes) — compiler parity. A markdown-fenced artefact would otherwise
> measure as an empty contract and the proposed node's prompt would
> carry LLM packaging instead of the work product. Found in the first
> real-LLM run.

**Mode 2 — refine (`node_update`, this section).** With
`--update-node <nodeId>` instead of level/kind/parent, the artefact
becomes a pending **`node_update`** proposal against the EXISTING node:
the artefact replaces `prompt`, and the resolved output contract
(measured-or-declared, same rule as mode 1) replaces
`provides`/`provideSignatures`. The proposal pins the target node's
hash at creation time (`nodeHash`) and apply stales it on divergence —
the same dual-snapshot discipline as `edge_create`/`node_update_parent`.
This is the verify-refine loop pointed at its natural target: a node's
prompt refined by a workflow and proposed back onto the same node.

**Edges — reconnect (`proposesEdges`).** A workflow graph may declare,
top-level:

```json
"proposesEdges": [
  { "type": "depends_on", "target": "node_0042", "direction": "out" }
]
```

Each entry proposes one typed edge between the **focal node** (the node
being updated, or the created node in mode 1) and `target`.
`direction: "out"` (default) reads focal → target; `"in"` reads
target → focal. Semantics by mode:

- **Update mode:** both endpoints exist, so one `edge_create` proposal
  per entry is created alongside the `node_update` proposal.
  **Apply-order matters:** apply the edge proposals FIRST, then the
  `node_update` — the update rewrites the focal node's hash, which
  stales any still-pending edge proposal pinned to the old hash (the
  conservative direction: a stale edge proposal is re-proposable, a
  silently mis-pinned one is not). The CLI prints the proposals in the
  recommended apply order.
- **Create mode:** the focal id does not exist until apply, so
  declared edges are NOT proposed in-run; the CLI surfaces them as a
  deferred note. Closing this (a post-apply `--resolve-edges`
  analogue of ingest γ-6) is future work, recorded in ROADMAP.

CLI additions to §3.5:

- `--update-node <nodeId>` — switch `--as-proposal` to mode 2.
  Mutually exclusive with `--proposal-level/--proposal-kind/
  --proposal-parent`.
- Edge declarations ride on the graph file, not flags — the workflow
  *author* states what the output relates to; the runner only decides
  whether to propose.

**Provenance — the workflow run record.** Every `--as-proposal` run
persists a **workflow run record** (`.ontology/runs/wfrun_<8hex>.json`,
`WorkflowRunRecordSchema`) BEFORE creating proposals, and every proposal
born from the run (node and edges alike) carries a non-null `source` of
the new `workflow_run` shape: `{kind, workflowRunId, graphHash,
inputHash, provider, model}`. The record holds what a single-dispatch
`(runId, promptHash)` source cannot — graph identity (hash of the graph
file text), input identity, CLI-level model overrides (null = per-node
routing), the accept verdict, and the per-step trace summary
(node/kind/duration/verdict). Identity is deliberately NOT
content-addressed: workflow executions are not deterministic functions
of `(input, model)`, so ids are random and there is no same-id caching;
the body hash still self-certifies the record
(recompute-and-compare, `verifyWorkflowRunRecord`). The `run_` prefix
filter in `onto runs list` keeps the two id spaces from colliding.

## 4. Pre-registered v0 predictions (when shipped)

The v0 runtime is a small piece of code; v0 success is mostly
about whether the *graph design* is expressive enough. Predictions:

| Metric | v0 prediction | Falsifier |
|---|---|---|
| IMO verify-refine graph terminates on every input | ≥ 95 % terminate within `max_steps = 100` | < 90 % → the consecutive-pass / consecutive-major-issue thresholds are tuned wrong, OR the predicate DSL is too restrictive |
| Average trace length on solvable inputs | 8–30 visits | > 50 → the verifier is too strict; < 5 → the verifier is too lenient |
| Schema parse failure rate on verifier dispatches | < 5 % with one retry | ≥ 15 % → either the verifier prompts are unclear or the retry policy is insufficient |
| Cost per workflow run | depends on provider; for `claude-opus-4-7` and the IMO graph, ~$0.50–$2 per problem | reported, not falsified |

The first time the runtime sees an input that *should* be solvable
and rejects with `step_budget_exhausted`, that's a real signal — the
graph design needs revisiting. Report this prominently.

## 5. What v0 does NOT cover

- **Parallel branches.** v0 picks one branch per verifier. A `fan_out`
  edge type that runs multiple branches and joins later is v1.
- **Persistence across runs.** Each invocation is a fresh execution.
  Resumable workflows (checkpoint to disk, resume on next invoke) are
  v1.
- **Human-in-the-loop.** v0 has no "pause and ask the user"
  primitive. The terminal kinds are accept/reject; a third
  `needs_human` terminal is v1.
- **Workflow editing UI.** Graphs are JSON files for v0. A visual
  editor reusing the eventual `open` (TUI) infrastructure is v1+.
- **Cross-workflow composition.** A workflow cannot invoke another
  workflow as a sub-node. v1.
- **Cost guards.** v0 has `--max-steps`; it does not have a USD-cost
  guard. Add one in v1 by extending the existing `cost-estimate`
  preflight pattern from `verify-homeomorphism`.
- **Workflow-aware Phase ε measurement.** The cartography matrix's
  "do F ∘ G ≈ id" claim is about single-node round-trips. Whether the
  same notion lifts to workflows is a Phase η question, not v0.

## 6. Implementation handles

| Module / file | Change |
|---|---|
| `src/kernel/schemas/ontology.ts` | Extend `OntologyNode.coordinates` with optional `kind: "generator" \| "verifier" \| "terminal"` and optional `verifierSchema: string`. Extend `EdgeTypeSchema` with `"feeds"` and `"branches_on"` variants. The `branches_on` shape carries a `predicate: string` field; introduce `OntologyEdgeBranchesOnSchema` as a discriminated variant. |
| `src/runtime/workflow/` | New directory. `predicate-parser.ts` (the recursive-descent DSL parser), `verifier-schemas.ts` (the registry of pre-declared verifier output shapes), `executor.ts` (the `runWorkflow` loop above), `graph-load.ts` (load + structural-validate a workflow graph from JSON). |
| `src/surfaces/commands/workflow/run.ts` | New CLI command implementing the surface from §3.5. |
| `src/cli.ts` | Register `program.command("workflow run [graph]")`. |
| `examples/workflow-imo-verify-refine/` | New example. Carries the IMO graph (6 nodes + edges) as JSON, a tiny test input, and a README mapping the graph to Figure 1 of arXiv:2507.15855v4. |
| `tests/workflow-runtime.test.ts` | New test file. Scenarios: (a) terminate-on-accept; (b) terminate-on-reject; (c) loop with consecutive-pass counter; (d) step-budget exhaustion; (e) no-matching-branch; (f) verifier schema-parse retry; (g) IMO graph end-to-end against a mock provider whose verdicts are pre-scripted. |
| `tests/workflow-graphs/` | Small graphs used by the test file. |

Estimated v0 effort: ~5–8 h (predicate parser + runner + graph load
+ CLI + 7 tests + IMO example). Most of the time is on the parser
and the IMO example tuning, not the runner — the runner itself is
~150 lines.

## 7. The IMO Steps 1–6' graph (worked example)

Mapping Figure 1 of Huang & Yang 2025 to the workflow vocabulary:

```
[Step 1: Initial solution generation]   kind=generator
  ─ feeds ─►
[Step 2: Self-improvement]              kind=generator
  ─ feeds ─►
[Step 3: Verification]                  kind=verifier, schema=with-severity
  ─ branches_on(verdict == "fail") ─►
      [Step 4: Bug report review (optional)]   kind=generator
        ─ feeds ─►
      [Step 5: Correction]                     kind=generator
        ─ feeds ─►
      (back to Step 3)
  ─ branches_on(consecutive(verdict == "pass", 5)) ─►
      [Step 6: Accept]                          kind=terminal, accept
  ─ branches_on(since_last(verdict == "pass" || severity == "minor") >= 10) ─►
      [Step 6': Reject]                         kind=terminal, reject
```

Edge order matters because the resolution rule (§3.2) picks the
first-declared match. Putting the accept-criterion edge before the
reject-criterion edge means "5 consecutive passes wins over 10 steps
of major issues" — which is the intent of Figure 1 (passes terminate
positively even if recent history includes failures).

The graph file lands at
`examples/workflow-imo-verify-refine/graph.json`; the test input is
a short solvable problem (not an actual IMO problem — those are
copyright-laden — but a small toy proof goal sufficient to exercise
the loop). The README maps each graph node to the corresponding
figure step and cites the upstream paper.

## 8. Sequencing relative to Phase ε close + Phase ζ adjoint test

Two threads share the Phase ζ label per `MATHEMATICAL_CLAIMS.md`
§3.10:

1. **Workflow runtime v0** (this spec) — a new execution surface,
   demonstrates Ontology as a workflow-graph compiler with a real
   end-user use case (verify-refine for IMO-style problems).
2. **Verdict-map determinism test** — the property test naming §3.10
   as T2 → T1 path. Pins that `verify-homeomorphism` returns the
   same verdict map per node deterministically at `temperature = 0`.

Both are scope-parallel. The workflow runtime is the user-facing
demo of the devtool framing per
[[ontology-strategic-framing]]; the determinism test is the academic
rigor-upgrade for §3.10. v0 of either can ship first.

Recommended order if both are on the table: **workflow runtime v0
first** (higher external-narrative value — concrete demo over a
real published method) **then determinism test** (closes the §3.10
T1 path). Internal Ontology consumers benefit either way.

---

*v0 spec. No code lands with this document. The intent is to make the
implementation work pickup-and-go for the next session by removing
all the up-front design questions.*
