# VISION — what Ontology is for

> Orientation doc. This is the *why* and the *destination*. It does not
> track open work — [`ROADMAP.md`](ROADMAP.md) stays the single source of
> truth for what is in flight. When the vision and the roadmap disagree
> about status, the roadmap wins; this file only sets direction.

## The one-sentence thesis

**In the era of AI codegen, the scarce resource is no longer writing code
— it is auditing, trusting, and steering it. Ontology makes *intention* a
recompilable, mathematically-structured surface that is far cheaper to
audit and re-edit than the generated code it projects to.**

The developer stays in command. They just command from a higher-leverage
layer.

## Why this is not "MDA again" — the honest version

Model-Driven Architecture (OMG, ~2001) and round-trip engineering already
proposed "the model is the source, the code is generated." They failed.
It is intellectually dishonest to pretend Ontology's *technique* is new:
LLM codegen, code→spec extraction, characterization tests, bidirectional
lenses, AST contract checking — all standard.

The new variable is **not** in the toolbox. It is in the world:

- **MDA failed in a world where humans wrote the code.** Generating code
  from a model solved a problem nobody acutely had — the bottleneck was
  *thinking*, and humans were already the generators. Round-trip was lossy
  and, fatally, nobody measured the loss; the tools promised a fidelity
  they did not have.
- **The AI era inverted the bottleneck.** The AI now generates volume no
  human can review at the speed it ships. The scarce resource flipped from
  *writing* to *understanding / trusting / directing*. That asymmetry —
  developer vs. AI throughput — did not exist in 2001.

So Ontology's claim is **not** "intention-first development" (asserted for
20 years). It is: *intention recompilable, with measured fidelity, is a
higher-leverage audit-and-edit surface than code, precisely because of the
developer/AI asymmetry.* The thing that makes it matter is the context,
not any single component.

And the correction to MDA's fatal flaw is the project's whole ethos:
**MDA hid the round-trip loss; Ontology measures it and shows where it is
absent.** Not "trust the fidelity" — *here is exactly how far it holds and
where it breaks.* See [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md)
for the tiered ledger that keeps this honest.

## The shape, in the math we already built

The categorical structure is not decoration here — it is what makes the
intention layer *auditable* instead of a comment that can lie. If you are
going to review at the level of intention, that layer must provably
correspond to the code.

- **The category of intent** — the kernel: typed nodes (objects) and
  edges (morphisms), an append-only hash-chained event log, replay. This
  is the thing F and G act on.
- **F : Intent → Code** — the forward functor (the compiler). Walks the
  graph in topological order and emits artifacts.
- **G : Code → Intent** — the inverse functor (extraction / Project
  Legend). Lifts existing code back into intention.
- **Laws: F∘G ≈ id** — the round-trip, *measured* (kernel-of-equivalence
  map, lens laws under edits, contract/behaviour axes). This is the audit
  guarantee: the degree to which the intention layer faithfully stands in
  for the code.

The binding constraint, confirmed four times, is **G (extraction)
quality**, not F. That is the honest frontier, and it is exactly the thing
that makes "audit at the intention layer" trustworthy or not — which is
why the recent ficha / contract work (and the `--prune` surface-safety fix)
is load-bearing for *this* vision, not a side-quest: a contract that
over- or under-declares is an audit surface that lies.

## The destination ("usable"), restated from the asymmetry

You sit in front of Ontology over a real project. The Walker is your
cabin: you edit **intention**. Because intention is small, legible, and
law-checked, you can *audit* what the system intends far faster than you
could review the code it generates. A governed agent loop keeps the code
in verified correspondence — regenerate, behaviourally probe, heal drift —
and escalates to you only where judgment is required, with the honest
reason. Everything is a versioned, measured trace of how code descended
from intention.

"Usable" is not "the code maintains itself." It is **"you audit and steer
at the leverage point, and the machine does the volume under laws you can
check."**

## Roadmap, reordered from this vision

This reorders the existing [`ROADMAP.md`](ROADMAP.md) follow-ups around the
asymmetry thesis. It does not change their status — it changes *which one
matters first* given that the goal is an auditable steering surface.

1. **The audit surface must not lie (now).** Finish making the intention
   layer trustworthy: contract accuracy (the ficha cleanup + `--prune`
   surface-safety work), O1 signatures for the presence-only exports, rule
   denoising. An audit surface is worthless if it over/under-declares.
   *This is the precondition for everything below.*
2. **One-shot round-trip in the Walker (close).** Wire the four primitives
   (`regenerate`/`probe`/`rules`/`ficha`) into a single governed loop you
   drive from the cabin: edit a node's intention → regenerate (consensus)
   → verify (structural + behavioural + rules) → write + re-anchor, or
   refuse with the reason. This is the *unit of usability* — and the unit
   the dynamic loop is built from.
3. **Grow the trustworthy core (G quality).** Attack the measured neck:
   frontier re-extraction of the worst fichas, resolved signatures,
   prompt refinement in the Walker loop. Re-measure the kernel after each
   step. The audit surface widens as the core of safely-regenerable nodes
   grows past a minority.
4. **The intuitive interface + agent deployment (the heart of the new
   vision — least built).** This is what *your* framing puts at the centre
   and where the code has reached least: a Walker v2 that makes editing
   intention more intuitive than current IDE/agent interfaces, and a
   supervised dynamic agent loop (on the ζ verify-refine runtime + cold
   subagent fan-out) that observes drift / intent edits, dispatches
   regenerate-verify-refine cycles, heals within the gates, and escalates
   the rest. Safe only to the degree the measurement (step 1, 3) governs
   it.
5. **Beyond the toy graph.** Run it on a real, non-self project to prove
   the method generalises off its own 228-node code.
6. **The trace (continuous).** Every measurement is a brushstroke of the
   honest record: "here is how code is built from intention, exactly how
   well it works, and exactly where it breaks."

## The invariants that keep it honest (and possible)

1. **Measurement is the control signal, not decoration.** It is what makes
   the dynamic loop safe — the enabler MDA never had.
2. **The human steers; the agents build.** Nothing is written over working
   code without passing the gates; the human decides in ambiguity.
3. **Honest about the non-core.** The system always shows what it cannot
   yet maintain. That visibility is the entire difference from MDA.

---

*This doc sets direction. Status, metrics, and open work live in
[`ROADMAP.md`](ROADMAP.md); claim tiers in
[`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md); design depth in
[`PROJECT_LEGEND.md`](design/inverse/PROJECT_LEGEND.md) and
[`MATHEMATICAL_MODEL.md`](design/laws/MATHEMATICAL_MODEL.md).*
