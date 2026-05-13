# OPEN_PROMPT — Phase ζ protocol specification

**Status:** spec-only. No implementation ships in 0.4.0.
**Target release:** 0.5.0 line, after Phase ε produces the empirical
data the spec presumes.
**Companion read:** [`PROJECT_LEGEND.md`](PROJECT_LEGEND.md) §4.

> *The code is, often, an industrial secret. The intent — what the
> code is supposed to do, what invariants it must preserve — can be
> open even when the implementation cannot. Open-Prompt is the
> protocol layer that lets an organisation publish its intent and
> let third parties verify the code respects that intent, without
> exposing the source.*

---

## 1. The problem

Two existing trust postures bracket the space:

- **Fully open source.** The implementation is public. Anyone can
  read the code, run it, verify its behaviour. Strong guarantee.
  Incompatible with proprietary algorithms, trade secrets, or
  regulatory restrictions (HIPAA-protected models, export-controlled
  cryptography, etc.).
- **Self-attestation.** The organisation publishes a statement of
  what their system does ("we don't sell your data", "our matching
  algorithm is content-neutral"). The reader must trust the
  publisher. No verification surface.

There is a third posture this project's audit machinery now makes
operational: publish the **intent network** and the **audit chain**,
keep the source private. A third party verifies that the running
system honours the published intent without ever seeing the
implementation.

That posture is what Open-Prompt formalises.

---

## 2. The protocol — informally

An organisation `O` publishes three artefacts:

1. **`N_O`** — the intent network. A frozen snapshot of every node
   (id, prompt, contract, rules, integrity hash) and every edge (id,
   type, endpoints, hash). The same shape persists today under
   `.ontology/nodes/` and `.ontology/edges.jsonl`.
2. **`events_O`** — the temporal audit log. The append-only
   `events.jsonl`, signed-prepended (each event carries
   `previousEventId` and the chain head's hash). Compactable to a
   Merkle DAG without losing the verification property; the v0 spec
   keeps it as raw JSONL for legibility.
3. **`σ_O`** — the signature. A cryptographic signature over the
   pair `(N_O, events_O)`'s Merkle root, produced with the
   organisation's private key.

A verifier (regulator, auditor, sceptical user) can then:

1. Re-walk the events chain locally and recompute the integrity
   hash of each node + edge.
2. Verify `σ_O` against `O`'s published public key.
3. Optionally, **replay** a sample of the organisation's actual
   output stream through the validator built into Ontology
   (`validateIntent` against `N_O`). Any output that violates the
   contract is detectable.

The verifier never reads the source. The verifier reads the **intent**
the organisation has bound itself to, and confirms the running system
hasn't drifted from it.

---

## 3. The mathematical content

### 3.1 The protocol object

Define a **published Ontology project** as the triple

$$\mathsf{Pub}_O = \bigl(\,\mathsf{N}_O,\,\mathsf{Ev}_O,\,\sigma_O\,\bigr)$$

where

- $\mathsf{N}_O$ is an intent network: nodes, edges, contracts,
  rules. Every record carries its own integrity hash; the network's
  Merkle root is the canonical fingerprint.
- $\mathsf{Ev}_O$ is the event log up to some sequence number $s$.
  Each event carries `previousEventId`; the chain hash is the
  cumulative SHA-256 over the JSONL bytes.
- $\sigma_O = \mathrm{Sign}_{sk_O}\bigl(\,\mathrm{root}(\mathsf{N}_O) \,\Vert\, \mathrm{chain}(\mathsf{Ev}_O)\,\bigr)$
  is the signature.

### 3.2 The three verification questions

For an external party `V` with access to `Pub_O` and `O`'s public key
`pk_O`:

**Q1 — Intent integrity.** Does $\mathsf{N}_O$ certify itself?
Verify every record's integrity hash; recompute the Merkle root;
compare against the published root. Local-only, no network.

**Q2 — Chain integrity.** Does $\mathsf{Ev}_O$ form an unbroken
chain? Walk the events in order, verifying `previousEventId` and the
cumulative chain hash. Local-only.

**Q3 — Authorship.** Is `σ_O` a valid signature on
`root(N_O) || chain(Ev_O)` under `pk_O`? Local-only crypto check.

The three answer **yes/no/ambiguous** independently. A negative
answer on any one is a published-record fault; a positive answer on
all three says: "this is, structurally and cryptographically, the
intent `O` claims to be running."

### 3.3 Run-time verification

The static answers above prove the published artefact is
**well-formed**. They do not yet prove the system is **running what
it claims**. For that, the verifier runs sampled outputs through the
validator:

**Q4 — Output-against-intent.** For an artefact stream
$x_1, x_2, \ldots, x_k$ emitted by `O`'s real system, does each
$x_i$ satisfy $\mathrm{validateIntent}(x_i, \mathsf{N}_O)$ ?

`validateIntent` is the same function the compile pipeline already
uses to gate every artifact (`src/runtime/context/intent-validator.ts`).
Under closed-world semantics it returns a Boolean verdict; under
open-world it returns a three-valued $\Omega \in \{\mathrm{true},
\mathrm{false}, \mathrm{unknown}\}$. The published `N_O` carries the
contracts; the verifier supplies the outputs; the validator runs
locally.

This converts the protocol from "we promise" to "you can check, here
is the gate we promise to honour."

---

## 4. The three commands (Phase ζ)

```
onto sign <branch> [--key <path>] [--out <path>]
onto verify-published <path-to-bundle>
onto replay --against <bundle> --inputs <output-stream>
```

### 4.1 `onto sign <branch>`

Produces a **signed-artefact bundle** for the given branch:

```
my-org-bundle.json
├── version: "open-prompt/v0"
├── branch: "main"
├── sequence: 1234   // events.jsonl head this signs
├── nodes:  [ ... ]  // every node on the branch with its hash
├── edges:  [ ... ]  // every edge on the branch with its hash
├── eventsRoot: "sha256:..."   // chain hash at the head
├── intentRoot: "sha256:..."   // Merkle root over nodes + edges
├── signature: { algo: "ed25519", value: "...", publicKey: "..." }
└── createdAt: "2026-..."
```

Default signing: read the private key from a path (`--key`) or from
the OS keychain. Algorithm defaults to Ed25519. The output is a
single self-contained JSON file the organisation can publish in any
read-only channel (a git release, a static URL, IPFS, S3).

`--key` is required for real cryptographic signing. Without it, the
command emits the Merkle root + chain hash but **no signature**;
this is the "Merkle-only" mode useful for internal audits where the
signing infrastructure isn't worth the complexity.

### 4.2 `onto verify-published <bundle>`

Re-walks the published bundle locally:

1. Recomputes the Merkle root over `bundle.nodes + bundle.edges` and
   compares to `bundle.intentRoot`. Q1 above.
2. Walks the embedded events chain (or fetches it if the bundle
   carries a pointer) and recomputes the chain hash. Compares to
   `bundle.eventsRoot`. Q2 above.
3. Verifies `bundle.signature` against
   `intentRoot || eventsRoot` using `bundle.signature.publicKey`.
   Q3 above.

Returns a structured verdict (JSON or human) per question, plus
an aggregate `ok: boolean`. **Read-only**. Does not mutate the local
project.

### 4.3 `onto replay --against <bundle> --inputs <stream>`

Runs each line of `<stream>` (the organisation's actual outputs)
through `validateIntent` against the bundle's `N_O`. Reports per-line
verdict + aggregate violation rate. Q4 above.

Under closed-world (default), an unsatisfied requirement is a
violation. Under `--open-world`, it degrades to a warning so the
sample can complete without dropping every line. The verdict matrix:

| Verdict | Meaning |
|---|---|
| `valid` | The output satisfies the contract under N_O. |
| `forbid_violated` | The output violates a `forbids` clause. |
| `requires_missing` | A `requires` token is not provided by any node N_O contributes. |
| `unknown` | Open-world: the contract references external deps; the verdict can't be decided from N_O alone. |

The replay tool emits a JSON report identical in shape to
verify-homeomorphism's per-node block, so audit pipelines built for
internal use carry over.

---

## 5. What the protocol does NOT guarantee

- **It does not prove the source matches the intent.** Phase ε
  measures the round-trip's faithfulness; Open-Prompt doesn't
  re-prove that. The verifier trusts that `F ∘ G ≈ id` on `O`'s
  codebase by reading the calibration reports `O` publishes. If `O`
  has not published Phase ε numbers for its own corpus, the protocol
  is honest: it proves the system runs against the intent it
  claims, **not** that the intent is the right one.
- **It does not prove the system has not been replaced wholesale.**
  An adversary in control of `O`'s infrastructure can publish a
  signed `N_O` while running a completely different binary. The
  protocol gives the verifier a baseline; tamper-resistance of the
  hosting environment is out of scope.
- **It does not encrypt the intent.** `N_O` is published in clear.
  Organisations whose intent itself is a trade secret should not use
  this protocol — or should publish a redacted `N_O` where the
  load-bearing structure is preserved but specific labels / prompts
  are abstracted. Redaction-preserving Merkle proofs are a
  follow-up.
- **It does not handle key rotation.** v0 assumes a single org key
  per bundle. Multi-key threshold signing, rotation, revocation —
  all out of scope, all noted in `v1` follow-up.

---

## 6. The spec's relationship to existing surfaces

| Existing | Phase ζ |
|---|---|
| `events.jsonl` chain hash | Same data, exposed via `onto sign` as the `eventsRoot`. |
| Node + edge `integrity.hash` | Same. `onto sign` computes the Merkle root over them; `verify-published` re-walks. |
| `validateIntent` (intent-validator.ts) | Same. `replay` is a one-line wrapper. |
| `onto runs verify` | Same provenance chain. `verify-published` walks the same audit primitive externally. |
| `onto verify-homeomorphism` | Sibling tool. Verify-published asks "does the running code respect the published intent?"; verify-homeomorphism asks "does the published intent compress the code faithfully?" Both rely on the same `N_O`. |

The protocol does not introduce new audit primitives. It exposes
the ones already in the kernel through a single signed bundle plus
a verifier toolchain. Most of the work is composition.

---

## 7. The minimum viable implementation

For 0.5.0 the work is bounded:

| # | Component | LoC est. | Notes |
|---|---|---:|---|
| 1 | `src/runtime/openprompt/sign.ts` — `signBranch(opts): SignedArtefact` | ~120 | Merkle helpers, JSONL stream hashing, Ed25519 binding. |
| 2 | `src/runtime/openprompt/verify.ts` — `verifyBundle(bundle, pubKey?)` | ~100 | Reads the bundle, recomputes hashes, verifies signature if present. |
| 3 | `src/runtime/openprompt/replay.ts` — `replayAgainst(bundle, stream)` | ~120 | Wraps validateIntent over a Node.js Readable stream. |
| 4 | CLI: `onto sign`, `onto verify-published`, `onto replay` | ~80 | Commander entries + JSON / human output. |
| 5 | Tests: Merkle determinism, signature round-trip, replay against fixture | ~200 | Mock crypto for the unit tests; one integration test with real Ed25519. |
| 6 | Docs: a worked example bundle + spec excerpts (this file × 2) | — | Polish-only after the code lands. |

**Total:** ~520 LoC src + ~200 LoC test. ~6–8 h. No LLM cost. Tag
0.5.0 lands shortly after.

---

## 8. Open questions for v1

These are flagged so a future reader doesn't think the spec ducked
them:

- **Redaction-preserving bundles.** If an organisation wants to
  publish the *structure* of `N_O` but redact specific prompt bodies
  (because the prompts themselves leak the algorithm), the bundle
  needs a Merkle commitment that lets the redaction be revealed
  selectively to authorised verifiers. Mechanism: branched Merkle
  trees with revealable subtrees. Out of scope for v0.
- **Verifier-trusted-prefix mode.** A naïve `verify-published` walks
  the entire `events.jsonl`. For large `O`s this is impractical. v1
  needs a "verify head + chain-of-trust to a checkpoint" path so the
  verifier doesn't re-walk gigabytes. Mechanism: SNARK-friendly
  checkpoint hashes, or simpler, a published `summary.json` for
  each branch that the verifier accepts as the new chain origin.
- **Cross-org composition.** Two organisations publishing
  interlocking intent networks — `N_A` provides tokens `N_B`
  requires — need a join-protocol. v1 could just say "verify each
  separately, then validate the cross-org edges by hash inclusion."
- **Adversarial-replay.** An adversary may publish a valid bundle
  but run a different binary. Detection requires runtime
  attestation (TEE, signed transcripts). Out of scope for v0; the
  protocol stands as a baseline trust posture, not a tamper-proof
  one.

---

## 9. How this connects to the paper

The Open-Prompt protocol is the **fourth pillar** the paper claims
distinguishes Ontology from prior LLM-tooling work (alongside
typed-intent graph, audit chain, and inverse functor). Each of the
other three has shipped code: ζ stays spec-only until 0.5.0. The
honest paper says:

> *Phase ε measures the inverse functor. Phase ζ exposes its product
> as a signed artefact. Together they convert intent from a private
> design document into a public verification surface — the third
> trust posture between fully-open-source and self-attestation.*

When 0.5.0 ships, this document becomes the spec the
implementation cites; the implementation becomes the proof the
spec is operational.

---

*Authored 2026-05-13 as the Phase ζ design seed. Revisions land
when the v0 implementation surfaces concrete deviations.*
