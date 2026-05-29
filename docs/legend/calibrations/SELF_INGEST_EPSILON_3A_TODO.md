# Move 3α — TODO + pick-up notes

> *Running document for the Phase ε Move 3α calibration.
> Use this as the entry point when resuming work.
> Companion to
> [SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS.md](./SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS.md).*

**Session paused:** 2026-05-19 (post pre-flight; hardware bottleneck found before 3-arm run)
**Session resumed:** 2026-05-22 → 2026-05-23 (backlog burst — see "Ready to run" below)
**Arm A landed:** 2026-05-23T22:20Z — see `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A.md` + sidecar `.ontology.self-ingest-epsilon-3a-arm-a.json`. Workspace archived at `.ontology.self-ingest-epsilon-3a-arm-a-result/`. Headline: 125 nodes verified, structural honesty mean 0.496 (n=125, 100% coverage), 10% epsilon_equivalent / 57% divergent_loc / 4% divergent_structural / 30% divergent_both / 0 unrecoverable. Wall-clock **1h 33min** (15:46 → 17:20), not the 5h pre-registered — the 1.1 tok/s swap-floor measurement overestimated by ~3.2×; document this in any future cost forecast.

**Arm B landed:** 2026-05-24T10:11Z — see `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_B.md` + sidecar `.ontology.self-ingest-epsilon-3a-arm-b.json`. Workspace archived at `.ontology.self-ingest-epsilon-3a-arm-b-result/`. Wall-clock **10h 27min** (18:44 → 05:11 next day; mid pre-registered 10-25h band). Headline: **124/125 unrecoverable (99%)** — failure mode `compile-back failed: ... fetch failed` on every node except `node_0062 core/errors.ts` (the one survivor: divergent_structural, structural honesty 0.467). Aggregate dispatch tokens 510 in / 84 out — basically no model output reached the verifier. Daemon was alive throughout (`ollama serve` PID stable); failure is HTTP-level fetch timeouts as granite4.1:8b (5.3 GB) swapped on 8 GB RAM. **H2 outcome is "inoperative on this hardware", not "structured-output specialist fails to lead qwen"** — the proper Arm B comparison still requires cloud / ≥16 GB RAM. Bake-off synthesis must treat Arm B's n=1 mean as non-comparable to Arm A's n=125.

**Arm C-local landed:** 2026-05-24T13:05Z — see `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_C_LOCAL.md` + sidecar `.ontology.self-ingest-epsilon-3a-arm-c-local.json`. Workspace archived at `.ontology.self-ingest-epsilon-3a-arm-c-local-result/`. Wall-clock **~12 min** (07:53 → 08:05), dramatically under the ~5h pre-registered — starcoder2:7b (4.0 GB) fits RAM cleanly and short-circuits on intent failure. Headline: **0% epsilon_equivalent / 0% divergent_loc / 0% divergent_structural / 46% divergent_both (57) / 54% unrecoverable (68)**, structural honesty mean **0.033 (n=57, 46% coverage)**. Dominant failure mode: `compile-back failed: Intent validation failed` — starcoder produced real output (10K in / 6.6K out tokens) but as a base coding model without instruction-tuning for the MANDATORY EXPORTS block, the output systematically violates the contract. **This matches the pre-warning in the Arm C section above (lines 38-48): the result confirms "coding-specialization at the 7B class does not transfer to this contract-rich verify task", NOT the broader H3 of "coding-specialization doesn't transfer".** The clean H3 test remains devstral-small-2:24b in cloud (Move 6).

### Bake-off cartography matrix — all three arms

| Arm | Model | Coverage | Honesty (struct) | ε-equiv | divergent_loc | divergent_struct | divergent_both | unrecoverable | Dominant failure | Wall-clock |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|
| A | `qwen2.5-coder:7b` | 100% (n=125) | **0.496** | 12 (10%) | 71 (57%) | 5 (4%) | 37 (30%) | 0 (0%) | (control) | 1h 33min |
| B | `granite4.1:8b` | 1% (n=1) | 0.467† | 0 | 0 | 1 (1%) | 0 | 124 (99%) | `fetch failed` (HW-bound, swap) | 10h 27min |
| C-local | `starcoder2:7b` | 46% (n=57) | 0.033 | 0 | 0 | 0 | 57 (46%) | 68 (54%) | `Intent validation failed` (contract-violation) | ~12 min |

† Arm B honesty is n=1; not comparable to Arm A / C-local; Arm B effectively a hardware veto, not a model verdict.

**Live take (not bake-off synthesis):** Among locally-runnable arms, only Arm A (qwen2.5-coder:7b) produces honest cartography across the full perimeter. Arm B requires cloud to be diagnostic. Arm C-local diagnoses "coding-base models at 7B don't satisfy the MANDATORY EXPORTS contract", a distinct mode from Arm B's hardware veto. **The mechanical bake-off-synthesis (per `src/runtime/legend/bakeoff-synthesis.ts`) should be run next to formalize this** — it expects the three sidecar JSONs and outputs the synthesized comparison report; CLI surface still pending, so a small driver is needed.

**Synthesis landed:** 2026-05-24 — driver `scripts/run-3a-bakeoff-synthesis.ts` (npx tsx; idempotent — re-run any time without LLM cost) feeds the three sidecars to `synthesizeBakeoff` and emits `SELF_INGEST_EPSILON_3A_2026-05-19_SYNTHESIS.md` + `.ontology.self-ingest-epsilon-3a-synthesis.json`. **H1 read:** A passes (mean Jaccard 0.581 ≥ floor 0.1), B fails (0.000, n=1), C-local fails (0.000). Decision-tree fires "at least one arm clears the floor but not all → partial signal, inspect per-mode deltas before routing". **Failure-mode deltas vs A:** B aporta +124 `compile_back_failed` (HTTP fetch timeouts from RAM-bound swap); C-local aporta +68 `compile_back_failed` + +36 `empty_regen` (intent validation rejects starcoder's contract-violating outputs, leaving empty regens). Export recovery: A 68.6% micro / 70.0% macro / 43 exact-match files; B and C-local both at 0% (no contract-satisfying output emerged). **Bake-off-synthesis CLI surface remains the natural next ship** — the driver works but living as a script in `scripts/` is the same pattern δ' had before its CLI; suitable as Move 4 backlog.

**Move 1 hygiene landed:** 2026-05-24 — milestone review `MILESTONE_REVIEW_2026-05-24.md` flagged two structural issues post-Arm-A. Both have shipped:

- **§4.1 silent perimeter under-count.** `node_0094 → src/commands/ingest/index.ts` carried `manifestation: "intent"` (the schema default the LLM extractor fell into for a degenerate extraction with `prompt.raw: "- example"`, `provides: []`). `verify-homeomorphism --all-artifacts` silently excluded it, reporting 125/125 instead of 125/126 (99.2% coverage). Fixes:
  - `inferManifestationFromSourcePath` helper in `src/runtime/compile/manifestation-mapper.ts` returns the manifestation implied by file extension (`*.ts/*.py/...` → `code`, `*.test.ts/*.spec.ts/...` → `test`, `build.sh` → `build`).
  - `createNodeProposalForExtraction` in `src/commands/ingest/index.ts` overrides extractor manifestation when it is `undefined` or `"intent"` and the path implies otherwise; the override is recorded in `provenance.rationale.manifestationOverride` for auditability.
  - `--all-artifacts` candidate resolver in `src/commands/verify/homeomorphism.ts` now emits a `[verify] warning` (stderr; suppressed under `--json`) listing nodes whose `outputs.files` look like code-extension but whose manifestation excludes them. Future under-counts are visible at run time.
  - Addendum on `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A.md` documents the 125 vs 126 distinction; headline metrics unchanged at the third decimal; re-verify not performed (marginal scientific value; would need workspace shuffling).
- **§3.1 metric circularity check (Arm A0).** Launched 2026-05-24T18:41Z, landed 2026-05-24T21:10Z (wall-clock **2h 29min**, ~60% slower than Arm A's 1h 33min — the missing MANDATORY EXPORTS block frees the model to emit more freelance tokens per response, so output tokens 53K → 75K). Report: `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A0_CONTROL.md` + sidecar `.ontology.self-ingest-epsilon-3a-arm-a0.json`. Workspace archived at `.ontology.self-ingest-epsilon-3a-arm-a0-result/`; scratch `.ontology/` restored. **Headline:** mean Jaccard **0.226** (vs Arm A's 0.581 → grounding contributes Δ = −0.355 when removed), mean LoC dist 0.563 (~unchanged vs A's 0.589), structural honesty 0.332 (vs A's 0.496), exportRecovery micro **25.6%** (vs A's 68.6% → −43.0 pp), missing exports 297 (vs 106 → +191), hallucinated exports 16 (vs 116 → −100; grounding causes 7× *over-stuffing*), 0 unrecoverable. **A0 also clears the pre-registered H1 floor of 0.1** (0.226 ≥ 0.1) — the H1 falsifier was calibrated against δ' (qwen-3b, no safety-net); the falsifier is no longer informative against modern arms. Synthesis re-run with 4 arms: A baseline, A0 control, B, C-local; H1 anyPass=true, allPass=false, decision-tree fires "partial signal" (now with grounding-decomposition data instead of pure conjecture). Arm A's 28× margin over δ' decomposes as ~0.205 baseline-qwen-7b lift + ~0.355 grounding lift. **§3.1 worry is resolved: grounding contributes real lift, not circularity artefact.** Honest costs of the intervention now defensible: no LoC improvement; 7× export over-stuffing; behaviour/contract/intent axes still not measured.

`.gitignore` extended to cover `.ontology.*-backup/` defensively; self-ingest sidecar JSONs are **not** ignored (they are the pre-registered output of Move 3α and live next to the corresponding reports).

---

## 🟢 Ready to run (status as of 2026-05-23)

Every blocker the 05-19 → 05-22 reviews flagged is closed in `main`:

| Blocker | State | Commit |
|---|---|---|
| bakeoff-synthesis generator | ✅ shipped | `ddfe266` |
| `homeomorphism_verified` event audit (model + perimeterHash) | ✅ shipped | `00b8100` |
| `--reps N --aggregator median` wiring (design §4.2) | ✅ shipped | `6c6e368` |
| `tests/ingest-prompt-template.test.ts` smoke (design §4.3) | ✅ shipped | `54cd2f0` |
| Arm C substitute decision | ✅ resolved → **`starcoder2:7b` (4.0 GB)** | this doc |

### Arm C choice — `starcoder2:7b`

Researched against `ollama.com/library`:

| Candidate | File size | Family | Verdict |
|---|---:|---|---|
| **`starcoder2:7b`** | **4.0 GB** | BigCode (HF + ServiceNow) | ✅ fits ≤ 4.5 GB cap, coding-pure, distinct family |
| `codellama:7b` | 3.8 GB | Meta | ✅ fits, but 2023 (stale) |
| `opencoder:8b` | 4.7 GB | Infly | ⚠️ borderline |
| `codegemma:7b` | 5.0 GB | Google | ❌ over cap |
| `yi-coder:9b` | 5.0 GB | 01-ai | ❌ over cap |
| `deepseek-coder-v2` (min 16b) | 8.9 GB | DeepSeek | ❌ infeasible |

**Note on H3 calibration:** the pre-registered H3 / H4 thresholds (e.g.
"Devstral leads qwen by ≥ 0.10 mean Jaccard") were sized against
**devstral-small-2:24b** (SWE-bench Verified 65.8%). `starcoder2:7b` is
~3× smaller; if it fails to beat Arm A, **the failure is not diagnostic
of "coding-specialization doesn't transfer"** — it only says
"coding-specialization at the 7B class doesn't transfer here." Devstral
in cloud (Move 6) remains the only clean H3 / H4 test. Update
`SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS.md` before running to
rename Arm C accordingly:
- **Arm C-local:** `starcoder2:7b` (this session's substitute)
- **Arm C-cloud:** `devstral-small-2:24b` (deferred, Move 6, ~$5–10)

### Commands to run, in order

**Pre-flight (5 min) — pull starcoder2:7b for Arm C and re-verify build:**

```sh
cd ~/Development/ontology
rm -f .git/index.lock              # idempotent; the automated review re-creates it
git push origin main               # 14+ commits ahead as of this writing
ollama pull starcoder2:7b          # 4.0 GB download
ollama serve &                     # if not running; pre-warm needed by Arm A
npx tsc --noEmit                   # expect exit 0
npx vitest run                     # expect 100% green
```

### Final Arm A pre-flight checklist (2026-05-23 update — post-hardening)

Done in commits leading up to Arm A:

- [x] `--reps` cache-collision fixed (`5d70f3b`) + integration test confirms 3 distinct runIds end-to-end (`2591179`).
- [x] `state.json` writes atomic AND durable (`fsync` on file + parent dir, `2591179`); `events.jsonl` appends fsynched per write — power loss / SIGKILL during the 5h run no longer loses cadena.
- [x] `homeomorphism_verified` event carries `model` + `perimeterHash` (`00b8100`); replay from `events.jsonl` alone identifies which model produced the results and over what perimeter.
- [x] `bakeoff-synthesis.ts` generator + tests (`ddfe266`); post-Arm-A/B/C synthesis is mechanical, no cherry-picking surface.
- [x] README honesty pass (`2591179`): Phase ε framed as cartography matrix, every load-bearing categorical term annotated with its `MATHEMATICAL_CLAIMS.md` tier.

Still required before launch (user side, local machine):

- [ ] `git push origin main` (publish the burst — the sandbox can't reach GitHub).
- [ ] `ollama pull qwen2.5-coder:7b` (verify it's local; ~4.7 GB).
- [ ] Confirm ingest is complete — the perimeter `src/runtime src/core src/commands src/schemas` (~126 files) must already have applied nodes. If `.ontology/nodes/` is empty or stale, ingest is the prior step (~100-115 min wall-clock per the cost prediction in the hypothesis doc).
- [ ] Free RAM: close browser tabs / heavy apps. The 1.1 tok/s figure assumed ~3-4 GB headroom; less means longer wall-clock.

### Arm A critical-path map (what the verify command actually exercises)

Useful for future-self pruning. Arm A = `onto verify-homeomorphism --all-artifacts --matrix --ast-grounding --provider ollama --model qwen2.5-coder:7b`. The modules this command actually touches:

```
src/commands/verify/homeomorphism.ts        ← entry, candidate resolution, event emission
src/runtime/legend/
  verify-homeomorphism.ts                   ← distance math, verdict folder
  matrix.ts + matrix-intersections.ts       ← --matrix six-axis output
  frontier-tagger.ts                        ← per-file kind tagging for matrix
  pareto.ts                                 ← Pareto pivot from matrix
  vocab-gap.ts                              ← gap aggregate
  export-recovery.ts                        ← Move 3α candado #2
  ast-symbol-scanner.ts                     ← AST source for grounding
  failure-mode-tagger.ts                    ← Move 3α v0 tags
src/runtime/compile/                        ← compile-back pipeline
  ast-grounding.ts                          ← MANDATORY EXPORTS block
  compile-node.ts, compile-plan-runner.ts   ← dispatch + cache
src/runtime/llm/ollama/                     ← provider
src/core/{nodes,edges,runs,state,fs}/       ← kernel basics
```

NOT in Arm A's critical path (legacy / scaffolding / other entries):

```
src/runtime/legend/bakeoff-synthesis.ts     ← runs AFTER all arms, deterministic
src/runtime/legend/reps-aggregator.ts       ← only if --reps > 1; Arm A is reps=1
src/runtime/legend/translator.ts            ← onto node inspect (Inspector / Lupa)
src/runtime/legend/materialize-edges.ts     ← setup phase, not verify
src/runtime/query/representable.ts          ← onto query (Yoneda)
src/runtime/fibration/branch-fiber.ts       ← onto branch (Grothendieck fibration)
src/runtime/graph/hierarchizer.ts           ← onto graph hierarchize preview
src/core/nodes/update-parent.ts             ← node_update_parent kernel (no
                                              --create-proposals consumer yet)
src/commands/ingest/                        ← already-done setup
```

**Implication for project discipline:** the ε run depends on a much
smaller surface than the project has accumulated. If a post-ε review
finds zones with no measured contribution to the cartography matrix,
they are candidates for pruning, not preservation.

**Arm A — overnight, ~5 h wall-clock at reps=1 (point estimate, pre-registered):**

```sh
onto verify-homeomorphism \
  --all-artifacts \
  --matrix \
  --ast-grounding \
  --provider ollama \
  --model qwen2.5-coder:7b \
  --report docs/legend/calibrations/SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A.md \
  --json > .ontology.self-ingest-epsilon-3a-arm-a.json
```

The single-draw report is what the pre-registered H1 floor compares
against. If H1 fires ambiguous (Arm A mean Jaccard within ε of the
floor), re-run targeted nodes with `--reps 3 --aggregator median` to
defang variance before reaching for the Opus 4.7 ceiling.

**Arm B — next night, ~10–25 h at reps=1 (re-measure tok/s after reboot):**

```sh
onto verify-homeomorphism \
  --all-artifacts \
  --matrix \
  --ast-grounding \
  --provider ollama \
  --model granite4.1:8b \
  --report docs/legend/calibrations/SELF_INGEST_EPSILON_3A_2026-05-19_ARM_B.md \
  --json > .ontology.self-ingest-epsilon-3a-arm-b.json
```

**Arm C-local — third night, ~5 h:**

```sh
onto verify-homeomorphism \
  --all-artifacts \
  --matrix \
  --ast-grounding \
  --provider ollama \
  --model starcoder2:7b \
  --report docs/legend/calibrations/SELF_INGEST_EPSILON_3A_2026-05-19_ARM_C_LOCAL.md \
  --json > .ontology.self-ingest-epsilon-3a-arm-c-local.json
```

**Synthesis — after all three arms finish (mechanical, no LLM, ~1 s):**

```sh
# (the bakeoff-synthesis CLI surface lands in the next session; today
# the module is invokable as a library — see src/runtime/legend/bakeoff-synthesis.ts.
# Hand-roll a tiny driver until then.)
```

---

## Status snapshot

| Phase | State |
|---|---|
| Bug 3.1 (Pareto label) fix | ✅ landed `4a2feb7`, pushed |
| AST symbol scanner | ✅ landed `515fd92`, pushed (16 tests verdes) |
| Move 1c safety net (ingest) | ✅ landed `748025e`, pushed |
| AST grounding at code_sketch | ✅ landed `35ac998`, pushed (17 tests verdes) |
| ExportRecoveryRate metric | ✅ landed `ca5e002`, pushed (10 tests verdes) |
| Failure-mode tagger v0 | ✅ landed `e493b40`, pushed (12 tests verdes) |
| MOVE_3A_HYPOTHESIS preregistration | ✅ landed `fab66e2`, pushed |
| TARGET_ARCHITECTURE blueprint | ✅ landed `4837936`, pushed |
| **Pre-flight: pulls** | ✅ qwen2.5-coder:7b + granite4.1:8b + devstral-small-2:24b all pulled |
| **Pre-flight: characterization** | ⚠️ done — **revealed hardware bottleneck** (see below) |
| **3-arm run** | 🟡 **BLOCKED on substitute decision** |

Aggregate tests on the 3α tooling: **55 new tests** in 4 files; **227 Phase ε pre-flight tests** still green; `tsc --noEmit` clean.

## Hardware bottleneck — measured numbers

The user's primary dev machine has **8 GB RAM** ([[user_hardware_constraint]]).
After macOS + apps, ~3-4 GB is available for inference. Pre-flight measured tok/s with the canonical Move 3α-style prompt (241 prompt tokens, ~120 output tokens, AST grounding system block included):

| Arm | Model | Size | Load (s) | Prompt eval (tok/s) | Output gen (tok/s) | Verdict |
|---|---|---:|---:|---:|---:|---|
| A (control) | qwen2.5-coder:7b | 4.7 GB | 7.0 | 85 | **1.1** | **degraded** — even alone, in swap |
| B (structured-output) | granite4.1:8b | 5.3 GB | 8.9 | 4 | **0.2** | **marginal** — heavy swap |
| C (coding-specialised) | devstral-small-2:24b | 15 GB | 35.4 | 1 | **~0.02** | **INFEASIBLE** — 15 GB > available RAM, total wall-clock 6452 s for a 128-token response |

Reference (Apple Silicon at memory headroom): qwen 7b should run at 30-50 tok/s.
The 1.1 tok/s on this machine = swap floor, not model floor.

`memory_pressure` at measurement time: 151M swapins / 153M swapouts (system has been in heavy swap throughout the session).

## Pending decision: Arm C substitution

Path forward (user's lean as of pause): **substitute Arm C with a smaller coding-specialised model now; queue devstral-small-2:24b for cloud/rented-GPU later**.

Substitute search criteria:
- Available on `ollama.com/library` (catalog is source of truth — [[feedback_provider_catalog_trust]])
- Quantised file size ≤ 4 GB so it runs at usable tok/s on 8 GB RAM
- Coding-specialised tuning (otherwise the H3 / Arm C hypothesis loses its point)
- Q4 or higher (avoid sub-Q4 to keep instruction-following on the MANDATORY EXPORTS block)

**Candidates worth investigating in next session:**
- `qwen2.5-coder:3b` (already pulled, 1.9 GB) — same family as Arm A but smaller; weak signal for "coding-specialised vs generalist" hypothesis since A is also qwen-coder
- Other coding-tuned ≤ 7B on ollama.com — verify catalog (don't pre-name without checking) before designing substitute arm

**Cloud path for original Arm C (not blocking, deferred):**
- Run devstral-small-2:24b on a GPU host with ≥ 24 GB VRAM via Ollama Cloud, RunPod, Modal, or similar
- Costs: ~$0.50-2.00 per hour for an A10 / L4 class GPU; full 125-node verify run estimated 1-2 h on a real GPU
- Total estimated cloud spend for a clean Arm C run: **~$5-10** if scheduled to one continuous session

## Backlog (priority-ordered for next session)

```txt
NEXT:
  2. Substitute Arm C analysis (~30 min)
     - Walk ollama.com/library for coding-spec models ≤ 4 GB
     - Pull the best 1-2 candidates; brief tok/s pre-flight
     - Update MOVE_3A_HYPOTHESIS.md with chosen substitute
       and note "Arm C (devstral) deferred to cloud"

THEN, in parallel where possible:
  1. Bake-off synthesis generator (~3-4 h)
     - Reads N AggregateReport JSONs (one per arm)
     - Emits cross-arm comparison:
         exportRecovery (micro + macro deltas)
         failureModes (per-mode delta)
         Pareto positions
         per-file rebuild status
     - Deterministic, testable, no LLM
     - Lives in src/runtime/legend/bakeoff-synthesis.ts (new module)
     - Saves manual synthesis work post-3α

  3. δ' template smoke fixture (~1 h)
     Milestone 4.3: tests/ingest-prompt-template.test.ts
     - Asserts MANDATORY block contents stable
     - Asserts every name in a representative provides[] appears
       in rendered prompt
     - Asserts FORBIDDEN narrative phrases do not appear

  4. perimeterHash + dispatchModel on homeomorphism_verified event (~1 h)
     Milestone 3.2 + 4.4
     - Adds model: { provider, model } to the event payload
     - Adds perimeterHash over (sorted node sourceFile paths)
     - Closes audit-chain replayability from event log alone

  5. n=3 rep distribution on Jaccard ≥ 0.5 cohort (~2 h + corrida corta)
     Milestone 4.2
     - --reps N --aggregator median wiring
     - Run on llm/mock.ts + effects/async.ts + prompt/types.ts
       (γ-era Jaccard 1.0 file)
     - Confirms whether δ''s 2 high-Jaccard files survive median-of-3

  6. Cloud path sketch (~30 min)
     - Document Ollama Cloud / RunPod / Modal workflow for
       devstral-small-2:24b Arm C, queued for later
     - Concrete commands, estimated cost, gates

FINAL:
  10. Run Move 3α — 2-arm local + (later) deferred 24B cloud arm
      Estimated: ~5 h per local arm overnight
      Output: SELF_INGEST_EPSILON_3A_2026-05-19_ARM_{A,B,C}.md
              + SELF_INGEST_EPSILON_3A_2026-05-19_SYNTHESIS.md
```

## Pick-up procedure for next session

1. Read this doc + [[SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS]] for context.
2. Verify the build is still green:
   ```sh
   npm run check
   npx vitest run tests/legend-matrix.test.ts tests/legend-matrix-intersections.test.ts \
                  tests/frontier-tagger.test.ts tests/legend-fixture-tagger.test.ts \
                  tests/verify-report-markdown.test.ts tests/ingest-cli.test.ts \
                  tests/ast-symbol-scanner.test.ts tests/ast-grounding.test.ts \
                  tests/export-recovery.test.ts tests/failure-mode-tagger.test.ts
   ```
3. Confirm git state: should be at `4837936` on `main` (or whatever the latest is — push happened, so check `git log origin/main`).
4. Start with backlog item **(2)** — Arm C substitute analysis. Open `ollama.com/library` and look for coding-specialised ≤ 4 GB.
5. After substitute is selected and pulled, update MOVE_3A_HYPOTHESIS.md with the explicit substitute + "Arm C cloud deferred" note.
6. Then proceed through items (1) → (6), then run.

## What is NOT in this TODO (intentionally)

- The actual ε pre-pilot run (β / β' / γ / δ' ran on the old qwen 7b without Move 3α tooling). Their numbers are the baselines the 3α report will compare against — captured in the existing synthesis docs, do not re-run.
- Move 4 (Opus 4.7 ceiling) — fires after 3α + 3γ produce data per the preregistration's decision tree. Not on the immediate backlog.
- modelRouter implementation — see TARGET_ARCHITECTURE.md. Not until 3γ produces enough cells in the model × file_kind × failure_mode tensor.

## Key files to consult on resume

| File | Purpose |
|---|---|
| `docs/legend/calibrations/SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS.md` | Pre-registered hypotheses H1-H6, decision tree, candados |
| `docs/legend/architecture/TARGET_ARCHITECTURE.md` | Where we're going (destination, not route) |
| `docs/legend/calibrations/SELF_INGEST_DELTA_2026-05-18_SYNTHESIS.md` | The δ' baseline 3α compares against |
| `docs/ROADMAP.md` | Open issues + current backlog (single source of truth; dated milestone snapshots retired 2026-05-28) |
| `src/runtime/legend/ast-symbol-scanner.ts` | Move 1c + 3α grounding source |
| `src/runtime/legend/export-recovery.ts` | The principal 3α metric module |
| `src/runtime/legend/failure-mode-tagger.ts` | Per-node mode labels (v0) |
| `src/runtime/compile/ast-grounding.ts` | The 3α intervention itself |
| `src/cli.ts` (line ~882) | The `--ast-grounding` CLI flag |
