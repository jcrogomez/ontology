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

## 1. The two regimes (the objective frames everything)

The project's bet is an **intelligence resistant to LLM defects**: push
everything that can be static + deterministic into the kernel (graph,
topological order, context assembly, Ω validation, provider contracts)
so the LLM's unreliable part is *caged and checked*, never trusted.
`duplicate_provider` is one bar of that cage — it catches a classic LLM
defect: a second, divergent definition of a capability that already
exists.

There are two regimes with **opposite** needs for that bar:

| | Static regime (F: Intent → Code) | Dynamic regime (agentic ζ) |
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
5. **The dynamic regime does not exist yet.** The ζ workflow runtime is
   **orthogonal** to the intention graph: separate schema
   (`WorkflowNode`, `src/schemas/workflow.ts`), read-only executor, no
   context access, no graph mutation. Graph mutation is **exclusively**
   via the proposal system, *outside* the runtime. "Agentic nodes that
   grow/rewire the graph in vivo" is **100% aspirational**.

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

### O2 — Add gluing policy as an opt-in parameter (sound only after O1)
`glueFragments(frags, {onDuplicateProvider: "conflict" | "identify-if-equal"})`,
**default `"conflict"`** so all current behaviour, tests and §3.9 stay intact.
`identify-if-equal` glues two distinct providers iff their `signature`s match
(from O1) and conflicts on drift.
- **Mandatory guard:** a parity test pinning `glued.ok` ↔ `TOKEN_GLUING_OK`
  so §3.9 can't regress silently (terrain §2.3).
- **Unlocks:** a genuine **sheaf on the identical-overlap subcategory** — a
  precise, honest T1-able claim (the "Target B" middle path), without losing
  conflict detection. Re-audit `MATHEMATICAL_CLAIMS.md` §Axiom 5 / §3.9.

### O3 — Build the first dynamic-mutation consumer (the train)
Elevate the `run --as-proposal` path into a runtime capability: a workflow /
agentic node that emits a graph mutation (a proposal) from its execution.
This is the missing rail for "mutable agentic graph". Only here does O2's
sheaf have a reason to exist (mutation starts producing re-provisions).
- **Unlocks:** the dynamic regime; gives O2 its consumer; first real
  step toward the agentic-graph vision.

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

O1 is real, low-risk, shippable now. O2 is a material categorical-claim
change gated on O1 + a §3.9 guard. O3 and the agentic-graph regime are
**design-ahead-of-code**: the rail is being laid before the train exists,
recorded here so the sequence is deliberate, not accidental.
