# Regeneration & intent-consumption investigation — 2026-06-17

> **Status: EXPLORATORY record, not a pre-registered ε arm.** Post-hoc write-up
> of a live investigation into *why the F∘G round-trip is faithful for pure code
> and divergent for glue*, and where the real bottleneck actually sits. All runs
> $0, local, `qwen2.5-coder:7b` via Ollama (the 8 GB-safe coding model; the
> 9b arm is excluded — it has rebooted this machine before). Dated, additive;
> does not rewrite any existing calibration.

## The question

Earlier framing (in this session, by the assistant) was that glue/IO code
*inherently resists* the round-trip — and the next move was to "use a frontier
model." The user pushed back: the bottleneck is extraction quality, and faithful
round-trip *is* possible. This record settles where the neck actually is, by
running the **real machinery** (`onto regenerate` / `probe` / `verify-homeomorphism`),
not hand-rolled harnesses.

## Method & raw results (real machinery, local 7B)

Two nodes, opposite natures, same loop (`onto regenerate --behavior-check`,
`onto sync`), `astGrounding` on (default):

| node | nature | structural | behaviour |
|---|---|---|---|
| `node_0110` `laws/effects/result.ts` | pure algebraic (Result monad) | `epsilon_equivalent`, **jaccard 1.000** | (no fixture) |
| `node_0013` `kernel/core/fs/lock.ts` | io/glue (advisory lock) | **divergent**, jaccard 0.15–0.54 (high variance run-to-run) | **fail** |

Then, on `lock.ts`:
- **Why it diverges, seen directly:** the *extracted intent* described only the
  per-export **contract** ("acquireLock returns Lock or throws"). The source's
  determining **invariants** — stale-lock recovery (same-host dead-PID → reclaim),
  cross-host refusal, ownership-verified release, atomic `O_EXCL` create — were
  **not in the intent**. The model didn't lose them; it never received them.
- **A different extractor philosophy captured them:** `onto ingest --intent`
  (narration) on the *same 7B* produced the problem/decision/invariants **and a
  behaviour oracle** (cross-host-refuse, stale-recover, release) that the contract
  extractor dropped. → extraction philosophy is a real lever (the user's point).
- **The verification CAN reach glue invariants:** `onto probe` generated protocol
  behaviour cases (acquire / cross-host-refuse / release) that self-validated
  against the source via a temp `repoRoot`. (Corrects an earlier prediction that
  only pure predicates were characterizable.)
- **The behaviour gate works:** the contract-prompt regen came back `behavior:
  fail` — the gate caught it and would block `--write`. Honest governance.
- **The local 7B is high-variance on glue:** across draws, jaccard swung 0.0 → 1.0;
  behaviour fail/untested. One-shot is a coin flip; consensus often 0–1/3.

## The real finding: regeneration UNDER-CONSUMES the extracted intent

Read from the code, not guessed:
1. **The behaviour oracle only judges, never guides.** `regenerate.ts` loads the
   fixture → compiles **blind** → `runBehaviorCheck` *after*. The spec is available
   at generation time and not given to the generator.
2. **Signatures were presence-only.** `node_0013`'s `provides` carried real type
   signatures for only 2/13 exports; the `--resolved-signatures` TypeChecker pass
   was never run for it. Thin extraction.
3. **Compile-back grounding listed only export *names*** (Move 3α), not signatures
   — so the model kept dropping the export surface (the `untested` failures).
4. **No verify-refine loop** in the regenerate path (one-shot / consensus), though
   the ζ runtime is built for exactly that.
5. **No decomposition** (whole 309-line module regenerated at once).
6. **Auto-generated oracles for glue are themselves shallow** (the 7B probe fixture
   hard-codes `/tmp/test-repo`, leans on injected globals) — verification is also a
   weak link, not just generation.

Disproven easy escapes: names-grounding (the measured +0.355 lever) was **already
on** in every run — so the divergence is not "grounding is off," and it is not an
inherent ceiling.

## What landed this session (real machinery, not hacks)

- **Signature grounding** (`ast-grounding.ts` + `ast-symbol-scanner.ts` +
  `compile-node.ts`): the compile-back AST grounding now emits each mandatory
  export **with its syntactic type signature**, not just the name, so the
  regenerator gets the exact surface shape. Backward-compatible (no signatures →
  byte-identical hash; existing grounded caches preserved). Tested.
- `updateNode` gained governed `outputsFiles` re-point (commit `d3757dc`) — used
  to reconcile the graph to the F/G/laws layout without re-extraction.
- A real `onto probe` behaviour fixture for `lock.ts` (net-new coverage).

## Honest conclusion

Not a model wall, and not "buy frontier." The neck is a **stack of unused
intent-consumption levers**, all $0 / in-machinery:
`extract rich intent (resolved sigs + invariants + oracle) → ground ALL of it
into generation → refine against the oracle in a loop`. The pieces exist
(resolved-sig ingest, probe oracle, ζ verify-refine) but are **disconnected from
the regeneration path**. Wiring them is build work, not a credit card. A frontier
model is justified only *after* exhausting these — to distinguish "consumption gap"
from a genuine capacity limit for a given module size.

## Next (the user's chosen path): full re-ingest

The complete real F↔G needs the graph re-extracted with the rich machinery
(`--resolved-signatures` + narration) so the grounding above has rich signatures
to consume. This is a **destructive, overnight, reboot-risky** local migration
(wipe 228 curated nodes + re-extract 214 files via LLM + rebuild edges), so:
backup taken (`.ontology.pre-reingest-backup-2026-06-17/`), runs on 7B/3b only
(never 9b), batched/resumable, on a copy until validated, then swapped.

## Process note (honest)

The assistant initially diagnosed "model wall → use frontier" from one noisy
one-shot — a premature reach for an external dependency. The user's challenge was
correct and redirected the work to the real, in-machinery levers above.
