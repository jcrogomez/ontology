# Related Work — the 2026 convergence, and what Ontology adds

> Paper-adjacent, **living** (not a dated/immutable calibration record). This
> is the related-work section for the extraction-vs-capacity study whose spine
> is [`calibrations/EXTRACTION_CAPACITY_CLASSIFIER_PREREG_2026-07-21.md`](calibrations/EXTRACTION_CAPACITY_CLASSIFIER_PREREG_2026-07-21.md).
> Companions: [`../VISION.md`](../VISION.md) ("why this is not MDA again"),
> [`../meta/POSITIONING.md`](../meta/POSITIONING.md) (devtools frame),
> [`../MATHEMATICAL_CLAIMS.md`](../MATHEMATICAL_CLAIMS.md) (T1–T4 honesty).
> The *executor-economics* signal set (Stanford intelligence-per-watt, DSpark
> draft/verify, SLM-agents, Sakana Fugu) is catalogued separately in
> [`../design/proposals/LADDER_ECONOMICS.md`](../design/proposals/LADDER_ECONOMICS.md) §1
> and is not repeated here; this document covers the *architecture, substrate,
> cost-method, and product* axis.

## 0. The shape of the field in mid-2026

Through July 2026 a cluster of industry results converged, independently, on
pieces of the architecture this project already runs. Each nailed one component
— an auditable log, a shared ontology substrate, a cost-first design discipline,
a closed signal→code loop — and each did so **without** the layer Ontology
argues is load-bearing: a versioned, law-checked model of *intent* sitting
between the human and the generated artifact, with the round-trip
`F∘G ≈ id` measured rather than asserted.

The honest framing (per [`VISION.md`](../VISION.md)): none of Ontology's
individual techniques is new — event sourcing, knowledge graphs, characterization
tests, bidirectional lenses, LLM codegen are all standard. The contribution is
the **synthesis** and, above all, the **measured boundary** between the
intent-faithful subcategory it regenerates and the intent-resistant complement
it refuses to fake. The five works below are the strongest contemporaneous
evidence that the market is climbing toward this synthesis from separate
faces — and, read together, they triangulate exactly the gap Ontology fills.

## 1. Event-sourced, auditable agent runtimes

**Nakajima, *The Log is the Agent* (arXiv 2605.21997)** and its follow-up
***Regimes* (arXiv 2606.10241).** ActiveGraph inverts conventional agent
design: an append-only event log is the source of truth, the working graph is a
*pure deterministic projection* of that log, and behaviors react to graph-shape
patterns. Three properties fall out — byte-identical deterministic replay
(via a content-addressed cache of LLM responses), cheap forking (branch at any
event; replay the shared prefix from cache, pay only for the divergent suffix),
and end-to-end lineage from goal to model call. *Regimes* builds a self-improving
loop on that substrate: diagnose failures into typed "regimes," route each to a
repairable pipeline "seam," let an LLM author a patch, and **promote only if a
held-out CONFIRM split does not regress** (+0.05–0.10 on LongMemEval; McNemar
p = 0.006 on the strongest split). Its honest negative — one split decayed
+0.09 → +0.01 by promoting inside the noise band — is the clearest published
statement of the over-promotion failure mode.

**Relation to Ontology.** This is the closest architectural relative to the
project's *runtime* half, and the mapping is near-exact: the content-addressed
cache is our `computeRunId = hash(input, model)` plus the served compile cache;
the hash-chained `events.jsonl` and replay law are our append-only log; the
regime→seam routing is our Gap A (extraction-gap → ficha repair) / Gap B
(capacity-ceiling → escalate) taxonomy with the gray-zone `semanticSplit`
ranking. What Ontology lacked — and imported from this work — is the *fork-at-a-
cut-point counterfactual* and the *held-out promotion gate*, now specified in
[`../design/proposals/FORK_AND_DIFF.md`](../design/proposals/FORK_AND_DIFF.md).
The load-bearing difference runs the other way: ActiveGraph's source of truth is
*operational history* (what happened); Ontology's is *intent* (what was meant),
and it measures whether code stays faithful to that intent. ActiveGraph has no
`G`, no round-trip, no fidelity question. The two are complementary layers, not
competitors — and the independent arrival at "log + forks + typed failure
regimes + held-out gates" is corroborating evidence for that runtime design.

## 2. Knowledge graphs / semantic layers as the durable substrate

**Phipps (Gates Foundation), *Your Moat Is Your Data Model* (AI Engineer World's
Fair 2026).** The foundation encoded 25 years of grantmaking (~$7B/yr, ~2,000
grants) into a single curated Neo4j knowledge graph served to Claude over MCP.
Thesis: the durable competitive advantage in enterprise AI is the *data model*;
the models and interfaces above it are rented commodities. The conference-wide
refrain — "the model is rented; the knowledge it leaves behind is your moat" —
recurred across Atlan and Runlayer sessions.

**Eifrem (CEO, Neo4j), shared semantic layer for agents.** Enterprises should
build *thin* agents over a shared ontology-based substrate rather than wiring
context into each agent by hand. Three pillars: a **business ontology** (what
things mean), a **technical ontology** (mapping to real data sources), and
**execution traces** that let agents improve and learn from each other. The
extended doctrine — Neo4j's "Six Dimensions of the Semantic Layer" (Definitions,
Discovery, Representation, Persistence, Retrieval, Management) — makes the
governance claim explicit: management "determines whether the semantic layer
serves as a reliable foundation or a source of systemic error," resolved by
human governance workflows and lineage tracking.

**Relation to Ontology.** These validate the project's *substrate and surface*
one level up from where Ontology sits. Eifrem's three pillars map pillar-for-
pillar: business ontology = the intent graph (fichas, rules, contracts);
technical ontology = manifestations and anchors (`outputs.files`), with the
separation already operational (`fichaHash` covers only the intent surface, so
re-anchoring does not void executor precedents); execution traces = our
`events.jsonl` + persisted runs + executor precedents (κ\* warm-starts). "Thin
agents over a shared substrate, human steers" is the Walker vision verbatim. The
Neo4j "Discovery" and "Management" dimensions are the sharpest contrast: their
*Discovery* is our `G` (automated structural extraction), and their *Management*
— the dimension they resolve with human governance — is precisely where Ontology
goes **beyond** the described state of the art, resolving it with *measurable
laws* (gates, drift anchors, round-trip) instead of process. Their own admission
that "the loop is only as sharp as the context it runs on," with context
maintained by hand, is the opening Ontology's automated, law-checked intent
graph is built to fill. Two orthogonal notes worth recording: Neo4j's
"behavioral discovery" (mining query logs for implicit structure) is the
external pattern behind [`../design/proposals/WAKEUP_SCANNERS.md`](../design/proposals/WAKEUP_SCANNERS.md);
their "shadow graphs" (old + new schema in parallel during migration) is a
concrete use case for the overlay option in
[`../design/proposals/BRANCH_MODEL.md`](../design/proposals/BRANCH_MODEL.md).
Where Ontology diverges: a Gates/Neo4j graph is *descriptive* — it stores data
for agents to query, and its metric is retrieval accuracy on multi-hop questions
(third-party deployments report 36–46% gains over vector-only retrieval).
Ontology's graph is *generative and verified* — it compiles to code and is
scored by round-trip fidelity. And at the project's scale (hundreds of nodes
over files + hash-chained events) a graph database is fashion, not necessity;
"semantic layer as code" over Git — which Neo4j's own "Persistence" dimension
endorses — is the deliberate choice.

## 3. Cost-first design discipline

**Eskildsen (turbopuffer), "napkin math" (Pragmatic Engineer, Jul 2026).**
Back-of-envelope estimates from a small table of *memorized* compute
fundamentals (RAM throughput, blob-storage $/GB, SSD random-read rates) exposed
that vector search databases were overpriced by orders of magnitude because they
kept everything hot in RAM. Storing vectors cold in S3 with intelligent caching
cut Cursor's search bill from $80K/mo to $4K/mo; turbopuffer reached $100M ARR
in 19 months on <$1M raised. The method's rule: get the *exponent* right;
coefficients don't matter at napkin resolution.

**Relation to Ontology.** The ethos is already the project's — "measure before
construct," the honest cost accounting of Move 3α, and
[`LADDER_ECONOMICS.md`](../design/proposals/LADDER_ECONOMICS.md) §3's explicit
refusal to fabricate watts/dollars. turbopuffer's architectural trick (never
re-pay for what is already computed and content-addressable; hot cache over cold
store) is *structurally the same lever* as the run cache + precedents + the
prefix-at-~$0 reuse in `FORK_AND_DIFF.md`. The actionable import is a
**fundamentals card** for the project's own stack (tokens/s per rung, wall-clock
per gate, $/draw, cache-hit rate, the "overnight budget" on 8 GB) — proposed as
a new section of `LADDER_ECONOMICS.md` — so any new design (does the E3 8-repo
sweep fit a weekend of local compute? what does a full fork-and-diff of the
13-node closure cost?) is estimated in minutes before compute is burned.

## 4. Autonomous signal → code loops (the commercial foil)

**PostHog, "self-driving software" (open beta, Jul 2026).** Background agents
("scouts") watch errors, session replays, and support tickets (Zendesk, GitHub,
Linear), deduplicate and cluster signals into reports, and an agent investigates
codebase + product data, branching: *actionable* → an automatically opened pull
request with CI and code review attached; *non-actionable* → the human inbox.
Post-deploy, whether the targeted metric moved feeds back as a new signal. Price:
a flat $15 per actionable PR, refunded if the report or code misses the bar.

**Relation to Ontology.** This is the first commercial instantiation of the
project's *dynamic* half — and the sharpest positioning foil in the set, because
it is built **without** the traceable half Ontology bets is indispensable. Its
loop runs signal → code directly; the "why" of each auto-patch lives in a PR
description and evaporates. Auto-patches accumulate; intent does not persist —
precisely the asymmetry [`VISION.md`](../VISION.md) predicts. Their only real
gate is the human PR review, whose cost scales linearly with PR volume and tempts
rubber-stamping; an intent layer raises the review to approving an intent delta
(the ficha) *once*, with deterministic gates verifying the code conforms — and
makes the [`../design/proposals/OPEN_PROMPT.md`](../design/proposals/OPEN_PROMPT.md)
question ("is this machine-originated intent benign and competent?") operational
rather than philosophical. Their signal → dedup → investigate → branch funnel
validates the executor's shape; the one move they make that Ontology does not is
*cross-node clustering* of related failures before spending investigation (a
cheapening opportunity for the executor). And their billable atom — "$15 per
verified actionable change" — is independent corroboration of the project's own
napkin metric: **cost per closed node / cost per flip** (§3). The gap this leaves
is the bridge from PostHog's category to Ontology's: a production error is an
unwritten behavior fixture; governed, the loop is telemetry → a proposed fixture
no one authored → the executor closing it behind green gates.

## 5. Synthesis — what is shared, what is Ontology's alone

Read together, the five works triangulate the project's architecture from four
faces:

| Face | External exemplar | Ontology's counterpart |
|---|---|---|
| Auditable runtime (log, forks, gates) | ActiveGraph / Regimes | `events.jsonl` + run cache + executor + `FORK_AND_DIFF` |
| Intent/knowledge substrate + thin agents | Gates Foundation, Eifrem/Neo4j | the intent graph + Walker + `onto mcp` |
| Cost-first discipline | turbopuffer / napkin math | `LADDER_ECONOMICS`, "measure before construct" |
| Autonomous signal→code loop | PostHog self-driving | the governed executor (`onto execute`) |

What none of them has, and what the paper claims as the differential:

1. **A forward functor `F : Intent → Code` *and* its inverse `G`**, with the
   round-trip `F∘G ≈ id` measured empirically rather than assumed. The others
   have a graph, a log, or a loop — none has the bidirectional pair or the
   fidelity metric.
2. **A named, queryable resistant complement.** Ontology regenerates the
   intent-faithful subcategory and *surfaces* the intent-resistant remainder as
   a boundary (extraction-gap vs capacity-ceiling), instead of promising full
   automation and quietly failing on the complement (PostHog) or leaving it
   undiscussed (the substrate camp).
3. **Laws over process for trust.** Where Neo4j's "Management" dimension and
   PostHog's PR review resolve trust with human workflow, Ontology resolves it
   with deterministic gates, drift anchors, and the round-trip — trust that is
   *checked*, and graded honestly T1–T4 rather than asserted.
4. **Intent as the source of truth.** ActiveGraph makes the *log* primary;
   Gates/Neo4j make the *data model* primary; Ontology makes *intent* primary
   and treats both the log and the graph as instruments that audit it.

The claim under test in the accompanying study is deliberately non-categorical:
for bespoke intent the binding constraint on LLM regeneration is specification
(ficha) quality, not model capability; for canonical intent, model priors
substitute; and a cheap draw-disagreement instrument separates the two. The
related work above is the market evidence that the surrounding architecture is
converged and real — which is exactly why isolating *that boundary* is the
contribution worth measuring.

## Sources

- Nakajima, *The Log is the Agent* — arXiv 2605.21997; *Regimes* — arXiv 2606.10241; `github.com/yoheinakajima/activegraph`.
- Phipps (Gates Foundation), *Your Moat Is Your Data Model* — AI Engineer World's Fair 2026 (`youtube.com/watch?v=jt1Pbr_n6oU`).
- Eifrem (Neo4j), shared semantic layer for agents; Neo4j, *Six Dimensions of the Semantic Layer in Agentic AI World* (Medium, Jun 2026).
- Eskildsen (turbopuffer), "napkin math" — Pragmatic Engineer (Jul 2026); `github.com/sirupsen/napkin-math`.
- PostHog, *Self-driving mode* / *The self-improving loop* — `posthog.com/self-driving` (open beta, Jul 2026).
