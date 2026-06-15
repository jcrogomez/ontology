# Contract-axis checker — v0 specification (cartography column 3)

> *Spec for the third measured column of the Phase ε fidelity matrix
> (POSITIONING §2): does the regenerated artifact $F(G(c))$ satisfy the
> node's DECLARED contract? Written 2026-06-09, before the
> implementation, mirroring the pickup-and-go discipline of
> `BEHAVIOUR_AXIS_CHECKER_SPEC.md`.*

**Cost: $0 by construction.** The check is pure static comparison —
declared `context.provides` (keys + O1 signatures) vs the regen
artifact's extracted exports (`parseTypeScriptFile`, syntactic tier).
No LLM, no fixtures, no execution. It rides on regen artifacts that
verify-homeomorphism already produced (or has on disk from a prior
run), so filling the column re-uses recorded/local regens.

## 1. What the axis measures

The contract axis is the **G→F promise check**: ingest (G) declared
that this node *provides* certain capabilities, each optionally with a
written interface signature (O1). The compile-back (F) produced an
artifact. The axis asks: **does the artifact actually export every
declared key, with a compatible written signature where one was
declared?** It is orthogonal to the structural Jaccard (which compares
regen vs *original source*, not regen vs *declaration*) and to the
behaviour axis (runtime equivalence). A node can be structurally
divergent yet contract-satisfying (renamed internals, stable surface)
and vice versa.

## 2. State mapping (onto the existing `ContractState`)

| State | Meaning |
|---|---|
| `pass` | Every declared key is exported by the regen, and every *comparable* declared signature string-equals the regen's written signature. |
| `fail` | At least one declared key is missing from the regen's exports, or at least one comparable signature differs (drift). |
| `unknown` | The checker ran but cannot evaluate: the node declares **no** contract (`provides` empty — POSITIONING's `contract-missing`), the regen language is not extractable (non-TS/JS), or the regen failed to parse. |
| `not-measured` | The checker did not run for this node: `--contract-check` absent, or the verdict is `unrecoverable` (no regen artifact exists — same guard as the behaviour axis). |

`verdictDerivedTags` already maps `fail`/`unknown` → the
`contract-missing` frontier tag, and `honestyForCell` already folds
`pass → 1`, `fail → 0`, otherwise null. No matrix vocabulary changes.

## 3. Comparison rules

1. **Key presence** — a declared key `k` is satisfied iff the regen has
   a non-default export named `k` (value or type; the declaration does
   not distinguish manifestation).
2. **Signature comparison happens only when COMPARABLE**:
   - declared signature undefined → presence-only (no drift possible);
   - declared signature is **resolved-tier** (`resolved:` prefix) →
     incomparable with the syntactic measurement (`typescript-resolved.ts`
     pins that the two tiers must never be string-compared) → presence-only,
     counted in `incomparableKeys`;
   - regen export carries **no** written signature (unannotated) →
     incomparable → presence-only, counted in `incomparableKeys`;
   - both syntactic and defined → string equality; inequality = drift.
   The conservative direction here is the REVERSE of gluing: for
   identification, unknown ⇒ conflict; for a *violation verdict*,
   unknown ⇒ do-not-accuse. An incomparable signature must never
   produce a `fail`.
3. **Over-delivery is not a violation** — regen exports beyond the
   declaration are the structural axis's business (over-emission /
   vocab-gap), not a contract failure.

## 4. Surface

- Pure checker: `src/runtime/legend/contract-checker.ts` —
  `checkContract({nodeId, declared, regenText, regenFileName})` →
  `{state, reason, missingKeys, driftedKeys, incomparableKeys, checkedKeys}`.
- CLI: `onto verify-homeomorphism --matrix --contract-check` (requires
  `--matrix`, same rule as `--behavior-check`). Injects a
  `contractOverride` into the cell builder; per-node results ride on
  the JSON report as `contractResults`.
- The unrecoverable guard lives in `verdictToMatrixCell`, mirroring
  `behaviorOverride`.

## 5. Scenarios (pinned by `tests/contract-checker.test.ts`)

| # | Setup | Expected |
|---|---|---|
| a | No regen text (unrecoverable upstream) | `not-measured` |
| b | Declared `provides` empty | `unknown` (`no_declared_contract`) |
| c | All keys exported, signatures string-equal | `pass` |
| d | One declared key absent from regen exports | `fail`, key in `missingKeys` |
| e | Key present, comparable signature differs | `fail`, entry in `driftedKeys` |
| f | Declared signature is resolved-tier | presence-only; `pass` with key in `incomparableKeys` |
| g | Regen export unannotated, declaration has signature | presence-only; `pass` with key in `incomparableKeys` |
| h | Regen is not parseable as TS/JS | `unknown` (`parse_failed` / `unparseable_language`) |
| i | Regen over-delivers (extra exports) | still `pass` (rule 3) |

## 6. Honest limits of v0

- The signature comparison is **syntactic string equality** — the same
  false-non-match boundary as O1 gluing (equal capability written
  differently does not match). A `fail` by drift is therefore an
  *upper bound* on violations; read alongside `incomparableKeys`.
- Python regens are `unknown` in v0 (extractor is TS/JS); the state
  vocabulary already accommodates a future Python tier.
- The declaration itself is G's output: a wrong declaration produces a
  faithful-but-meaningless check. That circularity is the same one
  §3.1 resolved for grounding — the control is the behaviour axis,
  which is immune to it.
