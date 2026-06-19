# Ontology Roadmap

## Current state

Project Legend **Phases α–ε closed**; **Phase ζ (workflow runtime) is
active.** Phase ε (self-ingestion) closed 2026-05-26 on a 4-arm +
2-column substate: five iterative self-ingest runs (β / β′ / γ / δ / δ′)
plus the Move 3α multi-arm bake-off established that AST grounding
contributes a real Δ = +0.355 mean Jaccard, and the §3.10 adjoint claim
was upgraded T4 → T2. The fidelity-cartography matrix fills **3 of 5
columns** (structural + behaviour, and **contract filled 2026-06-09**
at $0 over the archived Arm A regens — pass rate 0.726 on 117/125
measured, [`CALIBRATION_LOG`](legend/calibrations/CALIBRATION_LOG.md)
§contract-column; intent remains explicit no-data). Phase ζ has shipped a workflow-runtime v0 (typed-node state
machine, predicate DSL, artefact-slot dataflow). The platform
underneath (network kernel, proposal system, semantic linker, compiler
with intent gate + `--runtime-check`, four categorical extensions,
plasticity layer, atomic writes, hardening sweep §3.1–§3.15) is closed.

**Rigor sprint (2026-06-01).** Three load-bearing categorical claims
moved up the tier ladder: Axiom 5 presheaf-restriction and Axiom 6 /
§3.2 compiler-functoriality promoted **T2 → T1** (laws test-pinned via
`tests/presheaf-sheaf-laws.test.ts` + `tests/compiler-functoriality.test.ts`
and the new `src/kernel/graph/artifact-category.ts`), and §3.10's adjoint
reframed as a *probabilistic / enriched* functor with a shipped, tested
variance-measurement core (`src/laws/verdict-variance.ts`) — it
stays T2 (only the budget-gated real-LLM N-run remains). A pinned
**negative** result: context gluing is a *separated presheaf*, not a
sheaf / colimit (the gluing axiom fails for agreeing sections). A second
pass closed the two cheap *load-bearing* claims: **Axiom 2** (crash-atomic
durable event log + advisory lock — the code had already shipped, the
ledger entry was stale; pinned by `fs-json.test.ts` + `advisory-lock.test.ts`)
and **§3.9 validator port** (closed-world parity == Boolean oracle,
exhaustively pinned by `tests/runtime/topos/closed-world-parity.test.ts`)
→ both T1. **T1 count 8 → 13.** Detail in
[`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §Axiom 2, §Axiom 5,
§Axiom 6, §3.9, §3.10.

**Where to look:**
- This file is the single source of truth for what is open. Daily review findings roll in here, not into dated snapshots.
- ε run history + hypothesis triplets: [`legend/calibrations/CALIBRATION_LOG.md`](legend/calibrations/CALIBRATION_LOG.md).
- Per-PR / per-commit detail: [`RELEASE_NOTES.md`](RELEASE_NOTES.md).
- Move 3α TODO + resume point: [`legend/calibrations/SELF_INGEST_EPSILON_3A_TODO.md`](legend/calibrations/SELF_INGEST_EPSILON_3A_TODO.md).
- Design background: [`PROJECT_LEGEND.md`](design/inverse/PROJECT_LEGEND.md), [`POSITIONING.md`](meta/POSITIONING.md), [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md).

## Phase plan (Project Legend)

| Phase | Content | Status |
|---|---|---|
| α | Pre-foundation gaps §1–§6 (plasticity layer) | ✅ shipped |
| β | Multi-file compile + `--target`, `node.literal`, path fibration | ✅ shipped |
| γ | `onto ingest <file/dir>`, Anthropic provider, static-edge inference, rich proposal payload | ✅ shipped |
| δ | Inspector / translator (`onto node inspect`) + verification (`onto verify-homeomorphism`) | ✅ shipped |
| ε | β / β′ / γ / δ / δ′ self-ingest runs + Move 3α multi-arm bake-off (AST grounding Δ = +0.355 mean Jaccard, §3.1 circularity resolved); §3.10 adjoint T4 → T2 | ✅ closed 2026-05-26 (4-arm + 2-column substate) |
| **ζ** | Workflow runtime — typed-node state machine, predicate DSL, artefact-slot dataflow, behaviour-axis checker | 🟡 active — runtime v0 shipped; **first clean real-LLM pass 2026-06-09 (local, $0)**; frontier-quality pass still open |

## Open follow-ups

### Shipped 2026-06-18 (against the four-gap checkpoint below)

- **Gap 1 (trustworthy core) — done.** Deterministic ficha cleanup
  (`missingExports`/phantom-provides → 0) + a cloud-probed fixtures grind
  (`qwen3-coder:480b-cloud`, +89 self-validated fixtures) took the syncable core
  **47 → 136 / 221**. The order-ideal view (`onto status --blockers`,
  `MATHEMATICAL_CLAIMS` §3.11) shows 77 *batch*-syncable + the fix-first blocker
  antichain (`node_0021` alone blocks 82).
- **Gap 3 (Walker v2) — early shipped.** `:health` node dashboard +
  `:fichacleanup` / `:reanchor` governed one-shot controls.
- **Gap 4 (hygiene) — done.** NUL-byte guard fix; `check:nul` green.
- **Plus:** the governed **executor** (`onto execute`) with a premise capability
  ladder + child-process isolation of the draft behaviour check (unblocks IO/glue
  nodes — `node_0013` now closes by escalating 7B→cloud). See
  [`design/runtime/EXECUTOR_SPEC.md`](design/runtime/EXECUTOR_SPEC.md).
- **Still open: Gap 2** — the measured `onto execute` sweep over the calibrated
  sample (close-rate per terminal state). That number gates the Architect.

### 2026-06-18 checkpoint — the four product gaps

> **Superseded in part — see the "Shipped 2026-06-18" block above.** Gaps 1/3/4
> shipped that same day; the snapshot/numbers below (e.g. core 47/221) are the
> *pre-grind baseline* this plan was written against. Only **Gap 2** remains open.

The missing work is no longer "invent the primitives." The primitives now
exist: `onto regenerate`, `onto sync`, `onto status`, `onto execute`,
`onto ficha`, `onto probe`, `onto rules`, drift anchoring, and the read-only
MCP surface. The remaining gap is **trusted surface area plus a humane cabin**:
more of the graph must be safe to regenerate, the executor must be measured on
a stronger model ladder, and Walker must become the place where a human can
actually steer all of this without mentally composing CLI commands.

Live snapshot from `onto status` / `onto ficha audit` on 2026-06-18:

- Graph: **228 nodes**, **713 edges**, **3670 events**; **221** nodes have a
  code shadow.
- Syncable core: **47 / 221** shadows have a behaviour fixture and no static
  rule violation; **174 / 221** are lower-confidence because they lack a
  behaviour fixture.
- Drift: **15** shadows have moved from the current anchor.
- Ficha quality: **4** nodes under-declare exports (**+5** missing exports),
  **76** nodes over-declare (**308** phantom provides), and **57** prose/noise
  rules remain to triage.

**1. Grow the trustworthy core (47/221 → measured majority).** This is the
highest-leverage reliability work. The system can only write with confidence
where a node has an honest ficha, a code shadow, a behaviour fixture, and clean
rules. The next pass should attack that stack in order:

- Close deterministic ficha gaps first: run the completion/prune worklist until
  `missingExports = 0`, phantom provides are materially reduced, and every
  added/removed contract token is backed by AST evidence.
- Turn prose rules into executable safety: route behavioural rules through
  `onto probe`, keep statically-decidable rules in `onto rules check`, and prune
  extraction-noise/prose only with human review.
- Add fixtures where they buy graph leverage: prioritize hard-dependency hubs,
  drifted shadows, CLI/runtime boundary modules, and nodes already in the
  calibrated sync sample.
- Re-measure with `onto status`, `onto ficha audit`, and a small `onto sync
  --dry-run --json` cohort. The success metric is not a perfect graph; it is a
  visibly larger core and fewer lower-confidence writes.

**2. Run `onto execute` on a frontier ladder over the calibrated set.** The
local 7B acceptance run in `SYNC_LOOP_SPEC.md` §8 put the honest floor at
**1/6 ≈ 17% clean** on the six-node core sample:
`node_0011`, `node_0017`, `node_0022`, `node_0026`, `node_0029`,
`node_0225`. The §8.1 determinacy probe showed that ficha pruning is real on
individual nodes but too small to rise above 7B run-to-run variance in the
aggregate. The next measurement should keep the sample fixed and change only
the capability ladder:

- Run `onto execute <sample...> --dry-run --allow-paid --json` with the model
  registry annotated so the ladder climbs local/free → frontier only after the
  cheaper rungs fail.
- Record terminal states per node: `closed`, `extraction-gap`,
  `capacity-ceiling`, `blocked-upstream`, `unverified-no-fixture`,
  `infra-error`.
- Interpret honestly: if frontier closes nodes that local cannot, the bottleneck
  was model capacity/variance; if frontier still plateaus with clean lint, flag
  G/ficha quality; if dirty lint dominates, invest in refine/decompose and
  better compile-back grounding.
- Keep it dry-run until the measured policy is boring. Paid/frontier execution
  must remain explicit (`--allow-paid`), never an automatic background spend.

**3. Make Walker v2 the central experience.** The CLI now has the power; the
product does not yet have the cabin. Walker v2 should stop being "a TUI that can
call commands" and become the operator surface for the governed loop:

- First screen: focal node identity, intent/ficha quality, shadow status,
  fixture/rule coverage, drift, upstream/downstream closure, and the next safe
  action.
- One-shot controls: `sync --explain`, `execute --dry-run`, `probe`, `ficha
  cleanup`, `rules audit`, proposal review/apply/reject, and re-anchor, all
  rendered as decisions with reasons rather than raw command output.
- Editing surface: intent/prompt/rules/contract edits with before/after contract
  diff and provider-gluing warnings before mutation.
- Escalation surface: when a node becomes `extraction-gap` or
  `capacity-ceiling`, Walker shows the exact evidence and offers the next
  governed lever instead of asking the user to infer it from logs.

The acceptance bar: a human should be able to edit a core node's intention,
run the governed loop, understand a write/refusal, and review the resulting
proposal or artifact **without leaving Walker**.

**4. Keep hygiene green before measuring.** `npm run check` is green, and the
NUL guard caught one real source hygiene issue: a literal NUL separator in
`src/forward/compile/rules-grounding.ts` line 140. It is fixed by spelling the
runtime NUL as an escaped string literal (`"\0"`), so source bytes stay text
while hash semantics stay unchanged. `npm run check:nul` should remain a hard
pre-measurement gate; no frontier run or published metric should start from a
tree that fails source hygiene.

### Highest-value validation gaps

These close the largest distance between what's *built* and what's
*demonstrated*:

- 🟢 **Intent→code regeneration loop shipped 2026-06-12 → 14 ($0).** The governed bidirectional loop, built + measured end-to-end. Dated records: [`ROUNDTRIP_BILATERAL_2026-06-12`](legend/calibrations/ROUNDTRIP_BILATERAL_2026-06-12_REPORT.md), [`KERNEL_BEHAVIOURAL_LIFT_2026-06-13`](legend/calibrations/KERNEL_BEHAVIOURAL_LIFT_2026-06-13.md), [`LENS_LAWS_2026-06-13`](legend/calibrations/LENS_LAWS_2026-06-13_REPORT.md). PRs #148–#151.
  - **Capabilities:** `onto regenerate` (governed lever — preview-default, `--write` gated on structural verdict + behaviour + `--check-rules`, `--draws N` consensus, `--rules-grounding`); `onto probe` (self-validated behavioural fixtures); `onto rules check`/`audit` (rule enforcement + triage).
  - **Measured:** unit side of `G ⊣ F` round-trips (Arm A contract M1 0.80, `provides` 1.0); **kernel-of-equivalence = 19/48 structurally regenerable (T2), 11 lifted to behavioural-T2** (119 self-validated cases). Lens laws under edits: PUT (F) propagates a contract edit 6/6; rules-grounding closed E2 (rule preservation 0/6→6/6, model-independent).
  - **The load-bearing finding, now four-times confirmed:** the binding constraint is **extraction / GET quality**, not the compiler — (1) M1 reference-frame confound, (2) probe-generation needs frontier, (3) lens-laws GET model-bound (+2/+4), (4) the `rules` field is 75% extraction-noise/prose (0/88 statically enforceable). §3.10 stays **T2**.
  - ✅ **Executable enforcement layer shipped 2026-06-14** — `onto probe` now feeds a node's **behavioural** rules as numbered verification targets (`rule:<N>` cases); self-validation turns each into an *enforced* invariant the regenerate behaviour-gate locks, or surfaces `⚠ code may violate this rule` when a case is dropped (enforcement by construction). Live: all 5 behavioural rules of `reps-aggregator.ts` enforced. `tests/probe-cli.test.ts` 9/9.
  - 🟢 **Ficha-cleanup contract-completion APPLIED to the live graph 2026-06-14** — the product lever the whole arc points at. `onto ficha audit` quantified the deficiency (138/221 code nodes under-declaring → **430 missing export declarations**, worst in the large multi-export modules), then `onto ficha cleanup --apply` (the deterministic AST-derived fix, `tests/ficha-cli.test.ts` 5/5) was run across the worklist: **430 → 0 missing exports, 138 nodes completed, 0 failures**. Governed + reversible: 138 `node_updated` events (`source:ficha-cleanup`), existing O1 signatures preserved (a pre-apply fix, PR #155 — the naive path would have dropped 216 nodes' signatures), `validate` + `replay` green, backup at `.ontology.ficha-cleanup-backup-2026-06-14/`. The contract layer is now AST-accurate. Remaining cleanup (LLM/judgment, the Walker loop): prompt refinement; rule denoising (57 prose rules flagged, not auto-removed); O1 signatures for the added presence-only exports; re-extract thin prompts via frontier.
  - **Open follow-ons:** apply the ficha-cleanup worklist (governed); auto-probe-with-rules over the kernel (surface rules the code violates); frontier `--write`; realistic semantic edits; PutPut / edit-composition; mutation-scoring of probe discriminating power.

- 🟠→🟡 **Real-LLM verify-refine — local clean pass landed 2026-06-09 (see (c) below); the remaining open half is the frontier-quality pass on a real checklist.** First attempt 2026-05-29 surfaced two findings: The ζ runtime was driven end-to-end for the first time against a real LLM via the Semillas-al-Aire podcast generator (a verify-refine graph gating an episode draft on a §14 checklist, local Ollama granite4.1:8b). Dry-run validated the state machine (seed→verify→pass→revisit→verify→accept, no branch-coverage warnings). The live run did **not** complete, for two reasons worth recording:
  - **(a) Robustness bug — undici headers timeout on slow Ollama prefill.** A verifier dispatch died with `UND_ERR_HEADERS_TIMEOUT` (`executor.ts:424` → `ollama/adapter.ts:111`). Root cause measured by raw curl: granite4.1:8b on an 8 GB Mac took **360 s** to process a ~6.5 KB verify prompt (prefill-bound; 119 output tokens), exceeding undici's default 300 s `headersTimeout`. Compile dodges this (shorter per-node prompts). **Fixed (2026-06-01, `3db9aa4`):** the Ollama client is routed through a `node:http` fetch shim (`ollama/fetch-shim.ts`) that imposes no headers timeout (`undici` is not importable and node exposes no knob to raise the global dispatcher's), so a slow prefill simply waits; connection failures still surface as `ECONNREFUSED` so the soft-fail path is unchanged. This unblocks long *local* runs but does not change (b) — the clean pass still belongs on a frontier provider.
  - **(b) Practical reality — local 8 GB is too slow for a real loop.** At ~6–15 min per step × several iterations, a full §14 loop is >1 h and a 8 B model likely never passes §14. This empirically confirms the project's "local insufficient for the quality bar" note. The clean real-LLM pass should run the loop on a frontier provider (gemini-flash / Anthropic) — which is also where it should land for `examples/workflow-imo-verify-refine`. The compile half (research → ARCO → 4 parts) ran fine on local Ollama and produced a real episode draft; only the verify-refine loop is gated on frontier.
  - **(c) CLOSED for the runtime itself — first clean local pass, 2026-06-09 ($0).** A verify-refine graph *sized for 7B local* (`examples/workflow-local-verify-refine`: short prompts, accept at 2 consecutive passes) completed the FULL chain live on `qwen2.5-coder:7b`: 19 steps / 90 s → accept → `wfrun_83f0554e` persisted → `proposal_0002` born with `workflow_run` source + measured contract (`slugify` with exact declared signature) → `apply --check-providers --strict` green → `node_0006` exists with the contract. The run's registered success criteria (example README) all held. It also surfaced and fixed a real parity bug (fenced artefacts measured as empty contracts — `projectWorkflowArtefact`, PR #140) and recorded two honest findings: the 7B verifier's JSON discipline is flaky (~half the visits needed the parse-retry; double-failures took the conservative `fail/major` fallback and the loop recovered every time — the `consecutive(pass,2)` gate did its job), and the 7B verifier passes behaviour-level bugs (`.trim('-')`) that neither contract nor Jaccard measure — which is precisely the behaviour-axis's job and why **the frontier-quality pass on a real editorial checklist (Semillas §14) remains the open half of this item**.
- 🟡 **Test suite runs on Node 20+; pre-existing failures fixed; slowness root-caused (NOT a hang).** Default Node is 18 (vitest's rolldown needs ≥ 20.12 for `node:util.styleText`); Homebrew `node@23` runs it. Four pre-existing failures (unrelated to current work) were fixed in `35e4078`: two real dispatcher bugs + one stale model-capabilities test. **Bisection result (2026-05-28):** the suite is *slow, not hung* — it completes (core ~16 min). The cost is **subprocess-spawn overhead**: 12 CLI/integration test files drive the CLI through `tests/helpers/run-cli.ts`, which spawns `npx tsx src/cli.ts` per call, re-paying `npx` resolution + a full `tsx` transpile of the CLI graph (~1–4s each). Worst offenders: `ingest-cli` 64s, `ingest-static-classifier-enabled` 36s, `…-integration` 28s, `ingest-cost-estimate` 17s, `ingest-ensemble-integration` 16s; pure in-process groups are sub-second (legend 1.2s, hierarchizer 0.15s). **Fixed (2026-05-29):** vitest `globalSetup` builds the CLI once and all CLI tests spawn the compiled `node dist/cli.js` (no `npx`, no per-call transpile) — `be31168` (shared `run-cli.ts` helper, 47 files), `2b1f2ba` (6 inline spawn sites). Non-CLI core dropped **994s → 379s (2.6×)**. The two original core failures are resolved: the dispatcher/model-capabilities bugs (`35e4078`) and `ollama-adapter`'s over-narrow soft-fail assertion (`210c447`, now accepts `model 'X' not found` as a valid soft-fail). **Non-CLI core: 116/116 files green.** The live-Ollama reliability item is **fixed** (`0b209a7`): the `--provider ollama` run-context tests now target an unreachable host (`127.0.0.1:9999`) so they fail fast into their soft-fail branch instead of doing a real generation (was ~45s timeouts; now `run-context-cli` 23/23 in ~15s). `ingest-cli`/`model-cli` Ollama sites use `--cost-estimate`/`model list` (no generation) and were already fast. Workflow/verify suites green (workflow 56/56, verify-determinism 5/5, dispatcher 22/22, routing 44/44).

### Phase ζ — workflow runtime

- 🔵 **Minor ζ ergonomics** (same review, low priority): `step_count` counts *global* visits, not per-node verifier visits — in a generator↔verifier loop `step_count >= 10` means ~5 verifications, not 10; document in spec §3.2 or expose a per-node `visit_count`. And `no_matching_branch` rejects return the verdict JSON as `output` while accept/reject terminals return `currentArtifact` — inconsistent; consider returning `currentArtifact` on branch rejects too.
- 🟡 **Verdict-map variance thread** (`MATHEMATICAL_CLAIMS.md` §3.10, stays T2). The binary-determinism T1 gate is empirically unachievable (real LLMs are not bit-deterministic at temp 0), so §3.10 was reframed (2026-06-01) as a *probabilistic / enriched* adjoint and the measurement core shipped (`verdict-variance.ts` + test: N samples → verdict-distribution agreement / entropy / metric-stdev). Only the budget-gated **real-LLM N-run generation** remains — run it on a frontier provider against a small fixed repo and report the spread (the quantitative ε).
- 🔵 **Advisory lock not universal across mutations** (kernel; surfaced by the 2026-06-01 Axiom 2 → T1 pass). `withLock` wraps the long-running multi-write commands (`compile run`, `compile run-batch`, `verify-homeomorphism`) but the quick single-shot mutations (`node create` / `link`, `proposal apply`, `init`) are not lock-wrapped. They rely on per-write crash-atomicity, so the worst case under a (rare, single-user) concurrent invocation is a *last-writer-wins lost update* on `state.json`, never a corrupt file. Universalising the lock (a shared `--no-lock` option + `withLock` wrap on the quick mutations) is deliberate future hardening, not a correctness bug.
- 🔵 **Behaviour checker module eviction** (`behavior-checker.ts`): the per-call `?ts=` cache-bust leaks module instances, but it is **load-bearing** — `behavior-checker.test.ts` pins that re-imports get fresh module state (isolation between reps). Content-addressing the cache key trades that isolation away, so a real fix needs worker/process isolation (deferred to v1). Fine at ~20 nodes until then.

### Cartography / ε tail (optional reinforcement)

- 🔵 **Arm C-cloud — `devstral-small-2:24b`** on rented GPU (~$5–10). ε closed without it; this is a reinforcement of H3, not a blocker. Local 8 GB Mac is infeasible.
- ✅→🟡 **Contract / intent columns** — matrix now **3 of 5**. **Contract column FILLED 2026-06-09 ($0, ~5 min):** checker shipped same day (`--contract-check`, spec [`legend/CONTRACT_AXIS_CHECKER_SPEC.md`](design/inverse/CONTRACT_AXIS_CHECKER_SPEC.md)) and run pre-registered over the archived Arm A regens (run-cache resurrection — zero sampling variance): **pass 85 / fail 32 / unknown 8, pass rate 0.726**; all fails `missing_keys` (the May graph predates O1 signatures → presence-only regime); fails concentrate in `divergent_both` while 60/73 `divergent_loc` nodes pass — the axis discriminates. Triplet in [`CALIBRATION_LOG`](legend/calibrations/CALIBRATION_LOG.md). Upgrade path (not a gate): an O1-signature re-ingest lifts the column from key-presence to interface compatibility. **Intent column (the last no-data):** extractor designed + wired (`onto ingest --intent`, spec [`legend/INTENT_NARRATION_SPEC.md`](design/inverse/INTENT_NARRATION_SPEC.md)); remaining to fill: a frontier run judged by the behaviour oracle (budget-gated, like the §3.10 variance run).
- ✅ **Cross-arm synthesis CLI** — superseded by the shipped `onto bakeoff` (see Interop #4 below); `scripts/run-3a-bakeoff-synthesis.ts` stays as the dated Move 3α driver.
- 🟡 **Next fidelity lever = extraction/prompt completeness on large modules.** The 2026-05-29 loss-breakdown (`scripts/loss-report.ts`) showed Arm A's residual loss is **recall-bound, not precision-bound** — 22 large multi-export modules collapse into recoverable-but-truncated stubs (0/125 unrecoverable). Curbing over-emission is the *smaller* cost; the win is making regen emit the modules it currently drops. See `MATHEMATICAL_CLAIMS.md` §3.10.

### Plasticity follow-ups

- 🟡 **`onto branch lift <nodeId> --to <branch>`** — turn `describeCartesianLift` into proposals; depends on the BRANCH_MODEL.md Option-C confirmation.
- 🟡 **`onto query` extensions** — negation, exact edge profiles, multi-shape OR.
- 🟡 **`run prompt --as-proposal` for `edge_create`** — schema supports it; the model-driven candidate edge is missing.

### Interop / MCP (create-context-graph follow-ups, 2026-05-29)

Four ideas lifted from a comparison with `neo4j-labs/create-context-graph`,
ordered by value. #1 shipped; #2–#4 are designed and queued.

- ✅ **#1 — read-only MCP server (`onto mcp`).** Stdio MCP server exposing the intent graph + audit chain as 12 read-only tools (`list_nodes`/`get_node`/`inspect_node`/`query_nodes`/`assemble_context`/`graph_*`/`runs *`/`audit_log`) + `canon`/`overview` resources, so a third party can READ and judge whether the declared intent is benign and competent — no mutation tools. Thin wrappers over existing pure functions. The tangible first surface of Open-Prompt. Tests: `tests/mcp-server.test.ts` (10, incl. an in-memory-transport end-to-end + a zero-mutation-tools assertion).
- ✅ **#2 — connectors as ingest sources** (PRs/issues → intent). `extractIntentFromFile` was split into a generic `extractIntentFromText` core; `onto ingest --from-pr/--from-issue <n>` fetch via `gh` and run a prose-tuned extractor (`EXTRACTION_SYSTEM_PROMPT_PROSE`, `manifestation=intent`). Best-effort PR changed-files → code-node matching at capture; `--resolve-edges <appliedNodeId>` creates `documents` edge_create proposals post-apply (mirrors γ-5 → γ-6 — edges need the applied node id). Tests: `tests/ingest-intent-source.test.ts` (7, mock-driven; back-compat held — 65/65 existing ingest tests green). Deferred: `--from-commit` (commits were only ever the edge mechanism in the original idea).
- ✅ **#3 — seed intent-graph templates** (`onto init --template <name>`). Declarative JSON templates under `templates/*.json` (Zod-validated, referential + poset integrity checked), replayed through the kernel primitives (`createNode`/`createEdge`) so hashes/events/state are correct. Ships `hello-world` (mirrors the example), `rest-api`, `python-cli`; `--list-templates` to discover; adding one = dropping a JSON file. Schema/loader/replay in `src/forward/templates/`. Tests: `tests/init-template.test.ts` (7).
- ✅ **#4 — fidelity gate in CI.** New `onto bakeoff <reports...>` command wraps `synthesizeBakeoff` with an H1 floor gate (`--min-jaccard`, default 0.1; gates the baseline arm by default, `--gate-all` for every arm). CI now runs the NUL guard (`check:nul`, was absent) **and** the bakeoff gate over the committed ε arm corpus after `build`. **Honest by construction:** the gate consumes ALREADY-RECORDED reports — it does not re-run the LLM (a live verify needs a real model, infeasible in CI), so it is regression protection over the scoring + recorded corpus, not a fresh measurement. `tests/fidelity-gate.test.ts` (5) pins the baseline floor + the grounding lift A−A0 ≥ 0.30 (records the Move 3α Δ=+0.355). The hand-rolled `scripts/run-3a-bakeoff-synthesis.ts` stays as the dated Move 3α driver; `onto bakeoff` is the general surface. **All four create-context-graph follow-ups (#1–#4) now shipped.**
- ⚪ **Deferred from #1 — `verify_intent_chain` MCP tool** (hash-chain provenance artifact→event→run→node). Blocked on schema work: the `compilation_run` event (`compile-node.ts`) carries `{nodeId,runId,cached,artifactRelativePath,bytes}` but lacks `nodeHash` + `artifactHash` for an end-to-end verifiable chain. First step of that future phase.

### Phase ζ + speculative

- 🔵 **Open-Prompt protocol:** `onto sign <branch>`, `onto verify-published`, `onto replay --against`. The read surface (`onto mcp`, above) ships; signing/replay are the remaining write/verify halves.
- 🟡 **Context-gluing regimes → sound sheaf** (staged plan, [`legend/CONTEXT_GLUING_REGIMES.md`](design/laws/CONTEXT_GLUING_REGIMES.md)). Provider-uniqueness is right for the static regime (SSoT) and a straitjacket for the dynamic/agentic one; the seam is a content/interface-signature discriminator. Bottom-up order: **O1 populate the discriminator** ✅ (signature threaded to `context.provides[].signature` via a side channel; `provides` stays `string[]`) → **O2 opt-in `identify-if-equal` gluing policy + §3.9 parity guard** ✅ (default-preserving; ledger §Axiom 5 records it as a sheaf on the equal-signature subcategory — **promoted T2→T1 2026-06-09** once the gluing axiom was pinned as a characterising law over an explicit cover, Path-to-T1 gate #2) → **O3 first dynamic-mutation consumer** ✅ v0 (`onto workflow run --as-proposal`: an accepted workflow's artefact → pending `node_create` proposal → `onto proposal apply`; the execution→intent loop closes over the existing proposal substrate). O2's first consumer landed (`onto run context --validate --identify-equal-providers`, opt-in). **O4 closes the loop end-to-end:** a workflow graph declares an output contract (`provides`+signature); `onto workflow run --as-proposal` measures the produced artefact against it (round-trip `F∘G≈id`, for code) and the proposed node is born with `provides`+signature — exactly what `identify-if-equal` reconciles. Resolved-type discriminator **wired** as opt-in `onto ingest --resolved-signatures` (fidelity refinement — broadens the T1 subcategory, not a law gap). Apply-time auto-gluing **landed** as opt-in `onto proposal apply --check-providers` (identify on equal signature, warn on drift), with **`--strict` blocking mode landed 2026-06-09** (drift or an errored check blocks; the proposal stays *pending*, not staled). Node-update/edges proposals **landed** (2026-06-09, spec §3.6): new `node_update` mutation kind (artefact → prompt, contract → provides, `nodeHash` staleness pin) via `onto workflow run --as-proposal --update-node`, plus graph-declared `proposesEdges` → `edge_create` proposals (update mode; create mode defers them — the γ-6 analogue is the one remaining horizon item). Run-record persistence **landed** (2026-06-09): every `--as-proposal` run persists a self-certifying `wfrun_*` record and all its proposals carry a non-null `workflow_run` source (graph/input hashes + per-step trace summary). **The O1→O4 + apply-gate stack is complete.** Terrain review + §3.9 silent-regression risk recorded in the doc.
- 🟡 **Wakeup Scanners** (Fase 1 = topological, no LLM; independent of other work). Spec: [`WAKEUP_SCANNERS.md`](design/proposals/WAKEUP_SCANNERS.md).
- 🟡 **Prompt Generators** — content-addressed, composable prompt templates; lifts `MATHEMATICAL_CLAIMS.md` Axiom 4 T3 → T2 in the generator domain. Spec: [`PROMPT_GENERATORS.md`](design/proposals/PROMPT_GENERATORS.md).
- 🔵 **Branch-merge proposals**, **Walker v2**, **cross-branch `node_update`** (needs BRANCH_MODEL.md decision), **web Visual DAG Studio**, **rigor improvements** from `MATHEMATICAL_CLAIMS.md`.

## Known limitations

- Semantic linker is read-only (`onto link <nodeId>`); proposal-mutation flow needs the two-step `onto propose link` → `onto proposal apply`.
- Only the long-running mutators (`compile run` / `run-batch` / `verify-homeomorphism`) are lock-protected; quick single-shot mutations rely on per-write crash-atomicity (worst case last-writer-wins, never corruption).
- BRANCH_MODEL.md Option-C (lazy materialisation) is recommended but not user-confirmed; gates cross-branch `node_update` propagation.
- Walker v2 (proposal review pane, plane/time/branch/manifestation rotation) is unshipped.
- Several doc claims are useful intuition but not pinned by tests; see [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) for the tiered ledger.

## Bootstrap history

Detail per PR is in [`RELEASE_NOTES.md`](RELEASE_NOTES.md); the table below is a quick map.

| Bootstrap | Theme |
|---|---|
| 0.1 | Network kernel — `onto init` / `validate` / `inspect`, canon node, `events.jsonl`, `state.json`, hashing. |
| 0.2 | Node editor — `onto node create` (typed level + kind, Zod-validated, hashed). |
| 0.3 | Edges + graph queries — typed multigraph (18 edge types); `onto node link`. |
| 0.4 | Walker v0 + poset + run persistence. |
| 0.5 | Proposal system (`node_create` + `edge_create` mutations, full lifecycle). |
| 0.6 | Map + slice + Walker v1 (edge-aware semantic linker, graph query CLI, walker edit / `:propose` / `:run` / `:plan`). |
| 0.7 | PromptAST — axiom 4 made structural (`parsePromptAST`). |
| 0.8 | Hello-World compiler — `onto compile run`, manifestation-aware artifacts, full audit chain. |
| 0.9 | Categorical extensions (Yoneda query, effect monad, branch fibration, topos predicate algebra) + compiler hardening + Walker hardening. |
| post-0.9 | Plasticity layer (gaps §1–§6 pre-Legend), hardening sweep §3.1–§3.15, validator-on-topos port, branch-aware compile, open-world validator, semantic-linker CLI. |
| Legend β | Multi-file compile (`run-batch`, `--target`), `node.literal`, path fibration, two-phase commit on writeArtifact. |
| Legend γ | `onto ingest <file/dir>`, Anthropic provider, TS/Python static-edge inference, walker AI indicator, rich proposal payload. |
| Legend γ-7 + δ | MANDATORY EXPORTS block, `onto verify-homeomorphism` (dual-distance LoC + Jaccard, five-label verdict), `onto node inspect` (Inspector / Lupa). |
| Legend ε | Five self-ingest runs (β / β′ / γ / δ / δ′) on the Ontology core perimeter; Move 1 / 1b / 1c; Move 3α tooling burst (bakeoff-synthesis, perimeterHash audit, `--reps` median); Move 3α multi-arm bake-off (Arm A 2026-05-23, Arms B + C-local + A0 control + cross-arm synthesis 2026-05-24); `node_0094` silent-exclusion fix. Closed 2026-05-26 with §3.10 adjoint T4 → T2. Full triplet history: [`CALIBRATION_LOG.md`](legend/calibrations/CALIBRATION_LOG.md). |
| Legend ζ | Workflow runtime v0 — standalone workflow schema, graph loader with structural + predicate validation + static branch-coverage lint (spec §3.2), predicate DSL (`consecutive` / `since_last` / `step_count`), typed-node executor, behaviour-axis checker (cartography matrix 1/5 → 2/5 columns), artefact-slot dataflow for verify-refine (§4.1), spec↔example reject-predicate reconciliation (§4.3), lenient with-severity schema (§4.2 — severity optional / issues defaulted, ends the silent pass→fail/major flip); §3.2 branch-coverage lint hardened to enumerate bare `pass`/`fail` under with-severity (`8ec0243`, pinned by `workflow-runtime.test.ts`). |

---

*Last refresh: **2026-06-18 (pm)** (state as of branch `feat/trustworthy-core`,
the `main @ 707a3fe` work plus the trustworthy-core session). The governed
executor (`onto execute`, premise capability ladder, child-process draft
isolation) is shipped, and the four-gap checkpoint's gaps 1/3/4 are done: ficha
contract gaps zeroed (missing/phantom 0; **57** prose rules remain), and a
cloud-probed fixtures grind took the syncable core **47 → 136 / 221** (order-ideal
view: 77 *batch*-syncable; **15** drifted). The load-bearing finding is unchanged:
the binding constraint is extraction/ficha quality plus model variance/capacity,
not the existence of primitives — and the next decision-point is **Gap 2**, the
measured executor close-rate sweep that gates the Architect. Phase ζ active. This
file is the single source of truth for open work; promote shipped follow-ups into
the bootstrap-history table or `RELEASE_NOTES.md`.*
