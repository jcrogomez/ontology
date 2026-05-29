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

The existing `compile-plan` shipped at γ-2 (`src/runtime/graph/compile-plan.ts`)
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
- `"with-severity"` — `{verdict: "pass" | "fail", severity: "minor" | "major", issues: string[]}`
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
| `src/schemas/ontology.ts` | Extend `OntologyNode.coordinates` with optional `kind: "generator" \| "verifier" \| "terminal"` and optional `verifierSchema: string`. Extend `EdgeTypeSchema` with `"feeds"` and `"branches_on"` variants. The `branches_on` shape carries a `predicate: string` field; introduce `OntologyEdgeBranchesOnSchema` as a discriminated variant. |
| `src/runtime/workflow/` | New directory. `predicate-parser.ts` (the recursive-descent DSL parser), `verifier-schemas.ts` (the registry of pre-declared verifier output shapes), `executor.ts` (the `runWorkflow` loop above), `graph-load.ts` (load + structural-validate a workflow graph from JSON). |
| `src/commands/workflow/run.ts` | New CLI command implementing the surface from §3.5. |
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
