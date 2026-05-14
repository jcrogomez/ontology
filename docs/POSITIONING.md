# POSITIONING — Phase ε Framework

> *The brujula: what Ontology promises, what each calibration must
> measure, and what stays human.*

**Created:** 2026-05-13.
**Role:** durable strategy and pre-registration template.
**Companions:** [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §3.10
(the load-bearing T4 claim), [`PROJECT_LEGEND.md`](PROJECT_LEGEND.md)
(the engineering plan), and each concrete
`docs/legend/calibrations/SELF_INGEST_HYPOTHESIS_<date>.md`
(the frozen experiment plan for a specific run).

This document is the narrative contract. It does **not** contain a frozen
Phase ε hypothesis. Concrete hypotheses live in dated calibration files so
their perimeter, predictions, commit hash, and success criteria can be
audited without keeping two documents in sync.

---

## 1. Devtools Frame

**The product, in one sentence:**

> Ontology is the audit layer for agent-written code. It turns a codebase
> into an auditable intent network, regenerates the subcategory that
> round-trips faithfully, and preserves human authorship of the rest with
> full traceability.

**What it explicitly does not promise:**

> Ontology does not promise to regenerate 100% of software. It promises to
> **audit 100%**, **regenerate** the intent-faithful subcategory
> $\mathcal{C}_{\text{faithful}}$, and **surface** the intent-resistant
> complement $\mathcal{C}_{\text{resistant}}$ as a named, queryable
> boundary — code that must remain human-authored but whose authorship is
> now traceable.

This split is the load-bearing move. Tools that promise full automation
lie about the resistant complement; tools that ignore the complement leak
it into the trust surface. Ontology names it.

**Sequencing of audiences (2026 -> 2028).** The primary 2026 frame is
devtools: engineering leaders and builders who need governance over
agent-written code. Adjacent frames — compliance / governance buyers
(EU AI Act, NIST AI RMF, SEC AI-washing) — read the same machinery as an
evidence layer for AI-assisted SDLC, but those buyers do not transact
pre-1.0 / pre-SOC2 / pre-support. They are a planned expansion, not the
current pitch. Mixing the two before the devtools audience has accepted
the audit layer dilutes both.

---

## 2. Measurement Matrix

A Phase ε report must not collapse the result into one percentage. It
must publish a matrix over orthogonal axes. Each axis is a distinct
relation a regenerated artifact $F(G(c))$ can have with its original
$c$; axes overlap freely.

| Axis | What it asserts | Canonical states | Measurement source |
|---|---|---|---|
| **Contract-equivalent** | The declared predicates are preserved or intentionally weakened/strengthened | `pass`, `fail`, `unknown`, `not-measured` | `requires` / `provides` / `forbids` comparison plus validator verdict |
| **Structural-equivalent** | Exports, top-level declarations, and signatures are preserved | `pass`, `fail`, `partial`, `not-measured` | `verify-homeomorphism` structural Jaccard / declaration diff |
| **Behavior-equivalent** | Observable behaviour is preserved on a fixture set $T$ | `pass`, `fail`, `untested`, `not-applicable` | Project tests, targeted fixtures, runtime checks |
| **Intent-equivalent** | A reviewer accepts the regenerated artifact as expressing the same intention | `accepted`, `rejected`, `needs-human`, `not-reviewed` | Human review aided by `onto node inspect` / Walker |
| **Literal-required** | The code carries irreducible specificity and should remain human-authored | `true`, `false`, `candidate`, `unknown` | `node.literal`, reviewer tags, resistant-frontier taxonomy |
| **Cost-per-provider** | Fidelity is bound to money and latency | `{ provider, model, task, tokens, usd, wallClockMs }` | `--cost-estimate`, persisted run usage, provider routing |

The first five axes are about the relation between code and intent. The
sixth is operational: it converts the matrix into ROI by binding fidelity
to dollars. A report that reads "Behavior-equivalent at $0.04/file under
Ollama vs $0.12/file under Anthropic" says something a single percentage
never does.

**Axis-relative faithful subcategories.**
[`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §3.10 names a single
distance $d$ with threshold $\varepsilon \approx 0.3$; δ-2 already ships
two distances (LoC + structural Jaccard). The matrix is the next
refinement: every axis defines its own faithful subcategory
$\mathcal{C}_{\text{faithful}}^{(\text{axis})} \subseteq \mathcal{C}$.
A Phase ε report is the matrix of those subcategories, not one universal
claim that all notions of equivalence agree.

---

## 3. Pre-Registration Template

Every self-ingestion run must start with a dated hypothesis file:

```text
docs/legend/calibrations/SELF_INGEST_HYPOTHESIS_<YYYY-MM-DD>.md
```

That file is frozen before the run and must declare:

- **Commit hash.** The exact code state being measured.
- **Perimeter.** Included directories, excluded directories, language
  extensions, and expected file count.
- **Primary audience.** Devtools unless explicitly stated otherwise.
- **Faithful predictions.** File classes expected to land in the
  faithful region, with rationale.
- **Resistant predictions.** File classes expected to require human
  authorship or literal preservation, with rationale.
- **Measurement matrix.** Which axes from §2 are measured automatically,
  manually, or not at all.
- **Cost plan.** Ollama/local pilot first, paid provider second, with
  budget gates.
- **Frontier taxonomy.** A multi-label tag set; never a single mutually
  exclusive label.
- **Success criteria.** What counts as validation, contradiction, or
  useful discovery.
- **Fixture plan.** The deterministic fixture, if any, that mirrors the
  predicted buckets.

The purpose of pre-registration is not to force a clean result. It is to
make the result scientifically legible. Confirmation is validation.
Contradiction is discovery. Post-hoc taxonomy without a committed
forecast is weaker evidence.

---

## 4. Frontier Taxonomy

The intent-resistant frontier is multi-label. A file can be both
`io-bound` and `structural-drift`; a prompt file can be both
`literal-required` and `prompt-sensitive`. Reports must store the
frontier as a set of attributes per file and aggregate both single tags
and intersections.

Canonical attributes:

| Attribute | Meaning |
|---|---|
| `pure-transform` | Mostly deterministic input -> output logic |
| `schema-driven` | Behaviour is dominated by declared schema or type shape |
| `algebraic-lawful` | Correctness is tied to algebraic laws or exhaustively tested tables |
| `declarative-validator` | Contract/rule evaluation is explicit and local |
| `cli-parsing` | Behaviour depends on command-line parsing, flags, or process exit shape |
| `io-bound` | Behaviour depends on filesystem, network, subprocesses, env, or clocks |
| `adapter-boundary` | Boundary to an external service or model provider |
| `prompt-sensitive` | Semantics live in prompt/template wording |
| `literal-required` | Verbatim content is the source of truth |
| `operational-glue` | Locking, retry, batching, orchestration, cache invalidation |
| `tui-rendering` | Terminal UI layout / interaction semantics dominate correctness |
| `human-authored` | Reviewer decides the code should remain authored, not regenerated |
| `contract-missing` | No declared contract sufficient to evaluate equivalence |
| `structural-drift` | Declaration/export/signature shape changed materially |
| `behavior-drift` | Fixtures or runtime checks disagree |
| `not-reviewed` | Human intent review has not happened yet |

Reports should aggregate intersections, for example:

```text
io-bound ∧ structural-drift: 12 files
literal-required ∧ prompt-sensitive: 3 files
schema-driven ∧ behavior-equivalent: 9 files
```

Those intersections are product signal. They identify which repo regions
can be governed by intention, which require literal preservation, and
which need better contracts before a model can be trusted.

---

## 5. Human Authorship Boundary

The intent-resistant complement $\mathcal{C}_{\text{resistant}}$ is not a
defect to be reduced to zero. Pushing it toward zero by aggressive intent
extraction is a category error: some code carries irreducible operational
specificity (literal config, OS calls, prompt strings) that is correctly
preserved by `node.literal`, not "fixed" by re-extraction.

Ontology's promise on this complement:

- **100% audited.** Every file in $\mathcal{C}_{\text{resistant}}$ has a
  node, an event chain, and a provenance record.
- **Regenerated only when faithful.** Code outside the faithful
  subcategory remains literal or human-authored.
- **Traceable authorship.** The event log records what changed, which
  proposal or run produced it, and when human review accepted or rejected
  it.

This is the answer to "agents replace developers": agents replace the
regenerable subcategory; the resistant complement is where human
authorship remains valuable, explicit, and auditable.

---

## 6. Fixture Rule

Every durable claim about the Phase ε matrix should eventually have a
small deterministic fixture. The fixture must mirror the hypothesis
1:1: if the hypothesis predicts pure transforms, schemas, CLI parsing,
IO adapters, and literal-required prompt/config as distinct regions, the
fixture must contain at least one file for each region.

The test is not "the demo looks good." The test is:

```text
ingest -> apply -> infer edges -> verify-homeomorphism -> expected matrix
```

If a fixture file lands outside its predicted bucket, either the matrix
or the hypothesis is wrong. That is a useful failure and the path from
empirical T2 toward a stricter, reproducible claim.

---

## 7. How This Document Evolves

- §1 and §5 are the durable narrative. They change only when product
  strategy changes.
- §2 changes only when the verify report adds or retires a measurement
  axis. Any such change should update
  [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §3.10 in the same
  commit.
- §3 is a template. Concrete predictions belong only in dated
  `SELF_INGEST_HYPOTHESIS_<date>.md` files.
- §4 is the canonical tag vocabulary. New tags are allowed, but reports
  must preserve old tags for comparability.
- §6 is the reproducibility rule for promotion beyond a one-off
  calibration.

Each `docs/legend/calibrations/SELF_INGEST_<date>.md` opens with:

> *Run conducted under the framework declared in `docs/POSITIONING.md@<commit>`.*

That binds the report to the framework version current at run time.

---

*This document is meant to be stable and boring. Concrete forecasts live
in dated calibration files; this file explains what a valid forecast must
contain.*
