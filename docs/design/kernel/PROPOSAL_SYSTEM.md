# RFC: Proposal System

**Status:** Bootstrap 0.5 complete + PR #96 (edge proposals). Schema (with both `node_create` and `edge_create` mutation variants), storage, full lifecycle (`propose node`, `propose link`, `list/show/reject`, `apply` with endpoint-hash re-validation and stale detection), four lifecycle events (`proposal_created`, `proposal_rejected`, `proposal_applied`, `proposal_staled`), and run-driven node proposals via `run prompt --as-proposal` / `run context --as-proposal`.
**Bootstrap target:** 0.5
**Depends on:** `docs/RUN_PERSISTENCE.md`
**Date:** 2026-05-05

## 1. Motivation

`run prompt` and `run context` produce text. Without a proposal system,
that text is opaque, ungoverned, and never crosses the boundary into
`.ontology` because of the invariant **"models may speak; only explicit
graph commands may mutate the network"**.

The proposal system is the interface between the two halves. A proposal
is a *typed, hashed, time-stamped candidate mutation with full
provenance back to the model run that generated it.* It separates three
operations that without proposals would be conflated:

> Note: earlier drafts framed this as *prompts as rewrite rules* per
> axiom 4 of the canon. That framing is generous — a rewrite rule has
> form `LHS → RHS` with pattern matching; a proposal carries a typed
> candidate mutation, not a rewrite pattern. See
> [`MATHEMATICAL_CLAIMS.md`](../../MATHEMATICAL_CLAIMS.md) §4.2 for the
> classification (T2 — operationally a typed-mutation pipeline with
> provenance; not a rewrite system).

1. **Generation** — what the model produced.
2. **Validation** — whether the candidate respects the local presheaf and the global poset.
3. **Mutation** — committing the candidate to the append-only event log.

Without proposals, every model run either does nothing (current state) or becomes a hand-translated mutation by the user. The proposal system makes that translation a first-class, auditable artifact.

### Direct mutation vs proposal — when to use which (post-0.9)

After the plasticity layer landed, the user has **two** paths to mutate the network. They are deliberately different:

| Path | Surface | When to use |
|---|---|---|
| **Direct** | `onto node update / remove`, `onto edge update / remove` | Single-actor iterative refinement. The user *is* the author; they want their edits to be a flat sequence of `node_updated` / `edge_updated` events, not a proposal chain. Fast feedback loop. |
| **Proposal** | `onto propose node / link`, `onto proposal apply / reject` | Multi-actor or model-mediated authorship. The candidate originates from a model run, an external collaborator, or any flow where the author of the change and the approver are not the same person. The two-step `propose → apply` preserves that distinction in the audit log. |

Both paths land in the same kernel — every event passes through hash verification, the validator gate, and the temporal log. The choice is **about the authorship model the user wants the audit chain to record**, not about whether the change is safe. Proposals are not "more careful direct edits"; they are typed candidates with provenance to a generator (a model run, another user, an ingest step). When the generator and the approver are the same person, a proposal is just ceremony.

## 2. Schema

Proposals live in `.ontology/proposals/proposal_<id>.json`.

```json
{
  "id": "proposal_0001",
  "createdAt": 1714867200,
  "status": "pending",
  "source": {
    "runId": "run_a3f2b1...",
    "contextHash": "ctx_8c4e7d...",
    "provider": "ollama",
    "model": "llama3.1:8b",
    "promptHash": "prompt_91b2c6..."
  },
  "mutation": {
    "kind": "node_create",
    "payload": {
      "level": "domain",
      "kind": "entity",
      "prompt": "...",
      "label": "harvest_record"
    },
    "parentHash": "node_0001:hash:e2f1a8..."
  },
  "validation": {
    "ok": true,
    "score": 0.9,
    "warnings": [],
    "violations": []
  },
  "provenance": {
    "derivedFrom": ["node_0001"],
    "rationale": "User asked for harvest entity with stock relation."
  },
  "hash": "proposal:hash:..."
}
```

Field semantics:

- `id` — sequential, kernel-assigned.
- `status` — one of `pending`, `applied`, `rejected`, `staled`.
- `source` — full provenance to the model run that generated this proposal. Each sub-hash is content-addressed.
- `mutation.kind` — discriminated union: `node_create`, `edge_create`, `node_supersede`, `edge_supersede`, etc.
- `mutation.payload` — typed payload matching `mutation.kind`'s schema.
- `mutation.parentHash` — hash of the dependency that this mutation extends. **If the dependency mutates between proposal creation and apply, the proposal is staled.**
- `validation` — output of `validateIntent` at proposal creation time. Read-only reference; re-validation happens at apply time.
- `provenance.derivedFrom` — node IDs that contributed to the assembled context.
- `hash` — cryptographic hash over the proposal body for integrity.

## 3. Lifecycle

```
                model run
                    │
                    ▼
                 pending  ────────────┐
                    │                 │
            ┌───────┴───────┐         │
            │               │         │
        apply            reject       │
            │               │         │
            ▼               ▼         ▼
         applied        rejected    staled
        (mutates)        (audit)   (graph moved on)
```

Transitions:

- `pending → applied`: kernel re-validates `parentHash`, re-runs `validateIntent` against the current graph state, then translates `mutation` into the corresponding graph command (`node_create`, `edge_create`, etc.). Atomic.
- `pending → rejected`: explicit user rejection. Logged as event. Body retained for audit.
- `pending → staled`: detected automatically on any graph mutation that invalidates `parentHash`. Cannot be applied.
- `applied → *`, `rejected → *`, `staled → *`: terminal.

## 4. Events

Each transition produces an append-only event in `events.jsonl`:

- `proposal_created` — payload includes proposal id and full body hash.
- `proposal_applied` — payload includes proposal id and the resulting mutation event id.
- `proposal_rejected` — payload includes proposal id and optional reason.
- `proposal_staled` — payload includes proposal id and the mutation event that invalidated `parentHash`.

The mutation triggered by `proposal_applied` produces its own event (`node_created`, `edge_created`, etc.) with a back-reference to the proposal id in the event metadata. The graph thus contains both the proposal trace and the final mutation, allowing time-travel queries to reconstruct *why* a node exists.

## 5. CLI surface

```
onto propose node    --from <nodeId> --task <task> --provider <provider>
onto propose link    --from <nodeId> --to <nodeId> --type <edgeType> --rationale <text>
onto proposal list   [--status <status>] [--json]
onto proposal show   <proposalId> [--json]
onto proposal apply  <proposalId>
onto proposal reject <proposalId> [--reason <text>]
```

`onto propose` commands are **non-mutating**. They produce a proposal file and emit `proposal_created`, but never touch nodes/edges/state. The graph proper mutates only on `proposal apply`.

## 6. Concurrency

`parentHash` is the locking primitive. When the kernel attempts `apply`:

1. Load the current hash of every node referenced in `mutation.parentHash`.
2. If any disagrees with the recorded hash, transition the proposal to `staled` and emit `proposal_staled`. Return non-zero.
3. Otherwise re-run `validateIntent`. If it now fails, the proposal stays `pending` (the user can fix the dependency and retry) and the apply returns non-zero with the violations.
4. Otherwise translate to the appropriate graph command and apply atomically.

There are no locks, no retries, no transactions. Append-only events plus content-addressed hashes give optimistic concurrency for free.

## 7. Run persistence (prerequisite)

Proposals reference `runId`, `contextHash`, `promptHash`. These are populated from a **run persistence** layer specified in `docs/RUN_PERSISTENCE.md` (RFC). Run persistence is opt-in via `--persist` and stores `.ontology/runs/run_<id>.json` records with content-addressed hashes.

A proposal created from a non-persisted run carries the hashes inline but cannot be fully audited via `onto runs verify`. The current RFC allows that combination with a warning; a future revision may forbid it.

## 8. Out of scope

- Multi-step proposal **chains** (a proposal that itself spawns further proposals at apply time). Each proposal is a single atomic mutation. Note: this does not preclude *external* orchestration of N atomic proposals as a transactional unit — see [`WAKEUP_SCANNERS.md`](../runtime/WAKEUP_SCANNERS.md) §2.3 for the bundle design that groups atomic proposals all-or-nothing via dry-run pre-flight under the existing advisory lock, without touching the per-proposal contract.
- Proposal merging. Not now.
- Proposal templating. Not now.
- Auto-apply policies ("apply if validation passes"). Explicitly forbidden — violates "models may speak; only explicit graph commands may mutate". Apply is always an explicit user action.

## 9. Open questions

1. Should `proposal apply` allow `--dry-run`?
2. Should proposals carry an expiry time (auto-stale after N days)?
3. Should there be a `supersede` relationship between proposals (proposal_0007 replaces proposal_0003)?
4. Should `proposal show` render the candidate inline as a Walker cell (depends on Walker Interface RFC)?

These are deferred to implementation time.
