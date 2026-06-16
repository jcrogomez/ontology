# DRIFT — `onto drift` agent card

Merkle change-detection over the compiled shadows: every file referenced
by `node.outputs.files` is hashed (sha256 of raw bytes) into a Merkle
tree; the tree is compared against the last persisted anchor, and the
report names exactly which nodes' artifacts moved.

## Module map

| Module | Role |
|---|---|
| `src/kernel/core/integrity/merkle.ts` | Pure tree + diff: `buildMerkleTree`, `diffMerkleTrees`, `hashFileContent`, `normalizeLeafPath`. No filesystem access. Determinism contract: identical leaf sets in ANY input order produce byte-identical trees and the same root hash; duplicate leaf paths and file/dir conflicts are errors. Diff prunes subtrees whose dir fingerprints match (O(1) dismissal of unchanged regions). |
| `src/surfaces/commands/drift.ts` | The CLI command: collects the leaf set from `node.outputs.files`, builds the tree, loads/diffs against the snapshot, optionally re-anchors. A referenced-but-absent file hashes to the sentinel `"missing"` (and is listed under `missing` in the report), so disappear-and-reappear-unchanged round-trips to "unchanged". |
| `src/cli.ts` (~line 173) | Flag registration. |

## State and events

- **Snapshot (anchor):** `.ontology/drift/snapshot.json` —
  `{version: 1, createdAt, branch, rootHash, leaves: [{path, hash, nodeIds}]}`.
- **Event:** `--update` appends a `drift_anchored` event to
  `.ontology/events.jsonl` with `{rootHash, leafCount, previousRootHash,
  changedNodeIds}`. Event-append failure is non-fatal (snapshot already
  written; provenance gap, not corruption).
- Read-only by default: no event, free to run in a loop / CI.

## Flags

- `--update` — persist the current tree as the new anchor + emit
  `drift_anchored`.
- `--fail-on-drift` — exit 1 when anything drifted relative to the
  anchor (CI guard). No effect when combined with `--update` or when no
  anchor exists yet.
- `--json` — structured report `{rootHash, leafCount, anchor, drifted,
  added, removed, changed, missing, changedNodeIds, anchored}`.

## What it does NOT do

- No semantic diff — content-hash granularity only. A whitespace-only
  edit drifts; a behaviour change hidden behind an identical byte
  sequence does not exist.
- No per-node verdicts — it tells you *which* nodes to re-measure, not
  whether the round-trip still holds.

## Tests

- `tests/merkle.test.ts` — unit + fast-check property suite
  (order-independence, root-hash stability, diff correctness).
- `tests/drift-cli.test.ts` — CLI behaviour over a temp project.

## Intended loop

```
onto drift                      # which shadows moved since the anchor?
onto verify-homeomorphism --nodes <changedNodeIds> --matrix
onto drift --update             # re-anchor once the new state is accepted
```
