# The gluing site is Grothendieck — and "equal signatures" is the matching condition, not a sub-coverage

*Result note, 2026-07-21. Develops MATHEMATICAL_CLAIMS §Axiom 5 (gap 3 of the
"negatives → theorems" plan). All 7 subtle predictions verified against
`glueFragments`/`restrictSection` before writing (probe log in the session).
This CORRECTS the current ledger framing "sheaf on the equal-signature
subcategory": there is no sub-coverage — F is a sheaf on the FULL standard site,
and signature-agreement is the sheaf's compatibility (equalizer) condition.*

## The site 𝒞

Let `K` be the set of capability keys. Objects: finite subsets `U ⊆ K` (a
"region" — the keys in scope). Morphisms: inclusions `U' ⊆ U`. So 𝒞 is the poset
`(P_fin(K), ⊆)` as a category; the pullback of `U_i → U` along `V → U` is
`U_i ∩ V`.

**Coverage `K_std`:** a family `{U_i ⊆ U}` covers `U` iff `⋃ᵢ Uᵢ = U` (joint
surjection). This is exactly `glueFragments`' notion — the region covered by a
family of fragments is the union of their `provides`.

### Lemma 1 — `K_std` is a Grothendieck pretopology.

- **(Identity)** `{U ⊆ U}` covers `U`: `⋃ = U`. ✓
- **(Stability / base change)** If `{Uᵢ}` covers `U` and `V ⊆ U`, then
  `{Uᵢ ∩ V}` covers `V`: `⋃ᵢ(Uᵢ ∩ V) = (⋃ᵢ Uᵢ) ∩ V = U ∩ V = V`. ✓
- **(Transitivity)** If `{Uᵢ}` covers `U` and each `{U_{ij}}` covers `Uᵢ`, then
  `{U_{ij}}` covers `U`: `⋃_{ij} U_{ij} = ⋃ᵢ Uᵢ = U`. ✓

Three set-identities. `(𝒞, K_std)` is a genuine Grothendieck site.

## The presheaf F

`F(U) =` partial maps `σ : U ⇀ Sig` (a defined-signature provider assignment:
each provided key of the region carries a signature). Restriction along
`U' ⊆ U` is domain-intersection `σ ↦ σ|_{U' ∩ dom σ}`. Functorial ⇒ F is a
presheaf. (It is the sheaf of partial sections of the discrete bundle
`K × Sig → K`.)

### Theorem — F is a sheaf on `(𝒞, K_std)`, for ARBITRARY covers.

Let `{Uᵢ}` cover `U` and `{σᵢ ∈ F(Uᵢ)}` be a **matching family**:
`σᵢ|_{Uᵢ∩Uⱼ} = σⱼ|_{Uᵢ∩Uⱼ}` for all `i,j`. Then there is a unique
`σ ∈ F(U)` with `σ|_{Uᵢ} = σᵢ`.

*Proof.* Define `σ(k) = σᵢ(k)` for any `i` with `k ∈ dom σᵢ`. **Well-defined**
by the matching condition (any two providers of `k` agree). **Total** on the
relevant domain: every `k ∈ ⋃ dom σᵢ` is covered. **Restricts back**:
`σ|_{Uᵢ} = σᵢ` by construction. **Unique**: F is separated (a section is its
graph), so any `σ'` with the same restrictions equals `σ`. ∎

No exhaustion, no `n = 2` special-casing — the amalgamation is defined per key
across ALL pieces that carry it (this is precisely what `glueFragments` computes:
it checks `allEqual` over *every* provider of the key, so the n-ary matching
condition is native — see probe P-b/P-d). This subsumes the old Part-3 sweep
(2 pieces, 3 keys) as the finite shadow of a general theorem.

## The correction: "equal signatures" is the equalizer, not a sub-coverage

The matching condition `σᵢ|_{overlap} = σⱼ|_{overlap}` **is** "the overlap keys
are provided with equal signatures." That is the compatibility (equalizer)
premise of the sheaf axiom — it quantifies the axiom, it does not restrict the
site. A **drifted overlap** (`B: string` vs `B: number`) is a **non-matching
family**; the sheaf axiom asserts nothing about it, and `glueFragments` correctly
reports it as a `duplicate_provider` obstruction (probe: BOUNDARY, P-d).

So the honest statement is **not** "sheaf on the equal-signature *subcategory*"
(there is no such sub-coverage of 𝒞 — a cover `{Uᵢ}` carries no signatures until
a section is placed on it; signatures live on the *matching family*, not the
cover). The precise statement is:

> **F is a sheaf on the full standard site `(𝒞, K_std)`. Signature-agreement on
> overlaps is the sheaf's matching (equalizer) condition.**

## Both regimes are sheaves — of two value-presheaves over ONE site

The default (`onDuplicateProvider: "conflict"`) and the opt-in
(`identify-if-equal`) are not "separated presheaf vs sheaf on a sub-site". They
are the sheaves of two different **value-presheaves** over the same Grothendieck
site, differing only in whether a section remembers its *provenance*:

- **Dynamic / agentic regime** = `identify-if-equal` = the sheaf **F_Sig** above
  (values in `Sig`, provenance forgotten). Two nodes co-providing a key with
  equal signature are the SAME section on the overlap ⇒ they amalgamate. This is
  the sheaf gluing. Conservative refinement: an *undefined* signature is treated
  as non-matching (probe P-a: both-unknown ⇒ conflict; P-c: defined-vs-undefined
  ⇒ conflict) — so F_Sig is the sheaf of **defined-signature** sections, and
  unknowns are obstructions (safe: unknown ⇒ conflict, never a false glue).
- **Static / SSoT regime** = default = the sheaf **F_Node** of *provenance-tagged*
  sections (values in `NodeId`, or `NodeId × Sig`). Two DISTINCT `nodeId`s
  providing a key are DIFFERENT on the overlap ⇒ non-matching ⇒ no amalgamation
  ⇒ conflict (probe P-e). This is single-source-of-truth by construction.

The forgetful map `F_Node → F_Sig` (drop `nodeId`) is where identification
happens. **Relative to the capability presheaf F_Sig**, the default computes
F_Node's gluing, which over-rejects — this is the exact, correct content of the
old "separated presheaf, not a sheaf" negative result: the default is not F_Sig's
sheaf gluing, it is F_Node's. Both are sheaves; they answer different questions.

**Design corollary (the practitioner's theorem).** Choosing SSoT vs multi-agent
co-production of context is choosing whether context sections carry provenance.
The dynamic regime is sound (amalgamates) exactly when the co-providers are
signature-coherent; the boundary — where it silently would diverge — is
signature drift, and the sheaf's matching condition detects it.

## What this changes

- **Answers gap 3:** the site IS Grothendieck (Lemma 1), and the sheaf theorem
  holds for arbitrary covers (subsumes gap 1 — no exhaustion needed).
- **Corrects the ledger:** §Axiom 5 should say "sheaf on the full standard site;
  equal-signature-on-overlaps is the matching condition" — NOT "sheaf on the
  equal-signature subcategory." The T1 status is *unchanged and better founded*.
- **Reframes gap 4 (admissibility):** requires/forbids/branch are a separate
  admissibility predicate cutting out a subpresheaf; they are not part of the
  gluing/site structure. (Left for the gap-4 write-up.)

## Pinned (2026-07-21)

`tests/context-gluing-property.test.ts` (fast-check) now pins the development:
- **Lemma 1 — stability under pullback** (`{Ui} covers U, V ⊆ U ⟹ {Ui∩V} covers
  V`) as a set identity over random finite covers. Identity/transitivity are
  immediate unions.
- **General amalgamation** — a signature-coherent family of arbitrary size (≤5
  pieces, 8-key universe) amalgamates to the union, and the glue **restricts back
  to each piece** (existence + restriction, arbitrary `n` — no reliance on the
  2-piece sweep or a prose reduction).
- **Uniqueness** — glue → restrict to each piece → re-glue recovers the section
  (a section is determined by its restrictions).
- **Two value-presheaves** — a shared key with equal signatures: the default
  (F_Node) conflicts (provenance/SSoT) while `identify-if-equal` (F_Sig) glues —
  the two policies differ exactly on provenance.

The fixed 3-key/2-piece sweep in `presheaf-sheaf-laws.test.ts` Part 3 remains as
the exhaustive finite shadow; its comments now point here for the general case.
`MATHEMATICAL_CLAIMS.md` §Axiom 5 carries the framing correction (dated
2026-07-21); the T1 status is unchanged and better-founded.
