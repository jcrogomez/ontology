# Project Legend — Ingest, Homeomorphism, and the Open-Prompt Layer

> *Legens* in Latin: "the one who reads". A legend (in maps) is the key that
> tells you how to read the territory. Project Legend is exactly that — the
> key that turns an existing codebase into a readable, navigable network of
> intention; the operational construction of the inverse of the compile
> functor; and the protocol layer that makes "what an organisation runs"
> verifiable without exposing its source.

Status: **Phases α–ε shipped; Phase ζ (workflow runtime) active.** Phase ε
(self-ingestion) closed 2026-05-26; Phase ζ is the workflow runtime
(`onto workflow run`, [`legend/WORKFLOW_RUNTIME_SPEC.md`](legend/WORKFLOW_RUNTIME_SPEC.md)),
not the "release" placeholder the phase plan below still names. **Live phase
state + open work: [`ROADMAP.md`](ROADMAP.md)** — the design narrative below
is preserved as written and may lag. Original milestone:
**Phases α + β + γ + δ shipped on `main` (2026-05-12, late).**
Pre-foundation plasticity (§1–§6), Layer 1 (`compile run-batch` +
`--target`), Layer 2 (`node.literal`), Layer 3 (static-edge inference,
TS via compiler API and Python via regex), Layer 4 (`onto node inspect`
— Inspector / Lupa, `8779acc`), Layer 5 (`computeFiberBy` +
`pathProjection`), Layer 6 (`onto verify-homeomorphism` — dual-distance
LoC + structural Jaccard with five-label verdict folder, `29b330c`),
and Layer 7 (`onto ingest <file>` / `<directory>` with rich-payload
`node_create` proposals) are all live. γ-7 prompt invariants (MANDATORY
EXPORTS block + comprehensive `provides` capture, `2e8853e`) hardened
the round-trip after the Vibe-Reasoning Vertiente C surfaced
rename / decomposition divergences. γ-2 calibration on
`src/core/integrity/hash.ts` with `claude-opus-4-7` end-to-end reads
**5/5 ε-equivalent** (see §7.1). Phase ε (self-ingestion on the
Ontology codebase) is the next active stream — all infrastructure is
in place; the remaining gate is API spend to measure $\varepsilon$.

Companion reads:
[`BRANCH_FIBRATION.md`](BRANCH_FIBRATION.md) · [`BRANCH_MODEL.md`](BRANCH_MODEL.md) ·
[`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) · [`COMPILER.md`](COMPILER.md).

---

## 1. The problem Legend solves

Two failure modes of LLM-assisted programming today, both load-bearing:

1. **The bandwidth gap.** An LLM session emits more code than a human can
   read with care. The user accepts a diff they have not understood and
   loses the verifiable mental model of their own system. The audit
   asymmetry compounds with every PR.

2. **The adoption wall.** Greenfield projects can be designed
   intent-first. Brownfield projects — every real codebase — cannot.
   Without a way to project existing source into the intent layer, the
   intent layer is academic.

Legend addresses both:

- **For new code**, the forward direction `\text{Intent} \xrightarrow{F} \text{Code}`
  is already operational in Ontology (`onto compile run` + the §1 validator
  gate). The user writes intent, the LLM produces code, the validator
  refuses code that violates the contract.
- **For existing code**, Legend builds the inverse direction
  `\text{Code} \xrightarrow{G} \text{Intent}`, file by file, then verifies
  the round-trip `F \circ G \approx \mathrm{id}_{\text{Code}}` empirically.
  Where the round-trip is faithful, the network is *homeomorphic* to the
  codebase: a compressed, navigable surface for the same artefact.

---

## 2. Mathematical foundation

This section makes the category-theoretic content of Legend precise.
The previous milestone documents (`MATHEMATICAL_CLAIMS.md`,
`BRANCH_FIBRATION.md`) named the categories; this section *uses* them.

### 2.1 The forward functor and its adjoint

Let $\mathcal{I}$ be the **intent category**:

- Objects: well-formed Ontology networks
  $\mathsf{N} = (\mathsf{Nodes},\mathsf{Edges})$
  satisfying the kernel invariants (poset on `coordinates.abstraction`,
  partition-by-branch, hash-integrity of every record).
- Morphisms: structure-preserving evolutions
  $\mathsf{N} \to \mathsf{N}'$ — the four primitives shipped in
  §1–§6 are precisely these: `node_created`, `node_updated`,
  `edge_created`, `edge_updated`. Compositions are unfoldings of
  `events.jsonl`. Identity is the no-op event.

Let $\mathcal{C}$ be the **code category**:

- Objects: source trees (well-formed projects on disk).
- Morphisms: refactors / patches that preserve module identity.

The compile pipeline defines a functor

$$
F\colon \mathcal{I} \longrightarrow \mathcal{C}, \qquad
F(\mathsf{N}) \;=\; \bigsqcup_{n \in \mathsf{Nodes}^{\,\text{artifact}}}
\mathrm{compile}(n; \mathsf{N}).
$$

$F$ is **not** strictly functorial — the compile step samples from an LLM,
and two runs over the same network can produce different artefacts.
What we have is *functorial up to a tolerance*: with `temperature = 0`
and a frozen model, $F$ is deterministic; with finite temperature, $F$ is
a probabilistic functor whose images concentrate within an $\varepsilon$-ball.

Legend constructs an **approximate left adjoint**

$$
G\colon \mathcal{C} \longrightarrow \mathcal{I}.
$$

The claim Legend tests empirically is that there exists a natural
transformation

$$
\eta\colon \mathrm{id}_{\mathcal{C}} \;\Longrightarrow\; F \circ G
$$

such that for each $c \in \mathcal{C}$,
$\eta_c \colon c \to F(G(c))$ has small *churn distance*
$d(c, F(G(c))) < \varepsilon$ for a measurable subset of $\mathcal{C}$ —
the *intent-faithful* subcategory.

The complement — the *intent-resistant* subcategory — is the part of
existing code whose intent does not compress because it carries
irreducible implementation detail (specific algorithms, magic constants,
patterns that require literal preservation). Legend's empirical work is
to *measure* both subcategories and to characterise them.

> **Why this matters.** Until Legend, the existence of $G$ was retoric.
> With Legend, $G$ is an executable function and $\varepsilon$ is a
> reported number. The adjunction claim becomes falsifiable.

### 2.2 The sheaf condition over file paths

A codebase is not a list of files; it is a *sheaf*. Each file
$f \in \mathcal{C}$ carries a **local section** of the intent presheaf:

$$
\mathcal{P}(f) \;=\;
\bigl(\mathrm{requires}(f),\;\mathrm{provides}(f),\;\mathrm{forbids}(f)\bigr).
$$

For two files $f_1, f_2$ that interact (e.g. `f_2` imports from `f_1`),
the sheaf condition requires that the sections agree on the overlap:

$$
\mathcal{P}(f_1) \big|_{f_1 \cap f_2} \;=\;
\mathcal{P}(f_2) \big|_{f_1 \cap f_2}.
$$

Concretely: the token vocabulary used by `f_2.requires` must overlap
with `f_1.provides` on the symbols that `f_2` actually imports from
`f_1`. If it does not, the ingest produced a locally incoherent network
and the **gluing operation $\mathrm{glueFragments}$ — already shipped in
`runtime/context/gluing.ts` — will detect the mismatch.**

This is not metaphor: the sheaf detector is the existing `glueFragments`
function, repurposed. A `LegensSheafReport` lists every file pair where
local sections disagree, with a suggested normalisation (a colimit in
the local fiber).

### 2.3 The Yoneda principle, made operational

The Yoneda embedding

$$
y\colon \mathcal{C} \hookrightarrow \widehat{\mathcal{C}},
\qquad
y(c) \;=\; \mathrm{Hom}_{\mathcal{C}}(-,\, c)
$$

says that an object is fully determined by the morphisms into it. For
code, the "morphisms in" are the *incoming references*: who imports
`f`, who tests `f`, who depends on the type `f` exports.

Operationally, Legend ranks a file's tokens by what *callers* expect
from it — not just by what the file's own AST exposes. A `.ts` module
that defines twenty exported functions but is only ever imported for
one of them has, by Yoneda, *one* `provides` token of interest; the
other nineteen are noise from the network's point of view. This is
the **pruning heuristic** that keeps the ingested network small.

### 2.4 The path fibration

The filesystem layout is a poset $\mathcal{D}$ (directories ordered by
inclusion). There is a forgetful functor

$$
p\colon \mathcal{I} \longrightarrow \mathcal{D},
\qquad
p(\mathsf{N}) \;=\; \{\text{target\_path}(n) : n \in \mathsf{N}\}.
$$

A **path fiber** $p^{-1}(d)$ is the set of intent nodes whose
artifacts live under directory $d$. Path fibers are the natural unit
for **token vocabulary normalisation**: within a fiber, tokens are
expected to share semantic meaning more than across fibers. When
ingest extracts a new token for file `src/runtime/topos/foo.ts`, it
first checks the existing tokens in $p^{-1}(\text{src/runtime/topos})$
and reuses one if the LLM judges it equivalent. Cross-fiber
suggestions are accepted only on explicit user confirmation.

This is the **branch fibration generalised**. `BRANCH_FIBRATION.md`
defines $p\colon \mathcal{I} \to \mathcal{B}$ for the temporal-branch
base; the path fibration is the *spatial* analogue. Both are
Grothendieck fibrations and both are used by the same library code
(`computeBranchFiber`, generalised to `computeFiberBy`).

**Known limitations of the β-3 helper** (planned for resolution in
Phase γ when ingest concretises the use cases):

- *Single-output projection (§4.10).* `pathProjection(node)` reads
  `node.outputs.files[0]` only. A node that emits both
  `src/lib/a.ts` and `tests/lib/a.test.ts` lands in `src/lib` alone;
  the test-file directory has no projector pulling the node in.
  Phase γ's `onto ingest` will own the multi-output convention; when
  it does, the projection can be tightened (or a sibling
  `pathProjectionAll(node): string[]` can fan out one node into
  every relevant fiber).
- *Unprojected nodes are silent (§4.9).* `computeFiberBy(input,
  projection)` excludes any node whose projection returns
  `undefined`. The current return shape — `Map<T, FiberByLabel<T>>`
  — gives callers no way to count or list those skipped nodes.
  Legend's "find every artifact node missing an output path"
  diagnostic needs exactly that signal; the planned solution is a
  sibling helper `findUnprojected(input, projection):
  OntologyNode[]` rather than enriching the partition return type
  (keeps the canonical fiber shape pure).
- *Cross-fiber edges are dropped (§4.11).* For both branch and path
  fibrations, edges whose endpoints sit in different fibers fall out
  of every fiber's `edges` array — the induced-subgraph rule that
  makes the partition property hold. For the branch case this
  matches existing semantics; for the path case, Legend's eventual
  "show me inter-module dependencies" diagnostic will *want* those
  dropped edges back. The planned companion helper is
  `findCrossFiberEdges(input, projection): OntologyEdge[]`, also a
  sibling rather than a change to `computeFiberBy`.

### 2.5 The homeomorphism verdict

For each artifact node $n \in G(c)$, the verdict is computed as:

$$
\mathrm{verdict}(n) \;=\;
\begin{cases}
\varepsilon\text{-equivalent} & d\bigl(c|_n,\, F(G(c))|_n\bigr) < \varepsilon \\
\text{divergent} & \varepsilon \le d < \tau \\
\text{unrecoverable} & d \ge \tau
\end{cases}
$$

with $\varepsilon \approx 0.3$ (30% LoC churn) and $\tau \approx 0.7$.
The bounds are tunable and reported with every Legend run. A node
that is $\varepsilon$-equivalent participates in the homeomorphism;
a node that is divergent indicates intent that needs sharpening; a
node that is unrecoverable indicates either irreducible implementation
detail (use a `literal` field) or a section of code worth refactoring
to make its intent legible.

---

## 3. The Inspector / Lupa primitive

The user's request:

> *Once I generate a node network, I want to read it intuitively. I want
> each cell to optionally carry a "translator". And I want to use the
> LLM only once to understand cells that aren't immediately clear and
> their relations — a kind of inspector, a magnifying glass.*

This is essential because a network of 200 nodes is *not* automatically
more navigable than 200 files of code. Compression matters only if the
compressed surface is *itself* legible. The Inspector primitive solves
this:

### 3.1 The `translator` field

Each node optionally carries

$$
\mathrm{translator}\colon \mathsf{Nodes} \to \mathcal{T}^{*},
$$

where $\mathcal{T}^{*}$ is the set of human-readable paragraphs. The
translator is a **natural transformation** from the structured node
representation (`prompt.raw + context + rules`) to a paragraph that a
human-cold-to-the-project can read in five seconds. It is *not* a
substitute for the structured intent — it is a presentation layer for it.

### 3.2 The `onto node inspect` command

Shipped as Layer 4 (`8779acc`):

```
onto node inspect <nodeId> [--regenerate] [--provider <p>] [--model <m>]
```

dispatches the LLM **once per node lifetime** to produce a 3-5 sentence
developer-facing summary answering "what does this node do, and what
invariants must any implementation preserve?" The summary reads the
focal's `prompt.raw`, the structured contract (`requires` / `provides`
/ `forbids`), and the rules array.

The output is cached on the node JSON as
`translator: { text, model, provider, generatedAt, sourceHash }`. The
first inspect dispatches; subsequent inspects return the cached text
without a new LLM call. Cache invalidation is **automatic** via
`sourceHash`: a deterministic SHA-256 over (`prompt.raw`, sorted rules,
sorted `provides` / `requires` / `forbids`, `node.literal`). When any
of those change, the hash drifts and the next inspect re-dispatches.
Label changes do NOT invalidate (framing metadata, not semantic
content). `--regenerate` forces a fresh dispatch when iterating on
the inspector prompt itself.

Every paid dispatch (not cache hits) appends a `node_inspected` event
to `.ontology/events.jsonl` carrying `{ nodeId, model, provider,
sourceHash, totalTokens? }`. The temporal log is therefore the
canonical record of inspector spend; replay across events alone
reproduces the timeline of "what was read, when, and at what cost".

The translator uses a new `LlmTask: "inspect"` in the routing registry
(fast tier — short prose, doesn't need critic-tier compute). Pure
library at `src/runtime/legend/translator.ts` owns the prompt builder,
source-hash math, and cache-validity check; the CLI command owns the
dispatch + persistence.

### 3.3 The Lupa walker action

In the walker, pressing `i` over the focal cell surfaces the translator
inline. If absent, the walker offers to dispatch `inspect` on demand.
The cost stays one LLM call per node *ever*, not per inspection.

### 3.4 Mathematical content

The Inspector primitive is the **second natural transformation** in the
Legend pipeline:

$$
\mathrm{intent} \;\xrightarrow{\;F\;}\; \mathrm{code},
\qquad
\mathrm{intent} \;\xrightarrow{\;\tau\;}\; \mathrm{prose}.
$$

$\tau$ is also probabilistic (LLM-mediated). The triangle commutes up
to $\varepsilon$:

$$
\begin{array}{ccc}
\mathrm{intent} & \xrightarrow{\tau} & \mathrm{prose} \\
\;\downarrow F & & \;\downarrow \tau' \\
\mathrm{code} & \xrightarrow{\sigma} & \mathrm{code commentary}
\end{array}
$$

where $\sigma$ is the operation "ask the LLM to describe this code in
plain language" — what most users do today *instead of* the intent
layer. Legend's commitment is that $\tau$ (intent → prose) is shorter,
more stable, and more navigable than $\sigma \circ F$ (intent → code →
prose), because the intent already *is* the description.

---

## 4. The Open-Prompt protocol

The user's framing:

> *Maybe the code is more of an industrial secret, but the intent is
> open, and you can verify that this intent is the one being run. A kind
> of transparency-of-trust layer for what corporations run, from social
> networks to anywhere.*

This is a real protocol design, not a metaphor. Let me state it.

### 4.1 The signed-contract pattern

An organisation $O$ publishes:

$$
\text{public artefact} \;=\;
\bigl(\,\mathsf{N}_O,\;\sigma_O(\mathsf{N}_O),\;\mathsf{events}_O\,\bigr),
$$

where $\mathsf{N}_O$ is the intent network (nodes + edges + rules), and
$\sigma_O$ is a digital signature over the integrity hashes of every
node. The source code $\mathsf{C}_O = F(\mathsf{N}_O)$ stays private —
proprietary, trade-secret, regulatory-restricted.

A third-party auditor (or a user, or a regulator) can then verify:

1. **Intent-source consistency.** Run the validator over a sandboxed
   replay: does the running system honour the published $\mathsf{N}_O$?
   The validator gate from §1 makes this checkable for any artifact
   stream: every output the system emits passes through
   `validateIntent`. A run that emits prose violating
   $\mathsf{forbids}(O)$ is detectable.
2. **Audit completeness.** `events.jsonl` is a signed-prepended chain
   (each event carries `previousEventId`); any tampering breaks the
   chain hash. Anyone with $\sigma_O$ can verify the chain.
3. **Lineage from intent.** Every `compilation_run` event references
   the runId of the dispatch and the nodeId of the focal. The audit
   trail from "this code was run" back to "this intent was published"
   is complete and signature-verifiable.

### 4.2 What this enables

A platform — a social network, a recommendation system, an automated
trader — can publish its **intent layer** and keep its code closed.
The public contract is:

> *"We promise that the system does what this intent says. Here is the
> signed intent. Here is the audit chain. We do not show you the code;
> we show you the contract and we let you verify the contract is what
> runs."*

This is a **new class of regulatory technology**. It is weaker than
fully open source (you cannot inspect the algorithms) and stronger
than self-attestation (you can verify the audit chain). It is exactly
the trust posture that, for example, content-moderation platforms need
in order to give regulators something tractable to audit.

### 4.3 What Legend has to deliver

For Open-Prompt to be operational, three things must ship beyond what
exists today:

1. **Signing.** A `onto sign <branch>` command that produces a Merkle
   root over every node and every event up to a given sequence number,
   signed with the org's private key. ~80 LoC + crypto.
2. **Verification.** A `onto verify-published <signed-artefact>`
   command that re-walks the chain and validates each signature. ~60 LoC.
3. **Sandboxed replay.** A `onto replay --against <intent-artefact>`
   that takes the org's *output stream* (or a representative sample) and
   passes it through `validateIntent` against the published $\mathsf{N}_O$,
   surfacing any artefact that would have failed the gate. ~120 LoC.

These are out of scope for Legend v1 (which focuses on ingest +
homeomorphism), but they belong in the same architectural family.

---

## 5. Architecture: what Ontology must become

The pre-foundation gaps §1–§6 are shipped on `main`. The Legend
infrastructure stack sits on top:

| Layer | Purpose | Status | LoC est. |
|---|---|---|---|
| 0 | Iteration plasticity (§1–§6) | **shipped** | — |
| 1 | Multi-file orchestration (`compile run-batch`, `--target`) | **shipped** β-1 (`a09e1d7`) | ~120 |
| 2 | `node.literal` escape hatch + schema migration | **shipped** β-2 (`04f730c`) | ~50 |
| 3 | Static analysis edge inference (TS via compiler API; Python via regex) | **shipped** γ-4 TS (`62d8c86`) + γ-6 proposal flow (`9c16b9d`) + γ-4 Python (`bad6840`) | ~250 |
| 4 | `onto node inspect` (translator + cache) | **shipped** δ-1 (`8779acc`) | ~120 |
| 5 | Path fibration helpers, `computeFiberBy` generalisation | **shipped** β-3 (`881506a`) | ~80 |
| 6 | Verification framework (`verify-homeomorphism`, dual-distance + verdict folder) | **shipped** δ-2 (`29b330c`) | ~150 |
| 7 | The `onto ingest <path>` command itself | **shipped** γ-1 single-file (`b670ca3`) + γ-5 directory (`a25ade9`) | ~250 |
| 8 | Open-Prompt signing + replay (out of scope for v1) | future | ~260 |
| 9 | Self-maintaining intent network — wakeup scanners ([`WAKEUP_SCANNERS.md`](WAKEUP_SCANNERS.md)) + content-addressed prompt templates ([`PROMPT_GENERATORS.md`](PROMPT_GENERATORS.md)) | future (RFCs drafted) | see RFCs |

### Per-layer detail

**Layer 1 — Multi-file orchestration.** Today `onto compile run` walks
one focal at a time. Legend will produce many nodes; the natural
operation is "regenerate every artifact node in dependency order"
followed by "diff against the corresponding source path". Two commands:

- `onto compile run-batch [--all-artifacts | --nodes <id1,id2,...>]`
  composes the existing `runCompilePlan` over a batched focal set.
- `onto compile run --target <path>` writes the generated artifact
  directly to its source path (configurable; default still
  `.ontology/artifacts/generated/`).

**Layer 2 — Literal escape hatch.** Add `node.literal?: string` to the
schema. When set, the compile pipeline emits `literal` verbatim
instead of dispatching the LLM — same audit chain, no probabilistic
step. This is essential for code that has irreducible specificity (a
specific regex, a magic constant, a license header). The validator
still runs against it; `runtime_check` still applies.

**Layer 3 — Static analysis.** A small library `src/runtime/static/`
with per-language plugins. For TypeScript: walk `ts.SourceFile`
imports → produce `depends_on` edges between the corresponding nodes.
For Python: AST walk for `import` / `from … import`. Static edges are
cheap (no LLM) and high-precision (we know the language really has
that import).

**Layer 4 — Inspector / translator.** As described in §3.

**Layer 5 — Path fibration.** Generalise `computeBranchFiber` to
`computeFiberBy(input, projection)` where `projection: Node → label`.
Branch fibration: `projection = n.coordinates.branch`. Path fibration:
`projection = n.outputs.files[0]?.relativeToDir`. The library lives
under `src/runtime/fibration/` and the two are sibling exports.

**Layer 6 — Verification.** The `verify-homeomorphism` command and
its batch counterpart. Output is structured (JSON + human) and
includes the per-node verdict, the sheaf coherence report, and a
suggestion for any unrecoverable nodes (typically: extract the
irreducible parts to a literal field, then re-verify). Each
invocation appends a single `homeomorphism_verified` event to
`.ontology/events.jsonl` carrying `{ nodeIds, total, byVerdict,
thresholds, totalUsage? }`, so the temporal log reproduces the
calibration timeline without re-reading the JSON output. Skipped
under `--dry-run` and `--cost-estimate`, both of which dispatch
nothing.

**Layer 7 — `onto ingest <path>`.** The integrator. Walks the file
tree, dispatches the extraction prompt per file, dedupes tokens
against the path fiber, creates proposals (so the apply step is
audit-traceable), infers static edges, calls the LLM once more per
pair-of-related-files to suggest semantic edges. End-of-run report.

---

## 6. Phase plan

### Phase α — foundation (DONE)
Items §1–§6 from the pre-foundation review. `main` is here.

### Phase β — pre-ingest infrastructure (DONE, 2026-05-11)
Layers 1 + 2 + 5. Multi-file compile (β-1: `onto compile run-batch` +
`--target`), `node.literal` escape hatch (β-2), path fibration
helpers (β-3: `computeFiberBy`, `pathProjection`). Post-merge review
landed two follow-ups: review blockers (`fix(compile,node)`
`157d367`) and the two-phase commit safety property (`fix(compile)`
`2cbaa32`).

### Phase γ — extraction core (DONE, 2026-05-12)
**Shipped 2026-05-12:**
- γ-0: Anthropic provider with prompt caching (`feat(llm)` `aad0fed`).
  `claude-opus-4-7` is the default; the SDK reads
  `ANTHROPIC_API_KEY` from env. System prompts are tagged
  `cache_control: ephemeral`.
- γ-1: `onto ingest <file>` v0+ (`feat(ingest)` `b670ca3`). Reads a
  single source file, dispatches the extraction template, produces
  a `node_create` proposal. `--dry-run` for prompt iteration.
- γ-3: rich proposal payload (`feat(proposals,ingest)` `7d50c91`).
  Schema now carries optional manifestation / language / requires
  / provides / forbids / rules / literal / sourceFiles so
  `onto proposal apply` produces a complete node in one step.
- γ-2: first end-to-end calibration on `src/core/integrity/hash.ts`
  with `claude-opus-4-7` end-to-end — 5/5 functions semantically
  equivalent, $0.08 per round-trip, 70s wall-clock. Full report:
  [`docs/legend/calibrations/HASH_TS_2026-05-12.md`](legend/calibrations/HASH_TS_2026-05-12.md).
- γ-4: static-edge inference (Layer 3, TS-first, `feat(static)`
  `62d8c86`). New `src/runtime/static/typescript.ts` uses the
  TypeScript compiler API to parse `import` / `export` declarations
  and emit `depends_on` / `uses_token` edges without an LLM call.
  Generic `collectSourceFiles(rootDir, extensions)` walker is the
  shared substrate for γ-5. CLI: `onto graph infer-edges <dir>`.
- γ-5: multi-file ingest (`onto ingest <directory>`, `feat(ingest)`
  `a25ade9`). Walks the tree, dispatches γ-1 per file.
  `parseIncludeFlag(--include)` for extension filtering (default TS).
  Stores the per-file source path under `outputs.files[0]` so γ-6
  can build the file→node index after apply. `computeCwdRelative()`
  uses `fs.realpathSync` to normalise macOS `/tmp` → `/private/tmp`
  symlinks.
- γ-6: edge-creation proposals (`feat(graph)` `9c16b9d`).
  `infer-edges --create-proposals` turns the γ-4 preview into
  `edge_create` proposals against already-applied nodes.
  Idempotent: skips `from_node_missing` / `to_node_missing` /
  `cross_branch` / `edge_already_exists` with explicit reasons.
- Walker AI provider indicator (`feat(walker)` `69424af`).
  `detectAiProvider(env)` returns a discriminated union over
  anthropic / ollama-cloud / ollama-local / none. Rendered above
  the focal cell so the operator always knows which provider the
  next dispatch will hit.
- `--include` flag + Vibe-Reasoning runbook (`feat(ingest)` `bc350ce`).
  Non-TS source extensions are now first-class for ingest; the
  Vibe-Reasoning Python repo is the documented out-of-tree calibration
  pilot ([`docs/legend/calibrations/VIBE_REASONING_PROCEDURE.md`](legend/calibrations/VIBE_REASONING_PROCEDURE.md)).

### Phase δ — verification + inspector (~6–8 h)
Layer 4 (inspector) + Layer 6 (verification). After δ, the user can
ingest, inspect each node interactively, run the homeomorphism check,
and get a report with concrete deltas.

### Phase ε — self-ingestion (~6–10 h)
Run on the Ontology repo itself. Iterate extraction prompts until the
report stabilises. Document findings in
`docs/MATHEMATICAL_CLAIMS.md` as a new T2 claim with measured
$\varepsilon$ on the divergent set.

### Phase ζ — release + Open-Prompt seed (~3–5 h)
[`LEGEND.md`](LEGEND.md) is the 0.4.0 release note (authored
2026-05-13; covers γ-0 through δ-2 + the post-γ-7 hardening sweep).
[`OPEN_PROMPT.md`](OPEN_PROMPT.md) is the sibling protocol spec —
spec-only in this release, v0 implementation targeted for 0.5.0
after Phase ε ships the data the spec presumes.

**Total estimate: 30–40 hours of focused work. 4–6 sessions.**

---

## 7. What this validates publishably

After Phase ε we can claim, **with data**:

> *There exists an approximate left adjoint $G$ of the Ontology compile
> functor $F$, and we have measured the round-trip homeomorphism on
> the Ontology codebase. Of the 90+ source files, $X\%$ are
> $\varepsilon$-equivalent under $F \circ G$ with $\varepsilon = 0.3$.
> The intent-resistant complement is concentrated in
> [specific categories]: $Y$ algorithmic files, $Z$ schema files,
> $W$ stateful UI files. The Inspector primitive makes the resulting
> $N$-node network human-readable at a per-node cost of 1 LLM call.*

That is a publishable claim. It is the operational construction of an
adjunction in a non-trivial category, with quantified $\varepsilon$.
Adjoint functor theorems are central to category theory; an
operational adjoint with measured tolerance is the kind of artefact
that builds bridges to the math literature.

### 7.1 γ-2 calibration — first empirical data point (2026-05-12)

After γ-0 (Anthropic provider), γ-1 (`onto ingest <file>` command),
and γ-3 (rich proposal payload) landed, we ran the first end-to-end
round-trip on `src/core/integrity/hash.ts` — a small, pure, single-
file utility module of the kind the design hypothesises lives in
$\mathcal{C}_{\text{faithful}}$. Full report:
[`docs/legend/calibrations/HASH_TS_2026-05-12.md`](legend/calibrations/HASH_TS_2026-05-12.md).

| Metric | Value | Notes |
|---|---|---|
| Model | `claude-opus-4-7` | frontier, via the Anthropic adapter (γ-0) |
| Semantic equivalence | **5 / 5** functions | vs **3 / 5** for the β-2 `qwen2.5-coder:3b` baseline |
| LoC-churn distance | $d \approx 1.2$ | divergent under the §2.5 metric (verbose-docstring direction) |
| Cost | ~$0.08 per round-trip | extract $0.033 + compile $0.045 |
| Wall-clock | ~70s | 11s extract + 58s compile |
| Cache hit | 0% (initial) | system prompt 2024 < Opus 4.7's 4096-token cacheable minimum |

The two β-2 divergences — `hashContext` and `hashRun` reaching for
non-canonical `JSON.stringify` — are correctly avoided at the γ-2
tier because the extracted intent surfaces the load-bearing invariant
in `rules` ("REQUIRE: object hashing uses fast-json-stable-stringify
… never JSON.stringify") and the forward compile honours it.

This is **one data point** (n = 1) on the path to the Phase ε claim
above. It is necessary-but-not-sufficient evidence: the pipeline
works end-to-end on a non-trivial real file with a frontier model;
it does not yet validate the adjunction claim at scale. Phase ε is
where the publishable claim materialises.

**One useful finding for Phase δ design.** The LoC-vs-semantic gap
surfaced here (`hash.ts` ranks **divergent** under the §2.5 LoC
metric but **ε-equivalent** by behaviour, because divergence is
concentrated in docstring density rather than semantics) suggests
`verify-homeomorphism` (Layer 6 / δ-2) should report **both** a LoC
distance and a behaviour-aware distance per node. Pure LoC
over-estimates intent divergence when the regenerated file makes a
defensible architectural choice the original author elided. The two
metrics together carry more signal than either alone — and the
behaviour-aware one is cheap when an existing test suite exists for
the target file.

---

## 8. Risks and open questions

1. **Token normalisation might be the hard problem.** The path
   fibration helps within a directory but cannot fix the case where
   `src/auth/user.ts` says `provides: user_auth` and
   `src/services/login.ts` says `requires: authentication`. The LLM
   might or might not collapse them correctly. *Mitigation*: ship the
   "honest punt" first (user reviews + normalises with `node update`),
   then add embedding-based suggestion later.

2. **LLM extraction quality varies by domain.** Idiomatic TypeScript
   patterns extract well; obscure framework-specific code less so.
   *Mitigation*: ship Phase γ on a small known-good test case first
   (we have several Ontology files that are clearly intent-faithful),
   measure, then expand.

3. **The verification step is expensive.** Re-compiling every
   ingested node and diffing is $O(n)$ LLM calls. *Mitigation*:
   verification is on-demand, not part of ingest. The user runs
   `verify-homeomorphism` selectively, on the nodes they care about.

4. **Open-Prompt's regulatory framing is ambitious.** Adoption needs
   actors who *want* to publish their intent. *Mitigation*: ship the
   technical primitives anyway; the use cases will find them.

5. **Self-ingestion might surface design flaws in Ontology itself.**
   This is a *feature* — exactly the kind of feedback the project
   needs. But it may also feel destabilising: "the tool is telling us
   our own code is intent-resistant." That is fine; act on it.

---

## 9. Sequencing and the immediate next step

Status as of 2026-05-12:

1. **Pre-foundation §1–§6** — **DONE** ([e847417]).
2. **Phase β** — **DONE** (β-1/β-2/β-3 + the two post-merge review fixes; see §6).
3. **β-2 manual calibration on `hash.ts` with `qwen2.5-coder:3b`** —
   **DONE.** 3/5 semantic equivalence; two divergences on canonical-
   JSON invariants. Result: Phase γ will pay off, but only with a
   frontier model and a structured extraction template — exactly
   what γ-0 / γ-1 / γ-3 deliver.
4. **Phase γ (extraction core)** — **DONE.**
   γ-0 (Anthropic provider) + γ-1 (single-file `onto ingest`) +
   γ-3 (rich proposal payload) + γ-2 calibration (5/5 ε-equivalent
   on `hash.ts` with `claude-opus-4-7` end-to-end, see §7.1) +
   γ-4 (TS-first static-edge inference) + γ-5 (`onto ingest
   <directory>` multi-file) + γ-6 (`infer-edges --create-proposals`)
   all merged. The walker now shows the active AI provider above
   the focal cell, and `--include` accepts non-TS extensions for
   the Vibe-Reasoning pilot. All prerequisites for Phase ε
   (out-of-tree pilot + self-ingestion sweep) are in place.
5. **Phase δ** — verification + inspector. **DONE.** δ-1 =
   `onto node inspect <id>` shipped (`8779acc`): one LLM call per
   node lifetime, cached as `node.translator` with automatic
   `sourceHash` invalidation. δ-2 = `onto verify-homeomorphism`
   shipped (`29b330c`): dual-distance (LoC + structural Jaccard)
   with five-label verdict folder, the finding from §7.1.
6. **Phase ε** — self-ingestion. **Next active stream.** All
   infrastructure is in place; the moment of truth is the API
   spend. The Vibe-Reasoning runbook
   ([`legend/calibrations/VIBE_REASONING_PROCEDURE.md`](legend/calibrations/VIBE_REASONING_PROCEDURE.md))
   is the smaller out-of-tree pilot, and its remaining steps
   (re-run `verify-homeomorphism` over the 22 existing nodes; then
   re-ingest + measure) are the immediate next API spend before
   self-ingestion on the Ontology repo itself.
7. **Phase ζ** — release.

The immediate next step: re-run `verify-homeomorphism --all-artifacts`
over the existing 22 Vibe-Reasoning nodes (no re-ingest) to measure
how much the γ-7 MANDATORY EXPORTS block alone moves the structural
Jaccard, then re-ingest under the new prompt template and measure
the second delta. After that, scale the same loop to the Ontology
codebase itself — Phase ε publishable claim.

---

*Document version: draft 4. Authored 2026-05-11; revised 2026-05-12
to reflect Phase β + Phase γ + Phase γ-7 + Phase δ all shipped
(commits `a09e1d7`, `04f730c`, `881506a`, `157d367`, `5da798c`,
`2cbaa32`, `aad0fed`, `b670ca3`, `7d50c91`, `caf16f4`, `ac0a45f`,
`62d8c86`, `a25ade9`, `9c16b9d`, `69424af`, `bc350ce`, `eee5610`,
`bad6840`, `4dd59b1`, `23ac144`, `2e8853e`, `29b330c`, `8779acc`)
and the γ-2 calibration data point. Phase ε (self-ingestion on the
Ontology codebase) is the next active stream — all infrastructure
in place; remaining gate is API spend to measure $\varepsilon$.*
