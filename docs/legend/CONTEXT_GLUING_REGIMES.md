# Context gluing — two regimes, and a staged path to a sound sheaf

> Design doc. Pre-registered so the decision can't be retrofitted. The
> **terrain review (§2) is dated and reflects the codebase on 2026-06-09**;
> the **staged plan (§4) is living** and is updated as steps land.

## 0. Why this exists

`glueFragments` (`src/runtime/context/gluing.ts`) treats two *distinct*
nodes providing the same `provides` key as a `duplicate_provider`
conflict — **provider uniqueness**. `MATHEMATICAL_CLAIMS.md` §Axiom 5
pins this as a T1 *separated presheaf* (gluing axiom fails for agreeing
sections, on purpose). The question that opened this doc: should we
relax it into an *idempotent identification* (agreeing sections glue),
i.e. a genuine **sheaf** — and if so, what does it open, what does it
close, and what is the cheapest sound path there?

The answer is regime-dependent, and the cheapest path is **bottom-up**:
the gluing tweak is the *last* step, not the first.

## 1. Two tempos of one variable intent (the objective frames everything)

> **Framing correction (2026-06-09).** An earlier draft called the static and
> dynamic sides "two regimes with opposite needs" and the ζ runtime
> "orthogonal" to the intention graph. That overstates it. Intent is
> *inherently variable* — the whole project versions intent that grows,
> improves, and learns patterns. Compile (F), the mutable graph (proposals),
> and dynamic execution (ζ) are not separate systems; they are **the same
> substance — intent — in motion, at different tempos.** Provider-uniqueness
> is right for *settled / authored* intent; the sheaf relaxation is right for
> intent *in flux*. The code-level separation of ζ (a standalone
> `WorkflowNode` schema, read-only executor) is a **deliberate-but-revisable
> implementation choice** (`WORKFLOW_RUNTIME_SPEC §6`: "small-blast-radius
> move; v1 can revisit"), not a conceptual orthogonality. Consequence for O3
> (§4): it is **closing a loop that should close itself** — execution observes
> → proposes intent changes → the graph grows — over the mutation substrate
> (`createProposal`) that *already exists*. ζ just doesn't speak it yet.

The project's bet is an **intelligence resistant to LLM defects**: push
everything that can be static + deterministic into the kernel (graph,
topological order, context assembly, Ω validation, provider contracts)
so the LLM's unreliable part is *caged and checked*, never trusted.
`duplicate_provider` is one bar of that cage — it catches a classic LLM
defect: a second, divergent definition of a capability that already
exists.

The two tempos pull that bar in opposite directions (same substance, not
separate systems):

| | Settled tempo (F: Intent → Code) | In-flux tempo (agentic ζ) |
|---|---|---|
| What it is | The prompt map; compile walks it → final code. Update = edit the prompt, recompile. | Agentic nodes performing a live function; a mutable graph that grows / rewires. |
| `provides` means | "this node's compiled artifact exposes capability X" | "this node/agent at runtime offers capability X" |
| Provider uniqueness… | **is the feature** — SSoT, one prompt to edit per capability, single-point audit | **is a straitjacket** — blocks growth, branch-merge, re-provision |
| The right invariant | uniqueness (`conflict`) | sheaf-relaxed (`identify-if-equal`) |

**The seam between them is the discriminator**: *with what do you decide
two `provides X` are "the same"?* And the LLM-defect-resistant answer is
a **content/interface signature** — identical signatures glue, any drift
conflicts — so the merge law itself catches LLM drift by construction.

## 2. Terrain review — how it actually is (2026-06-09)

Re-verified against source. The uncomfortable parts are load-bearing:

1. **The discriminator fields exist but are empty.**
   `ContextProvisionSchema = {key, nodeType, entity?, description?}`
   (`src/schemas/ontology.ts:129`), but in practice `nodeType` is almost
   always the placeholder `"declared"` (set by `create-node`,
   `update-node`, ingest-on-apply), `entity` is **never populated
   anywhere**, and `description` is unused by gluing. `buildFragment`
   (`presheaf.ts:17`) therefore flattens to `.key` because the rest
   carries no reliable signal. **There is no sound richer-than-`key`
   discriminator today.**
2. **But the source nodeId is already available at gluing time.**
   `glueFragments` builds `providesMap: key → Set<nodeId>`
   (`gluing.ts:54`) and conflicts when `size > 1`. The missing piece is
   not the data — it's the *compatibility criterion*.
3. **Blast radius is real; the §3.9 risk is silent.** `glued.ok` feeds
   the synthetic token `TOKEN_GLUING_OK` in the intent-validator
   (`intent-validator.ts:157`), which is part of the closed-world parity
   ground truth (§3.9 T1). Three production callers depend on it
   (`compile-node.ts:774`, `semantic-linker.ts:98`, `run/context.ts:213`),
   and two tests pin uniqueness as a T1 characterisation
   (`presheaf-sheaf-laws.test.ts:232-258`, `context-gluing.test.ts:64`).
   The §3.9 test does **not** call gluing — so a semantics change would
   not break it, it would make it **silently false**. Any change needs a
   new parity guard linking `glued.ok` ↔ `TOKEN_GLUING_OK`.
4. **`assembleContext.mode` is not a seam.** The type allows
   `strict|compare|propose` but the impl throws on anything but `strict`
   (`assembler.ts:14`), and `compare`/`propose` are already reserved
   (T4, §4.5). A gluing policy must be a **new parameter**, not an
   overload of `mode`.
5. **The loop is unclosed in code (but the substrate exists).** The ζ
   workflow runtime is, *today*, separated from the intention graph: a
   standalone schema (`WorkflowNode`, `src/schemas/workflow.ts`), a
   read-only executor, no context access, no graph mutation. Graph mutation
   already has a substrate — the proposal system (`createProposal`) — but ζ
   does not emit into it yet. So "execution proposes intent changes" is
   **unbuilt**, not impossible: it is one wire (executor → `createProposal`)
   over an existing channel, not a new system. The schema separation is the
   deliberate-but-revisable choice noted in §1, not a conceptual divide.

→ **Consequence:** relaxing the sheaf *today* is rail-before-train — no
dynamic consumer needs it. The sheaf is a downstream *consistency guard*,
not a growth lever. The growth lever is a dynamic mutation consumer (O3);
the cheap prerequisite that serves every path is the discriminator (O1).

## 3. What relaxing opens / closes (per regime)

- **Static — uniqueness opens:** deterministic update locality ("edit one
  prompt"), single-point auditability (`onto mcp`), drift detection in
  ingest (G). **Closes:** legitimate layering / branch-variants of the
  same capability. → keep uniqueness here.
- **Dynamic — uniqueness closes:** growth (a spawned node re-providing X),
  branch-merge convergence, connection-rewiring transients. **Sheaf opens:**
  all of those, *while* a deterministic hash-gated glue keeps the mutable
  graph consistent without trusting the agents that mutate it. → relax here.

## 4. Staged plan (living) — bottom-up, consumer-driven

Order chosen for efficiency: each step is independently useful and de-risks
the next. **Do not do a later step before its prerequisite.**

### O0 — Document the regime split; keep uniqueness (≈0 cost)
This doc + a note in `CONTEXT_ASSEMBLER.md`. Unblocks nothing technically;
prevents the framing from outrunning the code. **Status: this doc.**

### O1 — Populate a sound provider discriminator  ← **the prerequisite, do first**
Give `provides` an identity beyond `key`, sourced from the static inference
that *already* computes exports (`static-summary.ts:108/214/294`). No gluing
change, no §3.9 risk, independently useful (richer vocab-gap, dedup, ingest
drift detection).
- **Fork resolved (2026-06-09): interface-signature, syntactic tier.**
  Two re-provisions of `auth.login` identify iff they expose the same
  interface, regardless of implementation — the meaningful sheaf criterion.
  Provenance/origin and definition-hash were considered and rejected
  (provenance is conservative but only semantic-by-accident; definition-hash
  mostly degenerates to uniqueness). **Scoping finding:** the codebase parses
  TS with `ts.createSourceFile` (`src/runtime/static/typescript.ts`) — a
  *syntactic* parser, **no `TypeChecker`/`createProgram`**. So O1 extracts the
  **written** signature (param + annotation + return text for functions;
  member shape for interfaces/types/classes), normalised + hashed. **Resolved
  types** (alias expansion, inferred returns) need a whole-program
  TypeChecker pass and are **deferred** as a future enrichment.
- **Coverage honesty:** good for TS with annotations; degrades to
  `signature: undefined` for untyped JS, un-annotated inferred returns, and
  Python (no extractor). `undefined` means "unknown" — O2 gluing simply does
  not identify-by-signature there and falls back to the conservative
  (uniqueness) behaviour. No silent false-merge.
- **Sub-steps:** (a) ✅ fork resolved; (b) ✅ `parseTypeScriptFile`
  (`static/typescript.ts`) now captures a normalised syntactic `signature`
  per export (`ExportRef.signature`); (c) ✅ signature threaded end-to-end as
  a **side channel** (W2, never restructuring `provides: string[]`):
  `ClassificationVocabulary.exports[].signature` → `StaticExtractionResult`/
  `ExtractionResult.provideSignatures` → proposal payload
  `provideSignatures` (optional, omitted-when-absent → proposal hash
  unchanged for manual/LLM) → `createNode` merges it onto
  `context.provides[].signature` (new optional field on
  `ContextProvisionSchema`); (d) ✅ `buildFragment` surfaces
  `ContextFragment.provideSignatures` while `provides` stays `string[]`.
  Gluing still ignores `signature` (that's O2).
- **Math safety (verified):** §3.9 closed-world parity, Axiom 5 presheaf
  laws, and `glueFragments` all unchanged — the gluing token set is
  identical because `provides`/`ContextFragment.provides` stay `string[]` and
  the validator reads only keys. No existing node/proposal re-hashes; only
  new static-ingest nodes carry the (additive) signature. 168 tests green
  across the math-critical + wiring + new suites.
- **Unlocks:** O2 (a sound compatibility criterion now exists on the
  fragment); richer vocab-gap / drift detection today.

### O2 — ✅ gluing policy as an opt-in parameter (landed 2026-06-09)
`glueFragments(frags, {onDuplicateProvider: "conflict" | "identify-if-equal"})`,
**default `"conflict"`** — all current behaviour, callers, tests and §3.9 stay
intact (default-preserving by construction). `identify-if-equal` glues two
distinct providers iff their `signature`s (from O1) are both defined and equal;
missing or differing ⇒ conflict (drift caught, unknown ⇒ conflict, never a
false identification).
- **Guard shipped:** `tests/intent-validator.test.ts` pins `glued.ok` ↔
  `gluing_ok` token under *both* policies, so §3.9 closed-world parity cannot
  regress silently. Policy behaviour pinned in `tests/context-gluing.test.ts`.
- **Ledger:** `MATHEMATICAL_CLAIMS.md` §Axiom 5 records the mode — a **sheaf on
  the equal-signature overlap subcategory** — initially at T2, then **promoted
  to T1 (2026-06-09)** once Path-to-T1 gate #2 landed (the gluing axiom pinned
  as a characterising law over an explicit cover; see O-gate below). Default
  stays the T1 restriction / T2 separated-presheaf; no existing tier changed
  (T1 13→14).
- **First consumer landed (2026-06-09):** `onto run context --validate
  --identify-equal-providers` threads the policy into the validation gluing
  step (opt-in; default still enforces uniqueness). Demonstrated end-to-end
  over the *real* assembly path by `tests/context-glue-policy-integration.test.ts`:
  two edge-neighbour nodes that provide the same key with an identical
  signature glue under the policy and conflict by default; a divergent
  signature still conflicts. **Honest scope:** the consumer lives in the
  *settled / validation* path and is exercised by nodes that carry
  `provides` + signatures (i.e. **static-ingest** output, O1) — **not** the
  O3 workflow path, whose proposed nodes currently carry no `provides`
  contract (see O3 below). So O2 is no longer latent, but its first consumer
  is the static regime, not yet the workflow loop.

### O3 — ✅ first dynamic-mutation consumer, v0 (landed 2026-06-09)
The execution→intent loop now closes over the existing proposal substrate:
`onto workflow run <graph> --as-proposal` turns an **accepted** workflow's
final artefact into a pending `node_create` proposal (prompt = artefact),
reviewed/applied via `onto proposal apply`. An execution can now *propose
growth of the intention graph*, not just print a result — the smallest real
instance of "variable intent: grow, improve, learn patterns."
- **Reuses wholesale:** `createProposal` + the apply / stale-check / audit
  chain. The only workflow-specific part is the provenance rationale. Pinned
  by `tests/workflow-as-proposal-cli.test.ts` (accept→proposal→apply→node;
  reject refuses; default unchanged).
- **v0 scope / honest gaps:** proposes a *new node* from the artefact only
  (not node-update or edges); `source: null` (workflows don't persist a run
  record yet — a future enrichment for a tighter audit link); opt-in and
  human-gated (nothing auto-mutates).
- **Snag found wiring O3→O2 (2026-06-09, resolved by O4 below):** a workflow-
  proposed node carried a `prompt` but **no `provides` contract**, so
  `identify-if-equal` had nothing to act on from the workflow path. Resolved
  by O4: the workflow now *declares* a contract and (for code) the artefact is
  *measured*, so the proposed node is born with `provides` + signatures.

### O4 — ✅ contracted workflow proposals + the round-trip (landed 2026-06-09)
The execution→intent loop now carries a **verified contract**, closing O3→O2.
- **Declare (intent):** a workflow graph may declare `provides`
  (`[{key, signature?}]`) and an optional `artefactLanguage`
  (`src/schemas/workflow.ts`). This is the author's commitment — *what* the
  agentic execution produces.
- **Measure + round-trip (teeth):** when `artefactLanguage` names code,
  `onto workflow run --as-proposal` parses the produced artefact (G, the O1
  extractor) and compares the **measured** contract to the **declared** one.
  Declared-but-not-produced, signature drift, and over-delivery are surfaced
  as `contractCheck.mismatches` (a defect for human review, not a hard block)
  and noted in the proposal's provenance. This is `F∘G ≈ id` on a single
  output — "did the execution produce what it promised?", the dynamic-regime
  way of caging LLM defects.
- **Carry:** the proposed node is born with the contract — the **measured**
  one when available (grounded), the **declared** one otherwise — via O1's
  `provides` + `provideSignatures` side channel. On apply it lands on
  `context.provides[].signature`, exactly what O2's `identify-if-equal`
  reconciles. **The loop closes.**
- **Graceful degradation:** non-code / undeclared artefacts → the declaration
  stands alone (intent without measurement) or no contract at all (O3 v0
  behaviour). The machinery never claims verification it cannot perform.
- Pinned by `tests/workflow-contract-roundtrip.test.ts` (the round-trip:
  measure / drift / missing / over-deliver) and `tests/workflow-as-proposal-cli.test.ts`
  (declared contract → proposal → applied node carries provides+signature).
- **v0 honest gaps:** the discriminator is still the *syntactic* signature
  proxy (O1's tier); `source` is still null (no run record); the measurement
  covers TS/JS only. Same Path-to-T1 as O2 §Axiom 5.

## 5. Pre-registered open decisions

1. ~~**O1 discriminator semantics:** interface-signature vs definition-hash~~
   **Resolved 2026-06-09: interface-signature, syntactic tier** (see §4 O1).
   Resolved-type extraction deferred.
2. **O2 policy surface:** parameter on `glueFragments` vs a new
   `assembleContext` gluing-mode (recommendation: parameter — `mode` is not
   a seam).
3. **Strategic emphasis:** consolidate the static regime (O1 serves SSoT +
   Legend) vs open the dynamic regime (O3 is the rail). O1 is the shared
   prerequisite either way.

## 6. Honest scope

O1, O2, O3 v0, and O4 have shipped (all opt-in / default-preserving /
human-gated; no math claim downgraded). The loop now closes end-to-end:
an execution declares a contract, the artefact is measured against it
(round-trip, for code), and the proposed node is born with a signature O2 can
reconcile. What remains: (a) the discriminator defaults to syntactic, but the
**resolved-type extractor is now built AND wired** as opt-in
`onto ingest --resolved-signatures` (`typescript-resolved.ts` + the ingest
override; captures inferred returns/consts and follows re-export aliases the
syntactic tier can't, tier-tagged so it never confuses with syntactic) — a
fidelity refinement that broadens the T1 subcategory, default unchanged;
(b) apply still doesn't *automatically*
run `identify-if-equal` against the existing graph (it's reachable via the
validation flag, but not yet a step of apply itself); (c) workflows propose new
nodes only (not node-update / edges) and persist no run record. The full
agentic-graph regime — executions routinely proposing and the graph growing
and rewiring under sheaf consistency — is the remaining horizon. The sequence
is deliberate.
