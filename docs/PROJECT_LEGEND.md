# Project Legend — Ingest, Homeomorphism, and the Open-Prompt Layer

> *Legens* in Latin: "the one who reads". A legend (in maps) is the key that
> tells you how to read the territory. Project Legend is exactly that — the
> key that turns an existing codebase into a readable, navigable network of
> intention; the operational construction of the inverse of the compile
> functor; and the protocol layer that makes "what an organisation runs"
> verifiable without exposing its source.

Status: **design document, awaiting implementation start.** All pre-foundation
work (Project Legend gaps §1–§6) is shipped on `main` as of commit
[e847417]; the system is ready for Layer 1–5 below.

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

The new command (Layer 4 below):

```
onto node inspect <nodeId> [--with-neighbors] [--no-cache]
```

dispatches the LLM **once per node** to produce:

1. A one-sentence summary of the node's role in the network.
2. The role of each of its `provides` tokens, in plain language.
3. The role of each incident edge — what relation it enforces.

The output is cached in `node.translator` (an opt-in schema field) and
in a sibling `node_inspected` event. Subsequent inspections read the
cache; the LLM is not called again unless `--no-cache` is passed.

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
| 1 | Multi-file orchestration (`compile run-batch`, `--target`) | pending | ~120 |
| 2 | `node.literal` escape hatch + schema migration | pending | ~50 |
| 3 | Static analysis edge inference (TS first, tree-sitter) | pending | ~150 |
| 4 | `onto node inspect` (translator + cache) | pending | ~120 |
| 5 | Path fibration helpers, `computeFiberBy` generalisation | pending | ~80 |
| 6 | Verification framework (`verify-homeomorphism`, batch report) | pending | ~150 |
| 7 | The `onto ingest <path>` command itself | pending | ~250 |
| 8 | Open-Prompt signing + replay (out of scope for v1) | future | ~260 |

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
irreducible parts to a literal field, then re-verify).

**Layer 7 — `onto ingest <path>`.** The integrator. Walks the file
tree, dispatches the extraction prompt per file, dedupes tokens
against the path fiber, creates proposals (so the apply step is
audit-traceable), infers static edges, calls the LLM once more per
pair-of-related-files to suggest semantic edges. End-of-run report.

---

## 6. Phase plan

### Phase α — foundation (DONE)
Items §1–§6 from the pre-foundation review. `main` is here.

### Phase β — pre-ingest infrastructure (~8–10 h)
Layers 1 + 2 + 5. Multi-file compile, target path, literal escape,
path fibration helpers. After β, the user can write nodes by hand and
regenerate / diff a small project against its source.

### Phase γ — extraction core (~6–8 h)
Layer 3 (static edges) + Layer 7 (ingest command itself, TS-only).
After γ, `onto ingest path/to/small-ts-project` produces a network.
Token normalisation via the path fibration. Output: a proposal
batch the user can review with `onto proposal list / apply --all`.

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
`LEGENS.md` becomes a release note. `OPEN_PROMPT.md` is a sibling
document with the protocol skeleton. Signing + replay land in a
follow-up.

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

The user-approved sequence:

1. **Pre-foundation §1–§6** — **DONE** ([e847417]).
2. **Phase β** — Layers 1, 2, 5. Starting now. The immediate next
   commit is Layer 1: `compile run-batch` + `--target <path>`.
3. **Calibration pause** after β. With Layers 1 + 2 + 5 in place we
   can do a manual proof-of-concept: take a single Ontology source
   file, hand-write its intent node, compile to a target path, diff.
   If the diff is small, we know Phase γ will pay off. If the diff is
   large, we iterate on the extraction prompt format before spending
   the γ work.
4. **Phase γ** if calibration passes.
5. **Phase δ**.
6. **Phase ε** — self-ingestion. The moment of truth.
7. **Phase ζ** — release.

---

*Document version: draft 1. Authored 2026-05-11 against the Ontology
state at commit `e847417`. To be re-versioned after Phase β lands —
the layer estimates above will be replaced with measured numbers.*
