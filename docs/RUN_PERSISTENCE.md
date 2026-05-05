# RFC: Run Persistence

**Status:** Draft (RFC, not yet implemented)
**Bootstrap target:** 0.5 (alongside Proposal System)
**Required by:** Proposal System (RFC), Walker `:run` mode (RFC)
**Date:** 2026-05-05

## 1. Motivation

Today, `run prompt` and `run context` produce text that vanishes after the command exits. To support:

- **Proposals** that reference the model run that generated them (`source.runId`).
- **Audits** that reconstruct what context the model saw at decision time.
- **Deterministic CI replays** that detect drift when an unchanged graph produces a changed run.

…runs must be persisted as content-addressed records.

Without run persistence the proposal system has no provenance, the walker `:run` mode has nothing to attach a candidate to, and the temporal log has no record of when external models were consulted.

## 2. Schema

Persisted runs live in `.ontology/runs/run_<id>.json`.

```json
{
  "id": "run_a3f2b1c8",
  "createdAt": 1714867200,
  "kind": "context",
  "input": {
    "promptHash": "prompt:hash:91b2c6...",
    "contextHash": "ctx:hash:8c4e7d...",
    "targetNodeId": "node_0042",
    "branch": "main",
    "time": 17,
    "task": "semantic_parse",
    "includeEdges": true,
    "edgeTypes": ["depends_on", "validates_against"]
  },
  "model": {
    "provider": "ollama",
    "model": "llama3.1:8b",
    "host": null
  },
  "output": {
    "text": "...",
    "parsed": null
  },
  "validation": {
    "ok": true,
    "score": 0.9,
    "violations": [],
    "warnings": []
  },
  "duration_ms": 4321,
  "hash": "run:hash:..."
}
```

Field semantics:

- `id` — kernel-assigned. Derived deterministically from the hash of `(input, model)`. Two structurally identical runs produce the same id.
- `kind` — discriminates `run prompt` (no context) from `run context` (has assembled context).
- `input.promptHash` — content hash of the normalized prompt text. Always present.
- `input.contextHash` — content hash of the assembled context. Present only when `kind: "context"`.
- `input.targetNodeId`, `branch`, `time`, `task`, `includeEdges`, `edgeTypes` — verbatim slice of the run's parameters.
- `model.host` — included only when it diverges from the default; otherwise `null` to avoid leaking deployment specifics.
- `output.parsed` — populated when the adapter parses the model's raw text into structured JSON.
- `validation` — present iff the run was invoked with `--validate`.
- `hash` — content hash over the full body for integrity.

## 3. Identity and content addressing

A run's `id` is derived from the hash of its inputs and model. This is the central design choice:

- Re-running the same prompt against the same graph state and same model **produces the same id**. The kernel detects this and skips re-execution by default; `--force` overrides.
- A proposal that references `runId` can be verified by recomputing the hash from the run record.
- CI replays detect drift: if a run's id changes between commits, something in its inputs changed (the prompt, the assembled context, the model). The graph itself acts as a fingerprint.

The kernel exposes three pure helpers:

- `hashPrompt(text: string): string` — SHA-256 over normalized prompt text.
- `hashContext(output: ContextAssemblyOutput): string` — SHA-256 over canonical JSON of the assembled output.
- `hashRun(input, model): string` — SHA-256 over canonical JSON of `(input, model)`.

All hashes are prefixed (`prompt:hash:`, `ctx:hash:`, `run:hash:`) to make their kind self-describing.

## 4. Storage policy

- `.ontology/runs/` is **opt-in**. By default, `run prompt` and `run context` remain ephemeral.
- Persistence is enabled per-invocation with `--persist`, or globally by setting `runs.persist: true` in `.ontology/state.json`.
- Persisted runs are **append-only**. There is no `run delete`. If the directory grows large, a separate explicit pruning command may be added; pruning never happens implicitly.
- `.ontology/runs/` is **not** gitignored. Runs are part of the auditable record.

## 5. Events

Each persisted run emits a `run_persisted` event in `events.jsonl`:

```json
{
  "kind": "run_persisted",
  "at": 1714867200,
  "payload": {
    "runId": "run_a3f2b1c8",
    "runKind": "context",
    "outputHash": "out:hash:..."
  }
}
```

This makes the temporal log the source of truth for "what runs happened when". The walker can scrub the log to reconstruct a session.

## 6. CLI surface

```
onto run prompt   --persist  ...
onto run context  --persist  ...
onto runs list    [--kind <prompt|context>] [--json]
onto runs show    <runId> [--json]
onto runs verify  <runId>      # recomputes the hash and checks integrity
```

`runs verify` is the audit primitive: it loads the run, recomputes `hash`, recomputes `id` from `(input, model)`, and reports any divergence. It is read-only.

## 7. Interaction with the Proposal System

The Proposal System RFC references `source.runId`, `source.contextHash`, `source.promptHash`. All three are populated directly from a persisted run record. A proposal's apply path can call `runs verify <runId>` to confirm the source has not been tampered with.

If a proposal is created from a run that was never persisted (`--persist` was off), the proposal stores the hashes inline but cannot offer full audit. Future work may forbid this combination; for now it is allowed with a warning.

## 8. Out of scope

- Encryption or redaction of run bodies. `.ontology/runs/` is assumed to be trusted local storage. If a project needs secrecy, it omits `--persist`.
- Cross-machine run replication.
- Run aggregation (combining multiple runs into a single artifact).
- Cost tracking (token counts, billing). Separate concern.
- Streaming runs (the persisted record is the final output, not the streaming chunks).

## 9. Open questions

1. Should the `--persist` default flip from opt-in to opt-out once the system is mature? v0 stays opt-in.
2. Should runs include a back-reference to any proposal they generated? Probably yes, but it requires an update event (`run_proposal_attached`) to keep append-only purity.
3. Should `runs list` support time-range filtering? Easy to add later; not in v0.
4. Should the `outputHash` in the `run_persisted` event be the hash of the raw text or of the canonical-JSON-encoded `output` object? The latter is more robust to formatting changes; the former is simpler. Lean toward canonical JSON.
