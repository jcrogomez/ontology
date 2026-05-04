# Node Create

## Purpose
The `node create` operation is responsible for generating a new semantic entity in the network according to the specified abstraction level and kind. It structurally anchors the given user prompt into the intention plane of the node, initializing temporal and metadata fields, generating an integrity hash, and logging a `node_created` event to strictly maintain the temporal sequence.

## Files Mutated
- `.ontology/nodes/node_<id>.json`: A new node file is strictly created under the `nodes/` directory.
- `.ontology/events.jsonl`: A `node_created` event is appended to the event log to record the mutation.
- `.ontology/state.json`: The global state is updated to reflect increments in `nodeCount` and `eventCount`, and updating `lastEventId`.

## Files Not Mutated
- Existing nodes (including the mathematical canon node `node_0000_canon.json`) are completely unaffected.
- Model registries (`.ontology/models/registry.json`) and processor registries (`.ontology/processors/registry.json`) are untouched.
- The `.ontology/edges.jsonl` file is preserved without modifications since node creation in Bootstrap 0.2 strictly assigns a minimal hierarchy using the state's `rootNodeId`.

## Preserved Invariants
- **Temporal Chain**: The generated event rigorously sets `previousEventId` to the state's `lastEventId` prior to mutation, securing the sequential event chain.
- **Node Hash Integrity**: The node's content is deterministically hashed. The resulting hash is placed into `integrity.hash` exactly matching the mathematically computed hash.
- **State Monotonicity**: Global counters (`nodeCount`, `eventCount`) only monotonically increase, keeping topology constraints unbroken.

## Rejected Inputs
- The creation fails loud and halts topology modifications if the provided `--level` or `--kind` options violate strict schema validations (e.g., passing `invalid_level` or `invalid_kind`).

## Validation Strategy
- Real-time schema validation applies via Zod's `OntologyNodeSchema` for nodes and `OntologyEventSchema` for events.
- An invocation of `npm run dev -- validate` guarantees that the generated hash and the physical event chain topology are mathematically sound and cryptographically correct post-creation.

## Manual Smoke Test
```bash
npm run dev -- init
npm run dev -- node create --level domain --kind entity --prompt "Harvest has seededQuantity, harvestedQuantity and status."
npm run dev -- validate
```

## Future Extension Points
- Embedding true PromptAST capabilities directly in the payload rather than string buffers.
- Actual model interaction and execution mappings attached directly to generated nodes.
- Generating physical semantic edges (`edges.jsonl`) between node entities rather than isolated tree roots.
