# LENS_LAWS_2026-06-13 — RESULT

> **Dated record.** Executed per the pre-registration
> [`LENS_LAWS_2026-06-13_HYPOTHESIS.md`](LENS_LAWS_2026-06-13_HYPOTHESIS.md).
> First measurement of the `G ⊣ F` lens laws **under deliberate edits**
> (not just the identity-point round-trips the bilateral experiment
> measured). Lens mapping: **S = code, V = intent; get = `onto ingest`,
> put = `onto regenerate`.** Cost **$0** (local Ollama + cold-subagent
> frontier GET replayed through the real ingest pipeline).

## Headline

**The lens propagates an edit through PUT reliably; GET is the binding
constraint, and it is decisively model-bound.** A contract edit declared
in intent reaches the regenerated code in **6/6** nodes (PUT = F is
robust). Re-reading that edit back out as intent is where it is lost:
the local 3B extractor recovers it in **4/6** (E1) and **2/6** (E3), the
frontier extractor in **6/6 and 6/6** — recovering *every* marker the 3B
dropped. The "edit one side, the other adapts faithfully" claim holds
under edits **for contracts, gated entirely by the extractor**; it fails
for rules (a representational gap, not a capacity one).

## Numbers (6 kernel nodes: 0017, 0022, 0131, 0176, 0223, 0225)

| Edit | Law | Local survival | Where it dies | Frontier GET |
|---|---|---|---|---|
| **E1 contract** (declare a new export in intent) | PutGet | **4/6** | PUT 6/6 ✓, GET 4/6 | **6/6** |
| **E2 rule** (declare an invariant in intent) | PutGet | **0/6** | the code never expresses the rule | — (representational) |
| **E3 code** (add an export in code) | GetPut | **2/6** | GET 2/6 (recall-bound on full files) | **6/6** |

- **PUT (F) is reliable.** Every node's `regenerate --draws 3` carried
  the declared contract marker into the code (E1 PUT 6/6). The forward
  functor faithfully realises a declared contract edit.
- **GET (G) is the binding constraint.** The local 3B drops the marker
  on re-extraction (E1) and especially when ingesting a full edited
  source file (E3 2/6 — the known recall-bound, large-module truncation).
  The frontier extractor, replayed through the *same* ingest pipeline,
  recovers all 12/12. **H-ARM: frontier − local = +2 (E1), +4 (E3) →
  model-bound.**
- **Rules do not round-trip (E2 0/6), model-independently.** The injected
  rule ("`<export>` is a pure function with no side effects") is true of
  the code but *unstated by it* — nothing in a pure function declares
  that purity is required, so no extractor can recover the rule from the
  code. This is a representational gap, deeper than the extractor
  capacity gap, and confirms the bilateral M3 = 0 finding under edits.

## Hypotheses

- **H-PG1 (contract-edit propagation): PASS.** Local 4/6 (≥4/6 threshold);
  frontier GET 6/6 (≥5/6). No falsifier fired.
- **H-PG2 (rules don't survive): CONFIRMED.** E2 0/6 ≤ 2/6.
- **H-GP1 (code-edit propagation): FAIL on local (2/6 < 4/6), recovered
  at frontier (6/6).** The failure is entirely the local extractor's
  recall on full files — not the law.
- **H-ARM: model-bound** on both directions, decisively.

## What this establishes

The lens behaves as a **well-behaved bidirectional transformation under
edits, within tolerance, for the contract layer** — with the caveat that
the tolerance is set by the *extractor*, not the compiler. Concretely for
the product:

- **"Edit a contract in the Walker and regenerate" is sound** — the
  forward half (F) is reliable (6/6), so a declared capability change
  reaches the code. The round-trip back to legible intent is clean at
  the frontier and lossy (4/6, 2/6) on the local 3B — i.e. the same
  extraction bottleneck the bilateral round-trip measured, now in the
  edit regime, now isolated to a single functor.
- **Rule-level intent is not yet bidirectional.** Editing a rule in
  intent does not survive the round-trip because code does not carry
  rules. Closing this needs a rules-aware channel (e.g. emitting
  rule-checks/asserts the extractor can recover), not a bigger model.

## Honest scope

- **GET-isolated frontier arm.** PUT was shown reliable separately (E1
  6/6 local); the frontier arm measured the GET half end-to-end through
  the real ingest pipeline. A fully-frontier end-to-end round-trip was
  not run; it is bounded below by min(PUT, GET) and both halves are 6/6
  at the relevant points.
- **Marker edits isolate propagation from capability** by design — they
  test whether a *declared* change flows through, not whether the model
  can implement a hard feature. Realistic semantic edits (a new behaviour,
  a changed value) are deferred (they interact with the pinned fixtures).
- Least-change / locality, PutPut composition, and the formal triangle
  identities remain out of scope. §3.10 stays **T2** — empirical
  edit-survival tolerance, not a theorem.

## Artifacts

`.ontology.scratch-lens-laws-2026-06-13/` (gitignored): frozen `editset.json`,
`results-local.json`, `results-frontier-get.json`, capture/replay prompts.
Drivers: `scripts/lens-laws-2026-06-13-{edits,local}.mjs` (+ the bilateral
`fakeollama` shim for the frontier GET).
