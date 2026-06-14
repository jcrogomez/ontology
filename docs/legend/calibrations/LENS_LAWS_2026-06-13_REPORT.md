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

---

## ADDENDUM 2026-06-13 — E2 closed by rules-grounding (post-experiment)

> Registered after the experiment above, recording a *fix* the result
> motivated. The original 0/6 stands as the dated measurement of the
> ungrounded channel; this addendum records the grounded channel.

The report named the cure for E2 (rule edits don't round-trip): "a
rules-aware channel (emit rule-checks/asserts the extractor can
recover), not a bigger model." That channel shipped same-day as
**rules-grounding** — the deterministic dual of `--ast-grounding`:
`onto regenerate --rules-grounding` (and `compile`) prepends a marked
`@ontology:rules` comment block to the artifact, and `onto ingest`
recovers it with a deterministic pre-pass (neither side trusts the LLM
with rules). See `src/runtime/compile/rules-grounding.ts`.

**Re-running the exact E2 arm** (same 6 nodes, same local 7B put / 3B
get, $0) with `--rules-grounding` on:

| | put emits block | rule survives round-trip |
|---|---|---|
| **E2 with rules-grounding** | 6/6 | **6/6** (was **0/6** ungrounded) |

The gap closes completely and **model-independently** — the recovery is
a deterministic block parse, so it does not depend on extractor capacity
(the property that made GET the binding constraint for E1/E3 does not
apply here). Rule-level intent is now bidirectional.

**Honest scope of the fix.** This is **preservation**, not
**enforcement**: the rule text round-trips as a versioned, visible
artifact, but the block does not *verify the code obeys the rule*. A
`FORBID`/`REQUIRE` that is assertable should additionally compile to a
runtime check or a behaviour fixture (`onto probe`) — that enforcement
layer is the next step. One interaction surfaced and fixed: a `FORBID:
<phrase>` rule's text tripped the compile-time intent validator's
forbidden-phrase check (the annotation *names* the forbidden thing); the
validator now strips the rules block before that check, so a real
violation in the generated code is still caught while the annotation is
not. Tests: `tests/rules-grounding.test.ts` (9), end-to-end round-trip
confirmed live (3B recovered both injected rules verbatim).
